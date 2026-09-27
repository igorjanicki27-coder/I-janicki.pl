<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Monitor,
  Search,
  Settings,
  Users
} from 'lucide-vue-next'
import DeviceWorkspace from '@/components/master/DeviceWorkspace.vue'
import MessagesWorkspace from '@/components/master/MessagesWorkspace.vue'
import TasksWorkspace from '@/components/master/TasksWorkspace.vue'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { DeviceRecord } from '@shared/contracts'

const emit = defineEmits<{ openSettings: [] }>()
const store = useAppStore()
const sections = ['overview', 'organizations', 'devices', 'tasks', 'messages'] as const
type Section = (typeof sections)[number]

const activeSection = ref<Section>('overview')
const searchQuery = ref('')
const companyFilter = ref('all')
const statusFilter = ref<'all' | 'online' | 'attention' | 'offline'>('all')

interface Organization {
  key: string
  name: string
  devices: DeviceRecord[]
  users: string[]
}

const onlineDevices = computed(() => store.devices.filter(isOnline))
const attentionDevices = computed(() => store.devices.filter(needsAttention))
const offlineDevices = computed(() => store.devices.filter((device) => !isOnline(device)))
const pendingDevices = computed(() => store.devices.filter((device) => device.approvalStatus === 'pending'))

const organizations = computed<Organization[]>(() => {
  const result = new Map<string, Organization>()
  for (const device of store.devices) {
    const name = companyNameFor(device)
    const key = name.toLocaleLowerCase('pl')
    const existing = result.get(key)
    if (existing) {
      existing.devices.push(device)
      if (!existing.users.includes(device.ownerEmail)) existing.users.push(device.ownerEmail)
    } else {
      result.set(key, { key, name, devices: [device], users: [device.ownerEmail] })
    }
  }
  for (const companyName of store.masterSettings.companyOptions) {
    const name = companyName.trim()
    if (!name) continue
    const key = name.toLocaleLowerCase('pl')
    if (!result.has(key)) result.set(key, { key, name, devices: [], users: [] })
  }
  return [...result.values()].sort((left, right) => right.devices.length - left.devices.length || left.name.localeCompare(right.name, 'pl'))
})

const orderedDevices = computed(() => [...store.devices].sort((left, right) => {
  const priority = Number(needsAttention(right)) - Number(needsAttention(left))
  if (priority) return priority
  const online = Number(isOnline(right)) - Number(isOnline(left))
  if (online) return online
  return formatDeviceLabelForMaster(left).localeCompare(formatDeviceLabelForMaster(right), 'pl')
}))

const filteredDevices = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pl')
  return orderedDevices.value.filter((device) => {
    const company = companyNameFor(device)
    const statusMatches = statusFilter.value === 'all'
      || (statusFilter.value === 'online' && isOnline(device))
      || (statusFilter.value === 'offline' && !isOnline(device))
      || (statusFilter.value === 'attention' && needsAttention(device))
    const companyMatches = companyFilter.value === 'all' || company === companyFilter.value
    const queryMatches = !query || [formatDeviceLabelForMaster(device), device.hostname, device.ownerEmail, company, device.installationLocation]
      .filter(Boolean).join(' ').toLocaleLowerCase('pl').includes(query)
    return statusMatches && companyMatches && queryMatches
  })
})

const pageMeta = computed(() => {
  if (activeSection.value === 'organizations') return { title: 'Firmy', description: `${organizations.value.length} organizacji w opiece` }
  if (activeSection.value === 'devices') return { title: 'Komputery', description: `${filteredDevices.value.length} z ${store.devices.length} urządzeń` }
  if (activeSection.value === 'tasks') return { title: 'Zadania', description: `${store.openServiceRequests.length} wymaga obsługi` }
  if (activeSection.value === 'messages') return { title: 'Wiadomości', description: 'Rozmowy pogrupowane według firm' }
  return { title: 'Centrum operacyjne', description: 'Najważniejsze informacje z całej infrastruktury' }
})

const navItems = computed(() => [
  { key: 'overview' as const, label: 'Przegląd', icon: LayoutDashboard, badge: 0 },
  { key: 'organizations' as const, label: 'Firmy', icon: Building2, badge: organizations.value.length },
  { key: 'devices' as const, label: 'Komputery', icon: Monitor, badge: store.devices.length },
  { key: 'tasks' as const, label: 'Zadania', icon: ClipboardList, badge: store.openServiceRequests.length },
  { key: 'messages' as const, label: 'Wiadomości', icon: MessageSquare, badge: 0 }
])

function companyNameFor(device: DeviceRecord) {
  const companyName = device.companyName?.trim()
  if (companyName) return companyName
  const [localPart] = device.ownerEmail.split('@')
  return localPart.replace(/[._-]+/g, ' ').trim() || device.ownerEmail
}

function isOnline(device: DeviceRecord) {
  return !device.offline && Date.now() - device.lastSeenAt < 5 * 60 * 1000
}

function alertCount(device: DeviceRecord) {
  return store.alerts.filter((alert) => alert.deviceId === device.deviceId && alert.severity !== 'info').length
}

function needsAttention(device: DeviceRecord) {
  return device.approvalStatus === 'pending' || device.telemetry?.state === 'alert' || device.telemetry?.state === 'warning' || alertCount(device) > 0
}

function organizationOnlineCount(organization: Organization) {
  return organization.devices.filter(isOnline).length
}

function organizationAlertCount(organization: Organization) {
  return organization.devices.reduce((total, device) => total + alertCount(device), 0)
}

function organizationTasksCount(organization: Organization) {
  const deviceIds = new Set(organization.devices.map((device) => device.deviceId))
  return store.openServiceRequests.filter((request) => deviceIds.has(request.deviceId)).length
}

function openOrganization(organization: Organization) {
  companyFilter.value = organization.name
  statusFilter.value = 'all'
  searchQuery.value = ''
  activeSection.value = 'devices'
}

function openDevices(filter: typeof statusFilter.value = 'all') {
  companyFilter.value = 'all'
  statusFilter.value = filter
  searchQuery.value = ''
  activeSection.value = 'devices'
}

function selectDevice(device: DeviceRecord) {
  store.selectedDeviceId = device.deviceId
  store.selectedConversationOwnerUid = device.ownerUid
}

function openDevice(deviceId: string, ownerUid: string) {
  store.selectedDeviceId = deviceId
  store.selectedConversationOwnerUid = ownerUid
  activeSection.value = 'devices'
}

function openTasks() {
  activeSection.value = 'tasks'
}

function formatLastSeen(timestamp: number) {
  const deltaMinutes = Math.floor((Date.now() - timestamp) / 60000)
  if (deltaMinutes < 1) return 'teraz'
  if (deltaMinutes < 60) return `${deltaMinutes} min temu`
  if (deltaMinutes < 1440) return `${Math.floor(deltaMinutes / 60)} godz. temu`
  return new Date(timestamp).toLocaleDateString('pl-PL')
}

onMounted(() => window.addEventListener('i-janek:open-service-requests', openTasks))
onBeforeUnmount(() => window.removeEventListener('i-janek:open-service-requests', openTasks))
</script>

<template>
  <div class="master-dashboard grid h-full min-h-0 overflow-hidden rounded-[26px] border border-white/10 bg-[#070611]/90 shadow-2xl lg:grid-cols-[228px_minmax(0,1fr)]">
    <aside class="hidden min-h-0 flex-col border-r border-white/10 bg-black/15 p-4 lg:flex">
      <div class="px-2 py-3">
        <div class="display-font text-lg tracking-[0.3em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)]">i-JANEK</div>
        <p class="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">panel administratora</p>
      </div>

      <nav class="mt-5 space-y-1" aria-label="Główna nawigacja">
        <button
          v-for="item in navItems"
          :key="item.key"
          type="button"
          class="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition"
          :class="activeSection === item.key ? 'bg-gradient-to-r from-cyan-400/15 to-fuchsia-500/10 text-white ring-1 ring-cyan-300/20' : 'text-[var(--text-dim)] hover:bg-white/5 hover:text-white'"
          @click="activeSection = item.key"
        >
          <component :is="item.icon" class="h-[18px] w-[18px] shrink-0" :class="activeSection === item.key ? 'text-cyan-200' : ''" />
          <span class="flex-1">{{ item.label }}</span>
          <span v-if="item.badge" class="mono min-w-6 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px]" :class="item.key === 'tasks' && item.badge ? 'text-amber-200' : 'text-[var(--text-dim)]'">{{ item.badge }}</span>
        </button>
      </nav>

      <div class="mt-auto space-y-3">
        <div class="rounded-xl border border-white/10 bg-white/[0.025] p-3">
          <div class="flex items-center gap-2 text-xs text-[var(--text-dim)]"><span class="h-2 w-2 rounded-full" :class="store.offline ? 'bg-amber-400' : 'bg-emerald-400'" />{{ store.offline ? 'Tryb offline' : 'Synchronizacja aktywna' }}</div>
          <div class="mt-2 truncate text-xs text-white/70">{{ store.user?.email }}</div>
        </div>
        <button class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--text-dim)] transition hover:bg-white/5 hover:text-white" type="button" @click="emit('openSettings')">
          <Settings class="h-[18px] w-[18px]" /> Ustawienia
        </button>
      </div>
    </aside>

    <main class="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 lg:px-6">
        <div>
          <h1 class="text-xl font-semibold text-white">{{ pageMeta.title }}</h1>
          <p class="mt-1 text-sm text-[var(--text-dim)]">{{ pageMeta.description }}</p>
        </div>
        <div class="flex items-center gap-2">
          <div v-if="store.lastSyncAt" class="hidden text-right text-xs text-[var(--text-dim)] sm:block"><div>Ostatnia synchronizacja</div><div class="mono mt-0.5 text-white/70">{{ new Date(store.lastSyncAt).toLocaleTimeString('pl-PL') }}</div></div>
          <button class="ghost-button !h-10 !w-10 !rounded-xl !px-0 lg:hidden" type="button" title="Ustawienia" @click="emit('openSettings')"><Settings class="h-4 w-4" /></button>
        </div>
      </header>

      <nav class="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 lg:hidden" aria-label="Nawigacja mobilna">
        <button v-for="item in navItems" :key="item.key" class="whitespace-nowrap rounded-lg px-3 py-2 text-xs" :class="activeSection === item.key ? 'bg-cyan-400/10 text-white' : 'text-[var(--text-dim)]'" type="button" @click="activeSection = item.key">{{ item.label }}<span v-if="item.badge" class="ml-1 text-cyan-200">{{ item.badge }}</span></button>
      </nav>

      <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto">
        <div v-if="activeSection === 'overview'" class="space-y-6 p-5 lg:p-6">
          <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button class="summary-card text-left" type="button" @click="openDevices('online')">
              <span class="summary-icon bg-emerald-400/10 text-emerald-200"><Activity class="h-5 w-5" /></span>
              <span><span class="summary-label">Online</span><strong class="summary-value">{{ onlineDevices.length }}</strong><small>z {{ store.devices.length }} komputerów</small></span>
            </button>
            <button class="summary-card text-left" type="button" @click="openDevices('attention')">
              <span class="summary-icon bg-amber-400/10 text-amber-200"><AlertTriangle class="h-5 w-5" /></span>
              <span><span class="summary-label">Wymagają uwagi</span><strong class="summary-value">{{ attentionDevices.length }}</strong><small>{{ pendingDevices.length }} oczekuje na akceptację</small></span>
            </button>
            <button class="summary-card text-left" type="button" @click="activeSection = 'tasks'">
              <span class="summary-icon bg-fuchsia-400/10 text-fuchsia-200"><ClipboardList class="h-5 w-5" /></span>
              <span><span class="summary-label">Otwarte zadania</span><strong class="summary-value">{{ store.openServiceRequests.length }}</strong><small>zgłoszenia klientów</small></span>
            </button>
            <button class="summary-card text-left" type="button" @click="activeSection = 'organizations'">
              <span class="summary-icon bg-cyan-400/10 text-cyan-200"><Building2 class="h-5 w-5" /></span>
              <span><span class="summary-label">Firmy</span><strong class="summary-value">{{ organizations.length }}</strong><small>{{ offlineDevices.length }} komputerów offline</small></span>
            </button>
          </section>

          <section class="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
            <div class="content-card !p-0 overflow-hidden">
              <div class="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div><h2 class="text-sm font-semibold text-white">Firmy w opiece</h2><p class="mt-1 text-xs text-[var(--text-dim)]">Stan wszystkich organizacji</p></div>
                <button class="text-xs text-cyan-200 hover:text-white" type="button" @click="activeSection = 'organizations'">Zobacz wszystkie</button>
              </div>
              <div class="divide-y divide-white/[0.07]">
                <button v-for="organization in organizations.slice(0, 6)" :key="organization.key" class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.025]" type="button" @click="openOrganization(organization)">
                  <span class="flex min-w-0 items-center gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/15 to-fuchsia-500/15 text-cyan-100"><Building2 class="h-5 w-5" /></span><span class="min-w-0"><strong class="block truncate text-sm text-white">{{ organization.name }}</strong><small class="mt-0.5 block text-[var(--text-dim)]">{{ organization.devices.length }} komputerów · {{ organization.users.length }} użytkowników</small></span></span>
                  <span class="flex items-center gap-4 text-xs text-[var(--text-dim)]"><span><strong class="text-emerald-200">{{ organizationOnlineCount(organization) }}</strong> online</span><span v-if="organizationAlertCount(organization)" class="text-amber-200">{{ organizationAlertCount(organization) }} alertów</span><ChevronRight class="h-4 w-4" /></span>
                </button>
                <div v-if="!organizations.length" class="p-8 text-center text-sm text-[var(--text-dim)]">Firmy pojawią się po dodaniu pierwszego klienta.</div>
              </div>
            </div>

            <div class="content-card !p-0 overflow-hidden">
              <div class="border-b border-white/10 px-5 py-4"><h2 class="text-sm font-semibold text-white">Do zrobienia teraz</h2><p class="mt-1 text-xs text-[var(--text-dim)]">Priorytety na podstawie alertów i zgłoszeń</p></div>
              <div class="divide-y divide-white/[0.07]">
                <button v-for="device in attentionDevices.slice(0, 5)" :key="device.deviceId" class="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.025]" type="button" @click="openDevice(device.deviceId, device.ownerUid)">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" /><span class="min-w-0 flex-1"><strong class="block truncate text-sm text-white">{{ formatDeviceLabelForMaster(device) }}</strong><small class="block truncate text-[var(--text-dim)]">{{ companyNameFor(device) }} · {{ alertCount(device) }} alertów</small></span><ChevronRight class="h-4 w-4 text-[var(--muted)]" />
                </button>
                <button v-if="store.openServiceRequests.length" class="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.025]" type="button" @click="activeSection = 'tasks'">
                  <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-fuchsia-400" /><span class="min-w-0 flex-1"><strong class="block text-sm text-white">{{ store.openServiceRequests.length }} otwartych zgłoszeń</strong><small class="text-[var(--text-dim)]">Przejdź do kolejki zadań</small></span><ChevronRight class="h-4 w-4 text-[var(--muted)]" />
                </button>
                <div v-if="!attentionDevices.length && !store.openServiceRequests.length" class="p-8 text-center"><CheckCircle2 class="mx-auto h-7 w-7 text-emerald-300" /><p class="mt-2 text-sm text-white">Wszystko pod kontrolą</p><p class="mt-1 text-xs text-[var(--text-dim)]">Brak aktywnych problemów.</p></div>
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="activeSection === 'organizations'" class="p-5 lg:p-6">
          <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
            <p class="max-w-2xl text-sm leading-6 text-[var(--text-dim)]">Firma porządkuje użytkowników, komputery, wiadomości i zgłoszenia. Nowe firmy utworzysz w ustawieniach.</p>
            <button class="glass-button !rounded-xl" type="button" @click="emit('openSettings')"><Building2 class="mr-2 h-4 w-4" /> Zarządzaj firmami</button>
          </div>
          <div class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <button v-for="organization in organizations" :key="organization.key" class="organization-card text-left" type="button" @click="openOrganization(organization)">
              <div class="flex items-start justify-between gap-3">
                <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/15 to-fuchsia-500/15 text-cyan-100"><Building2 class="h-5 w-5" /></span>
                <span class="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.12em]" :class="organization.devices.length && organizationOnlineCount(organization) === organization.devices.length ? 'border-emerald-400/25 text-emerald-200' : organization.devices.length ? 'border-amber-400/25 text-amber-200' : 'border-white/10 text-[var(--text-dim)]'">{{ !organization.devices.length ? 'bez urządzeń' : `${organizationOnlineCount(organization)}/${organization.devices.length} online` }}</span>
              </div>
              <h2 class="mt-5 truncate text-lg font-semibold text-white">{{ organization.name }}</h2>
              <div class="mt-4 grid grid-cols-3 gap-2">
                <div class="rounded-xl bg-white/[0.035] px-3 py-2"><strong class="block text-lg text-white">{{ organization.devices.length }}</strong><small class="text-[var(--text-dim)]">komputery</small></div>
                <div class="rounded-xl bg-white/[0.035] px-3 py-2"><strong class="block text-lg text-white">{{ organization.users.length }}</strong><small class="text-[var(--text-dim)]">użytkownicy</small></div>
                <div class="rounded-xl bg-white/[0.035] px-3 py-2"><strong class="block text-lg" :class="organizationTasksCount(organization) ? 'text-amber-200' : 'text-white'">{{ organizationTasksCount(organization) }}</strong><small class="text-[var(--text-dim)]">zadania</small></div>
              </div>
              <div class="mt-4 flex items-center justify-between text-xs text-[var(--text-dim)]"><span v-if="organizationAlertCount(organization)" class="text-amber-200">{{ organizationAlertCount(organization) }} aktywnych alertów</span><span v-else>Brak alertów</span><span class="inline-flex items-center gap-1 text-cyan-200">Komputery <ChevronRight class="h-3.5 w-3.5" /></span></div>
            </button>
          </div>
        </div>

        <div v-else-if="activeSection === 'devices'" class="grid min-h-full xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside class="border-b border-white/10 bg-black/10 p-4 xl:border-b-0 xl:border-r">
            <label class="relative block"><Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" /><input v-model="searchQuery" class="soft-input !rounded-xl !py-2.5 !pl-9" placeholder="Nazwa, firma, użytkownik..." /></label>
            <div class="mt-3 grid grid-cols-2 gap-2">
              <select v-model="companyFilter" class="soft-input !rounded-xl !py-2 text-xs"><option value="all">Wszystkie firmy</option><option v-for="organization in organizations" :key="organization.key" :value="organization.name">{{ organization.name }}</option></select>
              <select v-model="statusFilter" class="soft-input !rounded-xl !py-2 text-xs"><option value="all">Każdy status</option><option value="online">Online</option><option value="attention">Wymaga uwagi</option><option value="offline">Offline</option></select>
            </div>
            <div class="mt-3 flex items-center justify-between text-xs text-[var(--text-dim)]"><span>{{ filteredDevices.length }} wyników</span><button v-if="companyFilter !== 'all' || statusFilter !== 'all' || searchQuery" class="text-cyan-200" type="button" @click="companyFilter = 'all'; statusFilter = 'all'; searchQuery = ''">Wyczyść</button></div>
            <div class="scrollbar-glass mt-3 max-h-[calc(100vh-275px)] space-y-1.5 overflow-y-auto pr-1">
              <button v-for="device in filteredDevices" :key="device.deviceId" type="button" class="w-full rounded-xl border px-3 py-3 text-left transition" :class="store.selectedDeviceId === device.deviceId ? 'border-cyan-300/30 bg-cyan-400/10' : 'border-transparent hover:border-white/10 hover:bg-white/[0.03]'" @click="selectDevice(device)">
                <div class="flex items-start gap-3"><span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" :class="isOnline(device) ? needsAttention(device) ? 'bg-amber-400' : 'bg-emerald-400' : 'bg-slate-600'" /><span class="min-w-0 flex-1"><strong class="block truncate text-sm text-white">{{ formatDeviceLabelForMaster(device) }}</strong><small class="mt-0.5 block truncate text-[var(--text-dim)]">{{ companyNameFor(device) }} · {{ device.installationLocation || device.ownerEmail }}</small><span class="mt-2 flex items-center justify-between text-[10px] text-[var(--muted)]"><span>{{ isOnline(device) ? 'online' : `offline · ${formatLastSeen(device.lastSeenAt)}` }}</span><span v-if="alertCount(device)" class="text-amber-200">{{ alertCount(device) }} alertów</span></span></span></div>
              </button>
              <div v-if="!filteredDevices.length" class="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-[var(--text-dim)]">Brak komputerów spełniających filtry.</div>
            </div>
          </aside>
          <section class="min-w-0">
            <DeviceWorkspace v-if="store.selectedDevice" />
            <div v-else class="flex min-h-[500px] items-center justify-center p-8 text-center"><div><Monitor class="mx-auto h-9 w-9 text-[var(--muted)]" /><h2 class="mt-4 text-lg font-semibold text-white">Wybierz komputer</h2><p class="mt-2 text-sm text-[var(--text-dim)]">Szczegóły, akcje i diagnostyka pojawią się tutaj.</p></div></div>
          </section>
        </div>

        <TasksWorkspace v-else-if="activeSection === 'tasks'" @open-device="openDevice" />
        <MessagesWorkspace v-else />
      </div>
    </main>
  </div>
</template>
