<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, CheckCircle2, CirclePlus, Cpu, HardDrive, MemoryStick, MessageSquareText, Workflow } from 'lucide-vue-next'
import LocalDiskUsage from '@/components/LocalDiskUsage.vue'
import { getMaxLocalDiskUsage } from '@shared/disk-telemetry'
import AppFooterLink from '@/components/AppFooterLink.vue'
import { buildConversationTimeline } from '@/services/chat'
import { isDeviceOnline } from '@/services/device-presence'
import { useAppStore } from '@/stores/app'
import type { AlertEvent, CompanyChatMessage, MetricThreshold } from '@shared/contracts'

const store = useAppStore()
const alertsModalOpen = ref(false)
const chatViewport = ref<HTMLElement | null>(null)
const showClosedThreads = ref(false)
const creatingThread = ref(false)
const newThreadTitle = ref('')
const newThreadBody = ref('')
let markReadTimer: number | null = null
let typingTimer: number | null = null
let typingActive = false

const device = computed(() => store.selfDevice ?? store.selectedDevice)
const deviceOnline = computed(() => Boolean(device.value && isDeviceOnline(device.value, store.statusNow)))
const telemetryAgeLabel = computed(() => {
  const capturedAt = device.value?.telemetry?.capturedAt
  if (!capturedAt) return 'brak odczytu'
  const elapsedMinutes = Math.max(0, Math.floor((store.statusNow - capturedAt) / 60_000))
  if (elapsedMinutes < 1) return 'odczyt przed chwilą'
  if (elapsedMinutes < 60) return `odczyt ${elapsedMinutes} min temu`
  return `odczyt ${Math.floor(elapsedMinutes / 60)} godz. temu`
})
const deviceAlerts = computed(() =>
  device.value
    ? [...store.alerts]
        .filter((alert) => alert.deviceId === device.value?.deviceId && alert.severity !== 'info')
        .sort((left, right) => right.createdAt - left.createdAt)
    : []
)
const hasActiveAlerts = computed(() => deviceAlerts.value.length > 0)
const localDiskTelemetry = computed(() => deviceOnline.value ? device.value?.telemetry?.disks : undefined)
const maxDiskUsage = computed(() => getMaxLocalDiskUsage(localDiskTelemetry.value))
const messageNotificationsMuted = computed(() => store.slaveSettings.muteChatSounds)
const messageThreads = computed(() => {
  const ownerUid = device.value?.ownerUid
  if (!ownerUid) return []
  return [...(store.companyMessageThreads[ownerUid] ?? [])].sort((left, right) => {
    const leftAt = left.messages.at(-1)?.createdAt ?? left.updatedAt
    const rightAt = right.messages.at(-1)?.createdAt ?? right.updatedAt
    return rightAt - leftAt
  })
})
const visibleMessageThreads = computed(() => messageThreads.value.filter((thread) => showClosedThreads.value || thread.status === 'open'))
const activeMessageThread = computed(() => messageThreads.value.find((thread) => thread.id === store.selectedMessageThreadId) ?? null)
const conversationTimeline = computed(() => buildConversationTimeline(activeMessageThread.value?.messages ?? []))
const unreadMessageIds = computed(
  () => {
    const ownerUid = store.selectedConversationOwnerUid
    if (!ownerUid || !activeMessageThread.value) return new Set<string>()
    return new Set(
      activeMessageThread.value.messages
        .filter((message) => message.senderRole === 'master' && message.createdAt > (activeMessageThread.value?.states.slave?.lastReadAt ?? 0))
        .map((message) => message.id)
    )
  }
)
const unreadMessagesCount = computed(() => unreadMessageIds.value.size)
const masterIsTyping = computed(() => {
  const ownerUid = store.selectedConversationOwnerUid
  const state = ownerUid ? activeMessageThread.value?.states.master : undefined
  return Boolean(state?.typing && Date.now() - state.updatedAt < 8_000)
})

watch(messageThreads, (threads) => {
  if (activeMessageThread.value) return
  const next = threads.find((thread) => thread.status === 'open') ?? threads[0]
  store.selectedMessageThreadId = next?.id ?? ''
}, { immediate: true })

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
  if (activeMessageThread.value?.status !== 'open') return
  stopTyping()
  await store.sendChatMessage(device.value?.ownerUid)
  await nextTick()
  scrollToLatest()
  queueMarkMessagesRead(120)
}

function selectMessageThread(threadId: string) {
  creatingThread.value = false
  stopTyping()
  store.selectedMessageThreadId = threadId
  queueMarkMessagesRead(120)
  void nextTick(scrollToLatest)
}

function startCreatingThread() {
  stopTyping()
  creatingThread.value = true
  newThreadTitle.value = ''
  newThreadBody.value = ''
}

async function createMessageThread() {
  const ownerUid = device.value?.ownerUid
  if (!ownerUid) return
  const created = await store.createMessageThread(ownerUid, newThreadTitle.value, newThreadBody.value)
  if (!created) return
  creatingThread.value = false
  newThreadTitle.value = ''
  newThreadBody.value = ''
  await nextTick(scrollToLatest)
}

async function closeMessageThread() {
  if (!activeMessageThread.value) return
  if (!window.confirm('Zakończyć tę wiadomość? Po zakończeniu nie będzie można już w niej pisać ani otworzyć jej ponownie.')) return
  await store.closeMessageThread()
}

function threadUnreadCount(threadId: string) {
  const thread = messageThreads.value.find((entry) => entry.id === threadId)
  if (!thread) return 0
  const lastReadAt = thread.states.slave?.lastReadAt ?? 0
  return thread.messages.filter((message) => message.senderRole === 'master' && message.createdAt > lastReadAt).length
}

function formatThreadDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })
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
  if (!ownerUid || activeMessageThread.value?.status !== 'open') return
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
      <div class="mb-2.5 flex items-center justify-between gap-3 px-0.5">
        <div class="flex min-w-0 items-center gap-2 text-xs">
          <span
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :class="deviceOnline ? 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,.55)]' : 'bg-slate-500'"
          />
          <span class="font-medium" :class="deviceOnline ? 'text-emerald-200' : 'text-slate-300'">
            {{ deviceOnline ? 'Urządzenie online' : 'Urządzenie offline' }}
          </span>
          <Activity class="h-3.5 w-3.5 text-[var(--text-dim)]" />
        </div>
        <span class="mono shrink-0 text-[10px] text-[var(--text-dim)]">{{ telemetryAgeLabel }}</span>
      </div>

      <div class="grid grid-cols-4 gap-1.5">
        <div class="rounded-[14px] border px-2.5 py-2" :class="cpuTileClass">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><Cpu class="h-3 w-3" /> CPU</div>
          <div class="mt-1.5 flex items-end justify-between gap-2">
            <span class="text-[22px] font-semibold leading-none">{{ formatMetricValue(device?.telemetry?.cpuUsagePercent, '%') }}</span>
            <span class="text-[10px] leading-none opacity-70">temp. {{ formatMetricValue(device?.telemetry?.cpuTemperatureC, '°C') }}</span>
          </div>
        </div>

        <div class="rounded-[14px] border px-2.5 py-2" :class="gpuTileClass">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><Workflow class="h-3 w-3" /> GPU</div>
          <div class="mt-1.5 flex items-end justify-between gap-2">
            <span class="text-[22px] font-semibold leading-none">{{ formatMetricValue(device?.telemetry?.gpu?.usagePercent, '%') }}</span>
            <span class="text-[10px] leading-none opacity-70">temp. {{ formatMetricValue(device?.telemetry?.gpu?.temperatureC, '°C') }}</span>
          </div>
        </div>

        <div class="rounded-[14px] border px-2.5 py-2" :class="metricClasses(device?.telemetry?.memoryUsedPercent, store.masterSettings.thresholds.ramUsage)">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><MemoryStick class="h-3 w-3" /> RAM</div>
          <div class="mt-1.5 text-[22px] font-semibold leading-none">
            {{ device?.telemetry?.memoryUsedPercent ?? '—' }}<span v-if="device?.telemetry?.memoryUsedPercent !== null && device?.telemetry?.memoryUsedPercent !== undefined">%</span>
          </div>
        </div>

        <div class="rounded-[14px] border px-2.5 py-2" :class="metricClasses(maxDiskUsage, store.masterSettings.thresholds.diskUsage)">
          <div class="flex items-center gap-1 text-[10px] uppercase tracking-[0.13em]"><HardDrive class="h-3 w-3" /> Dyski</div>
          <LocalDiskUsage class="mt-1.5" :disks="localDiskTelemetry" :threshold="store.masterSettings.thresholds.diskUsage" />
        </div>

      </div>

    </section>

    <section class="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] p-4">
      <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div class="flex items-center gap-2 text-sm font-medium text-white"><MessageSquareText class="h-4 w-4 text-fuchsia-300" /> Wiadomości z administratorem</div>
        <span v-if="messageNotificationsMuted" class="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase text-[var(--text-dim)]">mute</span>
      </div>

      <div class="mt-3 grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-[20px] border border-white/[0.08] bg-black/10 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col border-b border-white/10 p-3 lg:border-b-0 lg:border-r">
          <button class="glass-button min-h-12 w-full gap-2 !rounded-xl !px-4 !py-3 !text-sm" type="button" @click="startCreatingThread">
            <CirclePlus class="h-5 w-5" /> Nowa wiadomość
          </button>

          <div class="mt-3 flex min-h-0 flex-1 flex-col">
            <div class="mb-2 flex items-center justify-between gap-2 px-1">
              <span class="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-dim)]">Czaty</span>
              <button class="ghost-button !rounded-lg !px-2.5 !py-1.5 !text-[10px]" type="button" @click="showClosedThreads = !showClosedThreads">{{ showClosedThreads ? 'Ukryj historię' : 'Historia' }}</button>
            </div>

            <div class="min-h-0 space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <button v-for="thread in visibleMessageThreads" :key="thread.id" class="relative w-full rounded-xl border px-3 py-3 text-left transition" :class="store.selectedMessageThreadId === thread.id && !creatingThread ? 'border-fuchsia-300/30 bg-fuchsia-500/10 text-white' : 'border-white/10 bg-white/[0.02] text-[var(--text-dim)] hover:border-white/20 hover:bg-white/[0.04]'" type="button" @click="selectMessageThread(thread.id)">
                <span class="block truncate text-sm font-semibold">{{ thread.title }}</span>
                <span class="mt-1.5 flex items-center gap-1 text-[11px]"><CheckCircle2 v-if="thread.status === 'closed'" class="h-3.5 w-3.5 text-emerald-300" />{{ formatThreadDate(thread.messages.at(-1)?.createdAt ?? thread.updatedAt) }}</span>
                <span v-if="threadUnreadCount(thread.id)" class="absolute right-2.5 top-2.5 min-w-5 rounded-full bg-cyan-300 px-1.5 py-0.5 text-center text-[10px] font-bold text-slate-950">{{ threadUnreadCount(thread.id) }}</span>
              </button>
              <p v-if="!visibleMessageThreads.length" class="rounded-xl border border-dashed border-white/10 px-3 py-6 text-center text-xs text-[var(--text-dim)]">{{ showClosedThreads ? 'Brak wiadomości.' : 'Brak aktywnych czatów.' }}</p>
            </div>
          </div>
        </aside>

        <div class="flex min-h-0 min-w-0 flex-col p-4">
          <template v-if="creatingThread">
            <div class="flex min-h-0 flex-1 flex-col overflow-auto">
              <div class="border-b border-white/10 pb-4"><div class="text-xs uppercase tracking-[0.14em] text-fuchsia-200">Nowa wiadomość</div><h3 class="mt-1 text-lg font-semibold text-white">Nadaj tytuł i opisz sprawę</h3></div>
              <div class="mt-5 flex w-full max-w-3xl flex-1 flex-col gap-4">
                <label class="text-sm font-medium text-[var(--text-dim)]">Tytuł wiadomości<input v-model="newThreadTitle" class="soft-input mt-2 min-h-12 !rounded-xl !px-4 !py-3.5 !text-base" maxlength="120" placeholder="Np. Problem z drukarką" /></label>
                <label class="flex min-h-0 flex-1 flex-col text-sm font-medium text-[var(--text-dim)]">Treść wiadomości<textarea v-model="newThreadBody" class="soft-input mt-2 min-h-44 flex-1 resize-none !rounded-xl !px-4 !py-4 !text-base !leading-7" maxlength="4000" placeholder="Napisz, czego dotyczy sprawa..." /></label>
                <div class="flex flex-wrap justify-end gap-3 pt-1"><button class="ghost-button min-h-12 !rounded-xl !px-6 !py-3 !text-sm" type="button" @click="creatingThread = false">Anuluj</button><button class="glass-button min-h-12 !rounded-xl !px-6 !py-3 !text-sm" type="button" :disabled="!newThreadTitle.trim() || !newThreadBody.trim()" @click="createMessageThread">Utwórz wiadomość</button></div>
              </div>
            </div>
          </template>

          <template v-else-if="activeMessageThread">
            <div class="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div class="min-w-0"><h3 class="truncate text-base font-semibold text-white">{{ activeMessageThread.title }}</h3><span class="mt-1 block text-[10px] uppercase tracking-[0.12em]" :class="activeMessageThread.status === 'open' ? 'text-fuchsia-200' : 'text-emerald-200'">{{ activeMessageThread.status === 'open' ? 'Aktywna' : 'Zakończona' }}</span></div>
              <button v-if="activeMessageThread.status === 'open'" class="ghost-button inline-flex min-h-10 items-center gap-1.5 !rounded-xl !px-4 !py-2 !text-xs !text-emerald-100" type="button" @click="closeMessageThread"><CheckCircle2 class="h-4 w-4" /> Zakończ</button>
            </div>

            <div ref="chatViewport" class="mt-3 flex-1 space-y-2 overflow-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" @mouseenter="queueMarkMessagesRead(180)" @scroll="queueMarkMessagesRead(120)">
              <template v-for="entry in conversationTimeline" :key="entry.id">
                <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-dim)]"><div class="h-px flex-1 bg-white/10" /><span class="mono">{{ entry.label }}</span><div class="h-px flex-1 bg-white/10" /></div>
                <div v-else class="max-w-[78%] rounded-[18px] border px-4 py-3 text-sm leading-6" :class="entry.message.senderRole === 'slave' ? 'ml-auto border-fuchsia-400/20 bg-fuchsia-500/10 text-white' : isUnreadMessage(entry.message) ? 'border-cyan-300/35 bg-cyan-400/12 text-white shadow-[0_0_0_1px_rgba(125,211,252,0.08)]' : 'border-white/10 bg-white/5 text-white'">
                  <div class="mb-1 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.14em] text-[var(--text-dim)]"><span class="mono truncate">{{ senderLabel(entry.message) }}</span><span v-if="isUnreadMessage(entry.message)" class="rounded-full border border-cyan-300/30 bg-cyan-300/15 px-2 py-0.5 text-[9px] text-cyan-100">Nowa</span></div>
                  <div class="whitespace-pre-wrap">{{ entry.message.body }}</div>
                  <div class="mt-1.5 flex justify-end gap-2 text-[10px] text-[var(--text-dim)]"><span>{{ formatMessageTime(entry.message.createdAt) }}</span><span v-if="entry.message.senderRole === 'slave'" :class="store.getChatMessageStatus(entry.message) === 'read' ? 'text-fuchsia-200' : ''">{{ messageStatusLabel(entry.message) }}</span></div>
                </div>
              </template>
              <div v-if="masterIsTyping && activeMessageThread.status === 'open'" class="inline-flex items-center gap-1 rounded-[18px] border border-white/10 bg-white/5 px-3 py-2 text-xs text-[var(--text-dim)]"><span class="animate-pulse">●</span> Administrator pisze…</div>
            </div>

            <div v-if="activeMessageThread.status === 'open'" class="mt-3 flex items-stretch gap-3"><textarea v-model="store.pendingChatMessage" class="soft-input min-h-[72px] resize-none !rounded-xl !px-4 !py-3.5 !text-base !leading-6" maxlength="4000" placeholder="Napisz wiadomość…" rows="2" @focus="queueMarkMessagesRead(120)" @input="handleTyping" @keydown.enter.exact.prevent="sendChatMessage" /><button class="glass-button min-w-28 !rounded-xl !px-6 !py-3 !text-base" type="button" :disabled="!store.pendingChatMessage.trim()" @click="sendChatMessage">Wyślij</button></div>
            <div v-else class="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-100">Ta wiadomość jest zakończona i pozostaje tylko do odczytu.</div>
          </template>

          <div v-else class="flex flex-1 items-center justify-center text-center text-sm text-[var(--text-dim)]"><div><MessageSquareText class="mx-auto h-8 w-8" /><p class="mt-3">Utwórz pierwszą wiadomość do administratora.</p></div></div>
        </div>
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
            <h3 class="mt-1 text-base font-semibold text-white">Aktywne alerty ({{ deviceAlerts.length }})</h3>
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
