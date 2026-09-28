<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  BarChart3,
  ChevronRight,
  CloudCog,
  Cpu,
  HardDrive,
  KeyRound,
  LaptopMinimalCheck,
  MemoryStick,
  RefreshCcw,
  Send,
  ShieldAlert,
  TerminalSquare,
  Thermometer,
  Workflow
} from 'lucide-vue-next'
import StatusPill from '@/components/StatusPill.vue'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { UpdateChannel } from '@shared/contracts'

const tabs = ['overview', 'terminal', 'backup', 'inventory'] as const
const store = useAppStore()
const activeTab = ref<(typeof tabs)[number]>('overview')
const usageRangeDays = ref<7 | 30 | 90>(30)
const remoteAccessMessage = ref('')
const revealingRemoteAccess = ref(false)

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
const selectedInventory = computed(() => {
  const deviceId = store.selectedDevice?.deviceId
  return deviceId ? store.inventory[deviceId] ?? null : null
})
const selectedRemoteAccess = computed(() => {
  const deviceId = store.selectedDevice?.deviceId
  return deviceId ? store.revealedRemoteAccess[deviceId] ?? null : null
})
const selectedUsageRows = computed(() => {
  const deviceId = store.selectedDevice?.deviceId
  return deviceId ? store.usageHistory[deviceId] ?? [] : []
})
const usageSummary = computed(() => selectedUsageRows.value.reduce((summary, row) => ({
  observedSeconds: summary.observedSeconds + row.observedSeconds,
  anyOver80Seconds: summary.anyOver80Seconds + row.anyOver80Seconds,
  restartCount: summary.restartCount + row.restartCount
}), { observedSeconds: 0, anyOver80Seconds: 0, restartCount: 0 }))
const dailyUsageTrend = computed(() => selectedUsageRows.value.map((row) => ({
  dayKey: row.dayKey,
  ratio: row.observedSeconds ? Math.min(1, row.anyOver80Seconds / row.observedSeconds) : 0,
  overSeconds: row.anyOver80Seconds,
  observedSeconds: row.observedSeconds
})))

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

watch(() => store.selectedDeviceId, () => {
  activeTab.value = 'overview'
  remoteAccessMessage.value = ''
})

function changeUpdateChannel(event: Event) {
  const deviceId = store.selectedDevice?.deviceId
  if (!deviceId) return
  void store.updateDeviceUpdateChannel(deviceId, (event.target as HTMLSelectElement).value as UpdateChannel)
}

function maxDiskUsage() {
  return Math.max(...(store.selectedDevice?.telemetry?.disks?.map((entry) => entry.usedPercent) ?? [0]))
}

function backupAgeHours() {
  if (!store.selectedDevice?.backupSnapshot?.scannedAt) return null
  return (Date.now() - store.selectedDevice.backupSnapshot.scannedAt) / (60 * 60 * 1000)
}

function metricClasses(value: number | null | undefined, warning: number, critical: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'border-white/10 bg-white/[0.035] text-[var(--text-dim)]'
  if (value >= critical) return 'border-rose-400/35 bg-rose-500/10 text-rose-100'
  if (value >= warning) return 'border-amber-400/35 bg-amber-500/10 text-amber-100'
  return 'border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-100'
}

function formatDateTime(timestamp?: number | null) {
  if (!timestamp) return 'brak danych'
  return new Date(timestamp).toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function formatDuration(seconds?: number) {
  if (!seconds) return '—'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${minutes}m`
}

function formatTrackedDuration(seconds: number) {
  if (!seconds) return '0 min'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours ? `${hours} h ${minutes} min` : `${minutes} min`
}

function formatFileSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = sizeBytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
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
</script>

<template>
  <div v-if="store.selectedDevice" class="min-h-0">
    <header class="border-b border-white/10 px-6 py-5">
      <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-3">
            <span class="h-2.5 w-2.5 rounded-full" :class="!store.selectedDevice.offline && Date.now() - store.selectedDevice.lastSeenAt < 300000 ? 'bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,.55)]' : 'bg-slate-500'" />
            <h2 class="truncate text-xl font-semibold text-white">{{ formatDeviceLabelForMaster(store.selectedDevice) }}</h2>
          </div>
          <p class="mt-1.5 text-sm text-[var(--text-dim)]">
            {{ store.selectedDevice.companyName || store.selectedDevice.ownerEmail }} · {{ store.selectedDevice.hostname }} · ostatnio {{ formatDateTime(store.selectedDevice.lastSeenAt) }}
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            <StatusPill :label="store.selectedDevice.approvalStatus" />
            <StatusPill v-if="store.selectedDevice.installationLocation" :label="store.selectedDevice.installationLocation" />
            <StatusPill :label="store.selectedDevice.rustdesk?.installed ? 'RustDesk gotowy' : 'Brak RustDesk'" :tone="store.selectedDevice.rustdesk?.installed ? 'success' : 'warning'" />
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          <button class="glass-button !rounded-xl" type="button" @click="store.requestRustDeskLaunch()">
            <LaptopMinimalCheck class="mr-2 h-4 w-4" /> Zdalny pulpit
          </button>
          <button class="ghost-button !rounded-xl !px-4 !py-2.5 text-sm" type="button" @click="store.requestRestartPrompt()">
            <RefreshCcw class="mr-2 h-4 w-4" /> Restart
          </button>
          <button class="ghost-button !rounded-xl !px-4 !py-2.5 text-sm" type="button" @click="store.sendDiagnosticsLogs()">
            Raport <ChevronRight class="ml-2 h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="mt-5 flex flex-col gap-3 lg:flex-row">
        <div class="flex flex-1 gap-2">
          <input v-model="store.pendingRemoteNotification" class="soft-input !rounded-xl" placeholder="Wyślij powiadomienie na ten komputer..." />
          <button class="glass-button !rounded-xl !px-5" type="button" @click="store.requestRemoteNotification()">
            <Send class="h-4 w-4" /><span class="sr-only">Wyślij</span>
          </button>
        </div>
        <label class="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-[var(--text-dim)]">
          Kanał
          <select class="bg-transparent text-sm text-white outline-none" :value="store.selectedDevice.updateChannel ?? 'stable'" @change="changeUpdateChannel">
            <option value="test">Test</option>
            <option value="beta">Beta</option>
            <option value="stable">Stable</option>
          </select>
        </label>
        <button class="ghost-button !rounded-xl !px-4 !py-2.5 text-sm" type="button" @click="store.requestSelectedDeviceUpdate()">Aktualizuj klienta</button>
      </div>
    </header>

    <nav class="flex flex-wrap gap-1 border-b border-white/10 px-6 pt-2" aria-label="Szczegóły komputera">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="relative whitespace-nowrap px-4 py-3 text-sm transition"
        :class="activeTab === tab ? 'text-white' : 'text-[var(--text-dim)] hover:text-white'"
        type="button"
        @click="activeTab = tab"
      >
        {{ tab === 'overview' ? 'Stan komputera' : tab === 'terminal' ? 'Terminal' : tab === 'backup' ? 'Backup' : 'Inwentaryzacja' }}
        <span v-if="activeTab === tab" class="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" />
      </button>
    </nav>

    <div class="p-6">
      <div v-if="activeTab === 'overview'" class="space-y-5">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="metric-card" :class="metricClasses(store.selectedDevice.telemetry?.cpuUsagePercent, store.masterSettings.thresholds.cpuUsage.warning, store.masterSettings.thresholds.cpuUsage.critical)">
            <div class="metric-label"><Cpu class="h-4 w-4" /> CPU</div><div class="metric-value">{{ store.selectedDevice.telemetry?.cpuUsagePercent ?? '—' }}<small v-if="store.selectedDevice.telemetry?.cpuUsagePercent != null">%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(store.selectedDevice.telemetry?.gpu?.usagePercent, store.masterSettings.thresholds.gpuUsage.warning, store.masterSettings.thresholds.gpuUsage.critical)">
            <div class="metric-label"><Workflow class="h-4 w-4" /> GPU</div><div class="metric-value">{{ store.selectedDevice.telemetry?.gpu?.usagePercent ?? '—' }}<small v-if="store.selectedDevice.telemetry?.gpu?.usagePercent != null">%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(store.selectedDevice.telemetry?.memoryUsedPercent, store.masterSettings.thresholds.ramUsage.warning, store.masterSettings.thresholds.ramUsage.critical)">
            <div class="metric-label"><MemoryStick class="h-4 w-4" /> RAM</div><div class="metric-value">{{ store.selectedDevice.telemetry?.memoryUsedPercent ?? '—' }}<small v-if="store.selectedDevice.telemetry?.memoryUsedPercent != null">%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(maxDiskUsage(), store.masterSettings.thresholds.diskUsage.warning, store.masterSettings.thresholds.diskUsage.critical)">
            <div class="metric-label"><HardDrive class="h-4 w-4" /> Dysk</div><div class="metric-value">{{ maxDiskUsage() }}<small>%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(store.selectedDevice.telemetry?.cpuTemperatureC, store.masterSettings.thresholds.cpuTemp.warning, store.masterSettings.thresholds.cpuTemp.critical)">
            <div class="metric-label"><Thermometer class="h-4 w-4" /> CPU temp.</div><div class="metric-value">{{ store.selectedDevice.telemetry?.cpuTemperatureC ?? '—' }}<small v-if="store.selectedDevice.telemetry?.cpuTemperatureC != null">°C</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(store.selectedDevice.telemetry?.gpu?.temperatureC, store.masterSettings.thresholds.gpuTemp.warning, store.masterSettings.thresholds.gpuTemp.critical)">
            <div class="metric-label"><Thermometer class="h-4 w-4" /> GPU temp.</div><div class="metric-value">{{ store.selectedDevice.telemetry?.gpu?.temperatureC ?? '—' }}<small v-if="store.selectedDevice.telemetry?.gpu?.temperatureC != null">°C</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(backupAgeHours(), store.masterSettings.thresholds.backupAgeHours.warning, store.masterSettings.thresholds.backupAgeHours.critical)">
            <div class="metric-label"><CloudCog class="h-4 w-4" /> Backup</div><div class="mt-2 text-sm font-semibold">{{ formatDateTime(store.selectedDevice.backupSnapshot?.scannedAt) }}</div>
          </div>
          <div class="metric-card border-white/10 bg-white/[0.035] text-white">
            <div class="metric-label text-[var(--text-dim)]"><ShieldAlert class="h-4 w-4" /> Uptime</div><div class="metric-value">{{ formatDuration(store.selectedDevice.telemetry?.uptimeSeconds) }}</div>
          </div>
        </div>

        <section class="content-card">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex items-center gap-2 text-sm font-semibold text-white"><BarChart3 class="h-4 w-4 text-cyan-200" /> Historia obciążenia</div>
              <p class="mt-1 text-xs text-[var(--text-dim)]">Pomiar: {{ formatTrackedDuration(usageSummary.observedSeconds) }} · ponad 80%: {{ formatTrackedDuration(usageSummary.anyOver80Seconds) }} · restarty: {{ usageSummary.restartCount }}</p>
            </div>
            <select v-model.number="usageRangeDays" class="soft-input !w-auto !rounded-xl !py-2 text-xs"><option :value="7">7 dni</option><option :value="30">30 dni</option><option :value="90">90 dni</option></select>
          </div>
          <div v-if="dailyUsageTrend.length" class="mt-4 flex h-28 items-end gap-1 rounded-xl border border-white/10 bg-black/15 px-3 pb-2 pt-3">
            <div v-for="day in dailyUsageTrend" :key="day.dayKey" class="flex h-full min-w-[10px] flex-1 flex-col items-center justify-end" :title="`${day.dayKey}: ${formatTrackedDuration(day.overSeconds)}`">
              <div class="w-full rounded-t bg-gradient-to-t from-cyan-500 to-fuchsia-400" :style="{ height: `${Math.max(3, day.ratio * 100)}%` }" />
              <span class="mono mt-1 text-[8px] text-[var(--text-dim)]">{{ day.dayKey.slice(8) }}</span>
            </div>
          </div>
          <p v-else class="mt-4 text-sm text-[var(--text-dim)]">Historia pojawi się po zebraniu kolejnych pomiarów.</p>
        </section>

        <div class="grid gap-4 xl:grid-cols-2">
          <section class="content-card">
            <h3 class="text-sm font-semibold text-white">Najbardziej obciążające procesy</h3>
            <div class="mt-3 space-y-2">
              <div v-for="process in store.selectedDevice.telemetry?.topProcesses?.slice(0, 6) ?? []" :key="process.pid" class="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-sm">
                <div class="min-w-0"><div class="truncate text-white">{{ process.name }}</div><div class="mono mt-0.5 text-[11px] text-[var(--text-dim)]">PID {{ process.pid }}</div></div>
                <div class="mono text-right text-xs text-[var(--text-dim)]"><strong class="block text-white">{{ process.cpuPercent }}% CPU</strong>{{ process.memoryPercent }}% RAM</div>
              </div>
              <p v-if="!store.selectedDevice.telemetry?.topProcesses?.length" class="text-sm text-[var(--text-dim)]">Brak danych procesów.</p>
            </div>
          </section>
          <section class="content-card">
            <h3 class="text-sm font-semibold text-white">Alerty urządzenia</h3>
            <div class="mt-3 space-y-2">
              <div v-for="alert in selectedAlerts" :key="alert.id" class="rounded-xl border border-white/10 px-3 py-3">
                <div class="flex items-center justify-between gap-3"><strong class="text-sm text-white">{{ alert.title }}</strong><StatusPill :label="alert.severity" :tone="alert.severity === 'critical' ? 'critical' : 'warning'" /></div>
                <p class="mt-2 text-sm text-[var(--text-dim)]">{{ alert.message }}</p>
              </div>
              <p v-if="!selectedAlerts.length" class="text-sm text-[var(--text-dim)]">Brak aktywnych alertów.</p>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="activeTab === 'terminal'" class="space-y-4">
        <section class="content-card">
          <div class="flex items-center gap-2 text-sm font-semibold text-white"><TerminalSquare class="h-4 w-4 text-cyan-200" /> Terminal serwisowy</div>
          <textarea v-model="store.pendingTerminalCommand" class="soft-input mt-4 min-h-28 resize-none rounded-xl font-mono" placeholder="Wpisz polecenie diagnostyczne..." />
          <div class="mt-3 flex justify-end"><button class="glass-button !rounded-xl" type="button" @click="store.queueTerminalCommand()">Wyślij komendę</button></div>
        </section>
        <article v-for="command in store.commandHistory[store.selectedDevice.deviceId] ?? []" :key="command.id" class="content-card">
          <div class="flex items-center justify-between"><span class="mono text-xs text-cyan-200">{{ command.shell }}</span><StatusPill :label="command.status" :tone="command.status === 'completed' ? 'success' : command.status === 'failed' ? 'critical' : 'warning'" /></div>
          <div class="mt-2 font-mono text-sm text-white">{{ command.command }}</div>
          <pre class="mt-3 overflow-auto rounded-xl bg-black/25 p-3 text-xs text-[var(--text-dim)]">{{ command.output || command.error || 'Oczekiwanie na wynik...' }}</pre>
        </article>
      </div>

      <div v-else-if="activeTab === 'backup'" class="grid gap-4 xl:grid-cols-2">
        <section class="content-card">
          <h3 class="text-sm font-semibold text-white">Polityka backupu</h3>
          <dl class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
            <div class="flex justify-between gap-4"><dt>Ostatni backup</dt><dd class="mono text-right text-white">{{ formatDateTime(store.selectedDevice.backupSnapshot?.scannedAt) }}</dd></div>
            <div class="flex justify-between"><dt>Maksymalny plik</dt><dd class="mono text-white">{{ store.selectedDevice.backupPolicy?.maxFileSizeMb ?? 0 }} MB</dd></div>
            <div class="flex justify-between"><dt>Limit miejsca</dt><dd class="mono text-white">{{ store.selectedDevice.backupPolicy?.maxQuotaGb ?? 0 }} GB</dd></div>
            <div class="flex justify-between"><dt>Folder</dt><dd class="mono text-white">{{ store.selectedDevice.backupPolicy?.driveFolderName ?? '—' }}</dd></div>
          </dl>
          <div class="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
            <div class="flex justify-between text-xs text-[var(--text-dim)]"><span>Postęp synchronizacji</span><span>{{ selectedBackupProgress?.processedFiles ?? 0 }} / {{ selectedBackupProgress?.totalFiles ?? 0 }}</span></div>
            <div class="mt-2 h-2 rounded-full bg-black/40"><div class="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400" :style="{ width: `${selectedBackupProgressPercent}%` }" /></div>
          </div>
          <button class="glass-button mt-4 !rounded-xl" type="button" @click="store.syncBackupNow()">Uruchom backup</button>
        </section>
        <section class="content-card">
          <div class="flex items-center justify-between"><h3 class="text-sm font-semibold text-white">Pliki backupu</h3><button class="ghost-button !rounded-xl" type="button" @click="store.previewBackupFiles()">Odśwież</button></div>
          <div class="mt-4 space-y-2">
            <div v-for="file in store.selectedBackupFiles" :key="`${file.path}:${file.modifiedAt ?? 0}`" class="rounded-xl border border-white/10 px-3 py-2 text-sm"><div class="truncate text-white">{{ file.path }}</div><div class="mt-1 flex justify-between text-xs text-[var(--text-dim)]"><span>{{ formatFileSize(file.sizeBytes) }}</span><span>{{ formatDateTime(file.modifiedAt) }}</span></div></div>
            <p v-if="!store.selectedBackupFiles.length" class="text-sm text-[var(--text-dim)]">Brak plików lub brak odczytu.</p>
          </div>
        </section>
      </div>

      <div v-else class="space-y-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h3 class="text-sm font-semibold text-white">Inwentaryzacja sprzętu i oprogramowania</h3><p class="mt-1 text-xs text-[var(--text-dim)]">Raport z {{ formatDateTime(selectedInventory?.capturedAt ?? store.selectedDevice.inventoryCapturedAt) }}</p></div>
          <button class="ghost-button !rounded-xl" type="button" :disabled="store.loadingInventory" @click="store.loadInventory()"><RefreshCcw class="mr-2 h-4 w-4" :class="store.loadingInventory ? 'animate-spin' : ''" /> Odśwież</button>
        </div>
        <div v-if="!selectedInventory" class="content-card text-sm text-[var(--text-dim)]">{{ store.loadingInventory ? 'Pobieranie raportu…' : 'Brak raportu inwentaryzacji.' }}</div>
        <div v-else class="grid gap-4 xl:grid-cols-2">
          <section class="content-card">
            <h3 class="text-sm font-semibold text-white">Sprzęt</h3>
            <dl class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
              <div class="flex justify-between gap-4"><dt>Producent</dt><dd class="mono text-right text-white">{{ selectedInventory.hardware.manufacturer ?? '—' }}</dd></div>
              <div class="flex justify-between gap-4"><dt>Model</dt><dd class="mono text-right text-white">{{ selectedInventory.hardware.model ?? '—' }}</dd></div>
              <div class="flex justify-between gap-4"><dt>Numer seryjny</dt><dd class="mono text-right text-white">{{ selectedInventory.hardware.serial ?? '—' }}</dd></div>
              <div class="flex justify-between"><dt>Moduły RAM</dt><dd class="mono text-white">{{ selectedInventory.hardware.ramSlots.length }}</dd></div>
              <div class="flex justify-between"><dt>Dyski</dt><dd class="mono text-white">{{ selectedInventory.hardware.disks.length }}</dd></div>
            </dl>
          </section>
          <section class="content-card">
            <div class="flex justify-between"><h3 class="text-sm font-semibold text-white">Oprogramowanie</h3><span class="mono text-xs text-cyan-100">{{ selectedInventory.installedApps.length }} aplikacji</span></div>
            <div class="mt-4 max-h-64 space-y-2 overflow-auto pr-1">
              <div v-for="appEntry in selectedInventory.installedApps.slice(0, 50)" :key="`${appEntry.name}:${appEntry.version ?? ''}`" class="flex justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-sm"><span class="truncate text-white">{{ appEntry.name }}</span><span class="mono shrink-0 text-xs text-[var(--text-dim)]">{{ appEntry.version ?? '—' }}</span></div>
            </div>
          </section>
          <section class="content-card">
            <h3 class="text-sm font-semibold text-white">Dostęp zdalny</h3>
            <dl class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
              <div class="flex justify-between"><dt>Właściciel</dt><dd class="mono text-white">{{ store.selectedDevice.ownerEmail }}</dd></div>
              <div class="flex justify-between gap-3"><dt>ID RustDesk</dt><button v-if="selectedRemoteAccess" class="mono text-cyan-100" type="button" @click="copyRemoteAccessValue(selectedRemoteAccess.rustdeskId, 'ID RustDesk')">{{ selectedRemoteAccess.rustdeskId }}</button><dd v-else class="mono text-white/60">zaszyfrowane</dd></div>
              <div class="flex justify-between gap-3"><dt>Hasło</dt><button v-if="selectedRemoteAccess" class="mono text-cyan-100" type="button" @click="copyRemoteAccessValue(selectedRemoteAccess.password, 'Hasło')">{{ selectedRemoteAccess.password }}</button><dd v-else class="mono text-white/60">zaszyfrowane</dd></div>
            </dl>
            <button class="ghost-button mt-4 w-full !rounded-xl" type="button" :disabled="revealingRemoteAccess || !store.selectedDevice.rustdesk?.encryptedAccess" @click="revealRemoteAccess()"><KeyRound class="mr-2 h-4 w-4" /> {{ revealingRemoteAccess ? 'Odszyfrowywanie…' : 'Pokaż dane połączenia' }}</button>
            <p v-if="remoteAccessMessage" class="mt-3 text-xs text-cyan-100">{{ remoteAccessMessage }}</p>
          </section>
          <section class="content-card">
            <h3 class="text-sm font-semibold text-white">System</h3>
            <dl class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
              <div class="flex justify-between gap-4"><dt>GPU</dt><dd class="mono truncate text-right text-white">{{ store.selectedDevice.telemetry?.gpu?.model ?? 'brak' }}</dd></div>
              <div class="flex justify-between"><dt>Sterownik GPU</dt><dd class="mono text-white">{{ store.selectedDevice.telemetry?.gpu?.driverVersion ?? '—' }}</dd></div>
              <div class="flex justify-between"><dt>Ostatni restart</dt><dd class="mono text-white">{{ formatDateTime(store.selectedDevice.telemetry?.lastRestartAt) }}</dd></div>
              <div class="flex justify-between gap-4"><dt>Ostatnia akcja</dt><dd class="mono truncate text-right text-white">{{ store.selectedDevice.lastRemoteActionResult ?? 'brak' }}</dd></div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
