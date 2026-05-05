import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import type {
  AlertEvent,
  AppUser,
  BackupPolicy,
  BackupRemoteFile,
  BackupSnapshot,
  CompanyChatMessage,
  ConsentRecord,
  DeviceRecord,
  InventoryReport,
  MetricThreshold,
  MetricThresholds,
  RemoteMasterSettings,
  RemoteActionRequest,
  TerminalCommand,
  TelemetryMode,
  DeviceTelemetry,
  ThemeMode
} from '@shared/contracts'
import {
  DEFAULT_ALERT_CPU_TEMP,
  DEFAULT_MASTER_EMAIL,
  DEFAULT_TELEMETRY_INTERVAL_MIN
} from '@shared/constants'
import { createBackendClient, type BackendClient } from '@/services/backend'

interface MasterSettings {
  thresholds: MetricThresholds
  telemetryMode: TelemetryMode
  aesKey: string
  glassIntensity: number
}

interface SlaveSettings {
  autostart: boolean
  silentUpdates: boolean
  muteChatSounds: boolean
  muteTempNotifications: boolean
  muteUsageNotifications: boolean
  hideAlertNotifications: boolean
  backupFolders: Array<'Desktop' | 'Documents'>
  customBackupFolders: string[]
  maxFileSizeMb: number
  maxQuotaGb: number
}

interface BackupRestoreResult {
  restoredFiles: number
  restoredBytes: number
  destinationPath: string
}

const MASTER_SETTINGS_KEY = 'i-janek-master-settings'
const SLAVE_SETTINGS_KEY = 'i-janek-slave-settings'
const DEFAULT_REMOTE_RESTART_REMINDER_MIN = 30
const FIXED_GLASS_INTENSITY = 70
const SUPPORTED_BACKUP_FOLDERS: Array<'Desktop' | 'Documents'> = ['Desktop', 'Documents']

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
    gpuTemp: { warning: 70, critical: 85 },
    backupAgeHours: { warning: 24, critical: 72 }
  }
}

function toRemoteMasterSettings(settings: MasterSettings): RemoteMasterSettings {
  return {
    thresholds: settings.thresholds,
    telemetryMode: settings.telemetryMode
  }
}

function normalizeSlaveSettings(settings: Partial<SlaveSettings>): SlaveSettings {
  const backupFolders = (settings.backupFolders ?? ['Desktop', 'Documents']).filter((entry): entry is 'Desktop' | 'Documents' =>
    SUPPORTED_BACKUP_FOLDERS.includes(entry as 'Desktop' | 'Documents')
  )

  return {
    autostart: settings.autostart ?? true,
    silentUpdates: settings.silentUpdates ?? true,
    muteChatSounds: settings.muteChatSounds ?? false,
    muteTempNotifications: settings.muteTempNotifications ?? false,
    muteUsageNotifications: settings.muteUsageNotifications ?? false,
    hideAlertNotifications: settings.hideAlertNotifications ?? false,
    backupFolders: backupFolders.length ? backupFolders : [...SUPPORTED_BACKUP_FOLDERS],
    customBackupFolders: settings.customBackupFolders ?? [],
    maxFileSizeMb: settings.maxFileSizeMb ?? 100,
    maxQuotaGb: settings.maxQuotaGb ?? 10
  }
}

export const useAppStore = defineStore('app', () => {
  const ready = ref(false)
  const theme = ref<ThemeMode>('dark')
  const backend = ref<BackendClient>()
  const systemContext = ref<Awaited<ReturnType<typeof window.janek.system.getContext>> | null>(null)
  const user = ref<AppUser | null>(null)
  const devices = ref<DeviceRecord[]>([])
  const alerts = ref<AlertEvent[]>([])
  const inventory = ref<Record<string, InventoryReport>>({})
  const companyChats = ref<Record<string, CompanyChatMessage[]>>({})
  const commandHistory = ref<Record<string, TerminalCommand[]>>({})
  const backupSnapshots = ref<Record<string, BackupSnapshot>>({})
  const backupFiles = ref<Record<string, BackupRemoteFile[]>>({})
  const selectedDeviceId = ref<string>('')
  const selectedConversationOwnerUid = ref<string>('')
  const offline = ref(!navigator.onLine)
  const lastError = ref<string>('')
  const consent = ref<ConsentRecord | null>(null)
  const pendingTerminalCommand = ref('')
  const pendingChatMessage = ref('')
  const pendingRemoteNotification = ref('')
  const pendingDeviceAlias = ref('')
  const signingIn = ref(false)
  const loadingBackupFiles = ref(false)
  const restoringBackup = ref(false)
  const lastBackupRestore = ref<BackupRestoreResult | null>(null)
  const masterSettings = ref<MasterSettings>({
    thresholds: createDefaultThresholds(),
    telemetryMode: 'standard',
    aesKey: 'i-JANEK123QWEasd',
    glassIntensity: FIXED_GLASS_INTENSITY
  })
  const slaveSettings = ref<SlaveSettings>({
    autostart: true,
    silentUpdates: true,
    muteChatSounds: false,
    muteTempNotifications: false,
    muteUsageNotifications: false,
    hideAlertNotifications: false,
    backupFolders: ['Desktop', 'Documents'],
    customBackupFolders: [],
    maxFileSizeMb: 100,
    maxQuotaGb: 10
  })
  const syncState = ref<'connected' | 'degraded' | 'offline'>('connected')
  const lastSyncAt = ref<number | null>(null)
  const rootCleanup = new Set<() => void>()
  const sessionCleanup = new Set<() => void>()
  const intervalHandles = new Set<number>()
  const handledUpdateRequests = new Set<string>()
  const handledRemoteActionRequests = new Set<string>()
  const companyChatCleanup = new Map<string, () => void>()
  const initializedCompanyChats = new Set<string>()
  const seenAlertIds = new Set<string>()
  let alertsSnapshotReady = false
  const telemetryAlertSignatures = new Map<string, string>()
  const workerDeviceId = ref('')

  const selectedDevice = computed(() => devices.value.find((device) => device.deviceId === selectedDeviceId.value) ?? null)
  const selectedConversationMessages = computed(() => companyChats.value[selectedConversationOwnerUid.value] ?? [])
  const selectedBackupFiles = computed(() => (selectedDevice.value ? backupFiles.value[selectedDevice.value.deviceId] ?? [] : []))
  const selfDevice = computed(() => {
    if (!user.value || user.value.role !== 'slave' || !systemContext.value) return null
    return devices.value.find((device) => device.deviceId === systemContext.value?.deviceId) ?? null
  })
  const needsDeviceAlias = computed(() => {
    if (!selfDevice.value) return false
    return !selfDevice.value.aliasCustomizedAt
  })
  const approvalQueue = computed(() => devices.value.filter((device) => device.approvalStatus === 'pending'))
  const criticalAlerts = computed(() => alerts.value.filter((alert) => alert.severity === 'critical'))
  const isMaster = computed(() => user.value?.email?.toLowerCase() === (import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL).toLowerCase())
  const isDemoMode = computed(() => backend.value?.isMock ?? true)
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
        const { aesKey: _ignoredAesKey, thresholds, ...safeMaster } = parsed
        masterSettings.value = {
          ...masterSettings.value,
          ...safeMaster,
          thresholds: {
            ...createDefaultThresholds(),
            ...thresholds,
            cpuUsage: { ...createDefaultThresholds().cpuUsage, ...thresholds?.cpuUsage },
            gpuUsage: { ...createDefaultThresholds().gpuUsage, ...thresholds?.gpuUsage },
            ramUsage: { ...createDefaultThresholds().ramUsage, ...thresholds?.ramUsage },
            diskUsage: { ...createDefaultThresholds().diskUsage, ...thresholds?.diskUsage },
            cpuTemp: { ...createDefaultThresholds().cpuTemp, ...thresholds?.cpuTemp },
            gpuTemp: { ...createDefaultThresholds().gpuTemp, ...thresholds?.gpuTemp },
            backupAgeHours: { ...createDefaultThresholds().backupAgeHours, ...thresholds?.backupAgeHours }
          }
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
    const { aesKey: _ignoredAesKey, ...safeMaster } = masterSettings.value
    localStorage.setItem(MASTER_SETTINGS_KEY, JSON.stringify(safeMaster))
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
      thresholds: {
        ...createDefaultThresholds(),
        ...masterSettings.value.thresholds,
        ...remoteSettings.thresholds,
        cpuUsage: {
          ...createDefaultThresholds().cpuUsage,
          ...masterSettings.value.thresholds.cpuUsage,
          ...remoteSettings.thresholds?.cpuUsage
        },
        gpuUsage: {
          ...createDefaultThresholds().gpuUsage,
          ...masterSettings.value.thresholds.gpuUsage,
          ...remoteSettings.thresholds?.gpuUsage
        },
        ramUsage: {
          ...createDefaultThresholds().ramUsage,
          ...masterSettings.value.thresholds.ramUsage,
          ...remoteSettings.thresholds?.ramUsage
        },
        diskUsage: {
          ...createDefaultThresholds().diskUsage,
          ...masterSettings.value.thresholds.diskUsage,
          ...remoteSettings.thresholds?.diskUsage
        },
        cpuTemp: {
          ...createDefaultThresholds().cpuTemp,
          ...masterSettings.value.thresholds.cpuTemp,
          ...remoteSettings.thresholds?.cpuTemp
        },
        gpuTemp: {
          ...createDefaultThresholds().gpuTemp,
          ...masterSettings.value.thresholds.gpuTemp,
          ...remoteSettings.thresholds?.gpuTemp
        },
        backupAgeHours: {
          ...createDefaultThresholds().backupAgeHours,
          ...masterSettings.value.thresholds.backupAgeHours,
          ...remoteSettings.thresholds?.backupAgeHours
        }
      }
    }
    masterSettings.value.glassIntensity = FIXED_GLASS_INTENSITY
    persistMasterSettings()
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

  function shouldShowAlertNotification(alert: AlertEvent, role: AppUser['role']) {
    if (role !== 'slave') return true
    if (slaveSettings.value.hideAlertNotifications) return false
    if (alert.type === 'temperature' && slaveSettings.value.muteTempNotifications) return false
    if ((alert.type === 'usage' || alert.type === 'disk') && slaveSettings.value.muteUsageNotifications) return false
    return true
  }

  function clearCompanyChatSubscriptions() {
    companyChatCleanup.forEach((dispose) => dispose())
    companyChatCleanup.clear()
  }

  function clearRootSubscriptions() {
    rootCleanup.forEach((dispose) => dispose())
    rootCleanup.clear()
  }

  function resetSessionState() {
    teardownSession()
    devices.value = []
    alerts.value = []
    inventory.value = {}
    companyChats.value = {}
    commandHistory.value = {}
    backupSnapshots.value = {}
    backupFiles.value = {}
    selectedDeviceId.value = ''
    selectedConversationOwnerUid.value = ''
    pendingDeviceAlias.value = ''
    workerDeviceId.value = ''
    handledUpdateRequests.clear()
    handledRemoteActionRequests.clear()
    initializedCompanyChats.clear()
    seenAlertIds.clear()
    alertsSnapshotReady = false
    telemetryAlertSignatures.clear()
    lastBackupRestore.value = null
  }

  function bindAuthListener() {
    clearRootSubscriptions()

    const authUnsubscribe = backend.value!.subscribeAuth(async (nextUser) => {
      user.value = nextUser
      if (!nextUser) {
        teardownSession()
        devices.value = []
        alerts.value = []
        companyChats.value = {}
        selectedConversationOwnerUid.value = ''
        pendingDeviceAlias.value = ''
        return
      }

      await handleSignedIn(nextUser)
    })
    rootCleanup.add(authUnsubscribe)
  }

  function syncCompanyChatSubscriptions(ownerUids: string[]) {
    const uniqueOwnerUids = [...new Set(ownerUids.filter(Boolean))]

    companyChatCleanup.forEach((dispose, ownerUid) => {
      if (uniqueOwnerUids.includes(ownerUid)) return
      dispose()
      companyChatCleanup.delete(ownerUid)
      delete companyChats.value[ownerUid]
      initializedCompanyChats.delete(ownerUid)
    })

    uniqueOwnerUids.forEach((ownerUid) => {
      if (companyChatCleanup.has(ownerUid)) return
      const cleanup = backend.value!.subscribeCompanyChats(ownerUid, (messages) => {
        const previousMessages = companyChats.value[ownerUid] ?? []
        const previousIds = new Set(previousMessages.map((entry) => entry.id))
        companyChats.value = {
          ...companyChats.value,
          [ownerUid]: messages
        }

        if (!initializedCompanyChats.has(ownerUid)) {
          messages.forEach((message) => previousIds.add(message.id))
          initializedCompanyChats.add(ownerUid)
          return
        }

        if (user.value?.role !== 'slave' || slaveSettings.value.muteChatSounds) return

        const incomingMessages = messages.filter((message) => !previousIds.has(message.id) && message.senderRole !== user.value?.role)
        for (const message of incomingMessages) {
          void window.janek.system.notify(
            `Wiadomość od ${message.senderEmail}`,
            message.body.length > 120 ? `${message.body.slice(0, 117)}...` : message.body
          )
        }
      })
      companyChatCleanup.set(ownerUid, cleanup)
    })
  }

  async function bootstrap() {
    backend.value = createBackendClient()
    systemContext.value = await window.janek.system.getContext()
    consent.value = await window.janek.system.getConsent()
    const persistedAesKey = await window.janek.system.getMasterAesKey()
    loadPersistedSettings()
    masterSettings.value = { ...masterSettings.value, aesKey: persistedAesKey }
    applyTheme('dark')
    syncState.value = offline.value ? 'offline' : isDemoMode.value ? 'degraded' : 'connected'
    lastSyncAt.value = Date.now()
    bindAuthListener()

    window.addEventListener('online', handleConnectivityChange)
    window.addEventListener('offline', handleConnectivityChange)
    ready.value = true
  }

  async function handleSignedIn(nextUser: AppUser) {
    teardownSession()
    devices.value = []
    alerts.value = []
    companyChats.value = {}
    commandHistory.value = {}
    selectedDeviceId.value = ''
    selectedConversationOwnerUid.value = ''
    workerDeviceId.value = ''
    handledUpdateRequests.clear()
    handledRemoteActionRequests.clear()
    initializedCompanyChats.clear()
    seenAlertIds.clear()
    alertsSnapshotReady = false
    telemetryAlertSignatures.clear()
    lastBackupRestore.value = null

    const masterSettingsCleanup = backend.value!.subscribeRemoteMasterSettings((remoteSettings) => {
      applyRemoteMasterSettings(remoteSettings)
    })
    sessionCleanup.add(masterSettingsCleanup)

    const deviceCleanup = backend.value!.subscribeDevices(nextUser, (nextDevices) => {
      devices.value = nextDevices
      lastSyncAt.value = Date.now()
      if (!selectedDeviceId.value && nextDevices.length) {
        selectedDeviceId.value = nextDevices[0].deviceId
      }
      if (!selectedConversationOwnerUid.value && nextDevices.length) {
        selectedConversationOwnerUid.value = nextDevices[0].ownerUid
      }
      if (selectedConversationOwnerUid.value && !nextDevices.some((entry) => entry.ownerUid === selectedConversationOwnerUid.value)) {
        selectedConversationOwnerUid.value = nextDevices[0]?.ownerUid ?? ''
      }
      syncCompanyChatSubscriptions(nextDevices.map((entry) => entry.ownerUid))
      if (nextUser.role === 'slave' && systemContext.value) {
        const selfDevice = nextDevices.find((entry) => entry.deviceId === systemContext.value?.deviceId)
        if (selfDevice) {
          if (!pendingDeviceAlias.value) {
            pendingDeviceAlias.value = selfDevice.deviceAlias ?? selfDevice.hostname
          }
          void backend.value?.setPresence(selfDevice, nextUser.role, true)
          void startSlaveWorkers(selfDevice)
          void processUpdateRequest(selfDevice)
          void processRemoteAction(selfDevice)
        }
      }
    })
    sessionCleanup.add(deviceCleanup)

    const alertsCleanup = backend.value!.subscribeAlerts(nextUser, (nextAlerts) => {
      const previousIds = new Set(seenAlertIds)
      alerts.value = nextAlerts
      lastSyncAt.value = Date.now()

      if (!alertsSnapshotReady) {
        nextAlerts.forEach((alert) => seenAlertIds.add(alert.id))
        alertsSnapshotReady = true
        return
      }

      const newCriticalAlerts = nextAlerts.filter((alert) => !previousIds.has(alert.id) && alert.severity === 'critical')
      nextAlerts.forEach((alert) => seenAlertIds.add(alert.id))

      if (!newCriticalAlerts.length) return

      for (const alert of newCriticalAlerts) {
        if (!shouldShowAlertNotification(alert, nextUser.role)) continue
        void window.janek.system.notify(alert.title, alert.message)
      }
    })
    sessionCleanup.add(alertsCleanup)

    if (nextUser.role === 'slave' && systemContext.value) {
      if (consent.value) {
        const ensured = await backend.value!.ensureDeviceRecord(nextUser, systemContext.value, consent.value)
        selectedDeviceId.value = ensured.deviceId
        selectedConversationOwnerUid.value = ensured.ownerUid
      }
    }
  }

  function handleConnectivityChange() {
    offline.value = !navigator.onLine
    syncState.value = offline.value ? 'offline' : isDemoMode.value ? 'degraded' : 'connected'
    if (!offline.value) {
      lastSyncAt.value = Date.now()
    }
  }

  async function signInWithGoogle() {
    if (signingIn.value) return
    try {
      signingIn.value = true
      lastError.value = ''
      const signedIn = await backend.value!.signInWithGoogle()
      user.value = signedIn
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Nie udało się zalogować przez Google.'
    } finally {
      signingIn.value = false
    }
  }

  async function signInDemo(role: 'master' | 'slave') {
    try {
      lastError.value = ''
      if (!backend.value?.isMock) {
        clearRootSubscriptions()
        backend.value = createBackendClient(true)
        resetSessionState()
      }
      const demoUser = await backend.value!.signInDemo(role)
      user.value = demoUser
      syncState.value = offline.value ? 'offline' : 'degraded'
      await handleSignedIn(demoUser)
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Nie udało się uruchomić trybu demo.'
    }
  }

  async function signOut() {
    stopIntervals()
    await backend.value?.signOut()
    clearRootSubscriptions()
    backend.value = createBackendClient()
    bindAuthListener()
    user.value = null
    resetSessionState()
  }

  async function acceptConsent() {
    consent.value = {
      acceptedAt: Date.now(),
      diagnosticsConsent: true,
      policyVersion: '2026-05-04'
    }
    await window.janek.system.setConsent(consent.value)

    if (user.value?.role === 'slave' && systemContext.value) {
      const ensured = await backend.value!.ensureDeviceRecord(user.value, systemContext.value, consent.value)
      selectedDeviceId.value = ensured.deviceId
      selectedConversationOwnerUid.value = ensured.ownerUid
    }
  }

  async function approveDevice(deviceId: string, approvalStatus: 'approved' | 'rejected') {
    await backend.value?.updateApprovalStatus(deviceId, approvalStatus, user.value?.email ?? DEFAULT_MASTER_EMAIL)
  }

  async function sendChatMessage(ownerUid = selectedConversationOwnerUid.value) {
    const device = selectedDevice.value
    if (!ownerUid || !user.value || !pendingChatMessage.value.trim()) return

    const ownerDevice = devices.value.find((entry) => entry.ownerUid === ownerUid) ?? device ?? selfDevice.value
    if (!ownerDevice) return

    const message: CompanyChatMessage = {
      id: crypto.randomUUID(),
      ownerUid,
      ownerEmail: ownerDevice.ownerEmail,
      senderRole: user.value.role,
      senderEmail: user.value.email,
      body: pendingChatMessage.value.trim(),
      createdAt: Date.now(),
      delivered: !offline.value,
      deviceId: user.value.role === 'slave' ? selfDevice.value?.deviceId : device?.deviceId,
      deviceLabel:
        user.value.role === 'slave'
          ? selfDevice.value?.deviceAlias ?? selfDevice.value?.hostname
          : device?.deviceAlias ?? device?.hostname
    }

    await backend.value?.sendCompanyChatMessage(ownerUid, message)
    pendingChatMessage.value = ''
  }

  async function queueTerminalCommand() {
    const device = selectedDevice.value
    if (!device || !user.value || !pendingTerminalCommand.value.trim()) return
    await backend.value?.queueCommand(device, {
      shell: 'powershell',
      command: pendingTerminalCommand.value.trim(),
      requestedBy: user.value.email
    })
    pendingTerminalCommand.value = ''
  }

  async function saveBackupPolicy(policy: BackupPolicy) {
    const device = selectedDevice.value
    if (!device) return
    await backend.value?.upsertBackupPolicy(device.deviceId, policy)
  }

  function updateMasterSettings(next: Partial<MasterSettings>) {
    masterSettings.value = {
      ...masterSettings.value,
      ...next,
      thresholds: next.thresholds
        ? {
            ...masterSettings.value.thresholds,
            ...next.thresholds
          }
        : masterSettings.value.thresholds,
      glassIntensity: FIXED_GLASS_INTENSITY
    }
    applyGlassIntensity(FIXED_GLASS_INTENSITY)
    persistMasterSettings()
    if (user.value?.role === 'master') {
      void backend.value?.saveRemoteMasterSettings(toRemoteMasterSettings(masterSettings.value))
    }
  }

  function updateMetricThreshold(metric: keyof MetricThresholds, kind: keyof MetricThreshold, value: number) {
    const current = masterSettings.value.thresholds[metric]
    const sanitized = Number.isFinite(value) ? Math.max(0, value) : current[kind]
    updateMasterSettings({
      thresholds: {
        ...masterSettings.value.thresholds,
        [metric]: {
          ...current,
          [kind]: sanitized
        }
      }
    })
  }

  async function updateMasterAesKey(nextKey: string) {
    const trimmed = nextKey.trim()
    if (!trimmed) return
    await window.janek.system.setMasterAesKey(trimmed)
    updateMasterSettings({ aesKey: trimmed })
  }

  async function applySlaveBackupSettings() {
    const device = selectedDevice.value
    if (!device) return
    const folderMap: Record<'Desktop' | 'Documents', string> = {
      Desktop: '%USERPROFILE%\\Desktop',
      Documents: '%USERPROFILE%\\Documents'
    }
    const selectedSystemFolders = slaveSettings.value.backupFolders.map((entry) => folderMap[entry])
    const watchedPaths = [...selectedSystemFolders, ...slaveSettings.value.customBackupFolders].filter(Boolean)

    const nextPolicy: BackupPolicy = {
      ...(device.backupPolicy ?? {
        enabled: true,
        driveFolderName: 'i-JANEK_Backup',
        sharedWith: import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL,
        syncUnderMb: 100,
        maxFileSizeMb: 100,
        maxQuotaGb: 10,
        watchedPaths: []
      }),
      maxFileSizeMb: slaveSettings.value.maxFileSizeMb,
      maxQuotaGb: slaveSettings.value.maxQuotaGb,
      watchedPaths
    }

    await backend.value?.upsertBackupPolicy(device.deviceId, nextPolicy)
    persistSlaveSettings()
  }

  async function saveDeviceAlias() {
    const alias = pendingDeviceAlias.value.trim()
    if (!alias || !selfDevice.value) return
    await backend.value?.updateDeviceAlias(selfDevice.value.deviceId, alias)
    pendingDeviceAlias.value = alias
  }

  function updateSlaveSettings(next: Partial<SlaveSettings>) {
    slaveSettings.value = normalizeSlaveSettings({
      ...slaveSettings.value,
      ...next
    })
    persistSlaveSettings()
  }

  async function toggleAutostart(enabled: boolean) {
    slaveSettings.value.autostart = enabled
    persistSlaveSettings()
    await window.janek.system.setAutoLaunch(enabled)
  }

  async function syncBackupNow() {
    const device = selectedDevice.value
    if (!device) return
    await runBackupCycle(device)
  }

  async function previewBackupFiles() {
    const device = selectedDevice.value
    if (!device?.backupPolicy || !user.value?.accessToken) {
      await window.janek.system.notify('i-JANEK', 'Brak aktywnego połączenia z backupem Google Drive.')
      return
    }

    loadingBackupFiles.value = true
    try {
      const files = await window.janek.backup.listFiles(device.backupPolicy, user.value.accessToken, device.hostname)
      backupFiles.value = {
        ...backupFiles.value,
        [device.deviceId]: files
      }
    } finally {
      loadingBackupFiles.value = false
    }
  }

  async function restoreBackupNow() {
    const device = selectedDevice.value
    if (!device?.backupPolicy || !user.value?.accessToken) {
      await window.janek.system.notify('i-JANEK', 'Nie udało się rozpocząć przywracania backupu.')
      return
    }

    restoringBackup.value = true
    try {
      const result = await window.janek.backup.restore(device.backupPolicy, user.value.accessToken, device.hostname)
      lastBackupRestore.value = result
      await window.janek.system.notify(
        'i-JANEK',
        result.restoredFiles
          ? `Przywrócono ${result.restoredFiles} plików do folderu ${result.destinationPath}.`
          : `Nie znaleziono plików backupu do przywrócenia w folderze ${result.destinationPath}.`
      )
    } finally {
      restoringBackup.value = false
    }
  }

  async function sendDiagnosticsLogs() {
    const device = selectedDevice.value
    if (!device || !user.value) return
    await runInventoryCycle(device)
    await backend.value?.pushAlert(device, {
      id: crypto.randomUUID(),
      deviceId: device.deviceId,
      type: 'system',
      title: `${device.hostname}: raport diagnostyczny`,
      message: `Wyslano reczny raport diagnostyczny przez ${user.value.email}.`,
      severity: 'info',
      createdAt: Date.now()
    })
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

  async function requestRustDeskLaunch() {
    const device = selectedDevice.value
    if (!device || !user.value) return

    const request: RemoteActionRequest = {
      id: crypto.randomUUID(),
      type: 'launch_rustdesk',
      requestedAt: Date.now(),
      requestedBy: user.value.email,
      title: 'i-JANEK • zdalny pulpit',
      message: 'Administrator wysłał sygnał uruchomienia RustDesk na tym urządzeniu.'
    }

    await backend.value?.requestRemoteAction(device.deviceId, request)
    await window.janek.system.notify('i-JANEK', `Wysłano sygnał uruchomienia RustDesk do ${device.deviceAlias ?? device.hostname}.`)
  }

  async function requestSelectedDeviceUpdate() {
    const device = selectedDevice.value
    if (!device || !user.value) return
    await backend.value?.requestDeviceUpdate(device.deviceId, user.value.email)
    await window.janek.system.notify('i-JANEK', `Wysłano prośbę o aktualizację dla ${device.deviceAlias ?? device.hostname}.`)
  }

  async function forceUpdateAllClients() {
    if (!user.value || user.value.role !== 'master') return
    let count = 0
    for (const device of devices.value) {
      await backend.value?.requestDeviceUpdate(device.deviceId, user.value.email)
      count += 1
    }
    await window.janek.system.notify('i-JANEK', `Wyslano sygnal aktualizacji do ${count} urzadzen.`)
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

    await runTelemetryCycle(device)
    const telemetryMinutes = masterSettings.value.telemetryMode === 'aggressive' ? 15 : Number(import.meta.env.VITE_TELEMETRY_INTERVAL_MIN || DEFAULT_TELEMETRY_INTERVAL_MIN)
    const telemetryMs = telemetryMinutes * 60 * 1000
    intervalHandles.add(window.setInterval(() => void runTelemetryCycle(device), telemetryMs))
    intervalHandles.add(window.setInterval(() => void runInventoryCycle(device), 7 * 24 * 60 * 60 * 1000))
    intervalHandles.add(window.setInterval(() => void runBackupCycle(device), 15 * 60 * 1000))

    const commandsCleanup = backend.value!.subscribePendingCommands(device, async (commands) => {
      for (const queued of commands) {
        const result = await window.janek.terminal.execute(queued.shell, queued.command)
        const completed = { ...queued, ...result, deviceId: device.deviceId }
        const current = commandHistory.value[device.deviceId] ?? []
        commandHistory.value[device.deviceId] = [completed, ...current].slice(0, 50)
        await backend.value?.completeCommand(device, completed)
      }
    })
    sessionCleanup.add(commandsCleanup)
  }

  async function runTelemetryCycle(device: DeviceRecord) {
    const telemetry = await window.janek.telemetry.collect()
    const evaluation = evaluateTelemetryState(telemetry)
    const normalizedTelemetry = { ...telemetry, state: evaluation.state }
    await backend.value?.publishTelemetry(device, normalizedTelemetry)

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
        telemetryAlertSignatures.delete(group.key)
        continue
      }

      if (telemetryAlertSignatures.get(group.key) === signature) continue

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
    await backend.value?.publishInventory(device, report)
  }

  async function runBackupCycle(device: DeviceRecord) {
    if (!device.backupPolicy?.enabled || !user.value?.accessToken) return
    const snapshot = await window.janek.backup.sync(device.backupPolicy, user.value.accessToken, device.deviceId, device.hostname)
    backupSnapshots.value[device.deviceId] = snapshot
    await backend.value?.publishBackupSnapshot(device, snapshot)
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
        await window.janek.system.notify(request.title ?? 'i-JANEK', request.message)
        resultMessage = 'Powiadomienie zostało wyświetlone użytkownikowi.'
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

    if (request.type === 'launch_rustdesk') {
      const state = await window.janek.rustdesk.launch()
      if (state.installed) {
        resultMessage = state.sessionHint ?? 'RustDesk został uruchomiony automatycznie po sygnale od Mastera.'
      } else {
        resultMessage = 'Nie udało się uruchomić RustDesk, ponieważ komponent nie jest zainstalowany.'
        severity = 'warning'
      }
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
    clearCompanyChatSubscriptions()
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
    companyChats,
    inventory,
    commandHistory,
    backupSnapshots,
    backupFiles,
    selectedDeviceId,
    selectedConversationOwnerUid,
    selectedDevice,
    selectedConversationMessages,
    selectedBackupFiles,
    selfDevice,
    needsDeviceAlias,
    approvalQueue,
    criticalAlerts,
    offline,
    lastError,
    consent,
    pendingChatMessage,
    pendingRemoteNotification,
    pendingDeviceAlias,
    pendingTerminalCommand,
    signingIn,
    loadingBackupFiles,
    restoringBackup,
    lastBackupRestore,
    masterSettings,
    slaveSettings,
    syncState,
    lastSyncAt,
    sessionStatus,
    isMaster,
    isDemoMode,
    applyTheme,
    updateMasterSettings,
    updateMetricThreshold,
    updateMasterAesKey,
    updateSlaveSettings,
    toggleAutostart,
    bootstrap,
    signInWithGoogle,
    signInDemo,
    signOut,
    acceptConsent,
    approveDevice,
    sendChatMessage,
    queueTerminalCommand,
    saveBackupPolicy,
    applySlaveBackupSettings,
    saveDeviceAlias,
    syncBackupNow,
    previewBackupFiles,
    restoreBackupNow,
    sendDiagnosticsLogs,
    requestRemoteNotification,
    requestRestartPrompt,
    requestRustDeskLaunch,
    requestSelectedDeviceUpdate,
    forceUpdateAllClients
  }
})
