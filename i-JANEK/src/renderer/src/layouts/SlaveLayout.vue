<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CloudUpload, Cpu, HardDrive, MemoryStick, MessageSquareText, ShieldCheck, Workflow } from 'lucide-vue-next'
import AppFooterLink from '@/components/AppFooterLink.vue'
import { buildConversationTimeline } from '@/services/chat'
import { useAppStore } from '@/stores/app'
import type { AlertEvent, CompanyChatMessage, MetricThreshold } from '@shared/contracts'

const SLAVE_CHAT_READS_KEY = 'i-janek-slave-chat-reads'

const store = useAppStore()
const chatReadAt = ref(0)
const alertsModalOpen = ref(false)
const chatViewport = ref<HTMLElement | null>(null)
let markReadTimer: number | null = null

const device = computed(() => store.selectedDevice)
const deviceAlerts = computed(() =>
  device.value
    ? [...store.alerts]
        .filter((alert) => alert.deviceId === device.value?.deviceId && alert.severity !== 'info')
        .sort((left, right) => right.createdAt - left.createdAt)
    : []
)
const hasActiveAlerts = computed(() => deviceAlerts.value.length > 0)
const maxDiskUsage = computed(() => {
  const values = device.value?.telemetry?.disks?.map((entry) => entry.usedPercent) ?? []
  return values.length ? Math.max(...values) : null
})
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

    queueMarkMessagesRead(250)
  },
  { immediate: true }
)

watch(
  () => store.selectedConversationMessages.length,
  () => {
    queueMarkMessagesRead()
  }
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

function metricState(value: number | null | undefined, threshold: MetricThreshold) {
  if (value === null || value === undefined || Number.isNaN(value)) return 0
  if (value >= threshold.critical) return 2
  if (value >= threshold.warning) return 1
  return 0
}

function metricClassesFromState(state: number) {
  if (state >= 2) return 'border-rose-400/35 bg-rose-500/12 text-rose-100'
  if (state >= 1) return 'border-amber-400/35 bg-amber-500/12 text-amber-100'
  return 'border-emerald-400/30 bg-emerald-500/12 text-emerald-100'
}

function formatMetricValue(value: number | null | undefined, suffix: string) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value}${suffix}`
}

const cpuTileClass = computed(() => {
  const usageState = metricState(device.value?.telemetry?.cpuUsagePercent, store.masterSettings.thresholds.cpuUsage)
  const tempState = metricState(device.value?.telemetry?.cpuTemperatureC, store.masterSettings.thresholds.cpuTemp)
  return metricClassesFromState(Math.max(usageState, tempState))
})

const gpuTileClass = computed(() => {
  const usageState = metricState(device.value?.telemetry?.gpu?.usagePercent, store.masterSettings.thresholds.gpuUsage)
  const tempState = metricState(device.value?.telemetry?.gpu?.temperatureC, store.masterSettings.thresholds.gpuTemp)
  return metricClassesFromState(Math.max(usageState, tempState))
})

function alertTypeLabel(alert: AlertEvent) {
  if (alert.type === 'temperature') return 'Temperatura'
  if (alert.type === 'usage') return 'Zużycie'
  if (alert.type === 'backup') return 'Backup'
  if (alert.type === 'approval') return 'Autoryzacja'
  if (alert.type === 'disk') return 'Dysk'
  return 'System'
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

function formatRelativeHours(value: number | null) {
  if (value === null || Number.isNaN(value)) return 'brak danych'
  if (value < 1) return 'mniej niż 1h temu'
  return `${value.toFixed(1)}h temu`
}

function formatQuota(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'brak danych'
  return `${value.toFixed(1)} GB wolne`
}

function senderLabel(message: CompanyChatMessage) {
  if (message.senderRole === 'master') return 'Igor Janicki (Administrator)'
  return message.senderEmail
}

function isUnreadMessage(message: CompanyChatMessage) {
  return unreadMessageIds.value.has(message.id)
}

function openAlertsModal() {
  if (!deviceAlerts.value.length) return
  alertsModalOpen.value = true
}

function closeAlertModal() {
  alertsModalOpen.value = false
}

async function removeAlert(alertId: string) {
  await store.removeAlertById(alertId)
  if (!deviceAlerts.value.length) {
    closeAlertModal()
  }
}

function persistReadAt(timestamp: number) {
  const ownerUid = store.selectedConversationOwnerUid
  if (!ownerUid) return

  chatReadAt.value = timestamp
  try {
    localStorage.setItem(`${SLAVE_CHAT_READS_KEY}:${ownerUid}`, String(timestamp))
  } catch {
    // Ignore storage issues in renderer.
  }
}

function markMessagesRead() {
  if (!unreadMessagesCount.value) return
  persistReadAt(Date.now())
}

function queueMarkMessagesRead(delay = 850) {
  if (!unreadMessagesCount.value) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return

  if (markReadTimer) window.clearTimeout(markReadTimer)
  markReadTimer = window.setTimeout(() => {
    markReadTimer = null
    if (!chatViewport.value) return
    const rect = chatViewport.value.getBoundingClientRect()
    if (rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight) return
    markMessagesRead()
  }, delay)
}

function handleWindowFocus() {
  queueMarkMessagesRead(200)
}

function handleOpenSlaveAlertModal() {
  openAlertsModal()
}

async function sendChatMessage() {
  await store.sendChatMessage(device.value?.ownerUid)
  queueMarkMessagesRead(120)
}

onMounted(() => {
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleWindowFocus)
  window.addEventListener('i-janek:open-slave-alert-modal', handleOpenSlaveAlertModal)
})

onBeforeUnmount(() => {
  if (markReadTimer) window.clearTimeout(markReadTimer)
  window.removeEventListener('focus', handleWindowFocus)
  document.removeEventListener('visibilitychange', handleWindowFocus)
  window.removeEventListener('i-janek:open-slave-alert-modal', handleOpenSlaveAlertModal)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
    <section class="glass-panel shrink-0 rounded-[24px] p-3">
      <div class="grid grid-cols-4 gap-1.5">
        <div class="rounded-[14px] border px-2.5 py-2" :class="cpuTileClass">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><Cpu class="h-3 w-3" /> CPU</div>
          <div class="mt-1.5 text-[19px] font-semibold leading-none">
            {{ formatMetricValue(device?.telemetry?.cpuUsagePercent, '%') }} | {{ formatMetricValue(device?.telemetry?.cpuTemperatureC, '°C') }}
          </div>
        </div>

        <div class="rounded-[14px] border px-2.5 py-2" :class="gpuTileClass">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><Workflow class="h-3 w-3" /> GPU</div>
          <div class="mt-1.5 text-[19px] font-semibold leading-none">
            {{ formatMetricValue(device?.telemetry?.gpu?.usagePercent, '%') }} | {{ formatMetricValue(device?.telemetry?.gpu?.temperatureC, '°C') }}
          </div>
        </div>

        <div class="rounded-[14px] border px-2.5 py-2" :class="metricClasses(device?.telemetry?.memoryUsedPercent, store.masterSettings.thresholds.ramUsage)">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><MemoryStick class="h-3 w-3" /> RAM</div>
          <div class="mt-1.5 text-[22px] font-semibold leading-none">
            {{ device?.telemetry?.memoryUsedPercent ?? '—' }}<span v-if="device?.telemetry?.memoryUsedPercent !== null && device?.telemetry?.memoryUsedPercent !== undefined">%</span>
          </div>
        </div>

        <div class="rounded-[14px] border px-2.5 py-2" :class="metricClasses(maxDiskUsage, store.masterSettings.thresholds.diskUsage)">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><HardDrive class="h-3 w-3" /> Dysk</div>
          <div class="mt-1.5 text-[22px] font-semibold leading-none">
            {{ maxDiskUsage ?? '—' }}<span v-if="maxDiskUsage !== null">%</span>
          </div>
        </div>

        <div class="col-span-2 rounded-[14px] border px-2.5 py-1.5" :class="metricClasses(backupUsagePercent, store.masterSettings.thresholds.diskUsage)">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><ShieldCheck class="h-3 w-3" /> Chmura</div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <span class="text-xs font-semibold text-white">{{ formatQuota(backupFreeGb) }}</span>
            <span class="text-[10px] text-[var(--text-dim)]">{{ backupUsagePercent === null ? 'brak danych' : `Wykorzystanie: ${backupUsagePercent.toFixed(1)}%` }}</span>
          </div>
          <div class="mt-1 h-1.5 rounded-full bg-black/25">
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
        </div>

        <div class="col-span-2 rounded-[14px] border px-2.5 py-1.5" :class="metricClasses(backupAgeHours, store.masterSettings.thresholds.backupAgeHours)">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><CloudUpload class="h-3 w-3" /> Backup</div>
            <button class="ghost-button !rounded-md !px-2 !py-1 !text-[10px]" type="button" @click="store.syncBackupNow()">
              Utwórz
            </button>
          </div>
          <div class="mt-1 flex items-center justify-between gap-2">
            <div class="truncate text-xs font-semibold text-white">{{ formatDateTime(device?.backupSnapshot?.scannedAt) }}</div>
            <div class="shrink-0 text-[10px] text-[var(--text-dim)]">{{ formatRelativeHours(backupAgeHours) }}</div>
          </div>
        </div>
      </div>

    </section>

    <section class="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] p-4">
      <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div class="flex items-center gap-2 text-sm font-medium text-white">
          <MessageSquareText class="h-4 w-4 text-fuchsia-300" />
          Rozpocznij rozmowę z administratorem
        </div>
        <div class="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--text-dim)]">
          <span v-if="messageNotificationsMuted" class="rounded-full border border-white/10 px-2 py-1">mute</span>
          <span
            v-if="unreadMessagesCount"
            class="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-2 py-1 text-cyan-100"
          >
            {{ unreadMessagesCount }} nowa
          </span>
        </div>
      </div>

      <div
        ref="chatViewport"
        class="mt-3 flex-1 space-y-2 overflow-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        @mouseenter="queueMarkMessagesRead(180)"
        @scroll="queueMarkMessagesRead(120)"
      >
        <template v-for="entry in conversationTimeline" :key="entry.id">
          <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]">
            <div class="h-px flex-1 bg-white/10" />
            <span class="mono">{{ entry.label }}</span>
            <div class="h-px flex-1 bg-white/10" />
          </div>

          <div
            v-else
            class="max-w-[78%] rounded-[18px] border px-3 py-2.5 text-sm leading-6"
            :class="
              entry.message.senderRole === 'slave'
                ? 'ml-auto border-fuchsia-400/20 bg-fuchsia-500/10 text-white'
                : isUnreadMessage(entry.message)
                  ? 'border-cyan-300/35 bg-cyan-400/12 text-white shadow-[0_0_0_1px_rgba(125,211,252,0.08)]'
                  : 'border-white/10 bg-white/5 text-white'
            "
          >
            <div class="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-[var(--text-dim)]">
              <span class="mono truncate">{{ senderLabel(entry.message) }}</span>
              <span
                v-if="isUnreadMessage(entry.message)"
                class="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-2 py-0.5 text-[9px] text-cyan-100"
              >
                Nowa
              </span>
            </div>
            {{ entry.message.body }}
          </div>
        </template>

        <div v-if="!conversationTimeline.length" class="rounded-[18px] border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
          Brak wiadomości w tej rozmowie.
        </div>
      </div>

      <div class="mt-3 flex gap-2">
        <input
          v-model="store.pendingChatMessage"
          class="soft-input !py-2.5"
          placeholder="Napisz wiadomość"
          @focus="queueMarkMessagesRead(120)"
        />
        <button class="glass-button !rounded-xl !px-4 !py-2.5 !text-sm" type="button" @click="sendChatMessage">Wyślij</button>
      </div>
    </section>

    <AppFooterLink class="shrink-0 pb-0 pt-0.5" />

    <div
      v-if="alertsModalOpen && hasActiveAlerts"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4"
      @click.self="closeAlertModal()"
    >
      <div class="glass-panel w-full max-w-xl rounded-[24px] border border-rose-400/35 p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="mono text-[11px] uppercase tracking-[0.14em] text-rose-200">Alerty</div>
            <h3 class="mt-1 text-base font-semibold text-white">Aktywne zgłoszenia ({{ deviceAlerts.length }})</h3>
          </div>
          <button class="ghost-button !rounded-lg !px-2 !py-1 !text-xs" type="button" @click="closeAlertModal()">Zamknij</button>
        </div>

        <div class="mt-3 max-h-[65vh] space-y-3 overflow-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <article
            v-for="alert in deviceAlerts"
            :key="alert.id"
            class="rounded-xl border border-white/10 bg-black/10 px-3 py-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="mono text-[11px] uppercase tracking-[0.14em] text-rose-200">{{ alertTypeLabel(alert) }}</div>
                <h4 class="mt-1 text-sm font-semibold text-white">{{ alert.title }}</h4>
              </div>
              <button class="ghost-button !rounded-lg !px-2 !py-1 !text-[11px]" type="button" @click="removeAlert(alert.id)">
                Usuń
              </button>
            </div>
            <p class="mt-2 text-sm text-white">{{ alert.message }}</p>
            <div class="mt-2 text-xs text-[var(--text-dim)]">
              Data i godzina: <span class="mono text-white">{{ formatDateTime(alert.createdAt) }}</span>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>
