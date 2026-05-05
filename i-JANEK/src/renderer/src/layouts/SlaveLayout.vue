<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  CloudUpload,
  Cpu,
  HardDrive,
  MemoryStick,
  MessageSquareText,
  ShieldCheck,
  Thermometer,
  Workflow
} from 'lucide-vue-next'
import AppFooterLink from '@/components/AppFooterLink.vue'
import StatusPill from '@/components/StatusPill.vue'
import { buildConversationTimeline } from '@/services/chat'
import { useAppStore } from '@/stores/app'
import type { CompanyChatMessage, MetricThreshold } from '@shared/contracts'

const SLAVE_CHAT_READS_KEY = 'i-janek-slave-chat-reads'

const store = useAppStore()
const chatReadAt = ref(0)

const device = computed(() => store.selectedDevice)
const deviceAlerts = computed(() =>
  device.value ? store.alerts.filter((alert) => alert.deviceId === device.value?.deviceId && alert.severity !== 'info') : []
)
const hasActiveAlerts = computed(() => deviceAlerts.value.length > 0)
const backupAgeHours = computed(() => {
  if (!device.value?.backupSnapshot?.scannedAt) return null
  return (Date.now() - device.value.backupSnapshot.scannedAt) / (60 * 60 * 1000)
})
const backupUsagePercent = computed(() => {
  const quotaGb = device.value?.backupPolicy?.maxQuotaGb ?? 0
  if (!quotaGb) return null
  const usedBytes = device.value?.backupSnapshot?.totalBytes ?? 0
  return Math.min(100, (usedBytes / (quotaGb * 1024 * 1024 * 1024)) * 100)
})
const backupFreeGb = computed(() => {
  const quotaGb = device.value?.backupPolicy?.maxQuotaGb ?? 0
  const usedGb = (device.value?.backupSnapshot?.totalBytes ?? 0) / 1024 / 1024 / 1024
  return Math.max(0, quotaGb - usedGb)
})
const messageNotificationsMuted = computed(() => store.slaveSettings.muteChatSounds)
const conversationTimeline = computed(() => buildConversationTimeline(store.selectedConversationMessages))
const unreadMessageIds = computed(
  () =>
    new Set(
      store.selectedConversationMessages
        .filter((message) => message.senderRole === 'master' && message.createdAt > chatReadAt.value)
        .map((message) => message.id)
    )
)
const unreadMessagesCount = computed(() => unreadMessageIds.value.size)

watch(
  () => store.selectedConversationOwnerUid,
  (ownerUid) => {
    if (!ownerUid) {
      chatReadAt.value = 0
      return
    }
    try {
      const stored = localStorage.getItem(`${SLAVE_CHAT_READS_KEY}:${ownerUid}`)
      chatReadAt.value = stored ? Number(stored) || 0 : 0
    } catch {
      chatReadAt.value = 0
    }
  },
  { immediate: true }
)

function metricClasses(value: number | null | undefined, threshold: MetricThreshold) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'border-white/10 bg-white/5 text-[var(--text-dim)]'
  }
  if (value >= threshold.critical) {
    return 'border-rose-400/35 bg-rose-500/12 text-rose-100'
  }
  if (value >= threshold.warning) {
    return 'border-amber-400/35 bg-amber-500/12 text-amber-100'
  }
  return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
}

function formatDateTime(timestamp?: number | null) {
  if (!timestamp) return 'brak danych'
  return new Date(timestamp).toLocaleString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatQuota(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'brak danych'
  return `${value.toFixed(1)} GB wolne`
}

function isUnreadMessage(message: CompanyChatMessage) {
  return unreadMessageIds.value.has(message.id)
}

function markMessagesRead() {
  const ownerUid = store.selectedConversationOwnerUid
  if (!ownerUid) return
  const now = Date.now()
  chatReadAt.value = now
  localStorage.setItem(`${SLAVE_CHAT_READS_KEY}:${ownerUid}`, String(now))
}

async function sendChatMessage() {
  await store.sendChatMessage(device.value?.ownerUid)
  markMessagesRead()
}
</script>

<template>
  <div class="grid h-full min-h-0 gap-4 grid-rows-[minmax(320px,1.05fr)_minmax(0,1fr)]">
    <section class="glass-panel min-h-0 overflow-auto rounded-[32px] p-5">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div class="mono text-xs uppercase tracking-[0.28em] text-fuchsia-300">Slave Dashboard</div>
          <h2 class="mt-3 text-2xl font-semibold text-white">{{ device?.deviceAlias || device?.hostname || 'Urządzenie klienta' }}</h2>
          <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">
            Monitoring pracuje na progach ustawionych w aplikacji Mastera.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <StatusPill
            :label="device?.approvalStatus ?? 'pending'"
            :tone="device?.approvalStatus === 'approved' ? 'success' : device?.approvalStatus === 'rejected' ? 'critical' : 'warning'"
          />
          <button class="glass-button" type="button" @click="store.syncBackupNow()">
            <CloudUpload class="mr-2 h-4 w-4" />
            Utwórz backup
          </button>
          <div
            class="inline-flex h-11 items-center gap-2 rounded-2xl border px-4"
            :class="hasActiveAlerts ? 'border-rose-400/35 bg-rose-500/12 text-rose-100' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'"
          >
            <AlertTriangle class="h-4 w-4" />
            <span class="mono text-xs uppercase tracking-[0.18em]">
              {{ hasActiveAlerts ? `${deviceAlerts.length} alert` : 'brak alertów' }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="device?.approvalStatus !== 'approved'" class="mt-4 rounded-[22px] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        To urządzenie czeka na ręczną akceptację Mastera. Część funkcji pozostaje tymczasowo zablokowana.
      </div>

      <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(device?.telemetry?.cpuUsagePercent, store.masterSettings.thresholds.cpuUsage)">
          <div class="flex items-center gap-2 text-sm"><Cpu class="h-4 w-4" /> CPU</div>
          <div class="mt-3 text-3xl font-semibold">
            {{ device?.telemetry?.cpuUsagePercent ?? '—' }}<span v-if="device?.telemetry?.cpuUsagePercent !== null && device?.telemetry?.cpuUsagePercent !== undefined">%</span>
          </div>
        </div>

        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(device?.telemetry?.gpu?.usagePercent, store.masterSettings.thresholds.gpuUsage)">
          <div class="flex items-center gap-2 text-sm"><Workflow class="h-4 w-4" /> GPU</div>
          <div class="mt-3 text-3xl font-semibold">
            {{ device?.telemetry?.gpu?.usagePercent ?? '—' }}<span v-if="device?.telemetry?.gpu?.usagePercent !== null && device?.telemetry?.gpu?.usagePercent !== undefined">%</span>
          </div>
        </div>

        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(device?.telemetry?.memoryUsedPercent, store.masterSettings.thresholds.ramUsage)">
          <div class="flex items-center gap-2 text-sm"><MemoryStick class="h-4 w-4" /> RAM</div>
          <div class="mt-3 text-3xl font-semibold">
            {{ device?.telemetry?.memoryUsedPercent ?? '—' }}<span v-if="device?.telemetry?.memoryUsedPercent !== null && device?.telemetry?.memoryUsedPercent !== undefined">%</span>
          </div>
        </div>

        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(Math.max(...(device?.telemetry?.disks?.map((entry) => entry.usedPercent) ?? [0])), store.masterSettings.thresholds.diskUsage)">
          <div class="flex items-center gap-2 text-sm"><HardDrive class="h-4 w-4" /> Dysk</div>
          <div class="mt-3 text-3xl font-semibold">
            {{ device?.telemetry?.disks?.length ? Math.max(...(device.telemetry.disks.map((entry) => entry.usedPercent) ?? [0])) : '—' }}
            <span v-if="device?.telemetry?.disks?.length">%</span>
          </div>
        </div>

        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(device?.telemetry?.cpuTemperatureC, store.masterSettings.thresholds.cpuTemp)">
          <div class="flex items-center gap-2 text-sm"><Thermometer class="h-4 w-4" /> CPU temperatura</div>
          <div class="mt-3 text-3xl font-semibold">
            {{ device?.telemetry?.cpuTemperatureC ?? '—' }}<span v-if="device?.telemetry?.cpuTemperatureC !== null && device?.telemetry?.cpuTemperatureC !== undefined">°C</span>
          </div>
        </div>

        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(device?.telemetry?.gpu?.temperatureC, store.masterSettings.thresholds.gpuTemp)">
          <div class="flex items-center gap-2 text-sm"><Thermometer class="h-4 w-4" /> GPU temperatura</div>
          <div class="mt-3 text-3xl font-semibold">
            {{ device?.telemetry?.gpu?.temperatureC ?? '—' }}<span v-if="device?.telemetry?.gpu?.temperatureC !== null && device?.telemetry?.gpu?.temperatureC !== undefined">°C</span>
          </div>
        </div>

        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(backupAgeHours, store.masterSettings.thresholds.backupAgeHours)">
          <div class="flex items-center gap-2 text-sm"><CloudUpload class="h-4 w-4" /> Backup</div>
          <div class="mt-3 text-sm font-semibold text-white">{{ formatDateTime(device?.backupSnapshot?.scannedAt) }}</div>
          <div class="mt-2 text-xs text-[var(--text-dim)]">Ostatnia synchronizacja backupu</div>
        </div>

        <div class="rounded-[22px] border px-4 py-4" :class="metricClasses(backupUsagePercent, store.masterSettings.thresholds.diskUsage)">
          <div class="flex items-center gap-2 text-sm"><ShieldCheck class="h-4 w-4" /> Chmura</div>
          <div class="mt-3 text-sm font-semibold text-white">{{ formatQuota(backupFreeGb) }}</div>
          <div class="mt-3 h-2.5 rounded-full bg-black/25">
            <div
              class="h-full rounded-full transition-all"
              :class="
                (backupUsagePercent ?? 0) >= store.masterSettings.thresholds.diskUsage.critical
                  ? 'bg-rose-400'
                  : (backupUsagePercent ?? 0) >= store.masterSettings.thresholds.diskUsage.warning
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              "
              :style="{ width: `${backupUsagePercent ?? 0}%` }"
            />
          </div>
          <div class="mt-2 text-xs text-[var(--text-dim)]">
            Wykorzystanie limitu backupu: {{ backupUsagePercent ? backupUsagePercent.toFixed(1) : '0.0' }}%
          </div>
        </div>
      </div>
    </section>

    <section class="glass-panel flex min-h-0 flex-col overflow-hidden rounded-[32px] p-5">
      <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div class="flex items-center gap-2 text-sm font-medium text-white">
          <MessageSquareText class="h-4 w-4 text-fuchsia-300" />
          Wiadomości z Masterem
        </div>
        <div class="flex items-center gap-2">
          <StatusPill :label="messageNotificationsMuted ? 'mute' : 'on'" />
          <button v-if="unreadMessagesCount" class="ghost-button !rounded-xl !px-3 !py-2 !text-xs" type="button" @click="markMessagesRead()">
            Oznacz przeczytane ({{ unreadMessagesCount }})
          </button>
        </div>
      </div>

      <div class="mt-4 flex-1 space-y-3 overflow-auto pr-1">
        <template v-for="entry in conversationTimeline" :key="entry.id">
          <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-xs uppercase tracking-[0.18em] text-[var(--text-dim)]">
            <div class="h-px flex-1 bg-white/10" />
            <span class="mono">{{ entry.label }}</span>
            <div class="h-px flex-1 bg-white/10" />
          </div>

          <div
            v-else
            class="max-w-[84%] rounded-[22px] border px-4 py-3 text-sm leading-7"
            :class="
              entry.message.senderRole === 'slave'
                ? 'ml-auto border-fuchsia-400/20 bg-fuchsia-500/10 text-white'
                : isUnreadMessage(entry.message)
                  ? 'border-cyan-300/35 bg-cyan-400/12 text-white shadow-[0_0_0_1px_rgba(125,211,252,0.08)]'
                  : 'border-white/10 bg-white/5 text-white'
            "
          >
            <div class="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">
              <span class="mono">{{ entry.message.senderEmail }}</span>
              <span v-if="isUnreadMessage(entry.message)" class="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-2 py-0.5 text-[10px] text-cyan-100">
                Nowa
              </span>
            </div>
            {{ entry.message.body }}
          </div>
        </template>

        <div v-if="!conversationTimeline.length" class="rounded-[22px] border border-white/10 px-4 py-4 text-sm text-[var(--text-dim)]">
          Brak wiadomości w tej rozmowie.
        </div>
      </div>

      <div class="mt-4 flex gap-3">
        <input v-model="store.pendingChatMessage" class="soft-input" placeholder="Napisz do Mastera..." @focus="markMessagesRead()" />
        <button class="glass-button" type="button" @click="sendChatMessage">Wyślij</button>
      </div>
    </section>

    <AppFooterLink class="pb-1 pt-1" />
  </div>
</template>
