<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  CloudCog,
  Cpu,
  HardDrive,
  KeyRound,
  LaptopMinimalCheck,
  MemoryStick,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  ShieldAlert,
  TerminalSquare,
  Thermometer,
  Workflow
} from 'lucide-vue-next'
import DeviceTile from '@/components/DeviceTile.vue'
import StatusPill from '@/components/StatusPill.vue'
import { buildConversationTimeline } from '@/services/chat'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { CompanyChatMessage, DeviceRecord, ServiceRequestPriority, ServiceRequestStatus, UpdateChannel } from '@shared/contracts'

const CHAT_READS_KEY = 'i-janek-master-chat-reads'
const tabs = ['overview', 'terminal', 'backup', 'inventory'] as const

const store = useAppStore()
const activeTab = ref<(typeof tabs)[number]>('overview')
const chatReads = ref<Record<string, number>>({})

interface CompanyConversationEntry {
  key: string
  ownerUid: string
  ownerEmail: string
  companyName: string
  devices: DeviceRecord[]
  latestMessageAt: number
  isPlaceholder: boolean
}

const groupedCompanies = computed<CompanyConversationEntry[]>(() => {
  const grouped = new Map<string, CompanyConversationEntry>()

  for (const device of store.devices) {
    const companyName = device.companyName?.trim() || getCompanyLabel(device.ownerEmail)
    const existing = grouped.get(device.ownerUid)
    const latestMessageAt = (store.companyChats[device.ownerUid] ?? []).at(-1)?.createdAt ?? 0
    if (existing) {
      existing.devices.push(device)
      existing.companyName = companyName || existing.companyName
      existing.latestMessageAt = Math.max(existing.latestMessageAt, latestMessageAt)
      continue
    }
    grouped.set(device.ownerUid, {
      key: device.ownerUid,
      ownerUid: device.ownerUid,
      ownerEmail: device.ownerEmail,
      companyName,
      devices: [device],
      latestMessageAt,
      isPlaceholder: false
    })
  }

  const normalizedExistingNames = new Set([...grouped.values()].map((entry) => entry.companyName.trim().toLowerCase()).filter(Boolean))

  for (const companyName of store.masterSettings.companyOptions) {
    const trimmed = companyName.trim()
    if (!trimmed) continue
    if (normalizedExistingNames.has(trimmed.toLowerCase())) continue
    const virtualOwnerUid = `virtual:${trimmed}`
    grouped.set(virtualOwnerUid, {
      key: virtualOwnerUid,
      ownerUid: virtualOwnerUid,
      ownerEmail: '',
      companyName: trimmed,
      devices: [],
      latestMessageAt: 0,
      isPlaceholder: true
    })
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.isPlaceholder !== right.isPlaceholder) return left.isPlaceholder ? 1 : -1
    return (
      right.latestMessageAt - left.latestMessageAt ||
      right.devices.length - left.devices.length ||
      left.companyName.localeCompare(right.companyName, 'pl')
    )
  })
})

const selectedAlerts = computed(() => {
  if (!store.selectedDevice) return []
  return store.alerts.filter((alert) => alert.deviceId === store.selectedDevice?.deviceId).slice(0, 4)
})
const selectedBackupProgress = computed(() => {
  if (!store.selectedDevice) return null
  return store.selectedDevice.backupSyncProgress ?? store.backupSyncProgress[store.selectedDevice.deviceId] ?? null
})
const selectedBackupProgressPercent = computed(() => {
  const total = selectedBackupProgress.value?.totalFiles ?? 0
  if (!total) return 0
  return Math.min(100, (selectedBackupProgress.value!.processedFiles / total) * 100)
})

const activeCompany = computed(
  () => groupedCompanies.value.find((entry) => entry.ownerUid === store.selectedConversationOwnerUid) ?? groupedCompanies.value[0] ?? null
)
const conversationTimeline = computed(() => buildConversationTimeline(activeCompany.value ? store.selectedConversationMessages : []))
const canSendMessageToActiveCompany = computed(() => Boolean(activeCompany.value && !activeCompany.value.isPlaceholder))
const orderedDevices = computed(() =>
  [...store.devices].sort((left, right) => devicePriorityScore(right) - devicePriorityScore(left) || right.updatedAt - left.updatedAt)
)
const selectedRemoteAccess = computed(() => {
  const deviceId = store.selectedDevice?.deviceId
  return deviceId ? store.revealedRemoteAccess[deviceId] ?? null : null
})

function changeSelectedDeviceUpdateChannel(event: Event) {
  const deviceId = store.selectedDevice?.deviceId
  if (!deviceId) return
  const updateChannel = (event.target as HTMLSelectElement).value as UpdateChannel
  void store.updateDeviceUpdateChannel(deviceId, updateChannel)
}
const selectedInventory = computed(() => {
  const deviceId = store.selectedDevice?.deviceId
  return deviceId ? store.inventory[deviceId] ?? null : null
})
const remoteAccessMessage = ref('')
const revealingRemoteAccess = ref(false)
const serviceRequestsOpen = ref(false)
const serviceRequestError = ref('')
const serviceRequestCommentDrafts = ref<Record<string, string>>({})
const serviceRequestCommentBusyId = ref('')
const usageRangeDays = ref<7 | 30 | 90>(30)
const orderedServiceRequests = computed(() => [...store.serviceRequests].sort((left, right) => right.createdAt - left.createdAt))
const resolvedServiceRequestsCount = computed(() => store.serviceRequests.filter((request) => request.status === 'resolved').length)
const selectedUsageRows = computed(() => {
  const deviceId = store.selectedDevice?.deviceId
  return deviceId ? store.usageHistory[deviceId] ?? [] : []
})
const usageSummary = computed(() => selectedUsageRows.value.reduce((summary, row) => ({
  observedSeconds: summary.observedSeconds + row.observedSeconds,
  cpuObservedSeconds: summary.cpuObservedSeconds + row.cpuObservedSeconds,
  cpuOver80Seconds: summary.cpuOver80Seconds + row.cpuOver80Seconds,
  gpuObservedSeconds: summary.gpuObservedSeconds + row.gpuObservedSeconds,
  gpuOver80Seconds: summary.gpuOver80Seconds + row.gpuOver80Seconds,
  ramObservedSeconds: summary.ramObservedSeconds + row.ramObservedSeconds,
  ramOver80Seconds: summary.ramOver80Seconds + row.ramOver80Seconds,
  diskObservedSeconds: summary.diskObservedSeconds + row.diskObservedSeconds,
  diskOver80Seconds: summary.diskOver80Seconds + row.diskOver80Seconds,
  anyOver80Seconds: summary.anyOver80Seconds + row.anyOver80Seconds,
  restartCount: summary.restartCount + row.restartCount,
  sampleCount: summary.sampleCount + row.sampleCount
}), {
  observedSeconds: 0,
  cpuObservedSeconds: 0,
  cpuOver80Seconds: 0,
  gpuObservedSeconds: 0,
  gpuOver80Seconds: 0,
  ramObservedSeconds: 0,
  ramOver80Seconds: 0,
  diskObservedSeconds: 0,
  diskOver80Seconds: 0,
  anyOver80Seconds: 0,
  restartCount: 0,
  sampleCount: 0
}))
const overloadDaysCount = computed(() => selectedUsageRows.value.filter((row) => row.anyOver80Seconds > 0).length)
const dailyUsageTrend = computed(() => selectedUsageRows.value.map((row) => ({
  dayKey: row.dayKey,
  ratio: row.observedSeconds ? Math.min(1, row.anyOver80Seconds / row.observedSeconds) : 0,
  overSeconds: row.anyOver80Seconds,
  observedSeconds: row.observedSeconds
})))
const usageMetrics = computed(() => [
  { label: 'CPU > 80%', observed: usageSummary.value.cpuObservedSeconds, over: usageSummary.value.cpuOver80Seconds },
  { label: 'GPU > 80%', observed: usageSummary.value.gpuObservedSeconds, over: usageSummary.value.gpuOver80Seconds },
  { label: 'RAM > 80%', observed: usageSummary.value.ramObservedSeconds, over: usageSummary.value.ramOver80Seconds },
  { label: 'Dysk > 80%', observed: usageSummary.value.diskObservedSeconds, over: usageSummary.value.diskOver80Seconds }
])

watch(
  () => groupedCompanies.value.map((entry) => entry.key).join('|'),
  () => {
    if (store.selectedConversationOwnerUid && groupedCompanies.value.some((entry) => entry.ownerUid === store.selectedConversationOwnerUid)) {
      return
    }
    store.selectedConversationOwnerUid = groupedCompanies.value[0]?.ownerUid ?? ''
  },
  { immediate: true }
)

watch(
  () => store.selectedConversationOwnerUid,
  (ownerUid) => {
    if (!ownerUid) return
    chatReads.value = { ...chatReads.value, [ownerUid]: Date.now() }
    localStorage.setItem(CHAT_READS_KEY, JSON.stringify(chatReads.value))
  }
)

watch(
  [activeTab, () => store.selectedDeviceId],
  ([tab, deviceId]) => {
    if (tab === 'inventory' && deviceId) void store.loadInventory(deviceId)
  },
  { immediate: true }
)

watch(
  [() => store.selectedDeviceId, usageRangeDays],
  ([deviceId, days]) => {
    if (deviceId) void store.loadUsageHistory(deviceId, days)
  },
  { immediate: true }
)

watch(
  () => store.selectedConversationMessages.length,
  () => {
    if (!store.selectedConversationOwnerUid) return
    chatReads.value = { ...chatReads.value, [store.selectedConversationOwnerUid]: Date.now() }
    localStorage.setItem(CHAT_READS_KEY, JSON.stringify(chatReads.value))
  }
)

try {
  const stored = localStorage.getItem(CHAT_READS_KEY)
  if (stored) chatReads.value = JSON.parse(stored) as Record<string, number>
} catch {
  chatReads.value = {}
}

function getCompanyLabel(email: string) {
  const [localPart] = email.split('@')
  return localPart.replace(/[._-]+/g, ' ').trim() || email
}

function getDeviceAlertCount(deviceId: string) {
  return store.alerts.filter((alert) => alert.deviceId === deviceId && alert.severity !== 'info').length
}

function isDeviceOnline(device: DeviceRecord) {
  return !device.offline && Date.now() - device.lastSeenAt < 5 * 60 * 1000
}

function healthSeverity(device: DeviceRecord) {
  if (device.telemetry?.state === 'alert') return 2
  if (device.telemetry?.state === 'warning') return 1
  return 0
}

function devicePriorityScore(device: DeviceRecord) {
  const onlineScore = isDeviceOnline(device) ? 1000 : 0
  const alertScore = Math.min(getDeviceAlertCount(device.deviceId), 9) * 100
  const healthScore = healthSeverity(device) * 10
  return onlineScore + alertScore + healthScore
}

function unreadCount(company: CompanyConversationEntry) {
  if (company.isPlaceholder) return 0
  const messages = store.companyChats[company.ownerUid] ?? []
  const lastRead = chatReads.value[company.ownerUid] ?? 0
  return messages.filter((message) => message.senderRole === 'slave' && message.createdAt > lastRead).length
}

function isCompanyActive(company: CompanyConversationEntry) {
  return company.devices.some((device) => isDeviceOnline(device))
}

function selectDevice(deviceId: string, ownerUid: string) {
  store.selectedDeviceId = deviceId
  store.selectedConversationOwnerUid = ownerUid
  activeTab.value = 'overview'
  remoteAccessMessage.value = ''
}

async function revealRemoteAccess() {
  const device = store.selectedDevice
  if (!device || revealingRemoteAccess.value) return
  revealingRemoteAccess.value = true
  remoteAccessMessage.value = ''
  try {
    await store.revealRemoteAccessCredential(device)
    remoteAccessMessage.value = 'Dane odszyfrowano tylko na czas tej sesji.'
  } catch (error) {
    remoteAccessMessage.value = error instanceof Error ? error.message : 'Nie udało się odszyfrować danych połączenia.'
  } finally {
    revealingRemoteAccess.value = false
  }
}

async function copyRemoteAccessValue(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    remoteAccessMessage.value = `${label} skopiowano do schowka.`
  } catch {
    remoteAccessMessage.value = `Nie udało się skopiować pola: ${label}.`
  }
}

function maxDiskUsage() {
  return Math.max(...(store.selectedDevice?.telemetry?.disks?.map((entry) => entry.usedPercent) ?? [0]))
}

function backupAgeHours() {
  if (!store.selectedDevice?.backupSnapshot?.scannedAt) return null
  return (Date.now() - store.selectedDevice.backupSnapshot.scannedAt) / (60 * 60 * 1000)
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = sizeBytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`
}

function formatTrackedDuration(seconds: number) {
  if (!seconds) return '0 min'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (!hours) return `${minutes} min`
  return `${hours} h ${minutes} min`
}

function usagePercent(over: number, observed: number) {
  if (!observed) return 'brak danych'
  return `${((over / observed) * 100).toFixed(1)}% czasu pomiaru`
}

function commentsForRequest(requestId: string) {
  return store.serviceRequestComments.filter((comment) => comment.requestId === requestId)
}

async function addInternalComment(requestId: string) {
  const body = serviceRequestCommentDrafts.value[requestId]?.trim() ?? ''
  if (!body || serviceRequestCommentBusyId.value) return
  serviceRequestCommentBusyId.value = requestId
  serviceRequestError.value = ''
  try {
    await store.addServiceRequestComment(requestId, body)
    serviceRequestCommentDrafts.value = { ...serviceRequestCommentDrafts.value, [requestId]: '' }
  } catch (error) {
    serviceRequestError.value = error instanceof Error ? error.message : 'Nie udało się dodać komentarza.'
  } finally {
    serviceRequestCommentBusyId.value = ''
  }
}

function metricClasses(value: number | null | undefined, warning: number, critical: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'border-white/10 bg-white/5 text-[var(--text-dim)]'
  if (value >= critical) return 'border-rose-400/35 bg-rose-500/12 text-rose-100'
  if (value >= warning) return 'border-amber-400/35 bg-amber-500/12 text-amber-100'
  return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
}

function formatDateTime(timestamp?: number | null) {
  if (!timestamp) return 'brak danych'
  return new Date(timestamp).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDuration(seconds?: number) {
  if (!seconds) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function getDeviceLabel(device?: DeviceRecord | null) {
  return formatDeviceLabelForMaster(device)
}

function getConversationDevicesLabel(devices: DeviceRecord[]) {
  return devices.map((device) => getDeviceLabel(device)).join(', ')
}

function getMessageDeviceLabel(message: CompanyChatMessage) {
  const explicitLabel = message.deviceLabel?.trim()
  if (explicitLabel) return explicitLabel

  if (message.deviceId) {
    const matchingDevice = store.devices.find((device) => device.deviceId === message.deviceId)
    if (matchingDevice) return getDeviceLabel(matchingDevice)
    return message.deviceId
  }

  return 'firma'
}

function serviceRequestStatusLabel(status: ServiceRequestStatus) {
  if (status === 'in_progress') return 'W trakcie'
  if (status === 'resolved') return 'Zakończone'
  return 'Nowe'
}

function serviceRequestPriorityLabel(priority: ServiceRequestPriority) {
  if (priority === 'critical') return 'Krytyczny'
  if (priority === 'high') return 'Wysoki'
  if (priority === 'low') return 'Niski'
  return 'Normalny'
}

function serviceRequestPriorityClass(priority: ServiceRequestPriority) {
  if (priority === 'critical') return 'border-rose-400/40 bg-rose-500/15 text-rose-100'
  if (priority === 'high') return 'border-amber-400/35 bg-amber-500/12 text-amber-100'
  if (priority === 'low') return 'border-white/10 bg-white/5 text-[var(--text-dim)]'
  return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
}

function openServiceRequests() {
  serviceRequestError.value = ''
  serviceRequestsOpen.value = true
}

async function changeServiceRequestStatus(requestId: string, event: Event) {
  const status = (event.target as HTMLSelectElement).value as ServiceRequestStatus
  serviceRequestError.value = ''
  try {
    await store.updateServiceRequestStatus(requestId, status)
  } catch (error) {
    serviceRequestError.value = error instanceof Error ? error.message : 'Nie udało się zmienić statusu zadania.'
  }
}

function goToServiceRequestDevice(deviceId: string, ownerUid: string) {
  if (!store.devices.some((device) => device.deviceId === deviceId)) return
  selectDevice(deviceId, ownerUid)
  serviceRequestsOpen.value = false
}

onMounted(() => {
  window.addEventListener('i-janek:open-service-requests', openServiceRequests)
})

onBeforeUnmount(() => {
  window.removeEventListener('i-janek:open-service-requests', openServiceRequests)
})
</script>

<template>
  <div class="grid h-full min-h-0 gap-4 grid-rows-[minmax(300px,1fr)_minmax(340px,1.25fr)] 2xl:grid-rows-[minmax(360px,1fr)_minmax(380px,1.35fr)]">
    <section class="glass-panel relative z-20 flex min-h-0 flex-col overflow-hidden rounded-[32px] p-5">
      <div
        class="mt-1 flex items-center"
        :class="store.selectedDevice ? 'min-h-[96px]' : 'min-h-0 flex-1'"
      >
        <div class="flex w-full snap-x gap-2 overflow-x-auto pb-1 sm:gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DeviceTile
          v-for="device in orderedDevices"
          :key="device.deviceId"
          :device="device"
          :selected="store.selectedDeviceId === device.deviceId"
          :alert-count="getDeviceAlertCount(device.deviceId)"
          :thresholds="store.masterSettings.thresholds"
          @click="selectDevice(device.deviceId, device.ownerUid)"
        />
        </div>
      </div>

      <div v-if="store.selectedDevice" class="mt-3 min-h-0 overflow-auto rounded-[28px] border border-white/10 bg-white/5 p-4">
        <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div class="display-font text-lg tracking-[0.18em] text-white">
              {{ getDeviceLabel(store.selectedDevice) }}
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill :label="store.selectedDevice.approvalStatus" />
              <StatusPill :label="store.selectedDevice.ownerEmail" />
              <StatusPill v-if="store.selectedDevice.contactName" :label="store.selectedDevice.contactName" />
              <StatusPill v-if="store.selectedDevice.installationLocation" :label="store.selectedDevice.installationLocation" />
              <StatusPill :label="store.selectedDevice.rustdesk?.installed ? 'RustDesk ready' : 'RustDesk brak'" :tone="store.selectedDevice.rustdesk?.installed ? 'success' : 'warning'" />
            </div>
            <p class="mt-3 text-sm leading-7 text-[var(--text-dim)]">
              Hostname: <span class="mono text-white">{{ store.selectedDevice.hostname }}</span>
              · ostatnia aktywność:
              <span class="mono text-white">{{ formatDateTime(store.selectedDevice.lastSeenAt) }}</span>
            </p>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
            <label class="sm:col-span-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-[var(--text-dim)]">
              <span class="mb-2 block uppercase tracking-[0.16em]">Kanał aktualizacji</span>
              <select
                class="soft-input !py-2"
                :value="store.selectedDevice.updateChannel ?? 'stable'"
                @change="changeSelectedDeviceUpdateChannel"
              >
                <option value="test">Test — pierwszy komputer</option>
                <option value="beta">Beta — wybrana grupa</option>
                <option value="stable">Stable — produkcja</option>
              </select>
            </label>
            <button class="glass-button justify-between" type="button" @click="store.requestRustDeskLaunch()">
              <span>Zdalny pulpit</span>
              <LaptopMinimalCheck class="h-4 w-4" />
            </button>
            <button class="glass-button justify-between" type="button" @click="store.requestRestartPrompt()">
              <span>Zaproponuj restart</span>
              <RefreshCcw class="h-4 w-4" />
            </button>
            <button class="ghost-button !rounded-2xl !px-4 !py-3 justify-between text-sm" type="button" @click="store.sendDiagnosticsLogs()">
              <span>Raport diagnostyczny</span>
              <ChevronRight class="h-4 w-4" />
            </button>
            <button class="ghost-button !rounded-2xl !px-4 !py-3 justify-between text-sm" type="button" @click="store.requestSelectedDeviceUpdate()">
              <span>Aktualizuj klienta</span>
              <ChevronRight class="h-4 w-4" />
            </button>
          </div>
        </div>

        <div class="mt-4 flex gap-3">
          <input
            v-model="store.pendingRemoteNotification"
            class="soft-input"
            placeholder="Powiadomienie dla tego komputera..."
          />
          <button class="glass-button !px-5" type="button" @click="store.requestRemoteNotification()">
            <Send class="mr-2 h-4 w-4" />
            Wyślij
          </button>
        </div>

        <div class="mt-4 flex flex-wrap gap-2">
          <button
            v-for="tab in tabs"
            :key="tab"
            type="button"
            class="rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] transition"
            :class="activeTab === tab ? 'border-cyan-400/35 bg-cyan-400/10 text-white' : 'border-white/10 text-[var(--text-dim)]'"
            @click="activeTab = tab"
          >
            {{ tab }}
          </button>
        </div>

        <div v-if="activeTab === 'overview'" class="mt-4 space-y-4">
          <div class="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <div class="rounded-[20px] border px-4 py-3" :class="metricClasses(store.selectedDevice.telemetry?.cpuUsagePercent, store.masterSettings.thresholds.cpuUsage.warning, store.masterSettings.thresholds.cpuUsage.critical)">
              <div class="flex items-center gap-2 text-sm"><Cpu class="h-4 w-4" /> CPU</div>
              <div class="mt-2 text-2xl font-semibold">{{ store.selectedDevice.telemetry?.cpuUsagePercent ?? '—' }}<span v-if="store.selectedDevice.telemetry?.cpuUsagePercent !== null && store.selectedDevice.telemetry?.cpuUsagePercent !== undefined">%</span></div>
            </div>
            <div class="rounded-[20px] border px-4 py-3" :class="metricClasses(store.selectedDevice.telemetry?.gpu?.usagePercent, store.masterSettings.thresholds.gpuUsage.warning, store.masterSettings.thresholds.gpuUsage.critical)">
              <div class="flex items-center gap-2 text-sm"><Workflow class="h-4 w-4" /> GPU</div>
              <div class="mt-2 text-2xl font-semibold">{{ store.selectedDevice.telemetry?.gpu?.usagePercent ?? '—' }}<span v-if="store.selectedDevice.telemetry?.gpu?.usagePercent !== null && store.selectedDevice.telemetry?.gpu?.usagePercent !== undefined">%</span></div>
            </div>
            <div class="rounded-[20px] border px-4 py-3" :class="metricClasses(store.selectedDevice.telemetry?.memoryUsedPercent, store.masterSettings.thresholds.ramUsage.warning, store.masterSettings.thresholds.ramUsage.critical)">
              <div class="flex items-center gap-2 text-sm"><MemoryStick class="h-4 w-4" /> RAM</div>
              <div class="mt-2 text-2xl font-semibold">{{ store.selectedDevice.telemetry?.memoryUsedPercent ?? '—' }}<span v-if="store.selectedDevice.telemetry?.memoryUsedPercent !== null && store.selectedDevice.telemetry?.memoryUsedPercent !== undefined">%</span></div>
            </div>
            <div class="rounded-[20px] border px-4 py-3" :class="metricClasses(maxDiskUsage(), store.masterSettings.thresholds.diskUsage.warning, store.masterSettings.thresholds.diskUsage.critical)">
              <div class="flex items-center gap-2 text-sm"><HardDrive class="h-4 w-4" /> Dysk</div>
              <div class="mt-2 text-2xl font-semibold">{{ maxDiskUsage() || maxDiskUsage() === 0 ? maxDiskUsage() : '—' }}<span v-if="maxDiskUsage() || maxDiskUsage() === 0">%</span></div>
            </div>
            <div class="rounded-[20px] border px-4 py-3" :class="metricClasses(store.selectedDevice.telemetry?.cpuTemperatureC, store.masterSettings.thresholds.cpuTemp.warning, store.masterSettings.thresholds.cpuTemp.critical)">
              <div class="flex items-center gap-2 text-sm"><Thermometer class="h-4 w-4" /> CPU temp</div>
              <div class="mt-2 text-2xl font-semibold">{{ store.selectedDevice.telemetry?.cpuTemperatureC ?? '—' }}<span v-if="store.selectedDevice.telemetry?.cpuTemperatureC !== null && store.selectedDevice.telemetry?.cpuTemperatureC !== undefined">°C</span></div>
            </div>
            <div class="rounded-[20px] border px-4 py-3" :class="metricClasses(store.selectedDevice.telemetry?.gpu?.temperatureC, store.masterSettings.thresholds.gpuTemp.warning, store.masterSettings.thresholds.gpuTemp.critical)">
              <div class="flex items-center gap-2 text-sm"><Thermometer class="h-4 w-4" /> GPU temp</div>
              <div class="mt-2 text-2xl font-semibold">{{ store.selectedDevice.telemetry?.gpu?.temperatureC ?? '—' }}<span v-if="store.selectedDevice.telemetry?.gpu?.temperatureC !== null && store.selectedDevice.telemetry?.gpu?.temperatureC !== undefined">°C</span></div>
            </div>
            <div class="rounded-[20px] border px-4 py-3" :class="metricClasses(backupAgeHours(), store.masterSettings.thresholds.backupAgeHours.warning, store.masterSettings.thresholds.backupAgeHours.critical)">
              <div class="flex items-center gap-2 text-sm"><CloudCog class="h-4 w-4" /> Backup</div>
              <div class="mt-2 text-sm font-semibold">{{ formatDateTime(store.selectedDevice.backupSnapshot?.scannedAt) }}</div>
            </div>
            <div class="rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-white">
              <div class="flex items-center gap-2 text-sm text-[var(--text-dim)]"><ShieldAlert class="h-4 w-4" /> Uptime</div>
              <div class="mt-2 text-2xl font-semibold">{{ formatDuration(store.selectedDevice.telemetry?.uptimeSeconds) }}</div>
            </div>
          </div>

          <section class="rounded-[20px] border border-cyan-300/15 bg-black/15 p-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="flex items-center gap-2 text-sm font-medium text-white"><BarChart3 class="h-4 w-4" /> Historia obciążenia</div>
                <div class="mt-1 text-xs text-[var(--text-dim)]">
                  Zarejestrowany czas pracy: <strong class="text-white">{{ formatTrackedDuration(usageSummary.observedSeconds) }}</strong>
                  · dowolny parametr ponad 80%: <strong class="text-amber-100">{{ formatTrackedDuration(usageSummary.anyOver80Seconds) }}</strong>
                  · dni z przeciążeniem: <strong class="text-white">{{ overloadDaysCount }}</strong>
                  · restarty: <strong class="text-white">{{ usageSummary.restartCount }}</strong>
                </div>
              </div>
              <select v-model.number="usageRangeDays" class="soft-input !w-auto !py-2 text-xs">
                <option :value="7">7 dni</option>
                <option :value="30">30 dni</option>
                <option :value="90">90 dni</option>
              </select>
            </div>
            <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <div v-for="metric in usageMetrics" :key="metric.label" class="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3">
                <div class="text-xs text-[var(--text-dim)]">{{ metric.label }}</div>
                <div class="mt-1 text-lg font-semibold text-white">{{ formatTrackedDuration(metric.over) }}</div>
                <div class="mt-1 text-[11px] text-cyan-100/70">{{ usagePercent(metric.over, metric.observed) }}</div>
              </div>
            </div>
            <div v-if="dailyUsageTrend.length" class="mt-4">
              <div class="mb-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">Dzienny udział pracy z dowolnym parametrem ponad 80%</div>
              <div class="flex h-28 min-w-0 items-end gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-black/10 px-3 pb-2 pt-3">
                <div
                  v-for="day in dailyUsageTrend"
                  :key="day.dayKey"
                  class="group flex h-full min-w-[18px] flex-1 flex-col items-center justify-end"
                  :title="`${day.dayKey}: ${formatTrackedDuration(day.overSeconds)} z ${formatTrackedDuration(day.observedSeconds)}`"
                >
                  <div class="w-full min-w-[10px] rounded-t bg-gradient-to-t from-cyan-500 to-amber-300 transition group-hover:brightness-125" :style="{ height: `${Math.max(3, day.ratio * 100)}%` }" />
                  <span class="mono mt-1 text-[8px] text-[var(--text-dim)]">{{ day.dayKey.slice(8) }}</span>
                </div>
              </div>
            </div>
            <div v-if="store.loadingUsageHistory" class="mt-3 text-xs text-[var(--text-dim)]">Pobieranie historii...</div>
            <div v-else-if="!selectedUsageRows.length" class="mt-3 text-xs text-[var(--text-dim)]">
              Dane zaczną się pojawiać po dwóch kolejnych pomiarach telemetrii. Historia jest liczona od wdrożenia tej funkcji.
            </div>
          </section>

          <div class="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <div class="rounded-[20px] border border-white/10 bg-black/15 p-4">
              <div class="text-sm font-medium text-white">Top procesy</div>
              <div class="mt-3 space-y-2">
                <div
                  v-for="proc in store.selectedDevice.telemetry?.topProcesses?.slice(0, 10) ?? []"
                  :key="proc.pid"
                  class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm"
                >
                  <div class="min-w-0">
                    <div class="truncate text-white">{{ proc.name }}</div>
                    <div class="mono mt-1 text-[11px] text-[var(--text-dim)]">PID {{ proc.pid }}</div>
                  </div>
                  <div class="text-right">
                    <div class="mono text-white">{{ proc.cpuPercent }}%</div>
                    <div class="mono text-[11px] text-[var(--text-dim)]">{{ proc.memoryPercent }}% RAM</div>
                  </div>
                </div>
                <div v-if="!(store.selectedDevice.telemetry?.topProcesses?.length)" class="rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                  Brak szczegółowych danych procesów.
                </div>
              </div>
            </div>

            <div class="rounded-[20px] border border-white/10 bg-black/15 p-4">
              <div class="text-sm font-medium text-white">Alerty</div>
              <div class="mt-3 space-y-2">
                <div
                  v-for="alert in selectedAlerts"
                  :key="alert.id"
                  class="rounded-2xl border border-white/10 px-3 py-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="font-medium text-white">{{ alert.title }}</div>
                    <StatusPill :label="alert.severity" :tone="alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'neutral'" />
                  </div>
                  <p class="mt-2 text-sm text-[var(--text-dim)]">{{ alert.message }}</p>
                </div>
                <div v-if="!selectedAlerts.length" class="rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                  Brak alertów dla wybranego komputera.
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'terminal'" class="mt-4">
          <div class="rounded-[20px] border border-white/10 bg-black/15 p-4">
            <div class="flex items-center gap-2 text-sm font-medium text-white">
              <TerminalSquare class="h-4 w-4 text-cyan-200" />
              Terminal serwisowy
            </div>
            <textarea
              v-model="store.pendingTerminalCommand"
              class="soft-input mt-4 min-h-28 resize-none font-mono"
              placeholder="np. Get-Process | Sort-Object CPU -Descending | Select -First 10"
            />
            <div class="mt-4 flex justify-end">
              <button class="glass-button" type="button" @click="store.queueTerminalCommand()">Wyślij komendę</button>
            </div>
          </div>

          <div class="mt-4 space-y-3">
            <div
              v-for="command in store.commandHistory[store.selectedDevice.deviceId] ?? []"
              :key="command.id"
              class="rounded-[20px] border border-white/10 bg-white/5 p-4"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="mono text-xs uppercase tracking-[0.16em] text-cyan-200">{{ command.shell }}</div>
                <StatusPill :label="command.status" :tone="command.status === 'completed' ? 'success' : command.status === 'failed' ? 'critical' : 'warning'" />
              </div>
              <div class="mt-2 font-mono text-sm text-white">{{ command.command }}</div>
              <pre class="mt-3 overflow-auto rounded-2xl bg-black/25 p-3 text-xs text-[var(--text-dim)]">{{ command.output || command.error || 'Oczekiwanie na wynik...' }}</pre>
            </div>
          </div>
        </div>

        <div v-else-if="activeTab === 'backup'" class="mt-4 grid gap-4 lg:grid-cols-2">
          <div class="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-medium text-white">Polityka backupu</div>
            <div class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between"><span>Ostatni backup</span><span class="mono text-white">{{ formatDateTime(store.selectedDevice.backupSnapshot?.scannedAt) }}</span></div>
              <div class="flex items-center justify-between"><span>Max plik</span><span class="mono text-white">{{ store.selectedDevice.backupPolicy?.maxFileSizeMb ?? 0 }} MB</span></div>
              <div class="flex items-center justify-between"><span>Miejsce na backup</span><span class="mono text-white">{{ store.selectedDevice.backupPolicy?.maxQuotaGb ?? 0 }} GB</span></div>
              <div class="flex items-center justify-between"><span>Auto sync</span><span class="mono text-white">{{ store.selectedDevice.backupPolicy?.syncUnderMb ?? 0 }} MB</span></div>
              <div class="flex items-center justify-between"><span>Folder</span><span class="mono text-white">{{ store.selectedDevice.backupPolicy?.driveFolderName ?? '—' }}</span></div>
            </div>
            <div class="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div class="flex items-center justify-between text-xs text-[var(--text-dim)]">
                <span>Postęp synchronizacji</span>
                <span class="mono text-white">
                  {{ selectedBackupProgress?.processedFiles ?? 0 }} / {{ selectedBackupProgress?.totalFiles ?? 0 }}
                </span>
              </div>
              <div class="mt-2 h-2 rounded-full bg-black/40">
                <div
                  class="h-full rounded-full bg-cyan-300 transition-all"
                  :style="{ width: `${selectedBackupProgressPercent}%` }"
                />
              </div>
            </div>
            <button class="glass-button mt-4" type="button" @click="store.syncBackupNow()">Uruchom backup teraz</button>
          </div>

          <div class="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-medium text-white">Pliki backupu (podgląd)</div>
              <button class="ghost-button !rounded-xl !px-3 !py-2 text-xs" type="button" @click="store.previewBackupFiles()">
                Odśwież
              </button>
            </div>
            <div class="mt-4 space-y-2">
              <div
                v-for="file in store.selectedBackupFiles"
                :key="`${file.path}:${file.modifiedAt ?? 0}`"
                class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]"
              >
                <div class="truncate text-white">{{ file.path }}</div>
                <div class="mt-1 flex items-center justify-between text-xs">
                  <span>{{ formatFileSize(file.sizeBytes) }}</span>
                  <span>{{ formatDateTime(file.modifiedAt) }}</span>
                </div>
              </div>
              <div v-if="!store.selectedBackupFiles.length" class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]">
                Brak plików w backupie lub brak odczytu.
              </div>
            </div>
          </div>
        </div>

        <div v-else class="mt-4 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div>
              <div class="text-sm font-medium text-white">Inwentaryzacja Firestore</div>
              <div class="mt-1 text-xs text-[var(--text-dim)]">Najnowszy raport urządzenia · {{ formatDateTime(selectedInventory?.capturedAt ?? store.selectedDevice.inventoryCapturedAt) }}</div>
            </div>
            <button
              class="ghost-button !rounded-xl !px-3 !py-2 text-xs"
              type="button"
              :disabled="store.loadingInventory"
              @click="store.loadInventory()"
            >
              <RefreshCcw class="mr-2 h-4 w-4" :class="store.loadingInventory ? 'animate-spin' : ''" />
              {{ store.loadingInventory ? 'Pobieranie…' : 'Odśwież raport' }}
            </button>
          </div>

          <div v-if="store.loadingInventory && !selectedInventory" class="rounded-[20px] border border-white/10 bg-white/5 p-5 text-sm text-[var(--text-dim)]">
            Pobieranie raportu inwentaryzacji…
          </div>
          <div v-else-if="!selectedInventory" class="rounded-[20px] border border-dashed border-white/10 bg-white/[0.03] p-5 text-sm text-[var(--text-dim)]">
            Brak raportu. Pojawi się po pierwszym cyklu inwentaryzacji klienta.
          </div>
          <div v-else class="grid gap-4 xl:grid-cols-2">
            <div class="rounded-[20px] border border-white/10 bg-white/5 p-4">
              <div class="text-sm font-medium text-white">Sprzęt</div>
              <div class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
                <div class="flex items-center justify-between gap-3"><span>Producent</span><span class="mono text-right text-white">{{ selectedInventory.hardware.manufacturer ?? '—' }}</span></div>
                <div class="flex items-center justify-between gap-3"><span>Model</span><span class="mono text-right text-white">{{ selectedInventory.hardware.model ?? '—' }}</span></div>
                <div class="flex items-center justify-between gap-3"><span>Numer seryjny</span><span class="mono text-right text-white">{{ selectedInventory.hardware.serial ?? '—' }}</span></div>
                <div class="flex items-center justify-between gap-3"><span>BIOS</span><span class="mono text-right text-white">{{ selectedInventory.hardware.biosVersion ?? '—' }}</span></div>
                <div class="flex items-center justify-between"><span>Moduły RAM</span><span class="mono text-white">{{ selectedInventory.hardware.ramSlots.length }}</span></div>
                <div class="flex items-center justify-between"><span>Dyski</span><span class="mono text-white">{{ selectedInventory.hardware.disks.length }}</span></div>
              </div>
            </div>

            <div class="rounded-[20px] border border-white/10 bg-white/5 p-4">
              <div class="flex items-center justify-between gap-3">
                <div class="text-sm font-medium text-white">Oprogramowanie i zabezpieczenia</div>
                <span class="mono text-xs text-cyan-100">{{ selectedInventory.installedApps.length }} aplikacji</span>
              </div>
              <div class="mt-4 max-h-48 space-y-2 overflow-auto pr-1 text-sm [scrollbar-width:thin]">
                <div v-for="appEntry in selectedInventory.installedApps.slice(0, 40)" :key="`${appEntry.name}:${appEntry.version ?? ''}`" class="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2">
                  <span class="truncate text-white">{{ appEntry.name }}</span>
                  <span class="mono shrink-0 text-xs text-[var(--text-dim)]">{{ appEntry.version ?? '—' }}</span>
                </div>
                <div v-if="!selectedInventory.installedApps.length" class="text-[var(--text-dim)]">Brak wykrytych aplikacji.</div>
              </div>
              <div class="mt-4 grid gap-2 text-xs text-[var(--text-dim)] sm:grid-cols-2">
                <div class="rounded-xl border border-white/10 px-3 py-2">Aktualizacje systemu: <span class="mono text-white">{{ selectedInventory.windowsUpdates.length }}</span></div>
                <div class="rounded-xl border border-white/10 px-3 py-2">Pola Defendera: <span class="mono text-white">{{ Object.keys(selectedInventory.defender).length }}</span></div>
              </div>
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div class="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-medium text-white">Sprzęt i system</div>
            <div class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between"><span>Model GPU</span><span class="mono max-w-[220px] truncate text-white">{{ store.selectedDevice.telemetry?.gpu?.model ?? 'brak' }}</span></div>
              <div class="flex items-center justify-between"><span>Driver GPU</span><span class="mono text-white">{{ store.selectedDevice.telemetry?.gpu?.driverVersion ?? '—' }}</span></div>
              <div class="flex items-center justify-between"><span>Restart</span><span class="mono text-white">{{ formatDateTime(store.selectedDevice.telemetry?.lastRestartAt) }}</span></div>
              <div class="flex items-center justify-between"><span>Shutdown</span><span class="mono text-white">{{ formatDateTime(store.selectedDevice.telemetry?.lastShutdownAt) }}</span></div>
              <div class="flex items-center justify-between"><span>Inventory</span><span class="mono text-white">{{ formatDateTime(store.selectedDevice.inventoryCapturedAt) }}</span></div>
              <div class="flex items-center justify-between"><span>Ostatnia akcja zdalna</span><span class="mono max-w-[220px] truncate text-white">{{ store.selectedDevice.lastRemoteActionResult ?? 'brak' }}</span></div>
            </div>
          </div>

          <div class="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-medium text-white">Podsumowanie</div>
            <div class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between"><span>Właściciel</span><span class="mono text-white">{{ store.selectedDevice.ownerEmail }}</span></div>
              <div class="flex items-center justify-between"><span>RustDesk</span><span class="mono text-white">{{ store.selectedDevice.rustdesk?.unattendedReady ? 'dostęp bezobsługowy gotowy' : store.selectedDevice.rustdesk?.installed ? 'wymaga konfiguracji' : 'brak' }}</span></div>
              <div class="flex items-center justify-between gap-3">
                <span>ID RustDesk</span>
                <button
                  v-if="selectedRemoteAccess"
                  class="mono max-w-[220px] truncate text-cyan-100 hover:text-white"
                  type="button"
                  title="Skopiuj ID RustDesk"
                  @click="copyRemoteAccessValue(selectedRemoteAccess.rustdeskId, 'ID RustDesk')"
                >
                  {{ selectedRemoteAccess.rustdeskId }}
                </button>
                <span v-else class="mono text-white/60">zaszyfrowane</span>
              </div>
              <div class="flex items-center justify-between gap-3">
                <span>Hasło połączenia</span>
                <button
                  v-if="selectedRemoteAccess"
                  class="mono max-w-[220px] truncate text-cyan-100 hover:text-white"
                  type="button"
                  title="Skopiuj hasło RustDesk"
                  @click="copyRemoteAccessValue(selectedRemoteAccess.password, 'Hasło RustDesk')"
                >
                  {{ selectedRemoteAccess.password }}
                </button>
                <span v-else class="mono text-white/60">zaszyfrowane</span>
              </div>
              <button
                class="ghost-button w-full !rounded-xl !px-3 !py-2 text-xs"
                type="button"
                :disabled="revealingRemoteAccess || !store.selectedDevice.rustdesk?.encryptedAccess"
                @click="revealRemoteAccess()"
              >
                <KeyRound class="mr-2 h-4 w-4" />
                {{ revealingRemoteAccess ? 'Odszyfrowywanie...' : selectedRemoteAccess ? 'Odśwież dane połączenia' : 'Pokaż dane połączenia' }}
              </button>
              <p v-if="remoteAccessMessage" class="text-xs leading-5 text-cyan-100">{{ remoteAccessMessage }}</p>
              <div class="flex items-center justify-between"><span>Backup</span><span class="mono text-white">{{ formatDateTime(store.selectedDevice.backupSnapshot?.scannedAt) }}</span></div>
              <div class="flex items-center justify-between"><span>Uptime</span><span class="mono text-white">{{ formatDuration(store.selectedDevice.telemetry?.uptimeSeconds) }}</span></div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </section>

    <section class="glass-panel relative z-10 grid min-h-0 overflow-hidden rounded-[32px] p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside class="min-h-0 overflow-auto border-b border-white/10 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <div class="display-font text-base tracking-[0.18em] text-white">WIADOMOŚCI</div>

        <div v-if="groupedCompanies.length" class="mt-4 space-y-2 pr-1">
          <button
            v-for="company in groupedCompanies"
            :key="company.key"
            type="button"
            class="flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left transition"
            :class="store.selectedConversationOwnerUid === company.ownerUid ? 'border-cyan-400/35 bg-cyan-400/10' : 'border-white/10 bg-white/5'"
            @click="store.selectedConversationOwnerUid = company.ownerUid"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  :class="isCompanyActive(company) ? 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.6)]' : 'bg-slate-500/70'"
                />
                <div class="truncate text-sm font-semibold text-white">{{ company.companyName }}</div>
              </div>
              <div class="truncate text-xs text-[var(--text-dim)]">{{ company.ownerEmail || 'Brak aktywnego klienta w tej firmie' }}</div>
            </div>
            <div v-if="unreadCount(company)" class="inline-flex min-w-7 items-center justify-center rounded-full bg-cyan-300 px-2 py-1 text-xs font-semibold text-slate-950">
              {{ unreadCount(company) }}
            </div>
          </button>
        </div>
        <div v-else class="mt-4 rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-[var(--text-dim)]">
          Brak aktywnych rozmów.
          <div class="mt-2 text-xs uppercase tracking-[0.18em] text-white/50">
            Podłącz urządzenie, aby pojawiły się wiadomości.
          </div>
        </div>
      </aside>

      <div class="flex min-h-0 flex-col overflow-hidden pt-4 lg:pl-4 lg:pt-0">
        <template v-if="activeCompany">
          <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <div class="text-lg font-semibold text-white">{{ activeCompany.companyName }}</div>
              <div class="text-sm text-[var(--text-dim)]">
                {{ activeCompany.isPlaceholder ? 'Brak urządzeń w tej firmie' : activeCompany.ownerEmail || 'Brak aktywnego klienta' }}
                · {{ activeCompany.devices.length }} komputer(y)
              </div>
            </div>
            <div class="hidden rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)] xl:block">
              {{ getConversationDevicesLabel(activeCompany.devices) }}
            </div>
          </div>

          <div class="mt-4 flex-1 space-y-3 overflow-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <template v-for="entry in conversationTimeline" :key="entry.id">
              <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
                <div class="h-px flex-1 bg-white/10" />
                <span class="mono">{{ entry.label }}</span>
                <div class="h-px flex-1 bg-white/10" />
              </div>

              <div
                v-else
                class="max-w-[82%] rounded-[22px] border px-4 py-3 text-sm leading-7"
                :class="
                  entry.message.senderRole === 'master'
                    ? 'ml-auto border-cyan-400/30 bg-cyan-500/10 text-white'
                    : 'border-white/10 bg-white/5 text-white'
                "
              >
                <div class="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">
                  <span class="mono">{{ entry.message.senderEmail }}</span>
                  <span class="mono">{{ getMessageDeviceLabel(entry.message) }}</span>
                </div>
                {{ entry.message.body }}
              </div>
            </template>
            <div v-if="!conversationTimeline.length" class="rounded-[22px] border border-white/10 px-4 py-4 text-sm text-[var(--text-dim)]">
              {{ activeCompany.isPlaceholder ? 'Ta firma jest już w ustawieniach, ale nie ma jeszcze urządzenia ani wiadomości.' : 'Brak wiadomości w tej rozmowie.' }}
            </div>
          </div>

          <div class="mt-4 flex gap-3">
            <input
              v-model="store.pendingChatMessage"
              class="soft-input"
              :disabled="!canSendMessageToActiveCompany"
              :placeholder="canSendMessageToActiveCompany ? 'Napisz do firmy...' : 'Ta firma nie ma jeszcze urządzenia ani kanału wiadomości'"
            />
            <button class="glass-button" type="button" :disabled="!canSendMessageToActiveCompany" @click="store.sendChatMessage()">
              <Send class="mr-2 h-4 w-4" />
              Wyślij
            </button>
          </div>
        </template>
        <div v-else class="flex flex-1 items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-black/10 p-6 text-center text-sm leading-7 text-[var(--text-dim)]">
          <div>
            <div class="text-base font-semibold text-white">Brak aktywnych wiadomości</div>
            <p class="mt-2">Po dodaniu urządzenia lub odebraniu wiadomości ten panel zacznie pokazywać prawdziwą rozmowę.</p>
          </div>
        </div>
      </div>
    </section>

    <div
      v-if="serviceRequestsOpen"
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 px-4 py-6"
      @click.self="serviceRequestsOpen = false"
    >
      <div class="glass-panel flex max-h-[90vh] w-full max-w-5xl flex-col rounded-[30px] border border-fuchsia-300/25 p-5">
        <div class="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <div class="mono flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-fuchsia-200">
              <ClipboardList class="h-4 w-4" /> Globalne zadania klientów
            </div>
            <h2 class="mt-1 text-xl font-semibold text-white">Zgłoszenia serwisowe — chronologicznie</h2>
            <p class="mt-1 text-sm text-[var(--text-dim)]">Najnowsze zgłoszenia są na górze. Lista obejmuje wszystkie firmy i urządzenia.</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100">Aktywne: {{ store.openServiceRequests.length }}</span>
            <span class="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-100">Zakończone: {{ resolvedServiceRequestsCount }}</span>
            <button class="ghost-button !rounded-xl !px-3 !py-2 !text-xs" type="button" @click="serviceRequestsOpen = false">Zamknij</button>
          </div>
        </div>

        <p v-if="serviceRequestError" class="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {{ serviceRequestError }}
        </p>

        <div class="mt-4 min-h-0 flex-1 space-y-3 overflow-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <article
            v-for="request in orderedServiceRequests"
            :key="request.id"
            class="rounded-[22px] border p-4"
            :class="request.status === 'resolved' ? 'border-white/10 bg-white/[0.025] opacity-75' : 'border-white/15 bg-black/15'"
          >
            <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.13em]" :class="serviceRequestPriorityClass(request.priority)">
                    {{ serviceRequestPriorityLabel(request.priority) }}
                  </span>
                  <span class="mono text-[11px] text-[var(--text-dim)]">{{ formatDateTime(request.createdAt) }}</span>
                  <span v-if="request.status === 'resolved' && request.resolvedAt" class="mono text-[11px] text-emerald-200/70">zamknięto {{ formatDateTime(request.resolvedAt) }}</span>
                </div>
                <h3 class="mt-2 text-base font-semibold text-white">{{ request.title }}</h3>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/85">{{ request.description }}</p>
                <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-dim)]">
                  <span>Firma: <strong class="font-medium text-white">{{ request.companyName }}</strong></span>
                  <span>Klient: <strong class="font-medium text-white">{{ request.ownerEmail }}</strong></span>
                  <span>Komputer: <strong class="font-medium text-white">{{ request.deviceLabel }}</strong></span>
                </div>
                <div class="mt-4 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-500/[0.045] p-3">
                  <div class="flex items-center gap-2 text-xs font-medium text-fuchsia-100">
                    <MessageSquarePlus class="h-4 w-4" /> Komentarze wewnętrzne — tylko Master
                  </div>
                  <div v-if="commentsForRequest(request.id).length" class="mt-2 space-y-2">
                    <div v-for="comment in commentsForRequest(request.id)" :key="comment.id" class="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                      <div class="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-dim)]">
                        <span>{{ comment.authorEmail }}</span>
                        <span class="mono">{{ formatDateTime(comment.createdAt) }}</span>
                      </div>
                      <p class="mt-1 whitespace-pre-wrap text-xs leading-5 text-white/85">{{ comment.body }}</p>
                    </div>
                  </div>
                  <div class="mt-2 flex gap-2">
                    <textarea
                      v-model="serviceRequestCommentDrafts[request.id]"
                      class="soft-input min-h-[72px] flex-1 resize-y !py-2 text-xs"
                      maxlength="2000"
                      placeholder="Notatka techniczna niewidoczna dla klienta..."
                    />
                    <button
                      class="glass-button self-end !rounded-xl !px-3 !py-2 !text-xs"
                      type="button"
                      :disabled="serviceRequestCommentBusyId === request.id || !serviceRequestCommentDrafts[request.id]?.trim()"
                      @click="addInternalComment(request.id)"
                    >
                      Dodaj
                    </button>
                  </div>
                </div>
              </div>

              <div class="flex shrink-0 flex-wrap items-center gap-2 lg:w-[260px] lg:justify-end">
                <select
                  class="soft-input !w-auto !min-w-[140px] !py-2 text-sm"
                  :value="request.status"
                  :aria-label="`Status: ${serviceRequestStatusLabel(request.status)}`"
                  @change="changeServiceRequestStatus(request.id, $event)"
                >
                  <option value="open">Nowe</option>
                  <option value="in_progress">W trakcie</option>
                  <option value="resolved">Zakończone</option>
                </select>
                <button
                  class="ghost-button !rounded-xl !px-3 !py-2 !text-xs"
                  type="button"
                  :disabled="!store.devices.some((device) => device.deviceId === request.deviceId)"
                  @click="goToServiceRequestDevice(request.deviceId, request.ownerUid)"
                >
                  Otwórz komputer
                </button>
              </div>
            </div>
          </article>

          <div v-if="!orderedServiceRequests.length" class="rounded-[24px] border border-dashed border-white/10 p-8 text-center text-sm text-[var(--text-dim)]">
            Brak zgłoszeń serwisowych. Nowe zadania klientów pojawią się tutaj automatycznie.
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
