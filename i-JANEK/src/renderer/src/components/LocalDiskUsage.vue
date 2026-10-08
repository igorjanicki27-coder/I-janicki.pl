<script setup lang="ts">
import { computed } from 'vue'
import type { DiskTelemetry, MetricThreshold } from '@shared/contracts'
import { getLocalDisks } from '@shared/disk-telemetry'

const props = withDefaults(defineProps<{
  disks?: DiskTelemetry[]
  threshold: MetricThreshold
  compact?: boolean
}>(), { disks: () => [], compact: false })
const localDisks = computed(() => getLocalDisks(props.disks))

function usageClass(value: number) {
  if (value >= props.threshold.critical) return 'text-rose-200'
  if (value >= props.threshold.warning) return 'text-amber-200'
  return 'text-emerald-100'
}
</script>

<template>
  <div class="local-disk-usage" :class="{ 'local-disk-usage-compact': compact }" aria-label="Zajętość lokalnych dysków">
    <div v-for="disk in localDisks" :key="disk.mount || disk.fs" class="local-disk-row" :title="`${disk.mount || disk.fs}: ${disk.usedPercent}% zajętego miejsca`">
      <div class="local-disk-label">{{ disk.mount || disk.fs }}</div>
      <b class="local-disk-value" :class="usageClass(disk.usedPercent)">{{ disk.usedPercent }}%</b>
    </div>
    <div v-if="!localDisks.length" class="text-[var(--text-dim)]">—</div>
  </div>
</template>

<style scoped>
.local-disk-usage { display: grid; gap: 0.25rem; min-width: 0; font-size: 0.9rem; line-height: 1.3; }
.local-disk-usage-compact { font-size: 0.75rem; }
.local-disk-row { display: flex; align-items: baseline; justify-content: space-between; gap: 0.4rem; min-width: 0; }
.local-disk-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.local-disk-value { flex-shrink: 0; white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
