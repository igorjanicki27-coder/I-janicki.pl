<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowUpRight, MessageSquarePlus } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import type { ServiceRequestPriority, ServiceRequestStatus } from '@shared/contracts'

const emit = defineEmits<{ openDevice: [deviceId: string, ownerUid: string] }>()
const store = useAppStore()
const statusFilter = ref<'active' | 'all' | ServiceRequestStatus>('active')
const errorMessage = ref('')
const commentDrafts = ref<Record<string, string>>({})
const busyCommentId = ref('')

const filteredRequests = computed(() => [...store.serviceRequests]
  .filter((request) => {
    if (statusFilter.value === 'all') return true
    if (statusFilter.value === 'active') return request.status !== 'resolved'
    return request.status === statusFilter.value
  })
  .sort((left, right) => right.createdAt - left.createdAt))

function formatDateTime(timestamp?: number | null) {
  if (!timestamp) return 'brak danych'
  return new Date(timestamp).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function statusLabel(status: ServiceRequestStatus) {
  if (status === 'in_progress') return 'W trakcie'
  if (status === 'resolved') return 'Zakończone'
  return 'Nowe'
}

function priorityLabel(priority: ServiceRequestPriority) {
  if (priority === 'critical') return 'Krytyczny'
  if (priority === 'high') return 'Wysoki'
  if (priority === 'low') return 'Niski'
  return 'Normalny'
}

function priorityClass(priority: ServiceRequestPriority) {
  if (priority === 'critical') return 'border-rose-400/40 bg-rose-500/15 text-rose-100'
  if (priority === 'high') return 'border-amber-400/35 bg-amber-500/12 text-amber-100'
  if (priority === 'low') return 'border-white/10 bg-white/5 text-[var(--text-dim)]'
  return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100'
}

function commentsForRequest(requestId: string) {
  return store.serviceRequestComments.filter((comment) => comment.requestId === requestId)
}

async function changeStatus(requestId: string, event: Event) {
  errorMessage.value = ''
  try {
    await store.updateServiceRequestStatus(requestId, (event.target as HTMLSelectElement).value as ServiceRequestStatus)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Nie udało się zmienić statusu zadania.'
  }
}

async function addComment(requestId: string) {
  const body = commentDrafts.value[requestId]?.trim() ?? ''
  if (!body || busyCommentId.value) return
  busyCommentId.value = requestId
  errorMessage.value = ''
  try {
    await store.addServiceRequestComment(requestId, body)
    commentDrafts.value = { ...commentDrafts.value, [requestId]: '' }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Nie udało się dodać komentarza.'
  } finally {
    busyCommentId.value = ''
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in [{ key: 'active', label: 'Aktywne' }, { key: 'open', label: 'Nowe' }, { key: 'in_progress', label: 'W trakcie' }, { key: 'resolved', label: 'Zakończone' }, { key: 'all', label: 'Wszystkie' }]"
          :key="option.key"
          type="button"
          class="rounded-xl border px-3 py-2 text-sm transition"
          :class="statusFilter === option.key ? 'border-cyan-300/35 bg-cyan-400/10 text-white' : 'border-white/10 text-[var(--text-dim)] hover:text-white'"
          @click="statusFilter = option.key as typeof statusFilter"
        >
          {{ option.label }}
        </button>
      </div>
      <div class="text-sm text-[var(--text-dim)]">{{ filteredRequests.length }} zgłoszeń</div>
    </div>

    <p v-if="errorMessage" class="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{{ errorMessage }}</p>

    <div class="mt-5 space-y-3">
      <article v-for="request in filteredRequests" :key="request.id" class="content-card" :class="request.status === 'resolved' ? 'opacity-70' : ''">
        <div class="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.13em]" :class="priorityClass(request.priority)">{{ priorityLabel(request.priority) }}</span>
              <span class="mono text-[11px] text-[var(--text-dim)]">{{ formatDateTime(request.createdAt) }}</span>
            </div>
            <h3 class="mt-3 text-base font-semibold text-white">{{ request.title }}</h3>
            <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-white/80">{{ request.description }}</p>
            <div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--text-dim)]">
              <span>Firma: <strong class="text-white">{{ request.companyName }}</strong></span>
              <span>Klient: <strong class="text-white">{{ request.ownerEmail }}</strong></span>
              <span>Komputer: <strong class="text-white">{{ request.deviceLabel }}</strong></span>
            </div>

            <details class="mt-4 rounded-xl border border-fuchsia-300/15 bg-fuchsia-500/[0.04] p-3">
              <summary class="cursor-pointer list-none text-xs font-medium text-fuchsia-100">
                <span class="inline-flex items-center gap-2"><MessageSquarePlus class="h-4 w-4" /> Notatki wewnętrzne ({{ commentsForRequest(request.id).length }})</span>
              </summary>
              <div v-if="commentsForRequest(request.id).length" class="mt-3 space-y-2">
                <div v-for="comment in commentsForRequest(request.id)" :key="comment.id" class="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                  <div class="flex justify-between gap-2 text-[10px] text-[var(--text-dim)]"><span>{{ comment.authorEmail }}</span><span>{{ formatDateTime(comment.createdAt) }}</span></div>
                  <p class="mt-1 whitespace-pre-wrap text-xs leading-5 text-white/85">{{ comment.body }}</p>
                </div>
              </div>
              <div class="mt-3 flex gap-2">
                <textarea v-model="commentDrafts[request.id]" class="soft-input min-h-[68px] flex-1 resize-y !rounded-xl !py-2 text-xs" maxlength="2000" placeholder="Notatka niewidoczna dla klienta..." />
                <button class="glass-button self-end !rounded-xl !px-3 !py-2 text-xs" type="button" :disabled="busyCommentId === request.id || !commentDrafts[request.id]?.trim()" @click="addComment(request.id)">Dodaj</button>
              </div>
            </details>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2 xl:w-64 xl:justify-end">
            <select class="soft-input !w-auto !min-w-36 !rounded-xl !py-2 text-sm" :value="request.status" :aria-label="`Status: ${statusLabel(request.status)}`" @change="changeStatus(request.id, $event)">
              <option value="open">Nowe</option><option value="in_progress">W trakcie</option><option value="resolved">Zakończone</option>
            </select>
            <button class="ghost-button !rounded-xl !px-3 !py-2 text-xs" type="button" :disabled="!store.devices.some((device) => device.deviceId === request.deviceId)" @click="emit('openDevice', request.deviceId, request.ownerUid)">
              Komputer <ArrowUpRight class="ml-2 h-4 w-4" />
            </button>
          </div>
        </div>
      </article>

      <div v-if="!filteredRequests.length" class="rounded-2xl border border-dashed border-white/10 p-10 text-center">
        <div class="text-base font-semibold text-white">Brak zgłoszeń w tym widoku</div>
        <p class="mt-2 text-sm text-[var(--text-dim)]">Gdy klient utworzy zadanie, pojawi się tutaj automatycznie.</p>
      </div>
    </div>
  </div>
</template>
