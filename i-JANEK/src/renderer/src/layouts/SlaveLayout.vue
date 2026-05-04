<script setup lang="ts">
import { computed, reactive } from 'vue'
import { Bell, CloudUpload, Headphones, MessageSquareText, MonitorCog, Rocket, ShieldCheck } from 'lucide-vue-next'
import StatusPill from '@/components/StatusPill.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const ui = reactive({
  muted: false
})

const device = computed(() => store.selectedDevice)
</script>

<template>
  <div class="grid h-full gap-5 lg:grid-cols-[1.1fr_0.9fr]">
    <section class="glass-panel flex min-h-[560px] flex-col rounded-[34px] p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="mono text-xs uppercase tracking-[0.28em] text-cyan-300">Slave Widget</div>
          <h2 class="mt-3 text-3xl font-semibold text-white">{{ device?.hostname ?? 'Urządzenie klienta' }}</h2>
          <p class="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-dim)]">
            Wersja trayowa. Po zatwierdzeniu przez Mastera uruchamia monitoring, backup Google Drive, czat oraz cichy terminal.
          </p>
        </div>
        <StatusPill
          :label="device?.approvalStatus ?? 'pending'"
          :tone="device?.approvalStatus === 'approved' ? 'success' : device?.approvalStatus === 'rejected' ? 'critical' : 'warning'"
        />
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-3">
        <div class="rounded-[26px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            <MonitorCog class="h-4 w-4 text-cyan-300" />
            Monitoring
          </div>
          <div class="mt-3 text-2xl font-semibold text-white">{{ device?.telemetry?.cpuTemperatureC ?? '—' }}°C</div>
          <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Ostatni pakiet telemetryczny urządzenia.</p>
        </div>
        <div class="rounded-[26px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            <CloudUpload class="h-4 w-4 text-cyan-300" />
            Backup
          </div>
          <div class="mt-3 text-2xl font-semibold text-white">{{ device?.backupPolicy?.maxQuotaGb ?? '—' }} GB</div>
          <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Limit quota narzucony z konsoli Master.</p>
        </div>
        <div class="rounded-[26px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            <ShieldCheck class="h-4 w-4 text-cyan-300" />
            Gating
          </div>
          <div class="mt-3 text-2xl font-semibold text-white">
            {{ device?.approvalStatus === 'approved' ? 'Aktywne' : 'Oczekiwanie' }}
          </div>
          <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Bez akceptacji funkcje zdalne pozostają zablokowane.</p>
        </div>
      </div>

      <div class="mt-6 flex-1 rounded-[30px] border border-white/10 bg-white/5 p-5">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2 text-white">
            <MessageSquareText class="h-4 w-4 text-cyan-300" />
            Czat serwisowy
          </div>
          <StatusPill :label="ui.muted ? 'mute' : 'sound on'" />
        </div>

        <div class="mt-4 space-y-3 overflow-auto">
          <div
            v-for="message in store.chats[device?.deviceId ?? ''] ?? []"
            :key="message.id"
            class="max-w-[85%] rounded-[22px] border px-4 py-3 text-sm leading-7"
            :class="message.senderRole === 'slave' ? 'ml-auto border-cyan-300/20 bg-cyan-300/10' : 'border-white/10 bg-white/5'"
          >
            <div class="mono mb-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-dim)]">{{ message.senderEmail }}</div>
            {{ message.body }}
          </div>
        </div>

        <div class="mt-4 flex gap-3">
          <input v-model="store.pendingChatMessage" class="soft-input" placeholder="Napisz do Mastera..." />
          <button class="glass-button" type="button" @click="store.sendChatMessage()">Wyślij</button>
        </div>
      </div>
    </section>

    <aside class="space-y-5">
      <div class="glass-panel rounded-[32px] p-5">
        <div class="mono text-xs uppercase tracking-[0.28em] text-cyan-300">Ustawienia</div>
        <div class="mt-4 space-y-3">
          <button class="glass-button w-full justify-between" type="button" @click="ui.muted = !ui.muted">
            <span>Powiadomienia dźwiękowe</span>
            <Headphones class="h-4 w-4" />
          </button>
          <button class="glass-button w-full justify-between" type="button" @click="store.launchRustDesk()">
            <span>Uruchom RustDesk</span>
            <Rocket class="h-4 w-4" />
          </button>
          <button class="glass-button w-full justify-between" type="button" @click="store.revokeConsent()">
            <span>Wycofaj zgodę</span>
            <ShieldCheck class="h-4 w-4" />
          </button>
          <button class="glass-button w-full justify-between" type="button" @click="store.signOut()">
            <span>Wyloguj</span>
            <Bell class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="glass-panel rounded-[32px] p-5">
        <div class="text-white">Status aplikacji</div>
        <div class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
          <div class="flex items-center justify-between">
            <span>Wersja</span>
            <span class="mono">{{ device?.appVersion ?? '0.1.0' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Auto update</span>
            <span class="mono">electron-updater</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Tryb</span>
            <span class="mono">{{ store.isDemoMode ? 'demo' : 'production' }}</span>
          </div>
        </div>
      </div>

      <div class="glass-panel rounded-[32px] p-5">
        <div class="text-white">Stan wdrożenia</div>
        <ul class="mt-4 space-y-3 text-sm leading-7 text-[var(--text-dim)]">
          <li>Nowe urządzenie wymaga ręcznej akceptacji przez Mastera w Firestore.</li>
          <li>Przy utracie internetu czat pokazuje komunikat o późniejszym wysłaniu.</li>
          <li>Instalator może dodać certyfikat i wpis autostartu oraz usuwa je przy odinstalowaniu.</li>
        </ul>
      </div>
    </aside>
  </div>
</template>
