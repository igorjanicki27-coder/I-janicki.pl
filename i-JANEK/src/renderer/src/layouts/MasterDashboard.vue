<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Activity, AlertTriangle, ArrowLeft, Building2, CheckCircle2, ChevronRight, ClipboardList, LayoutDashboard, MessageSquare, Monitor, Plus, Search, Settings, Trash2 } from 'lucide-vue-next'
import ComputerTile from '@/components/master/ComputerTile.vue'
import DeviceWorkspace from '@/components/master/DeviceWorkspace.vue'
import MessagesWorkspace from '@/components/master/MessagesWorkspace.vue'
import TasksWorkspace from '@/components/master/TasksWorkspace.vue'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'
import type { DeviceRecord } from '@shared/contracts'

const emit = defineEmits<{ openSettings: [] }>()
const store = useAppStore()
type Section = 'overview' | 'organizations' | 'devices' | 'tasks' | 'messages'

const activeSection = ref<Section>('overview')
const deviceDetailOpen = ref(false)
const detailReturnSection = ref<Section>('devices')
const searchQuery = ref('')
const selectedCompanyKey = ref('all')
const statusFilter = ref<'all' | 'online' | 'attention' | 'offline'>('all')
const companyDraft = ref('')
const companyBusy = ref(false)
const companyMessage = ref('')

interface Organization {
  key: string
  name: string
  devices: DeviceRecord[]
  users: string[]
  removable: boolean
}

const onlineDevices = computed(() => store.devices.filter(isOnline))
const attentionDevices = computed(() => store.devices.filter(needsAttention))
const offlineDevices = computed(() => store.devices.filter((device) => !isOnline(device)))
const pendingDevices = computed(() => store.devices.filter((device) => device.approvalStatus === 'pending'))

const organizations = computed<Organization[]>(() => {
  const result = new Map<string, Organization>()
  for (const device of store.devices) {
    const name = companyNameFor(device)
    const key = normalizeCompanyKey(name)
    const existing = result.get(key)
    if (existing) {
      existing.devices.push(device)
      if (!existing.users.includes(device.ownerEmail)) existing.users.push(device.ownerEmail)
    } else {
      result.set(key, { key, name, devices: [device], users: [device.ownerEmail], removable: name !== 'Bez firmy' })
    }
  }
  for (const companyName of store.masterSettings.companyOptions) {
    const name = companyName.trim()
    if (!name) continue
    const key = normalizeCompanyKey(name)
    const existing = result.get(key)
    if (existing) existing.removable = true
    else result.set(key, { key, name, devices: [], users: [], removable: true })
  }
  return [...result.values()].sort((left, right) => {
    if (left.name === 'Bez firmy') return 1
    if (right.name === 'Bez firmy') return -1
    return left.name.localeCompare(right.name, 'pl')
  })
})

const selectedOrganization = computed(() => organizations.value.find((organization) => organization.key === selectedCompanyKey.value) ?? null)
const pageDevices = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pl')
  return [...store.devices]
    .filter((device) => {
      const matchesCompany = selectedCompanyKey.value === 'all' || normalizeCompanyKey(companyNameFor(device)) === selectedCompanyKey.value
      const matchesStatus = statusFilter.value === 'all'
        || (statusFilter.value === 'online' && isOnline(device))
        || (statusFilter.value === 'offline' && !isOnline(device))
        || (statusFilter.value === 'attention' && needsAttention(device))
      const matchesQuery = !query || [formatDeviceLabelForMaster(device), device.hostname, device.ownerEmail, companyNameFor(device), device.installationLocation]
        .filter(Boolean).join(' ').toLocaleLowerCase('pl').includes(query)
      return matchesCompany && matchesStatus && matchesQuery
    })
    .sort((left, right) => Number(needsAttention(right)) - Number(needsAttention(left)) || Number(isOnline(right)) - Number(isOnline(left)) || formatDeviceLabelForMaster(left).localeCompare(formatDeviceLabelForMaster(right), 'pl'))
})

const pageMeta = computed(() => {
  if (deviceDetailOpen.value && store.selectedDevice) return { title: 'Szczegóły komputera', description: `${companyNameFor(store.selectedDevice)} · ${formatDeviceLabelForMaster(store.selectedDevice)}` }
  if (activeSection.value === 'organizations') return { title: 'Firmy', description: 'Dodawanie, usuwanie i przegląd organizacji' }
  if (activeSection.value === 'devices' && selectedOrganization.value) return { title: selectedOrganization.value.name, description: `${pageDevices.value.length} komputerów w firmie` }
  if (activeSection.value === 'devices') return { title: 'Wszystkie komputery', description: `${pageDevices.value.length} z ${store.devices.length} urządzeń` }
  if (activeSection.value === 'tasks') return { title: 'Zadania', description: `${store.openServiceRequests.length} wymaga obsługi` }
  if (activeSection.value === 'messages') return { title: 'Wiadomości', description: 'Rozmowy z klientami' }
  return { title: 'Przegląd', description: 'Stan całej infrastruktury' }
})

const navItems = computed(() => [
  { key: 'overview' as const, label: 'Przegląd', icon: LayoutDashboard, badge: 0 },
  { key: 'devices' as const, label: 'Komputery', icon: Monitor, badge: store.devices.length },
  { key: 'organizations' as const, label: 'Firmy', icon: Building2, badge: organizations.value.filter((item) => item.name !== 'Bez firmy').length },
  { key: 'tasks' as const, label: 'Zadania', icon: ClipboardList, badge: store.openServiceRequests.length },
  { key: 'messages' as const, label: 'Wiadomości', icon: MessageSquare, badge: 0 }
])

function normalizeCompanyKey(value: string) {
  return value.trim().toLocaleLowerCase('pl')
}
function companyNameFor(device: DeviceRecord) {
  return device.companyName?.trim() || 'Bez firmy'
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

function navigate(section: Section) {
  activeSection.value = section
  deviceDetailOpen.value = false
  if (section === 'devices') selectedCompanyKey.value = 'all'
}
function openOrganization(organization: Organization) {
  selectedCompanyKey.value = organization.key
  searchQuery.value = ''
  statusFilter.value = 'all'
  activeSection.value = 'devices'
  deviceDetailOpen.value = false
}
function openDevices(filter: typeof statusFilter.value = 'all') {
  selectedCompanyKey.value = 'all'
  searchQuery.value = ''
  statusFilter.value = filter
  activeSection.value = 'devices'
  deviceDetailOpen.value = false
}
function openDevice(device: DeviceRecord, returnSection: Section = activeSection.value) {
  store.selectedDeviceId = device.deviceId
  store.selectedConversationOwnerUid = device.ownerUid
  detailReturnSection.value = returnSection
  deviceDetailOpen.value = true
}
function openDeviceById(deviceId: string, ownerUid: string) {
  const device = store.devices.find((entry) => entry.deviceId === deviceId)
  if (!device) return
  store.selectedConversationOwnerUid = ownerUid
  openDevice(device, 'tasks')
}
async function connectToDevice(device: DeviceRecord) {
  store.selectedDeviceId = device.deviceId
  store.selectedConversationOwnerUid = device.ownerUid
  await nextTick()
  await store.requestRustDeskLaunch()
}
function closeDeviceDetails() {
  deviceDetailOpen.value = false
  activeSection.value = detailReturnSection.value
}

async function addCompany() {
  const name = companyDraft.value.trim()
  if (!name || companyBusy.value) return
  companyBusy.value = true
  companyMessage.value = ''
  try {
    const added = await store.addCompanyOption(name)
    companyMessage.value = added ? `Dodano firmę „${name}”.` : 'Taka firma już istnieje.'
    if (added) companyDraft.value = ''
  } finally {
    companyBusy.value = false
  }
}

async function removeCompany(organization: Organization) {
  if (!organization.removable || companyBusy.value) return
  const prompt = organization.devices.length
    ? `Usunąć firmę „${organization.name}”? ${organization.devices.length} komputerów zostanie przeniesionych do grupy „Bez firmy”.`
    : `Usunąć firmę „${organization.name}”?`
  if (!window.confirm(prompt)) return
  companyBusy.value = true
  companyMessage.value = ''
  try {
    for (const device of organization.devices) await store.updateDeviceCompanyName(device.deviceId, '')
    await store.removeCompanyOption(organization.name)
    if (selectedCompanyKey.value === organization.key) selectedCompanyKey.value = 'all'
    companyMessage.value = `Usunięto firmę „${organization.name}”.`
  } finally {
    companyBusy.value = false
  }
}

function openTasks() {
  navigate('tasks')
}
onMounted(() => window.addEventListener('i-janek:open-service-requests', openTasks))
onBeforeUnmount(() => window.removeEventListener('i-janek:open-service-requests', openTasks))
</script>

<template>
  <div class="master-dashboard grid h-full min-h-0 overflow-hidden rounded-[26px] border border-white/10 bg-[#070611]/90 shadow-2xl lg:grid-cols-[248px_minmax(0,1fr)]">
    <aside class="hidden min-h-0 flex-col border-r border-white/10 bg-black/15 p-4 lg:flex">
      <div class="px-2 py-3">
        <div class="display-font text-lg tracking-[0.3em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)]">i-JANEK</div>
        <p class="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">panel administratora</p>
      </div>
      <nav class="mt-5 space-y-1" aria-label="Główna nawigacja">
        <button v-for="item in navItems" :key="item.key" type="button" class="sidebar-link" :class="activeSection === item.key && !deviceDetailOpen ? 'sidebar-link-active' : ''" @click="navigate(item.key)">
          <component :is="item.icon" class="h-[18px] w-[18px] shrink-0" /><span class="flex-1">{{ item.label }}</span>
          <span v-if="item.badge" class="mono min-w-6 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px]" :class="item.key === 'tasks' && item.badge ? 'text-amber-200' : 'text-[var(--text-dim)]'">{{ item.badge }}</span>
        </button>
      </nav>
      <div class="my-4 h-px bg-white/10" />
      <div class="flex items-center justify-between px-2"><span class="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Firmy</span><button class="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-dim)] transition hover:bg-white/5 hover:text-white" type="button" title="Dodaj firmę" @click="navigate('organizations')"><Plus class="h-4 w-4" /></button></div>
      <div class="mt-2 space-y-1">
        <button v-for="organization in organizations" :key="organization.key" class="sidebar-company" :class="activeSection === 'devices' && selectedCompanyKey === organization.key && !deviceDetailOpen ? 'sidebar-company-active' : ''" type="button" @click="openOrganization(organization)">
          <span class="h-2 w-2 shrink-0 rounded-full" :class="organization.devices.length && organizationOnlineCount(organization) ? 'bg-emerald-400' : 'bg-slate-600'" /><span class="min-w-0 flex-1 truncate">{{ organization.name }}</span><span class="mono text-[10px] text-[var(--muted)]">{{ organization.devices.length }}</span>
        </button>
      </div>
      <div class="mt-auto space-y-3 pt-4">
        <div class="rounded-xl border border-white/10 bg-white/[0.025] p-3"><div class="flex items-center gap-2 text-xs text-[var(--text-dim)]"><span class="h-2 w-2 rounded-full" :class="store.offline ? 'bg-amber-400' : 'bg-emerald-400'" />{{ store.offline ? 'Tryb offline' : 'Synchronizacja aktywna' }}</div><div class="mt-2 truncate text-xs text-white/70">{{ store.user?.email }}</div></div>
        <button class="sidebar-link" type="button" @click="emit('openSettings')"><Settings class="h-[18px] w-[18px]" /> Ustawienia</button>
      </div>
    </aside>

    <main class="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 lg:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <button v-if="deviceDetailOpen" class="ghost-button !h-10 !w-10 !shrink-0 !rounded-xl !px-0" type="button" title="Wróć do komputerów" @click="closeDeviceDetails()"><ArrowLeft class="h-4 w-4" /></button>
          <div class="min-w-0"><h1 class="truncate text-xl font-semibold text-white">{{ pageMeta.title }}</h1><p class="mt-1 truncate text-sm text-[var(--text-dim)]">{{ pageMeta.description }}</p></div>
        </div>
        <div class="flex items-center gap-2"><div v-if="store.lastSyncAt" class="hidden text-right text-xs text-[var(--text-dim)] sm:block"><div>Ostatnia synchronizacja</div><div class="mono mt-0.5 text-white/70">{{ new Date(store.lastSyncAt).toLocaleTimeString('pl-PL') }}</div></div><button class="ghost-button !h-10 !w-10 !rounded-xl !px-0 lg:hidden" type="button" title="Ustawienia" @click="emit('openSettings')"><Settings class="h-4 w-4" /></button></div>
      </header>
      <nav v-if="!deviceDetailOpen" class="flex flex-wrap gap-1 border-b border-white/10 px-3 py-2 lg:hidden" aria-label="Nawigacja mobilna"><button v-for="item in navItems" :key="item.key" class="whitespace-nowrap rounded-lg px-3 py-2 text-xs" :class="activeSection === item.key ? 'bg-cyan-400/10 text-white' : 'text-[var(--text-dim)]'" type="button" @click="navigate(item.key)">{{ item.label }}</button></nav>

      <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto">
        <DeviceWorkspace v-if="deviceDetailOpen && store.selectedDevice" />

        <div v-else-if="activeSection === 'overview'" class="space-y-6 p-5 lg:p-6">
          <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button class="summary-card text-left" type="button" @click="openDevices('online')"><span class="summary-icon bg-emerald-400/10 text-emerald-200"><Activity class="h-5 w-5" /></span><span><span class="summary-label">Online</span><strong class="summary-value">{{ onlineDevices.length }}</strong><small>z {{ store.devices.length }} komputerów</small></span></button>
            <button class="summary-card text-left" type="button" @click="openDevices('attention')"><span class="summary-icon bg-amber-400/10 text-amber-200"><AlertTriangle class="h-5 w-5" /></span><span><span class="summary-label">Wymagają uwagi</span><strong class="summary-value">{{ attentionDevices.length }}</strong><small>{{ pendingDevices.length }} oczekuje na akceptację</small></span></button>
            <button class="summary-card text-left" type="button" @click="navigate('tasks')"><span class="summary-icon bg-fuchsia-400/10 text-fuchsia-200"><ClipboardList class="h-5 w-5" /></span><span><span class="summary-label">Otwarte zadania</span><strong class="summary-value">{{ store.openServiceRequests.length }}</strong><small>zgłoszenia klientów</small></span></button>
            <button class="summary-card text-left" type="button" @click="navigate('organizations')"><span class="summary-icon bg-cyan-400/10 text-cyan-200"><Building2 class="h-5 w-5" /></span><span><span class="summary-label">Firmy</span><strong class="summary-value">{{ organizations.length }}</strong><small>{{ offlineDevices.length }} komputerów offline</small></span></button>
          </section>
          <section>
            <div class="mb-4 flex items-end justify-between gap-4"><div><h2 class="text-base font-semibold text-white">Komputery wymagające uwagi</h2><p class="mt-1 text-sm text-[var(--text-dim)]">Kliknij kafelek, aby otworzyć pełne informacje.</p></div><button class="text-xs text-cyan-200 hover:text-white" type="button" @click="openDevices('all')">Wszystkie komputery</button></div>
            <div v-if="attentionDevices.length" class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"><ComputerTile v-for="device in attentionDevices.slice(0, 6)" :key="device.deviceId" :device="device" :alert-count="alertCount(device)" @open="openDevice(device, 'overview')" @connect="connectToDevice(device)" /></div>
            <div v-else class="content-card flex items-center gap-3"><CheckCircle2 class="h-6 w-6 text-emerald-300" /><div><strong class="text-sm text-white">Wszystko pod kontrolą</strong><p class="mt-1 text-xs text-[var(--text-dim)]">Żaden komputer nie wymaga teraz reakcji.</p></div></div>
          </section>
        </div>

        <div v-else-if="activeSection === 'organizations'" class="p-5 lg:p-6">
          <section class="content-card"><h2 class="text-base font-semibold text-white">Dodaj firmę</h2><p class="mt-1 text-sm text-[var(--text-dim)]">Po utworzeniu firma pojawi się w menu po lewej stronie.</p><form class="mt-4 flex max-w-xl gap-2" @submit.prevent="addCompany()"><input v-model="companyDraft" class="soft-input !rounded-xl" maxlength="80" placeholder="np. EL-TECH" /><button class="glass-button !rounded-xl !px-5" type="submit" :disabled="companyBusy || !companyDraft.trim()"><Plus class="mr-2 h-4 w-4" /> Dodaj</button></form><p v-if="companyMessage" class="mt-3 text-sm text-cyan-100">{{ companyMessage }}</p></section>
          <div class="mt-5 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            <article v-for="organization in organizations" :key="organization.key" class="organization-card">
              <div class="flex items-start justify-between gap-3"><button class="flex min-w-0 flex-1 items-center gap-3 text-left" type="button" @click="openOrganization(organization)"><span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400/15 to-fuchsia-500/15 text-cyan-100"><Building2 class="h-5 w-5" /></span><span class="min-w-0"><strong class="block truncate text-base text-white">{{ organization.name }}</strong><small class="mt-1 block text-[var(--text-dim)]">{{ organization.users.length }} użytkowników</small></span></button><button v-if="organization.removable" class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--muted)] transition hover:bg-rose-500/10 hover:text-rose-200" type="button" title="Usuń firmę" :disabled="companyBusy" @click="removeCompany(organization)"><Trash2 class="h-4 w-4" /></button></div>
              <button class="mt-5 grid w-full grid-cols-3 gap-2 text-left" type="button" @click="openOrganization(organization)"><span class="rounded-xl bg-white/[0.035] px-3 py-2"><strong class="block text-lg text-white">{{ organization.devices.length }}</strong><small class="text-[var(--text-dim)]">komputery</small></span><span class="rounded-xl bg-white/[0.035] px-3 py-2"><strong class="block text-lg text-emerald-200">{{ organizationOnlineCount(organization) }}</strong><small class="text-[var(--text-dim)]">online</small></span><span class="rounded-xl bg-white/[0.035] px-3 py-2"><strong class="block text-lg" :class="organizationAlertCount(organization) ? 'text-amber-200' : 'text-white'">{{ organizationAlertCount(organization) }}</strong><small class="text-[var(--text-dim)]">alerty</small></span></button>
              <button class="mt-4 inline-flex items-center gap-1 text-xs text-cyan-200" type="button" @click="openOrganization(organization)">Otwórz firmę <ChevronRight class="h-3.5 w-3.5" /></button>
            </article>
          </div>
        </div>

        <div v-else-if="activeSection === 'devices'" class="p-5 lg:p-6">
          <div class="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div class="flex flex-wrap gap-2"><button v-for="option in [{ key: 'all', label: 'Wszystkie' }, { key: 'online', label: 'Online' }, { key: 'attention', label: 'Wymagają uwagi' }, { key: 'offline', label: 'Offline' }]" :key="option.key" class="rounded-xl border px-3 py-2 text-sm transition" :class="statusFilter === option.key ? 'border-cyan-300/30 bg-cyan-400/10 text-white' : 'border-white/10 text-[var(--text-dim)] hover:text-white'" type="button" @click="statusFilter = option.key as typeof statusFilter">{{ option.label }}</button></div><label class="relative block w-full xl:max-w-sm"><Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" /><input v-model="searchQuery" class="soft-input !rounded-xl !py-2.5 !pl-9" placeholder="Szukaj komputera..." /></label></div>
          <div v-if="pageDevices.length" class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"><ComputerTile v-for="device in pageDevices" :key="device.deviceId" :device="device" :alert-count="alertCount(device)" @open="openDevice(device, 'devices')" @connect="connectToDevice(device)" /></div>
          <div v-else class="rounded-2xl border border-dashed border-white/10 p-12 text-center"><Monitor class="mx-auto h-8 w-8 text-[var(--muted)]" /><h2 class="mt-4 text-base font-semibold text-white">Brak komputerów</h2><p class="mt-2 text-sm text-[var(--text-dim)]">Ta firma nie ma jeszcze urządzeń albo żaden komputer nie pasuje do filtra.</p></div>
        </div>

        <TasksWorkspace v-else-if="activeSection === 'tasks'" @open-device="openDeviceById" />
        <MessagesWorkspace v-else />
      </div>
    </main>
  </div>
</template>
