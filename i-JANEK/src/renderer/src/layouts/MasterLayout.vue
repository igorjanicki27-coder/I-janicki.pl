<script setup lang="ts">
import { computed, ref } from 'vue'
import { BellRing, CloudCog, Database, MessageSquareText, Power, ShieldCheck, TerminalSquare } from 'lucide-vue-next'
import DeviceTile from '@/components/DeviceTile.vue'
import StatusPill from '@/components/StatusPill.vue'
import { useAppStore } from '@/stores/app'

const store = useAppStore()
const tabs = ['overview', 'chat', 'terminal', 'backup'] as const
const activeTab = ref<(typeof tabs)[number]>('overview')

const selectedAlerts = computed(() => {
  if (!store.selectedDevice) return []
  return store.alerts.filter((alert) => alert.deviceId === store.selectedDevice?.deviceId).slice(0, 5)
})

const selectedBackupPaths = computed(() => store.selectedDevice?.backupPolicy?.watchedPaths ?? [])
</script>

<template>
  <div class="grid h-full min-h-0 gap-4 xl:grid-cols-[320px_1fr]">
    <aside class="glass-panel flex min-h-0 flex-col rounded-[30px] p-4">
      <div>
        <div class="mono text-xs uppercase tracking-[0.28em] text-fuchsia-300">Master</div>
        <h2 class="mt-3 text-2xl font-semibold text-white">Panel zarządzania</h2>
        <p class="mt-2 text-sm leading-7 text-[var(--text-dim)]">Krótki podgląd urządzeń, zgód i najważniejszych akcji.</p>
      </div>

      <div class="mt-5 grid grid-cols-2 gap-3">
        <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div class="text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">Pending</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ store.approvalQueue.length }}</div>
        </div>
        <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
          <div class="text-xs uppercase tracking-[0.16em] text-[var(--text-dim)]">Alerty</div>
          <div class="mt-2 text-2xl font-semibold text-white">{{ store.criticalAlerts.length }}</div>
        </div>
      </div>

      <div class="mt-5 flex-1 overflow-auto pr-1">
        <div class="mb-3 text-sm font-medium text-white">Urządzenia</div>
        <div class="space-y-3">
          <DeviceTile
            v-for="device in store.devices"
            :key="device.deviceId"
            :device="device"
            :selected="store.selectedDeviceId === device.deviceId"
            @click="store.selectedDeviceId = device.deviceId"
          />
        </div>
      </div>

      <button class="glass-button mt-4 w-full justify-center" type="button" @click="store.signOut()">
        <Power class="mr-2 h-4 w-4" />
        Wyloguj
      </button>
    </aside>

    <section class="flex min-h-0 flex-col gap-4">
      <div class="glass-panel rounded-[30px] p-5">
        <div v-if="store.selectedDevice" class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div class="display-font text-xl tracking-[0.2em] text-white">{{ store.selectedDevice.hostname }}</div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <StatusPill :label="store.selectedDevice.approvalStatus" />
              <StatusPill :label="store.isDemoMode ? 'demo' : 'firebase'" />
              <StatusPill :label="store.selectedDevice.ownerEmail" />
            </div>
          </div>

          <div v-if="store.selectedDevice.approvalStatus === 'pending'" class="flex flex-wrap gap-2">
            <button class="glass-button" type="button" @click="store.approveDevice(store.selectedDevice.deviceId, 'approved')">Zatwierdź</button>
            <button class="ghost-button" type="button" @click="store.approveDevice(store.selectedDevice.deviceId, 'rejected')">Odrzuć</button>
          </div>
        </div>

        <div v-else class="text-sm text-[var(--text-dim)]">Wybierz urządzenie z listy po lewej.</div>

        <div class="mt-5 flex flex-wrap gap-2">
          <button
            v-for="tab in tabs"
            :key="tab"
            type="button"
            class="rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] transition"
            :class="activeTab === tab ? 'border-fuchsia-400/30 bg-fuchsia-500/10 text-white' : 'border-white/10 text-[var(--text-dim)]'"
            @click="activeTab = tab"
          >
            {{ tab }}
          </button>
        </div>
      </div>

      <div class="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-[30px] p-5">
        <div v-if="!store.selectedDevice" class="flex flex-1 items-center justify-center text-sm text-[var(--text-dim)]">
          Brak wybranego urządzenia.
        </div>

        <template v-else-if="activeTab === 'overview'">
          <div class="grid gap-3 lg:grid-cols-4">
            <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
              <div class="flex items-center justify-between text-sm text-[var(--text-dim)]">
                <span>CPU</span>
                <Database class="h-4 w-4 text-fuchsia-300" />
              </div>
              <div class="mt-3 text-3xl font-semibold text-white">{{ store.selectedDevice.telemetry?.cpuTemperatureC ?? '—' }}°</div>
            </div>
            <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
              <div class="flex items-center justify-between text-sm text-[var(--text-dim)]">
                <span>RAM</span>
                <ShieldCheck class="h-4 w-4 text-fuchsia-300" />
              </div>
              <div class="mt-3 text-3xl font-semibold text-white">{{ store.selectedDevice.telemetry?.memoryUsedPercent ?? '—' }}%</div>
            </div>
            <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
              <div class="flex items-center justify-between text-sm text-[var(--text-dim)]">
                <span>Dysk</span>
                <CloudCog class="h-4 w-4 text-fuchsia-300" />
              </div>
              <div class="mt-3 text-3xl font-semibold text-white">{{ store.selectedDevice.telemetry?.disks?.[0]?.usedPercent ?? '—' }}%</div>
            </div>
            <div class="rounded-[22px] border border-white/10 bg-white/5 p-4">
              <div class="flex items-center justify-between text-sm text-[var(--text-dim)]">
                <span>Backup</span>
                <BellRing class="h-4 w-4 text-fuchsia-300" />
              </div>
              <div class="mt-3 text-3xl font-semibold text-white">{{ store.selectedDevice.backupSnapshot?.uploadedFiles ?? 0 }}</div>
            </div>
          </div>

          <div class="mt-4 grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.05fr_0.95fr]">
            <div class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="mb-3 text-sm font-medium text-white">Top procesy</div>
              <div class="space-y-2">
                <div
                  v-for="proc in store.selectedDevice.telemetry?.topProcesses?.slice(0, 6) ?? []"
                  :key="proc.pid"
                  class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 px-3 py-2 text-sm"
                >
                  <span class="truncate text-white">{{ proc.name }}</span>
                  <span class="mono whitespace-nowrap text-[var(--text-dim)]">{{ proc.cpuPercent }}%</span>
                </div>
              </div>
            </div>

            <div class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="mb-3 text-sm font-medium text-white">Ostatnie alerty</div>
              <div class="space-y-2">
                <div
                  v-for="alert in selectedAlerts"
                  :key="alert.id"
                  class="rounded-2xl border border-white/10 px-3 py-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="font-medium text-white">{{ alert.title }}</div>
                    <StatusPill :label="alert.severity" :tone="alert.severity === 'critical' ? 'critical' : 'warning'" />
                  </div>
                  <p class="mt-2 text-sm text-[var(--text-dim)]">{{ alert.message }}</p>
                </div>
                <div v-if="!selectedAlerts.length" class="rounded-2xl border border-white/10 px-3 py-3 text-sm text-[var(--text-dim)]">
                  Brak alertów dla tego urządzenia.
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else-if="activeTab === 'chat'">
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="flex-1 space-y-3 overflow-auto rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div
                v-for="message in store.chats[store.selectedDevice.deviceId] ?? []"
                :key="message.id"
                class="max-w-[82%] rounded-[20px] border px-4 py-3 text-sm leading-7"
                :class="message.senderRole === 'master' ? 'ml-auto border-fuchsia-400/20 bg-fuchsia-500/10' : 'border-white/10 bg-white/5'"
              >
                <div class="mono mb-1 text-[11px] uppercase tracking-[0.16em] text-[var(--text-dim)]">{{ message.senderEmail }}</div>
                {{ message.body }}
              </div>
            </div>

            <div class="mt-4 flex gap-3">
              <input v-model="store.pendingChatMessage" class="soft-input" placeholder="Wiadomość do klienta..." />
              <button class="glass-button" type="button" @click="store.sendChatMessage()">
                <MessageSquareText class="mr-2 h-4 w-4" />
                Wyślij
              </button>
            </div>
          </div>
        </template>

        <template v-else-if="activeTab === 'terminal'">
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="flex items-center gap-2 text-sm font-medium text-white">
                <TerminalSquare class="h-4 w-4 text-fuchsia-300" />
                Cichy terminal
              </div>
              <textarea
                v-model="store.pendingTerminalCommand"
                class="soft-input mt-4 min-h-28 resize-none font-mono"
                placeholder="np. Get-Process | Sort-Object CPU -Descending | Select -First 10"
              />
              <div class="mt-4 flex justify-end">
                <button class="glass-button" type="button" @click="store.queueTerminalCommand()">Wyślij komendę</button>
              </div>
            </div>

            <div class="mt-4 flex-1 space-y-3 overflow-auto">
              <div
                v-for="command in store.commandHistory[store.selectedDevice.deviceId] ?? []"
                :key="command.id"
                class="rounded-[22px] border border-white/10 bg-white/5 p-4"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="mono text-xs uppercase tracking-[0.16em] text-fuchsia-300">{{ command.shell }}</div>
                  <StatusPill :label="command.status" :tone="command.status === 'completed' ? 'success' : command.status === 'failed' ? 'critical' : 'warning'" />
                </div>
                <div class="mt-2 font-mono text-sm text-white">{{ command.command }}</div>
                <pre class="mt-3 overflow-auto rounded-2xl bg-black/20 p-3 text-xs text-[var(--text-dim)]">{{ command.output || command.error || 'Oczekiwanie na wynik...' }}</pre>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="text-sm font-medium text-white">Backup</div>
              <div class="mt-4 space-y-3 text-sm text-[var(--text-dim)]">
                <div class="flex items-center justify-between">
                  <span>Limit pliku</span>
                  <span class="mono text-white">{{ store.selectedDevice.backupPolicy?.maxFileSizeMb ?? 0 }} MB</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Quota</span>
                  <span class="mono text-white">{{ store.selectedDevice.backupPolicy?.maxQuotaGb ?? 0 }} GB</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Auto sync</span>
                  <span class="mono text-white">{{ store.selectedDevice.backupPolicy?.syncUnderMb ?? 0 }} MB</span>
                </div>
                <div class="flex items-center justify-between">
                  <span>Folder</span>
                  <span class="mono text-white">{{ store.selectedDevice.backupPolicy?.driveFolderName }}</span>
                </div>
              </div>
            </div>

            <div class="rounded-[24px] border border-white/10 bg-white/5 p-4">
              <div class="text-sm font-medium text-white">Śledzone katalogi</div>
              <div class="mt-4 space-y-2">
                <div
                  v-for="pathEntry in selectedBackupPaths"
                  :key="pathEntry"
                  class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]"
                >
                  {{ pathEntry }}
                </div>
                <div v-if="!selectedBackupPaths.length" class="rounded-2xl border border-white/10 px-3 py-2 text-sm text-[var(--text-dim)]">
                  Brak skonfigurowanych katalogów.
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </section>
  </div>
</template>
