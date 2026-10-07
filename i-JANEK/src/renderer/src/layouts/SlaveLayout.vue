<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ClipboardList, Cpu, HardDrive, MemoryStick, MessageSquareText, Plus, Workflow } from 'lucide-vue-next'
import AppFooterLink from '@/components/AppFooterLink.vue'
import { buildConversationTimeline } from '@/services/chat'
import { useAppStore } from '@/stores/app'
import type { AlertEvent, CompanyChatMessage, MetricThreshold, ServiceRequestPriority, ServiceRequestStatus } from '@shared/contracts'

const store = useAppStore()
const alertsModalOpen = ref(false)
const serviceRequestModalOpen = ref(false)
const requestTitle = ref('')
const requestDescription = ref('')
const requestPriority = ref<ServiceRequestPriority>('normal')
const serviceRequestBusy = ref(false)
const serviceRequestMessage = ref('')
const chatViewport = ref<HTMLElement | null>(null)
let markReadTimer: number | null = null
let typingTimer: number | null = null
let typingActive = false

const device = computed(() => store.selectedDevice)
const deviceAlerts = computed(() =>
  device.value
    ? [...store.alerts]
        .filter((alert) => alert.deviceId === device.value?.deviceId && alert.severity !== 'info')
        .sort((left, right) => right.createdAt - left.createdAt)
    : []
)
const hasActiveAlerts = computed(() => deviceAlerts.value.length > 0)
const ownServiceRequests = computed(() =>
  [...store.serviceRequests]
    .filter((request) => !device.value || request.deviceId === device.value.deviceId)
    .sort((left, right) => right.createdAt - left.createdAt)
)
const maxDiskUsage = computed(() => {
  const values = device.value?.telemetry?.disks?.map((entry) => entry.usedPercent) ?? []
  return values.length ? Math.max(...values) : null
})
const messageNotificationsMuted = computed(() => store.slaveSettings.muteChatSounds)
const conversationTimeline = computed(() => buildConversationTimeline(store.selectedConversationMessages))
const unreadMessageIds = computed(
  () =>
    new Set(
      store.selectedConversationMessages
        .filter((message) => message.senderRole === 'master' && message.createdAt > (store.companyChatStates[message.ownerUid]?.slave?.lastReadAt ?? 0))
        .map((message) => message.id)
    )
)
const unreadMessagesCount = computed(() => unreadMessageIds.value.size)
const masterIsTyping = computed(() => {
  const ownerUid = store.selectedConversationOwnerUid
  const state = ownerUid ? store.companyChatStates[ownerUid]?.master : undefined
  return Boolean(state?.typing && Date.now() - state.updatedAt < 8_000)
})

watch(
  () => store.selectedConversationOwnerUid,
  (ownerUid) => {
    if (!ownerUid) return
    queueMarkMessagesRead(250)
    void nextTick(scrollToLatest)
  },
  { immediate: true }
)

watch(
  () => store.selectedConversationMessages.length,
  async () => {
    const shouldScroll = isNearBottom() || store.selectedConversationMessages.at(-1)?.senderRole === 'slave'
    queueMarkMessagesRead()
    await nextTick()
    if (shouldScroll) scrollToLatest()
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

function serviceRequestStatusLabel(status: ServiceRequestStatus) {
  if (status === 'in_progress') return 'W trakcie'
  if (status === 'resolved') return 'Zakończone'
  return 'Nowe'
}

function serviceRequestStatusClass(status: ServiceRequestStatus) {
  if (status === 'resolved') return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
  if (status === 'in_progress') return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
  return 'border-amber-400/30 bg-amber-500/10 text-amber-100'
}

function serviceRequestPriorityLabel(priority: ServiceRequestPriority) {
  if (priority === 'critical') return 'Krytyczny'
  if (priority === 'high') return 'Wysoki'
  if (priority === 'low') return 'Niski'
  return 'Normalny'
}

async function submitServiceRequest() {
  if (serviceRequestBusy.value) return
  const title = requestTitle.value.trim()
  const description = requestDescription.value.trim()
  if (title.length < 3 || description.length < 5) {
    serviceRequestMessage.value = 'Podaj temat (min. 3 znaki) i dokładniejszy opis awarii.'
    return
  }

  serviceRequestBusy.value = true
  serviceRequestMessage.value = ''
  try {
    const result = await store.createServiceRequest(title, description, requestPriority.value)
    requestTitle.value = ''
    requestDescription.value = ''
    requestPriority.value = 'normal'
    serviceRequestMessage.value = result === 'queued'
      ? 'Brak sieci. Zgłoszenie zapisano i zostanie wysłane automatycznie.'
      : 'Zgłoszenie zostało wysłane do administratora.'
  } catch (error) {
    serviceRequestMessage.value = error instanceof Error ? error.message : 'Nie udało się wysłać zgłoszenia.'
  } finally {
    serviceRequestBusy.value = false
  }
}

async function removeAlert(alertId: string) {
  await store.removeAlertById(alertId)
  if (!deviceAlerts.value.length) {
    closeAlertModal()
  }
}

function markMessagesRead() {
  if (!unreadMessagesCount.value) return
  void store.markChatRead()
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
    if (!isNearBottom()) return
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
  stopTyping()
  await store.sendChatMessage(device.value?.ownerUid)
  await nextTick()
  scrollToLatest()
  queueMarkMessagesRead(120)
}

function isNearBottom() {
  const viewport = chatViewport.value
  if (!viewport) return true
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100
}

function scrollToLatest() {
  const viewport = chatViewport.value
  if (!viewport) return
  viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
}

function stopTyping() {
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = null
  if (typingActive && store.selectedConversationOwnerUid) void store.setChatTyping(store.selectedConversationOwnerUid, false)
  typingActive = false
}

function handleTyping() {
  const ownerUid = store.selectedConversationOwnerUid
  if (!ownerUid) return
  if (!store.pendingChatMessage.trim()) {
    stopTyping()
    return
  }
  if (!typingActive) {
    typingActive = true
    void store.setChatTyping(ownerUid, true)
  }
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = window.setTimeout(stopTyping, 1_600)
}

function formatMessageTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })
}

function messageStatusLabel(message: CompanyChatMessage) {
  const status = store.getChatMessageStatus(message)
  if (status === 'read') return 'Odczytano'
  if (status === 'delivered') return 'Dostarczono'
  if (status === 'sending') return 'Wysyłanie…'
  if (status === 'failed') return 'Nie wysłano'
  return 'Wysłano'
}

onMounted(() => {
  window.addEventListener('focus', handleWindowFocus)
  document.addEventListener('visibilitychange', handleWindowFocus)
  window.addEventListener('i-janek:open-slave-alert-modal', handleOpenSlaveAlertModal)
})

onBeforeUnmount(() => {
  if (markReadTimer) window.clearTimeout(markReadTimer)
  stopTyping()
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
          <button
            class="inline-flex items-center gap-1.5 rounded-xl border border-fuchsia-300/30 bg-fuchsia-400/10 px-2.5 py-1.5 text-[10px] font-semibold text-fuchsia-100 transition hover:border-fuchsia-200/50"
            type="button"
            @click="serviceRequestModalOpen = true; serviceRequestMessage = ''"
          >
            <Plus class="h-3.5 w-3.5" />
            Zgłoś awarię
          </button>
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
            <div class="mt-1.5 flex justify-end gap-2 text-[10px] text-[var(--text-dim)]">
              <span>{{ formatMessageTime(entry.message.createdAt) }}</span>
              <span v-if="entry.message.senderRole === 'slave'" :class="store.getChatMessageStatus(entry.message) === 'read' ? 'text-fuchsia-200' : ''">{{ messageStatusLabel(entry.message) }}</span>
            </div>
          </div>
        </template>

        <div v-if="masterIsTyping" class="inline-flex items-center gap-1 rounded-[18px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-[var(--text-dim)]"><span class="animate-pulse">●</span> Administrator pisze…</div>

        <div v-if="!conversationTimeline.length" class="rounded-[18px] border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
          Brak wiadomości w tej rozmowie.
        </div>
      </div>

      <div class="mt-3 flex gap-2">
        <input
          v-model="store.pendingChatMessage"
          class="soft-input !py-2.5"
          maxlength="4000"
          placeholder="Napisz wiadomość"
          @focus="queueMarkMessagesRead(120)"
          @input="handleTyping"
          @keydown.enter.exact.prevent="sendChatMessage"
        />
        <button class="glass-button !rounded-xl !px-4 !py-2.5 !text-sm" type="button" :disabled="!store.pendingChatMessage.trim()" @click="sendChatMessage">Wyślij</button>
      </div>
      <p v-if="store.chatSendError" class="mt-2 text-xs text-rose-200">{{ store.chatSendError }}</p>
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

    <div
      v-if="serviceRequestModalOpen"
      class="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 px-4 py-6"
      @click.self="serviceRequestModalOpen = false"
    >
      <div class="glass-panel flex max-h-[88vh] w-full max-w-3xl flex-col rounded-[28px] border border-fuchsia-300/25 p-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="mono flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-fuchsia-200">
              <ClipboardList class="h-4 w-4" /> Zgłoszenie serwisowe
            </div>
            <h3 class="mt-1 text-lg font-semibold text-white">Opisz awarię tego komputera</h3>
          </div>
          <button class="ghost-button !rounded-lg !px-2 !py-1 !text-xs" type="button" @click="serviceRequestModalOpen = false">Zamknij</button>
        </div>

        <div class="mt-4 grid min-h-0 gap-5 overflow-auto pr-1 md:grid-cols-[0.9fr_1.1fr] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <form class="space-y-3" @submit.prevent="submitServiceRequest()">
            <label class="block text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">
              Temat
              <input v-model="requestTitle" class="soft-input mt-2" maxlength="160" placeholder="np. Brak internetu" />
            </label>
            <label class="block text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">
              Opis awarii
              <textarea
                v-model="requestDescription"
                class="soft-input mt-2 min-h-32 resize-y"
                maxlength="4000"
                placeholder="Co się dzieje, od kiedy i jaki komunikat widzisz?"
              />
            </label>
            <label class="block text-xs uppercase tracking-[0.14em] text-[var(--text-dim)]">
              Priorytet
              <select v-model="requestPriority" class="soft-input mt-2">
                <option value="low">Niski</option>
                <option value="normal">Normalny</option>
                <option value="high">Wysoki</option>
                <option value="critical">Krytyczny — praca niemożliwa</option>
              </select>
            </label>
            <p v-if="serviceRequestMessage" class="text-sm leading-5 text-cyan-100">{{ serviceRequestMessage }}</p>
            <button class="glass-button w-full justify-center" type="submit" :disabled="serviceRequestBusy">
              {{ serviceRequestBusy ? 'Wysyłanie...' : 'Wyślij zgłoszenie' }}
            </button>
          </form>

          <div class="min-h-0">
            <div class="text-sm font-semibold text-white">Historia tego komputera</div>
            <div class="mt-3 space-y-3">
              <article v-for="request in ownServiceRequests" :key="request.id" class="rounded-2xl border border-white/10 bg-black/15 p-3">
                <div class="flex flex-wrap items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h4 class="text-sm font-semibold text-white">{{ request.title }}</h4>
                    <div class="mt-1 text-[11px] text-[var(--text-dim)]">{{ formatDateTime(request.createdAt) }} · {{ serviceRequestPriorityLabel(request.priority) }}</div>
                  </div>
                  <span class="rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.12em]" :class="serviceRequestStatusClass(request.status)">
                    {{ serviceRequestStatusLabel(request.status) }}
                  </span>
                </div>
                <p class="mt-2 whitespace-pre-wrap text-sm leading-5 text-white/85">{{ request.description }}</p>
              </article>
              <div v-if="!ownServiceRequests.length" class="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-[var(--text-dim)]">
                Nie ma jeszcze zgłoszeń dla tego komputera.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
