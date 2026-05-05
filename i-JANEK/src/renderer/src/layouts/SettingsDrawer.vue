<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, LogOut, Send, X } from 'lucide-vue-next'
import AppFooterLink from '@/components/AppFooterLink.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useAppStore } from '@/stores/app'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()

const customFolder = ref('')
const aesDraft = ref('')

const syncStateLabel = computed(() => {
  if (store.syncState === 'offline') return 'offline'
  if (store.syncState === 'degraded') return 'degraded'
  return 'connected'
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
  },
  { immediate: true }
)

function toggleFolder(name: 'Desktop' | 'Documents') {
  const selected = new Set(store.slaveSettings.backupFolders)
  if (selected.has(name)) selected.delete(name)
  else selected.add(name)
  store.updateSlaveSettings({ backupFolders: Array.from(selected) as Array<'Desktop' | 'Documents'> })
}

function addCustomFolder() {
  const value = customFolder.value.trim()
  if (!value) return
  const next = [...store.slaveSettings.customBackupFolders, value]
  store.updateSlaveSettings({ customBackupFolders: next })
  customFolder.value = ''
}

function removeCustomFolder(path: string) {
  store.updateSlaveSettings({
    customBackupFolders: store.slaveSettings.customBackupFolders.filter((entry) => entry !== path)
  })
}

async function saveSlaveBackupSettings() {
  await store.applySlaveBackupSettings()
}

async function saveMasterAes() {
  const next = aesDraft.value.trim()
  if (!next || next === store.masterSettings.aesKey) return
  const accepted = window.confirm(
    'Zmiana klucza AES bez migracji odcina dostęp do wcześniej zaszyfrowanych haseł. Czy na pewno zapisać nowy klucz?'
  )
  if (!accepted) return
  await store.updateMasterAesKey(next)
}
</script>

<template>
  <div v-if="props.open" class="fixed inset-0 z-50 flex">
    <button class="h-full flex-1 bg-black/55 backdrop-blur-[1px]" type="button" @click="emit('close')" />
    <aside class="glass-panel flex h-full w-full max-w-[560px] flex-col border-l border-white/10 p-5">
      <div class="mb-5 flex items-center justify-between">
        <h2 class="display-font text-lg tracking-[0.2em] text-white">USTAWIENIA</h2>
        <button class="ghost-button !h-10 !w-10 !rounded-xl !px-0 !py-0" type="button" @click="emit('close')">
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto pr-1">
        <template v-if="store.isMaster">
          <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Zarzadzanie kontem</div>
            <div class="mt-3 space-y-2 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between">
                <span>Rola konta</span>
                <span class="mono text-white">{{ store.user?.role ?? '—' }}</span>
              </div>
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
                <select
                  class="soft-input !py-2"
                  :value="store.masterSettings.telemetryMode"
                  @change="store.updateMasterSettings({ telemetryMode: ($event.target as HTMLSelectElement).value as 'standard' | 'aggressive' })"
                >
                  <option value="standard">Standard (1h)</option>
                  <option value="aggressive">Agresywny (15 min)</option>
                </select>
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
                  Uwaga: zmiana klucza bez migracji odetnie dostęp do wcześniej zaszyfrowanych danych.
                </p>
              </label>
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
                <div class="font-medium text-white">{{ device.deviceAlias || device.hostname }}</div>
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

          <button class="glass-button mt-4 w-full justify-center" type="button" @click="store.signOut()">
            <LogOut class="mr-2 h-4 w-4" />
            Wyloguj
          </button>
        </template>

        <template v-else>
          <section class="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Konto</div>
            <div class="mt-3 space-y-2 text-sm text-[var(--text-dim)]">
              <div class="flex items-center justify-between">
                <span>Rola konta</span>
                <span class="mono text-white">{{ store.user?.role ?? '—' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Email</span>
                <span class="mono text-white">{{ store.user?.email ?? '—' }}</span>
              </div>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Twoje urzadzenie</div>
            <div class="mt-3 space-y-2 text-sm text-[var(--text-dim)]">
              <label class="block">
                <span class="mb-2 block">Nazwa urzadzenia</span>
                <div class="flex gap-2">
                  <input
                    v-model="store.pendingDeviceAlias"
                    class="soft-input !py-2"
                    placeholder="np. Biuro PC / Laptop Dom"
                  />
                  <button class="glass-button !px-4 !py-2" type="button" @click="store.saveDeviceAlias()">Zapisz</button>
                </div>
              </label>
              <div class="flex items-center justify-between">
                <span>Hostname</span>
                <span class="mono text-white">{{ slaveDevice?.hostname ?? '—' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>DeviceID</span>
                <span class="mono max-w-[260px] truncate text-white">{{ slaveDevice?.deviceId ?? '—' }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span>Status autoryzacji</span>
                <StatusPill :label="slaveDevice?.approvalStatus ?? 'pending'" />
              </div>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Konfiguracja backupow</div>
            <div class="mt-4 space-y-3">
              <label class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                <input :checked="store.slaveSettings.backupFolders.includes('Desktop')" type="checkbox" @change="toggleFolder('Desktop')" />
                Pulpit
              </label>
              <label class="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                <input :checked="store.slaveSettings.backupFolders.includes('Documents')" type="checkbox" @change="toggleFolder('Documents')" />
                Dokumenty
              </label>

              <div class="mt-2 flex gap-2">
                <input v-model="customFolder" class="soft-input !py-2" placeholder="Dodaj wlasny folder, np. D:\\Klient" />
                <button class="glass-button !px-3 !py-2" type="button" @click="addCustomFolder">
                  <Check class="h-4 w-4" />
                </button>
              </div>
              <div class="space-y-2">
                <div
                  v-for="path in store.slaveSettings.customBackupFolders"
                  :key="path"
                  class="flex items-center justify-between rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]"
                >
                  <span class="truncate">{{ path }}</span>
                  <button class="ghost-button !h-8 !w-8 !rounded-lg !px-0 !py-0" type="button" @click="removeCustomFolder(path)">×</button>
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
            <div class="mt-4 flex gap-2">
              <button class="glass-button flex-1 justify-center" type="button" @click="saveSlaveBackupSettings">Zapisz backup</button>
              <button class="glass-button flex-1 justify-center" type="button" @click="store.syncBackupNow()">Synchronizuj teraz</button>
            </div>
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Dzialanie systemowe</div>
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
          </section>

          <section class="mt-4 rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="text-sm font-semibold text-white">Powiadomienia i wsparcie</div>
            <div class="mt-3 space-y-3 text-sm text-[var(--text-dim)]">
              <label class="flex items-center justify-between">
                <span>Wyciszenie wiadomości</span>
                <input
                  :checked="store.slaveSettings.muteChatSounds"
                  type="checkbox"
                  @change="store.updateSlaveSettings({ muteChatSounds: ($event.target as HTMLInputElement).checked })"
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
              <label class="flex items-center justify-between">
                <span>Wyciszenie alertów zużycia</span>
                <input
                  :checked="store.slaveSettings.muteUsageNotifications"
                  type="checkbox"
                  @change="store.updateSlaveSettings({ muteUsageNotifications: ($event.target as HTMLInputElement).checked })"
                />
              </label>
              <label class="flex items-center justify-between">
                <span>Nie pokazuj alertów</span>
                <input
                  :checked="store.slaveSettings.hideAlertNotifications"
                  type="checkbox"
                  @change="store.updateSlaveSettings({ hideAlertNotifications: ($event.target as HTMLInputElement).checked })"
                />
              </label>
            </div>
            <button class="glass-button mt-4 w-full justify-center" type="button" @click="store.sendDiagnosticsLogs()">
              <Send class="mr-2 h-4 w-4" />
              Wyslij logi diagnostyczne
            </button>
          </section>

          <button class="glass-button mt-4 w-full justify-center" type="button" @click="store.signOut()">
            <LogOut class="mr-2 h-4 w-4" />
            Wyloguj
          </button>
        </template>
      </div>

      <AppFooterLink class="mt-4 shrink-0 pb-1 pt-2" />
    </aside>
  </div>
</template>
