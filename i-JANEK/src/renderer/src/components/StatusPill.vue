<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  label: string
  tone?: 'neutral' | 'success' | 'warning' | 'critical'
}>()

const classes = computed(() => {
  switch (props.tone) {
    case 'success':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
    case 'warning':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-100'
    case 'critical':
      return 'border-rose-400/30 bg-rose-500/10 text-rose-100'
    default:
      return 'border-white/10 bg-white/5 text-[var(--text-dim)]'
  }
})
</script>

<template>
  <span class="mono inline-flex items-center rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em]" :class="classes">
    {{ label }}
  </span>
</template>
