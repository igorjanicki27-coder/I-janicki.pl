<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { MonitorCog, MoonStar, SunMedium } from 'lucide-vue-next'
import MasterLayout from '@/layouts/MasterLayout.vue'
import SlaveLayout from '@/layouts/SlaveLayout.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()

const needsConsent = computed(() => store.user?.role === 'slave' && !store.consent)

onMounted(() => {
  void store.bootstrap()
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="mx-6 mt-6 flex items-center justify-between rounded-[28px] border border-white/10 px-6 py-4 glass-panel">
      <div class="flex items-center gap-4">
        <div class="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-white/5">
          <MonitorCog class="h-6 w-6 text-cyan-300" />
        </div>
        <div>
          <div class="display-font text-lg tracking-[0.35em] text-white/90">i-JANEK</div>
          <div class="mono text-xs uppercase tracking-[0.25em] text-[var(--text-dim)]">
            Master / Slave Desktop Suite
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div v-if="store.user" class="hidden rounded-2xl border border-white/10 px-4 py-2 text-right text-sm text-[var(--text-dim)] lg:block">
          <div class="font-medium text-[var(--text)]">{{ store.user.displayName }}</div>
          <div class="mono text-xs uppercase tracking-[0.2em]">{{ store.user.role }}</div>
        </div>
        <button
          class="glass-button h-11 w-11 rounded-2xl border p-0"
          type="button"
          @click="store.applyTheme(store.theme === 'dark' ? 'light' : 'dark')"
        >
          <MoonStar v-if="store.theme === 'dark'" class="h-5 w-5" />
          <SunMedium v-else class="h-5 w-5" />
        </button>
      </div>
    </header>

    <main class="relative flex-1 overflow-hidden px-6 pb-6 pt-5">
      <div
        v-if="store.offline"
        class="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 glass-panel"
      >
        Brak połączenia z internetem. Wiadomości zostaną wysłane po powrocie sieci.
      </div>

      <div v-if="!store.ready" class="flex h-full items-center justify-center">
        <div class="glass-panel rounded-[32px] px-10 py-8 text-center">
          <div class="display-font text-xl tracking-[0.25em] text-cyan-200">Inicjalizacja i-JANEK</div>
          <div class="mt-3 text-sm text-[var(--text-dim)]">Ładowanie środowiska Electron, Firebase i usług systemowych.</div>
        </div>
      </div>

      <section v-else-if="!store.user" class="mx-auto flex h-full max-w-6xl items-center justify-center">
        <div class="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div class="glass-panel rounded-[36px] p-8 lg:p-10">
            <div class="mono mb-3 text-xs uppercase tracking-[0.4em] text-cyan-300/80">Glassmorphism Dark Mode</div>
            <h1 class="display-font max-w-xl text-4xl leading-tight text-white lg:text-5xl">
              Zdalny serwis, backup i monitoring urządzeń klientów z gate’em akceptacji.
            </h1>
            <p class="mt-5 max-w-2xl text-base leading-8 text-[var(--text-dim)]">
              Aplikacja na bazie stylu i-janicki.pl. Master zatwierdza nowe DeviceID, steruje backupem Google Drive,
              uruchamia cichy terminal i widzi telemetryczne kafelki urządzeń w czasie rzeczywistym.
            </p>
            <div class="mt-8 flex flex-wrap gap-3">
              <button class="glass-button" type="button" @click="store.signInWithGoogle()">Zaloguj przez Google</button>
              <button v-if="store.isDemoMode" class="glass-button" type="button" @click="store.signInDemo('master')">Demo Master</button>
              <button v-if="store.isDemoMode" class="glass-button" type="button" @click="store.signInDemo('slave')">Demo Slave</button>
            </div>
            <p v-if="store.lastError" class="mt-4 text-sm text-rose-300">{{ store.lastError }}</p>
          </div>

          <div class="glass-panel rounded-[36px] p-8 lg:p-10">
            <div class="grid gap-4 md:grid-cols-2">
              <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div class="mono text-xs uppercase tracking-[0.25em] text-cyan-300">Realtime</div>
                <div class="mt-3 text-3xl font-semibold text-white">1h / 5m</div>
                <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Normalny monitoring co godzinę, szybki alert co 5 minut po przekroczeniu 90°C.</p>
              </div>
              <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div class="mono text-xs uppercase tracking-[0.25em] text-cyan-300">Security</div>
                <div class="mt-3 text-3xl font-semibold text-white">AES-256</div>
                <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Sejf lokalny szyfruje wrażliwe dane przed wysyłką do Firebase.</p>
              </div>
              <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div class="mono text-xs uppercase tracking-[0.25em] text-cyan-300">Backup</div>
                <div class="mt-3 text-3xl font-semibold text-white">Drive Guard</div>
                <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Limity pliku i quota per urządzenie, współdzielenie z Masterem automatycznie.</p>
              </div>
              <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <div class="mono text-xs uppercase tracking-[0.25em] text-cyan-300">Remote</div>
                <div class="mt-3 text-3xl font-semibold text-white">RustDesk</div>
                <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Slot na `rd-core.exe`, tray, czat i zdalny PowerShell bez widocznego okna.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="needsConsent" class="mx-auto flex h-full max-w-3xl items-center justify-center">
        <div class="glass-panel w-full rounded-[36px] p-8 lg:p-10">
          <div class="mono text-xs uppercase tracking-[0.3em] text-cyan-300">RODO / Consent</div>
          <h2 class="mt-3 text-3xl font-semibold text-white">Zgoda na diagnostykę zdalną</h2>
          <p class="mt-4 text-base leading-8 text-[var(--text-dim)]">
            Aplikacja zbiera temperatury CPU, listę procesów, inwentaryzację hardware i logi zdalnego serwisu. Każde nowe
            urządzenie pozostaje zablokowane do czasu ręcznej akceptacji przez Mastera.
          </p>
          <label class="mt-8 flex items-start gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-[var(--text-dim)]">
            <input checked type="checkbox" class="mt-1 h-4 w-4 accent-cyan-400" />
            <span>Akceptuję politykę prywatności i wyrażam zgodę na zdalną diagnostykę, backup i czat serwisowy.</span>
          </label>
          <button class="glass-button mt-6" type="button" @click="store.acceptConsent()">Przejdź dalej i zarejestruj urządzenie</button>
        </div>
      </section>

      <MasterLayout v-else-if="store.isMaster" />
      <SlaveLayout v-else />
    </main>
  </div>
</template>
