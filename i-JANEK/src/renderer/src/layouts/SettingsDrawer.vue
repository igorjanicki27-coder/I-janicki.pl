<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, LogOut, Send, Trash2, X } from 'lucide-vue-next'
import AppFooterLink from '@/components/AppFooterLink.vue'
import StatusPill from '@/components/StatusPill.vue'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()

const aesDraft = ref('')
const companyDraft = ref('')
const checkingUpdates = ref(false)
const pickingFolder = ref(false)
const refreshingRustDesk = ref(false)
const rotatingRustDeskPassword = ref(false)
const removingBackupFolderPath = ref<string | null>(null)
const removingBackupFolderBusy = ref(false)

const backupFolderPathMap: Record<'Desktop' | 'Documents', string> = {
  Desktop: '%USERPROFILE%\\Desktop',
  Documents: '%USERPROFILE%\\Documents'
}

const syncStateLabel = computed(() => {
  return store.syncState === 'offline' ? 'offline' : 'connected'
})

const pendingDevices = computed(() => store.devices.filter((entry) => entry.approvalStatus === 'pending'))

const slaveDevice = computed(() => {
  if (!store.user) return null
  if (store.user.role === 'slave' && store.systemContext) {
    return store.devices.find((entry) => entry.deviceId === store.systemContext?.deviceId) ?? store.selectedDevice
  }
  return store.selectedDevice
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    aesDraft.value = store.masterSettings.aesKey
    if (!store.pendingDeviceAlias) {
      store.pendingDeviceAlias = slaveDevice.value?.deviceAlias ?? slaveDevice.value?.hostname ?? ''
    }
    if (!store.pendingCompanyName) {
      store.pendingCompanyName = slaveDevice.value?.companyName?.trim() || store.masterSettings.companyOptions[0] || ''
    }
    if (store.user?.role === 'slave') {
      void refreshRustDeskState()
    }
  },
  { immediate: true }
)

function toggleFolder(name: 'Desktop' | 'Documents') {
  const selected = new Set(store.slaveSettings.backupFolders)
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
  store.updateSlaveSettings({ backupFolders: Array.from(selected) as Array<'Desktop' | 'Documents'> })
}

function removeBackupFolderEntry(path: string) {
  removingBackupFolderPath.value = path
}

const backupFolderEntries = computed(() => {
  const selectedSystemFolders = store.slaveSettings.backupFolders.map((folderName) => ({
    key: `system:${folderName}`,
    name: folderName,
    path: backupFolderPathMap[folderName]
  }))
  const customFolders = store.slaveSettings.customBackupFolders.map((folderPath) => ({
    key: `custom:${folderPath}`,
    name: folderPath.split(/[/\\]/).filter(Boolean).pop() ?? folderPath,
    path: folderPath
  }))
  return [...selectedSystemFolders, ...customFolders]
})

async function forceBackupWithSave() {
  await store.applySlaveBackupSettings()
  await store.syncBackupNow()
}

function closeRemoveBackupFolderModal() {
  if (removingBackupFolderBusy.value) return
  removingBackupFolderPath.value = null
}

async function confirmRemoveBackupFolder() {
  if (!removingBackupFolderPath.value || removingBackupFolderBusy.value) return
  removingBackupFolderBusy.value = true
  try {
    await store.removeBackupFolder(removingBackupFolderPath.value)
    removingBackupFolderPath.value = null
  } finally {
    removingBackupFolderBusy.value = false
  }
}

async function saveMasterAes() {
  const next = aesDraft.value.trim()
  if (!next || next === store.masterSettings.aesKey) return
  const accepted = window.confirm(
    'Nowy klucz zostanie zapisany, a poprzedni pozostanie jako zapasowy klucz do odczytu starszych danych. Kontynuować?'
  )
  if (!accepted) return
  await store.updateMasterAesKey(next)
}

async function addCompanyOption() {
  const next = companyDraft.value.trim()
  if (!next) return
  const added = await store.addCompanyOption(next)
  if (added) {
    store.selectedConversationOwnerUid = `virtual:${next}`
    companyDraft.value = ''
  }
}

async function checkForUpdatesNow() {
  if (checkingUpdates.value) return
  checkingUpdates.value = true
  try {
    const result = await window.janek.system.checkForUpdates(store.slaveSettings.silentUpdates)
    window.alert(result.message)
  } catch (error) {
    window.alert(`Nie udało się sprawdzić aktualizacji: ${String(error)}`)
  } finally {
    checkingUpdates.value = false
  }
}

async function addCustomFolderFromPicker() {
  if (pickingFolder.value) return
  pickingFolder.value = true
  try {
    const selectedPath = await window.janek.system.selectFolder()
    const nextPath = selectedPath?.trim()
    if (!nextPath) return
    if (store.slaveSettings.customBackupFolders.includes(nextPath)) return
    store.updateSlaveSettings({
      customBackupFolders: [...store.slaveSettings.customBackupFolders, nextPath]
    })
  } finally {
    pickingFolder.value = false
  }
}

async function refreshRustDeskState() {
  if (refreshingRustDesk.value) return
  refreshingRustDesk.value = true
  try {
    await store.refreshRustDeskState()
  } finally {
    refreshingRustDesk.value = false
  }
}

async function rotateRustDeskPassword() {
  if (rotatingRustDeskPassword.value) return
  rotatingRustDeskPassword.value = true
  try {
    await store.rotateRustDeskPasswordManually()
  } finally {
    rotatingRustDeskPassword.value = false
  }
}

function formatRotationDate(timestamp?: number) {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString('pl-PL')
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex">
    <button class="h-full flex-1 bg-black/55 backdrop-blur-[1px]" type="button" @click="emit('close')" />
    <aside class="glass-panel flex h-full w-full max-w-[560px] flex-col border-l border-white/10 p-5">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="display-font text-lg tracking-[0.2em] text-white">USTAWIENIA</h2>
        <div class="flex items-center gap-2">
          <button class="ghost-button !h-10 !w-10 !rounded-xl !px-0 !py-0" type="button" title="Wyloguj" @click="store.signOut()">
            <LogOut class="h-4 w-4" />
          </button>
          <button class="ghost-button !h-10 !w-10 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto pr-1">
        <template v-if="store.isMaster">
          <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Zarzadzanie kontem</div>
            <div class="mt-3 space-y-2 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between">
                <span>Email</span>
                <span class="mono text-white">{{ store.user?.email }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Status sesji</span>
                <StatusPill :label="store.sessionStatus" />
              </div>
              <div class="flex items-center justify-between">
                <span>Sync Firebase</span>
                <StatusPill :label="syncStateLabel" />
              </div>
              <div class="flex items-center justify-between">
                <span>Ostatnia synchronizacja</span>
                <span class="mono text-white">{{ store.lastSyncAt ? new Date(store.lastSyncAt).toLocaleTimeString('pl-PL') : '—' }}</span>
              </div>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Progi dashboardu</div>
            <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">
              Wartości od tych progów zmieniają kafelki na pomarańczowe i czerwone.
            </p>
            <div class="mt-3 grid grid-cols-[1.1fr_110px_110px] items-center gap-3 px-3 text-[11px] uppercase tracking-[0.15em]">
              <span class="text-[var(--text-dim)]">Metryka</span>
              <span class="text-amber-300">Warning</span>
              <span class="text-rose-300">Critical</span>
            </div>
            <div class="mt-4 space-y-3">
              <div class="grid grid-cols-[1.1fr_110px_110px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                <span>CPU użycie (%)</span>
                <input class="soft-input !py-2 !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.cpuUsage.warning" @input="store.updateMetricThreshold('cpuUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
                <input class="soft-input !py-2 !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.cpuUsage.critical" @input="store.updateMetricThreshold('cpuUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
              </div>
              <div class="grid grid-cols-[1.1fr_110px_110px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                <span>GPU użycie (%)</span>
                <input class="soft-input !py-2 !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.gpuUsage.warning" @input="store.updateMetricThreshold('gpuUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
                <input class="soft-input !py-2 !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.gpuUsage.critical" @input="store.updateMetricThreshold('gpuUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
              </div>
              <div class="grid grid-cols-[1.1fr_110px_110px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                <span>RAM (%)</span>
                <input class="soft-input !py-2 !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.ramUsage.warning" @input="store.updateMetricThreshold('ramUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
                <input class="soft-input !py-2 !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.ramUsage.critical" @input="store.updateMetricThreshold('ramUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
              </div>
              <div class="grid grid-cols-[1.1fr_110px_110px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                <span>Dysk (%)</span>
                <input class="soft-input !py-2 !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.diskUsage.warning" @input="store.updateMetricThreshold('diskUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
                <input class="soft-input !py-2 !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.diskUsage.critical" @input="store.updateMetricThreshold('diskUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
              </div>
              <div class="grid grid-cols-[1.1fr_110px_110px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                <span>CPU temperatura (°C)</span>
                <input class="soft-input !py-2 !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.cpuTemp.warning" @input="store.updateMetricThreshold('cpuTemp', 'warning', Number(($event.target as HTMLInputElement).value))" />
                <input class="soft-input !py-2 !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.cpuTemp.critical" @input="store.updateMetricThreshold('cpuTemp', 'critical', Number(($event.target as HTMLInputElement).value))" />
              </div>
              <div class="grid grid-cols-[1.1fr_110px_110px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                <span>GPU temperatura (°C)</span>
                <input class="soft-input !py-2 !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.gpuTemp.warning" @input="store.updateMetricThreshold('gpuTemp', 'warning', Number(($event.target as HTMLInputElement).value))" />
                <input class="soft-input !py-2 !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.gpuTemp.critical" @input="store.updateMetricThreshold('gpuTemp', 'critical', Number(($event.target as HTMLInputElement).value))" />
              </div>
              <div class="grid grid-cols-[1.1fr_110px_110px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                <span>Backup wiek (h)</span>
                <input class="soft-input !py-2 !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.backupAgeHours.warning" @input="store.updateMetricThreshold('backupAgeHours', 'warning', Number(($event.target as HTMLInputElement).value))" />
                <input class="soft-input !py-2 !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.backupAgeHours.critical" @input="store.updateMetricThreshold('backupAgeHours', 'critical', Number(($event.target as HTMLInputElement).value))" />
              </div>

              <label class="block text-sm text-[var(--text-dim)]">
                <span class="mb-2 block">Czestotliwosc telemetrii</span>
                <div class="relative">
                  <select
                    class="soft-input !py-2 !pr-10 appearance-none"
                    :value="store.masterSettings.telemetryMode"
                    @change="store.updateMasterSettings({ telemetryMode: ($event.target as HTMLSelectElement).value as 'standard' | 'aggressive' })"
                  >
                    <option value="standard">Standard (1h)</option>
                    <option value="aggressive">Agresywny (10 min)</option>
                  </select>
                  <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
                </div>
              </label>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Bezpieczenstwo</div>
            <div class="mt-4 space-y-4">
              <label class="block text-sm text-[var(--text-dim)]">
                <span class="mb-2 block">Klucz Master AES</span>
                <div class="flex gap-2">
                  <input v-model="aesDraft" class="soft-input" type="text" />
                  <button class="glass-button !px-4" type="button" @click="saveMasterAes">Zapisz</button>
                </div>
                <p class="mt-2 text-xs text-amber-200/90">
                  Zmiana klucza zachowuje poprzedni klucz w historii, więc starsze zaszyfrowane dane nadal pozostają odczytywalne.
                </p>
              </label>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Firmy dla slave</div>
            <p class="mt-2 text-sm text-[var(--text-dim)]">
              Lista jest synchronizowana live. Slave wybiera firmę przy pierwszej akceptacji regulaminu.
            </p>
            <div class="mt-3 flex gap-2">
              <input
                v-model="companyDraft"
                class="soft-input !py-2"
                placeholder="Dodaj nową firmę"
                @keyup.enter="addCompanyOption()"
              />
              <button class="glass-button !px-4 !py-2" type="button" @click="addCompanyOption()">Dodaj</button>
            </div>
            <div class="mt-3 space-y-2">
              <div
                v-for="company in store.masterSettings.companyOptions"
                :key="company"
                class="flex items-center justify-between rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]"
              >
                <span class="truncate text-white">{{ company }}</span>
                <button class="ghost-button !rounded-lg !px-2 !py-1 !text-xs" type="button" @click="store.removeCompanyOption(company)">
                  Usuń
                </button>
              </div>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Zarzadzanie klientami</div>
            <div class="mt-3 space-y-2">
              <div
                v-for="device in pendingDevices"
                :key="device.deviceId"
                class="rounded-2xl border border-white/10 px-3 py-3 text-sm"
              >
                <div class="font-medium text-white">{{ formatDeviceLabelForMaster(device) }}</div>
                <div class="mono mt-1 text-[11px] text-[var(--text-dim)]">{{ device.hostname }}</div>
                <div class="mono mt-1 text-[11px] text-[var(--text-dim)]">{{ device.ownerEmail }}</div>
                <div class="mt-3 flex gap-2">
                  <button class="glass-button !px-3 !py-2 !text-xs" type="button" @click="store.approveDevice(device.deviceId, 'approved')">
                    Zatwierdz
                  </button>
                  <button class="ghost-button !rounded-xl !px-3 !py-2 !text-xs" type="button" @click="store.approveDevice(device.deviceId, 'rejected')">
                    Odrzuc
                  </button>
                </div>
              </div>
              <div v-if="!pendingDevices.length" class="rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                Brak urzadzen oczekujacych.
              </div>
            </div>
            <button class="glass-button mt-4 w-full justify-center" type="button" @click="store.forceUpdateAllClients()">
              Wymus aktualizacje u wszystkich
            </button>
          </section>

        </template>

        <template v-else>
          <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Użytkownik</div>
            <div class="mt-3 space-y-2 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between">
                <span>Email</span>
                <span class="mono text-white">{{ store.user?.email ?? '—' }}</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="shrink-0">Firma</span>
                <div class="flex min-w-0 flex-1 gap-2">
                  <select v-model="store.pendingCompanyName" class="soft-input min-w-0 !py-2">
                    <option v-for="company in store.masterSettings.companyOptions" :key="company" :value="company">{{ company }}</option>
                  </select>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="shrink-0">Nazwa urzadzenia</span>
                <div class="flex min-w-0 flex-1 gap-2">
                  <input
                    v-model="store.pendingDeviceAlias"
                    class="soft-input min-w-0 !py-2"
                    placeholder="np. Biuro PC / Laptop Dom"
                  />
                  <button class="glass-button !px-4 !py-2" type="button" @click="store.saveDeviceAlias()">Zapisz</button>
                </div>
              </div>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="flex items-center justify-between">
              <div class="text-sm font-semibold text-white">RustDesk</div>
              <button class="ghost-button !rounded-xl !px-3 !py-2 text-xs" type="button" :disabled="refreshingRustDesk" @click="refreshRustDeskState()">
                {{ refreshingRustDesk ? 'Odświeżanie...' : 'Odśwież' }}
              </button>
            </div>
            <div class="mt-3 space-y-2 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between">
                <span>Status</span>
                <span class="mono text-white">{{ store.currentRustDeskState?.installed ? 'gotowy' : 'brak' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Aktualne hasło</span>
                <span class="mono text-white">{{ store.currentRustDeskState?.accessCode ?? '—' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Ostatnia rotacja</span>
                <span class="mono text-white">{{ formatRotationDate(store.currentRustDeskState?.passwordLastRotatedAt) }}</span>
              </div>
            </div>
            <button
              class="glass-button mt-3 w-full justify-center"
              type="button"
              :disabled="rotatingRustDeskPassword"
              @click="rotateRustDeskPassword()"
            >
              {{ rotatingRustDeskPassword ? 'Obracanie hasła...' : 'Obróć hasło teraz' }}
            </button>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold text-white">Backup</div>
              <button class="glass-button !px-4 !py-2" type="button" :disabled="pickingFolder" @click="addCustomFolderFromPicker()">
                {{ pickingFolder ? 'Dodawanie...' : 'Dodaj folder' }}
              </button>
            </div>
            <div class="mt-4 space-y-3">
              <div class="flex flex-wrap items-center gap-4">
                <label class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                  <input :checked="store.slaveSettings.backupFolders.includes('Desktop')" type="checkbox" @change="toggleFolder('Desktop')" />
                  Pulpit
                </label>
                <label class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                  <input :checked="store.slaveSettings.backupFolders.includes('Documents')" type="checkbox" @change="toggleFolder('Documents')" />
                  Dokumenty
                </label>
              </div>

              <div class="space-y-2">
                <div
                  v-for="folder in backupFolderEntries"
                  :key="folder.key"
                  class="flex items-center justify-between rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]"
                >
                  <div class="min-w-0">
                    <div class="truncate text-white">{{ folder.name }}</div>
                    <div class="mono truncate text-[11px] text-[var(--text-dim)]">{{ folder.path }}</div>
                  </div>
                  <button
                    class="ghost-button !h-8 !w-8 !rounded-lg !px-0 !py-0"
                    type="button"
                    @click="removeBackupFolderEntry(folder.path)"
                  >
                    <Trash2 class="h-4 w-4" />
                  </button>
                </div>
                <div v-if="!backupFolderEntries.length" class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]">
                  Brak folderow wybranych do backupu.
                </div>
              </div>

              <div class="grid gap-2 md:grid-cols-2">
                <label class="text-sm text-[var(--text-dim)]">
                  Max plik (MB)
                  <input
                    class="soft-input mt-1 !py-2"
                    type="number"
                    min="10"
                    :value="store.slaveSettings.maxFileSizeMb"
                    @input="store.updateSlaveSettings({ maxFileSizeMb: Number(($event.target as HTMLInputElement).value) || 100 })"
                  />
                </label>
                <label class="text-sm text-[var(--text-dim)]">
                  Miejsce na backup (GB)
                  <input
                    class="soft-input mt-1 !py-2"
                    type="number"
                    min="1"
                    :value="store.slaveSettings.maxQuotaGb"
                    @input="store.updateSlaveSettings({ maxQuotaGb: Number(($event.target as HTMLInputElement).value) || 10 })"
                  />
                </label>
              </div>
            </div>
            <div class="mt-2 flex gap-2">
              <button class="ghost-button flex-1 justify-center !rounded-2xl !px-4 !py-3 text-sm" type="button" @click="store.previewBackupFiles()">
                Przegladnij pliki
              </button>
              <button class="ghost-button flex-1 justify-center !rounded-2xl !px-4 !py-3 text-sm" type="button" @click="store.restoreBackupNow()">
                Przywroc backup
              </button>
              <button class="glass-button flex-1 justify-center !rounded-2xl !px-4 !py-3 text-sm" type="button" @click="forceBackupWithSave()">
                Wymus backup
              </button>
            </div>
          </section>

          <div class="mt-4 grid gap-4 md:grid-cols-2">
            <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="text-sm font-semibold text-white">Powiadomienia</div>
              <div class="mt-3 space-y-3 text-sm text-[var(--text-dim)]">
                <label class="flex items-center justify-between">
                  <span>Nie pokazuj alertów</span>
                  <input
                    :checked="store.slaveSettings.hideAlertNotifications"
                    type="checkbox"
                    @change="store.updateSlaveSettings({ hideAlertNotifications: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
                <label class="flex items-center justify-between">
                  <span>Wyciszenie wiadomości</span>
                  <input
                    :checked="store.slaveSettings.muteChatSounds"
                    type="checkbox"
                    @change="store.updateSlaveSettings({ muteChatSounds: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
                <label class="flex items-center justify-between">
                  <span>Wyciszenie alertów zużycia</span>
                  <input
                    :checked="store.slaveSettings.muteUsageNotifications"
                    type="checkbox"
                    @change="store.updateSlaveSettings({ muteUsageNotifications: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
                <label class="flex items-center justify-between">
                  <span>Wyciszenie alertów temperatury</span>
                  <input
                    :checked="store.slaveSettings.muteTempNotifications"
                    type="checkbox"
                    @change="store.updateSlaveSettings({ muteTempNotifications: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
            </section>

            <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="text-sm font-semibold text-white">Systemowe</div>
              <div class="mt-3 space-y-3 text-sm text-[var(--text-dim)]">
                <label class="flex items-center justify-between">
                  <span>Autostart</span>
                  <input :checked="store.slaveSettings.autostart" type="checkbox" @change="store.toggleAutostart(($event.target as HTMLInputElement).checked)" />
                </label>
                <label class="flex items-center justify-between">
                  <span>Ciche aktualizacje</span>
                  <input
                    :checked="store.slaveSettings.silentUpdates"
                    type="checkbox"
                    @change="store.updateSlaveSettings({ silentUpdates: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
              <button
                class="ghost-button mt-4 w-full justify-center !rounded-2xl !px-4 !py-3 text-sm"
                type="button"
                @click="store.sendDiagnosticsLogs()"
              >
                <Send class="mr-2 h-4 w-4" />
                Wyslij logi diagnostyczne
              </button>
              <button
                class="glass-button mt-2 w-full justify-center"
                type="button"
                :disabled="checkingUpdates"
                @click="checkForUpdatesNow()"
              >
                {{ checkingUpdates ? 'Sprawdzanie...' : 'Sprawdz aktualizacje' }}
              </button>
            </section>
          </div>
        </template>

        <AppFooterLink class="mt-4 pb-2 pt-1" />
      </div>
    </aside>

    <div
      v-if="removingBackupFolderPath"
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4"
      @click.self="closeRemoveBackupFolderModal()"
    >
      <div class="glass-panel w-full max-w-md rounded-[24px] border border-rose-400/35 p-5">
        <div class="text-sm font-semibold text-white">Usunąć folder z backupu?</div>
        <p class="mt-2 text-sm leading-6 text-[var(--text-dim)]">
          Ta operacja usunie wskazany folder z listy synchronizacji oraz skasuje jego kopię z chmury Google Drive dla tego urządzenia.
        </p>
        <p class="mt-2 text-sm leading-6 text-amber-200">
          Tych plików nie będzie można później przywrócić z backupu, chyba że dodasz folder ponownie i wykonasz nowy backup.
        </p>
        <div class="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2">
          <div class="truncate text-sm text-white">{{ removingBackupFolderPath }}</div>
        </div>
        <div class="mt-4 flex gap-2">
          <button class="ghost-button flex-1 justify-center !rounded-xl !px-4 !py-2.5 text-sm" type="button" :disabled="removingBackupFolderBusy" @click="closeRemoveBackupFolderModal()">
            Anuluj
          </button>
          <button class="glass-button flex-1 justify-center !rounded-xl !px-4 !py-2.5 text-sm" type="button" :disabled="removingBackupFolderBusy" @click="confirmRemoveBackupFolder()">
            {{ removingBackupFolderBusy ? 'Usuwanie...' : 'Tak, usuń' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
