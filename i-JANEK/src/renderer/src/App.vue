<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Settings } from 'lucide-vue-next'
import MasterLayout from '@/layouts/MasterLayout.vue'
import SettingsDrawer from '@/layouts/SettingsDrawer.vue'
import SlaveLayout from '@/layouts/SlaveLayout.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const settingsOpen = ref(false)

const needsConsent = computed(() => store.user?.role === 'slave' && !store.consent)
const headerOnlineCount = computed(() => store.devices.filter((device) => Date.now() - device.lastSeenAt < 5 * 60 * 1000).length)
const headerCompanyCount = computed(() => new Set(store.devices.map((device) => device.ownerUid)).size)
const hasHeaderAlerts = computed(() => store.criticalAlerts.length > 0)

onMounted(() => {
  void store.bootstrap()
})
</script>

<template>
  <div class="flex h-screen overflow-hidden flex-col">
    <header v-if="store.user" class="px-5 pt-5">
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
        <div class="rounded-[14px] border border-white/10 bg-white/5 px-3 py-2">
          <div class="mono flex items-center justify-between whitespace-nowrap text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">
            <span>Firmy</span>
            <span class="text-base font-semibold text-white">{{ headerCompanyCount }}</span>
          </div>
        </div>
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
      <div v-else class="grid min-h-[68px] grid-cols-[1fr_auto_1fr] items-center rounded-[28px] px-5 py-4">
        <div />
        <div class="display-font text-center text-lg tracking-[0.34em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)]">
          i-JANEK
        </div>
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
    </header>

    <main
      class="relative flex-1 min-h-0 px-5 pb-5 pt-5"
      :class="store.user && !needsConsent && !store.needsDeviceAlias ? 'overflow-hidden' : 'overflow-auto'"
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
        <div class="absolute right-0 top-0 flex flex-col items-end gap-3">
          <div class="flex gap-3">
            <button class="ghost-button" type="button" @click="store.signInDemo('master')">Demo Master</button>
            <button class="ghost-button" type="button" @click="store.signInDemo('slave')">Demo Slave</button>
          </div>
        </div>

        <div class="flex flex-1 items-center justify-center px-8 py-12 text-center lg:px-14 lg:py-16">
          <div class="max-w-2xl">
            <div class="display-font text-4xl tracking-[0.32em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)] lg:text-5xl">
              i-JANEK
            </div>
            <p class="mx-auto mt-6 max-w-xl text-base leading-8 text-[var(--text-dim)]">
              Aplikacja do administrowania Twoim komputerem.
            </p>

            <div class="mt-10 flex justify-center">
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
              Twoje dane są szyfrowane AES-256 i przesyłane bezpiecznym kanałem. Aby wycofać zgodę, należy odinstalować
              aplikację.
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

      <section v-else-if="store.needsDeviceAlias" class="mx-auto flex h-full max-w-2xl items-center justify-center">
        <div class="glass-panel w-full rounded-[34px] p-8 lg:p-10">
          <div class="mono text-xs uppercase tracking-[0.28em] text-fuchsia-300">Pierwsze logowanie</div>
          <h2 class="mt-3 text-3xl font-semibold text-white">Nadaj nazwę urządzenia</h2>
          <p class="mt-3 text-sm leading-7 text-[var(--text-dim)]">
            Wpisz nazwę, po której rozpoznasz ten komputer w panelu Mastera. Nazwę możesz później zmienić w ustawieniach.
          </p>
          <div class="mt-5 rounded-[20px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-[var(--text-dim)]">
            Hostname: <span class="mono text-white">{{ store.selfDevice?.hostname }}</span>
          </div>
          <div class="mt-4 flex gap-2">
            <input
              v-model="store.pendingDeviceAlias"
              class="soft-input"
              placeholder="np. Laptop Biuro / PC Dom"
              maxlength="48"
            />
            <button
              class="glass-button !px-5"
              type="button"
              :disabled="store.pendingDeviceAlias.trim().length < 3"
              @click="store.saveDeviceAlias()"
            >
              Zapisz
            </button>
          </div>
        </div>
      </section>

      <MasterLayout v-else-if="store.isMaster" />
      <SlaveLayout v-else />
    </main>
    <SettingsDrawer v-if="store.user" :open="settingsOpen" @close="settingsOpen = false" />
  </div>
</template>
