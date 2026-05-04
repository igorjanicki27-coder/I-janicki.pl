<script setup lang="ts">
import { computed } from 'vue'
import { Activity, HardDrive, Thermometer } from 'lucide-vue-next'
import type { DeviceRecord } from '@shared/contracts'
import StatusPill from '@/components/StatusPill.vue'

const props = defineProps<{
  device: DeviceRecord
  selected?: boolean
}>()

const tone = computed(() => {
  if (props.device.approvalStatus === 'pending') return 'warning'
  if (props.device.telemetry?.state === 'alert') return 'critical'
  if (props.device.telemetry?.state === 'warning') return 'warning'
  return 'success'
})
</script>

<template>
  <button
    type="button"
    class="glass-panel flex w-full flex-col rounded-[28px] border p-5 text-left transition duration-200 hover:-translate-y-1"
    :class="selected ? 'border-cyan-300/40 bg-cyan-300/10' : 'border-white/10'"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="display-font text-lg tracking-[0.2em] text-white">{{ device.hostname }}</div>
        <div class="mono mt-1 text-xs uppercase tracking-[0.15em] text-[var(--text-dim)]">{{ device.deviceId }}</div>
      </div>
      <StatusPill :label="device.approvalStatus" :tone="tone" />
    </div>

    <div class="mt-5 grid gap-3 md:grid-cols-3">
      <div class="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div class="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
          <Thermometer class="h-4 w-4 text-cyan-300" />
          CPU
        </div>
        <div class="mt-2 text-2xl font-semibold text-white">
          {{ device.telemetry?.cpuTemperatureC ?? '—' }}<span class="text-base text-[var(--text-dim)]">°C</span>
        </div>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div class="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
          <Activity class="h-4 w-4 text-cyan-300" />
          RAM
        </div>
        <div class="mt-2 text-2xl font-semibold text-white">{{ device.telemetry?.memoryUsedPercent ?? '—' }}<span class="text-base text-[var(--text-dim)]">%</span></div>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/5 p-3">
        <div class="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
          <HardDrive class="h-4 w-4 text-cyan-300" />
          Disk
        </div>
        <div class="mt-2 text-2xl font-semibold text-white">
          {{ device.telemetry?.disks?.[0]?.usedPercent ?? '—' }}<span class="text-base text-[var(--text-dim)]">%</span>
        </div>
      </div>
    </div>

    <div class="mt-4 flex items-center justify-between text-sm text-[var(--text-dim)]">
      <span>{{ device.ownerEmail }}</span>
      <span class="mono">{{ new Date(device.lastSeenAt).toLocaleString('pl-PL') }}</span>
    </div>
  </button>
</template>
