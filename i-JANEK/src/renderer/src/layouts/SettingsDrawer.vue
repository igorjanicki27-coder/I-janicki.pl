<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BellRing, Building2, ChevronDown, ChevronRight, Download, Gauge, LogOut, RefreshCw, Stethoscope, UserPlus, X } from 'lucide-vue-next'
import AppFooterLink from '@/components/AppFooterLink.vue'
import CompanyManagementPanel from '@/components/master/CompanyManagementPanel.vue'
import RegistrationWorkspace from '@/components/master/RegistrationWorkspace.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useAppStore } from '@/stores/app'
import type { MetricThreshold, MetricThresholds } from '@shared/contracts'
import { METRIC_THRESHOLD_LIMITS, type MetricThresholdKey } from '@shared/thresholds'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()

const checkingUpdates = ref(false)
const savingDiagnostics = ref(false)
const activeSettingsPanel = ref<'registrations' | 'companies' | 'thresholds' | 'notifications' | 'support' | null>(null)

type ThresholdKind = keyof MetricThreshold
type ThresholdDrafts = Record<MetricThresholdKey, Record<ThresholdKind, string>>

const thresholdRows: Array<{ metric: MetricThresholdKey; label: string }> = [
  { metric: 'cpuUsage', label: 'CPU użycie (%)' },
  { metric: 'gpuUsage', label: 'GPU użycie (%)' },
  { metric: 'ramUsage', label: 'RAM (%)' },
  { metric: 'diskUsage', label: 'Dysk (%)' },
  { metric: 'cpuTemp', label: 'CPU temperatura (°C)' },
  { metric: 'gpuTemp', label: 'GPU temperatura (°C)' }
]

function createThresholdDrafts(thresholds: MetricThresholds): ThresholdDrafts {
  return Object.fromEntries(thresholdRows.map(({ metric }) => [
    metric,
    {
      warning: String(thresholds[metric].warning),
      critical: String(thresholds[metric].critical)
    }
  ])) as ThresholdDrafts
}

const thresholdDrafts = ref(createThresholdDrafts(store.masterSettings.thresholds))

const enabledNotificationCategories = computed(() => {
  if (store.slaveSettings.muteAllNotifications) return 0
  let enabled = 0
  if (!store.slaveSettings.muteChatSounds) enabled += 1
  if (!store.slaveSettings.muteSystemNotifications) enabled += 1
  if (!store.slaveSettings.hideAlertNotifications && !store.slaveSettings.muteUsageNotifications) enabled += 1
  if (!store.slaveSettings.hideAlertNotifications && !store.slaveSettings.muteTempNotifications) enabled += 1
  return enabled
})

const syncStateLabel = computed(() => {
  return store.syncState === 'offline' ? 'offline' : 'connected'
})

const slaveDevice = computed(() => {
  if (!store.user) return null
  if (store.user.role === 'slave' && store.systemContext) {
    return store.devices.find((entry) => entry.deviceId === store.systemContext?.deviceId) ?? store.selectedDevice
  }
  return store.selectedDevice
})

watch(
  () => props.open,
  (open) => {
    if (!open) {
      activeSettingsPanel.value = null
    }
  },
  { immediate: true }
)

function closeSettingsPanel() {
  activeSettingsPanel.value = null
}

function openThresholdsPanel() {
  thresholdDrafts.value = createThresholdDrafts(store.masterSettings.thresholds)
  activeSettingsPanel.value = 'thresholds'
}

function thresholdFieldError(metric: MetricThresholdKey, kind: ThresholdKind) {
  const rawValue = thresholdDrafts.value[metric][kind].trim()
  if (!rawValue) return 'Wpisz liczbę.'

  const value = Number(rawValue)
  if (!Number.isFinite(value)) return 'Wpisz poprawną liczbę.'

  const { min, max } = METRIC_THRESHOLD_LIMITS[metric]
  if (value < min || (max !== undefined && value > max)) {
    return max === undefined ? `Minimum: ${min}.` : `Zakres: ${min}–${max}.`
  }

  const otherKind: ThresholdKind = kind === 'warning' ? 'critical' : 'warning'
  const otherValue = Number(thresholdDrafts.value[metric][otherKind])
  if (!Number.isFinite(otherValue)) return null

  if (kind === 'warning' && value >= otherValue) return 'Musi być niższy od krytycznego.'
  if (kind === 'critical' && value <= otherValue) return 'Musi być wyższy od ostrzeżenia.'
  return null
}

function updateThresholdDraft(metric: MetricThresholdKey, kind: ThresholdKind, event: Event) {
  thresholdDrafts.value[metric][kind] = (event.target as HTMLInputElement).value
  if (thresholdFieldError(metric, 'warning') || thresholdFieldError(metric, 'critical')) return

  store.updateMetricThreshold(metric, {
    warning: Number(thresholdDrafts.value[metric].warning),
    critical: Number(thresholdDrafts.value[metric].critical)
  })
}

function openRegistrationsPanel() {
  if (store.isMaster) activeSettingsPanel.value = 'registrations'
}

function openUnregisterDialog() {
  window.dispatchEvent(new CustomEvent('i-janek:open-unregister-dialog'))
}

onMounted(() => {
  window.addEventListener('i-janek:open-device-registrations', openRegistrationsPanel)
})

onBeforeUnmount(() => {
  window.removeEventListener('i-janek:open-device-registrations', openRegistrationsPanel)
})

function updateUsageNotifications(enabled: boolean) {
  const alertsWereHidden = store.slaveSettings.hideAlertNotifications
  store.updateSlaveSettings({
    hideAlertNotifications: enabled ? false : alertsWereHidden,
    muteUsageNotifications: !enabled,
    ...(enabled && alertsWereHidden ? { muteTempNotifications: true } : {})
  })
}

function updateTemperatureNotifications(enabled: boolean) {
  const alertsWereHidden = store.slaveSettings.hideAlertNotifications
  store.updateSlaveSettings({
    hideAlertNotifications: enabled ? false : alertsWereHidden,
    muteTempNotifications: !enabled,
    ...(enabled && alertsWereHidden ? { muteUsageNotifications: true } : {})
  })
}


async function checkForUpdatesNow() {
  if (checkingUpdates.value) return
  checkingUpdates.value = true
  try {
    const result = await window.janek.system.checkForUpdates(store.slaveSettings.silentUpdates)
    if (result.status !== 'downloading') window.alert(result.message)
  } catch (error) {
    window.alert(`Nie udało się sprawdzić aktualizacji: ${String(error)}`)
  } finally {
    checkingUpdates.value = false
  }
}

async function saveDiagnostics() {
  if (savingDiagnostics.value) return
  savingDiagnostics.value = true
  try {
    await store.sendDiagnosticsLogs()
  } catch (error) {
    window.alert(`Nie udało się utworzyć paczki diagnostycznej: ${String(error)}`)
  } finally {
    savingDiagnostics.value = false
  }
}

function readinessDot(status: 'ok' | 'warning' | 'error' | 'skipped') {
  if (status === 'ok') return 'bg-emerald-400'
  if (status === 'warning') return 'bg-amber-400'
  if (status === 'error') return 'bg-rose-400'
  return 'bg-slate-400'
}

</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex">
    <button class="h-full flex-1 bg-black/55 backdrop-blur-[1px]" type="button" @click="emit('close')" />
    <aside class="glass-panel flex h-full w-full max-w-[560px] flex-col border-l border-white/10 p-5">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="display-font text-lg tracking-[0.2em] text-white">USTAWIENIA</h2>
        <div class="flex items-center gap-2">
          <button class="ghost-button !h-10 !w-10 !rounded-xl !px-0 !py-0" type="button" title="Wyloguj" @click="store.signOut()">
            <LogOut class="h-4 w-4" />
          </button>
          <button class="ghost-button !h-10 !w-10 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="scrollbar-glass flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        <template v-if="store.isMaster">
          <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Zarzadzanie kontem</div>
            <div class="mt-3 space-y-2 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between">
                <span>Email</span>
                <span class="mono text-white">{{ store.user?.email }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Status sesji</span>
                <StatusPill :label="store.sessionStatus" />
              </div>
              <div class="flex items-center justify-between">
                <span>Sync Firebase</span>
                <StatusPill :label="syncStateLabel" />
              </div>
              <div class="flex items-center justify-between">
                <span>Ostatnia synchronizacja</span>
                <span class="mono text-white">{{ store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleTimeString('pl-PL') : '—' }}</span>
              </div>
            </div>
          </section>

          <section class="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              class="group flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-rose-300/30 hover:bg-white/[0.07] sm:col-span-2"
              type="button"
              @click="activeSettingsPanel = 'registrations'"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-300/20 bg-rose-400/10 text-rose-100">
                <UserPlus class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-center gap-2 text-sm font-semibold text-white">Rejestracje<span v-if="store.approvalQueue.length" class="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.65)]" aria-hidden="true" /></span>
                <span class="mt-0.5 block text-xs text-[var(--text-dim)]">{{ store.approvalQueue.length ? `${store.approvalQueue.length} oczekuje na zatwierdzenie` : 'Brak oczekujących urządzeń' }}</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
              <span v-if="store.approvalQueue.length" class="sr-only">Oczekujące rejestracje urządzeń</span>
            </button>
            <button
              class="group flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.07] sm:col-span-2"
              type="button"
              @click="activeSettingsPanel = 'companies'"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                <Building2 class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-white">Firmy</span>
                <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Dodawanie, edycja i usuwanie firm</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
            </button>
            <button
              class="group flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-amber-300/30 hover:bg-white/[0.07]"
              type="button"
              @click="openThresholdsPanel()"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10 text-amber-200">
                <Gauge class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-white">Progi dashboardu</span>
                <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Alerty i telemetria</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
            </button>
            <button
              class="group flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.07]"
              type="button"
              @click="activeSettingsPanel = 'notifications'"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                <BellRing class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-white">Powiadomienia</span>
                <span class="mt-0.5 block text-xs text-[var(--text-dim)]">{{ enabledNotificationCategories }} z 4 typów aktywne</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
            </button>
          </section>

        </template>

        <template v-else>
          <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Dane konta i urządzenia</div>
            <div class="mt-3 divide-y divide-white/[0.07] text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between">
                <span>Email</span>
                <span class="mono max-w-[70%] truncate text-right text-white">{{ store.user?.email ?? '—' }}</span>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span>Nazwa komputera</span>
                <span class="max-w-[65%] truncate text-right text-white">{{ slaveDevice?.deviceAlias?.trim() || slaveDevice?.hostname || '—' }}</span>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span>Firma</span>
                <span class="max-w-[65%] truncate text-right text-white">{{ slaveDevice?.companyName?.trim() || '—' }}</span>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span>Osoba</span>
                <span class="max-w-[65%] truncate text-right text-white">{{ slaveDevice?.contactName?.trim() || store.user?.displayName || '—' }}</span>
              </div>
              <div class="flex items-center justify-between gap-4 py-2.5">
                <span>Lokalizacja</span>
                <span class="max-w-[65%] truncate text-right text-white">{{ slaveDevice?.installationLocation?.trim() || '—' }}</span>
              </div>
            </div>
          </section>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <button
              class="group flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.07]"
              type="button"
              @click="activeSettingsPanel = 'notifications'"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                <BellRing class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-white">Powiadomienia</span>
                <span class="mt-0.5 block text-xs text-[var(--text-dim)]">{{ enabledNotificationCategories }} z 4 typów aktywne</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
            </button>

            <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="text-sm font-semibold text-white">Systemowe</div>
              <div class="mt-3 space-y-3 text-sm text-[var(--text-dim)]">
                <label class="flex items-center justify-between">
                  <span>Autostart</span>
                  <input :checked="store.slaveSettings.autostart" type="checkbox" @change="store.toggleAutostart(($event.target as HTMLInputElement).checked)" />
                </label>
              </div>
            </section>
          </div>
        </template>

        <div class="mt-4 grid gap-2" :class="store.isMaster ? 'grid-cols-2' : 'grid-cols-1'">
          <section v-if="store.isMaster" class="flex min-w-0 items-center gap-2 rounded-[20px] border border-white/10 bg-white/5 p-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-white">Aktualizacja klientów</div>
              <div class="mt-0.5 text-xs text-[var(--text-dim)]">Wszystkie urządzenia</div>
            </div>
            <button class="ghost-button shrink-0 !rounded-xl !px-2.5 !py-2 text-xs" type="button" title="Wymuś aktualizację u wszystkich" @click="store.forceUpdateAllClients()">
              <RefreshCw class="h-3.5 w-3.5" />
              <span class="sr-only">Aktualizuj wszystkie urządzenia</span>
            </button>
          </section>

          <section class="flex min-w-0 items-center gap-2 rounded-[20px] border border-white/10 bg-white/5 p-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-white">Aktualizacja aplikacji</div>
              <div class="mt-0.5 text-xs text-[var(--text-dim)]">Wersja {{ store.systemContext?.appVersion ?? '—' }}</div>
            </div>
            <label v-if="store.isDesktopAgent" class="flex shrink-0 items-center gap-1.5 text-[10px] text-[var(--text-dim)]" title="Pobieraj aktualizacje w tle">
              <span>Ciche</span>
              <input
                :checked="store.slaveSettings.silentUpdates"
                type="checkbox"
                @change="store.updateSlaveSettings({ silentUpdates: ($event.target as HTMLInputElement).checked })"
              />
            </label>
            <button
              class="ghost-button shrink-0 !rounded-xl !px-2.5 !py-2 text-xs"
              type="button"
              title="Sprawdź aktualizacje aplikacji"
              :disabled="checkingUpdates"
              @click="checkForUpdatesNow()"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="checkingUpdates ? 'animate-spin' : ''" />
              <span class="sr-only">{{ checkingUpdates ? 'Sprawdzanie aktualizacji' : 'Sprawdź aktualizacje' }}</span>
            </button>
          </section>
        </div>

        <button
          class="group mt-3 flex w-full items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-3 text-left transition hover:border-fuchsia-300/25 hover:bg-white/[0.07]"
          type="button"
          @click="activeSettingsPanel = 'support'"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100">
            <Stethoscope class="h-4 w-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-white">Pomoc techniczna</span>
            <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Sprawdzenie aplikacji i raport diagnostyczny</span>
          </span>
          <span v-if="store.offlineQueueCount" class="mono shrink-0 rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">
            {{ store.offlineQueueCount }}
          </span>
          <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
        </button>

        <div :class="!store.isMaster && store.isDesktopAgent ? 'mt-auto pt-6' : 'mt-4'">
          <button v-if="!store.isMaster && store.isDesktopAgent" class="w-full py-2 text-center text-[11px] text-white/30 transition hover:text-rose-200/70" type="button" @click="openUnregisterDialog()">Wyrejestruj urządzenie</button>
          <AppFooterLink :class="!store.isMaster && store.isDesktopAgent ? 'mt-2 pb-2 pt-1' : 'pb-2 pt-1'" />
        </div>
      </div>
    </aside>

    <div
      v-if="activeSettingsPanel === 'notifications'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notifications-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel w-full max-w-lg rounded-[28px] border border-cyan-300/20 p-5">
        <header class="flex items-start justify-between gap-4">
          <div>
            <h3 id="notifications-title" class="text-base font-semibold text-white">Powiadomienia</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Wybierz, które powiadomienia i-JANEK mają pojawiać się na tym komputerze.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <label class="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.07] p-4">
          <span>
            <span class="block text-sm font-semibold text-white">Powiadomienia na tym komputerze</span>
            <span class="mt-1 block text-xs leading-5 text-[var(--text-dim)]">Główny przełącznik wszystkich komunikatów systemowych.</span>
          </span>
          <input
            class="shrink-0"
            :checked="!store.slaveSettings.muteAllNotifications"
            type="checkbox"
            @change="store.updateSlaveSettings({ muteAllNotifications: !($event.target as HTMLInputElement).checked })"
          />
        </label>

        <div class="mt-3 space-y-2">
          <label
            class="flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-3 transition"
            :class="store.slaveSettings.muteAllNotifications ? 'opacity-40' : 'hover:border-white/20 hover:bg-white/[0.03]'"
          >
            <span>
              <span class="block text-sm font-medium text-white">Nowe wiadomości</span>
              <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Powiadomienie po otrzymaniu nowej wiadomości na czacie.</span>
            </span>
            <input
              class="shrink-0"
              :checked="!store.slaveSettings.muteChatSounds"
              :disabled="store.slaveSettings.muteAllNotifications"
              type="checkbox"
              @change="store.updateSlaveSettings({ muteChatSounds: !($event.target as HTMLInputElement).checked })"
            />
          </label>

          <label
            class="flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-3 transition"
            :class="store.slaveSettings.muteAllNotifications ? 'opacity-40' : 'hover:border-white/20 hover:bg-white/[0.03]'"
          >
            <span>
              <span class="block text-sm font-medium text-white">Aktualizacje i działanie aplikacji</span>
              <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Aktualizacje, stan połączenia oraz pozostałe komunikaty systemowe.</span>
            </span>
            <input
              class="shrink-0"
              :checked="!store.slaveSettings.muteSystemNotifications"
              :disabled="store.slaveSettings.muteAllNotifications"
              type="checkbox"
              @change="store.updateSlaveSettings({ muteSystemNotifications: !($event.target as HTMLInputElement).checked })"
            />
          </label>

          <label
            class="flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-3 transition"
            :class="store.slaveSettings.muteAllNotifications ? 'opacity-40' : 'hover:border-white/20 hover:bg-white/[0.03]'"
          >
            <span>
              <span class="block text-sm font-medium text-white">Użycie zasobów i dysku</span>
              <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Alerty wysokiego użycia CPU, GPU, RAM i przestrzeni dyskowej.</span>
            </span>
            <input
              class="shrink-0"
              :checked="!store.slaveSettings.hideAlertNotifications && !store.slaveSettings.muteUsageNotifications"
              :disabled="store.slaveSettings.muteAllNotifications"
              type="checkbox"
              @change="updateUsageNotifications(($event.target as HTMLInputElement).checked)"
            />
          </label>

          <label
            class="flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-3 transition"
            :class="store.slaveSettings.muteAllNotifications ? 'opacity-40' : 'hover:border-white/20 hover:bg-white/[0.03]'"
          >
            <span>
              <span class="block text-sm font-medium text-white">Temperatura CPU i GPU</span>
              <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Alerty o przekroczeniu ustawionych progów temperatury.</span>
            </span>
            <input
              class="shrink-0"
              :checked="!store.slaveSettings.hideAlertNotifications && !store.slaveSettings.muteTempNotifications"
              :disabled="store.slaveSettings.muteAllNotifications"
              type="checkbox"
              @change="updateTemperatureNotifications(($event.target as HTMLInputElement).checked)"
            />
          </label>
        </div>

        <p class="mt-3 text-xs leading-5 text-[var(--text-dim)]">Zmiany są zapisywane automatycznie na tym komputerze.</p>
      </section>
    </div>

    <div
      v-if="activeSettingsPanel === 'registrations'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registrations-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-rose-300/20">
        <header class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id="registrations-title" class="flex items-center gap-2 text-base font-semibold text-white">Rejestracje urządzeń<span v-if="store.approvalQueue.length" class="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.65)]" aria-hidden="true" /></h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Urządzenia oczekujące na zatwierdzenie administratora.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto">
          <RegistrationWorkspace />
        </div>
      </section>
    </div>

    <div
      v-if="activeSettingsPanel === 'companies'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="companies-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-cyan-300/20">
        <header class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id="companies-title" class="text-base font-semibold text-white">Firmy</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Zarządzaj firmami i przypisaniem ich nazw do komputerów.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <CompanyManagementPanel />
      </section>
    </div>

    <div
      v-if="activeSettingsPanel === 'thresholds'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="thresholds-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-amber-300/20">
        <header class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id="thresholds-title" class="text-base font-semibold text-white">Progi dashboardu</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Określ, kiedy kafelki zmieniają kolor na ostrzegawczy lub krytyczny.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto p-5">
          <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 px-3 text-[10px] uppercase tracking-[0.14em]">
            <span class="text-[var(--text-dim)]">Metryka</span>
            <span class="text-center text-amber-300">Ostrzeżenie</span>
            <span class="text-center text-rose-300">Krytyczny</span>
          </div>
          <div class="mt-3 space-y-2">
            <div
              v-for="row in thresholdRows"
              :key="row.metric"
              class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-start gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]"
            >
              <span class="pt-2">{{ row.label }}</span>
              <div>
                <input
                  class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200"
                  :class="thresholdFieldError(row.metric, 'warning') ? '!border-rose-400/70' : ''"
                  type="number"
                  step="1"
                  :min="METRIC_THRESHOLD_LIMITS[row.metric].min"
                  :max="METRIC_THRESHOLD_LIMITS[row.metric].max"
                  :value="thresholdDrafts[row.metric].warning"
                  :aria-label="`Ostrzeżenie: ${row.label}`"
                  :aria-invalid="Boolean(thresholdFieldError(row.metric, 'warning'))"
                  @input="updateThresholdDraft(row.metric, 'warning', $event)"
                />
                <p v-if="thresholdFieldError(row.metric, 'warning')" class="mt-1 text-[10px] leading-4 text-rose-300">
                  {{ thresholdFieldError(row.metric, 'warning') }}
                </p>
              </div>
              <div>
                <input
                  class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200"
                  :class="thresholdFieldError(row.metric, 'critical') ? '!border-rose-400/70' : ''"
                  type="number"
                  step="1"
                  :min="METRIC_THRESHOLD_LIMITS[row.metric].min"
                  :max="METRIC_THRESHOLD_LIMITS[row.metric].max"
                  :value="thresholdDrafts[row.metric].critical"
                  :aria-label="`Krytyczny: ${row.label}`"
                  :aria-invalid="Boolean(thresholdFieldError(row.metric, 'critical'))"
                  @input="updateThresholdDraft(row.metric, 'critical', $event)"
                />
                <p v-if="thresholdFieldError(row.metric, 'critical')" class="mt-1 text-[10px] leading-4 text-rose-300">
                  {{ thresholdFieldError(row.metric, 'critical') }}
                </p>
              </div>
            </div>
          </div>

          <label class="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
            <span>
              <span class="block text-white">Częstotliwość telemetrii</span>
              <span class="mt-0.5 block text-xs">Jak często urządzenia przesyłają pomiary.</span>
            </span>
            <span class="relative w-44 shrink-0">
              <select
                class="soft-input !py-2 !pr-9 appearance-none"
                :value="store.masterSettings.telemetryMode"
                @change="store.updateMasterSettings({ telemetryMode: ($event.target as HTMLSelectElement).value as 'standard' | 'aggressive' })"
              >
                <option value="standard">Standardowa (1 h)</option>
                <option value="aggressive">Częsta (10 min)</option>
              </select>
              <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
            </span>
          </label>
        </div>
      </section>
    </div>

    <div
      v-if="activeSettingsPanel === 'support'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-fuchsia-300/20">
        <header class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id="support-title" class="text-base font-semibold text-white">Pomoc techniczna</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Użyj tych narzędzi tylko wtedy, gdy aplikacja nie działa prawidłowo.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto p-5">
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="text-sm font-semibold text-white">Sprawdź działanie aplikacji</div>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Test sprawdza połączenie, konfigurację i wymagane usługi. Niczego nie zmienia i nie wysyła zawartości plików.</p>
            <button
              class="ghost-button mt-3 w-full justify-center !rounded-xl !px-4 !py-2.5 text-sm"
              type="button"
              :disabled="store.readinessRunning"
              @click="store.runReadinessChecks()"
            >
              <RefreshCw class="mr-2 h-4 w-4" :class="store.readinessRunning ? 'animate-spin' : ''" />
              {{ store.readinessRunning ? 'Sprawdzanie...' : 'Sprawdź działanie' }}
            </button>
          </div>

          <div v-if="store.readinessChecks.length" class="mt-3 space-y-2">
            <div v-for="check in store.readinessChecks" :key="check.id" class="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
              <div class="flex items-center gap-2 text-xs font-medium text-white">
                <span class="h-2 w-2 rounded-full" :class="readinessDot(check.status)" />
                {{ check.label }}
              </div>
              <div class="mt-1 pl-4 text-[11px] leading-5 text-[var(--text-dim)]">{{ check.message }}</div>
            </div>
          </div>

          <div class="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="text-sm font-semibold text-white">Zapisz raport dla pomocy technicznej</div>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Raport zawiera stan usług i logi techniczne. Zapisz go, gdy pomoc techniczna poprosi o plik diagnostyczny.</p>
            <button
              class="glass-button mt-3 w-full justify-center !rounded-xl !px-4 !py-2.5 text-sm"
              type="button"
              :disabled="savingDiagnostics"
              @click="saveDiagnostics()"
            >
              <Download class="mr-2 h-4 w-4" />
              {{ savingDiagnostics ? 'Zapisywanie...' : 'Zapisz raport' }}
            </button>
          </div>

          <div v-if="store.offlineQueueCount" class="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-amber-100">Oczekujące dane: {{ store.offlineQueueCount }}</div>
                <p class="mt-1 text-xs leading-5 text-amber-100/70">Dane nie zostały jeszcze zsynchronizowane z powodu braku połączenia.</p>
              </div>
              <button
                class="ghost-button shrink-0 !rounded-xl !px-3 !py-2 text-xs"
                type="button"
                :disabled="store.flushingOfflineQueue || store.offline"
                @click="store.flushOfflineQueue(true)"
              >
                {{ store.flushingOfflineQueue ? 'Synchronizuję...' : store.offline ? 'Brak sieci' : 'Ponów' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

  </div>
</template>
