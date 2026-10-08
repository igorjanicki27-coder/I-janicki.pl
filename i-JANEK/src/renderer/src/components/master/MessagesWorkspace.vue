<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { CheckCircle2, CirclePlus, MessageSquare, Monitor, Search, Send, UserRound } from 'lucide-vue-next'
import { buildConversationTimeline } from '@/services/chat'
import { isDeviceOnline as isOnlineAt } from '@/services/device-presence'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { CompanyChatMessage, CompanyMessageThread, DeviceRecord } from '@shared/contracts'

const store = useAppStore()
const searchQuery = ref('')
const showClosed = ref(false)
const creatingThread = ref(false)
const newThreadOwnerUid = ref('')
const newThreadTitle = ref('')
const newThreadBody = ref('')
const chatViewport = ref<HTMLElement | null>(null)
const showJumpToLatest = ref(false)
let typingTimer: number | null = null
let typingThreadId = ''

store.selectedConversationOwnerUid = ''
store.selectedMessageThreadId = ''

interface ContactEntry {
  ownerUid: string
  ownerEmail: string
  companyName: string
  devices: DeviceRecord[]
}

interface ThreadEntry {
  thread: CompanyMessageThread
  contact: ContactEntry
  unread: number
  latestActivityAt: number
}

const contacts = computed<ContactEntry[]>(() => {
  const grouped = new Map<string, ContactEntry>()
  for (const device of store.devices) {
    const existing = grouped.get(device.ownerUid)
    if (existing) existing.devices.push(device)
    else grouped.set(device.ownerUid, {
      ownerUid: device.ownerUid,
      ownerEmail: device.ownerEmail,
      companyName: device.companyName?.trim() || 'Bez firmy',
      devices: [device]
    })
  }
  return [...grouped.values()].sort((left, right) => contactLabel(left).localeCompare(contactLabel(right), 'pl'))
})

const threadEntries = computed<ThreadEntry[]>(() => contacts.value.flatMap((contact) =>
  (store.companyMessageThreads[contact.ownerUid] ?? []).map((thread) => {
    const lastReadAt = thread.states.master?.lastReadAt ?? 0
    return {
      thread,
      contact,
      unread: thread.messages.filter((message) => message.senderRole === 'slave' && message.createdAt > lastReadAt).length,
      latestActivityAt: thread.messages.at(-1)?.createdAt ?? thread.updatedAt
    }
  })
))

const filteredThreads = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pl')
  return threadEntries.value
    .filter((entry) => showClosed.value || entry.thread.status === 'open')
    .filter((entry) => !query || [entry.thread.title, entry.contact.companyName, entry.contact.ownerEmail, contactLabel(entry.contact)]
      .join(' ').toLocaleLowerCase('pl').includes(query))
    .sort((left, right) => Number(right.unread > 0) - Number(left.unread > 0)
      || Number(right.thread.status === 'open') - Number(left.thread.status === 'open')
      || right.latestActivityAt - left.latestActivityAt)
})

const activeEntry = computed(() => threadEntries.value.find((entry) =>
  entry.thread.id === store.selectedMessageThreadId && entry.thread.ownerUid === store.selectedConversationOwnerUid
) ?? null)
const timeline = computed(() => buildConversationTimeline(activeEntry.value?.thread.messages ?? []))
const canSend = computed(() => activeEntry.value?.thread.status === 'open')
const contactIsTyping = computed(() => {
  const state = activeEntry.value?.thread.states.slave
  return Boolean(state?.typing && Date.now() - state.updatedAt < 8_000)
})

watch(threadEntries, () => {
  if (!store.selectedMessageThreadId || activeEntry.value) return
  store.selectedConversationOwnerUid = ''
  store.selectedMessageThreadId = ''
}, { immediate: true })

watch(
  [() => store.selectedMessageThreadId, () => store.selectedConversationMessages.length],
  async ([threadId], [previousThreadId]) => {
    if (!threadId) return
    if (previousThreadId && previousThreadId !== threadId) stopTyping()
    const shouldScroll = threadId !== previousThreadId || isNearBottom() || store.selectedConversationMessages.at(-1)?.senderRole === 'master'
    await nextTick()
    if (shouldScroll) {
      scrollToLatest()
      void store.markChatRead()
    } else showJumpToLatest.value = true
  },
  { immediate: true }
)

function contactLabel(contact: ContactEntry) {
  return contact.devices.find((device) => device.contactName?.trim())?.contactName?.trim()
    || contact.ownerEmail.split('@')[0]
    || contact.ownerEmail
}

function isDeviceOnline(device: DeviceRecord) {
  return isOnlineAt(device, store.statusNow)
}

function selectThread(entry: ThreadEntry) {
  creatingThread.value = false
  store.selectedConversationOwnerUid = entry.thread.ownerUid
  store.selectedMessageThreadId = entry.thread.id
  const preferredDevice = entry.contact.devices.find((device) => device.deviceId === entry.thread.deviceId)
    ?? entry.contact.devices.find(isDeviceOnline)
    ?? entry.contact.devices[0]
  if (preferredDevice) store.selectedDeviceId = preferredDevice.deviceId
}

function startCreatingThread() {
  stopTyping()
  creatingThread.value = true
  newThreadOwnerUid.value = activeEntry.value?.thread.ownerUid ?? contacts.value[0]?.ownerUid ?? ''
  newThreadTitle.value = ''
  newThreadBody.value = ''
}

async function createThread() {
  const created = await store.createMessageThread(newThreadOwnerUid.value, newThreadTitle.value, newThreadBody.value)
  if (!created) return
  creatingThread.value = false
  newThreadTitle.value = ''
  newThreadBody.value = ''
  await nextTick(scrollToLatest)
}

async function closeThread() {
  if (!activeEntry.value) return
  if (!window.confirm('Zakończyć tę wiadomość? Po zakończeniu nie będzie można już w niej pisać ani otworzyć jej ponownie.')) return
  await store.closeMessageThread()
}

function messageDeviceLabel(message: CompanyChatMessage) {
  if (!message.deviceId) return 'konto'
  const device = store.devices.find((entry) => entry.deviceId === message.deviceId)
  return device ? formatDeviceLabelForMaster(device) : message.deviceLabel || 'komputer'
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

function isNearBottom() {
  const viewport = chatViewport.value
  return !viewport || viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100
}

function scrollToLatest() {
  const viewport = chatViewport.value
  if (!viewport) return
  viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  showJumpToLatest.value = false
}

function handleChatScroll() {
  if (!isNearBottom()) return
  showJumpToLatest.value = false
  void store.markChatRead()
}

function stopTyping() {
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = null
  if (typingThreadId && store.selectedConversationOwnerUid) {
    void store.setChatTyping(store.selectedConversationOwnerUid, false, typingThreadId)
  }
  typingThreadId = ''
}

function handleTyping() {
  if (!canSend.value) return
  const ownerUid = store.selectedConversationOwnerUid
  const threadId = store.selectedMessageThreadId
  if (!ownerUid || !threadId) return
  if (!store.pendingChatMessage.trim()) {
    stopTyping()
    return
  }
  if (typingThreadId !== threadId) {
    stopTyping()
    typingThreadId = threadId
    void store.setChatTyping(ownerUid, true, threadId)
  }
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = window.setTimeout(stopTyping, 1_600)
}

async function sendMessage() {
  stopTyping()
  if (await store.sendChatMessage()) await nextTick(scrollToLatest)
}

onBeforeUnmount(() => stopTyping())
</script>

<template>
  <div class="grid h-full min-h-[620px] lg:grid-cols-[360px_minmax(0,1fr)]">
    <aside class="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
      <button class="glass-button flex w-full items-center justify-center gap-2 !rounded-xl !py-2.5" type="button" @click="startCreatingThread">
        <CirclePlus class="h-4 w-4" /> Nowa wiadomość
      </button>
      <label class="relative mt-3 block">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input v-model="searchQuery" class="soft-input !rounded-xl !py-2.5 !pl-9" placeholder="Szukaj tytułu, osoby lub firmy..." />
      </label>
      <button class="ghost-button mt-3 w-full !rounded-xl !py-2.5" type="button" @click="showClosed = !showClosed">
        {{ showClosed ? 'Ukryj zakończone' : 'Pokaż zakończone' }}
      </button>

      <div class="mt-4 space-y-2">
        <button v-for="entry in filteredThreads" :key="entry.thread.id" class="w-full rounded-xl border px-3 py-3 text-left transition" :class="store.selectedMessageThreadId === entry.thread.id ? 'border-cyan-300/25 bg-cyan-400/10' : 'border-white/[0.08] bg-white/[0.018] hover:bg-white/[0.035]'" type="button" @click="selectThread(entry)">
          <span class="flex items-start gap-3">
            <span class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[var(--text-dim)]">
              <UserRound class="h-4 w-4" /><span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0918]" :class="entry.contact.devices.some(isDeviceOnline) ? 'bg-emerald-400' : 'bg-slate-600'" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2"><strong class="block flex-1 truncate text-sm text-white">{{ entry.thread.title }}</strong><span v-if="entry.unread" class="rounded-full bg-cyan-300 px-2 py-0.5 text-xs font-semibold text-slate-950">{{ entry.unread }}</span></span>
              <small class="mt-1 block truncate text-[var(--text-dim)]">{{ contactLabel(entry.contact) }} · {{ entry.contact.companyName }}</small>
              <small v-if="entry.thread.status === 'closed'" class="mt-1 inline-flex items-center gap-1 text-emerald-200"><CheckCircle2 class="h-3 w-3" /> Zakończona</small>
            </span>
          </span>
        </button>
        <p v-if="!filteredThreads.length" class="p-4 text-center text-sm text-[var(--text-dim)]">{{ searchQuery.trim() ? 'Nie znaleziono wiadomości.' : showClosed ? 'Brak wiadomości.' : 'Brak aktywnych wiadomości.' }}</p>
      </div>
    </aside>

    <section class="flex min-h-0 flex-col p-5">
      <template v-if="creatingThread">
        <header class="border-b border-white/10 pb-4"><div class="text-xs font-medium uppercase tracking-[0.14em] text-cyan-200">Nowa wiadomość</div><h2 class="mt-1 text-lg font-semibold text-white">Rozpocznij osobny wątek</h2></header>
        <div class="mx-auto mt-8 w-full max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-white/[0.025] p-5">
          <label class="block text-sm text-[var(--text-dim)]">Odbiorca<select v-model="newThreadOwnerUid" class="soft-input mt-2 !rounded-xl"><option v-for="contact in contacts" :key="contact.ownerUid" :value="contact.ownerUid">{{ contactLabel(contact) }} — {{ contact.companyName }}</option></select></label>
          <label class="block text-sm text-[var(--text-dim)]">Tytuł<input v-model="newThreadTitle" class="soft-input mt-2 !rounded-xl" maxlength="120" placeholder="Np. Problem z drukarką" /></label>
          <label class="block text-sm text-[var(--text-dim)]">Pierwsza wiadomość<textarea v-model="newThreadBody" class="soft-input mt-2 min-h-36 !rounded-xl" maxlength="4000" placeholder="Opisz sprawę..." /></label>
          <div class="flex justify-end gap-2"><button class="ghost-button" type="button" @click="creatingThread = false">Anuluj</button><button class="glass-button" type="button" :disabled="!newThreadOwnerUid || !newThreadTitle.trim() || !newThreadBody.trim()" @click="createThread">Utwórz wiadomość</button></div>
          <p v-if="store.chatSendError" class="text-xs text-rose-200">{{ store.chatSendError }}</p>
        </div>
      </template>

      <template v-else-if="activeEntry">
        <header class="border-b border-white/10 pb-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div><div class="text-xs font-medium uppercase tracking-[0.14em] text-cyan-200">{{ contactLabel(activeEntry.contact) }} · {{ activeEntry.contact.companyName }}</div><h2 class="mt-1 text-lg font-semibold text-white">{{ activeEntry.thread.title }}</h2><p class="mt-1 text-sm text-[var(--text-dim)]">{{ activeEntry.contact.ownerEmail }}</p></div>
            <button v-if="activeEntry.thread.status === 'open'" class="ghost-button inline-flex items-center gap-2 !text-emerald-100" type="button" @click="closeThread"><CheckCircle2 class="h-4 w-4" /> Oznacz jako zakończoną</button>
            <span v-else class="inline-flex items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100"><CheckCircle2 class="h-4 w-4" /> Zakończona</span>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <button v-for="device in activeEntry.contact.devices" :key="device.deviceId" class="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition" :class="store.selectedDeviceId === device.deviceId ? 'border-cyan-300/30 bg-cyan-400/10 text-white' : 'border-white/10 text-[var(--text-dim)] hover:text-white'" type="button" @click="store.selectedDeviceId = device.deviceId"><span class="h-2 w-2 rounded-full" :class="isDeviceOnline(device) ? 'bg-emerald-400' : 'bg-slate-600'" /><Monitor class="h-3.5 w-3.5" /> {{ formatDeviceLabelForMaster(device) }}</button>
          </div>
        </header>

        <div ref="chatViewport" class="relative mt-4 min-h-72 flex-1 space-y-3 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" @scroll="handleChatScroll">
          <template v-for="entry in timeline" :key="entry.id">
            <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-dim)]"><span class="h-px flex-1 bg-white/10" /><span>{{ entry.label }}</span><span class="h-px flex-1 bg-white/10" /></div>
            <div v-else class="max-w-[82%] rounded-2xl border px-4 py-3 text-sm leading-6" :class="entry.message.senderRole === 'master' ? 'ml-auto border-cyan-400/25 bg-cyan-500/10 text-white' : 'border-white/10 bg-white/[0.04] text-white'">
              <div class="mb-1 flex justify-between gap-4 text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)]"><span>{{ entry.message.senderEmail }}</span><span>{{ messageDeviceLabel(entry.message) }}</span></div>{{ entry.message.body }}
              <div class="mt-1.5 flex justify-end gap-2 text-[10px] text-[var(--text-dim)]"><span>{{ formatMessageTime(entry.message.createdAt) }}</span><span v-if="entry.message.senderRole === 'master'" :class="store.getChatMessageStatus(entry.message) === 'read' ? 'text-cyan-200' : ''">{{ messageStatusLabel(entry.message) }}</span></div>
            </div>
          </template>
          <div v-if="contactIsTyping && canSend" class="inline-flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[var(--text-dim)]"><span class="animate-pulse">●</span> {{ contactLabel(activeEntry.contact) }} pisze…</div>
          <div v-if="!timeline.length" class="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-sm text-[var(--text-dim)]">Brak treści w tej wiadomości.</div>
          <button v-if="showJumpToLatest" class="sticky bottom-2 mx-auto block rounded-full border border-cyan-300/25 bg-[#101426]/95 px-3 py-1.5 text-xs text-cyan-100 shadow-lg" type="button" @click="scrollToLatest">Najnowsze wiadomości</button>
        </div>

        <div v-if="canSend" class="mt-4"><div class="flex gap-2"><input v-model="store.pendingChatMessage" class="soft-input !rounded-xl" maxlength="4000" placeholder="Napisz wiadomość..." @input="handleTyping" @keydown.enter.exact.prevent="sendMessage" /><button class="glass-button !rounded-xl !px-5" type="button" :disabled="!store.pendingChatMessage.trim()" @click="sendMessage"><Send class="h-4 w-4" /><span class="sr-only">Wyślij</span></button></div><p v-if="store.chatSendError" class="mt-2 text-xs text-rose-200">{{ store.chatSendError }}</p></div>
        <div v-else class="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-4 py-3 text-sm text-emerald-100">Ta wiadomość została zakończona. Jej historia pozostaje dostępna, ale nie można już dopisywać odpowiedzi.</div>
      </template>

      <div v-else class="flex min-h-96 flex-1 items-center justify-center text-center"><div><MessageSquare class="mx-auto h-8 w-8 text-[var(--muted)]" /><h2 class="mt-4 text-base font-semibold text-white">Wybierz wiadomość</h2><p class="mt-2 text-sm text-[var(--text-dim)]">Otwórz istniejący wątek albo utwórz nowy.</p></div></div>
    </section>
  </div>
</template>
