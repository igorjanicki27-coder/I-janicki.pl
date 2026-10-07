<script setup lang="ts">
import { computed, ref } from 'vue'
import { Activity, AlertTriangle, ArrowLeft, CheckCircle2, LayoutDashboard, MessageSquare, Monitor, MonitorUp, Search, Settings } from 'lucide-vue-next'
import ComputerTile from '@/components/master/ComputerTile.vue'
import DeviceWorkspace from '@/components/master/DeviceWorkspace.vue'
import MessagesWorkspace from '@/components/master/MessagesWorkspace.vue'
import DwServicePocPanel from '@/components/master/DwServicePocPanel.vue'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { isDeviceOnline } from '@/services/device-presence'
import { useAppStore } from '@/stores/app'
import type { DeviceRecord } from '@shared/contracts'

const emit = defineEmits<{ openSettings: [] }>()
const store = useAppStore()
type Section = 'overview' | 'devices' | 'messages' | 'agents'

const activeSection = ref<Section>('overview')
const deviceDetailOpen = ref(false)
const detailReturnSection = ref<Section>('devices')
const searchQuery = ref('')

const approvedDevices = computed(() => store.devices.filter((device) => device.approvalStatus === 'approved'))
const onlineDevices = computed(() => approvedDevices.value.filter(isOnline))
const attentionDevices = computed(() => approvedDevices.value.filter(needsAttention))
const offlineDevices = computed(() => approvedDevices.value.filter((device) => !isOnline(device)))
const pendingDevices = computed(() => store.approvalQueue)

const pageDevices = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('pl')
  return [...approvedDevices.value]
    .filter((device) => {
      return !query || [formatDeviceLabelForMaster(device), device.hostname, device.ownerEmail, companyNameFor(device), device.installationLocation]
        .filter(Boolean).join(' ').toLocaleLowerCase('pl').includes(query)
    })
    .sort((left, right) => deviceSortRank(left) - deviceSortRank(right) || formatDeviceLabelForMaster(left).localeCompare(formatDeviceLabelForMaster(right), 'pl'))
})

const pageMeta = computed(() => {
  if (deviceDetailOpen.value && store.selectedDevice) return { title: 'Szczegóły komputera', description: `${companyNameFor(store.selectedDevice)} · ${formatDeviceLabelForMaster(store.selectedDevice)}` }
  if (activeSection.value === 'devices') return { title: 'Wszystkie komputery', description: `${pageDevices.value.length} z ${approvedDevices.value.length} urządzeń` }
  if (activeSection.value === 'messages') return { title: 'Wiadomości', description: 'Rozmowy z klientami' }
  if (activeSection.value === 'agents') return { title: 'Agenci', description: 'Panel zdalnego dostępu DWService' }
  return { title: 'Przegląd', description: 'Stan całej infrastruktury' }
})

const navItems = computed(() => [
  { key: 'overview' as const, label: 'Przegląd', icon: LayoutDashboard, badge: 0, showZero: false },
  ...(store.systemContext?.platform !== 'web'
    ? [{ key: 'agents' as const, label: 'Agenci', icon: MonitorUp, badge: 0, showZero: false }]
    : []),
  { key: 'devices' as const, label: 'Komputery', icon: Monitor, badge: approvedDevices.value.length, showZero: false },
  { key: 'messages' as const, label: 'Wiadomości', icon: MessageSquare, badge: store.unreadCompanyChatCount, showZero: false }
])

function companyNameFor(device: DeviceRecord) {
  return device.companyName?.trim() || 'Bez firmy'
}
function isOnline(device: DeviceRecord) {
  return isDeviceOnline(device, store.statusNow)
}
function alertCount(device: DeviceRecord) {
  return store.alerts.filter((alert) => alert.deviceId === device.deviceId && alert.severity !== 'info').length
}
function needsAttention(device: DeviceRecord) {
  return device.approvalStatus === 'approved' && (device.telemetry?.state === 'alert' || device.telemetry?.state === 'warning' || alertCount(device) > 0)
}
function deviceSortRank(device: DeviceRecord) {
  if (isOnline(device) && needsAttention(device)) return 0
  if (isOnline(device)) return 1
  if (needsAttention(device)) return 2
  return 3
}
function navigate(section: Section) {
  activeSection.value = section
  deviceDetailOpen.value = false
}
function openDevices() {
  searchQuery.value = ''
  activeSection.value = 'devices'
  deviceDetailOpen.value = false
}
function openDevice(device: DeviceRecord, returnSection: Section = activeSection.value) {
  store.selectedDeviceId = device.deviceId
  store.selectedConversationOwnerUid = device.ownerUid
  detailReturnSection.value = returnSection
  deviceDetailOpen.value = true
}
function closeDeviceDetails() {
  deviceDetailOpen.value = false
  activeSection.value = detailReturnSection.value
}

function handleDeviceArchived() {
  deviceDetailOpen.value = false
  activeSection.value = 'devices'
}

</script>

<template>
  <div class="master-dashboard grid h-full min-h-0 overflow-hidden rounded-[26px] border border-white/10 bg-[#070611]/90 shadow-2xl lg:grid-cols-[248px_minmax(0,1fr)]">
    <aside class="hidden min-h-0 flex-col border-r border-white/10 bg-black/15 p-4 lg:flex">
      <div class="px-2 py-3">
        <div class="display-font text-lg tracking-[0.3em] text-transparent bg-clip-text bg-[linear-gradient(135deg,#baeaff,#7f40ff_50%,#ff00d4)]">i-JANEK</div>
        <p class="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">panel administratora</p>
      </div>
      <nav class="mt-5 space-y-1" aria-label="Główna nawigacja">
        <template v-for="item in navItems" :key="item.key">
          <button type="button" class="sidebar-link" :class="activeSection === item.key && !deviceDetailOpen ? 'sidebar-link-active' : ''" @click="navigate(item.key)">
            <component :is="item.icon" class="h-[18px] w-[18px] shrink-0" /><span class="flex-1">{{ item.label }}</span>
            <template v-if="item.key === 'messages' && item.badge">
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.65)]" aria-hidden="true" />
              <span class="sr-only">{{ item.badge }} nieodczytanych wiadomości</span>
            </template>
            <span v-else-if="item.badge || item.showZero" class="mono min-w-6 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px] text-[var(--text-dim)]">{{ item.badge }}</span>
          </button>
        </template>
      </nav>
      <div class="mt-auto space-y-3 pt-4">
        <button class="sidebar-link relative" type="button" @click="emit('openSettings')"><Settings class="h-[18px] w-[18px]" /> Ustawienia<span v-if="pendingDevices.length" class="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.65)]" aria-hidden="true" /><span v-if="pendingDevices.length" class="sr-only">Oczekujące rejestracje urządzeń</span></button>
      </div>
    </aside>

    <main class="flex min-h-0 min-w-0 flex-col overflow-hidden">
      <header class="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 px-5 py-4 lg:px-6">
        <div class="flex min-w-0 items-center gap-3">
          <button v-if="deviceDetailOpen" class="ghost-button !h-10 !w-10 !shrink-0 !rounded-xl !px-0" type="button" title="Wróć do komputerów" @click="closeDeviceDetails()"><ArrowLeft class="h-4 w-4" /></button>
          <div class="min-w-0"><h1 class="truncate text-xl font-semibold text-white">{{ pageMeta.title }}</h1><p class="mt-1 truncate text-sm text-[var(--text-dim)]">{{ pageMeta.description }}</p></div>
        </div>
        <div class="flex items-center gap-2"><div v-if="store.lastSyncAt" class="hidden text-right text-xs text-[var(--text-dim)] sm:block"><div>Ostatnia synchronizacja</div><div class="mono mt-0.5 text-white/70">{{ new Date(store.lastSyncAt).toLocaleTimeString('pl-PL') }}</div></div><button class="ghost-button relative !h-10 !w-10 !rounded-xl !px-0 lg:hidden" type="button" title="Ustawienia" @click="emit('openSettings')"><Settings class="h-4 w-4" /><span v-if="pendingDevices.length" class="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.65)]" aria-hidden="true" /><span v-if="pendingDevices.length" class="sr-only">Oczekujące rejestracje urządzeń</span></button></div>
      </header>
      <nav v-if="!deviceDetailOpen" class="flex flex-wrap items-center gap-1 border-b border-white/10 px-3 py-2 lg:hidden" aria-label="Nawigacja mobilna"><template v-for="item in navItems" :key="item.key"><button class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs" :class="activeSection === item.key ? 'bg-cyan-400/10 text-white' : 'text-[var(--text-dim)]'" type="button" @click="navigate(item.key)">{{ item.label }}<template v-if="item.key === 'messages' && item.badge"><span class="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /><span class="sr-only">{{ item.badge }} nieodczytanych wiadomości</span></template><span v-else-if="item.badge || item.showZero" class="mono rounded bg-white/[0.07] px-1.5 py-0.5 text-[9px]">{{ item.badge }}</span></button></template></nav>

      <div class="scrollbar-glass min-h-0 flex-1" :class="activeSection === 'agents' && !deviceDetailOpen ? 'overflow-hidden' : 'overflow-y-auto'">
        <DeviceWorkspace v-if="deviceDetailOpen && store.selectedDevice" @archived="handleDeviceArchived" />

        <div v-else-if="activeSection === 'overview'" class="space-y-6 p-5 lg:p-6">
          <section class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <button class="summary-card text-left" type="button" @click="openDevices()"><span class="summary-icon bg-emerald-400/10 text-emerald-200"><Activity class="h-5 w-5" /></span><span><span class="summary-label">Online</span><strong class="summary-value">{{ onlineDevices.length }}</strong><small>z {{ approvedDevices.length }} komputerów</small></span></button>
            <button class="summary-card text-left" type="button" @click="openDevices()"><span class="summary-icon bg-amber-400/10 text-amber-200"><AlertTriangle class="h-5 w-5" /></span><span><span class="summary-label">Wymagają uwagi</span><strong class="summary-value">{{ attentionDevices.length }}</strong><small>alerty zatwierdzonych komputerów</small></span></button>
            <article class="summary-card"><span class="summary-icon bg-cyan-400/10 text-cyan-200"><Monitor class="h-5 w-5" /></span><span><span class="summary-label">Offline</span><strong class="summary-value">{{ offlineDevices.length }}</strong><small>komputery bez połączenia</small></span></article>
          </section>
          <section>
            <div class="mb-4 flex items-end justify-between gap-4"><div><h2 class="text-base font-semibold text-white">Komputery wymagające uwagi</h2><p class="mt-1 text-sm text-[var(--text-dim)]">Kliknij kafelek, aby otworzyć pełne informacje.</p></div><button class="text-xs text-cyan-200 hover:text-white" type="button" @click="openDevices()">Wszystkie komputery</button></div>
            <div v-if="attentionDevices.length" class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"><ComputerTile v-for="device in attentionDevices.slice(0, 6)" :key="device.deviceId" :device="device" :alert-count="alertCount(device)" :thresholds="store.masterSettings.thresholds" :now="store.statusNow" @open="openDevice(device, 'overview')" /></div>
            <div v-else class="content-card flex items-center gap-3"><CheckCircle2 class="h-6 w-6 text-emerald-300" /><div><strong class="text-sm text-white">Wszystko pod kontrolą</strong><p class="mt-1 text-xs text-[var(--text-dim)]">Żaden zatwierdzony komputer nie wymaga teraz reakcji.</p></div></div>
          </section>
        </div>

        <div v-else-if="activeSection === 'devices'" class="p-5 lg:p-6">
          <div class="mb-5 flex justify-end"><label class="relative block w-full xl:max-w-sm"><Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" /><input v-model="searchQuery" class="soft-input !rounded-xl !py-2.5 !pl-9" placeholder="Szukaj komputera..." /></label></div>
          <div v-if="pageDevices.length" class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"><ComputerTile v-for="device in pageDevices" :key="device.deviceId" :device="device" :alert-count="alertCount(device)" :thresholds="store.masterSettings.thresholds" :now="store.statusNow" @open="openDevice(device, 'devices')" /></div>
          <div v-else class="rounded-2xl border border-dashed border-white/10 p-12 text-center"><Monitor class="mx-auto h-8 w-8 text-[var(--muted)]" /><h2 class="mt-4 text-base font-semibold text-white">Brak komputerów</h2><p class="mt-2 text-sm text-[var(--text-dim)]">Ta firma nie ma jeszcze urządzeń albo żaden komputer nie pasuje do filtra.</p></div>
        </div>

        <DwServicePocPanel v-else-if="activeSection === 'agents'" />
        <MessagesWorkspace v-else />
      </div>
    </main>
  </div>
</template>
