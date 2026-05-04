<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import {
  BellRing,
  CheckCheck,
  CloudCog,
  Database,
  FolderClock,
  LaptopMinimalCheck,
  MessageSquareText,
  Power,
  ShieldCheck,
  TerminalSquare
} from 'lucide-vue-next'
import type { BackupPolicy } from '@shared/contracts'
import DeviceTile from '@/components/DeviceTile.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const tabs = ['overview', 'chat', 'terminal', 'backup', 'inventory'] as const
const state = reactive({
  activeTab: 'overview' as (typeof tabs)[number]
})

const backupForm = reactive<BackupPolicy>({
  enabled: true,
  maxFileSizeMb: 200,
  maxQuotaGb: 5,
  syncUnderMb: 100,
  watchedPaths: [],
  driveFolderName: 'i-JANEK_Backup',
  sharedWith: store.user?.email ?? ''
})

const watchedPathsText = ref('')

watch(
  () => store.selectedDevice,
  (device) => {
    const source = device?.backupPolicy
    if (!source) return
    backupForm.enabled = source.enabled
    backupForm.maxFileSizeMb = source.maxFileSizeMb
    backupForm.maxQuotaGb = source.maxQuotaGb
    backupForm.syncUnderMb = source.syncUnderMb
    backupForm.watchedPaths = [...source.watchedPaths]
    backupForm.driveFolderName = source.driveFolderName
    backupForm.sharedWith = source.sharedWith
    watchedPathsText.value = source.watchedPaths.join('\n')
  },
  { immediate: true }
)
</script>

<template>
  <div class="grid h-full gap-5 xl:grid-cols-[300px_1fr]">
    <aside class="glass-panel flex h-full flex-col rounded-[32px] p-5">
      <div>
        <div class="mono text-xs uppercase tracking-[0.28em] text-cyan-300">Master Console</div>
        <h2 class="mt-3 text-2xl font-semibold text-white">Centrum serwisowe i-JANEK</h2>
        <p class="mt-3 text-sm leading-7 text-[var(--text-dim)]">
          Master zarządza zatwierdzeniami, telemetrią, terminalem, czatem i backupem wielu urządzeń przypisanych do kont Google klientów.
        </p>
      </div>

      <div class="mt-6 grid gap-3">
        <div class="rounded-[26px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center justify-between">
            <div class="text-sm text-[var(--text-dim)]">Oczekujące urządzenia</div>
            <CheckCheck class="h-4 w-4 text-cyan-300" />
          </div>
          <div class="mt-2 text-3xl font-semibold text-white">{{ store.approvalQueue.length }}</div>
        </div>
        <div class="rounded-[26px] border border-white/10 bg-white/5 p-4">
          <div class="flex items-center justify-between">
            <div class="text-sm text-[var(--text-dim)]">Krytyczne alerty</div>
            <BellRing class="h-4 w-4 text-cyan-300" />
          </div>
          <div class="mt-2 text-3xl font-semibold text-white">{{ store.criticalAlerts.length }}</div>
        </div>
      </div>

      <div class="mt-6 flex-1 overflow-auto">
        <div class="mono mb-3 text-xs uppercase tracking-[0.22em] text-[var(--text-dim)]">Queue</div>
        <div class="space-y-3">
          <div v-for="device in store.approvalQueue" :key="device.deviceId" class="rounded-[24px] border border-white/10 bg-white/5 p-4">
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="font-semibold text-white">{{ device.hostname }}</div>
                <div class="mono mt-1 text-xs uppercase tracking-[0.15em] text-[var(--text-dim)]">{{ device.ownerEmail }}</div>
              </div>
              <StatusPill label="pending" tone="warning" />
            </div>
            <div class="mt-4 flex gap-2">
              <button class="glass-button !rounded-xl !px-3 !py-2 text-xs" type="button" @click="store.approveDevice(device.deviceId, 'approved')">Zatwierdź</button>
              <button class="glass-button !rounded-xl !px-3 !py-2 text-xs" type="button" @click="store.approveDevice(device.deviceId, 'rejected')">Odrzuć</button>
            </div>
          </div>
        </div>
      </div>

      <button class="glass-button mt-5 w-full justify-center" type="button" @click="store.signOut()">
        <Power class="mr-2 h-4 w-4" />
        Wyloguj
      </button>
    </aside>

    <section class="flex h-full min-h-0 flex-col gap-5">
      <div class="grid gap-4 lg:grid-cols-4">
        <div class="glass-panel rounded-[30px] p-5">
          <div class="flex items-center justify-between">
            <Database class="h-5 w-5 text-cyan-300" />
            <StatusPill :label="store.isDemoMode ? 'demo' : 'firebase'" />
          </div>
          <div class="mt-4 text-3xl font-semibold text-white">{{ store.devices.length }}</div>
          <div class="mt-2 text-sm text-[var(--text-dim)]">Łączna liczba urządzeń w bazie</div>
        </div>
        <div class="glass-panel rounded-[30px] p-5">
          <div class="flex items-center justify-between">
            <ShieldCheck class="h-5 w-5 text-cyan-300" />
            <StatusPill label="Google OAuth" tone="success" />
          </div>
          <div class="mt-4 text-3xl font-semibold text-white">{{ store.devices.filter((d) => d.approvalStatus === 'approved').length }}</div>
          <div class="mt-2 text-sm text-[var(--text-dim)]">Aktywne urządzenia po ręcznym gate’cie</div>
        </div>
        <div class="glass-panel rounded-[30px] p-5">
          <div class="flex items-center justify-between">
            <CloudCog class="h-5 w-5 text-cyan-300" />
            <StatusPill label="Drive Guard" />
          </div>
          <div class="mt-4 text-3xl font-semibold text-white">{{ store.devices.filter((d) => d.backupPolicy?.enabled).length }}</div>
          <div class="mt-2 text-sm text-[var(--text-dim)]">Urządzenia z włączonym backupem</div>
        </div>
        <div class="glass-panel rounded-[30px] p-5">
          <div class="flex items-center justify-between">
            <FolderClock class="h-5 w-5 text-cyan-300" />
            <StatusPill label="30 dni" />
          </div>
          <div class="mt-4 text-3xl font-semibold text-white">{{ store.alerts.length }}</div>
          <div class="mt-2 text-sm text-[var(--text-dim)]">Zdarzenia w oknie retencji Firestore</div>
        </div>
      </div>

      <div class="grid min-h-0 flex-1 gap-5 lg:grid-cols-[1.15fr_0.95fr]">
        <div class="min-h-0 space-y-4 overflow-auto pr-1">
          <DeviceTile
            v-for="device in store.devices"
            :key="device.deviceId"
            :device="device"
            :selected="store.selectedDeviceId === device.deviceId"
            @click="store.selectedDeviceId = device.deviceId"
          />
        </div>

        <div class="glass-panel flex min-h-0 flex-col rounded-[32px] p-5">
          <div v-if="store.selectedDevice" class="flex items-start justify-between gap-4">
            <div>
              <div class="mono text-xs uppercase tracking-[0.22em] text-cyan-300">Selected Device</div>
              <h3 class="mt-2 text-2xl font-semibold text-white">{{ store.selectedDevice.hostname }}</h3>
              <p class="mt-2 text-sm text-[var(--text-dim)]">{{ store.selectedDevice.ownerEmail }}</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="tab in tabs"
                :key="tab"
                type="button"
                class="rounded-2xl border px-3 py-2 text-xs uppercase tracking-[0.18em] transition"
                :class="state.activeTab === tab ? 'border-cyan-300/40 bg-cyan-300/10 text-white' : 'border-white/10 text-[var(--text-dim)]'"
                @click="state.activeTab = tab"
              >
                {{ tab }}
              </button>
            </div>
          </div>

          <div v-if="store.selectedDevice && state.activeTab === 'overview'" class="mt-5 grid gap-4 overflow-auto">
            <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div class="flex items-center gap-2 text-white">
                <LaptopMinimalCheck class="h-4 w-4 text-cyan-300" />
                Live telemetry
              </div>
              <div class="mt-4 grid gap-3 md:grid-cols-2">
                <div class="rounded-2xl border border-white/10 p-4">
                  <div class="text-sm text-[var(--text-dim)]">CPU hot zones</div>
                  <div class="mt-2 space-y-2">
                    <div v-for="zone in store.selectedDevice.telemetry?.cpuHotZones ?? []" :key="zone.label" class="flex justify-between text-sm">
                      <span>{{ zone.label }}</span>
                      <span class="mono">{{ zone.temperatureC ?? '—' }}°C</span>
                    </div>
                  </div>
                </div>
                <div class="rounded-2xl border border-white/10 p-4">
                  <div class="text-sm text-[var(--text-dim)]">Top 10 procesów</div>
                  <div class="mt-2 space-y-2">
                    <div
                      v-for="proc in store.selectedDevice.telemetry?.topProcesses ?? []"
                      :key="proc.pid"
                      class="flex justify-between gap-3 text-sm"
                    >
                      <span class="truncate">{{ proc.name }}</span>
                      <span class="mono whitespace-nowrap">{{ proc.cpuPercent }}% CPU</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div class="flex items-center gap-2 text-white">
                <BellRing class="h-4 w-4 text-cyan-300" />
                Ostatnie alerty
              </div>
              <div class="mt-4 space-y-3">
                <div v-for="alert in store.alerts.slice(0, 5)" :key="alert.id" class="rounded-2xl border border-white/10 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div class="font-medium text-white">{{ alert.title }}</div>
                    <StatusPill :label="alert.severity" :tone="alert.severity === 'critical' ? 'critical' : 'warning'" />
                  </div>
                  <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">{{ alert.message }}</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="store.selectedDevice && state.activeTab === 'chat'" class="mt-5 flex min-h-0 flex-1 flex-col">
            <div class="flex-1 space-y-3 overflow-auto rounded-[28px] border border-white/10 bg-white/5 p-4">
              <div
                v-for="message in store.chats[store.selectedDevice.deviceId] ?? []"
                :key="message.id"
                class="max-w-[85%] rounded-[22px] border px-4 py-3 text-sm leading-7"
                :class="message.senderRole === 'master' ? 'ml-auto border-cyan-300/20 bg-cyan-300/10' : 'border-white/10 bg-white/5'"
              >
                <div class="mono mb-1 text-[11px] uppercase tracking-[0.18em] text-[var(--text-dim)]">{{ message.senderEmail }}</div>
                {{ message.body }}
              </div>
            </div>
            <div class="mt-4 flex gap-3">
              <input v-model="store.pendingChatMessage" class="soft-input" placeholder="Wyślij wiadomość do klienta..." />
              <button class="glass-button" type="button" @click="store.sendChatMessage()">
                <MessageSquareText class="mr-2 h-4 w-4" />
                Wyślij
              </button>
            </div>
          </div>

          <div v-if="store.selectedDevice && state.activeTab === 'terminal'" class="mt-5 flex min-h-0 flex-1 flex-col">
            <div class="rounded-[28px] border border-cyan-300/20 bg-slate-950/60 p-4">
              <div class="flex items-center gap-2 text-white">
                <TerminalSquare class="h-4 w-4 text-cyan-300" />
                Cichy PowerShell / CMD
              </div>
              <textarea
                v-model="store.pendingTerminalCommand"
                class="soft-input mt-4 min-h-28 resize-none font-mono"
                placeholder="np. Get-Process | Sort-Object CPU -Descending | Select -First 10"
              />
              <div class="mt-4 flex justify-end">
                <button class="glass-button" type="button" @click="store.queueTerminalCommand()">Kolejkuj komendę</button>
              </div>
            </div>

            <div class="mt-4 flex-1 space-y-3 overflow-auto">
              <div
                v-for="command in store.commandHistory[store.selectedDevice.deviceId] ?? []"
                :key="command.id"
                class="rounded-[24px] border border-white/10 bg-white/5 p-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="mono text-xs uppercase tracking-[0.18em] text-cyan-300">{{ command.shell }}</div>
                  <StatusPill :label="command.status" :tone="command.status === 'completed' ? 'success' : command.status === 'failed' ? 'critical' : 'warning'" />
                </div>
                <div class="mt-2 font-mono text-sm text-white">{{ command.command }}</div>
                <pre class="mt-3 overflow-auto rounded-2xl bg-black/30 p-3 text-xs text-[var(--text-dim)]">{{ command.output || command.error || 'Oczekiwanie na wynik…' }}</pre>
              </div>
            </div>
          </div>

          <div v-if="store.selectedDevice && state.activeTab === 'backup'" class="mt-5 space-y-4 overflow-auto">
            <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div class="flex items-center gap-2 text-white">
                <CloudCog class="h-4 w-4 text-cyan-300" />
                Polityka backupu Google Drive
              </div>
              <div class="mt-4 grid gap-4 md:grid-cols-2">
                <label class="text-sm text-[var(--text-dim)]">
                  Max file size (MB)
                  <input v-model.number="backupForm.maxFileSizeMb" class="soft-input mt-2" type="number" />
                </label>
                <label class="text-sm text-[var(--text-dim)]">
                  Max quota (GB)
                  <input v-model.number="backupForm.maxQuotaGb" class="soft-input mt-2" type="number" />
                </label>
                <label class="text-sm text-[var(--text-dim)]">
                  Sync under (MB)
                  <input v-model.number="backupForm.syncUnderMb" class="soft-input mt-2" type="number" />
                </label>
                <label class="text-sm text-[var(--text-dim)]">
                  Share with
                  <input v-model="backupForm.sharedWith" class="soft-input mt-2" type="email" />
                </label>
              </div>
              <div class="mt-4">
                <label class="text-sm text-[var(--text-dim)]">
                  Watched paths
                  <textarea v-model="watchedPathsText" class="soft-input mt-2 min-h-24" />
                </label>
              </div>
              <div class="mt-4 flex justify-end">
                <button
                  class="glass-button"
                  type="button"
                  @click="store.saveBackupPolicy({ ...backupForm, watchedPaths: watchedPathsText.split('\n').map((item) => item.trim()).filter(Boolean) })"
                >
                  Zapisz politykę
                </button>
              </div>
            </div>

            <div class="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <div class="flex items-center justify-between">
                <div class="text-white">Ostatni snapshot backupu</div>
                <StatusPill label="Drive" />
              </div>
              <div class="mt-3 text-sm leading-7 text-[var(--text-dim)]">
                {{ store.backupSnapshots[store.selectedDevice.deviceId]?.uploadedFiles ?? 0 }} przesłanych plików,
                {{ store.backupSnapshots[store.selectedDevice.deviceId]?.skippedFiles ?? 0 }} pominiętych.
              </div>
            </div>
          </div>

          <div v-if="store.selectedDevice && state.activeTab === 'inventory'" class="mt-5 overflow-auto rounded-[28px] border border-white/10 bg-white/5 p-5">
            <div class="flex items-center gap-2 text-white">
              <Database class="h-4 w-4 text-cyan-300" />
              Inwentaryzacja tygodniowa
            </div>
            <div class="mt-4 text-sm leading-7 text-[var(--text-dim)]">
              Raport tygodniowy zapisuje hardware, sloty RAM, listę aplikacji, poprawki Windows Update i status Windows Defender.
            </div>
            <div v-if="store.inventory[store.selectedDevice.deviceId]" class="mt-4 grid gap-4 md:grid-cols-2">
              <div class="rounded-2xl border border-white/10 p-4">
                <div class="font-medium text-white">Hardware</div>
                <div class="mt-2 text-sm text-[var(--text-dim)]">
                  {{ store.inventory[store.selectedDevice.deviceId].hardware.manufacturer }}
                  {{ store.inventory[store.selectedDevice.deviceId].hardware.model }}
                </div>
              </div>
              <div class="rounded-2xl border border-white/10 p-4">
                <div class="font-medium text-white">Aplikacje</div>
                <div class="mt-2 text-sm text-[var(--text-dim)]">
                  {{ store.inventory[store.selectedDevice.deviceId].installedApps.length }} pozycji
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
