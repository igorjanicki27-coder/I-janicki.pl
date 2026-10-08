<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { CheckCircle2 } from 'lucide-vue-next'
import type { PostUpdateNotice } from '@shared/ipc'

const props = defineProps<{ notice: PostUpdateNotice }>()
const emit = defineEmits<{ acknowledged: [] }>()
const dialogElement = ref<HTMLDialogElement | null>(null)
const busy = ref(false)
const errorMessage = ref('')

onMounted(() => dialogElement.value?.showModal())

async function acknowledge() {
  if (busy.value) return
  busy.value = true
  errorMessage.value = ''
  try {
    await window.janek.system.acknowledgePostUpdateNotice(props.notice.version)
    dialogElement.value?.close()
    emit('acknowledged')
  } catch {
    errorMessage.value = 'Nie udało się zapisać potwierdzenia. Kliknij OK ponownie.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog
    ref="dialogElement"
    class="post-update-dialog glass-panel w-[min(92vw,640px)] max-h-[85vh] rounded-[28px] p-0 text-white"
    aria-labelledby="post-update-title"
    aria-describedby="post-update-description"
    closedby="none"
    @cancel.prevent
    @keydown.stop
    @keydown.esc.prevent
  >
    <section class="flex max-h-[85vh] flex-col p-7">
      <div class="flex items-center gap-3">
        <CheckCircle2 class="h-7 w-7 shrink-0 text-emerald-300" />
        <h2 id="post-update-title" class="text-xl font-semibold">i-JANEK został zaktualizowany</h2>
      </div>
      <p id="post-update-description" class="mt-5 text-sm font-semibold">Co się zmieniło w wersji {{ notice.version }}:</p>
      <div class="mt-3 min-h-0 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-7 text-[var(--text-dim)]">{{ notice.notes }}</div>
      <p v-if="errorMessage" class="mt-3 text-sm text-rose-200" role="alert">{{ errorMessage }}</p>
      <div class="mt-5 flex justify-center">
        <button class="glass-button w-full max-w-64 justify-center" type="button" :disabled="busy" autofocus @click="acknowledge">{{ busy ? 'Zapisywanie…' : 'OK' }}</button>
      </div>
    </section>
  </dialog>
</template>

<style scoped>
.post-update-dialog {
  background-color: #0d1424;
}
.post-update-dialog::backdrop {
  background: rgb(0 0 0 / 75%);
}
</style>
