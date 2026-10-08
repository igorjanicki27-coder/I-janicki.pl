<script setup lang="ts">
import { computed } from 'vue'
import LocalDiskUsage from '@/components/LocalDiskUsage.vue'
import { getMaxLocalDiskUsage } from '@shared/disk-telemetry'
import { AlertTriangle, Cpu, HardDrive, MemoryStick, Workflow } from 'lucide-vue-next'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { isDeviceOnline } from '@/services/device-presence'
import { useAppStore } from '@/stores/app'
import type { DeviceRecord } from '@shared/contracts'

interface MetricThreshold {
  warning: number
  critical: number
}

interface MetricThresholds {
  cpuUsage: MetricThreshold
  gpuUsage: MetricThreshold
  ramUsage: MetricThreshold
  diskUsage: MetricThreshold
  cpuTemp: MetricThreshold
  gpuTemp: MetricThreshold
}

const props = defineProps<{
  device: DeviceRecord
  selected?: boolean
  alertCount?: number
  thresholds: MetricThresholds
}>()
const store = useAppStore()

const isOnline = computed(() => isDeviceOnline(props.device, store.statusNow))
const liveTelemetry = computed(() => isOnline.value ? props.device.telemetry : undefined)
const maxDiskUsage = computed(() => getMaxLocalDiskUsage(liveTelemetry.value?.disks))
function metricState(value: number | null | undefined, threshold: MetricThreshold) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0
  if (value >= threshold.critical) return 2
  if (value >= threshold.warning) return 1
  return 0
}

function metricClassesFromState(state: number) {
  if (state >= 2) return 'border-rose-400/35 bg-rose-500/12 text-rose-100'
  if (state >= 1) return 'border-amber-400/35 bg-amber-500/12 text-amber-100'
  return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
}

function metricClasses(value: number | null | undefined, threshold: MetricThreshold) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'border-white/10 bg-white/5 text-[var(--text-dim)]'
  }
  if (value >= threshold.critical) {
    return 'border-rose-400/35 bg-rose-500/12 text-rose-100'
  }
  if (value >= threshold.warning) {
    return 'border-amber-400/35 bg-amber-500/12 text-amber-100'
  }
  return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
}

const cpuTileClass = computed(() => {
  if (!liveTelemetry.value) return metricClasses(undefined, props.thresholds.cpuUsage)
  const usageState = metricState(liveTelemetry.value.cpuUsagePercent, props.thresholds.cpuUsage)
  const tempState = metricState(liveTelemetry.value.cpuTemperatureC, props.thresholds.cpuTemp)
  return metricClassesFromState(Math.max(usageState, tempState))
})

const gpuTileClass = computed(() => {
  if (!liveTelemetry.value) return metricClasses(undefined, props.thresholds.gpuUsage)
  const usageState = metricState(liveTelemetry.value.gpu?.usagePercent, props.thresholds.gpuUsage)
  const tempState = metricState(liveTelemetry.value.gpu?.temperatureC, props.thresholds.gpuTemp)
  return metricClassesFromState(Math.max(usageState, tempState))
})

</script>

<template>
  <button
    type="button"
    class="group glass-panel flex w-[clamp(248px,29vw,372px)] shrink-0 flex-col rounded-[24px] border px-3 py-3 text-left transition duration-200 hover:-translate-y-1 sm:px-3.5"
    :class="props.selected ? 'border-cyan-300/45 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.15)]' : 'border-white/10'"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="h-2.5 w-2.5 rounded-full" :class="isOnline ? 'bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.65)]' : 'bg-slate-500'" />
          <div class="display-font truncate text-sm tracking-[0.16em] text-white">{{ formatDeviceLabelForMaster(device) }}</div>
        </div>
        <div class="mt-1 truncate text-xs text-[var(--text-dim)]">{{ device.ownerEmail }}</div>
      </div>

      <div class="flex items-center gap-2">
        <div
          v-if="(props.alertCount ?? 0) > 0"
          class="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-rose-400/35 bg-rose-500/10 px-2 text-rose-100"
        >
          <AlertTriangle class="h-4 w-4" />
        </div>
        <div class="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]" :class="isOnline ? 'border-emerald-400/25 text-emerald-100' : 'border-slate-500/30 text-slate-300'">
          {{ isOnline ? 'online' : 'offline' }}
        </div>
      </div>
    </div>

    <div class="mt-2.5 grid grid-cols-2 gap-1.5">
      <div class="rounded-2xl border px-2.5 py-2" :class="cpuTileClass">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
          <Cpu class="h-3.5 w-3.5" />
          CPU
        </div>
        <div class="mt-1 text-[15px] font-semibold">
          {{ liveTelemetry?.cpuUsagePercent ?? '—' }}<span v-if="liveTelemetry?.cpuUsagePercent != null">%</span>
          |
          {{ liveTelemetry?.cpuTemperatureC ?? '—' }}<span v-if="liveTelemetry?.cpuTemperatureC != null">°C</span>
        </div>
      </div>

      <div class="rounded-2xl border px-2.5 py-2" :class="gpuTileClass">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
          <Workflow class="h-3.5 w-3.5" />
          GPU
        </div>
        <div class="mt-1 text-[15px] font-semibold">
          {{ liveTelemetry?.gpu?.usagePercent ?? '—' }}<span v-if="liveTelemetry?.gpu?.usagePercent != null">%</span>
          |
          {{ liveTelemetry?.gpu?.temperatureC ?? '—' }}<span v-if="liveTelemetry?.gpu?.temperatureC != null">°C</span>
        </div>
      </div>

      <div class="rounded-2xl border px-2.5 py-2" :class="metricClasses(liveTelemetry?.memoryUsedPercent, props.thresholds.ramUsage)">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
          <MemoryStick class="h-3.5 w-3.5" />
          RAM
        </div>
        <div class="mt-1 text-[15px] font-semibold">{{ liveTelemetry?.memoryUsedPercent ?? '—' }}<span v-if="liveTelemetry?.memoryUsedPercent != null">%</span></div>
      </div>

      <div class="rounded-2xl border px-2.5 py-2" :class="metricClasses(maxDiskUsage, props.thresholds.diskUsage)">
        <div class="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
          <HardDrive class="h-3.5 w-3.5" />
          Dyski
        </div>
        <LocalDiskUsage class="mt-1" :disks="liveTelemetry?.disks" :threshold="props.thresholds.diskUsage" compact />
      </div>
    </div>

    <div class="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--text-dim)]">
      <span class="truncate">{{ device.hostname }}</span>
      <span class="mono whitespace-nowrap">sync {{ new Date(device.lastSeenAt).toLocaleTimeString('pl-PL') }}</span>
    </div>
  </button>
</template>
