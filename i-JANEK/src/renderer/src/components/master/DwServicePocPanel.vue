<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { DwServicePocStatus } from '@shared/ipc'

const props = defineProps<{ suspended?: boolean }>()
const viewport = ref<HTMLElement | null>(null)
const status = ref<DwServicePocStatus>({ state: 'loading', popupCount: 0 })
let stopStatus: (() => void) | null = null
let observer: ResizeObserver | null = null

function syncBounds() {
  if (props.suspended) {
    hideView()
    return
  }
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) return
  void window.janek.dwServicePoc.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
}

function hideView() {
  void window.janek.dwServicePoc.setBounds({ x: 0, y: 0, width: 0, height: 0 })
}

function goBack() {
  void window.janek.dwServicePoc.goBack()
}

function closePopup() {
  void window.janek.dwServicePoc.closePopup()
}

onMounted(async () => {
  stopStatus = window.janek.dwServicePoc.onStatus((next) => { status.value = next })
  await nextTick()
  if (viewport.value) {
    observer = new ResizeObserver(syncBounds)
    observer.observe(viewport.value)
  }
  window.addEventListener('resize', syncBounds)
  try {
    await window.janek.dwServicePoc.open()
    if (props.suspended) hideView()
    else syncBounds()
  } catch (error) {
    status.value = { state: 'error', popupCount: 0, error: error instanceof Error ? error.message : String(error) }
  }
})

watch(
  () => props.suspended,
  async (suspended) => {
    if (suspended) {
      hideView()
      return
    }
    await nextTick()
    syncBounds()
  }
)

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', syncBounds)
  stopStatus?.()
  hideView()
  void window.janek.dwServicePoc.close()
})
</script>

<template>
  <section class="flex h-full min-h-0 flex-col overflow-hidden bg-[#070b14] text-white">
    <div class="flex min-h-[58px] shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="h-2 w-2 rounded-full" :class="status.state === 'error' ? 'bg-rose-400' : status.state === 'loading' ? 'animate-pulse bg-amber-300' : 'bg-emerald-400'" />
          <h2 class="text-sm font-semibold">DWService</h2>
        </div>
        <p class="mt-0.5 truncate text-[11px] text-white/55">{{ status.url || 'https://www.dwservice.net/' }} · {{ status.state === 'error' ? 'Błąd' : status.state === 'loading' ? 'Ładowanie' : status.popupCount ? 'Dodatkowa karta' : 'Panel osadzony w i-JANEK' }}</p>
        <p v-if="status.error" class="mt-1 text-xs text-rose-200">{{ status.error }}</p>
      </div>
      <button class="ghost-button !h-9" type="button" @click="goBack">Wstecz</button>
      <button v-if="status.popupCount" class="ghost-button !h-9" type="button" @click="closePopup">Zamknij kartę</button>
    </div>
    <div ref="viewport" class="min-h-0 flex-1 bg-white" aria-label="Widok strony DWService"></div>
  </section>
</template>
