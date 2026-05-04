<script setup lang="ts">
import { computed, onMounted } from 'vue'
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
    <header v-if="store.user" class="px-5 pt-5">
      <div class="glass-panel grid min-h-[68px] grid-cols-[1fr_auto_1fr] items-center rounded-[28px] px-5 py-4">
        <div />
        <div class="display-font text-center text-lg tracking-[0.34em] text-white">i-JANEK</div>
        <div class="justify-self-end rounded-full border border-white/10 px-4 py-2 text-right text-sm text-[var(--text-dim)]">
          <div class="font-medium text-[var(--text)]">{{ store.user.displayName }}</div>
          <div class="mono text-[11px] uppercase tracking-[0.18em]">{{ store.user.role }}</div>
        </div>
      </div>
    </header>

    <main class="relative flex-1 overflow-auto px-5 pb-5 pt-5">
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

      <section v-else-if="!store.user" class="mx-auto flex min-h-full max-w-4xl items-center justify-center">
        <div class="relative w-full">
          <div class="absolute right-0 top-0 flex gap-2">
            <button class="ghost-button" type="button" @click="store.signInDemo('master')">Demo Master</button>
            <button class="ghost-button" type="button" @click="store.signInDemo('slave')">Demo Slave</button>
          </div>

          <div class="glass-panel mx-auto max-w-2xl rounded-[40px] px-8 py-12 text-center lg:px-14 lg:py-16">
            <div class="display-font text-4xl tracking-[0.32em] text-white lg:text-5xl">i-JANEK</div>
            <p class="mx-auto mt-6 max-w-xl text-base leading-8 text-[var(--text-dim)]">
              Aplikacja do administrowania Twoim komputerem, własność firmy i-JANICKI.pl
            </p>
            <p class="mt-4 text-sm leading-7 text-[var(--text-dim)]">Zaloguj się przez konto Google, aby przejść dalej.</p>

            <div class="mt-10 flex justify-center">
              <button class="google-button" type="button" @click="store.signInWithGoogle()">Google</button>
            </div>

            <p v-if="store.lastError" class="mt-5 text-sm text-rose-300">{{ store.lastError }}</p>
          </div>
        </div>
      </section>

      <section v-else-if="needsConsent" class="mx-auto flex h-full max-w-3xl items-center justify-center">
        <div class="glass-panel w-full rounded-[36px] p-8 lg:p-10">
          <div class="mono text-xs uppercase tracking-[0.3em] text-fuchsia-300">RODO / Consent</div>
          <h2 class="mt-3 text-3xl font-semibold text-white">Zgoda na opiekę informatyczną i-JANEK</h2>
          <div class="mt-4 space-y-4 text-base leading-8 text-[var(--text-dim)]">
            <p>Klikając „Akceptuję”, wyrażasz zgodę na:</p>
            <ul class="space-y-2 text-sm leading-7">
              <li>Realizację zdalnej diagnostyki: odczyt temperatury, obciążenia procesora i stanu dysków.</li>
              <li>Uruchamianie zdalnych skryptów naprawczych w celu optymalizacji systemu.</li>
              <li>Synchronizację wybranych folderów z Twoim kontem Google Drive w celach backupu.</li>
              <li>Przesyłanie logów systemowych, listy procesów i stanu antywirusa do panelu administratora i-Janicki.pl.</li>
            </ul>
            <p>
              Twoje dane są szyfrowane AES-256 i przesyłane bezpiecznym kanałem. Możesz wycofać zgodę w ustawieniach
              aplikacji, co spowoduje zaprzestanie monitoringu.
            </p>
            <p>Każde nowe urządzenie pozostaje zablokowane do czasu ręcznej akceptacji przez Mastera.</p>
          </div>
          <label class="mt-8 flex items-start gap-3 rounded-[24px] border border-white/10 bg-white/5 p-4 text-sm leading-7 text-[var(--text-dim)]">
            <input checked type="checkbox" class="mt-1 h-4 w-4 accent-fuchsia-500" />
            <span>Akceptuję politykę prywatności i wyrażam zgodę na diagnostykę, zdalny serwis i backup zgodnie z powyższą informacją.</span>
          </label>
          <button class="glass-button mt-6" type="button" @click="store.acceptConsent()">Przejdź dalej i zarejestruj urządzenie</button>
        </div>
      </section>

      <MasterLayout v-else-if="store.isMaster" />
      <SlaveLayout v-else />
    </main>
  </div>
</template>
