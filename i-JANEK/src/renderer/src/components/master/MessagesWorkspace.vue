<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Search, Send } from 'lucide-vue-next'
import { buildConversationTimeline } from '@/services/chat'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { CompanyChatMessage, DeviceRecord } from '@shared/contracts'

const CHAT_READS_KEY = 'i-janek-master-chat-reads'
const store = useAppStore()
const searchQuery = ref('')
const chatReads = ref<Record<string, number>>({})

interface ConversationEntry {
  key: string
  ownerUid: string
  ownerEmail: string
  companyName: string
  devices: DeviceRecord[]
  latestMessageAt: number
  isPlaceholder: boolean
}

const conversations = computed<ConversationEntry[]>(() => {
  const grouped = new Map<string, ConversationEntry>()
  for (const device of store.devices) {
    const companyName = device.companyName?.trim() || device.ownerEmail
    const latestMessageAt = (store.companyChats[device.ownerUid] ?? []).at(-1)?.createdAt ?? 0
    const existing = grouped.get(device.ownerUid)
    if (existing) {
      existing.devices.push(device)
      existing.latestMessageAt = Math.max(existing.latestMessageAt, latestMessageAt)
    } else {
      grouped.set(device.ownerUid, { key: device.ownerUid, ownerUid: device.ownerUid, ownerEmail: device.ownerEmail, companyName, devices: [device], latestMessageAt, isPlaceholder: false })
    }
  }
  const names = new Set([...grouped.values()].map((entry) => entry.companyName.toLocaleLowerCase('pl')))
  for (const companyName of store.masterSettings.companyOptions) {
    const trimmed = companyName.trim()
    if (!trimmed || names.has(trimmed.toLocaleLowerCase('pl'))) continue
    grouped.set(`virtual:${trimmed}`, { key: `virtual:${trimmed}`, ownerUid: `virtual:${trimmed}`, ownerEmail: '', companyName: trimmed, devices: [], latestMessageAt: 0, isPlaceholder: true })
  }
  return [...grouped.values()].sort((left, right) => Number(left.isPlaceholder) - Number(right.isPlaceholder) || right.latestMessageAt - left.latestMessageAt || left.companyName.localeCompare(right.companyName, 'pl'))
})

const filteredConversations = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pl')
  if (!query) return conversations.value
  return conversations.value.filter((entry) => `${entry.companyName} ${entry.ownerEmail}`.toLocaleLowerCase('pl').includes(query))
})
const activeConversation = computed(() => conversations.value.find((entry) => entry.ownerUid === store.selectedConversationOwnerUid) ?? conversations.value[0] ?? null)
const timeline = computed(() => buildConversationTimeline(activeConversation.value ? store.selectedConversationMessages : []))
const canSend = computed(() => Boolean(activeConversation.value && !activeConversation.value.isPlaceholder))

try {
  const stored = localStorage.getItem(CHAT_READS_KEY)
  if (stored) chatReads.value = JSON.parse(stored) as Record<string, number>
} catch {
  chatReads.value = {}
}

watch(() => conversations.value.map((entry) => entry.key).join('|'), () => {
  if (store.selectedConversationOwnerUid && conversations.value.some((entry) => entry.ownerUid === store.selectedConversationOwnerUid)) return
  store.selectedConversationOwnerUid = conversations.value[0]?.ownerUid ?? ''
}, { immediate: true })

watch([() => store.selectedConversationOwnerUid, () => store.selectedConversationMessages.length], ([ownerUid]) => {
  if (!ownerUid) return
  chatReads.value = { ...chatReads.value, [ownerUid]: Date.now() }
  localStorage.setItem(CHAT_READS_KEY, JSON.stringify(chatReads.value))
})

function unreadCount(conversation: ConversationEntry) {
  const lastRead = chatReads.value[conversation.ownerUid] ?? 0
  return (store.companyChats[conversation.ownerUid] ?? []).filter((message) => message.senderRole === 'slave' && message.createdAt > lastRead).length
}

function isOnline(conversation: ConversationEntry) {
  return conversation.devices.some((device) => !device.offline && Date.now() - device.lastSeenAt < 300000)
}

function messageDeviceLabel(message: CompanyChatMessage) {
  if (message.deviceLabel?.trim()) return message.deviceLabel
  if (!message.deviceId) return 'firma'
  return formatDeviceLabelForMaster(store.devices.find((device) => device.deviceId === message.deviceId)) || message.deviceId
}
</script>

<template>
  <div class="grid min-h-[620px] lg:grid-cols-[300px_minmax(0,1fr)]">
    <aside class="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
      <label class="relative block">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input v-model="searchQuery" class="soft-input !rounded-xl !py-2.5 !pl-9" placeholder="Szukaj firmy..." />
      </label>
      <div class="mt-3 max-h-[calc(100vh-250px)] space-y-1.5 overflow-y-auto pr-1 scrollbar-glass">
        <button
          v-for="conversation in filteredConversations"
          :key="conversation.key"
          class="flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition"
          :class="store.selectedConversationOwnerUid === conversation.ownerUid ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-transparent hover:border-white/10 hover:bg-white/[0.035]'"
          type="button"
          @click="store.selectedConversationOwnerUid = conversation.ownerUid"
        >
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="isOnline(conversation) ? 'bg-emerald-400' : 'bg-slate-600'" />
          <span class="min-w-0 flex-1"><strong class="block truncate text-sm text-white">{{ conversation.companyName }}</strong><span class="mt-0.5 block truncate text-xs text-[var(--text-dim)]">{{ conversation.ownerEmail || 'Firma bez urządzeń' }}</span></span>
          <span v-if="unreadCount(conversation)" class="rounded-full bg-cyan-300 px-2 py-0.5 text-xs font-semibold text-slate-950">{{ unreadCount(conversation) }}</span>
        </button>
        <p v-if="!filteredConversations.length" class="p-4 text-center text-sm text-[var(--text-dim)]">Nie znaleziono rozmów.</p>
      </div>
    </aside>

    <section class="flex min-h-0 flex-col p-5">
      <template v-if="activeConversation">
        <header class="border-b border-white/10 pb-4">
          <h2 class="text-lg font-semibold text-white">{{ activeConversation.companyName }}</h2>
          <p class="mt-1 text-sm text-[var(--text-dim)]">{{ activeConversation.ownerEmail || 'Brak aktywnego klienta' }} · {{ activeConversation.devices.length }} komputerów</p>
        </header>
        <div class="scrollbar-glass mt-4 max-h-[calc(100vh-350px)] min-h-72 flex-1 space-y-3 overflow-y-auto pr-2">
          <template v-for="entry in timeline" :key="entry.id">
            <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-dim)]"><span class="h-px flex-1 bg-white/10" /><span>{{ entry.label }}</span><span class="h-px flex-1 bg-white/10" /></div>
            <div v-else class="max-w-[82%] rounded-2xl border px-4 py-3 text-sm leading-6" :class="entry.message.senderRole === 'master' ? 'ml-auto border-cyan-400/25 bg-cyan-500/10 text-white' : 'border-white/10 bg-white/[0.04] text-white'">
              <div class="mb-1 flex justify-between gap-4 text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)]"><span>{{ entry.message.senderEmail }}</span><span>{{ messageDeviceLabel(entry.message) }}</span></div>
              {{ entry.message.body }}
            </div>
          </template>
          <div v-if="!timeline.length" class="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-sm text-[var(--text-dim)]">{{ activeConversation.isPlaceholder ? 'Firma nie ma jeszcze urządzenia ani kanału wiadomości.' : 'Brak wiadomości w tej rozmowie.' }}</div>
        </div>
        <div class="mt-4 flex gap-2">
          <input v-model="store.pendingChatMessage" class="soft-input !rounded-xl" :disabled="!canSend" :placeholder="canSend ? 'Napisz wiadomość...' : 'Kanał wiadomości nie jest jeszcze aktywny'" @keyup.enter="canSend && store.sendChatMessage()" />
          <button class="glass-button !rounded-xl !px-5" type="button" :disabled="!canSend" @click="store.sendChatMessage()"><Send class="h-4 w-4" /><span class="sr-only">Wyślij</span></button>
        </div>
      </template>
      <div v-else class="flex flex-1 items-center justify-center text-sm text-[var(--text-dim)]">Brak rozmów.</div>
    </section>
  </div>
</template>
