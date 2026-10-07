<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { MessageSquare, Monitor, Search, Send, UserRound } from 'lucide-vue-next'
import { buildConversationTimeline } from '@/services/chat'
import { isDeviceOnline as isOnlineAt } from '@/services/device-presence'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { CompanyChatMessage, DeviceRecord } from '@shared/contracts'

const store = useAppStore()
const searchQuery = ref('')
const showRead = ref(false)
const chatViewport = ref<HTMLElement | null>(null)
const showJumpToLatest = ref(false)
let typingTimer: number | null = null
let typingOwnerUid = ''

// The Master should explicitly open a conversation before it is marked as read.
store.selectedConversationOwnerUid = ''

interface ContactEntry {
  key: string
  ownerUid: string
  ownerEmail: string
  companyName: string
  devices: DeviceRecord[]
  latestUnreadMessageAt: number
  unread: number
  latestMessageAt: number
}

const contacts = computed<ContactEntry[]>(() => {
  const grouped = new Map<string, ContactEntry>()
  for (const device of store.devices) {
    const companyName = device.companyName?.trim() || 'Bez firmy'
    const messages = store.companyChats[device.ownerUid] ?? []
    const lastReadAt = store.companyChatStates[device.ownerUid]?.master?.lastReadAt ?? 0
    const latestUnreadMessageAt = messages.reduce((latest, message) => (
      message.senderRole === 'slave' && message.createdAt > lastReadAt
        ? Math.max(latest, message.createdAt)
        : latest
    ), 0)
    const latestMessageAt = messages.reduce((latest, message) => Math.max(latest, message.createdAt), 0)
    const unread = messages.filter((message) => message.senderRole === 'slave' && message.createdAt > lastReadAt).length
    const existing = grouped.get(device.ownerUid)
    if (existing) {
      existing.devices.push(device)
      existing.latestUnreadMessageAt = Math.max(existing.latestUnreadMessageAt, latestUnreadMessageAt)
      existing.latestMessageAt = Math.max(existing.latestMessageAt, latestMessageAt)
      existing.unread = Math.max(existing.unread, unread)
    } else {
      grouped.set(device.ownerUid, {
        key: device.ownerUid,
        ownerUid: device.ownerUid,
        ownerEmail: device.ownerEmail,
        companyName,
        devices: [device],
        latestUnreadMessageAt,
        unread,
        latestMessageAt
      })
    }
  }
  return [...grouped.values()]
})

const filteredContacts = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pl')
  return contacts.value
    .filter((contact) => contact.latestMessageAt > 0)
    .filter((contact) => showRead.value || contact.unread > 0 || contact.ownerUid === store.selectedConversationOwnerUid)
    .filter((contact) => !query || contactSearchText(contact).includes(query))
    .sort((left, right) => Number(right.unread > 0) - Number(left.unread > 0)
      || right.latestUnreadMessageAt - left.latestUnreadMessageAt
      || right.latestMessageAt - left.latestMessageAt
      || contactLabel(left).localeCompare(contactLabel(right), 'pl'))
})

const activeContact = computed(() => contacts.value.find((contact) => contact.ownerUid === store.selectedConversationOwnerUid) ?? null)
const timeline = computed(() => buildConversationTimeline(activeContact.value ? store.selectedConversationMessages : []))
const canSend = computed(() => Boolean(activeContact.value))
const activeCompanyName = computed(() => activeContact.value?.companyName ?? '')
const contactIsTyping = computed(() => {
  if (!activeContact.value) return false
  const state = store.companyChatStates[activeContact.value.ownerUid]?.slave
  return Boolean(state?.typing && Date.now() - state.updatedAt < 8_000)
})

watch(contacts, () => {
  if (store.selectedConversationOwnerUid && contacts.value.some((contact) => contact.ownerUid === store.selectedConversationOwnerUid)) return
  store.selectedConversationOwnerUid = ''
}, { immediate: true })

watch([() => store.selectedConversationOwnerUid, () => store.selectedConversationMessages.length], async ([ownerUid], [previousOwnerUid]) => {
  if (!ownerUid) return
  if (previousOwnerUid && previousOwnerUid !== ownerUid) stopTyping(previousOwnerUid)
  const shouldScroll = ownerUid !== previousOwnerUid || isNearBottom() || store.selectedConversationMessages.at(-1)?.senderRole === 'master'
  await nextTick()
  if (shouldScroll) {
    scrollToLatest()
    void store.markChatRead(ownerUid)
  } else showJumpToLatest.value = true
}, { immediate: true })

function unreadCount(contact: ContactEntry) {
  return contact.unread
}

function contactLabel(contact: ContactEntry) {
  return contact.devices.find((device) => device.contactName?.trim())?.contactName?.trim()
    || contact.ownerEmail.split('@')[0]
    || contact.ownerEmail
}

function contactSearchText(contact: ContactEntry) {
  return [contact.companyName, contact.ownerEmail, contactLabel(contact), ...contact.devices.map((device) => `${formatDeviceLabelForMaster(device)} ${device.hostname}`)]
    .join(' ')
    .toLocaleLowerCase('pl')
}

function isContactOnline(contact: ContactEntry) {
  return contact.devices.some(isDeviceOnline)
}

function isDeviceOnline(device: DeviceRecord) {
  return isOnlineAt(device, store.statusNow)
}

function selectContact(contact: ContactEntry) {
  store.selectedConversationOwnerUid = contact.ownerUid
  const latestUnreadMessage = [...(store.companyChats[contact.ownerUid] ?? [])]
    .reverse()
    .find((message) => message.senderRole === 'slave' && message.createdAt > (store.companyChatStates[contact.ownerUid]?.master?.lastReadAt ?? 0))
  const preferredDevice = contact.devices.find((device) => device.deviceId === latestUnreadMessage?.deviceId)
    ?? contact.devices.find(isDeviceOnline)
    ?? contact.devices[0]
  if (preferredDevice) store.selectedDeviceId = preferredDevice.deviceId
}

function selectDevice(device: DeviceRecord) {
  store.selectedDeviceId = device.deviceId
}

function messageDeviceLabel(message: CompanyChatMessage) {
  if (!message.deviceId) return 'firma'
  const device = store.devices.find((entry) => entry.deviceId === message.deviceId)
  return device ? formatDeviceLabelForMaster(device) : 'komputer'
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
  if (!viewport) return true
  return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 100
}

function scrollToLatest() {
  const viewport = chatViewport.value
  if (!viewport) return
  viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  showJumpToLatest.value = false
}

function handleChatScroll() {
  if (isNearBottom()) {
    showJumpToLatest.value = false
    void store.markChatRead()
  }
}

function stopTyping(ownerUid = typingOwnerUid) {
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = null
  if (ownerUid) void store.setChatTyping(ownerUid, false)
  typingOwnerUid = ''
}

function handleTyping() {
  const ownerUid = store.selectedConversationOwnerUid
  if (!ownerUid) return
  if (typingOwnerUid && typingOwnerUid !== ownerUid) stopTyping(typingOwnerUid)
  if (!store.pendingChatMessage.trim()) {
    stopTyping(ownerUid)
    return
  }
  if (typingOwnerUid !== ownerUid) {
    typingOwnerUid = ownerUid
    void store.setChatTyping(ownerUid, true)
  }
  if (typingTimer) window.clearTimeout(typingTimer)
  typingTimer = window.setTimeout(() => stopTyping(ownerUid), 1_600)
}

async function sendMessage() {
  const ownerUid = store.selectedConversationOwnerUid
  stopTyping(ownerUid)
  if (await store.sendChatMessage(ownerUid)) await nextTick(scrollToLatest)
}

onBeforeUnmount(() => stopTyping())
</script>

<template>
  <div class="grid h-full min-h-[620px] lg:grid-cols-[340px_minmax(0,1fr)]">
    <aside class="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
      <label class="relative block">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input v-model="searchQuery" class="soft-input !rounded-xl !py-2.5 !pl-9" placeholder="Szukaj osoby lub firmy..." />
      </label>

      <button class="ghost-button mt-3 w-full !rounded-xl !py-2.5" type="button" @click="showRead = !showRead">
        {{ showRead ? 'Pokaż tylko nieprzeczytane' : 'Pokaż przeczytane' }}
      </button>

      <div class="mt-4 space-y-2">
        <button
          v-for="contact in filteredContacts"
          :key="contact.key"
          class="flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition"
          :class="store.selectedConversationOwnerUid === contact.ownerUid ? 'border-cyan-300/25 bg-cyan-400/10' : 'border-white/[0.08] bg-white/[0.018] hover:bg-white/[0.035]'"
          type="button"
          @click="selectContact(contact)"
        >
          <span class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[var(--text-dim)]">
            <UserRound class="h-4 w-4" />
            <span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0918]" :class="isContactOnline(contact) ? 'bg-emerald-400' : 'bg-slate-600'" />
          </span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-sm text-white">{{ contactLabel(contact) }}</strong>
            <small class="mt-0.5 block truncate text-[var(--text-dim)]">{{ contact.companyName }}</small>
          </span>
          <span v-if="unreadCount(contact)" class="rounded-full bg-cyan-300 px-2 py-0.5 text-xs font-semibold text-slate-950">{{ unreadCount(contact) }}</span>
        </button>
        <p v-if="!filteredContacts.length" class="p-4 text-center text-sm text-[var(--text-dim)]">
          {{ searchQuery.trim() ? 'Nie znaleziono rozmów.' : showRead ? 'Brak rozmów.' : 'Brak nieodczytanych wiadomości.' }}
        </p>
      </div>
    </aside>

    <section class="flex min-h-0 flex-col p-5">
      <template v-if="activeContact">
        <header class="border-b border-white/10 pb-4">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div class="text-xs font-medium uppercase tracking-[0.14em] text-cyan-200">{{ activeCompanyName }}</div>
              <h2 class="mt-1 text-lg font-semibold text-white">{{ contactLabel(activeContact) }}</h2>
              <p class="mt-1 text-sm text-[var(--text-dim)]">{{ activeContact.ownerEmail }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="device in activeContact.devices"
                :key="device.deviceId"
                class="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition"
                :class="store.selectedDeviceId === device.deviceId ? 'border-cyan-300/30 bg-cyan-400/10 text-white' : 'border-white/10 text-[var(--text-dim)] hover:text-white'"
                type="button"
                @click="selectDevice(device)"
              >
                <span class="h-2 w-2 rounded-full" :class="isDeviceOnline(device) ? 'bg-emerald-400' : 'bg-slate-600'" />
                <Monitor class="h-3.5 w-3.5" /> {{ formatDeviceLabelForMaster(device) }}
              </button>
            </div>
          </div>
        </header>

        <div ref="chatViewport" class="relative mt-4 min-h-72 flex-1 space-y-3 overflow-y-auto pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" @scroll="handleChatScroll">
          <template v-for="entry in timeline" :key="entry.id">
            <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-dim)]"><span class="h-px flex-1 bg-white/10" /><span>{{ entry.label }}</span><span class="h-px flex-1 bg-white/10" /></div>
            <div v-else class="max-w-[82%] rounded-2xl border px-4 py-3 text-sm leading-6" :class="entry.message.senderRole === 'master' ? 'ml-auto border-cyan-400/25 bg-cyan-500/10 text-white' : 'border-white/10 bg-white/[0.04] text-white'">
              <div class="mb-1 flex justify-between gap-4 text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)]"><span>{{ entry.message.senderEmail }}</span><span>{{ messageDeviceLabel(entry.message) }}</span></div>
              {{ entry.message.body }}
              <div class="mt-1.5 flex justify-end gap-2 text-[10px] text-[var(--text-dim)]">
                <span>{{ formatMessageTime(entry.message.createdAt) }}</span>
                <span v-if="entry.message.senderRole === 'master'" :class="store.getChatMessageStatus(entry.message) === 'read' ? 'text-cyan-200' : ''">{{ messageStatusLabel(entry.message) }}</span>
              </div>
            </div>
          </template>
          <div v-if="contactIsTyping" class="inline-flex items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-[var(--text-dim)]"><span class="animate-pulse">●</span> {{ contactLabel(activeContact) }} pisze…</div>
          <div v-if="!timeline.length" class="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-sm text-[var(--text-dim)]">Brak wiadomości z tym kontaktem.</div>
          <button v-if="showJumpToLatest" class="sticky bottom-2 mx-auto block rounded-full border border-cyan-300/25 bg-[#101426]/95 px-3 py-1.5 text-xs text-cyan-100 shadow-lg" type="button" @click="scrollToLatest">Najnowsze wiadomości</button>
        </div>

        <div class="mt-4">
          <p v-if="activeContact.devices.length" class="mb-2 text-xs text-[var(--text-dim)]">Wiadomość do: <strong class="text-white">{{ formatDeviceLabelForMaster(store.selectedDevice) }}</strong></p>
          <div class="flex gap-2">
            <input v-model="store.pendingChatMessage" class="soft-input !rounded-xl" maxlength="4000" :disabled="!canSend" placeholder="Napisz wiadomość..." @input="handleTyping" @keydown.enter.exact.prevent="canSend && sendMessage()" />
            <button class="glass-button !rounded-xl !px-5" type="button" :disabled="!canSend || !store.pendingChatMessage.trim()" @click="sendMessage"><Send class="h-4 w-4" /><span class="sr-only">Wyślij</span></button>
          </div>
          <p v-if="store.chatSendError" class="mt-2 text-xs text-rose-200">{{ store.chatSendError }}</p>
        </div>
      </template>
      <div v-else class="flex min-h-96 flex-1 items-center justify-center text-center"><div><MessageSquare class="mx-auto h-8 w-8 text-[var(--muted)]" /><h2 class="mt-4 text-base font-semibold text-white">Wybierz kontakt</h2><p class="mt-2 text-sm text-[var(--text-dim)]">Wybierz osobę z listy rozmów.</p></div></div>
    </section>
  </div>
</template>
