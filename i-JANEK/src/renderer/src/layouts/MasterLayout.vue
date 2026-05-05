<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  ChevronLeft,
  ChevronRight,
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
import { useAppStore } from '@/stores/app'
import type { DeviceRecord } from '@shared/contracts'

const CHAT_READS_KEY = 'i-janek-master-chat-reads'
const tabs = ['overview', 'terminal', 'backup', 'inventory'] as const

const store = useAppStore()
const activeTab = ref<(typeof tabs)[number]>('overview')
const chatReads = ref<Record<string, number>>({})
const carouselRef = ref<HTMLElement | null>(null)

const groupedCompanies = computed(() => {
  const grouped = new Map<
    string,
    {
      ownerUid: string
      ownerEmail: string
      devices: DeviceRecord[]
      latestMessageAt: number
    }
  >()

  for (const device of store.devices) {
    const existing = grouped.get(device.ownerUid)
    const latestMessageAt = (store.companyChats[device.ownerUid] ?? []).at(-1)?.createdAt ?? 0
    if (existing) {
      existing.devices.push(device)
      existing.latestMessageAt = Math.max(existing.latestMessageAt, latestMessageAt)
      continue
    }
    grouped.set(device.ownerUid, {
      ownerUid: device.ownerUid,
      ownerEmail: device.ownerEmail,
      devices: [device],
      latestMessageAt
    })
  }

  return [...grouped.values()].sort((left, right) => right.latestMessageAt - left.latestMessageAt || right.devices.length - left.devices.length)
})

const selectedAlerts = computed(() => {
  if (!store.selectedDevice) return []
  return store.alerts.filter((alert) => alert.deviceId === store.selectedDevice?.deviceId).slice(0, 4)
})

const activeCompany = computed(() => groupedCompanies.value.find((entry) => entry.ownerUid === store.selectedConversationOwnerUid) ?? groupedCompanies.value[0] ?? null)
const conversationTimeline = computed(() => buildConversationTimeline(store.selectedConversationMessages))
const orderedDevices = computed(() =>
  [...store.devices].sort((left, right) => devicePriorityScore(right) - devicePriorityScore(left) || right.updatedAt - left.updatedAt)
)

watch(
  () => groupedCompanies.value.map((entry) => entry.ownerUid).join('|'),
  () => {
    if (!store.selectedConversationOwnerUid && groupedCompanies.value[0]) {
      store.selectedConversationOwnerUid = groupedCompanies.value[0].ownerUid
    }
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

function unreadCount(ownerUid: string) {
  const messages = store.companyChats[ownerUid] ?? []
  const lastRead = chatReads.value[ownerUid] ?? 0
  return messages.filter((message) => message.senderRole === 'slave' && message.createdAt > lastRead).length
}

function isCompanyActive(ownerUid: string) {
  const company = groupedCompanies.value.find((entry) => entry.ownerUid === ownerUid)
  if (!company) return false
  return company.devices.some((device) => isDeviceOnline(device))
}

function selectDevice(deviceId: string, ownerUid: string) {
  store.selectedDeviceId = deviceId
  store.selectedConversationOwnerUid = ownerUid
}

function scrollCarousel(direction: 'left' | 'right') {
  if (!carouselRef.value) return
  carouselRef.value.scrollBy({
    left: direction === 'left' ? -380 : 380,
    behavior: 'smooth'
  })
}

function maxDiskUsage() {
  return Math.max(...(store.selectedDevice?.telemetry?.disks?.map((entry) => entry.usedPercent) ?? [0]))
}

function backupAgeHours() {
  if (!store.selectedDevice?.backupSnapshot?.scannedAt) return null
  return (Date.now() - store.selectedDevice.backupSnapshot.scannedAt) / (60 * 60 * 1000)
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
</script>

<template>
  <div class="grid h-full min-h-0 gap-4 grid-rows-[minmax(190px,0.45fr)_minmax(0,2.75fr)]">
    <section class="glass-panel relative flex min-h-0 flex-col overflow-visible rounded-[32px] p-5">
      <div
        class="relative mt-1 flex items-center"
        :class="store.selectedDevice ? 'min-h-[96px]' : 'min-h-0 flex-1'"
      >
        <button
          class="absolute inset-y-0 left-0 z-10 my-auto flex h-10 items-center px-1 text-white/80 transition hover:text-white"
          type="button"
          @click="scrollCarousel('left')"
        >
          <ChevronLeft class="h-6 w-6" />
        </button>
        <button
          class="absolute inset-y-0 right-0 z-10 my-auto flex h-10 items-center px-1 text-white/80 transition hover:text-white"
          type="button"
          @click="scrollCarousel('right')"
        >
          <ChevronRight class="h-6 w-6" />
        </button>

        <div ref="carouselRef" class="flex w-full snap-x gap-3 overflow-x-auto px-7 pb-1 pr-7 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
              {{ store.selectedDevice.deviceAlias || store.selectedDevice.hostname }}
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
                  v-for="proc in store.selectedDevice.telemetry?.topProcesses?.slice(0, 5) ?? []"
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
            <button class="glass-button mt-4" type="button" @click="store.syncBackupNow()">Uruchom backup teraz</button>
          </div>

          <div class="rounded-[20px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-medium text-white">Śledzone katalogi</div>
            <div class="mt-4 space-y-2">
              <div
                v-for="pathEntry in store.selectedDevice.backupPolicy?.watchedPaths ?? []"
                :key="pathEntry"
                class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]"
              >
                {{ pathEntry }}
              </div>
              <div v-if="!(store.selectedDevice.backupPolicy?.watchedPaths?.length)" class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]">
                Brak skonfigurowanych katalogów.
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
              <div class="flex items-center justify-between"><span>Backup</span><span class="mono text-white">{{ formatDateTime(store.selectedDevice.backupSnapshot?.scannedAt) }}</span></div>
              <div class="flex items-center justify-between"><span>Uptime</span><span class="mono text-white">{{ formatDuration(store.selectedDevice.telemetry?.uptimeSeconds) }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="glass-panel grid min-h-0 overflow-hidden rounded-[32px] p-5 lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside class="min-h-0 overflow-auto border-b border-white/10 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <div class="display-font text-base tracking-[0.18em] text-white">WIADOMOŚCI</div>

        <div class="mt-4 space-y-2 pr-1">
          <button
            v-for="company in groupedCompanies"
            :key="company.ownerUid"
            type="button"
            class="flex w-full items-center justify-between rounded-[22px] border px-4 py-3 text-left transition"
            :class="store.selectedConversationOwnerUid === company.ownerUid ? 'border-cyan-400/35 bg-cyan-400/10' : 'border-white/10 bg-white/5'"
            @click="store.selectedConversationOwnerUid = company.ownerUid"
          >
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  :class="isCompanyActive(company.ownerUid) ? 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.6)]' : 'bg-slate-500/70'"
                />
                <div class="truncate text-sm font-semibold text-white">{{ getCompanyLabel(company.ownerEmail) }}</div>
              </div>
              <div class="truncate text-xs text-[var(--text-dim)]">{{ company.ownerEmail }}</div>
            </div>
            <div v-if="unreadCount(company.ownerUid)" class="inline-flex min-w-7 items-center justify-center rounded-full bg-cyan-300 px-2 py-1 text-xs font-semibold text-slate-950">
              {{ unreadCount(company.ownerUid) }}
            </div>
          </button>
        </div>
      </aside>

      <div class="flex min-h-0 flex-col overflow-hidden pt-4 lg:pl-4 lg:pt-0">
        <div v-if="activeCompany" class="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div class="text-lg font-semibold text-white">{{ getCompanyLabel(activeCompany.ownerEmail) }}</div>
            <div class="text-sm text-[var(--text-dim)]">{{ activeCompany.ownerEmail }} · {{ activeCompany.devices.length }} komputer(y)</div>
          </div>
          <div class="hidden rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)] xl:block">
            {{ activeCompany.devices.map((device) => device.deviceAlias || device.hostname).join(', ') }}
          </div>
        </div>

        <div class="mt-4 flex-1 space-y-3 overflow-auto pr-1">
          <div
            v-for="message in store.selectedConversationMessages"
            :key="message.id"
            class="max-w-[82%] rounded-[22px] border px-4 py-3 text-sm leading-7"
            :class="message.senderRole === 'master' ? 'ml-auto border-cyan-400/30 bg-cyan-500/10 text-white' : 'border-white/10 bg-white/5 text-white'"
          >
            <div class="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">
              <span class="mono">{{ message.senderEmail }}</span>
              <span class="mono">{{ message.deviceLabel || message.deviceId || 'firma' }}</span>
            </div>
            {{ message.body }}
          </div>
          <div v-if="!store.selectedConversationMessages.length" class="rounded-[22px] border border-white/10 px-4 py-4 text-sm text-[var(--text-dim)]">
            Brak wiadomości w tej rozmowie.
          </div>
        </div>

        <div class="mt-4 flex gap-3">
          <input v-model="store.pendingChatMessage" class="soft-input" placeholder="Napisz do firmy..." />
          <button class="glass-button" type="button" @click="store.sendChatMessage()">
            <Send class="mr-2 h-4 w-4" />
            Wyślij
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
