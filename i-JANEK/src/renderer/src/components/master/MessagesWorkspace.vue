<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, MessageSquare, Monitor, Search, Send, UserRound } from 'lucide-vue-next'
import { buildConversationTimeline } from '@/services/chat'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { CompanyChatMessage, DeviceRecord } from '@shared/contracts'

const CHAT_READS_KEY = 'i-janek-master-chat-reads'
const store = useAppStore()
const searchQuery = ref('')
const chatReads = ref<Record<string, number>>({})
const expandedCompanies = ref<Record<string, boolean>>({})

interface ContactEntry {
  key: string
  ownerUid: string
  ownerEmail: string
  companyName: string
  devices: DeviceRecord[]
  latestMessageAt: number
}

interface CompanyGroup {
  key: string
  name: string
  contacts: ContactEntry[]
  latestMessageAt: number
  unread: number
}

const contacts = computed<ContactEntry[]>(() => {
  const grouped = new Map<string, ContactEntry>()
  for (const device of store.devices) {
    const companyName = device.companyName?.trim() || 'Bez firmy'
    const latestMessageAt = (store.companyChats[device.ownerUid] ?? []).at(-1)?.createdAt ?? 0
    const existing = grouped.get(device.ownerUid)
    if (existing) {
      existing.devices.push(device)
      existing.latestMessageAt = Math.max(existing.latestMessageAt, latestMessageAt)
    } else {
      grouped.set(device.ownerUid, {
        key: device.ownerUid,
        ownerUid: device.ownerUid,
        ownerEmail: device.ownerEmail,
        companyName,
        devices: [device],
        latestMessageAt
      })
    }
  }
  return [...grouped.values()]
})

const companyGroups = computed<CompanyGroup[]>(() => {
  const groups = new Map<string, CompanyGroup>()
  for (const companyName of store.masterSettings.companyOptions) {
    const name = companyName.trim()
    if (!name) continue
    groups.set(normalize(name), { key: normalize(name), name, contacts: [], latestMessageAt: 0, unread: 0 })
  }
  for (const contact of contacts.value) {
    const key = normalize(contact.companyName)
    const existing = groups.get(key) ?? { key, name: contact.companyName, contacts: [], latestMessageAt: 0, unread: 0 }
    existing.contacts.push(contact)
    existing.latestMessageAt = Math.max(existing.latestMessageAt, contact.latestMessageAt)
    existing.unread += unreadCount(contact)
    groups.set(key, existing)
  }
  for (const group of groups.values()) {
    group.contacts.sort((left, right) => unreadCount(right) - unreadCount(left) || right.latestMessageAt - left.latestMessageAt || contactLabel(left).localeCompare(contactLabel(right), 'pl'))
  }
  return [...groups.values()].sort((left, right) => Number(right.unread > 0) - Number(left.unread > 0) || right.unread - left.unread || right.latestMessageAt - left.latestMessageAt || left.name.localeCompare(right.name, 'pl'))
})

const filteredGroups = computed<CompanyGroup[]>(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pl')
  if (!query) return companyGroups.value
  return companyGroups.value
    .map((group) => {
      if (group.name.toLocaleLowerCase('pl').includes(query)) return group
      const matchingContacts = group.contacts.filter((contact) => contactSearchText(contact).includes(query))
      return { ...group, contacts: matchingContacts }
    })
    .filter((group) => group.contacts.length > 0)
})

const activeContact = computed(() => contacts.value.find((contact) => contact.ownerUid === store.selectedConversationOwnerUid) ?? null)
const timeline = computed(() => buildConversationTimeline(activeContact.value ? store.selectedConversationMessages : []))
const canSend = computed(() => Boolean(activeContact.value))
const activeCompanyName = computed(() => activeContact.value?.companyName ?? '')

try {
  const stored = localStorage.getItem(CHAT_READS_KEY)
  if (stored) chatReads.value = JSON.parse(stored) as Record<string, number>
} catch {
  chatReads.value = {}
}

watch(companyGroups, (groups) => {
  const nextExpanded = { ...expandedCompanies.value }
  for (const group of groups) {
    if (!(group.key in nextExpanded)) nextExpanded[group.key] = group.unread > 0 || groups.length <= 4
  }
  expandedCompanies.value = nextExpanded

  if (store.selectedConversationOwnerUid && contacts.value.some((contact) => contact.ownerUid === store.selectedConversationOwnerUid)) return
  const firstContact = groups.flatMap((group) => group.contacts)[0]
  if (firstContact) selectContact(firstContact)
  else store.selectedConversationOwnerUid = ''
}, { immediate: true })

watch([() => store.selectedConversationOwnerUid, () => store.selectedConversationMessages.length], ([ownerUid]) => {
  if (!ownerUid) return
  chatReads.value = { ...chatReads.value, [ownerUid]: Date.now() }
  localStorage.setItem(CHAT_READS_KEY, JSON.stringify(chatReads.value))
})

function normalize(value: string) {
  return value.trim().toLocaleLowerCase('pl')
}

function unreadCount(contact: ContactEntry) {
  const lastRead = chatReads.value[contact.ownerUid] ?? 0
  return (store.companyChats[contact.ownerUid] ?? []).filter((message) => message.senderRole === 'slave' && message.createdAt > lastRead).length
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
  return !device.offline && Date.now() - device.lastSeenAt < 300000
}

function selectContact(contact: ContactEntry) {
  store.selectedConversationOwnerUid = contact.ownerUid
  const preferredDevice = contact.devices.find(isDeviceOnline) ?? contact.devices[0]
  if (preferredDevice) store.selectedDeviceId = preferredDevice.deviceId
  expandedCompanies.value = { ...expandedCompanies.value, [normalize(contact.companyName)]: true }
}

function toggleCompany(companyKey: string) {
  expandedCompanies.value = { ...expandedCompanies.value, [companyKey]: !expandedCompanies.value[companyKey] }
}

function selectDevice(device: DeviceRecord) {
  store.selectedDeviceId = device.deviceId
}

function messageDeviceLabel(message: CompanyChatMessage) {
  if (message.deviceLabel?.trim()) return message.deviceLabel
  if (!message.deviceId) return 'firma'
  return formatDeviceLabelForMaster(store.devices.find((device) => device.deviceId === message.deviceId)) || message.deviceId
}
</script>

<template>
  <div class="grid min-h-[620px] lg:grid-cols-[340px_minmax(0,1fr)]">
    <aside class="border-b border-white/10 p-4 lg:border-b-0 lg:border-r">
      <label class="relative block">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
        <input v-model="searchQuery" class="soft-input !rounded-xl !py-2.5 !pl-9" placeholder="Szukaj firmy, osoby lub komputera..." />
      </label>

      <div class="mt-4 space-y-3">
        <section v-for="company in filteredGroups" :key="company.key" class="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.018]">
          <button class="flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/[0.035]" type="button" @click="toggleCompany(company.key)">
            <ChevronDown class="h-4 w-4 shrink-0 text-[var(--muted)] transition" :class="expandedCompanies[company.key] ? '' : '-rotate-90'" />
            <span class="min-w-0 flex-1"><strong class="block truncate text-sm text-white">{{ company.name }}</strong><small class="mt-0.5 block text-[var(--text-dim)]">{{ company.contacts.length }} kontaktów</small></span>
            <span v-if="company.unread" class="rounded-full bg-fuchsia-300 px-2 py-0.5 text-xs font-semibold text-slate-950">{{ company.unread }}</span>
          </button>

          <div v-if="expandedCompanies[company.key]" class="border-t border-white/[0.07] p-1.5">
            <button
              v-for="contact in company.contacts"
              :key="contact.key"
              class="flex w-full items-center gap-3 rounded-lg border px-2.5 py-2.5 text-left transition"
              :class="store.selectedConversationOwnerUid === contact.ownerUid ? 'border-cyan-300/25 bg-cyan-400/10' : 'border-transparent hover:bg-white/[0.035]'"
              type="button"
              @click="selectContact(contact)"
            >
              <span class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-[var(--text-dim)]">
                <UserRound class="h-4 w-4" />
                <span class="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#0b0918]" :class="isContactOnline(contact) ? 'bg-emerald-400' : 'bg-slate-600'" />
              </span>
              <span class="min-w-0 flex-1">
                <strong class="block truncate text-sm text-white">{{ contactLabel(contact) }}</strong>
                <small class="mt-0.5 block truncate text-[var(--text-dim)]">{{ contact.devices.map((device) => formatDeviceLabelForMaster(device)).join(', ') }}</small>
              </span>
              <span v-if="unreadCount(contact)" class="rounded-full bg-cyan-300 px-2 py-0.5 text-xs font-semibold text-slate-950">{{ unreadCount(contact) }}</span>
            </button>
            <p v-if="!company.contacts.length" class="px-3 py-4 text-center text-xs text-[var(--text-dim)]">Brak użytkowników i komputerów.</p>
          </div>
        </section>
        <p v-if="!filteredGroups.length" class="p-4 text-center text-sm text-[var(--text-dim)]">Nie znaleziono rozmów.</p>
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

        <div class="mt-4 min-h-72 flex-1 space-y-3 pr-2">
          <template v-for="entry in timeline" :key="entry.id">
            <div v-if="entry.kind === 'day'" class="flex items-center gap-3 py-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-dim)]"><span class="h-px flex-1 bg-white/10" /><span>{{ entry.label }}</span><span class="h-px flex-1 bg-white/10" /></div>
            <div v-else class="max-w-[82%] rounded-2xl border px-4 py-3 text-sm leading-6" :class="entry.message.senderRole === 'master' ? 'ml-auto border-cyan-400/25 bg-cyan-500/10 text-white' : 'border-white/10 bg-white/[0.04] text-white'">
              <div class="mb-1 flex justify-between gap-4 text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)]"><span>{{ entry.message.senderEmail }}</span><span>{{ messageDeviceLabel(entry.message) }}</span></div>
              {{ entry.message.body }}
            </div>
          </template>
          <div v-if="!timeline.length" class="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-white/10 text-center text-sm text-[var(--text-dim)]">Brak wiadomości z tym kontaktem.</div>
        </div>

        <div class="mt-4">
          <p v-if="activeContact.devices.length" class="mb-2 text-xs text-[var(--text-dim)]">Wiadomość do: <strong class="text-white">{{ formatDeviceLabelForMaster(store.selectedDevice) }}</strong></p>
          <div class="flex gap-2">
            <input v-model="store.pendingChatMessage" class="soft-input !rounded-xl" :disabled="!canSend" placeholder="Napisz wiadomość..." @keyup.enter="canSend && store.sendChatMessage()" />
            <button class="glass-button !rounded-xl !px-5" type="button" :disabled="!canSend" @click="store.sendChatMessage()"><Send class="h-4 w-4" /><span class="sr-only">Wyślij</span></button>
          </div>
        </div>
      </template>
      <div v-else class="flex min-h-96 flex-1 items-center justify-center text-center"><div><MessageSquare class="mx-auto h-8 w-8 text-[var(--muted)]" /><h2 class="mt-4 text-base font-semibold text-white">Wybierz kontakt</h2><p class="mt-2 text-sm text-[var(--text-dim)]">Rozwiń firmę i wybierz osobę lub komputer.</p></div></div>
    </section>
  </div>
</template>
