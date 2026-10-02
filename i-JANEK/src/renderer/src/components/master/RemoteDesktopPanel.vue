<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Copy, KeyRound, RefreshCcw, X } from 'lucide-vue-next'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { DeviceRecord } from '@shared/contracts'

const props = defineProps<{ device: DeviceRecord }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()
const credential = computed(() => store.revealedRemoteAccess[props.device.deviceId] ?? null)
const currentDevice = computed(() => store.devices.find((entry) => entry.deviceId === props.device.deviceId) ?? props.device)
const message = ref('')
const busy = ref(false)

watch(() => currentDevice.value.rustdesk?.encryptedAccess?.ciphertext, () => {
  void reveal()
})

async function reveal() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    await store.revealRemoteAccessCredential(currentDevice.value)
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Nie udało się odszyfrować danych połączenia.'
  } finally {
    busy.value = false
  }
}

async function copy(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    message.value = `Skopiowano: ${label}.`
  } catch {
    message.value = `Nie udało się skopiować: ${label}.`
  }
}

async function retry() {
  if (busy.value) return
  busy.value = true
  message.value = ''
  try {
    await store.requestRustDeskLaunch()
    message.value = 'Ponowiono prośbę o połączenie.'
  } catch (error) {
    message.value = error instanceof Error ? error.message : 'Nie udało się wysłać prośby.'
  } finally {
    busy.value = false
  }
}

void reveal()
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col bg-[#070b14]" role="dialog" aria-modal="true" aria-label="Zdalny pulpit">
    <header class="flex flex-wrap items-center gap-3 border-b border-white/10 bg-[#101725] px-4 py-3">
      <div class="min-w-0 flex-1">
        <h2 class="truncate text-base font-semibold text-white">Zdalny pulpit · {{ formatDeviceLabelForMaster(currentDevice) }}</h2>
        <p class="text-xs text-[var(--text-dim)]">Połączenie pozostaje w oknie i-JANEK.</p>
      </div>
      <button class="ghost-button !rounded-xl !px-3 !py-2 text-xs" type="button" :disabled="busy" @click="retry"><RefreshCcw class="mr-2 h-3.5 w-3.5" /> Ponów prośbę</button>
      <button class="ghost-button !h-9 !w-9 !rounded-xl !px-0" type="button" title="Zamknij zdalny pulpit" @click="emit('close')"><X class="h-4 w-4" /></button>
    </header>
    <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
      <aside class="w-full shrink-0 space-y-3 border-b border-white/10 bg-[#0d1422] p-4 lg:w-72 lg:border-b-0 lg:border-r">
        <p class="text-xs leading-5 text-[var(--text-dim)]">Skopiuj ID do pola w widoku obok, a następnie wpisz hasło. Klient WWW nie udostępnia potwierdzonego sposobu bezpiecznego przekazania hasła jednym kliknięciem. Własny serwer wymaga dostępnego WSS i CORS.</p>
        <template v-if="credential">
          <div class="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <span class="block text-[10px] uppercase tracking-widest text-[var(--text-dim)]">ID połączenia</span>
            <button class="mt-2 flex w-full items-center justify-between gap-2 text-left text-sm text-cyan-100" type="button" @click="copy(credential.rustdeskId, 'ID')"><span class="truncate">{{ credential.rustdeskId }}</span><Copy class="h-4 w-4 shrink-0" /></button>
          </div>
          <div class="rounded-xl border border-white/10 bg-white/[0.035] p-3">
            <span class="block text-[10px] uppercase tracking-widest text-[var(--text-dim)]">Hasło dostępu</span>
            <button class="mt-2 flex w-full items-center justify-between gap-2 text-left text-sm text-cyan-100" type="button" @click="copy(credential.password, 'hasło')"><span class="truncate font-mono">••••••••••••</span><Copy class="h-4 w-4 shrink-0" /></button>
          </div>
        </template>
        <button v-else class="ghost-button w-full !rounded-xl" type="button" :disabled="busy || !currentDevice.rustdesk?.encryptedAccess" @click="reveal"><KeyRound class="mr-2 h-4 w-4" /> {{ busy ? 'Odszyfrowywanie…' : 'Odszyfruj dane połączenia' }}</button>
        <p v-if="message" class="text-xs leading-5 text-amber-100" role="status">{{ message }}</p>
        <p v-if="!currentDevice.consent?.unattendedAccessConsent" class="text-xs leading-5 text-amber-100">Na komputerze klienta pojawi się prośba o zgodę na połączenie.</p>
        <p v-if="!store.isDesktopAgent" class="text-xs leading-5 text-amber-100">W przeglądarce osadzanie może zostać zablokowane przez serwer klienta WWW. W aplikacji desktopowej widok jest osobną, ograniczoną kartą w tym samym oknie.</p>
      </aside>
      <div class="min-h-0 min-w-0 flex-1 bg-white">
        <webview v-if="store.isDesktopAgent" src="https://rustdesk.com/web/" partition="rustdesk-web" class="block h-full w-full" />
        <iframe v-else src="https://rustdesk.com/web/" title="Klient zdalnego pulpitu" referrerpolicy="no-referrer" allow="clipboard-read; clipboard-write" class="block h-full w-full border-0" />
      </div>
    </div>
  </div>
</template>
