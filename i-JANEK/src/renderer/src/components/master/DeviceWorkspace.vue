<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  Cpu,
  HardDrive,
  MemoryStick,
  Pencil,
  RefreshCcw,
  Save,
  Send,
  ShieldAlert,
  TerminalSquare,
  Thermometer,
  Trash2,
  Workflow,
  X
} from 'lucide-vue-next'
import StatusPill from '@/components/StatusPill.vue'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { isDeviceOnline } from '@/services/device-presence'
import { useAppStore } from '@/stores/app'
import type { UpdateChannel } from '@shared/contracts'

const emit = defineEmits<{ archived: [] }>()
const tabs = ['overview', 'diagnostics', 'tools', 'inventory'] as const
const store = useAppStore()
const activeTab = ref<(typeof tabs)[number]>('overview')
const usageRangeDays = ref<7 | 30 | 90>(30)
const editingDetails = ref(false)
const detailsBusy = ref(false)
const detailsMessage = ref('')
const showArchiveConfirm = ref(false)
const archiveBusy = ref(false)
const archiveError = ref('')
const detailsDraft = ref({
  deviceAlias: '',
  contactName: '',
  companyName: '',
  installationLocation: '',
  dwServiceInstallationCode: '',
  updateChannel: 'stable' as UpdateChannel
})

const selectedAlerts = computed(() => {
  if (!store.selectedDevice) return []
  return store.alerts
    .filter((alert) => alert.deviceId === store.selectedDevice?.deviceId && alert.severity !== 'info')
    .sort((left, right) => (left.severity === 'critical' ? 0 : 1) - (right.severity === 'critical' ? 0 : 1))
    .slice(0, 4)
})
const deviceOnline = computed(() => Boolean(store.selectedDevice && isDeviceOnline(store.selectedDevice, store.statusNow)))
const currentTelemetry = computed(() => deviceOnline.value ? store.selectedDevice?.telemetry : undefined)
const deviceHealth = computed(() => {
  if (!deviceOnline.value) return { label: 'Komputer offline', detail: 'Nie można teraz wykonać zdalnych akcji.', tone: 'offline' as const }
  if (selectedAlerts.value.some((alert) => alert.severity === 'critical')) return { label: 'Wymaga pilnej uwagi', detail: 'Wykryto krytyczny alert.', tone: 'critical' as const }
  if (selectedAlerts.value.length) return { label: 'Wymaga uwagi', detail: `${selectedAlerts.value.length} aktywne alerty`, tone: 'warning' as const }
  return { label: 'Wszystko w porządku', detail: 'Brak aktywnych alertów.', tone: 'healthy' as const }
})
const selectedInventory = computed(() => {
  const deviceId = store.selectedDevice?.deviceId
  return deviceId ? store.inventory[deviceId] ?? null : null
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
  editingDetails.value = false
  detailsMessage.value = ''
  resetDetailsDraft()
})

function resetDetailsDraft() {
  const device = store.selectedDevice
  detailsDraft.value = {
    deviceAlias: device?.deviceAlias?.trim() || device?.hostname || '',
    contactName: device?.contactName?.trim() || '',
    companyName: device?.companyName?.trim() || '',
    installationLocation: device?.installationLocation?.trim() || '',
    dwServiceInstallationCode: device?.dwservice?.installationCode ?? '',
    updateChannel: device?.updateChannel ?? 'stable'
  }
}

function startEditingDetails() {
  resetDetailsDraft()
  detailsMessage.value = ''
  editingDetails.value = true
}

function cancelEditingDetails() {
  editingDetails.value = false
  detailsMessage.value = ''
  resetDetailsDraft()
}

async function saveDetails() {
  const deviceId = store.selectedDevice?.deviceId
  if (!deviceId || detailsBusy.value) return
  detailsBusy.value = true
  detailsMessage.value = ''
  try {
    await store.saveDeviceDetails(deviceId, detailsDraft.value)
    if (detailsDraft.value.dwServiceInstallationCode !== store.selectedDevice?.dwservice?.installationCode) {
      await store.configureDwService(deviceId, detailsDraft.value.dwServiceInstallationCode)
    }
    if (detailsDraft.value.updateChannel !== (store.selectedDevice?.updateChannel ?? 'stable')) {
      await store.updateDeviceUpdateChannel(deviceId, detailsDraft.value.updateChannel)
    }
    editingDetails.value = false
    detailsMessage.value = 'Dane komputera zostały zapisane.'
  } catch (error) {
    detailsMessage.value = error instanceof Error ? error.message : 'Nie udało się zapisać danych komputera.'
  } finally {
    detailsBusy.value = false
  }
}

async function confirmArchiveDevice() {
  const deviceId = store.selectedDevice?.deviceId
  if (!deviceId || archiveBusy.value) return
  archiveBusy.value = true
  archiveError.value = ''
  try {
    await store.archiveDevice(deviceId)
    showArchiveConfirm.value = false
    emit('archived')
  } catch (error) {
    archiveError.value = error instanceof Error ? error.message : 'Nie udało się usunąć komputera.'
  } finally {
    archiveBusy.value = false
  }
}

function maxDiskUsage() {
  const disks = currentTelemetry.value?.disks ?? []
  return disks.length ? Math.max(...disks.map((entry) => entry.usedPercent)) : null
}

function metricClasses(value: number | null | undefined, warning: number, critical: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'border-white/10 bg-white/[0.035] text-[var(--text-dim)]'
  if (value >= critical) return 'border-rose-400/35 bg-rose-500/10 text-rose-100'
  if (value >= warning) return 'border-amber-400/35 bg-amber-500/10 text-amber-100'
  return 'border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-100'
}

function metricTextClasses(value: number | null | undefined, warning: number, critical: number) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'text-[var(--text-dim)]'
  if (value >= critical) return 'text-rose-200'
  if (value >= warning) return 'text-amber-200'
  return 'text-white'
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

</script>

<template>
  <div v-if="store.selectedDevice" class="min-h-0">
    <header class="border-b border-white/10 px-5 py-4 lg:px-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <div class="flex items-center gap-3">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="deviceOnline ? 'bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,.55)]' : 'bg-slate-500'" />
            <h2 class="truncate text-lg font-semibold text-white">{{ formatDeviceLabelForMaster(store.selectedDevice) }}</h2>
            <span class="hidden rounded-md bg-white/[0.055] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-dim)] md:inline">{{ deviceOnline ? 'online' : 'offline' }}</span>
          </div>
          <p class="mt-1 truncate pl-5.5 text-xs text-[var(--text-dim)]">
            {{ store.selectedDevice.contactName || store.selectedDevice.ownerEmail }}<span v-if="store.selectedDevice.companyName"> · {{ store.selectedDevice.companyName }}</span><span v-if="store.selectedDevice.installationLocation"> · {{ store.selectedDevice.installationLocation }}</span>
          </p>
        </div>
        <button class="ghost-button !rounded-xl !px-3 !py-2 text-xs text-rose-200 hover:!border-rose-300/30 hover:!bg-rose-500/10" type="button" @click="showArchiveConfirm = true; archiveError = ''">
          <Trash2 class="mr-1.5 h-3.5 w-3.5" /> Usuń komputer
        </button>
      </div>
    </header>

    <nav class="scrollbar-glass flex gap-1 overflow-x-auto border-b border-white/10 px-4 pt-1 lg:px-6" aria-label="Szczegóły komputera">
      <button
        v-for="tab in tabs"
        :key="tab"
        class="relative whitespace-nowrap px-3 py-3 text-sm transition lg:px-4"
        :class="activeTab === tab ? 'text-white' : 'text-[var(--text-dim)] hover:text-white'"
        type="button"
        @click="activeTab = tab"
      >
        {{ tab === 'overview' ? 'Pulpit' : tab === 'diagnostics' ? 'Diagnostyka' : tab === 'tools' ? 'Narzędzia' : 'Sprzęt' }}
        <span v-if="activeTab === tab" class="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-cyan-300 to-fuchsia-400" />
      </button>
    </nav>

    <div class="p-4 lg:p-6">
      <div v-if="activeTab === 'overview'" class="space-y-4">
        <section
          class="rounded-2xl border p-4 lg:p-5"
          :class="deviceHealth.tone === 'critical' ? 'border-rose-400/30 bg-rose-500/[0.07]' : deviceHealth.tone === 'warning' ? 'border-amber-400/25 bg-amber-500/[0.055]' : deviceHealth.tone === 'offline' ? 'border-white/10 bg-white/[0.025]' : 'border-emerald-400/20 bg-emerald-500/[0.045]'"
        >
          <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div class="flex min-w-0 items-center gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" :class="deviceHealth.tone === 'critical' ? 'bg-rose-400/10 text-rose-200' : deviceHealth.tone === 'warning' ? 'bg-amber-400/10 text-amber-200' : deviceHealth.tone === 'offline' ? 'bg-white/[0.055] text-[var(--text-dim)]' : 'bg-emerald-400/10 text-emerald-200'">
                <AlertTriangle v-if="deviceHealth.tone === 'critical' || deviceHealth.tone === 'warning'" class="h-5 w-5" />
                <Activity v-else-if="deviceHealth.tone === 'offline'" class="h-5 w-5" />
                <CheckCircle2 v-else class="h-5 w-5" />
              </span>
              <div class="min-w-0">
                <h3 class="font-semibold text-white">{{ deviceHealth.label }}</h3>
                <p class="mt-0.5 text-xs text-[var(--text-dim)]">{{ deviceHealth.detail }} Ostatni kontakt: {{ formatDateTime(store.selectedDevice.lastSeenAt) }}</p>
              </div>
            </div>
            <button v-if="selectedAlerts.length" class="ghost-button !shrink-0 !rounded-xl !px-3 !py-2 text-xs" type="button" @click="activeTab = 'diagnostics'">
              Zobacz diagnostykę
            </button>
          </div>
        </section>

        <section class="content-card !p-0">
          <div class="grid grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div class="p-4">
              <div class="flex items-center gap-2 text-xs text-[var(--text-dim)]"><Cpu class="h-3.5 w-3.5" /> CPU</div>
              <div class="mt-2 text-xl font-semibold" :class="metricTextClasses(currentTelemetry?.cpuUsagePercent, store.masterSettings.thresholds.cpuUsage.warning, store.masterSettings.thresholds.cpuUsage.critical)">{{ currentTelemetry?.cpuUsagePercent ?? '—' }}<small v-if="currentTelemetry?.cpuUsagePercent != null" class="ml-0.5 text-xs font-normal opacity-70">%</small></div>
            </div>
            <div class="p-4">
              <div class="flex items-center gap-2 text-xs text-[var(--text-dim)]"><MemoryStick class="h-3.5 w-3.5" /> RAM</div>
              <div class="mt-2 text-xl font-semibold" :class="metricTextClasses(currentTelemetry?.memoryUsedPercent, store.masterSettings.thresholds.ramUsage.warning, store.masterSettings.thresholds.ramUsage.critical)">{{ currentTelemetry?.memoryUsedPercent ?? '—' }}<small v-if="currentTelemetry?.memoryUsedPercent != null" class="ml-0.5 text-xs font-normal opacity-70">%</small></div>
            </div>
            <div class="p-4">
              <div class="flex items-center gap-2 text-xs text-[var(--text-dim)]"><HardDrive class="h-3.5 w-3.5" /> Dysk</div>
              <div class="mt-2 text-xl font-semibold" :class="metricTextClasses(maxDiskUsage(), store.masterSettings.thresholds.diskUsage.warning, store.masterSettings.thresholds.diskUsage.critical)">{{ maxDiskUsage() ?? '—' }}<small v-if="maxDiskUsage() != null" class="ml-0.5 text-xs font-normal opacity-70">%</small></div>
            </div>
          </div>
        </section>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,.8fr)]">
          <section class="content-card">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold text-white">Wymaga uwagi</h3>
                <p class="mt-1 text-xs text-[var(--text-dim)]">Tylko aktualne problemy tego komputera.</p>
              </div>
              <span v-if="selectedAlerts.length" class="mono rounded-lg bg-amber-400/10 px-2 py-1 text-xs text-amber-200">{{ selectedAlerts.length }}</span>
            </div>
            <div v-if="selectedAlerts.length" class="mt-4 divide-y divide-white/10">
              <div v-for="alert in selectedAlerts" :key="alert.id" class="py-3 first:pt-0 last:pb-0">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0"><strong class="block truncate text-sm text-white">{{ alert.title }}</strong><p class="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-dim)]">{{ alert.message }}</p></div>
                  <StatusPill :label="alert.severity" :tone="alert.severity === 'critical' ? 'critical' : 'warning'" />
                </div>
              </div>
            </div>
            <div v-else class="mt-4 flex items-center gap-3 rounded-xl bg-emerald-400/[0.055] px-3 py-3 text-sm text-emerald-100">
              <CheckCircle2 class="h-4 w-4 shrink-0" /> Brak aktywnych alertów.
            </div>
          </section>

          <section class="content-card">
            <div class="flex items-start justify-between gap-3">
              <div><h3 class="text-sm font-semibold text-white">Dane komputera</h3><p class="mt-1 text-xs text-[var(--text-dim)]">Informacje widoczne w panelu.</p></div>
              <button v-if="!editingDetails" class="ghost-button !rounded-lg !px-2.5 !py-2 text-xs" type="button" @click="startEditingDetails()"><Pencil class="mr-1.5 h-3.5 w-3.5" /> Edytuj</button>
            </div>

            <form v-if="editingDetails" class="mt-4" @submit.prevent="saveDetails()">
            <div class="grid gap-3">
              <label class="text-xs text-[var(--text-dim)]">
                Nazwa komputera
                <input v-model="detailsDraft.deviceAlias" class="soft-input mt-1 !rounded-xl !py-2.5" maxlength="48" placeholder="np. Laptop biuro" />
              </label>
              <label class="text-xs text-[var(--text-dim)]">
                Firma
                <input v-model="detailsDraft.companyName" class="soft-input mt-1 !rounded-xl !py-2.5" list="device-company-options" maxlength="80" placeholder="Nazwa firmy" />
                <datalist id="device-company-options"><option v-for="company in store.masterSettings.companyOptions" :key="company" :value="company" /></datalist>
              </label>
              <label class="text-xs text-[var(--text-dim)]">
                Osoba
                <input v-model="detailsDraft.contactName" class="soft-input mt-1 !rounded-xl !py-2.5" maxlength="100" placeholder="Imię i nazwisko" />
              </label>
              <label class="text-xs text-[var(--text-dim)]">
                Lokalizacja
                <input v-model="detailsDraft.installationLocation" class="soft-input mt-1 !rounded-xl !py-2.5" maxlength="120" placeholder="np. Biuro, recepcja" />
              </label>
              <label class="text-xs text-[var(--text-dim)]">
                Kod instalacyjny DWService
                <input v-model="detailsDraft.dwServiceInstallationCode" class="soft-input mt-1 !rounded-xl !py-2.5 font-mono" maxlength="11" inputmode="numeric" placeholder="123-456-789" />
              </label>
              <label class="text-xs text-[var(--text-dim)]">
                Zainstalowana wersja
                <input :value="store.selectedDevice.appVersion || 'brak danych'" class="soft-input mt-1 !rounded-xl !py-2.5 font-mono opacity-70" readonly />
              </label>
              <label class="text-xs text-[var(--text-dim)]">
                Kanał aktualizacji
                <select v-model="detailsDraft.updateChannel" class="soft-input mt-1 !rounded-xl !py-2.5">
                  <option value="test">Test — wersje alpha</option>
                  <option value="beta">Beta — wersje beta</option>
                  <option value="stable">Stabilny</option>
                </select>
                <span class="mt-1.5 block text-[11px] leading-4 text-white/40">Komputer otrzyma najnowszą wersję z wybranego kanału.</span>
              </label>
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-end gap-2">
              <p v-if="detailsMessage" class="text-xs text-amber-200">{{ detailsMessage }}</p>
              <button class="ghost-button !rounded-xl !px-3 !py-2 text-xs" type="button" :disabled="detailsBusy" @click="cancelEditingDetails()"><X class="mr-1.5 h-3.5 w-3.5" /> Anuluj</button>
              <button class="glass-button !rounded-xl !px-3 !py-2 !text-xs" type="submit" :disabled="detailsBusy"><Save class="mr-1.5 h-3.5 w-3.5" /> {{ detailsBusy ? 'Zapisywanie…' : 'Zapisz' }}</button>
            </div>
          </form>

            <dl v-else class="mt-4 divide-y divide-white/10 text-sm">
              <div class="flex justify-between gap-4 py-2.5 first:pt-0"><dt class="text-[var(--text-dim)]">Nazwa</dt><dd class="truncate text-right font-medium text-white">{{ store.selectedDevice.deviceAlias || store.selectedDevice.hostname }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-[var(--text-dim)]">Firma</dt><dd class="truncate text-right text-white">{{ store.selectedDevice.companyName || '—' }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-[var(--text-dim)]">Osoba</dt><dd class="truncate text-right text-white">{{ store.selectedDevice.contactName || '—' }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5 last:pb-0"><dt class="text-[var(--text-dim)]">Lokalizacja</dt><dd class="truncate text-right text-white">{{ store.selectedDevice.installationLocation || '—' }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5 last:pb-0"><dt class="text-[var(--text-dim)]">Agent DWService</dt><dd class="text-right text-white">{{ store.selectedDevice.dwservice?.status ?? 'nieprzypisany' }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-[var(--text-dim)]">Wersja</dt><dd class="mono text-right text-white">{{ store.selectedDevice.appVersion || 'brak danych' }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5 last:pb-0"><dt class="text-[var(--text-dim)]">Kanał aktualizacji</dt><dd class="text-right text-white">{{ store.selectedDevice.updateChannel === 'test' ? 'Test' : store.selectedDevice.updateChannel === 'beta' ? 'Beta' : 'Stabilny' }}</dd></div>
            </dl>
            <p v-if="!editingDetails && detailsMessage" class="mt-3 text-xs text-emerald-200">{{ detailsMessage }}</p>
          </section>
        </div>
      </div>

      <div v-else-if="activeTab === 'diagnostics'" class="space-y-5">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div class="metric-card" :class="metricClasses(currentTelemetry?.cpuUsagePercent, store.masterSettings.thresholds.cpuUsage.warning, store.masterSettings.thresholds.cpuUsage.critical)">
            <div class="metric-label"><Cpu class="h-4 w-4" /> CPU</div><div class="metric-value">{{ currentTelemetry?.cpuUsagePercent ?? '—' }}<small v-if="currentTelemetry?.cpuUsagePercent != null">%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(currentTelemetry?.gpu?.usagePercent, store.masterSettings.thresholds.gpuUsage.warning, store.masterSettings.thresholds.gpuUsage.critical)">
            <div class="metric-label"><Workflow class="h-4 w-4" /> GPU</div><div class="metric-value">{{ currentTelemetry?.gpu?.usagePercent ?? '—' }}<small v-if="currentTelemetry?.gpu?.usagePercent != null">%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(currentTelemetry?.memoryUsedPercent, store.masterSettings.thresholds.ramUsage.warning, store.masterSettings.thresholds.ramUsage.critical)">
            <div class="metric-label"><MemoryStick class="h-4 w-4" /> RAM</div><div class="metric-value">{{ currentTelemetry?.memoryUsedPercent ?? '—' }}<small v-if="currentTelemetry?.memoryUsedPercent != null">%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(maxDiskUsage(), store.masterSettings.thresholds.diskUsage.warning, store.masterSettings.thresholds.diskUsage.critical)">
            <div class="metric-label"><HardDrive class="h-4 w-4" /> Dysk</div><div class="metric-value">{{ maxDiskUsage() ?? '—' }}<small v-if="maxDiskUsage() != null">%</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(currentTelemetry?.cpuTemperatureC, store.masterSettings.thresholds.cpuTemp.warning, store.masterSettings.thresholds.cpuTemp.critical)">
            <div class="metric-label"><Thermometer class="h-4 w-4" /> CPU temp.</div><div class="metric-value">{{ currentTelemetry?.cpuTemperatureC ?? '—' }}<small v-if="currentTelemetry?.cpuTemperatureC != null">°C</small></div>
          </div>
          <div class="metric-card" :class="metricClasses(currentTelemetry?.gpu?.temperatureC, store.masterSettings.thresholds.gpuTemp.warning, store.masterSettings.thresholds.gpuTemp.critical)">
            <div class="metric-label"><Thermometer class="h-4 w-4" /> GPU temp.</div><div class="metric-value">{{ currentTelemetry?.gpu?.temperatureC ?? '—' }}<small v-if="currentTelemetry?.gpu?.temperatureC != null">°C</small></div>
          </div>
          <div class="metric-card border-white/10 bg-white/[0.035] text-white">
            <div class="metric-label text-[var(--text-dim)]"><ShieldAlert class="h-4 w-4" /> Uptime</div><div class="metric-value">{{ formatDuration(currentTelemetry?.uptimeSeconds) }}</div>
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
              <div v-for="process in currentTelemetry?.topProcesses?.slice(0, 6) ?? []" :key="process.pid" class="flex items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-sm">
                <div class="min-w-0"><div class="truncate text-white">{{ process.name }}</div><div class="mono mt-0.5 text-[11px] text-[var(--text-dim)]">PID {{ process.pid }}</div></div>
                <div class="mono text-right text-xs text-[var(--text-dim)]"><strong class="block text-white">{{ process.cpuPercent }}% CPU</strong>{{ process.memoryPercent }}% RAM</div>
              </div>
              <p v-if="!currentTelemetry?.topProcesses?.length" class="text-sm text-[var(--text-dim)]">Brak aktualnych danych procesów.</p>
            </div>
          </section>
          <section class="content-card">
            <h3 class="text-sm font-semibold text-white">Informacje techniczne</h3>
            <dl class="mt-4 divide-y divide-white/10 text-sm">
              <div class="flex justify-between gap-4 py-2.5 first:pt-0"><dt class="text-[var(--text-dim)]">Uptime</dt><dd class="mono text-white">{{ formatDuration(currentTelemetry?.uptimeSeconds) }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-[var(--text-dim)]">Ostatni restart</dt><dd class="mono text-right text-white">{{ formatDateTime(currentTelemetry?.lastRestartAt) }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5"><dt class="text-[var(--text-dim)]">GPU</dt><dd class="mono max-w-[240px] truncate text-right text-white">{{ currentTelemetry?.gpu?.model ?? 'brak aktualnych danych' }}</dd></div>
              <div class="flex justify-between gap-4 py-2.5 last:pb-0"><dt class="text-[var(--text-dim)]">Ostatnia akcja</dt><dd class="mono max-w-[240px] truncate text-right text-white">{{ store.selectedDevice.lastRemoteActionResult ?? 'brak' }}</dd></div>
            </dl>
          </section>
        </div>
      </div>

      <div v-else-if="activeTab === 'tools'" class="space-y-4">
        <div class="grid gap-4 xl:grid-cols-2">
          <section class="content-card">
            <div class="flex items-center gap-2 text-sm font-semibold text-white"><Bell class="h-4 w-4 text-cyan-200" /> Powiadomienie</div>
            <p class="mt-1 text-xs text-[var(--text-dim)]">Wyświetl krótką wiadomość użytkownikowi tego komputera.</p>
            <div class="mt-4 flex gap-2">
              <input v-model="store.pendingRemoteNotification" class="soft-input !rounded-xl" placeholder="Treść powiadomienia..." />
              <button class="glass-button !rounded-xl !px-4" type="button" @click="store.requestRemoteNotification()"><Send class="h-4 w-4" /><span class="sr-only">Wyślij</span></button>
            </div>
          </section>

          <section class="content-card">
            <h3 class="text-sm font-semibold text-white">Zarządzanie</h3>
            <p class="mt-1 text-xs text-[var(--text-dim)]">Rzadziej używane akcje administracyjne.</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <button class="ghost-button !rounded-xl !px-3 !py-2.5 text-sm" type="button" @click="store.requestRestartPrompt()"><RefreshCcw class="mr-2 h-4 w-4" /> Restart</button>
              <button class="ghost-button !rounded-xl !px-3 !py-2.5 text-sm" type="button" @click="store.sendDiagnosticsLogs()">Wyślij raport</button>
            </div>
            <div class="mt-4 border-t border-white/10 pt-4">
              <button class="ghost-button w-full !rounded-xl !px-3 !py-2.5 text-sm" type="button" @click="store.requestSelectedDeviceUpdate()">Aktualizuj klienta</button>
            </div>
          </section>
        </div>

        <section class="content-card">
          <div class="flex items-center gap-2 text-sm font-semibold text-white"><TerminalSquare class="h-4 w-4 text-cyan-200" /> Terminal serwisowy</div>
          <p class="mt-1 text-xs text-[var(--text-dim)]">Zaawansowane polecenia diagnostyczne.</p>
          <textarea v-model="store.pendingTerminalCommand" class="soft-input mt-4 min-h-28 resize-none rounded-xl font-mono" placeholder="Wpisz polecenie diagnostyczne..." />
          <div class="mt-3 flex justify-end"><button class="glass-button !rounded-xl" type="button" @click="store.queueTerminalCommand()">Wyślij komendę</button></div>
        </section>
        <article v-for="command in store.commandHistory[store.selectedDevice.deviceId] ?? []" :key="command.id" class="content-card">
          <div class="flex items-center justify-between"><span class="mono text-xs text-cyan-200">{{ command.shell }}</span><StatusPill :label="command.status" :tone="command.status === 'completed' ? 'success' : command.status === 'failed' ? 'critical' : 'warning'" /></div>
          <div class="mt-2 font-mono text-sm text-white">{{ command.command }}</div>
          <pre class="mt-3 overflow-auto rounded-xl bg-black/25 p-3 text-xs text-[var(--text-dim)]">{{ command.output || command.error || 'Oczekiwanie na wynik...' }}</pre>
        </article>
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
              <div class="flex justify-between gap-3"><dt>Agent DWService</dt><dd class="mono text-white">{{ store.selectedDevice.dwservice?.status ?? 'nieprzypisany' }}</dd></div>
              <div class="flex justify-between gap-3"><dt>Ostatnia zmiana</dt><dd class="mono text-right text-white">{{ formatDateTime(store.selectedDevice.dwservice?.updatedAt) }}</dd></div>
            </dl>
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

    <Teleport to="body">
      <div v-if="showArchiveConfirm" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="presentation" @click.self="showArchiveConfirm = false">
        <section class="w-full max-w-md rounded-2xl border border-rose-300/20 bg-[#100d1c] p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="archive-device-title">
          <div class="flex items-start gap-3">
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-200"><Trash2 class="h-5 w-5" /></span>
            <div>
              <h2 id="archive-device-title" class="text-base font-semibold text-white">Usunąć komputer?</h2>
              <p class="mt-2 text-sm leading-6 text-[var(--text-dim)]">
                <strong class="text-white">{{ formatDeviceLabelForMaster(store.selectedDevice) }}</strong> zniknie z aktywnych komputerów. Wiadomości, zgłoszenia i historia zostaną zachowane w archiwum i nie będą wpływać na bieżące liczniki.
              </p>
              <p class="mt-2 text-xs leading-5 text-amber-100/80">Agent na tym komputerze zostanie wyrejestrowany przy najbliższej synchronizacji.</p>
            </div>
          </div>
          <p v-if="archiveError" class="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{{ archiveError }}</p>
          <div class="mt-5 flex justify-end gap-2">
            <button class="ghost-button !rounded-xl !px-4 !py-2 text-sm" type="button" :disabled="archiveBusy" @click="showArchiveConfirm = false">Anuluj</button>
            <button class="inline-flex items-center rounded-xl border border-rose-300/25 bg-rose-500/15 px-4 py-2 text-sm font-medium text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-wait disabled:opacity-60" type="button" :disabled="archiveBusy" @click="confirmArchiveDevice">
              <Trash2 class="mr-2 h-4 w-4" /> {{ archiveBusy ? 'Usuwanie…' : 'Usuń i archiwizuj' }}
            </button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>
