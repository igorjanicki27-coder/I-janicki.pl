<script setup lang="ts">
import { computed } from 'vue'
import { AlertTriangle, Cpu, HardDrive, MemoryStick, Workflow } from 'lucide-vue-next'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import type { DeviceRecord, MetricThreshold, MetricThresholds } from '@shared/contracts'

const props = defineProps<{
  device: DeviceRecord
  alertCount: number
  thresholds: MetricThresholds
}>()

const emit = defineEmits<{
  open: []
}>()

const online = computed(() => !props.device.offline && Date.now() - props.device.lastSeenAt < 5 * 60 * 1000)
const diskUsage = computed(() => Math.max(...(props.device.telemetry?.disks?.map((disk) => disk.usedPercent) ?? [0])))

function metricClasses(value: number | null | undefined, threshold: MetricThreshold) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  if (value >= threshold.critical) {
    return 'border border-rose-400/35 bg-rose-500/10 text-rose-200 [&_small]:!text-rose-200/70 [&_strong]:!text-rose-100'
  }
  if (value >= threshold.warning) {
    return 'border border-amber-400/35 bg-amber-500/10 text-amber-200 [&_small]:!text-amber-200/70 [&_strong]:!text-amber-100'
  }
  return ''
}

function formatLastSeen(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000)
  if (minutes < 1) return 'przed chwilą'
  if (minutes < 60) return `${minutes} min temu`
  if (minutes < 1440) return `${Math.floor(minutes / 60)} godz. temu`
  return new Date(timestamp).toLocaleDateString('pl-PL')
}

function formatBackup(timestamp?: number) {
  if (!timestamp) return 'brak backupu'
  return new Date(timestamp).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
}
</script>

<template>
  <article
    class="computer-tile group cursor-pointer"
    role="button"
    tabindex="0"
    @click="emit('open')"
    @keydown.enter="emit('open')"
    @keydown.space.prevent="emit('open')"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="online ? 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,.5)]' : 'bg-slate-600'" />
          <h3 class="truncate text-base font-semibold text-white">{{ formatDeviceLabelForMaster(device) }}</h3>
        </div>
        <p class="mt-1 truncate text-xs text-[var(--text-dim)]">{{ device.installationLocation || device.hostname }}</p>
      </div>
      <span v-if="alertCount" class="inline-flex items-center gap-1 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2 py-1 text-[10px] font-medium text-amber-100">
        <AlertTriangle class="h-3 w-3" /> {{ alertCount }}
      </span>
    </div>

    <div class="mt-4 grid grid-cols-4 gap-2">
      <div class="tile-metric" :class="metricClasses(device.telemetry?.cpuUsagePercent, thresholds.cpuUsage)"><Cpu class="h-3.5 w-3.5" /><span>CPU</span><strong>{{ device.telemetry?.cpuUsagePercent ?? '—' }}<small v-if="device.telemetry?.cpuUsagePercent != null">%</small></strong></div>
      <div class="tile-metric" :class="metricClasses(device.telemetry?.gpu?.usagePercent, thresholds.gpuUsage)"><Workflow class="h-3.5 w-3.5" /><span>GPU</span><strong>{{ device.telemetry?.gpu?.usagePercent ?? '—' }}<small v-if="device.telemetry?.gpu?.usagePercent != null">%</small></strong></div>
      <div class="tile-metric" :class="metricClasses(device.telemetry?.memoryUsedPercent, thresholds.ramUsage)"><MemoryStick class="h-3.5 w-3.5" /><span>RAM</span><strong>{{ device.telemetry?.memoryUsedPercent ?? '—' }}<small v-if="device.telemetry?.memoryUsedPercent != null">%</small></strong></div>
      <div class="tile-metric" :class="metricClasses(diskUsage, thresholds.diskUsage)"><HardDrive class="h-3.5 w-3.5" /><span>Dysk</span><strong>{{ diskUsage }}<small>%</small></strong></div>
    </div>

    <div class="mt-4 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
      <div class="min-w-0 text-[11px] text-[var(--text-dim)]">
        <span class="block truncate">{{ online ? 'Online' : `Offline · ${formatLastSeen(device.lastSeenAt)}` }}</span>
        <span class="mt-0.5 block truncate text-white/45">Backup: {{ formatBackup(device.backupSnapshot?.scannedAt) }}</span>
      </div>
      <span class="shrink-0 rounded-lg px-2 py-1 text-[10px] font-medium" :class="device.dwservice?.status === 'ready' ? 'bg-emerald-400/10 text-emerald-200' : 'bg-white/[0.055] text-white/50'">
        Agent: {{ device.dwservice?.status === 'ready' ? 'gotowy' : 'oczekuje' }}
      </span>
    </div>
  </article>
</template>
