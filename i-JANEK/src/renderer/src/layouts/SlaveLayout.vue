<script setup lang="ts">
import { computed, reactive } from 'vue'
import { CloudUpload, Headphones, MessageSquareText, MonitorCog, Rocket, ShieldCheck } from 'lucide-vue-next'
import StatusPill from '@/components/StatusPill.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const ui = reactive({
  muted: false
})

const device = computed(() => store.selectedDevice)
</script>

<template>
  <div class="grid h-full min-h-0 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
    <section class="glass-panel flex min-h-0 flex-col rounded-[30px] p-5">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div class="mono text-xs uppercase tracking-[0.28em] text-fuchsia-300">Slave</div>
          <h2 class="mt-3 text-2xl font-semibold text-white">{{ device?.hostname ?? 'Urządzenie klienta' }}</h2>
          <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Minimalny podgląd statusu, czatu i akcji serwisowych.</p>
        </div>

        <StatusPill
          :label="device?.approvalStatus ?? 'pending'"
          :tone="device?.approvalStatus === 'approved' ? 'success' : device?.approvalStatus === 'rejected' ? 'critical' : 'warning'"
        />
      </div>

      <div class="mt-5 grid gap-3 md:grid-cols-3">
        <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            <MonitorCog class="h-4 w-4 text-fuchsia-300" />
            CPU
          </div>
          <div class="mt-3 text-2xl font-semibold text-white">{{ device?.telemetry?.cpuTemperatureC ?? '—' }}°</div>
        </div>
        <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            <CloudUpload class="h-4 w-4 text-fuchsia-300" />
            Backup
          </div>
          <div class="mt-3 text-2xl font-semibold text-white">{{ device?.backupPolicy?.maxQuotaGb ?? '—' }} GB</div>
        </div>
        <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
            <ShieldCheck class="h-4 w-4 text-fuchsia-300" />
            Dostęp
          </div>
          <div class="mt-3 text-2xl font-semibold text-white">{{ device?.approvalStatus === 'approved' ? 'Aktywny' : 'Oczekiwanie' }}</div>
        </div>
      </div>

      <div
        v-if="device?.approvalStatus !== 'approved'"
        class="mt-4 rounded-[22px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        To urządzenie czeka na ręczną akceptację Mastera. Część funkcji pozostaje tymczasowo zablokowana.
      </div>

      <div class="mt-4 flex min-h-0 flex-1 flex-col rounded-[24px] border border-white/10 bg-white/5 p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm font-medium text-white">
            <MessageSquareText class="h-4 w-4 text-fuchsia-300" />
            Czat
          </div>
          <StatusPill :label="ui.muted ? 'mute' : 'sound on'" />
        </div>

        <div class="mt-4 flex-1 space-y-3 overflow-auto">
          <div
            v-for="message in store.chats[device?.deviceId ?? ''] ?? []"
            :key="message.id"
            class="max-w-[82%] rounded-[20px] border px-4 py-3 text-sm leading-7"
            :class="message.senderRole === 'slave' ? 'ml-auto border-fuchsia-400/20 bg-fuchsia-500/10' : 'border-white/10 bg-white/5'"
          >
            <div class="mono mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">{{ message.senderEmail }}</div>
            {{ message.body }}
          </div>
        </div>

        <div class="mt-4 flex gap-3">
          <input v-model="store.pendingChatMessage" class="soft-input" placeholder="Napisz do Mastera..." />
          <button class="glass-button" type="button" @click="store.sendChatMessage()">Wyślij</button>
        </div>
      </div>
    </section>

    <aside class="grid min-h-0 gap-4">
      <div class="glass-panel rounded-[30px] p-5">
        <div class="text-sm font-medium text-white">Szybkie akcje</div>
        <div class="mt-4 grid gap-3">
          <button class="glass-button w-full justify-between" type="button" @click="ui.muted = !ui.muted">
            <span>Powiadomienia</span>
            <Headphones class="h-4 w-4" />
          </button>
          <button class="glass-button w-full justify-between" type="button" @click="store.launchRustDesk()">
            <span>Uruchom RustDesk</span>
            <Rocket class="h-4 w-4" />
          </button>
          <button class="ghost-button w-full justify-between rounded-2xl px-4 py-3 text-sm" type="button" @click="store.revokeConsent()">
            <span>Wycofaj zgodę</span>
            <ShieldCheck class="h-4 w-4" />
          </button>
          <button class="ghost-button w-full justify-between rounded-2xl px-4 py-3 text-sm" type="button" @click="store.signOut()">
            <span>Wyloguj</span>
            <MessageSquareText class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="glass-panel rounded-[30px] p-5">
        <div class="text-sm font-medium text-white">Status aplikacji</div>
        <div class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
          <div class="flex items-center justify-between">
            <span>Wersja</span>
            <span class="mono text-white">{{ device?.appVersion ?? '0.1.0' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Tryb</span>
            <span class="mono text-white">{{ store.isDemoMode ? 'demo' : 'firebase' }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>RustDesk</span>
            <span class="mono text-white">{{ device?.rustdesk?.installed ? 'ready' : 'not ready' }}</span>
          </div>
        </div>
      </div>

      <div class="glass-panel rounded-[30px] p-5">
        <div class="text-sm font-medium text-white">Backup</div>
        <div class="mt-4 space-y-2">
          <div
            v-for="pathEntry in device?.backupPolicy?.watchedPaths ?? []"
            :key="pathEntry"
            class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]"
          >
            {{ pathEntry }}
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>
