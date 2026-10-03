<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Building2, CheckCircle2, Inbox, Laptop, Mail, MapPin, UserPlus, XCircle } from 'lucide-vue-next'
import { formatDeviceLabelForMaster } from '@/services/device-label'
import { useAppStore } from '@/stores/app'

interface DeviceDetailsDraft {
  deviceAlias: string
  contactName: string
  installationLocation: string
  dwServiceInstallationCode: string
}

interface CompanyAssignmentDraft {
  mode: 'existing' | 'new'
  existingCompany: string
  newCompany: string
}

const store = useAppStore()
const approvalDrafts = ref<Record<string, DeviceDetailsDraft>>({})
const companyAssignmentDrafts = ref<Record<string, CompanyAssignmentDraft>>({})
const approvalBusy = ref<Record<string, boolean>>({})
const approvalMessages = ref<Record<string, string>>({})
const pendingDevices = computed(() => store.approvalQueue)

watch(
  pendingDevices,
  (devices) => {
    const nextDrafts: Record<string, DeviceDetailsDraft> = {}
    const nextCompanyAssignments: Record<string, CompanyAssignmentDraft> = {}
    for (const device of devices) {
      nextDrafts[device.deviceId] = approvalDrafts.value[device.deviceId] ?? {
        deviceAlias: device.deviceAlias?.trim() || device.hostname,
        contactName: device.contactName?.trim() || '',
        installationLocation: device.installationLocation?.trim() || '',
        dwServiceInstallationCode: device.dwservice?.installationCode ?? ''
      }
      nextCompanyAssignments[device.deviceId] = companyAssignmentDrafts.value[device.deviceId] ?? {
        mode: store.masterSettings.companyOptions.length ? 'existing' : 'new',
        existingCompany: '',
        newCompany: ''
      }
    }
    approvalDrafts.value = nextDrafts
    companyAssignmentDrafts.value = nextCompanyAssignments
  },
  { immediate: true }
)

async function decideAboutDevice(deviceId: string, approvalStatus: 'approved' | 'rejected') {
  if (approvalBusy.value[deviceId]) return
  approvalBusy.value = { ...approvalBusy.value, [deviceId]: true }
  approvalMessages.value = { ...approvalMessages.value, [deviceId]: '' }
  try {
    let details: (DeviceDetailsDraft & { companyName: string }) | undefined
    if (approvalStatus === 'approved') {
      const draft = approvalDrafts.value[deviceId]
      const assignment = companyAssignmentDrafts.value[deviceId]
      if (!draft || !assignment) throw new Error('Uzupełnij dane urządzenia i wybierz firmę.')

      let companyName = ''
      if (assignment.mode === 'existing') {
        companyName = store.masterSettings.companyOptions.find(
          (option) => option.toLocaleLowerCase('pl') === assignment.existingCompany.trim().toLocaleLowerCase('pl')
        ) ?? ''
        if (!companyName) throw new Error('Wybierz firmę z listy.')
      } else {
        const requestedName = assignment.newCompany.trim()
        if (!requestedName) throw new Error('Wpisz nazwę nowej firmy.')
        const existingCompany = store.masterSettings.companyOptions.find(
          (option) => option.toLocaleLowerCase('pl') === requestedName.toLocaleLowerCase('pl')
        )
        if (existingCompany) companyName = existingCompany
        else {
          await store.addCompanyOption(requestedName)
          companyName = store.masterSettings.companyOptions.find(
            (option) => option.toLocaleLowerCase('pl') === requestedName.toLocaleLowerCase('pl')
          ) ?? requestedName
        }
      }
      details = { ...draft, companyName }
    }
    const installationCode = details?.dwServiceInstallationCode
    const registrationDetails = details ? {
      deviceAlias: details.deviceAlias,
      contactName: details.contactName,
      installationLocation: details.installationLocation,
      companyName: details.companyName
    } : undefined
    await store.approveDevice(deviceId, approvalStatus, registrationDetails, installationCode)
  } catch (error) {
    approvalMessages.value = {
      ...approvalMessages.value,
      [deviceId]: error instanceof Error ? error.message : 'Nie udało się zapisać decyzji.'
    }
  } finally {
    approvalBusy.value = { ...approvalBusy.value, [deviceId]: false }
  }
}

function registrationDate(timestamp: number) {
  return new Date(timestamp).toLocaleString('pl-PL')
}
</script>

<template>
  <div class="space-y-5 p-5 lg:p-6">
    <section
      class="overflow-hidden rounded-[24px] border p-5"
      :class="pendingDevices.length ? 'border-amber-300/25 bg-amber-400/[0.06]' : 'border-white/10 bg-white/[0.025]'"
    >
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-start gap-4">
          <span
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            :class="pendingDevices.length ? 'bg-amber-400/15 text-amber-200' : 'bg-cyan-400/10 text-cyan-100'"
          >
            <UserPlus class="h-6 w-6" />
          </span>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-lg font-semibold text-white">Rejestracja urządzeń</h2>
              <span
                class="mono rounded-full px-2.5 py-1 text-xs"
                :class="pendingDevices.length ? 'bg-amber-300 text-slate-950' : 'bg-white/[0.07] text-white/65'"
              >
                Oczekujące: {{ pendingDevices.length }}
              </span>
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">
              Tutaj pojawiają się wszystkie nowe komputery wymagające decyzji administratora. Lista aktualizuje się automatycznie — nie trzeba otwierać ustawień.
            </p>
          </div>
        </div>
        <div class="rounded-xl border border-white/10 bg-black/10 px-3 py-2 text-right text-xs text-[var(--text-dim)]">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full" :class="store.offline ? 'bg-amber-400' : 'bg-emerald-400'" />
            {{ store.offline ? 'Brak połączenia' : 'Nasłuch aktywny' }}
          </div>
          <div class="mono mt-1 text-white/55">{{ store.lastSyncAt ? registrationDate(store.lastSyncAt) : 'Oczekiwanie na synchronizację' }}</div>
        </div>
      </div>
    </section>

    <section v-if="pendingDevices.length" class="space-y-4">
      <article
        v-for="device in pendingDevices"
        :key="device.deviceId"
        class="rounded-[24px] border border-amber-300/20 bg-[#0d0b18]/80 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]"
      >
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex min-w-0 items-start gap-3">
            <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/10 text-amber-200">
              <Laptop class="h-5 w-5" />
            </span>
            <div class="min-w-0">
              <div class="text-xs font-medium uppercase tracking-[0.16em] text-amber-200">Nowa prośba</div>
              <h3 class="mt-1 truncate text-lg font-semibold text-white">{{ formatDeviceLabelForMaster(device) }}</h3>
              <p class="mono mt-1 text-[11px] text-white/40">System: {{ device.hostname }} · {{ device.platform }} {{ device.arch }}</p>
            </div>
          </div>
          <time class="text-xs text-[var(--text-dim)]" :datetime="new Date(device.createdAt).toISOString()">
            {{ registrationDate(device.createdAt) }}
          </time>
        </div>

        <div class="mt-4 grid gap-2 text-xs text-[var(--text-dim)] sm:grid-cols-3">
          <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2.5"><Mail class="h-4 w-4 shrink-0 text-cyan-200" /><span class="truncate">{{ device.ownerEmail }}</span></div>
          <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2.5"><Building2 class="h-4 w-4 shrink-0 text-cyan-200" /><span class="truncate">Sugestia klienta: {{ device.companyName || 'brak' }}</span></div>
          <div class="flex min-w-0 items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2.5"><MapPin class="h-4 w-4 shrink-0 text-cyan-200" /><span class="truncate">{{ device.installationLocation || 'Nie podano lokalizacji' }}</span></div>
        </div>

        <div v-if="approvalDrafts[device.deviceId] && companyAssignmentDrafts[device.deviceId]" class="mt-5 space-y-4">
          <div class="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.04] p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div><div class="text-sm font-semibold text-white">Przypisz komputer do firmy</div><p class="mt-1 text-xs text-[var(--text-dim)]">Wartość podana przez użytkownika jest tylko informacyjna. Wybierz właściwą firmę albo utwórz nową.</p></div>
              <div class="flex rounded-xl border border-white/10 bg-black/15 p-1 text-xs">
                <button class="rounded-lg px-3 py-2 transition" :class="companyAssignmentDrafts[device.deviceId].mode === 'existing' ? 'bg-cyan-400/15 text-white' : 'text-[var(--text-dim)]'" type="button" :disabled="!store.masterSettings.companyOptions.length" @click="companyAssignmentDrafts[device.deviceId].mode = 'existing'">Istniejąca</button>
                <button class="rounded-lg px-3 py-2 transition" :class="companyAssignmentDrafts[device.deviceId].mode === 'new' ? 'bg-cyan-400/15 text-white' : 'text-[var(--text-dim)]'" type="button" @click="companyAssignmentDrafts[device.deviceId].mode = 'new'">Nowa firma</button>
              </div>
            </div>
            <label v-if="companyAssignmentDrafts[device.deviceId].mode === 'existing'" class="mt-4 block text-xs text-[var(--text-dim)]">Firma z listy
              <select v-model="companyAssignmentDrafts[device.deviceId].existingCompany" class="soft-input mt-1 !rounded-xl !py-2.5">
                <option value="" disabled>Wybierz firmę…</option>
                <option v-for="company in store.masterSettings.companyOptions" :key="company" :value="company">{{ company }}</option>
              </select>
            </label>
            <label v-else class="mt-4 block text-xs text-[var(--text-dim)]">Nazwa nowej firmy
              <input v-model="companyAssignmentDrafts[device.deviceId].newCompany" class="soft-input mt-1 !rounded-xl !py-2.5" maxlength="80" placeholder="Wpisz poprawną nazwę firmy" />
            </label>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <label class="text-xs text-[var(--text-dim)]">Nazwa komputera<input v-model="approvalDrafts[device.deviceId].deviceAlias" class="soft-input mt-1 !py-2.5" maxlength="48" placeholder="np. Laptop biuro" /></label>
            <label class="text-xs text-[var(--text-dim)]">Osoba<input v-model="approvalDrafts[device.deviceId].contactName" class="soft-input mt-1 !py-2.5" maxlength="100" placeholder="Imię i nazwisko" /></label>
            <label class="text-xs text-[var(--text-dim)]">Lokalizacja<input v-model="approvalDrafts[device.deviceId].installationLocation" class="soft-input mt-1 !py-2.5" maxlength="120" placeholder="np. Biuro, recepcja" /></label>
            <label class="text-xs text-[var(--text-dim)]">Kod instalacyjny DWService<input v-model="approvalDrafts[device.deviceId].dwServiceInstallationCode" class="soft-input mt-1 !py-2.5 font-mono" maxlength="11" inputmode="numeric" placeholder="123-456-789" /></label>
          </div>
        </div>

        <p v-if="approvalMessages[device.deviceId]" class="mt-3 text-xs text-rose-300">{{ approvalMessages[device.deviceId] }}</p>
        <div class="mt-5 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
          <button class="ghost-button !rounded-xl !px-4 !py-2.5 text-xs" type="button" :disabled="approvalBusy[device.deviceId]" @click="decideAboutDevice(device.deviceId, 'rejected')"><XCircle class="mr-2 h-4 w-4" /> Odrzuć</button>
          <button class="glass-button !rounded-xl !px-4 !py-2.5 text-xs" type="button" :disabled="approvalBusy[device.deviceId]" @click="decideAboutDevice(device.deviceId, 'approved')"><CheckCircle2 class="mr-2 h-4 w-4" />{{ approvalBusy[device.deviceId] ? 'Zapisywanie…' : 'Zapisz i zatwierdź' }}</button>
        </div>
      </article>
    </section>

    <section v-else class="rounded-[24px] border border-dashed border-white/10 px-6 py-14 text-center">
      <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.035] text-white/35"><Inbox class="h-7 w-7" /></span>
      <h2 class="mt-4 text-base font-semibold text-white">Brak próśb o rejestrację</h2>
      <p class="mx-auto mt-2 max-w-lg text-sm leading-6 text-[var(--text-dim)]">Gdy klient wyśle prośbę z aplikacji Windows lub macOS, pojawi się ona w tym miejscu wraz z przyciskami zatwierdzenia i odrzucenia.</p>
    </section>
  </div>
</template>
