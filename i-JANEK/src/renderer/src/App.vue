<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertCircle, AlertTriangle, CheckCircle2, Clock3, Download, KeyRound, LoaderCircle, Minimize2, Settings, ShieldCheck, UserPlus, X } from 'lucide-vue-next'
import MasterDashboard from '@/layouts/MasterDashboard.vue'
import SettingsDrawer from '@/layouts/SettingsDrawer.vue'
import SlaveLayout from '@/layouts/SlaveLayout.vue'
import { useAppStore } from '@/stores/app'
import { CURRENT_CONSENT_POLICY_VERSION } from '@shared/constants'
import type { UpdateStatusPayload } from '@shared/ipc'

const store = useAppStore()
const settingsOpen = ref(false)
const consentAccepted = ref(false)
const remoteCommandsAccepted = ref(false)
const unattendedAccessAccepted = ref(false)
const MIN_DEVICE_ALIAS_LENGTH = 3
const consentValidationMessage = ref('')
const authMode = ref<'login' | 'register'>('login')
const authEmail = ref('')
const authPassword = ref('')
const authPasswordConfirmation = ref('')
const authFullName = ref('')
const authCompanyName = ref('')
const authInstallationLocation = ref('')
const authValidationMessage = ref('')
const updateStatus = ref<UpdateStatusPayload | null>(null)
let updateStatusCleanup: (() => void) | null = null
let updateStatusDismissTimer: ReturnType<typeof setTimeout> | null = null

const updateStatusTone = computed(() => {
  if (updateStatus.value?.status === 'error') return 'border-rose-400/40 bg-rose-950/90 text-rose-100'
  if (updateStatus.value?.status === 'up_to_date') return 'border-emerald-400/35 bg-emerald-950/90 text-emerald-100'
  if (updateStatus.value?.status === 'downloaded') return 'border-cyan-300/40 bg-cyan-950/90 text-cyan-100'
  return 'border-violet-300/35 bg-slate-950/95 text-white'
})

function clearUpdateStatusTimer() {
  if (!updateStatusDismissTimer) return
  clearTimeout(updateStatusDismissTimer)
  updateStatusDismissTimer = null
}

function handleUpdateStatus(status: UpdateStatusPayload) {
  clearUpdateStatusTimer()
  updateStatus.value = status.status === 'idle' ? null : status
  if (['up_to_date', 'error'].includes(status.status)) {
    updateStatusDismissTimer = setTimeout(() => {
      updateStatus.value = null
      updateStatusDismissTimer = null
    }, status.status === 'error' ? 10_000 : 5_000)
  }
}

const needsConsent = computed(
  () => store.user?.role === 'slave' && store.isDesktopAgent && (
    !store.consent ||
    store.consent.policyVersion !== CURRENT_CONSENT_POLICY_VERSION ||
    !store.consent.diagnosticsConsent ||
    !store.consent.remoteCommandConsent
  )
)
const isApprovalBlocked = computed(() => store.isApprovalBlocked)
const isBrowserClient = computed(() => Boolean(store.user && !store.isMaster && !store.isDesktopAgent))
const aliasTooShort = computed(() => {
  const currentLength = store.pendingDeviceAlias.trim().length
  return currentLength > 0 && currentLength < MIN_DEVICE_ALIAS_LENGTH
})
const headerOnlineCount = computed(() => store.devices.filter((device) => Date.now() - device.lastSeenAt < 5 * 60 * 1000).length)
const hasHeaderAlerts = computed(() => store.criticalAlerts.length > 0)
const hasOpenServiceRequests = computed(() => store.openServiceRequests.length > 0)
const slaveHeaderDeviceName = computed(
  () => store.selectedDevice?.deviceAlias || store.selectedDevice?.hostname || store.selfDevice?.deviceAlias || store.selfDevice?.hostname || 'Urządzenie'
)
const slaveHeaderAlertsCount = computed(() => {
  const selectedDeviceId = store.selectedDevice?.deviceId
  if (!selectedDeviceId) return 0
  return store.alerts.filter((alert) => alert.deviceId === selectedDeviceId && alert.severity !== 'info').length
})

function openSlaveAlertModal() {
  window.dispatchEvent(new CustomEvent('i-janek:open-slave-alert-modal'))
}

function openServiceRequests() {
  window.dispatchEvent(new CustomEvent('i-janek:open-service-requests'))
}

async function handleEmailAuth() {
  const email = authEmail.value.trim()
  if (!email || !email.includes('@')) {
    authValidationMessage.value = 'Wpisz poprawny adres e-mail.'
    return
  }
  if (!authPassword.value) {
    authValidationMessage.value = 'Wpisz hasło.'
    return
  }
  if (authMode.value === 'register' && authPassword.value.length < 6) {
    authValidationMessage.value = 'Hasło musi mieć co najmniej 6 znaków.'
    return
  }
  if (authMode.value === 'register' && authFullName.value.trim().length < 2) {
    authValidationMessage.value = 'Podaj imię i nazwisko.'
    return
  }
  if (authMode.value === 'register' && authCompanyName.value.trim().length < 2) {
    authValidationMessage.value = 'Podaj nazwę firmy.'
    return
  }
  if (authMode.value === 'register' && authPassword.value !== authPasswordConfirmation.value) {
    authValidationMessage.value = 'Hasła nie są identyczne.'
    return
  }

  authValidationMessage.value = ''
  if (authMode.value === 'register') {
    await store.registerWithEmail(email, authPassword.value, {
      fullName: authFullName.value.trim(),
      companyName: authCompanyName.value.trim(),
      installationLocation: authInstallationLocation.value.trim()
    })
  }
  else await store.signInWithEmail(email, authPassword.value)
}

async function resetPassword() {
  const email = authEmail.value.trim()
  if (!email || !email.includes('@')) {
    authValidationMessage.value = 'Najpierw wpisz adres e-mail konta.'
    return
  }
  authValidationMessage.value = ''
  if (await store.sendPasswordReset(email)) {
    authValidationMessage.value = 'Wysłaliśmy wiadomość z linkiem do ustawienia nowego hasła.'
  }
}

async function handleAcceptConsent() {
  const companyName = store.pendingCompanyName.trim()
  const aliasLength = store.pendingDeviceAlias.trim().length

  if (aliasLength < MIN_DEVICE_ALIAS_LENGTH) {
    consentValidationMessage.value = 'Nazwa komputera musi mieć co najmniej 3 znaki.'
    return
  }

  if (!companyName) {
    consentValidationMessage.value = 'Wybierz firmę przed akceptacją regulaminu.'
    return
  }

  if (!consentAccepted.value) {
    consentValidationMessage.value = 'Zaznacz zgodę na politykę prywatności i diagnostykę.'
    return
  }

  if (!remoteCommandsAccepted.value) {
    consentValidationMessage.value = 'Zaznacz zgodę na polecenia diagnostyczne i naprawcze.'
    return
  }

  consentValidationMessage.value = ''
  await store.acceptConsent(unattendedAccessAccepted.value)
}

async function acknowledgeApprovalWait() {
  await window.janek.system.hideMainWindow()
}

function approvalStatusLabel(status: string | null) {
  if (status === 'pending') return 'Oczekuje na decyzję'
  if (status === 'approved') return 'Zatwierdzono'
  if (status === 'rejected') return 'Odrzucono'
  return 'Brak statusu'
}

onMounted(async () => {
  if (window.janek?.system?.onUpdateStatus) {
    updateStatusCleanup = window.janek.system.onUpdateStatus(handleUpdateStatus)
    const currentStatus = await window.janek.system.getUpdateStatus()
    handleUpdateStatus(currentStatus)
  }
  void store.bootstrap()
})

onBeforeUnmount(() => {
  updateStatusCleanup?.()
  clearUpdateStatusTimer()
})

watch(
  [() => store.pendingDeviceAlias, () => store.pendingCompanyName, consentAccepted, remoteCommandsAccepted, unattendedAccessAccepted],
  () => {
    if (!consentValidationMessage.value) return
    consentValidationMessage.value = ''
  }
)
</script>

<template>
  <div class="flex h-screen overflow-hidden flex-col">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-3 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="-translate-y-3 opacity-0"
    >
      <div
        v-if="updateStatus"
        class="fixed left-1/2 top-5 z-[100] flex w-[min(92vw,620px)] -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl"
        :class="updateStatusTone"
      >
        <LoaderCircle v-if="updateStatus.status === 'checking'" class="h-5 w-5 shrink-0 animate-spin" />
        <Download v-else-if="['available', 'downloading', 'downloaded'].includes(updateStatus.status)" class="h-5 w-5 shrink-0" />
        <CheckCircle2 v-else-if="updateStatus.status === 'up_to_date'" class="h-5 w-5 shrink-0" />
        <AlertCircle v-else class="h-5 w-5 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-sm font-semibold">
            {{ updateStatus.status === 'checking' ? 'Sprawdzanie aktualizacji' : updateStatus.status === 'error' ? 'Błąd aktualizacji' : 'Aktualizacje i-JANEK' }}
          </div>
          <div class="mt-0.5 text-xs opacity-80">{{ updateStatus.message }}</div>
          <div v-if="updateStatus.status === 'downloading'" class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div class="h-full rounded-full bg-cyan-300 transition-all" :style="{ width: `${updateStatus.percent ?? 0}%` }" />
          </div>
        </div>
        <button
          v-if="!['checking', 'downloading'].includes(updateStatus.status)"
          class="rounded-lg p-1 text-current opacity-60 transition hover:bg-white/10 hover:opacity-100"
          type="button"
          aria-label="Zamknij informację o aktualizacji"
          @click="updateStatus = null"
        >
          <X class="h-4 w-4" />
        </button>
      </div>
    </Transition>
    <header v-if="store.user && !store.isMaster && !needsConsent && !isApprovalBlocked && !isBrowserClient" class="px-5 pt-5">
      <div
        v-if="store.isMaster"
        class="grid min-h-[68px] grid-cols-[130px_130px_1fr_130px_130px_auto] items-center gap-2 rounded-[28px] px-2 py-3"
      >
        <div class="rounded-[14px] border px-3 py-2" :class="hasHeaderAlerts ? 'border-rose-400/50 bg-rose-500/20 shadow-[0_0_20px_rgba(244,63,94,0.3)]' : 'border-white/10 bg-white/5'">
          <div class="mono flex items-center justify-between whitespace-nowrap text-xs uppercase tracking-[0.14em]" :class="hasHeaderAlerts ? 'text-rose-100' : 'text-[var(--text-dim)]'">
            <span>Alerty</span>
            <span class="text-base font-semibold text-white">{{ store.criticalAlerts.length }}</span>
          </div>
        </div>
        <div class="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2">
          <div class="mono flex items-center justify-between whitespace-nowrap text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">
            <span>Online</span>
            <span class="text-base font-semibold text-white">{{ headerOnlineCount }}</span>
          </div>
        </div>
        <div class="display-font text-center text-lg tracking-[0.34em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)]">
          i-JANEK
        </div>
        <div class="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2">
          <div class="mono flex items-center justify-between whitespace-nowrap text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">
            <span>Komputery</span>
            <span class="text-base font-semibold text-white">{{ store.devices.length }}</span>
          </div>
        </div>
        <button
          class="rounded-[14px] border px-3 py-2 text-left transition"
          :class="hasOpenServiceRequests ? 'border-fuchsia-300/45 bg-fuchsia-500/15 shadow-[0_0_18px_rgba(217,70,239,0.22)]' : 'border-white/10 bg-white/5 hover:border-white/20'"
          type="button"
          @click="openServiceRequests()"
        >
          <div class="mono flex items-center justify-between whitespace-nowrap text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">
            <span>Zadania</span>
            <span class="text-base font-semibold text-white">{{ store.openServiceRequests.length }}</span>
          </div>
        </button>
        <div class="justify-self-end flex items-center gap-2">
          <button
            class="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--text-dim)] transition hover:text-white"
            type="button"
            @click="settingsOpen = true"
          >
            <Settings class="h-5 w-5" />
          </button>
        </div>
      </div>
      <div v-else class="relative grid min-h-[68px] grid-cols-[1fr_auto_auto] items-center gap-3 rounded-[28px] px-5 py-4">
        <div class="min-w-0 truncate pr-3 text-sm font-semibold tracking-[0.12em] text-white/85">
          {{ slaveHeaderDeviceName }}
        </div>
        <div
          class="pointer-events-none absolute left-1/2 -translate-x-1/2 display-font text-center text-lg tracking-[0.34em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)]"
        >
          i-JANEK
        </div>
        <button
          v-if="slaveHeaderAlertsCount > 0"
          class="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/12 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-rose-100 transition hover:border-rose-300/45"
          type="button"
          @click="openSlaveAlertModal()"
        >
          <AlertTriangle class="h-3.5 w-3.5" />
          {{ slaveHeaderAlertsCount }}
        </button>
        <div class="justify-self-end flex items-center gap-2 pl-1">
          <button
            class="inline-flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--text-dim)] transition hover:text-white"
            type="button"
            @click="settingsOpen = true"
          >
            <Settings class="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>

    <main
      class="relative flex-1 min-h-0 px-5 pb-5 pt-5"
      :class="store.user && !store.needsDeviceAlias ? 'overflow-hidden' : 'overflow-auto'"
    >
      <div
        v-if="store.offline"
        class="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 glass-panel"
      >
        Brak połączenia z internetem. Wiadomości zostaną wysłane po powrocie sieci.
      </div>

      <div v-if="!store.ready" class="flex h-full items-center justify-center">
        <div class="glass-panel rounded-[32px] px-10 py-8 text-center">
          <div class="display-font text-xl tracking-[0.25em] text-white">Inicjalizacja i-JANEK</div>
          <div class="mt-3 text-sm text-[var(--text-dim)]">Ładowanie środowiska aplikacji.</div>
        </div>
      </div>

      <section v-else-if="!store.user" class="relative mx-auto flex min-h-[calc(100vh-44px)] w-full max-w-5xl flex-col">
        <div class="flex flex-1 items-center justify-center px-8 py-12 text-center lg:px-14 lg:py-16">
          <div class="max-w-2xl">
            <div class="display-font text-4xl tracking-[0.32em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)] lg:text-5xl">
              i-JANEK
            </div>
            <p class="mx-auto mt-6 max-w-xl text-base leading-8 text-[var(--text-dim)]">
              Aplikacja do administrowania Twoim komputerem.
            </p>

            <div class="mt-8 flex justify-center">
              <button class="google-auth-shell" :disabled="store.signingIn" type="button" @click="store.signInWithGoogle()">
                <span class="google-auth-inner">
                  <span class="google-auth-core">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" height="38" width="38" aria-hidden="true">
                      <g fill="none" fill-rule="evenodd">
                        <g fill-rule="nonzero" transform="translate(3 2)">
                          <path
                            fill="#4285F4"
                            d="M57.812 30.152c0-2.426-.197-4.195-.622-6.031H29.496v10.946h16.255c-.328 2.72-2.098 6.817-6.03 9.57l-.055.367 8.756 6.783.607.06c5.571-5.145 8.783-12.716 8.783-21.695"
                          />
                          <path
                            fill="#34A853"
                            d="M29.496 58.992c7.964 0 14.65-2.622 19.533-7.144l-9.308-7.21c-2.49 1.736-5.833 2.949-10.225 2.949-7.8 0-14.42-5.145-16.78-12.257l-.346.03-9.105 7.045-.119.331c4.85 9.635 14.814 16.256 26.35 16.256"
                          />
                          <path
                            fill="#FBBC05"
                            d="M12.716 35.33c-.623-1.836-.983-3.802-.983-5.834 0-2.032.36-3.998.95-5.834l-.016-.391-9.22-7.16-.3.144A29.317 29.317 0 0 0 0 29.496c0 4.752 1.147 9.242 3.146 13.24l9.57-7.406"
                          />
                          <path
                            fill="#EB4335"
                            d="M29.496 11.405c5.539 0 9.275 2.392 11.405 4.392l8.324-8.128C44.113 2.917 37.46 0 29.496 0 17.96 0 7.997 6.62 3.146 16.255l9.537 7.407c2.393-7.112 9.013-12.257 16.813-12.257"
                          />
                        </g>
                      </g>
                    </svg>
                    <span class="google-auth-label">{{ store.signingIn ? 'Logowanie...' : 'Sign In with Google' }}</span>
                  </span>
                </span>
              </button>
            </div>

            <div class="mx-auto my-6 flex max-w-md items-center gap-3 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              <span class="h-px flex-1 bg-white/10" />
              albo e-mail
              <span class="h-px flex-1 bg-white/10" />
            </div>

            <form class="mx-auto max-w-md rounded-[28px] border border-white/10 bg-white/[0.035] p-4 text-left" @submit.prevent="handleEmailAuth()">
              <div class="mb-4 grid grid-cols-2 rounded-2xl bg-black/20 p-1">
                <button
                  class="rounded-xl px-3 py-2 text-sm transition"
                  :class="authMode === 'login' ? 'bg-white/10 text-white' : 'text-[var(--text-dim)]'"
                  type="button"
                  @click="authMode = 'login'; authValidationMessage = ''"
                >
                  Logowanie
                </button>
                <button
                  class="rounded-xl px-3 py-2 text-sm transition"
                  :class="authMode === 'register' ? 'bg-white/10 text-white' : 'text-[var(--text-dim)]'"
                  type="button"
                  @click="authMode = 'register'; authValidationMessage = ''"
                >
                  Nowe konto
                </button>
              </div>
              <template v-if="authMode === 'register'">
                <label class="block text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">
                  Imię i nazwisko
                  <input v-model="authFullName" class="soft-input mt-2" autocomplete="name" placeholder="Jan Kowalski" />
                </label>
                <label class="mt-3 block text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">
                  Nazwa firmy
                  <input v-model="authCompanyName" class="soft-input mt-2" autocomplete="organization" placeholder="Firma Sp. z o.o." />
                </label>
                <label class="mt-3 block text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">
                  Miejsce komputera <span class="normal-case tracking-normal">(opcjonalnie)</span>
                  <input v-model="authInstallationLocation" class="soft-input mt-2" placeholder="np. Biuro Poznań, recepcja" />
                </label>
              </template>
              <label class="mt-3 block text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">
                E-mail
                <input v-model="authEmail" class="soft-input mt-2" type="email" autocomplete="email" placeholder="klient@firma.pl" />
              </label>
              <label class="mt-3 block text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">
                Hasło
                <input
                  v-model="authPassword"
                  class="soft-input mt-2"
                  type="password"
                  :autocomplete="authMode === 'register' ? 'new-password' : 'current-password'"
                  :placeholder="authMode === 'register' ? 'Minimum 6 znaków' : 'Twoje hasło'"
                />
              </label>
              <label v-if="authMode === 'register'" class="mt-3 block text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">
                Powtórz hasło
                <input v-model="authPasswordConfirmation" class="soft-input mt-2" type="password" autocomplete="new-password" />
              </label>
              <p v-if="authValidationMessage" class="mt-3 text-sm text-amber-300">{{ authValidationMessage }}</p>
              <button class="glass-button mt-4 w-full" :disabled="store.signingIn" type="submit">
                <UserPlus v-if="authMode === 'register'" class="mr-2 h-4 w-4" />
                <KeyRound v-else class="mr-2 h-4 w-4" />
                {{ store.signingIn ? 'Proszę czekać...' : authMode === 'register' ? 'Utwórz konto' : 'Zaloguj się' }}
              </button>
              <button v-if="authMode === 'login'" class="mt-3 w-full text-center text-xs text-cyan-200/80 hover:text-cyan-100" type="button" @click="resetPassword()">
                Nie pamiętam hasła
              </button>
            </form>

            <p v-if="store.lastError" class="mt-5 text-sm text-rose-300">{{ store.lastError }}</p>
          </div>
        </div>

        <a
          class="mt-auto block w-full pb-2 text-center text-xs leading-6 tracking-[0.16em] text-[var(--text-dim)] transition hover:text-white lg:pb-4"
          href="https://i-janicki.pl"
          rel="noreferrer noopener"
          target="_blank"
        >
          Design &amp; Development by Igor Janicki | @Własność i-JANICKI.pl
        </a>
      </section>

      <section v-else-if="isBrowserClient" class="mx-auto flex h-full max-w-3xl items-center justify-center">
        <div class="glass-panel w-full rounded-[36px] border border-cyan-300/20 p-7 text-center">
          <div class="mono text-xs uppercase tracking-[0.3em] text-cyan-200">Panel webowy</div>
          <h2 class="mt-3 text-2xl font-semibold text-white">Monitoring wymaga aplikacji na komputerze</h2>
          <p class="mx-auto mt-3 max-w-xl text-sm leading-7 text-[var(--text-dim)]">
            Konto zostało utworzone poprawnie. Zaloguj się tym samym kontem w aplikacji i-JANEK na Windows lub macOS, aby zarejestrować komputer i przesyłać telemetrię. W przeglądarce funkcje systemowe są celowo niedostępne.
          </p>
          <button class="ghost-button mt-6" type="button" @click="store.signOut()">Wyloguj</button>
        </div>
      </section>

      <section v-else-if="needsConsent" class="mx-auto flex h-full max-w-4xl items-center justify-center">
        <div class="glass-panel w-full rounded-[36px] p-6 lg:p-7">
          <div class="mono text-xs uppercase tracking-[0.3em] text-fuchsia-300">Zgody i bezpieczeństwo</div>
          <h2 class="mt-2 text-2xl font-semibold text-white">Zgoda na opiekę informatyczną i-JANEK</h2>
          <div class="mt-3 space-y-3 text-sm leading-6 text-[var(--text-dim)]">
            <p>Dwie pierwsze zgody są wymagane do działania opieki informatycznej. Trzecia jest dobrowolna i decyduje, czy zdalny pulpit ma pytać Cię o zgodę przy każdym połączeniu.</p>
            <ul class="space-y-1.5">
              <li>Uruchamianie zdalnych skryptów naprawczych w celu optymalizacji systemu.</li>
              <li>Synchronizację wybranych folderów z Twoim kontem Google Drive w celach backupu.</li>
              <li>Realizację zdalnej diagnostyki: odczyt temperatury, obciążenia procesora i stanu dysków.</li>
              <li>Zdalny pulpit bez kolejnego pytania podczas każdej sesji — tylko po akceptacji urządzenia przez administratora.</li>
              <li>Przesyłanie logów systemowych, listy procesów i stanu antywirusa do panelu administratora i-JANICKI.pl.</li>
              <li>Przetwarzanie danych, zgodnie z Polityką Prywatności i cookies, a także RODO, które znajdziesz na stronie i-JANICKI.pl.</li>
            </ul>
          </div>
          <div class="mt-5 grid gap-2 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="grid grid-cols-2 gap-3 text-sm text-[var(--text-dim)]">
              <span>Firma</span>
              <span>Nazwa komputera</span>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <input v-model="store.pendingCompanyName" class="soft-input !py-2" placeholder="Nazwa firmy" />
              <input
                v-model="store.pendingDeviceAlias"
                class="soft-input !py-2"
                placeholder="np. Studio-PC / Laptop-Biuro"
                maxlength="48"
              />
              <p v-if="aliasTooShort" class="mt-2 text-xs text-amber-300">
                Nazwa komputera musi mieć co najmniej 3 znaki.
              </p>
            </div>
            <label class="mt-2 block text-sm text-[var(--text-dim)]">
              Miejsce komputera <span class="text-xs">(opcjonalnie)</span>
              <input
                v-model="store.pendingInstallationLocation"
                class="soft-input mt-2 !py-2"
                placeholder="np. Biuro Poznań, recepcja"
                maxlength="120"
              />
            </label>
          </div>
          <label class="mt-3 flex items-center gap-3 rounded-[24px] border border-white/10 bg-white/5 p-3 text-[var(--text-dim)]">
            <input v-model="consentAccepted" type="checkbox" class="h-4 w-4 shrink-0 accent-fuchsia-500" />
            <span class="text-[13px] leading-5"><strong class="text-white">Wymagane.</strong> Akceptuję politykę prywatności oraz diagnostykę i backup zgodnie z powyższą informacją.</span>
          </label>
          <label class="mt-2 flex items-start gap-3 rounded-[20px] border border-white/10 bg-white/5 p-3 text-[var(--text-dim)]">
            <input v-model="remoteCommandsAccepted" type="checkbox" class="mt-1 h-4 w-4 shrink-0 accent-fuchsia-500" />
            <span class="text-[13px] leading-5"><strong class="text-white">Wymagane.</strong> Zezwalam zaakceptowanemu administratorowi na uruchamianie poleceń diagnostycznych i naprawczych. Każde polecenie i wynik są zapisywane w historii audytowej.</span>
          </label>
          <label class="mt-2 flex items-start gap-3 rounded-[20px] border border-cyan-300/20 bg-cyan-400/5 p-3 text-[var(--text-dim)]">
            <input v-model="unattendedAccessAccepted" type="checkbox" class="mt-1 h-4 w-4 shrink-0 accent-cyan-400" />
            <span class="text-[13px] leading-5"><strong class="text-cyan-100">Opcjonalne.</strong> Zezwalam na zdalny pulpit bez pytania przy każdej sesji. Bez tej zgody aplikacja poprosi mnie o potwierdzenie każdego połączenia. Ustawienie można później zmienić.</span>
          </label>
          <p v-if="consentValidationMessage" class="mt-3 text-center text-sm text-amber-300">
            {{ consentValidationMessage }}
          </p>
          <div class="mt-6 flex justify-center">
            <button
              class="glass-button flex items-center justify-center text-center"
              type="button"
              @click="handleAcceptConsent()"
            >
              Akceptuję i przechodzę dalej
            </button>
          </div>
        </div>
      </section>

      <section v-else-if="isApprovalBlocked" class="mx-auto flex h-full max-w-4xl items-center justify-center">
        <div class="glass-panel relative w-full overflow-hidden rounded-[36px] border border-amber-300/25 bg-black/35 p-7 lg:p-10">
          <div class="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
          <div class="relative flex flex-col items-center text-center">
            <div class="flex h-16 w-16 items-center justify-center rounded-3xl border border-amber-300/30 bg-amber-400/10 text-amber-100 shadow-[0_0_35px_rgba(251,191,36,0.12)]">
              <Clock3 v-if="store.approvalGateStatus === 'pending'" class="h-8 w-8" />
              <ShieldCheck v-else class="h-8 w-8" />
            </div>
            <div class="mono mt-5 text-xs uppercase tracking-[0.3em] text-amber-200">Weryfikacja urządzenia</div>
            <h2 class="mt-3 text-3xl font-semibold text-white">
              {{ store.approvalGateStatus === 'pending' ? 'Prośba została wysłana' : 'Administrator odrzucił rejestrację' }}
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-dim)]">
              {{ store.approvalGateStatus === 'pending'
                ? 'Możesz bezpiecznie zminimalizować aplikację. Gdy administrator zaakceptuje lub odrzuci urządzenie, otrzymasz powiadomienie systemowe.'
                : 'Sprawdź dane urządzenia albo skontaktuj się z administratorem. Możesz wyrejestrować komputer i wysłać nową prośbę.' }}
            </p>
          </div>
          <div class="relative mx-auto mt-7 max-w-2xl rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm text-[var(--text-dim)]">
            <div class="flex items-center justify-between">
              <span>Status</span>
              <span class="mono text-amber-100">{{ approvalStatusLabel(store.approvalGateStatus) }}</span>
            </div>
            <div class="mt-2 flex items-center justify-between">
              <span>Urządzenie</span>
              <span class="mono text-white">{{ store.selfDevice?.deviceId ?? store.systemContext?.deviceId ?? 'brak' }}</span>
            </div>
          </div>
          <div class="relative mt-7 flex flex-col items-center gap-5">
            <button class="glass-button min-w-64 justify-center shadow-[0_0_28px_rgba(217,70,239,0.24)]" type="button" @click="acknowledgeApprovalWait()">
              <Minimize2 class="mr-2 h-4 w-4" />
              Zrozumiałem — minimalizuj
            </button>
            <div class="flex flex-wrap justify-center gap-x-5 gap-y-2">
              <button class="px-2 py-1 text-xs text-white/30 transition hover:text-white/55" type="button" @click="store.signOut()">
                Wyloguj
              </button>
              <button class="px-2 py-1 text-xs text-white/25 transition hover:text-rose-200/60" type="button" @click="store.deregisterAndSignOut()">
                Wyrejestruj urządzenie i wyloguj
              </button>
            </div>
          </div>
        </div>
      </section>

      <MasterDashboard v-else-if="store.isMaster" @open-settings="settingsOpen = true" />
      <SlaveLayout v-else />
    </main>
    <SettingsDrawer v-if="store.user && !needsConsent && !isApprovalBlocked && !isBrowserClient" :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>
