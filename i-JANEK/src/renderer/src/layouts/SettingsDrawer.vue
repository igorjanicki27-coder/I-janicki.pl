<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, ChevronRight, Download, Gauge, LogOut, RefreshCw, ShieldCheck, Stethoscope, Trash2, X } from 'lucide-vue-next'
import AppFooterLink from '@/components/AppFooterLink.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()

const remoteAccessPassphrase = ref('')
const remoteAccessPassphraseConfirmation = ref('')
const remoteSecurityBusy = ref(false)
const remoteSecurityMessage = ref('')
const replacingRemoteAccessKey = ref(false)
const checkingUpdates = ref(false)
const pickingFolder = ref(false)
const refreshingRustDesk = ref(false)
const rotatingRustDeskPassword = ref(false)
const savingDiagnostics = ref(false)
const removingBackupFolderPath = ref<string | null>(null)
const removingBackupFolderBusy = ref(false)
const activeSettingsPanel = ref<'thresholds' | 'security' | 'support' | null>(null)

const backupFolderPathMap: Record<'Desktop' | 'Documents', string> = {
  Desktop: '%USERPROFILE%\\Desktop',
  Documents: '%USERPROFILE%\\Documents'
}

const syncStateLabel = computed(() => {
  return store.syncState === 'offline' ? 'offline' : 'connected'
})

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
    if (!open) {
      activeSettingsPanel.value = null
      return
    }
    remoteAccessPassphrase.value = ''
    remoteAccessPassphraseConfirmation.value = ''
    remoteSecurityMessage.value = ''
    replacingRemoteAccessKey.value = false
    if (!store.pendingDeviceAlias) {
      store.pendingDeviceAlias = slaveDevice.value?.deviceAlias ?? slaveDevice.value?.hostname ?? ''
    }
    if (!store.pendingCompanyName) {
      store.pendingCompanyName = slaveDevice.value?.companyName?.trim() || store.masterSettings.companyOptions[0] || ''
    }
    if (!store.pendingInstallationLocation) {
      store.pendingInstallationLocation = slaveDevice.value?.installationLocation?.trim() || ''
    }
    if (store.user?.role === 'slave') {
      void refreshRustDeskState()
    }
  },
  { immediate: true }
)

function closeSettingsPanel() {
  activeSettingsPanel.value = null
}

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

async function configureRemoteAccessSecurity() {
  const passphrase = remoteAccessPassphrase.value
  if (passphrase.length < 12) {
    remoteSecurityMessage.value = 'Hasło musi mieć co najmniej 12 znaków.'
    return
  }
  if (passphrase !== remoteAccessPassphraseConfirmation.value) {
    remoteSecurityMessage.value = 'Hasła nie są identyczne.'
    return
  }
  if (store.masterSecurity && !window.confirm('Utworzenie nowego klucza unieważni zaszyfrowane dane dostępu przesłane wcześniej przez urządzenia. Kontynuować?')) return

  remoteSecurityBusy.value = true
  remoteSecurityMessage.value = ''
  try {
    await store.setupRemoteAccessSecurity(passphrase)
    remoteSecurityMessage.value = 'Klucz utworzony i odblokowany. Urządzenia zaszyfrują dane przy następnym odświeżeniu RustDesk.'
    remoteAccessPassphrase.value = ''
    remoteAccessPassphraseConfirmation.value = ''
    replacingRemoteAccessKey.value = false
  } catch (error) {
    remoteSecurityMessage.value = error instanceof Error ? error.message : 'Nie udało się skonfigurować klucza.'
  } finally {
    remoteSecurityBusy.value = false
  }
}

function startReplacingRemoteAccessKey() {
  replacingRemoteAccessKey.value = true
  remoteAccessPassphrase.value = ''
  remoteAccessPassphraseConfirmation.value = ''
  remoteSecurityMessage.value = 'Wpisz i potwierdź nowe hasło klucza.'
}

function cancelReplacingRemoteAccessKey() {
  replacingRemoteAccessKey.value = false
  remoteAccessPassphrase.value = ''
  remoteAccessPassphraseConfirmation.value = ''
  remoteSecurityMessage.value = ''
}

async function unlockRemoteAccessSecurity() {
  if (!remoteAccessPassphrase.value) return
  remoteSecurityBusy.value = true
  remoteSecurityMessage.value = ''
  try {
    await store.unlockRemoteAccessSecurity(remoteAccessPassphrase.value)
    remoteSecurityMessage.value = 'Klucz odblokowany na czas tej sesji.'
    remoteAccessPassphrase.value = ''
  } catch (error) {
    remoteSecurityMessage.value = error instanceof Error ? error.message : 'Nie udało się odblokować klucza.'
  } finally {
    remoteSecurityBusy.value = false
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

async function saveDiagnostics() {
  if (savingDiagnostics.value) return
  savingDiagnostics.value = true
  try {
    await store.sendDiagnosticsLogs()
  } catch (error) {
    window.alert(`Nie udało się utworzyć paczki diagnostycznej: ${String(error)}`)
  } finally {
    savingDiagnostics.value = false
  }
}

function readinessDot(status: 'ok' | 'warning' | 'error' | 'skipped') {
  if (status === 'ok') return 'bg-emerald-400'
  if (status === 'warning') return 'bg-amber-400'
  if (status === 'error') return 'bg-rose-400'
  return 'bg-slate-400'
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

          <section class="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              class="group flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-amber-300/30 hover:bg-white/[0.07]"
              type="button"
              @click="activeSettingsPanel = 'thresholds'"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-400/10 text-amber-200">
                <Gauge class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-white">Progi dashboardu</span>
                <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Alerty i telemetria</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
            </button>
            <button
              class="group flex items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-300/30 hover:bg-white/[0.07]"
              type="button"
              @click="activeSettingsPanel = 'security'"
            >
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                <ShieldCheck class="h-5 w-5" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-white">Bezpieczeństwo</span>
                <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Klucz zdalnego dostępu</span>
              </span>
              <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
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
                  <input v-model="store.pendingCompanyName" class="soft-input min-w-0 !py-2" placeholder="Nazwa firmy" />
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="shrink-0">Miejsce</span>
                <input v-model="store.pendingInstallationLocation" class="soft-input min-w-0 !py-2" placeholder="Opcjonalnie" />
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
              <div class="text-sm font-semibold text-white">Zdalny dostęp</div>
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
                <label class="flex items-start justify-between gap-4">
                  <span>
                    <span class="block">Zdalny pulpit bez pytania</span>
                    <span class="mt-1 block text-xs leading-5 text-white/40">Po wyłączeniu każde połączenie będzie wymagało Twojej zgody.</span>
                  </span>
                  <input
                    class="mt-1 shrink-0"
                    :checked="Boolean(store.consent?.unattendedAccessConsent)"
                    type="checkbox"
                    @change="store.updateUnattendedAccessConsent(($event.target as HTMLInputElement).checked)"
                  />
                </label>
              </div>
            </section>
          </div>
        </template>

        <div class="mt-4 grid gap-2" :class="store.isMaster ? 'grid-cols-2' : 'grid-cols-1'">
          <section v-if="store.isMaster" class="flex min-w-0 items-center gap-2 rounded-[20px] border border-white/10 bg-white/5 p-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-white">Aktualizacja klientów</div>
              <div class="mt-0.5 text-xs text-[var(--text-dim)]">Wszystkie urządzenia</div>
            </div>
            <button class="ghost-button shrink-0 !rounded-xl !px-2.5 !py-2 text-xs" type="button" title="Wymuś aktualizację u wszystkich" @click="store.forceUpdateAllClients()">
              <RefreshCw class="h-3.5 w-3.5" />
              <span class="sr-only">Aktualizuj wszystkie urządzenia</span>
            </button>
          </section>

          <section class="flex min-w-0 items-center gap-2 rounded-[20px] border border-white/10 bg-white/5 p-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-semibold text-white">Aktualizacja aplikacji</div>
              <div class="mt-0.5 text-xs text-[var(--text-dim)]">Wersja {{ store.systemContext?.appVersion ?? '—' }}</div>
            </div>
            <label v-if="store.isDesktopAgent" class="flex shrink-0 items-center gap-1.5 text-[10px] text-[var(--text-dim)]" title="Pobieraj aktualizacje w tle">
              <span>Ciche</span>
              <input
                :checked="store.slaveSettings.silentUpdates"
                type="checkbox"
                @change="store.updateSlaveSettings({ silentUpdates: ($event.target as HTMLInputElement).checked })"
              />
            </label>
            <button
              class="ghost-button shrink-0 !rounded-xl !px-2.5 !py-2 text-xs"
              type="button"
              title="Sprawdź aktualizacje aplikacji"
              :disabled="checkingUpdates"
              @click="checkForUpdatesNow()"
            >
              <RefreshCw class="h-3.5 w-3.5" :class="checkingUpdates ? 'animate-spin' : ''" />
              <span class="sr-only">{{ checkingUpdates ? 'Sprawdzanie aktualizacji' : 'Sprawdź aktualizacje' }}</span>
            </button>
          </section>
        </div>

        <button
          class="group mt-3 flex w-full items-center gap-3 rounded-[20px] border border-white/10 bg-white/5 p-3 text-left transition hover:border-fuchsia-300/25 hover:bg-white/[0.07]"
          type="button"
          @click="activeSettingsPanel = 'support'"
        >
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100">
            <Stethoscope class="h-4 w-4" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold text-white">Pomoc techniczna</span>
            <span class="mt-0.5 block text-xs text-[var(--text-dim)]">Sprawdzenie aplikacji i raport diagnostyczny</span>
          </span>
          <span v-if="store.offlineQueueCount" class="mono shrink-0 rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[10px] text-amber-200">
            {{ store.offlineQueueCount }}
          </span>
          <ChevronRight class="h-4 w-4 shrink-0 text-white/35 transition group-hover:translate-x-0.5 group-hover:text-white/70" />
        </button>

        <AppFooterLink class="mt-4 pb-2 pt-1" />
      </div>
    </aside>

    <div
      v-if="activeSettingsPanel === 'thresholds'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="thresholds-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-amber-300/20">
        <header class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id="thresholds-title" class="text-base font-semibold text-white">Progi dashboardu</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Określ, kiedy kafelki zmieniają kolor na ostrzegawczy lub krytyczny.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto p-5">
          <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 px-3 text-[10px] uppercase tracking-[0.14em]">
            <span class="text-[var(--text-dim)]">Metryka</span>
            <span class="text-center text-amber-300">Ostrzeżenie</span>
            <span class="text-center text-rose-300">Krytyczny</span>
          </div>
          <div class="mt-3 space-y-2">
            <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]">
              <span>CPU użycie (%)</span>
              <input class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.cpuUsage.warning" aria-label="Ostrzeżenie użycia CPU" @input="store.updateMetricThreshold('cpuUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
              <input class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.cpuUsage.critical" aria-label="Krytyczne użycie CPU" @input="store.updateMetricThreshold('cpuUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]">
              <span>GPU użycie (%)</span>
              <input class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.gpuUsage.warning" aria-label="Ostrzeżenie użycia GPU" @input="store.updateMetricThreshold('gpuUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
              <input class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.gpuUsage.critical" aria-label="Krytyczne użycie GPU" @input="store.updateMetricThreshold('gpuUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]">
              <span>RAM (%)</span>
              <input class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.ramUsage.warning" aria-label="Ostrzeżenie użycia RAM" @input="store.updateMetricThreshold('ramUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
              <input class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.ramUsage.critical" aria-label="Krytyczne użycie RAM" @input="store.updateMetricThreshold('ramUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]">
              <span>Dysk (%)</span>
              <input class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.diskUsage.warning" aria-label="Ostrzeżenie użycia dysku" @input="store.updateMetricThreshold('diskUsage', 'warning', Number(($event.target as HTMLInputElement).value))" />
              <input class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.diskUsage.critical" aria-label="Krytyczne użycie dysku" @input="store.updateMetricThreshold('diskUsage', 'critical', Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]">
              <span>CPU temperatura (°C)</span>
              <input class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.cpuTemp.warning" aria-label="Ostrzeżenie temperatury CPU" @input="store.updateMetricThreshold('cpuTemp', 'warning', Number(($event.target as HTMLInputElement).value))" />
              <input class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.cpuTemp.critical" aria-label="Krytyczna temperatura CPU" @input="store.updateMetricThreshold('cpuTemp', 'critical', Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]">
              <span>GPU temperatura (°C)</span>
              <input class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.gpuTemp.warning" aria-label="Ostrzeżenie temperatury GPU" @input="store.updateMetricThreshold('gpuTemp', 'warning', Number(($event.target as HTMLInputElement).value))" />
              <input class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.gpuTemp.critical" aria-label="Krytyczna temperatura GPU" @input="store.updateMetricThreshold('gpuTemp', 'critical', Number(($event.target as HTMLInputElement).value))" />
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-3 rounded-2xl border border-white/10 px-3 py-2.5 text-sm text-[var(--text-dim)]">
              <span>Wiek backupu (h)</span>
              <input class="soft-input !py-2 !text-center !border-amber-400/35 !text-amber-200" type="number" :value="store.masterSettings.thresholds.backupAgeHours.warning" aria-label="Ostrzeżenie wieku backupu" @input="store.updateMetricThreshold('backupAgeHours', 'warning', Number(($event.target as HTMLInputElement).value))" />
              <input class="soft-input !py-2 !text-center !border-rose-400/40 !text-rose-200" type="number" :value="store.masterSettings.thresholds.backupAgeHours.critical" aria-label="Krytyczny wiek backupu" @input="store.updateMetricThreshold('backupAgeHours', 'critical', Number(($event.target as HTMLInputElement).value))" />
            </div>
          </div>

          <label class="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
            <span>
              <span class="block text-white">Częstotliwość telemetrii</span>
              <span class="mt-0.5 block text-xs">Jak często urządzenia przesyłają pomiary.</span>
            </span>
            <span class="relative w-44 shrink-0">
              <select
                class="soft-input !py-2 !pr-9 appearance-none"
                :value="store.masterSettings.telemetryMode"
                @change="store.updateMasterSettings({ telemetryMode: ($event.target as HTMLSelectElement).value as 'standard' | 'aggressive' })"
              >
                <option value="standard">Standardowa (1 h)</option>
                <option value="aggressive">Częsta (10 min)</option>
              </select>
              <ChevronDown class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-dim)]" />
            </span>
          </label>
        </div>
      </section>
    </div>

    <div
      v-if="activeSettingsPanel === 'security'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="security-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel w-full max-w-lg rounded-[28px] border border-cyan-300/20 p-5">
        <header class="flex items-start justify-between gap-4">
          <div>
            <h3 id="security-title" class="text-base font-semibold text-white">Bezpieczeństwo zdalnego dostępu</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Zarządzaj lokalnym kluczem używanym do odszyfrowywania danych RustDesk.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <label class="mt-5 block text-sm text-[var(--text-dim)]">
          <span class="mb-2 block">Hasło klucza Mastera</span>
          <input v-model="remoteAccessPassphrase" class="soft-input" type="password" autocomplete="current-password" placeholder="Minimum 12 znaków" />
          <input
            v-if="!store.masterSecurity || replacingRemoteAccessKey"
            v-model="remoteAccessPassphraseConfirmation"
            class="soft-input mt-2"
            type="password"
            autocomplete="new-password"
            placeholder="Powtórz hasło"
          />
        </label>
        <button
          class="glass-button mt-3 w-full justify-center !px-4"
          type="button"
          :disabled="remoteSecurityBusy"
          @click="store.masterSecurity && !replacingRemoteAccessKey ? unlockRemoteAccessSecurity() : configureRemoteAccessSecurity()"
        >
          {{ remoteSecurityBusy ? 'Proszę czekać...' : store.masterSecurity && !replacingRemoteAccessKey ? 'Odblokuj dane RustDesk' : replacingRemoteAccessKey ? 'Zapisz nowy klucz' : 'Utwórz klucz zdalnego dostępu' }}
        </button>
        <button
          v-if="store.masterSecurity && !replacingRemoteAccessKey"
          class="ghost-button mt-2 w-full !rounded-xl"
          type="button"
          :disabled="remoteSecurityBusy"
          @click="startReplacingRemoteAccessKey()"
        >
          Wygeneruj nowy klucz
        </button>
        <button
          v-if="replacingRemoteAccessKey"
          class="ghost-button mt-2 w-full !rounded-xl"
          type="button"
          :disabled="remoteSecurityBusy"
          @click="cancelReplacingRemoteAccessKey()"
        >
          Anuluj zmianę klucza
        </button>
        <p v-if="remoteSecurityMessage" class="mt-3 text-xs text-cyan-100">{{ remoteSecurityMessage }}</p>
        <p class="mt-3 rounded-2xl border border-amber-300/15 bg-amber-400/[0.06] px-3 py-2.5 text-xs leading-5 text-amber-100/90">
          Hasło pozostaje na tym komputerze. Prywatny klucz jest nim szyfrowany lokalnie, a urządzenia zapisują wyłącznie zaszyfrowane dane RustDesk.
        </p>
      </section>
    </div>

    <div
      v-if="activeSettingsPanel === 'support'"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-title"
      @click.self="closeSettingsPanel()"
    >
      <section class="glass-panel flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-fuchsia-300/20">
        <header class="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div>
            <h3 id="support-title" class="text-base font-semibold text-white">Pomoc techniczna</h3>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Użyj tych narzędzi tylko wtedy, gdy aplikacja nie działa prawidłowo.</p>
          </div>
          <button class="ghost-button !h-9 !w-9 shrink-0 !rounded-xl !px-0 !py-0" type="button" title="Zamknij" @click="closeSettingsPanel()">
            <X class="h-4 w-4" />
          </button>
        </header>

        <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto p-5">
          <div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="text-sm font-semibold text-white">Sprawdź działanie aplikacji</div>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Test sprawdza połączenie, konfigurację i wymagane usługi. Niczego nie zmienia i nie wysyła zawartości plików.</p>
            <button
              class="ghost-button mt-3 w-full justify-center !rounded-xl !px-4 !py-2.5 text-sm"
              type="button"
              :disabled="store.readinessRunning"
              @click="store.runReadinessChecks()"
            >
              <RefreshCw class="mr-2 h-4 w-4" :class="store.readinessRunning ? 'animate-spin' : ''" />
              {{ store.readinessRunning ? 'Sprawdzanie...' : 'Sprawdź działanie' }}
            </button>
          </div>

          <div v-if="store.readinessChecks.length" class="mt-3 space-y-2">
            <div v-for="check in store.readinessChecks" :key="check.id" class="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
              <div class="flex items-center gap-2 text-xs font-medium text-white">
                <span class="h-2 w-2 rounded-full" :class="readinessDot(check.status)" />
                {{ check.label }}
              </div>
              <div class="mt-1 pl-4 text-[11px] leading-5 text-[var(--text-dim)]">{{ check.message }}</div>
            </div>
          </div>

          <div class="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div class="text-sm font-semibold text-white">Zapisz raport dla pomocy technicznej</div>
            <p class="mt-1 text-xs leading-5 text-[var(--text-dim)]">Raport zawiera stan usług i logi techniczne. Zapisz go, gdy pomoc techniczna poprosi o plik diagnostyczny.</p>
            <button
              class="glass-button mt-3 w-full justify-center !rounded-xl !px-4 !py-2.5 text-sm"
              type="button"
              :disabled="savingDiagnostics"
              @click="saveDiagnostics()"
            >
              <Download class="mr-2 h-4 w-4" />
              {{ savingDiagnostics ? 'Zapisywanie...' : 'Zapisz raport' }}
            </button>
          </div>

          <div v-if="store.offlineQueueCount" class="mt-3 rounded-2xl border border-amber-300/20 bg-amber-400/[0.06] p-4">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold text-amber-100">Oczekujące dane: {{ store.offlineQueueCount }}</div>
                <p class="mt-1 text-xs leading-5 text-amber-100/70">Dane nie zostały jeszcze zsynchronizowane z powodu braku połączenia.</p>
              </div>
              <button
                class="ghost-button shrink-0 !rounded-xl !px-3 !py-2 text-xs"
                type="button"
                :disabled="store.flushingOfflineQueue || store.offline"
                @click="store.flushOfflineQueue(true)"
              >
                {{ store.flushingOfflineQueue ? 'Synchronizuję...' : store.offline ? 'Brak sieci' : 'Ponów' }}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

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
