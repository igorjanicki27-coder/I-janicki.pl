<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  CloudCog,
  Cpu,
  HardDrive,
  LaptopMinimalCheck,
  MemoryStick,
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
import type { CompanyChatMessage, DeviceRecord } from '@shared/contracts'

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
              <StatusPill :label="store.selectedDevice.rustdesk?.installed ? 'RustDesk ready' : 'RustDesk brak'" :tone="store.selectedDevice.rustdesk?.installed ? 'success' : 'warning'" />
            </div>
            <p class="mt-3 text-sm leading-7 text-[var(--text-dim)]">
              Hostname: <span class="mono text-white">{{ store.selectedDevice.hostname }}</span>
              · ostatnia aktywność:
              <span class="mono text-white">{{ formatDateTime(store.selectedDevice.lastSeenAt) }}</span>
            </p>
          </div>

          <div class="grid gap-2 sm:grid-cols-2">
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

        <div v-else class="mt-4 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
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
              <div class="flex items-center justify-between"><span>RustDesk</span><span class="mono text-white">{{ store.selectedDevice.rustdesk?.installed ? 'gotowy' : 'brak' }}</span></div>
              <div class="flex items-center justify-between"><span>ID RustDesk</span><span class="mono max-w-[220px] truncate text-white">{{ store.selectedDevice.rustdesk?.accessIdentity ?? 'brak' }}</span></div>
              <div class="flex items-center justify-between"><span>Kod serwisowy</span><span class="mono text-white">{{ store.selectedDevice.rustdesk?.accessCode ?? 'widoczny lokalnie u użytkownika' }}</span></div>
              <div class="flex items-center justify-between"><span>Backup</span><span class="mono text-white">{{ formatDateTime(store.selectedDevice.backupSnapshot?.scannedAt) }}</span></div>
              <div class="flex items-center justify-between"><span>Uptime</span><span class="mono text-white">{{ formatDuration(store.selectedDevice.telemetry?.uptimeSeconds) }}</span></div>
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
  </div>
</template>
