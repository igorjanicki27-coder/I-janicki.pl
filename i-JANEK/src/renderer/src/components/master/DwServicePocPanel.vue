<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DwServicePocStatus } from '@shared/ipc'

const emit = defineEmits<{ close: [] }>()
const viewport = ref<HTMLElement | null>(null)
const status = ref<DwServicePocStatus>({ state: 'loading', popupCount: 0 })
let stopStatus: (() => void) | null = null
let observer: ResizeObserver | null = null

function syncBounds() {
  const rect = viewport.value?.getBoundingClientRect()
  if (!rect) return
  void window.janek.dwServicePoc.setBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
}

async function close() {
  await window.janek.dwServicePoc.close()
  emit('close')
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
    syncBounds()
  } catch (error) {
    status.value = { state: 'error', popupCount: 0, error: error instanceof Error ? error.message : String(error) }
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', syncBounds)
  stopStatus?.()
  void window.janek.dwServicePoc.close()
})
</script>

<template>
  <div class="fixed inset-0 z-[100] flex flex-col bg-[#070b14] text-white">
    <div class="flex min-h-[92px] flex-wrap items-center gap-3 border-b border-white/15 px-5 py-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold">Agenci — DWService</h2>
        <p class="mt-1 truncate text-xs text-white/60">{{ status.url || 'https://www.dwservice.net/' }} · {{ status.state === 'error' ? 'Błąd' : status.state === 'loading' ? 'Ładowanie' : status.popupCount ? 'Nowa karta wewnątrz i-JANEK' : 'Widok w i-JANEK' }}</p>
        <p v-if="status.error" class="mt-1 text-xs text-rose-200">{{ status.error }}</p>
      </div>
      <button class="ghost-button !h-9" type="button" @click="goBack">Wstecz</button>
      <button v-if="status.popupCount" class="ghost-button !h-9" type="button" @click="closePopup">Zamknij kartę</button>
      <button class="glass-button !h-9" type="button" @click="close">Zamknij</button>
    </div>
    <div ref="viewport" class="min-h-0 flex-1 bg-white" aria-label="Widok strony DWService"></div>
  </div>
</template>
