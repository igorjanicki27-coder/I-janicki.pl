import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import dayjs from 'dayjs'
import type {
  AlertEvent,
  AppUser,
  BackupPolicy,
  BackupSnapshot,
  ChatMessage,
  ConsentRecord,
  DeviceRecord,
  InventoryReport,
  TerminalCommand,
  ThemeMode
} from '@shared/contracts'
import {
  DEFAULT_ALERT_INTERVAL_MIN,
  DEFAULT_ALERT_CPU_TEMP,
  DEFAULT_MASTER_EMAIL,
  DEFAULT_TELEMETRY_INTERVAL_MIN
} from '@shared/constants'
import { createBackendClient, type BackendClient } from '@/services/backend'

export const useAppStore = defineStore('app', () => {
  const ready = ref(false)
  const theme = ref<ThemeMode>('dark')
  const backend = ref<BackendClient>()
  const systemContext = ref<Awaited<ReturnType<typeof window.janek.system.getContext>> | null>(null)
  const user = ref<AppUser | null>(null)
  const devices = ref<DeviceRecord[]>([])
  const alerts = ref<AlertEvent[]>([])
  const inventory = ref<Record<string, InventoryReport>>({})
  const chats = ref<Record<string, ChatMessage[]>>({})
  const commandHistory = ref<Record<string, TerminalCommand[]>>({})
  const backupSnapshots = ref<Record<string, BackupSnapshot>>({})
  const selectedDeviceId = ref<string>('')
  const offline = ref(!navigator.onLine)
  const lastError = ref<string>('')
  const consent = ref<ConsentRecord | null>(null)
  const rustdeskBusy = ref(false)
  const pendingTerminalCommand = ref('')
  const pendingChatMessage = ref('')
  const rootCleanup = new Set<() => void>()
  const sessionCleanup = new Set<() => void>()
  const intervalHandles = new Set<number>()
  const workerDeviceId = ref('')
  let currentChatCleanup: (() => void) | null = null

  const selectedDevice = computed(() => devices.value.find((device) => device.deviceId === selectedDeviceId.value) ?? null)
  const approvalQueue = computed(() => devices.value.filter((device) => device.approvalStatus === 'pending'))
  const criticalAlerts = computed(() => alerts.value.filter((alert) => alert.severity === 'critical'))
  const isMaster = computed(() => user.value?.email?.toLowerCase() === (import.meta.env.VITE_MASTER_EMAIL || DEFAULT_MASTER_EMAIL).toLowerCase())
  const isDemoMode = computed(() => backend.value?.isMock ?? true)

  function applyTheme(nextTheme: ThemeMode) {
    theme.value = nextTheme
    document.documentElement.dataset.theme = nextTheme
  }

  async function bootstrap() {
    backend.value = createBackendClient()
    systemContext.value = await window.janek.system.getContext()
    applyTheme('dark')

    const authUnsubscribe = backend.value.subscribeAuth(async (nextUser) => {
      user.value = nextUser
      if (!nextUser) {
        teardownSession()
        devices.value = []
        alerts.value = []
        return
      }

      await handleSignedIn(nextUser)
    })
    rootCleanup.add(authUnsubscribe)

    window.addEventListener('online', handleConnectivityChange)
    window.addEventListener('offline', handleConnectivityChange)
    ready.value = true
  }

  async function handleSignedIn(nextUser: AppUser) {
    teardownSession()
    devices.value = []
    alerts.value = []
    chats.value = {}
    commandHistory.value = {}
    workerDeviceId.value = ''

    const deviceCleanup = backend.value!.subscribeDevices(nextUser, (nextDevices) => {
      devices.value = nextDevices
      if (!selectedDeviceId.value && nextDevices.length) {
        selectedDeviceId.value = nextDevices[0].deviceId
      }
      if (nextUser.role === 'slave' && systemContext.value) {
        const selfDevice = nextDevices.find((entry) => entry.deviceId === systemContext.value?.deviceId)
        if (selfDevice) {
          void backend.value?.setPresence(selfDevice, nextUser.role, true)
          void startSlaveWorkers(selfDevice)
        }
      }
    })
    sessionCleanup.add(deviceCleanup)

    const alertsCleanup = backend.value!.subscribeAlerts(nextUser, (nextAlerts) => {
      alerts.value = nextAlerts
      const newest = nextAlerts[0]
      if (nextUser.role === 'master' && newest?.severity === 'critical') {
        void window.janek.system.notify(newest.title, newest.message)
      }
    })
    sessionCleanup.add(alertsCleanup)

    if (nextUser.role === 'slave' && systemContext.value) {
      if (consent.value) {
        const ensured = await backend.value!.ensureDeviceRecord(nextUser, systemContext.value, consent.value)
        selectedDeviceId.value = ensured.deviceId
      }
    }

    const stopSelectedWatch = watch(
      selectedDevice,
      (device, previous) => {
        if (!device || device.deviceId === previous?.deviceId) return

        currentChatCleanup?.()
        const chatCleanup = backend.value!.subscribeChats(device, (messages) => {
          chats.value[device.deviceId] = messages
        })
        currentChatCleanup = chatCleanup
        sessionCleanup.add(chatCleanup)
      },
      { immediate: true }
    )
    sessionCleanup.add(stopSelectedWatch)
  }

  function handleConnectivityChange() {
    offline.value = !navigator.onLine
  }

  async function signInWithGoogle() {
    try {
      lastError.value = ''
      const signedIn = await backend.value!.signInWithGoogle()
      user.value = signedIn
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Nie udało się zalogować przez Google.'
    }
  }

  async function signInDemo(role: 'master' | 'slave') {
    user.value = await backend.value!.signInDemo(role)
  }

  async function signOut() {
    stopIntervals()
    await backend.value?.signOut()
  }

  async function acceptConsent() {
    consent.value = {
      acceptedAt: Date.now(),
      diagnosticsConsent: true,
      policyVersion: '2026-05-04'
    }

    if (user.value?.role === 'slave' && systemContext.value) {
      const ensured = await backend.value!.ensureDeviceRecord(user.value, systemContext.value, consent.value)
      selectedDeviceId.value = ensured.deviceId
    }
  }

  async function approveDevice(deviceId: string, approvalStatus: 'approved' | 'rejected') {
    await backend.value?.updateApprovalStatus(deviceId, approvalStatus, user.value?.email ?? DEFAULT_MASTER_EMAIL)
  }

  async function sendChatMessage() {
    const device = selectedDevice.value
    if (!device || !user.value || !pendingChatMessage.value.trim()) return

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      deviceId: device.deviceId,
      senderRole: user.value.role,
      senderEmail: user.value.email,
      body: pendingChatMessage.value.trim(),
      createdAt: Date.now(),
      delivered: !offline.value
    }

    await backend.value?.sendChatMessage(device, message)
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

  async function launchRustDesk() {
    rustdeskBusy.value = true
    try {
      await window.janek.rustdesk.launch()
    } finally {
      rustdeskBusy.value = false
    }
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
    const telemetryMs = Number(import.meta.env.VITE_TELEMETRY_INTERVAL_MIN || DEFAULT_TELEMETRY_INTERVAL_MIN) * 60 * 1000
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
    await backend.value?.publishTelemetry(device, telemetry)

    if ((telemetry.cpuTemperatureC ?? 0) >= Number(import.meta.env.VITE_ALERT_CPU_TEMP || DEFAULT_ALERT_CPU_TEMP)) {
      await backend.value?.pushAlert(device, {
        id: crypto.randomUUID(),
        deviceId: device.deviceId,
        type: 'temperature',
        title: `${device.hostname}: CPU > 90°C`,
        message: `Alert aktywny od ${dayjs(telemetry.capturedAt).format('HH:mm')}. Kolejny odczyt za ${import.meta.env.VITE_ALERT_INTERVAL_MIN || DEFAULT_ALERT_INTERVAL_MIN} min.`,
        severity: 'critical',
        createdAt: Date.now()
      })
    }
  }

  async function runInventoryCycle(device: DeviceRecord) {
    const report = await window.janek.telemetry.inventory()
    inventory.value[device.deviceId] = report
    await backend.value?.publishInventory(device, report)
  }

  async function runBackupCycle(device: DeviceRecord) {
    if (!device.backupPolicy?.enabled || !user.value?.accessToken) return
    const snapshot = await window.janek.backup.sync(device.backupPolicy, user.value.accessToken, device.deviceId)
    backupSnapshots.value[device.deviceId] = snapshot
    await backend.value?.publishBackupSnapshot(device, snapshot)
  }

  function stopIntervals() {
    intervalHandles.forEach((handle) => window.clearInterval(handle))
    intervalHandles.clear()
  }

  function teardownSession() {
    stopIntervals()
    currentChatCleanup?.()
    currentChatCleanup = null
    sessionCleanup.forEach((dispose) => dispose())
    sessionCleanup.clear()
  }

  return {
    ready,
    theme,
    user,
    devices,
    alerts,
    chats,
    inventory,
    commandHistory,
    backupSnapshots,
    selectedDeviceId,
    selectedDevice,
    approvalQueue,
    criticalAlerts,
    offline,
    lastError,
    consent,
    pendingChatMessage,
    pendingTerminalCommand,
    rustdeskBusy,
    isMaster,
    isDemoMode,
    applyTheme,
    bootstrap,
    signInWithGoogle,
    signInDemo,
    signOut,
    acceptConsent,
    approveDevice,
    sendChatMessage,
    queueTerminalCommand,
    saveBackupPolicy,
    launchRustDesk
  }
})
