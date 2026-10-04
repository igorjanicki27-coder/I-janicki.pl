<script setup lang="ts">
import { computed, ref } from 'vue'
import { Building2, Pencil, Plus, Trash2, X } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import type { DeviceRecord } from '@shared/contracts'

interface CompanyEntry {
  key: string
  name: string
  devices: DeviceRecord[]
}

const store = useAppStore()
const companyDraft = ref('')
const companyBusy = ref(false)
const companyMessage = ref('')
const companyMessageIsError = ref(false)
const editedCompanyKey = ref<string | null>(null)
const editedCompanyName = ref('')

function companyKey(value: string) {
  return value.trim().toLocaleLowerCase('pl')
}

function computerCountLabel(count: number) {
  if (count === 1) return '1 komputer'
  const lastTwoDigits = count % 100
  const lastDigit = count % 10
  if (lastDigit >= 2 && lastDigit <= 4 && (lastTwoDigits < 12 || lastTwoDigits > 14)) return `${count} komputery`
  return `${count} komputerów`
}

const companies = computed<CompanyEntry[]>(() => {
  const result = new Map<string, CompanyEntry>()

  for (const name of store.masterSettings.companyOptions) {
    const trimmedName = name.trim()
    if (!trimmedName) continue
    const key = companyKey(trimmedName)
    if (!result.has(key)) result.set(key, { key, name: trimmedName, devices: [] })
  }

  for (const device of store.devices) {
    const name = device.companyName?.trim()
    if (!name) continue
    const key = companyKey(name)
    const company = result.get(key)
    if (company) company.devices.push(device)
    else result.set(key, { key, name, devices: [device] })
  }

  return [...result.values()].sort((left, right) => left.name.localeCompare(right.name, 'pl'))
})

function showMessage(message: string, isError = false) {
  companyMessage.value = message
  companyMessageIsError.value = isError
}

async function addCompany() {
  const name = companyDraft.value.trim()
  if (!name || companyBusy.value) return
  if (companies.value.some((company) => company.key === companyKey(name))) {
    showMessage('Taka firma już istnieje.', true)
    return
  }

  companyBusy.value = true
  showMessage('')
  try {
    const added = await store.addCompanyOption(name)
    if (!added) {
      showMessage('Taka firma już istnieje.', true)
      return
    }
    companyDraft.value = ''
    showMessage(`Dodano firmę „${name}”.`)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Nie udało się dodać firmy.', true)
  } finally {
    companyBusy.value = false
  }
}

function startEditing(company: CompanyEntry) {
  editedCompanyKey.value = company.key
  editedCompanyName.value = company.name
  showMessage('')
}

function cancelEditing() {
  editedCompanyKey.value = null
  editedCompanyName.value = ''
}

async function saveCompanyName(company: CompanyEntry) {
  const nextName = editedCompanyName.value.trim()
  if (!nextName || companyBusy.value) return
  if (nextName === company.name) {
    cancelEditing()
    return
  }

  const nextKey = companyKey(nextName)
  if (companies.value.some((entry) => entry.key === nextKey && entry.key !== company.key)) {
    showMessage('Inna firma ma już taką nazwę.', true)
    return
  }

  companyBusy.value = true
  showMessage('')
  try {
    if (nextKey !== company.key) {
      const added = await store.addCompanyOption(nextName)
      if (!added) throw new Error('Nie udało się utworzyć firmy pod nową nazwą.')
    } else {
      const nextOptions = store.masterSettings.companyOptions.map((name) => (
        companyKey(name) === company.key ? nextName : name
      ))
      if (!nextOptions.some((name) => companyKey(name) === nextKey)) nextOptions.push(nextName)
      await store.updateMasterSettings({ companyOptions: nextOptions })
    }

    for (const device of company.devices) {
      await store.updateDeviceCompanyName(device.deviceId, nextName)
    }

    if (nextKey !== company.key) await store.removeCompanyOption(company.name)
    cancelEditing()
    showMessage(`Zmieniono nazwę firmy na „${nextName}”.`)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Nie udało się zmienić nazwy firmy.', true)
  } finally {
    companyBusy.value = false
  }
}

async function removeCompany(company: CompanyEntry) {
  if (companyBusy.value) return
  const prompt = company.devices.length
    ? `Usunąć firmę „${company.name}”? ${company.devices.length} komputerów zostanie przeniesionych do grupy „Bez firmy”.`
    : `Usunąć firmę „${company.name}”?`
  if (!window.confirm(prompt)) return

  companyBusy.value = true
  showMessage('')
  try {
    for (const device of company.devices) {
      await store.updateDeviceCompanyName(device.deviceId, '')
    }
    await store.removeCompanyOption(company.name)
    if (editedCompanyKey.value === company.key) cancelEditing()
    showMessage(`Usunięto firmę „${company.name}”.`)
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Nie udało się usunąć firmy.', true)
  } finally {
    companyBusy.value = false
  }
}
</script>

<template>
  <div class="scrollbar-glass min-h-0 flex-1 overflow-y-auto p-5">
    <form class="flex gap-2" @submit.prevent="addCompany()">
      <input
        v-model="companyDraft"
        class="soft-input min-w-0 !rounded-xl"
        maxlength="80"
        placeholder="Nazwa nowej firmy"
        aria-label="Nazwa nowej firmy"
      />
      <button class="glass-button shrink-0 !rounded-xl !px-4" type="submit" :disabled="companyBusy || !companyDraft.trim()">
        <Plus class="mr-2 h-4 w-4" /> Dodaj
      </button>
    </form>

    <p
      v-if="companyMessage"
      class="mt-3 rounded-xl border px-3 py-2 text-xs"
      :class="companyMessageIsError ? 'border-rose-400/20 bg-rose-400/[0.07] text-rose-200' : 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200'"
    >
      {{ companyMessage }}
    </p>

    <div v-if="companies.length" class="mt-4 space-y-2">
      <article v-for="company in companies" :key="company.key" class="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
        <form v-if="editedCompanyKey === company.key" class="flex items-center gap-2" @submit.prevent="saveCompanyName(company)">
          <input
            v-model="editedCompanyName"
            class="soft-input min-w-0 flex-1 !rounded-xl !py-2"
            maxlength="80"
            aria-label="Nowa nazwa firmy"
          />
          <button class="glass-button shrink-0 !rounded-xl !px-3 !py-2 text-xs" type="submit" :disabled="companyBusy || !editedCompanyName.trim()">
            Zapisz
          </button>
          <button class="ghost-button shrink-0 !rounded-xl !px-3 !py-2 text-xs" type="button" :disabled="companyBusy" @click="cancelEditing()">
            <X class="mr-1.5 h-3.5 w-3.5" /> Anuluj
          </button>
        </form>

        <div v-else class="flex items-center gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
            <Building2 class="h-5 w-5" />
          </span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-sm text-white">{{ company.name }}</strong>
            <small class="mt-0.5 block text-[var(--text-dim)]">{{ computerCountLabel(company.devices.length) }}</small>
          </span>
          <button class="ghost-button shrink-0 !rounded-xl !px-3 !py-2 text-xs" type="button" :disabled="companyBusy" @click="startEditing(company)">
            <Pencil class="mr-1.5 h-3.5 w-3.5" /> Edytuj
          </button>
          <button class="ghost-button shrink-0 !rounded-xl !px-3 !py-2 text-xs hover:!text-rose-200" type="button" :disabled="companyBusy" @click="removeCompany(company)">
            <Trash2 class="mr-1.5 h-3.5 w-3.5" /> Usuń
          </button>
        </div>
      </article>
    </div>

    <div v-else class="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-[var(--text-dim)]">
      Nie dodano jeszcze żadnej firmy.
    </div>
  </div>
</template>
