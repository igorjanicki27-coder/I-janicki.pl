import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import type {
  AlertEvent,
  AppUser,
  ApprovalStatus,
  CompanyChatMessage,
  CompanyChatParticipant,
  CompanyChatParticipantState,
  CompanyChatState,
  ConsentRecord,
  DeviceIdentity,
  DeviceRecord,
  DwServiceAgentState,
  InventoryReport,
  MetricThreshold,
  MetricThresholds,
  RemoteMasterSettings,
  RemoteActionRequest,
  RegistrationDetails,
  ReadinessCheckResult,
  TerminalCommand,
  TelemetryMode,
  DeviceTelemetry,
  UsageDailyRollup,
  UsageRollupDelta,
  ThemeMode
} from '@shared/contracts'
import {
  DEFAULT_ALERT_CPU_TEMP,
  CURRENT_CONSENT_POLICY_VERSION,
  DEFAULT_MASTER_EMAIL,
  DEFAULT_TELEMETRY_INTERVAL_MIN
} from '@shared/constants'
import { buildDeviceId } from '@shared/device-id'
import { isMetricThresholdValid, type MetricThresholdKey } from '@shared/thresholds'
import { createBackendClient, type BackendClient } from '@/services/backend'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import {
  countUserFacingOfflineOperations,
  enqueueOfflineOperation,
  markOfflineOperationAttempt,
  readOfflineQueue,
  removeOfflineOperation,
  type OfflineOperation
} from '@/services/offline-queue'

interface MasterSettings {
  thresholds: MetricThresholds
  telemetryMode: TelemetryMode
  companyOptions: string[]
  glassIntensity: number
}

interface SlaveSettings {
  autostart: boolean
  silentUpdates: boolean
  muteChatSounds: boolean
  muteTempNotifications: boolean
  muteUsageNotifications: boolean
  muteSystemNotifications: boolean
  hideAlertNotifications: boolean
  muteAllNotifications: boolean
}

const MASTER_SETTINGS_KEY = 'i-janek-master-settings'
const SLAVE_SETTINGS_KEY = 'i-janek-slave-settings'
const TELEMETRY_SAMPLE_KEY = 'i-janek-last-telemetry-sample-v1'
const USAGE_ROLLUP_FLUSH_INTERVAL_MS = 60 * 60 * 1000
const DEFAULT_REMOTE_RESTART_REMINDER_MIN = 30
const FIXED_GLASS_INTENSITY = 70
const DEFAULT_COMPANY_OPTIONS = ['i-JANEK Demo']
const MIN_DEVICE_ALIAS_LENGTH = 3

interface TelemetryAlertCause {
  key:
    | 'cpuUsage'
    | 'gpuUsage'
    | 'ramUsage'
    | 'diskUsage'
    | 'cpuTemp'
    | 'gpuTemp'
  label: string
  value: number
  critical: number
  unit: string
}

function createDefaultThresholds(): MetricThresholds {
  return {
    cpuUsage: { warning: 60, critical: 85 },
    gpuUsage: { warning: 65, critical: 90 },
    ramUsage: { warning: 70, critical: 90 },
    diskUsage: { warning: 75, critical: Number(import.meta.env.VITE_ALERT_DISK_USAGE || 90) },
    cpuTemp: { warning: Number(import.meta.env.VITE_ALERT_CPU_TEMP || DEFAULT_ALERT_CPU_TEMP) - 10, critical: Number(import.meta.env.VITE_ALERT_CPU_TEMP || DEFAULT_ALERT_CPU_TEMP) },
    gpuTemp: { warning: 70, critical: 85 }
  }
}

type PartialMetricThresholds = Partial<Record<MetricThresholdKey, Partial<MetricThreshold>>>

function normalizeThresholds(
  thresholds: PartialMetricThresholds | null | undefined,
  fallback: MetricThresholds = createDefaultThresholds()
): MetricThresholds {
  const defaults = createDefaultThresholds()
  const metrics = Object.keys(defaults) as MetricThresholdKey[]

  return Object.fromEntries(metrics.map((metric) => {
    const fallbackThreshold = isMetricThresholdValid(metric, fallback[metric])
      ? fallback[metric]
      : defaults[metric]
    const candidate = {
      ...fallbackThreshold,
      ...thresholds?.[metric]
    }

    return [metric, isMetricThresholdValid(metric, candidate) ? candidate : fallbackThreshold]
  })) as unknown as MetricThresholds
}

function toRemoteMasterSettings(settings: MasterSettings): RemoteMasterSettings {
  const remote: RemoteMasterSettings = {
    thresholds: settings.thresholds,
    telemetryMode: settings.telemetryMode,
    companyOptions: settings.companyOptions
  }
  return remote
}

function normalizeCompanyOptions(options: string[] | null | undefined) {
  const source = options == null ? DEFAULT_COMPANY_OPTIONS : options
  const cleaned = source.map((entry) => entry.trim()).filter(Boolean)
  return [...new Set(cleaned)]
}

function normalizeSlaveSettings(settings: Partial<SlaveSettings>): SlaveSettings {
  return {
    autostart: settings.autostart ?? true,
    silentUpdates: settings.silentUpdates ?? true,
    muteChatSounds: settings.muteChatSounds ?? false,
    muteTempNotifications: settings.muteTempNotifications ?? true,
    muteUsageNotifications: settings.muteUsageNotifications ?? true,
    muteSystemNotifications: settings.muteSystemNotifications ?? true,
    hideAlertNotifications: settings.hideAlertNotifications ?? false,
    muteAllNotifications: settings.muteAllNotifications ?? false
  }
}

function friendlyAuthError(error: unknown, fallback: string) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code)
    : ''

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Nieprawidłowy adres e-mail lub hasło.'
    case 'auth/invalid-email':
      return 'Adres e-mail ma nieprawidłowy format.'
    case 'auth/email-already-in-use':
      return 'Konto z tym adresem e-mail już istnieje. Zaloguj się albo użyj opcji „Nie pamiętam hasła”.'
    case 'auth/weak-password':
      return 'Hasło jest za krótkie. Użyj co najmniej 6 znaków.'
    case 'auth/too-many-requests':
      return 'Wykonano zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.'
    case 'auth/network-request-failed':
      return 'Nie udało się połączyć z serwerem logowania. Sprawdź internet i spróbuj ponownie.'
    case 'auth/popup-closed-by-user':
      return 'Okno logowania zostało zamknięte przed zakończeniem.'
    case 'auth/operation-not-allowed':
      return 'Ta metoda logowania nie jest obecnie dostępna. Skontaktuj się z administratorem.'
    default:
      return error instanceof Error && !/^Firebase:\s*Error/i.test(error.message) ? error.message : fallback
  }
}

function toDeviceIdentity(baseContext: NonNullable<Awaited<ReturnType<typeof window.janek.system.getContext>>>, deviceId: string): DeviceIdentity {
  return {
    deviceId,
    machineId: baseContext.machineId,
    hostname: baseContext.hostname,
    platform: baseContext.platform,
    arch: baseContext.arch,
    appVersion: baseContext.appVersion
  }
}

function suggestedDeviceAlias(displayName: string, email: string) {
  const ownerName = displayName.trim() || email.split('@')[0]?.trim() || 'użytkownika'
  return `Komputer ${ownerName}`.slice(0, 48).trim()
}

function uniqueDeviceKey(machineId: string, ownerUid: string) {
  return `${machineId.slice(0, 12)}-${ownerUid.slice(0, 12)}`
}

function cloneForIpc<T>(value: T): T {
  const rawValue = toRaw(value)
  if (rawValue === undefined || rawValue === null) return rawValue
  try {
    return structuredClone(rawValue)
  } catch {
    return JSON.parse(JSON.stringify(rawValue)) as T
  }
}

export const useAppStore = defineStore('app', () => {
  const ready = ref(false)
  const theme = ref<ThemeMode>('dark')
  const backend = ref<BackendClient>()
  const systemContext = ref<Awaited<ReturnType<typeof window.janek.system.getContext>> | null>(null)
  const user = ref<AppUser | null>(null)
  const devices = ref<DeviceRecord[]>([])
  const archivedDevices = ref<DeviceRecord[]>([])
  const allAlerts = ref<AlertEvent[]>([])
  const usageHistory = ref<Record<string, UsageDailyRollup[]>>({})
  const inventory = ref<Record<string, InventoryReport>>({})
  const allCompanyChats = ref<Record<string, CompanyChatMessage[]>>({})
  const companyChatStates = ref<Record<string, CompanyChatState>>({})
  const chatMessageSendStates = ref<Record<string, 'sending' | 'sent' | 'failed'>>({})
  const commandHistory = ref<Record<string, TerminalCommand[]>>({})
  const localDwServiceState = ref<DwServiceAgentState>({ status: 'unconfigured' })
  const selectedDeviceId = ref<string>('')
  const selectedConversationOwnerUid = ref<string>('')
  const offline = ref(!navigator.onLine)
  const lastError = ref<string>('')
  const consent = ref<ConsentRecord | null>(null)
  let deregisteringCurrentDevice = false
  const pendingTerminalCommand = ref('')
  const pendingChatMessage = ref('')
  const chatSendError = ref('')
  const pendingRemoteNotification = ref('')
  const pendingDeviceAlias = ref('')
  const pendingCompanyName = ref('')
  const pendingInstallationLocation = ref('')
  const signingIn = ref(false)
  const loadingInventory = ref(false)
  const loadingUsageHistory = ref(false)
  const readinessChecks = ref<ReadinessCheckResult[]>([])
  const readinessRunning = ref(false)
  const offlineQueueCount = ref(countUserFacingOfflineOperations())
  const flushingOfflineQueue = ref(false)
  const masterSettings = ref<MasterSettings>({
    thresholds: createDefaultThresholds(),
    telemetryMode: 'standard',
    companyOptions: [...DEFAULT_COMPANY_OPTIONS],
    glassIntensity: FIXED_GLASS_INTENSITY
  })
  const slaveSettings = ref<SlaveSettings>({
    autostart: true,
    silentUpdates: true,
    muteChatSounds: false,
    muteTempNotifications: true,
    muteUsageNotifications: true,
    muteSystemNotifications: true,
    hideAlertNotifications: false,
    muteAllNotifications: false
  })
  const syncState = ref<'connected' | 'offline'>('connected')
  const lastSyncAt = ref<number | null>(null)
  const statusNow = ref(Date.now())
  const rootCleanup = new Set<() => void>()
  const sessionCleanup = new Set<() => void>()
  const intervalHandles = new Set<number>()
  const handledUpdateRequests = new Set<string>()
  const handledRemoteActionRequests = new Set<string>()
  const companyChatCleanup = new Map<string, () => void>()
  const companyChatStateCleanup = new Map<string, () => void>()
  const commandHistoryCleanup = new Map<string, () => void>()
  const initializedCompanyChats = new Set<string>()
  const initializedCompanyChatStates = new Set<string>()
  const seenAlertIds = new Set<string>()
  let alertsSnapshotReady = false
  let lastSelfApprovalStatus: ApprovalStatus | null = null
  let pendingNewAccountEmail: string | null = null
  let deviceRegistrationInFlight = false
  let archivedDeviceResetInFlight = false
  let connectivityCheckInFlight = false
  let connectivityIntervalHandle: number | null = null
  let lastConnectivityNotificationState: 'online' | 'offline' | null = null
  const handledDwServiceConfigurations = new Set<string>()
  const telemetryAlertSignatures = new Map<string, string>()
  const workerDeviceId = ref('')

  const archivedDeviceIds = computed(() => new Set(archivedDevices.value.map((device) => device.deviceId)))
  const activeOwnerUids = computed(() => new Set(devices.value.map((device) => device.ownerUid)))
  const alerts = computed(() => allAlerts.value.filter((alert) => !archivedDeviceIds.value.has(alert.deviceId)))
  const companyChats = computed<Record<string, CompanyChatMessage[]>>(() => {
    const visible: Record<string, CompanyChatMessage[]> = {}
    for (const [ownerUid, messages] of Object.entries(allCompanyChats.value)) {
      if (user.value?.role === 'master' && !activeOwnerUids.value.has(ownerUid)) continue
      visible[ownerUid] = messages.filter((message) => !message.deviceId || !archivedDeviceIds.value.has(message.deviceId))
    }
    return visible
  })
  const selectedDevice = computed(() => devices.value.find((device) => device.deviceId === selectedDeviceId.value) ?? null)
  const selectedConversationMessages = computed(() => companyChats.value[selectedConversationOwnerUid.value] ?? [])
  const unreadCompanyChatCount = computed(() => {
    const role = user.value?.role
    if (!role) return 0
    return Object.entries(companyChats.value).reduce((total, [ownerUid, messages]) => {
      const lastReadAt = companyChatStates.value[ownerUid]?.[role]?.lastReadAt ?? 0
      return total + messages.filter((message) => message.senderRole !== role && message.createdAt > lastReadAt).length
    }, 0)
  })
  const selfDevice = computed(() => {
    if (!user.value || user.value.role !== 'slave' || !systemContext.value) return null
    return devices.value.find((device) => device.deviceId === systemContext.value?.deviceId) ?? null
  })
  const needsDeviceAlias = computed(() => {
    return false
  })
  const approvalQueue = computed(() => devices.value.filter((device) => device.approvalStatus === 'pending'))
  const criticalAlerts = computed(() => alerts.value.filter((alert) => alert.severity === 'critical'))
  const isMaster = computed(() => user.value?.email?.toLowerCase() === (import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL).toLowerCase())
  const isDesktopAgent = computed(() => systemContext.value?.platform !== 'web')
  const approvalGateStatus = computed<'approved' | 'pending' | 'rejected' | null>(() => {
    if (user.value?.role !== 'slave' || !isDesktopAgent.value) return null
    return selfDevice.value?.approvalStatus ?? null
  })
  const isApprovalBlocked = computed(() => approvalGateStatus.value === 'pending' || approvalGateStatus.value === 'rejected')
  const sessionStatus = computed(() => {
    if (!user.value) return 'signed_out'
    if (offline.value) return 'offline'
    return 'active'
  })

  function applyGlassIntensity(value: number) {
    const alpha = FIXED_GLASS_INTENSITY / 100
    masterSettings.value.glassIntensity = FIXED_GLASS_INTENSITY
    document.documentElement.style.setProperty('--glass-alpha', String(alpha))
  }

  function applyTheme(nextTheme: ThemeMode) {
    theme.value = 'dark'
    document.documentElement.dataset.theme = 'dark'
  }

  function loadPersistedSettings() {
    try {
      const storedMaster = localStorage.getItem(MASTER_SETTINGS_KEY)
      if (storedMaster) {
        const parsed = JSON.parse(storedMaster) as Partial<MasterSettings> & { thresholds?: Partial<MetricThresholds> }
        const { thresholds, companyOptions, ...safeMaster } = parsed
        masterSettings.value = {
          ...masterSettings.value,
          ...safeMaster,
          companyOptions: normalizeCompanyOptions(companyOptions),
          thresholds: normalizeThresholds(thresholds)
        }
      }
      const storedSlave = localStorage.getItem(SLAVE_SETTINGS_KEY)
      if (storedSlave) {
        const parsed = JSON.parse(storedSlave) as Partial<SlaveSettings>
        slaveSettings.value = normalizeSlaveSettings({
          ...slaveSettings.value,
          ...parsed
        })
      }
    } catch {
      // Ignore malformed local settings and keep defaults.
    }
    masterSettings.value.glassIntensity = FIXED_GLASS_INTENSITY
    applyGlassIntensity(FIXED_GLASS_INTENSITY)
  }

  function persistMasterSettings() {
    localStorage.setItem(MASTER_SETTINGS_KEY, JSON.stringify(masterSettings.value))
  }

  function persistSlaveSettings() {
    slaveSettings.value = normalizeSlaveSettings(slaveSettings.value)
    localStorage.setItem(SLAVE_SETTINGS_KEY, JSON.stringify(slaveSettings.value))
  }

  function applyRemoteMasterSettings(remoteSettings: Partial<RemoteMasterSettings> | null) {
    if (!remoteSettings) return

    masterSettings.value = {
      ...masterSettings.value,
      ...remoteSettings,
      companyOptions: normalizeCompanyOptions(remoteSettings.companyOptions ?? masterSettings.value.companyOptions),
      thresholds: normalizeThresholds(remoteSettings.thresholds, masterSettings.value.thresholds)
    }
    masterSettings.value.glassIntensity = FIXED_GLASS_INTENSITY
    persistMasterSettings()
    if (!pendingCompanyName.value) {
      pendingCompanyName.value = masterSettings.value.companyOptions[0] ?? ''
    }
  }

  function evaluateTelemetryState(telemetry: DeviceTelemetry) {
    const cpuUsageCritical = telemetry.cpuUsagePercent >= masterSettings.value.thresholds.cpuUsage.critical
    const gpuUsageCritical = (telemetry.gpu?.usagePercent ?? 0) >= masterSettings.value.thresholds.gpuUsage.critical
    const ramUsageCritical = telemetry.memoryUsedPercent >= masterSettings.value.thresholds.ramUsage.critical
    const diskUsageCritical = Math.max(...(telemetry.disks?.map((entry) => entry.usedPercent) ?? [0])) >= masterSettings.value.thresholds.diskUsage.critical
    const cpuTempCritical = (telemetry.cpuTemperatureC ?? 0) >= masterSettings.value.thresholds.cpuTemp.critical
    const gpuTempCritical = (telemetry.gpu?.temperatureC ?? 0) >= masterSettings.value.thresholds.gpuTemp.critical

    const cpuUsageWarning = telemetry.cpuUsagePercent >= masterSettings.value.thresholds.cpuUsage.warning
    const gpuUsageWarning = (telemetry.gpu?.usagePercent ?? 0) >= masterSettings.value.thresholds.gpuUsage.warning
    const ramUsageWarning = telemetry.memoryUsedPercent >= masterSettings.value.thresholds.ramUsage.warning
    const diskUsageWarning = Math.max(...(telemetry.disks?.map((entry) => entry.usedPercent) ?? [0])) >= masterSettings.value.thresholds.diskUsage.warning
    const cpuTempWarning = (telemetry.cpuTemperatureC ?? 0) >= masterSettings.value.thresholds.cpuTemp.warning
    const gpuTempWarning = (telemetry.gpu?.temperatureC ?? 0) >= masterSettings.value.thresholds.gpuTemp.warning

    const criticalCauses: TelemetryAlertCause[] = []
    const warningDetected =
      cpuUsageWarning || gpuUsageWarning || ramUsageWarning || diskUsageWarning || cpuTempWarning || gpuTempWarning

    if (cpuUsageCritical) {
      criticalCauses.push({
        key: 'cpuUsage',
        label: 'CPU',
        value: telemetry.cpuUsagePercent,
        critical: masterSettings.value.thresholds.cpuUsage.critical,
        unit: '%'
      })
    }
    if (gpuUsageCritical && telemetry.gpu?.usagePercent !== null && telemetry.gpu?.usagePercent !== undefined) {
      criticalCauses.push({
        key: 'gpuUsage',
        label: 'GPU',
        value: telemetry.gpu.usagePercent,
        critical: masterSettings.value.thresholds.gpuUsage.critical,
        unit: '%'
      })
    }
    if (ramUsageCritical) {
      criticalCauses.push({
        key: 'ramUsage',
        label: 'RAM',
        value: telemetry.memoryUsedPercent,
        critical: masterSettings.value.thresholds.ramUsage.critical,
        unit: '%'
      })
    }
    if (diskUsageCritical) {
      criticalCauses.push({
        key: 'diskUsage',
        label: 'Dysk',
        value: Math.max(...(telemetry.disks?.map((entry) => entry.usedPercent) ?? [0])),
        critical: masterSettings.value.thresholds.diskUsage.critical,
        unit: '%'
      })
    }
    if (cpuTempCritical) {
      criticalCauses.push({
        key: 'cpuTemp',
        label: 'CPU temp.',
        value: telemetry.cpuTemperatureC ?? 0,
        critical: masterSettings.value.thresholds.cpuTemp.critical,
        unit: '°C'
      })
    }
    if (gpuTempCritical && telemetry.gpu?.temperatureC !== null && telemetry.gpu?.temperatureC !== undefined) {
      criticalCauses.push({
        key: 'gpuTemp',
        label: 'GPU temp.',
        value: telemetry.gpu.temperatureC,
        critical: masterSettings.value.thresholds.gpuTemp.critical,
        unit: '°C'
      })
    }

    return {
      state: criticalCauses.length ? 'alert' : warningDetected ? 'warning' : 'healthy',
      criticalCauses
    }
  }

  function shouldShowAlertNotification(alert: AlertEvent) {
    if (slaveSettings.value.muteAllNotifications) return false
    if (slaveSettings.value.hideAlertNotifications) return false
    if (alert.type === 'temperature' && slaveSettings.value.muteTempNotifications) return false
    if ((alert.type === 'usage' || alert.type === 'disk') && slaveSettings.value.muteUsageNotifications) return false
    return true
  }

  async function notifyUser(title: string, body: string, category: 'message' | 'alert' | 'system' = 'system') {
    if (slaveSettings.value.muteAllNotifications) return false
    if (category === 'message' && slaveSettings.value.muteChatSounds) return false
    if (category === 'system' && slaveSettings.value.muteSystemNotifications) return false
    await window.janek.system.notify(title, body)
    return true
  }

  function clearCompanyChatSubscriptions() {
    companyChatCleanup.forEach((dispose) => dispose())
    companyChatCleanup.clear()
    companyChatStateCleanup.forEach((dispose) => dispose())
    companyChatStateCleanup.clear()
  }

  function clearCommandHistorySubscriptions() {
    commandHistoryCleanup.forEach((dispose) => dispose())
    commandHistoryCleanup.clear()
  }

  function clearRootSubscriptions() {
    rootCleanup.forEach((dispose) => dispose())
    rootCleanup.clear()
  }

  function syncCommandHistorySubscriptions(nextDevices: DeviceRecord[]) {
    const deviceIds = new Set(nextDevices.map((device) => device.deviceId))

    commandHistoryCleanup.forEach((dispose, deviceId) => {
      if (deviceIds.has(deviceId)) return
      dispose()
      commandHistoryCleanup.delete(deviceId)
      delete commandHistory.value[deviceId]
    })

    nextDevices.forEach((device) => {
      if (commandHistoryCleanup.has(device.deviceId)) return
      const dispose = backend.value!.subscribeCommandHistory(device, (commands) => {
        commandHistory.value = {
          ...commandHistory.value,
          [device.deviceId]: commands
        }
      })
      commandHistoryCleanup.set(device.deviceId, dispose)
    })
  }

  function resetSessionState() {
    teardownSession()
    devices.value = []
    archivedDevices.value = []
    allAlerts.value = []
    inventory.value = {}
    allCompanyChats.value = {}
    companyChatStates.value = {}
    chatMessageSendStates.value = {}
    commandHistory.value = {}
    localDwServiceState.value = { status: 'unconfigured' }
    selectedDeviceId.value = ''
    selectedConversationOwnerUid.value = ''
    pendingDeviceAlias.value = ''
    pendingCompanyName.value = ''
    pendingInstallationLocation.value = ''
    workerDeviceId.value = ''
    handledUpdateRequests.clear()
    handledRemoteActionRequests.clear()
    handledDwServiceConfigurations.clear()
    handledDwServiceConfigurations.clear()
    initializedCompanyChats.clear()
    initializedCompanyChatStates.clear()
    seenAlertIds.clear()
    alertsSnapshotReady = false
    lastSelfApprovalStatus = null
    deviceRegistrationInFlight = false
    archivedDeviceResetInFlight = false
    telemetryAlertSignatures.clear()
  }

  function bindAuthListener() {
    clearRootSubscriptions()

    const authUnsubscribe = backend.value!.subscribeAuth(async (nextUser) => {
      try {
        user.value = nextUser
        if (!nextUser) {
          teardownSession()
          devices.value = []
          archivedDevices.value = []
          allAlerts.value = []
          usageHistory.value = {}
          allCompanyChats.value = {}
          companyChatStates.value = {}
          chatMessageSendStates.value = {}
          localDwServiceState.value = { status: 'unconfigured' }
          selectedConversationOwnerUid.value = ''
          pendingDeviceAlias.value = ''
          pendingCompanyName.value = ''
          pendingInstallationLocation.value = ''
          return
        }

        await handleSignedIn(nextUser)
      } catch (error) {
        lastError.value = error instanceof Error ? error.message : 'Nie udało się zsynchronizować sesji po logowaniu.'
      }
    })
    rootCleanup.add(authUnsubscribe)
  }

  function syncCompanyChatSubscriptions(ownerUids: string[]) {
    const uniqueOwnerUids = [...new Set(ownerUids.filter(Boolean))]

    companyChatCleanup.forEach((dispose, ownerUid) => {
      if (uniqueOwnerUids.includes(ownerUid)) return
      dispose()
      companyChatCleanup.delete(ownerUid)
      delete allCompanyChats.value[ownerUid]
      initializedCompanyChats.delete(ownerUid)
    })

    companyChatStateCleanup.forEach((dispose, ownerUid) => {
      if (uniqueOwnerUids.includes(ownerUid)) return
      dispose()
      companyChatStateCleanup.delete(ownerUid)
      delete companyChatStates.value[ownerUid]
      initializedCompanyChatStates.delete(ownerUid)
    })

    uniqueOwnerUids.forEach((ownerUid) => {
      if (companyChatCleanup.has(ownerUid)) return
      const cleanup = backend.value!.subscribeCompanyChats(ownerUid, (messages) => {
        const previousMessages = companyChats.value[ownerUid] ?? []
        const previousIds = new Set(previousMessages.map((entry) => entry.id))
        allCompanyChats.value = {
          ...allCompanyChats.value,
          [ownerUid]: messages
        }

        const visibleMessages = companyChats.value[ownerUid] ?? []

        if (initializedCompanyChatStates.has(ownerUid)) markLatestIncomingDelivered(ownerUid)

        if (!initializedCompanyChats.has(ownerUid)) {
          visibleMessages.forEach((message) => previousIds.add(message.id))
          initializedCompanyChats.add(ownerUid)
          return
        }

        if (slaveSettings.value.muteChatSounds) return

        const incomingMessages = visibleMessages.filter((message) => !previousIds.has(message.id) && message.senderRole !== user.value?.role)
        for (const message of incomingMessages) {
          void notifyUser(
            `Wiadomość od ${message.senderEmail}`,
            message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body,
            'message'
          )
        }
      })
      companyChatCleanup.set(ownerUid, cleanup)

      const stateCleanup = backend.value!.subscribeCompanyChatState(ownerUid, (state) => {
        companyChatStates.value = { ...companyChatStates.value, [ownerUid]: state }
        initializedCompanyChatStates.add(ownerUid)
        markLatestIncomingDelivered(ownerUid)
      })
      companyChatStateCleanup.set(ownerUid, stateCleanup)
    })
  }

  async function bootstrap() {
    try {
      backend.value = createBackendClient()
      systemContext.value = await window.janek.system.getContext()
      consent.value = await window.janek.system.getConsent()
      loadPersistedSettings()
      await window.janek.system.setNotificationsEnabled(!slaveSettings.value.muteAllNotifications)
      if (!pendingCompanyName.value) {
        pendingCompanyName.value = masterSettings.value.companyOptions[0] ?? ''
      }
      if (!pendingDeviceAlias.value) {
        pendingDeviceAlias.value = systemContext.value?.hostname ?? ''
      }
      applyTheme('dark')
      syncState.value = offline.value ? 'offline' : 'connected'
      lastSyncAt.value = Date.now()
      bindAuthListener()
    } catch (error) {
      lastError.value =
        error instanceof Error
          ? error.message
          : 'Nie udało się uruchomić aplikacji. Sprawdź konfigurację środowiska.'
      syncState.value = 'offline'
    }

    window.addEventListener('online', handleConnectivityChange)
    window.addEventListener('offline', handleConnectivityChange)
    ready.value = true
  }

  async function handleArchivedSelfDevice(device: DeviceRecord) {
    if (archivedDeviceResetInFlight) return
    archivedDeviceResetInFlight = true
    const deviceLabel = device.deviceAlias?.trim() || device.hostname
    try {
      stopIntervals()
      await window.janek.system.setRegisteredDeviceId(null)
      await window.janek.system.setConsent(null)
      consent.value = null
      if (systemContext.value) {
        systemContext.value = {
          ...systemContext.value,
          deviceId: `${systemContext.value.hostname}-${systemContext.value.machineId}`
        }
      }
      await signOut()
      lastError.value = `Komputer „${deviceLabel}” został usunięty przez administratora. Aby ponownie dodać sprzęt, zaloguj się na właściwe konto i przejdź nową rejestrację.`
    } catch (error) {
      lastError.value = error instanceof Error
        ? error.message
        : 'Nie udało się wyrejestrować zarchiwizowanego komputera.'
    } finally {
      archivedDeviceResetInFlight = false
    }
  }

  async function handleSignedIn(nextUser: AppUser) {
    teardownSession()
    statusNow.value = Date.now()
    const statusClock = window.setInterval(() => { statusNow.value = Date.now() }, 30_000)
    sessionCleanup.add(() => window.clearInterval(statusClock))
    devices.value = []
    archivedDevices.value = []
    allAlerts.value = []
    usageHistory.value = {}
    allCompanyChats.value = {}
    companyChatStates.value = {}
    chatMessageSendStates.value = {}
    commandHistory.value = {}
    selectedDeviceId.value = ''
    selectedConversationOwnerUid.value = ''
    workerDeviceId.value = ''
    handledUpdateRequests.clear()
    handledRemoteActionRequests.clear()
    initializedCompanyChats.clear()
    initializedCompanyChatStates.clear()
    seenAlertIds.clear()
    alertsSnapshotReady = false
    deviceRegistrationInFlight = false
    archivedDeviceResetInFlight = false
    telemetryAlertSignatures.clear()

    const profile = await backend.value!.ensureUserProfile(nextUser)
    nextUser.displayName = profile.displayName
    nextUser.companyName = profile.companyName
    nextUser.installationLocation = profile.installationLocation
    user.value = { ...nextUser }
    if (!pendingCompanyName.value) pendingCompanyName.value = profile.companyName
    if (!pendingInstallationLocation.value) pendingInstallationLocation.value = profile.installationLocation

    if (
      nextUser.role === 'slave'
      && systemContext.value?.platform !== 'web'
      && !consent.value
      && (!pendingDeviceAlias.value || pendingDeviceAlias.value === systemContext.value?.hostname)
    ) {
      pendingDeviceAlias.value = suggestedDeviceAlias(profile.displayName, profile.email)
    }

    const isNewAccountRegistration = pendingNewAccountEmail === nextUser.email.trim().toLowerCase()
    if (isNewAccountRegistration) {
      pendingNewAccountEmail = null
      if (nextUser.role === 'slave' && systemContext.value?.platform !== 'web') {
        const provisionalDeviceId =
          buildDeviceId(
            profile.companyName || 'KLIENT',
            `${systemContext.value.hostname}-${systemContext.value.machineId.slice(0, 8)}-${nextUser.uid.slice(0, 8)}`
          ) || `${systemContext.value.hostname}-${systemContext.value.machineId.slice(0, 8)}-${nextUser.uid.slice(0, 8)}`
        consent.value = null
        await window.janek.system.setConsent(null)
        await window.janek.system.setRegisteredDeviceId(provisionalDeviceId)
        systemContext.value = { ...systemContext.value, deviceId: provisionalDeviceId }
        await backend.value!.ensureDeviceRecord(
          nextUser,
          toDeviceIdentity(systemContext.value, provisionalDeviceId)
        )
      }
    }

    if (nextUser.role === 'slave' && systemContext.value?.platform === 'web') {
      lastError.value = ''
      return
    }

    connectivityIntervalHandle = window.setInterval(() => void checkConnectivity(true), 5 * 60 * 1000)
    void checkConnectivity(false)

    const masterSettingsCleanup = backend.value!.subscribeRemoteMasterSettings((remoteSettings) => {
      applyRemoteMasterSettings(remoteSettings)
    })
    sessionCleanup.add(masterSettingsCleanup)

    const deviceCleanup = backend.value!.subscribeDevices(nextUser, (nextDevices, isAuthoritative) => {
      const nextArchivedDevices = nextDevices.filter((device) => Boolean(device.archivedAt))
      const nextActiveDevices = nextDevices.filter((device) => !device.archivedAt)
      archivedDevices.value = nextArchivedDevices
      devices.value = nextActiveDevices
      lastSyncAt.value = Date.now()
      if (!offline.value) void flushOfflineQueue()
      if (!nextActiveDevices.some((device) => device.deviceId === selectedDeviceId.value)) {
        selectedDeviceId.value = nextActiveDevices[0]?.deviceId ?? ''
      }
      if (!selectedConversationOwnerUid.value && nextActiveDevices.length) {
        selectedConversationOwnerUid.value = nextActiveDevices[0].ownerUid
      }
      if (selectedConversationOwnerUid.value && !nextActiveDevices.some((entry) => entry.ownerUid === selectedConversationOwnerUid.value)) {
        selectedConversationOwnerUid.value = nextActiveDevices[0]?.ownerUid ?? ''
      }
      syncCompanyChatSubscriptions(nextActiveDevices.map((entry) => entry.ownerUid))
      if (nextUser.role === 'master') {
        syncCommandHistorySubscriptions(nextActiveDevices)
      }
      if (nextUser.role === 'slave' && systemContext.value) {
        const archivedSelfDevice = nextArchivedDevices.find((entry) =>
          entry.deviceId === systemContext.value?.deviceId || entry.machineId === systemContext.value?.machineId
        )
        if (archivedSelfDevice) {
          void handleArchivedSelfDevice(archivedSelfDevice)
          return
        }

        let selfDevice = nextActiveDevices.find((entry) => entry.deviceId === systemContext.value?.deviceId)
        if (!selfDevice) {
          selfDevice = nextActiveDevices.find((entry) => entry.machineId === systemContext.value?.machineId)
          if (selfDevice) {
            systemContext.value = { ...systemContext.value, deviceId: selfDevice.deviceId }
            void window.janek.system.setRegisteredDeviceId(selfDevice.deviceId)
          }
        }

        if (!selfDevice && isAuthoritative && !deviceRegistrationInFlight && !deregisteringCurrentDevice) {
          deviceRegistrationInFlight = true
          const context = systemContext.value
          const existingConsent = consent.value
          const provisionalDeviceId =
            buildDeviceId(
              nextUser.companyName || 'KLIENT',
              `${context.hostname}-${context.machineId.slice(0, 8)}-${nextUser.uid.slice(0, 8)}`
            ) || `${context.hostname}-${context.machineId.slice(0, 8)}-${nextUser.uid.slice(0, 8)}`
          void (async () => {
            try {
              if (!existingConsent) await window.janek.system.setConsent(null)
              await window.janek.system.setRegisteredDeviceId(provisionalDeviceId)
              systemContext.value = { ...context, deviceId: provisionalDeviceId }
              const ensured = await backend.value!.ensureDeviceRecord(
                nextUser,
                toDeviceIdentity(context, provisionalDeviceId),
                existingConsent ?? undefined
              )
              selectedDeviceId.value = ensured.deviceId
              selectedConversationOwnerUid.value = ensured.ownerUid
            } catch (error) {
              lastError.value = error instanceof Error
                ? error.message
                : 'Nie udało się wysłać urządzenia do akceptacji administratora.'
            } finally {
              deviceRegistrationInFlight = false
            }
          })()
        }

        if (selfDevice) {
          selectedDeviceId.value = selfDevice.deviceId
          selectedConversationOwnerUid.value = selfDevice.ownerUid
          const previousApprovalStatus = lastSelfApprovalStatus
          lastSelfApprovalStatus = selfDevice.approvalStatus
          if (previousApprovalStatus === 'pending' && selfDevice.approvalStatus === 'approved') {
            void notifyUser(
              'i-JANEK — urządzenie zatwierdzone',
              'Administrator zaakceptował komputer. Możesz już korzystać z aplikacji.'
            )
          } else if (previousApprovalStatus === 'pending' && selfDevice.approvalStatus === 'rejected') {
            void notifyUser(
              'i-JANEK — rejestracja odrzucona',
              'Administrator odrzucił prośbę. Otwórz aplikację, aby sprawdzić dalsze kroki.'
            )
          }
          if (!pendingDeviceAlias.value) {
            pendingDeviceAlias.value = selfDevice.deviceAlias ?? selfDevice.hostname
          }
          if (!pendingCompanyName.value) {
            pendingCompanyName.value = selfDevice.companyName?.trim() || masterSettings.value.companyOptions[0] || ''
          }
          void window.janek.system.setUpdateChannel(selfDevice.updateChannel ?? 'stable')
          void startSlaveWorkers(selfDevice)
          if (selfDevice.approvalStatus === 'approved') {
            void processDwServiceProvisioning(selfDevice)
            void backend.value?.setPresence(selfDevice, nextUser.role, true)
            void processUpdateRequest(selfDevice)
            void processRemoteAction(selfDevice)
          }
        }
      }
    })
    sessionCleanup.add(deviceCleanup)

    const alertsCleanup = backend.value!.subscribeAlerts(nextUser, (nextAlerts) => {
      const previousIds = new Set(seenAlertIds)
      allAlerts.value = nextAlerts
      lastSyncAt.value = Date.now()

      if (!alertsSnapshotReady) {
        nextAlerts.forEach((alert) => seenAlertIds.add(alert.id))
        alertsSnapshotReady = true
        return
      }

      const newCriticalAlerts = alerts.value.filter((alert) => !previousIds.has(alert.id) && alert.severity === 'critical')
      nextAlerts.forEach((alert) => seenAlertIds.add(alert.id))

      if (!newCriticalAlerts.length) return

      for (const alert of newCriticalAlerts) {
        if (!shouldShowAlertNotification(alert)) continue
        void notifyUser(alert.title, alert.message, 'alert')
      }
    })
    sessionCleanup.add(alertsCleanup)

  }

  function handleConnectivityChange() {
    void checkConnectivity(true)
  }

  async function checkConnectivity(showNotification: boolean) {
    if (connectivityCheckInFlight) return !offline.value
    connectivityCheckInFlight = true
    const wasOffline = offline.value
    let isOnline = navigator.onLine
    if (isOnline && backend.value && user.value) {
      try {
        await Promise.race([
          backend.value.healthCheck(),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Przekroczono czas sprawdzania sieci.')), 12_000))
        ])
      } catch {
        isOnline = false
      }
    }
    offline.value = !isOnline
    syncState.value = isOnline ? 'connected' : 'offline'
    connectivityCheckInFlight = false

    if (isOnline) {
      lastSyncAt.value = Date.now()
      if (wasOffline) {
        if (selfDevice.value?.approvalStatus === 'approved') void runHeartbeat(selfDevice.value)
        void flushOfflineQueue(true)
        if (selfDevice.value) void processDwServiceProvisioning(selfDevice.value)
        if (showNotification && lastConnectivityNotificationState !== 'online') {
          void notifyUser('i-JANEK', 'Aplikacja jest ponownie online.')
        }
        lastConnectivityNotificationState = 'online'
      }
    } else if (!wasOffline || lastConnectivityNotificationState === null) {
      lastConnectivityNotificationState = 'offline'
    }
    return isOnline
  }

  function queueOfflineOperation(operation: Omit<OfflineOperation, 'id' | 'createdAt' | 'attempts'>) {
    offlineQueueCount.value = enqueueOfflineOperation(operation)
    if (operation.kind === 'usage_rollup') return
    void window.janek.system.logEvent('warning', 'offline_operation_queued', {
      kind: operation.kind,
      deviceId: operation.deviceId,
      queueCount: offlineQueueCount.value
    })
  }

  async function flushOfflineQueue(forceUsageRollups = false) {
    if (flushingOfflineQueue.value || offline.value || !backend.value || !user.value) return
    flushingOfflineQueue.value = true
    try {
      for (const operation of readOfflineQueue()) {
        if (
          operation.kind === 'usage_rollup'
          && !forceUsageRollups
          && Date.now() - operation.createdAt < USAGE_ROLLUP_FLUSH_INTERVAL_MS
        ) {
          continue
        }
        const device = devices.value.find((entry) => entry.deviceId === operation.deviceId)
        if (!device) continue
        try {
          if (operation.kind === 'telemetry') {
            await backend.value.publishTelemetry(device, operation.payload)
          } else if (operation.kind === 'inventory') {
            await backend.value.publishInventory(device, operation.payload)
          } else {
            await backend.value.recordUsageRollup(device, operation.payload)
          }
          offlineQueueCount.value = removeOfflineOperation(operation.id)
        } catch (error) {
          offlineQueueCount.value = markOfflineOperationAttempt(operation.id)
          void window.janek.system.logEvent('warning', 'offline_operation_flush_failed', {
            kind: operation.kind,
            deviceId: operation.deviceId,
            error: error instanceof Error ? error.message : String(error)
          })
          break
        }
      }
      if (offlineQueueCount.value === 0) lastSyncAt.value = Date.now()
    } finally {
      flushingOfflineQueue.value = false
    }
  }

  async function signInWithEmail(email: string, password: string) {
    if (signingIn.value) return
    try {
      signingIn.value = true
      lastError.value = ''
      user.value = await backend.value!.signInWithEmail(email, password)
    } catch (error) {
      lastError.value = friendlyAuthError(error, 'Nie udało się zalogować. Sprawdź dane i spróbuj ponownie.')
    } finally {
      signingIn.value = false
    }
  }

  async function registerWithEmail(email: string, password: string, details: RegistrationDetails) {
    if (signingIn.value) return
    const normalizedEmail = email.trim().toLowerCase()
    try {
      signingIn.value = true
      lastError.value = ''
      pendingNewAccountEmail = normalizedEmail
      pendingCompanyName.value = details.companyName.trim()
      pendingInstallationLocation.value = details.installationLocation?.trim() ?? ''
      user.value = await backend.value!.registerWithEmail(email, password, details)
    } catch (error) {
      pendingNewAccountEmail = null
      lastError.value = friendlyAuthError(error, 'Nie udało się utworzyć konta. Sprawdź dane i spróbuj ponownie.')
    } finally {
      signingIn.value = false
    }
  }

  async function sendPasswordReset(email: string) {
    try {
      lastError.value = ''
      await backend.value!.sendPasswordReset(email)
      if (isDesktopAgent.value) {
      await notifyUser('i-JANEK', 'Wysłaliśmy wiadomość pozwalającą ustawić nowe hasło.')
      }
      return true
    } catch (error) {
      lastError.value = friendlyAuthError(error, 'Nie udało się wysłać wiadomości resetującej hasło.')
      return false
    }
  }

  async function signOut() {
    stopIntervals()
    await backend.value?.signOut()
    clearRootSubscriptions()
    try {
      backend.value = createBackendClient()
      bindAuthListener()
    } catch (error) {
      lastError.value =
        error instanceof Error
          ? error.message
          : 'Nie udało się ponownie zainicjalizować backendu po wylogowaniu.'
    }
    user.value = null
    resetSessionState()
  }

  async function getCurrentAccountDeviceCount() {
    if (!user.value || user.value.role !== 'slave') throw new Error('Brak konta klienta.')
    return backend.value!.getOwnedDeviceCount(user.value.uid)
  }

  async function deregisterAndSignOut(options: { deleteAccount: boolean; password?: string; expectedLastDevice: boolean }) {
    if (!user.value || user.value.role !== 'slave') throw new Error('Tylko klient może wyrejestrować swoje urządzenie.')
    deregisteringCurrentDevice = true
    try {
      const ownedDeviceCount = await backend.value!.getOwnedDeviceCount(user.value.uid)
      const isLastDevice = ownedDeviceCount <= 1
      if (isLastDevice !== options.expectedLastDevice) {
        throw new Error('Liczba urządzeń na koncie zmieniła się. Otwórz potwierdzenie ponownie.')
      }
      if (options.deleteAccount && !isLastDevice) throw new Error('Najpierw wyrejestruj pozostałe urządzenia.')
      if (options.deleteAccount) await backend.value!.prepareAccountDeletion(options.password)
      if (selfDevice.value) {
        await backend.value?.deleteDeviceRecord(selfDevice.value.deviceId)
      }
      if (options.deleteAccount) await backend.value!.deleteCurrentAccount()
      await window.janek.system.setRegisteredDeviceId(null)
      await window.janek.system.setConsent(null)
      consent.value = null
      if (systemContext.value) {
        systemContext.value = {
          ...systemContext.value,
          deviceId: `${systemContext.value.hostname}-${systemContext.value.machineId}`
        }
      }
      await signOut()
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Nie udało się wyrejestrować urządzenia.'
      throw error
    } finally {
      deregisteringCurrentDevice = false
    }
  }

  async function acceptConsent(dwServiceConsent = false) {
    if (!dwServiceConsent && !consent.value?.dwServiceConsent) throw new Error('Wymagana jest zgoda na instalację i użycie DWService.')
    const companyName = pendingCompanyName.value.trim()
    const aliasName = pendingDeviceAlias.value.trim()
    if (!companyName || !aliasName || aliasName.length < MIN_DEVICE_ALIAS_LENGTH) {
      await notifyUser('i-JANEK', `Wybierz firmę i wpisz nazwę komputera (min. ${MIN_DEVICE_ALIAS_LENGTH} znaki).`)
      return
    }
    if (!user.value || user.value.role !== 'slave' || !systemContext.value) return
    const requestedDeviceId = buildDeviceId(
      companyName,
      aliasName,
      uniqueDeviceKey(systemContext.value.machineId, user.value.uid)
    )
    if (!requestedDeviceId) {
      await notifyUser('i-JANEK', 'Nie udało się utworzyć ID urządzenia. Użyj nazwy firmy i komputera.')
      return
    }

    const nextConsent: ConsentRecord = {
      acceptedAt: Date.now(),
      diagnosticsConsent: true,
      remoteCommandConsent: true,
      dwServiceConsent: dwServiceConsent || Boolean(consent.value?.dwServiceConsent),
      policyVersion: CURRENT_CONSENT_POLICY_VERSION
    }

    if (user.value?.role === 'slave' && systemContext.value) {
      const currentDevice = selfDevice.value

      if (currentDevice?.approvalStatus === 'approved') {
        await backend.value?.updateConsent(currentDevice.deviceId, nextConsent)
        await window.janek.system.setRegisteredDeviceId(currentDevice.deviceId)
        systemContext.value = { ...systemContext.value, deviceId: currentDevice.deviceId }
        pendingDeviceAlias.value = currentDevice.deviceAlias ?? currentDevice.hostname
        pendingCompanyName.value = currentDevice.companyName?.trim() || companyName
        selectedDeviceId.value = currentDevice.deviceId
        selectedConversationOwnerUid.value = currentDevice.ownerUid
        devices.value = devices.value.map((device) =>
          device.deviceId === currentDevice.deviceId
            ? { ...device, consent: nextConsent, consentAcceptedAt: nextConsent.acceptedAt, updatedAt: Date.now() }
            : device
        )
        consent.value = nextConsent
        await window.janek.system.setConsent(cloneForIpc(nextConsent))
        return
      }

      const requestedIdentity = toDeviceIdentity(systemContext.value, requestedDeviceId)
      if (currentDevice && currentDevice.deviceId !== requestedDeviceId) {
        const migrated = await backend.value!.migrateDeviceRecord(user.value, currentDevice, requestedIdentity, aliasName, companyName)
        await backend.value?.updateConsent(migrated.deviceId, nextConsent)
        await backend.value?.updateDeviceRegistrationDetails(migrated.deviceId, {
          contactName: user.value.displayName,
          companyName,
          installationLocation: pendingInstallationLocation.value.trim()
        })
        await window.janek.system.setRegisteredDeviceId(migrated.deviceId)
        systemContext.value = { ...systemContext.value, deviceId: migrated.deviceId }
        pendingDeviceAlias.value = aliasName
        pendingCompanyName.value = companyName
        selectedDeviceId.value = migrated.deviceId
        selectedConversationOwnerUid.value = migrated.ownerUid
        devices.value = devices.value
          .filter((device) => device.deviceId !== currentDevice.deviceId && device.deviceId !== migrated.deviceId)
          .concat({ ...migrated, approvalStatus: 'pending', approvedBy: null, updatedAt: Date.now() })
          .sort((a, b) => b.updatedAt - a.updatedAt)
        consent.value = nextConsent
        await window.janek.system.setConsent(cloneForIpc(nextConsent))
        return
      }

      const ensured = await backend.value!.ensureDeviceRecord(user.value, requestedIdentity, nextConsent)
      await backend.value?.updateDeviceAlias(requestedDeviceId, aliasName)
      await backend.value?.updateDeviceRegistrationDetails(requestedDeviceId, {
        contactName: user.value.displayName,
        companyName,
        installationLocation: pendingInstallationLocation.value.trim()
      })
      await window.janek.system.setRegisteredDeviceId(requestedDeviceId)
      systemContext.value = { ...systemContext.value, deviceId: requestedDeviceId }
      pendingDeviceAlias.value = aliasName
      pendingCompanyName.value = companyName
      selectedDeviceId.value = ensured.deviceId
      selectedConversationOwnerUid.value = ensured.ownerUid
      consent.value = nextConsent
      await window.janek.system.setConsent(cloneForIpc(nextConsent))
    }
  }

  async function saveDeviceDetails(
    deviceId: string,
    details: { deviceAlias: string; contactName: string; companyName: string; installationLocation: string }
  ) {
    if (user.value?.role !== 'master') throw new Error('Tylko administrator może zmieniać dane tego komputera.')

    const normalized = {
      deviceAlias: details.deviceAlias.trim(),
      contactName: details.contactName.trim(),
      companyName: details.companyName.trim(),
      installationLocation: details.installationLocation.trim()
    }
    if (normalized.deviceAlias.length < MIN_DEVICE_ALIAS_LENGTH) {
      throw new Error(`Nazwa komputera musi mieć co najmniej ${MIN_DEVICE_ALIAS_LENGTH} znaki.`)
    }
    if (!normalized.companyName) throw new Error('Wpisz nazwę firmy.')

    await backend.value?.updateDeviceRegistrationDetails(deviceId, normalized)
    devices.value = devices.value.map((device) =>
      device.deviceId === deviceId
        ? { ...device, ...normalized, aliasCustomizedAt: Date.now(), updatedAt: Date.now() }
        : device
    )
  }

  async function archiveDevice(deviceId: string) {
    if (user.value?.role !== 'master') throw new Error('Tylko administrator może usunąć komputer.')
    const device = devices.value.find((entry) => entry.deviceId === deviceId)
    if (!device) throw new Error('Nie znaleziono komputera do usunięcia.')

    const archivedAt = Date.now()
    const archivedBy = user.value.email || DEFAULT_MASTER_EMAIL
    await backend.value?.archiveDeviceRecord(deviceId, archivedBy)

    archivedDevices.value = [
      { ...device, archivedAt, archivedBy, offline: true, updatedAt: archivedAt },
      ...archivedDevices.value.filter((entry) => entry.deviceId !== deviceId)
    ]
    devices.value = devices.value.filter((entry) => entry.deviceId !== deviceId)
    if (selectedDeviceId.value === deviceId) selectedDeviceId.value = devices.value[0]?.deviceId ?? ''
    if (!devices.value.some((entry) => entry.ownerUid === selectedConversationOwnerUid.value)) {
      selectedConversationOwnerUid.value = devices.value[0]?.ownerUid ?? ''
    }
    syncCompanyChatSubscriptions(devices.value.map((entry) => entry.ownerUid))
    syncCommandHistorySubscriptions(devices.value)
  }

  async function approveDevice(
    deviceId: string,
    approvalStatus: 'approved' | 'rejected',
    details?: { deviceAlias: string; contactName: string; companyName: string; installationLocation: string },
    dwServiceInstallationCode?: string
  ) {
    if (approvalStatus === 'approved') {
      if (!details) throw new Error('Przed zatwierdzeniem wybierz firmę dla urządzenia.')
      const selectedCompany = masterSettings.value.companyOptions.find(
        (company) => company.toLocaleLowerCase('pl') === details.companyName.trim().toLocaleLowerCase('pl')
      )
      if (!selectedCompany) throw new Error('Wybierz firmę z listy albo najpierw utwórz nową firmę.')
      details = { ...details, companyName: selectedCompany }
      if (!dwServiceInstallationCode?.trim()) throw new Error('Wpisz kod instalacyjny agenta DWService.')
    }
    if (details) await saveDeviceDetails(deviceId, details)
    if (approvalStatus === 'approved') await configureDwService(deviceId, dwServiceInstallationCode!)
    await backend.value?.updateApprovalStatus(deviceId, approvalStatus, user.value?.email ?? DEFAULT_MASTER_EMAIL)
    devices.value = devices.value.map((device) =>
      device.deviceId === deviceId
        ? { ...device, approvalStatus, approvedBy: user.value?.email ?? DEFAULT_MASTER_EMAIL, updatedAt: Date.now() }
        : device
    )
  }

  async function updateChatParticipantState(
    ownerUid: string,
    participant: CompanyChatParticipant,
    patch: Partial<Pick<CompanyChatParticipantState, 'typing' | 'lastDeliveredAt' | 'lastReadAt'>>
  ) {
    if (!backend.value || !user.value || user.value.role !== participant) return
    const current = companyChatStates.value[ownerUid]?.[participant]
    const nextState: CompanyChatParticipantState = {
      role: participant,
      email: user.value.email,
      typing: patch.typing ?? current?.typing ?? false,
      lastDeliveredAt: Math.max(current?.lastDeliveredAt ?? 0, patch.lastDeliveredAt ?? 0),
      lastReadAt: Math.max(current?.lastReadAt ?? 0, patch.lastReadAt ?? 0),
      updatedAt: Date.now()
    }
    companyChatStates.value = {
      ...companyChatStates.value,
      [ownerUid]: { ...(companyChatStates.value[ownerUid] ?? {}), [participant]: nextState }
    }
    try {
      await backend.value.updateCompanyChatParticipantState(ownerUid, participant, nextState)
    } catch (error) {
      console.warn('[i-JANEK] Nie udało się zaktualizować stanu rozmowy:', error)
    }
  }

  function markLatestIncomingDelivered(ownerUid: string) {
    const role = user.value?.role
    if (!role) return
    const latestIncomingAt = (companyChats.value[ownerUid] ?? []).reduce(
      (latest, message) => message.senderRole === role ? latest : Math.max(latest, message.createdAt),
      0
    )
    if (latestIncomingAt > (companyChatStates.value[ownerUid]?.[role]?.lastDeliveredAt ?? 0)) {
      void updateChatParticipantState(ownerUid, role, { lastDeliveredAt: latestIncomingAt })
    }
  }

  async function setChatTyping(ownerUid: string, typing: boolean) {
    if (!ownerUid || !user.value) return
    await updateChatParticipantState(ownerUid, user.value.role, { typing })
  }

  async function markChatRead(ownerUid = selectedConversationOwnerUid.value) {
    const role = user.value?.role
    if (!ownerUid || !role) return
    const latestIncomingAt = (companyChats.value[ownerUid] ?? []).reduce(
      (latest, message) => message.senderRole === role ? latest : Math.max(latest, message.createdAt),
      0
    )
    if (!latestIncomingAt) return
    await updateChatParticipantState(ownerUid, role, {
      lastDeliveredAt: latestIncomingAt,
      lastReadAt: latestIncomingAt
    })
  }

  function getChatMessageStatus(message: CompanyChatMessage) {
    const localState = chatMessageSendStates.value[message.id]
    if (localState === 'sending' || localState === 'failed') return localState
    const recipient: CompanyChatParticipant = message.senderRole === 'master' ? 'slave' : 'master'
    const recipientState = companyChatStates.value[message.ownerUid]?.[recipient]
    if ((recipientState?.lastReadAt ?? 0) >= message.createdAt) return 'read' as const
    if ((recipientState?.lastDeliveredAt ?? 0) >= message.createdAt) return 'delivered' as const
    return 'sent' as const
  }

  async function retryChatMessage(message: CompanyChatMessage) {
    if (!backend.value) return false
    chatMessageSendStates.value = { ...chatMessageSendStates.value, [message.id]: 'sending' }
    chatSendError.value = ''
    try {
      await backend.value.sendCompanyChatMessage(message.ownerUid, message)
      chatMessageSendStates.value = { ...chatMessageSendStates.value, [message.id]: 'sent' }
      return true
    } catch (error) {
      chatMessageSendStates.value = { ...chatMessageSendStates.value, [message.id]: 'failed' }
      chatSendError.value = error instanceof Error ? error.message : 'Nie udało się wysłać wiadomości.'
      return false
    }
  }

  async function sendChatMessage(ownerUid = selectedConversationOwnerUid.value) {
    const device = selectedDevice.value
    if (!ownerUid || !user.value || !pendingChatMessage.value.trim()) return false

    const ownerDevice = devices.value.find((entry) => entry.ownerUid === ownerUid) ?? device ?? selfDevice.value
    if (!ownerDevice) return false

    const body = pendingChatMessage.value.trim()

    const senderDevice =
      user.value.role === 'slave'
        ? selfDevice.value ?? ownerDevice
        : device ?? ownerDevice

    const message: CompanyChatMessage = {
      id: crypto.randomUUID(),
      ownerUid,
      ownerEmail: ownerDevice.ownerEmail,
      senderRole: user.value.role,
      senderEmail: user.value.email,
      body,
      createdAt: Date.now(),
      delivered: !offline.value,
      deviceId: user.value.role === 'slave' ? selfDevice.value?.deviceId : device?.deviceId,
      deviceLabel: formatDeviceLabelForMaster(senderDevice)
    }

    pendingChatMessage.value = ''
    chatSendError.value = ''
    chatMessageSendStates.value = { ...chatMessageSendStates.value, [message.id]: 'sending' }
    await setChatTyping(ownerUid, false)

    try {
      await backend.value?.sendCompanyChatMessage(ownerUid, message)
      chatMessageSendStates.value = { ...chatMessageSendStates.value, [message.id]: 'sent' }
      return true
    } catch (error) {
      chatMessageSendStates.value = { ...chatMessageSendStates.value, [message.id]: 'failed' }
      chatSendError.value = error instanceof Error ? error.message : 'Nie udało się wysłać wiadomości.'
      if (!pendingChatMessage.value) pendingChatMessage.value = body
      return false
    }
  }

  async function loadUsageHistory(deviceId = selectedDeviceId.value, days = 30) {
    if (!deviceId || !backend.value || !isMaster.value) return []
    loadingUsageHistory.value = true
    try {
      const fromDate = new Date()
      fromDate.setUTCDate(fromDate.getUTCDate() - Math.max(1, days - 1))
      const fromDayKey = fromDate.toISOString().slice(0, 10)
      const rows = await backend.value.getUsageRollups(deviceId, fromDayKey)
      usageHistory.value = { ...usageHistory.value, [deviceId]: rows }
      return rows
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Nie udało się pobrać historii obciążenia.'
      return []
    } finally {
      loadingUsageHistory.value = false
    }
  }

  async function queueTerminalCommand() {
    const device = selectedDevice.value
    if (!device || !user.value || !pendingTerminalCommand.value.trim()) return
    await backend.value?.queueCommand(device, {
      shell: device.platform === 'darwin' ? 'shell' : 'powershell',
      command: pendingTerminalCommand.value.trim(),
      requestedBy: user.value.email
    })
    pendingTerminalCommand.value = ''
  }

  async function configureDwService(deviceId: string, installationCode: string) {
    if (!user.value || user.value.role !== 'master') throw new Error('Tylko administrator może przypisać kod DWService.')
    const configuration = await backend.value!.configureDwService(deviceId, installationCode, user.value.email)
    devices.value = devices.value.map((device) => device.deviceId === deviceId
      ? { ...device, dwservice: configuration, updatedAt: configuration.updatedAt }
      : device)
    return configuration
  }

  async function updateMasterSettings(next: Partial<MasterSettings>) {
    masterSettings.value = {
      ...masterSettings.value,
      ...next,
      companyOptions: next.companyOptions ? normalizeCompanyOptions(next.companyOptions) : masterSettings.value.companyOptions,
      thresholds: next.thresholds
        ? normalizeThresholds(next.thresholds, masterSettings.value.thresholds)
        : masterSettings.value.thresholds,
      glassIntensity: FIXED_GLASS_INTENSITY
    }
    applyGlassIntensity(FIXED_GLASS_INTENSITY)
    persistMasterSettings()
    if (user.value?.role === 'master') {
      try {
        await backend.value?.saveRemoteMasterSettings(toRemoteMasterSettings(masterSettings.value))
      } catch (error) {
        lastError.value = error instanceof Error ? error.message : 'Nie udało się zsynchronizować ustawień firm.'
      }
    }
  }

  function updateMetricThreshold(metric: MetricThresholdKey, threshold: MetricThreshold) {
    if (!isMetricThresholdValid(metric, threshold)) return false
    void updateMasterSettings({
      thresholds: {
        ...masterSettings.value.thresholds,
        [metric]: threshold
      }
    })
    return true
  }

  async function addCompanyOption(name: string) {
    const trimmed = name.trim()
    if (!trimmed) return false
    const next = normalizeCompanyOptions([...masterSettings.value.companyOptions, trimmed])
    const unchanged =
      next.length === masterSettings.value.companyOptions.length &&
      next.every((entry, index) => entry === masterSettings.value.companyOptions[index])
    if (unchanged) return false
    const nextSettings = { ...masterSettings.value, companyOptions: next }
    if (user.value?.role === 'master') {
      try {
        await backend.value?.saveRemoteMasterSettings(toRemoteMasterSettings(nextSettings))
      } catch (error) {
        lastError.value = error instanceof Error ? error.message : 'Nie udało się utworzyć firmy.'
        throw error
      }
    }
    masterSettings.value = nextSettings
    persistMasterSettings()
    return true
  }

  async function removeCompanyOption(name: string) {
    const next = normalizeCompanyOptions(masterSettings.value.companyOptions.filter((entry) => entry !== name))
    await updateMasterSettings({ companyOptions: next })
    if (pendingCompanyName.value === name) {
      pendingCompanyName.value = next[0] ?? ''
    }
  }

  async function updateDeviceCompanyName(deviceId: string, companyName: string) {
    if (user.value?.role !== 'master') throw new Error('Tylko administrator może zmieniać firmę komputera.')
    const normalizedCompanyName = companyName.trim()
    await backend.value?.updateDeviceCompanyName(deviceId, normalizedCompanyName)
    devices.value = devices.value.map((device) => (
      device.deviceId === deviceId
        ? { ...device, companyName: normalizedCompanyName, updatedAt: Date.now() }
        : device
    ))
  }

  async function hashDwServiceCode(code: string) {
    const bytes = new TextEncoder().encode(code.trim())
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  }

  async function processDwServiceProvisioning(device: DeviceRecord) {
    const configuration = device.dwservice
    if (!configuration || device.approvalStatus !== 'approved' || offline.value || !isDesktopAgent.value
      || device.consent?.policyVersion !== CURRENT_CONSENT_POLICY_VERSION || !device.consent.dwServiceConsent) return

    try {
      const expectedHash = await hashDwServiceCode(configuration.installationCode)
      const state = await window.janek.dwServiceAgent.getState()
      localDwServiceState.value = state

      if (state.configurationId === configuration.configurationId && state.status !== 'unconfigured') {
        if (
          state.status !== configuration.status
          || (state.appliedCodeHash && state.appliedCodeHash !== configuration.appliedCodeHash)
          || state.error !== configuration.error
        ) {
          await backend.value?.updateDwServiceProvisioningState(
            device.deviceId,
            configuration.configurationId,
            state.status,
            state.appliedCodeHash,
            state.error
          ).catch(() => undefined)
        }
        if (state.status === 'ready' && state.appliedCodeHash === expectedHash) return
        if (state.status === 'pending' || state.status === 'installing') return
      }

      if (state.status === 'ready' && state.appliedCodeHash === expectedHash) {
        await backend.value?.updateDwServiceProvisioningState(device.deviceId, configuration.configurationId, 'ready', expectedHash, null).catch(() => undefined)
        return
      }
      if (handledDwServiceConfigurations.has(configuration.configurationId)) return
      handledDwServiceConfigurations.add(configuration.configurationId)

      await backend.value?.updateDwServiceProvisioningState(device.deviceId, configuration.configurationId, 'installing', undefined, null).catch(() => undefined)
      const firebaseProjectId = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim()
      if (!firebaseProjectId) throw new Error('Brakuje identyfikatora projektu Firebase do weryfikacji kodu DWService.')
      const firebaseIdToken = await backend.value!.getFirebaseIdToken()
      const nextState = await window.janek.dwServiceAgent.applyCode(
        configuration.installationCode,
        configuration.configurationId,
        { deviceId: device.deviceId, firebaseIdToken, firebaseProjectId }
      )
      localDwServiceState.value = nextState
      await backend.value?.updateDwServiceProvisioningState(
        device.deviceId,
        configuration.configurationId,
        nextState.status,
        nextState.appliedCodeHash,
        nextState.error
      ).catch(() => undefined)
      if (nextState.status === 'ready') void notifyUser('i-JANEK', 'Zdalny dostęp DWService został skonfigurowany.')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nie udało się skonfigurować DWService.'
      localDwServiceState.value = { status: 'error', configurationId: configuration.configurationId, error: message, updatedAt: Date.now() }
      await backend.value?.updateDwServiceProvisioningState(device.deviceId, configuration.configurationId, 'error', undefined, message).catch(() => undefined)
      void notifyUser('i-JANEK', 'Nie udało się skonfigurować zdalnego dostępu. Aplikacja spróbuje ponownie po ponownym uruchomieniu.')
    }
  }

  function updateSlaveSettings(next: Partial<SlaveSettings>) {
    slaveSettings.value = normalizeSlaveSettings({
      ...slaveSettings.value,
      ...next
    })
    persistSlaveSettings()
    if (Object.prototype.hasOwnProperty.call(next, 'muteAllNotifications')) {
      void window.janek.system.setNotificationsEnabled(!slaveSettings.value.muteAllNotifications)
    }
  }

  async function toggleAutostart(enabled: boolean) {
    slaveSettings.value.autostart = enabled
    persistSlaveSettings()
    await window.janek.system.setAutoLaunch(enabled)
  }

  async function loadInventory(deviceId = selectedDeviceId.value) {
    const device = devices.value.find((entry) => entry.deviceId === deviceId)
    if (!device || !backend.value) return null

    loadingInventory.value = true
    try {
      const report = await backend.value.getInventory(device)
      if (report) {
        inventory.value = { ...inventory.value, [device.deviceId]: report }
      } else {
        const nextInventory = { ...inventory.value }
        delete nextInventory[device.deviceId]
        inventory.value = nextInventory
      }
      return report
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Nie udało się pobrać raportu inwentaryzacji.'
      return null
    } finally {
      loadingInventory.value = false
    }
  }

  async function removeAlertById(alertId: string) {
    if (!alertId) return
    await backend.value?.removeAlert(alertId)
  }

  async function runReadinessChecks() {
    if (readinessRunning.value) return
    readinessRunning.value = true
    const checks: ReadinessCheckResult[] = []
    try {
      checks.push({
        id: 'runtime',
        label: 'Środowisko aplikacji',
        status: systemContext.value ? 'ok' : 'error',
        message: systemContext.value
          ? `${systemContext.value.platform}/${systemContext.value.arch}, wersja ${systemContext.value.appVersion}`
          : 'Brak kontekstu systemowego.'
      })
      checks.push({
        id: 'network',
        label: 'Połączenie z siecią',
        status: offline.value ? 'error' : 'ok',
        message: offline.value ? 'Brak połączenia — dane trafią do kolejki offline.' : 'Urządzenie jest online.'
      })
      checks.push({
        id: 'firebase-session',
        label: 'Sesja Firebase',
        status: user.value ? 'ok' : 'error',
        message: user.value ? `Zalogowano jako ${user.value.role}.` : 'Użytkownik nie jest zalogowany.'
      })
      if (user.value && backend.value && !offline.value) {
        try {
          await backend.value.healthCheck()
          checks.push({ id: 'firestore', label: 'Dostęp do Firestore', status: 'ok', message: 'Odczyt kontrolny zakończony poprawnie.' })
        } catch (error) {
          checks.push({
            id: 'firestore',
            label: 'Dostęp do Firestore',
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      } else {
        checks.push({
          id: 'firestore',
          label: 'Dostęp do Firestore',
          status: 'skipped',
          message: offline.value ? 'Test odłożony do powrotu sieci.' : 'Zaloguj się, aby wykonać test.'
        })
      }
      checks.push({
        id: 'device-approval',
        label: 'Rejestracja urządzenia',
        status: user.value?.role === 'master' || selfDevice.value?.approvalStatus === 'approved' ? 'ok' : 'warning',
        message:
          user.value?.role === 'master'
            ? 'Konto Master nie wymaga akceptacji urządzenia.'
            : selfDevice.value
              ? `Status: ${selfDevice.value.approvalStatus}.`
              : 'Urządzenie nie jest jeszcze zarejestrowane.'
      })
      checks.push({
        id: 'offline-queue',
        label: 'Kolejka synchronizacji',
        status: offlineQueueCount.value ? 'warning' : 'ok',
        message: offlineQueueCount.value
          ? `Oczekujące operacje: ${offlineQueueCount.value}.`
          : 'Brak oczekujących operacji.'
      })

      if (user.value?.role === 'slave' && isDesktopAgent.value) {
        try {
          const state = await window.janek.dwServiceAgent.getState()
          localDwServiceState.value = state
          checks.push({
            id: 'dwservice',
            label: 'Zdalny dostęp',
            status: state.status === 'ready' ? 'ok' : state.status === 'error' ? 'error' : 'warning',
            message: state.status === 'ready'
              ? 'Agent DWService jest skonfigurowany.'
              : state.error || `Status konfiguracji: ${state.status}.`
          })
        } catch (error) {
          checks.push({ id: 'dwservice', label: 'Zdalny dostęp', status: 'error', message: String(error) })
        }
      } else {
        checks.push({ id: 'dwservice', label: 'Zdalny dostęp', status: 'skipped', message: 'Test dotyczy urządzenia klienta.' })
      }

      if (systemContext.value?.platform === 'web') {
        checks.push({ id: 'updates', label: 'Aktualizacje', status: 'skipped', message: 'Panel webowy aktualizuje się automatycznie.' })
      } else {
        try {
          const update = await window.janek.system.checkForUpdates(true)
          checks.push({
            id: 'updates',
            label: 'Kanał aktualizacji',
            status: update.status === 'error' ? 'error' : update.status === 'skipped' ? 'warning' : 'ok',
            message: update.message
          })
        } catch (error) {
          checks.push({
            id: 'updates',
            label: 'Kanał aktualizacji',
            status: 'error',
            message: error instanceof Error ? error.message : String(error)
          })
        }
      }
      readinessChecks.value = checks
      void window.janek.system.logEvent('info', 'readiness_check_completed', {
        checks: checks.map(({ id, status }) => ({ id, status }))
      })
    } finally {
      readinessRunning.value = false
    }
  }

  async function sendDiagnosticsLogs() {
    if (!readinessChecks.value.length) await runReadinessChecks()
    const result = await window.janek.system.createDiagnosticBundle({
      readiness: cloneForIpc(readinessChecks.value),
      offlineQueueCount: offlineQueueCount.value,
      signedIn: Boolean(user.value),
      role: user.value?.role,
      deviceApproval: approvalGateStatus.value
    })
    if (result.saved) {
      await notifyUser('i-JANEK', 'Bezpieczna paczka diagnostyczna została zapisana.')
    }
  }

  async function requestRemoteNotification() {
    const device = selectedDevice.value
    if (!device || !user.value || !pendingRemoteNotification.value.trim()) return

    const request: RemoteActionRequest = {
      id: crypto.randomUUID(),
      type: 'notify',
      requestedAt: Date.now(),
      requestedBy: user.value.email,
      title: 'i-JANEK • wiadomość serwisowa',
      message: pendingRemoteNotification.value.trim()
    }

    await backend.value?.requestRemoteAction(device.deviceId, request)
    pendingRemoteNotification.value = ''
  }

  async function requestRestartPrompt() {
    const device = selectedDevice.value
    if (!device || !user.value) return

    const request: RemoteActionRequest = {
      id: crypto.randomUUID(),
      type: 'restart_prompt',
      requestedAt: Date.now(),
      requestedBy: user.value.email,
      title: 'i-JANEK • wymagany restart',
      message: 'Administrator zasugerował restart komputera po zakończeniu prac serwisowych. Możesz wykonać go teraz albo przypomnieć sobie za 30 minut.',
      remindAfterMinutes: DEFAULT_REMOTE_RESTART_REMINDER_MIN
    }

    await backend.value?.requestRemoteAction(device.deviceId, request)
  }

  async function requestSelectedDeviceUpdate() {
    const device = selectedDevice.value
    if (!device || !user.value) return
    await backend.value?.requestDeviceUpdate(device.deviceId, user.value.email)
    await notifyUser('i-JANEK', `Wysłano prośbę o aktualizację dla ${device.deviceAlias ?? device.hostname}.`)
  }

  async function updateDeviceUpdateChannel(deviceId: string, updateChannel: 'test' | 'beta' | 'stable') {
    if (!user.value || user.value.role !== 'master') return
    await backend.value?.updateDeviceUpdateChannel(deviceId, updateChannel)
    await notifyUser('i-JANEK', `Kanał aktualizacji urządzenia ustawiono na ${updateChannel}.`)
  }

  async function forceUpdateAllClients() {
    if (!user.value || user.value.role !== 'master') return
    let count = 0
    for (const device of devices.value) {
      await backend.value?.requestDeviceUpdate(device.deviceId, user.value.email)
      count += 1
    }
    await notifyUser('i-JANEK', `Wysłano sygnał aktualizacji do ${count} urządzeń.`)
  }

  async function startSlaveWorkers(device: DeviceRecord) {
    if (device.approvalStatus !== 'approved') {
      stopIntervals()
      workerDeviceId.value = ''
      return
    }

    if (workerDeviceId.value === device.deviceId) return

    stopIntervals()
    workerDeviceId.value = device.deviceId

    const telemetryMinutes = masterSettings.value.telemetryMode === 'aggressive' ? 10 : Number(import.meta.env.VITE_TELEMETRY_INTERVAL_MIN || DEFAULT_TELEMETRY_INTERVAL_MIN)
    const telemetryMs = telemetryMinutes * 60 * 1000
    intervalHandles.add(window.setInterval(() => void runHeartbeat(device), 2 * 60 * 1000))
    intervalHandles.add(window.setInterval(() => void runTelemetryCycle(device), telemetryMs))
    intervalHandles.add(window.setInterval(() => void runInventoryCycle(device), 7 * 24 * 60 * 60 * 1000))
    intervalHandles.add(window.setInterval(() => {
      if (selfDevice.value) void processDwServiceProvisioning(selfDevice.value)
    }, 60 * 1000))

    void runHeartbeat(device)
    void runTelemetryCycle(device).catch((error) => {
      void window.janek.system.logEvent('warning', 'telemetry_cycle_failed', {
        deviceId: device.deviceId,
        error: error instanceof Error ? error.message : String(error)
      })
    })

    const commandsCleanup = backend.value!.subscribePendingCommands(device, async (commands) => {
      for (const queued of commands) {
        if (!device.consent?.remoteCommandConsent) {
          await backend.value?.completeCommand(device, {
            ...queued,
            status: 'failed',
            error: 'Brak zgody właściciela urządzenia na zdalne polecenia.',
            finishedAt: Date.now()
          })
          continue
        }
        const result = await window.janek.terminal.execute(queued.shell, queued.command, queued.deviceId, queued.requestedBy)
        const completed = { ...queued, ...result, deviceId: device.deviceId }
        const current = commandHistory.value[device.deviceId] ?? []
        commandHistory.value[device.deviceId] = [completed, ...current].slice(0, 50)
        await backend.value?.completeCommand(device, completed)
      }
    })
    sessionCleanup.add(commandsCleanup)
  }

  async function runHeartbeat(device: DeviceRecord) {
    if (offline.value || workerDeviceId.value !== device.deviceId) return
    try {
      await backend.value?.publishHeartbeat(device)
    } catch (error) {
      void window.janek.system.logEvent('warning', 'heartbeat_publish_failed', {
        deviceId: device.deviceId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  async function runTelemetryCycle(device: DeviceRecord) {
    const telemetry = await window.janek.telemetry.collect()
    const evaluation = evaluateTelemetryState(telemetry)
    const normalizedTelemetry = { ...telemetry, state: evaluation.state }
    const usageDelta = buildUsageRollupDelta(device, normalizedTelemetry)
    if (usageDelta.observedSeconds > 0) {
      queueOfflineOperation({ kind: 'usage_rollup', deviceId: device.deviceId, payload: usageDelta })
    }
    if (offline.value) {
      queueOfflineOperation({ kind: 'telemetry', deviceId: device.deviceId, payload: normalizedTelemetry })
      return
    }
    try {
      await backend.value?.publishTelemetry(device, normalizedTelemetry)
    } catch (error) {
      queueOfflineOperation({ kind: 'telemetry', deviceId: device.deviceId, payload: normalizedTelemetry })
      void window.janek.system.logEvent('warning', 'telemetry_publish_failed', {
        deviceId: device.deviceId,
        error: error instanceof Error ? error.message : String(error)
      })
      return
    }
    await flushOfflineQueue()

    const temperatureCauses = evaluation.criticalCauses.filter((cause) => cause.key === 'cpuTemp' || cause.key === 'gpuTemp')
    const usageCauses = evaluation.criticalCauses.filter((cause) => cause.key !== 'cpuTemp' && cause.key !== 'gpuTemp')

    const criticalGroups: Array<{ type: AlertEvent['type']; title: string; key: string; causes: TelemetryAlertCause[] }> = [
      {
        type: 'temperature',
        title: `${device.hostname}: alert temperatury`,
        key: `${device.deviceId}:temperature`,
        causes: temperatureCauses
      },
      {
        type: 'usage',
        title: `${device.hostname}: alert zużycia`,
        key: `${device.deviceId}:usage`,
        causes: usageCauses
      }
    ]

    for (const group of criticalGroups) {
      const signature = group.causes.map((cause) => cause.key).sort().join('|')
      if (!signature) {
        if (telemetryAlertSignatures.has(group.key)) {
          await backend.value?.removeActiveAlerts(device.deviceId, [group.type])
        }
        telemetryAlertSignatures.delete(group.key)
        continue
      }

      if (telemetryAlertSignatures.get(group.key) === signature) continue

      await backend.value?.removeActiveAlerts(device.deviceId, [group.type])

      const details = group.causes
        .map((cause) => `${cause.label}: ${cause.value.toFixed(1)}${cause.unit} (limit ${cause.critical}${cause.unit})`)
        .join(', ')

      await backend.value?.pushAlert(device, {
        id: crypto.randomUUID(),
        deviceId: device.deviceId,
        type: group.type,
        title: group.title,
        message: `${details}. Odczyt wykonano o ${dayjs(telemetry.capturedAt).format('HH:mm')}.`,
        severity: 'critical',
        createdAt: Date.now()
      })
      telemetryAlertSignatures.set(group.key, signature)
    }
  }

  async function runInventoryCycle(device: DeviceRecord) {
    const report = await window.janek.telemetry.inventory()
    inventory.value[device.deviceId] = report
    if (offline.value) {
      queueOfflineOperation({ kind: 'inventory', deviceId: device.deviceId, payload: report })
      return
    }
    try {
      await backend.value?.publishInventory(device, report)
    } catch (error) {
      queueOfflineOperation({ kind: 'inventory', deviceId: device.deviceId, payload: report })
      void window.janek.system.logEvent('warning', 'inventory_publish_failed', {
        deviceId: device.deviceId,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  function buildUsageRollupDelta(device: DeviceRecord, telemetry: DeviceTelemetry): UsageRollupDelta {
    const key = `${TELEMETRY_SAMPLE_KEY}:${device.deviceId}`
    let previous: { capturedAt: number; uptimeSeconds: number } | null = null
    try {
      const raw = localStorage.getItem(key)
      previous = raw ? JSON.parse(raw) as { capturedAt: number; uptimeSeconds: number } : null
    } catch {
      previous = null
    }

    const telemetryMinutes = masterSettings.value.telemetryMode === 'aggressive'
      ? 10
      : Number(import.meta.env.VITE_TELEMETRY_INTERVAL_MIN || DEFAULT_TELEMETRY_INTERVAL_MIN)
    const maximumGapSeconds = Math.max(20 * 60, telemetryMinutes * 90)
    const wallSeconds = previous ? Math.floor((telemetry.capturedAt - previous.capturedAt) / 1000) : 0
    const uptimeSeconds = previous ? Math.floor(telemetry.uptimeSeconds - previous.uptimeSeconds) : 0
    const observedSeconds = previous && wallSeconds > 0 && uptimeSeconds > 0
      ? Math.max(0, Math.min(wallSeconds, uptimeSeconds, maximumGapSeconds))
      : 0

    try {
      localStorage.setItem(key, JSON.stringify({
        capturedAt: telemetry.capturedAt,
        uptimeSeconds: telemetry.uptimeSeconds
      }))
    } catch {
      // Brak pamięci lokalnej nie powinien zatrzymywać telemetrii.
    }

    const cpuAvailable = Number.isFinite(telemetry.cpuUsagePercent)
    const gpuValue = telemetry.gpu?.usagePercent
    const gpuAvailable = typeof gpuValue === 'number' && Number.isFinite(gpuValue)
    const ramAvailable = Number.isFinite(telemetry.memoryUsedPercent)
    const diskValues = telemetry.disks.map((entry) => entry.usedPercent).filter(Number.isFinite)
    const diskAvailable = diskValues.length > 0
    const diskValue = diskAvailable ? Math.max(...diskValues) : null
    const anyOver80 = telemetry.cpuUsagePercent > 80
      || (gpuAvailable && gpuValue > 80)
      || telemetry.memoryUsedPercent > 80
      || (diskValue !== null && diskValue > 80)

    return {
      dayKey: new Date(telemetry.capturedAt).toISOString().slice(0, 10),
      observedSeconds,
      cpuObservedSeconds: cpuAvailable ? observedSeconds : 0,
      cpuOver80Seconds: cpuAvailable && telemetry.cpuUsagePercent > 80 ? observedSeconds : 0,
      gpuObservedSeconds: gpuAvailable ? observedSeconds : 0,
      gpuOver80Seconds: gpuAvailable && gpuValue > 80 ? observedSeconds : 0,
      ramObservedSeconds: ramAvailable ? observedSeconds : 0,
      ramOver80Seconds: ramAvailable && telemetry.memoryUsedPercent > 80 ? observedSeconds : 0,
      diskObservedSeconds: diskAvailable ? observedSeconds : 0,
      diskOver80Seconds: diskValue !== null && diskValue > 80 ? observedSeconds : 0,
      anyOver80Seconds: anyOver80 ? observedSeconds : 0,
      restartCount: previous && telemetry.uptimeSeconds < previous.uptimeSeconds ? 1 : 0,
      sampleCount: 1
    }
  }

  async function processUpdateRequest(device: DeviceRecord) {
    const request = device.updateRequest
    if (!request) return
    if (request.id === device.lastHandledUpdateRequestId || handledUpdateRequests.has(request.id)) return
    handledUpdateRequests.add(request.id)

    const result = await window.janek.system.checkForUpdates(slaveSettings.value.silentUpdates)
    await backend.value?.acknowledgeDeviceUpdate(device.deviceId, request.id, result.message)
    await backend.value?.pushAlert(device, {
      id: crypto.randomUUID(),
      deviceId: device.deviceId,
      type: 'system',
      title: `${device.deviceAlias ?? device.hostname}: check aktualizacji`,
      message: `${result.message} (żądanie: ${request.requestedBy})`,
      severity: result.status === 'error' ? 'warning' : 'info',
      createdAt: Date.now()
    })
  }

  async function processRemoteAction(device: DeviceRecord) {
    const request = device.remoteActionRequest
    if (!request) return
    if (request.id === device.lastHandledRemoteActionRequestId || handledRemoteActionRequests.has(request.id)) return
    handledRemoteActionRequests.add(request.id)

    let resultMessage = 'Akcja nie została wykonana.'
    let severity: AlertEvent['severity'] = 'info'

    if (request.type === 'notify') {
      if (!slaveSettings.value.muteChatSounds) {
        const displayed = await notifyUser(request.title ?? 'i-JANEK', request.message)
        resultMessage = displayed ? 'Powiadomienie zostało wyświetlone użytkownikowi.' : 'Powiadomienia systemowe są wyłączone przez użytkownika.'
      } else {
        resultMessage = 'Powiadomienie o wiadomości zostało wyciszone przez użytkownika.'
      }
    }

    if (request.type === 'restart_prompt') {
      const result = await window.janek.system.promptRestart(
        request.title ?? 'i-JANEK • wymagany restart',
        request.message,
        request.remindAfterMinutes ?? DEFAULT_REMOTE_RESTART_REMINDER_MIN
      )
      resultMessage = result.message
      severity = result.status === 'dismissed' ? 'warning' : 'info'
    }

    await backend.value?.acknowledgeRemoteAction(device.deviceId, request.id, resultMessage)
    await backend.value?.pushAlert(device, {
      id: crypto.randomUUID(),
      deviceId: device.deviceId,
      type: 'system',
      title: `${device.deviceAlias ?? device.hostname}: akcja zdalna`,
      message: `${resultMessage} (żądanie: ${request.requestedBy})`,
      severity,
      createdAt: Date.now()
    })
  }

  function stopIntervals() {
    intervalHandles.forEach((handle) => window.clearInterval(handle))
    intervalHandles.clear()
  }

  function teardownSession() {
    stopIntervals()
    if (connectivityIntervalHandle !== null) {
      window.clearInterval(connectivityIntervalHandle)
      connectivityIntervalHandle = null
    }
    clearCompanyChatSubscriptions()
    clearCommandHistorySubscriptions()
    sessionCleanup.forEach((dispose) => dispose())
    sessionCleanup.clear()
  }

  return {
    ready,
    theme,
    systemContext,
    user,
    devices,
    alerts,
    usageHistory,
    companyChats,
    companyChatStates,
    chatMessageSendStates,
    inventory,
    commandHistory,
    localDwServiceState,
    selectedDeviceId,
    selectedConversationOwnerUid,
    selectedDevice,
    selectedConversationMessages,
    unreadCompanyChatCount,
    selfDevice,
    needsDeviceAlias,
    approvalQueue,
    criticalAlerts,
    offline,
    lastError,
    consent,
    pendingChatMessage,
    chatSendError,
    pendingRemoteNotification,
    pendingDeviceAlias,
    pendingCompanyName,
    pendingInstallationLocation,
    pendingTerminalCommand,
    signingIn,
    loadingInventory,
    loadingUsageHistory,
    readinessChecks,
    readinessRunning,
    offlineQueueCount,
    flushingOfflineQueue,
    masterSettings,
    slaveSettings,
    syncState,
    lastSyncAt,
    statusNow,
    sessionStatus,
    isMaster,
    isDesktopAgent,
    approvalGateStatus,
    isApprovalBlocked,
    applyTheme,
    updateMasterSettings,
    updateMetricThreshold,
    addCompanyOption,
    removeCompanyOption,
    updateDeviceCompanyName,
    updateSlaveSettings,
    toggleAutostart,
    bootstrap,
    signInWithEmail,
    registerWithEmail,
    getCurrentAccountDeviceCount,
    sendPasswordReset,
    signOut,
    deregisterAndSignOut,
    acceptConsent,
    approveDevice,
    sendChatMessage,
    retryChatMessage,
    setChatTyping,
    markChatRead,
    getChatMessageStatus,
    loadUsageHistory,
    queueTerminalCommand,
    saveDeviceDetails,
    archiveDevice,
    configureDwService,
    loadInventory,
    removeAlertById,
    sendDiagnosticsLogs,
    runReadinessChecks,
    flushOfflineQueue,
    requestRemoteNotification,
    requestRestartPrompt,
    requestSelectedDeviceUpdate,
    updateDeviceUpdateChannel,
    forceUpdateAllClients
  }
})
