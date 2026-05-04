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
    class="glass-panel flex w-full flex-col rounded-[24px] border p-4 text-left transition duration-200 hover:-translate-y-1"
    :class="selected ? 'border-fuchsia-400/40 bg-fuchsia-400/10' : 'border-white/10'"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="display-font text-sm tracking-[0.18em] text-white">{{ device.hostname }}</div>
        <div class="mt-1 text-xs text-[var(--text-dim)]">{{ device.ownerEmail }}</div>
      </div>
      <StatusPill :label="device.approvalStatus" :tone="tone" />
    </div>

    <div class="mt-4 grid grid-cols-3 gap-2 text-center">
      <div class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
        <div class="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
          <Thermometer class="h-3.5 w-3.5 text-fuchsia-300" />
          CPU
        </div>
        <div class="mt-2 text-lg font-semibold text-white">{{ device.telemetry?.cpuTemperatureC ?? '—' }}°</div>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
        <div class="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
          <Activity class="h-3.5 w-3.5 text-fuchsia-300" />
          RAM
        </div>
        <div class="mt-2 text-lg font-semibold text-white">{{ device.telemetry?.memoryUsedPercent ?? '—' }}%</div>
      </div>
      <div class="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
        <div class="flex items-center justify-center gap-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
          <HardDrive class="h-3.5 w-3.5 text-fuchsia-300" />
          Dysk
        </div>
        <div class="mt-2 text-lg font-semibold text-white">{{ device.telemetry?.disks?.[0]?.usedPercent ?? '—' }}%</div>
      </div>
    </div>

    <div class="mt-3 flex items-center justify-between text-xs text-[var(--text-dim)]">
      <span class="truncate">{{ device.deviceId }}</span>
      <span class="mono whitespace-nowrap">{{ new Date(device.lastSeenAt).toLocaleTimeString('pl-PL') }}</span>
    </div>
  </button>
</template>
