<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const destination = 'https://i-janicki.pl'
const isOpening = ref(false)
let navigationTimer: ReturnType<typeof setTimeout> | null = null
let resetTimer: ReturnType<typeof setTimeout> | null = null

function openWebsite(event: MouseEvent) {
  if (
    event.button !== 0
    || event.metaKey
    || event.ctrlKey
    || event.shiftKey
    || event.altKey
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return
  }

  event.preventDefault()
  if (isOpening.value) return

  isOpening.value = true
  navigationTimer = setTimeout(() => {
    window.location.href = destination
  }, 900)
  resetTimer = setTimeout(() => {
    isOpening.value = false
  }, 1_800)
}

onBeforeUnmount(() => {
  if (navigationTimer) clearTimeout(navigationTimer)
  if (resetTimer) clearTimeout(resetTimer)
})
</script>

<template>
  <a
    class="app-footer-link block text-center text-[10px] font-bold leading-4 tracking-[0.12em] transition"
    :href="destination"
    aria-label="i-JANICKI — otwórz stronę i-janicki.pl"
    rel="noreferrer noopener"
    @click="openWebsite"
  >
    i-JANICKI
  </a>

  <Teleport to="body">
    <div v-if="isOpening" class="website-loader" role="status" aria-live="polite">
      <span class="sr-only">Otwieranie strony i-JANICKI</span>
      <div class="loader" aria-hidden="true">
        <span><span></span><span></span><span></span><span></span></span>
        <div class="base"><span></span><div class="face"></div></div>
      </div>
      <div class="longfazers" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
    </div>
  </Teleport>
</template>

<style scoped>
.app-footer-link {
  color: #9fb7ff;
  background: linear-gradient(90deg, #7ee7ff 0%, #9aa7ff 38%, #c47cff 68%, #ff4fd8 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 18px rgba(155, 128, 255, 0.26);
  opacity: 0.92;
}

.app-footer-link:hover {
  filter: brightness(1.12);
  opacity: 1;
}

.website-loader {
  position: fixed;
  inset: 0;
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: rgba(6, 8, 15, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.website-loader .loader {
  position: absolute;
  top: 50%;
  left: 50%;
  margin-left: -50px;
  animation: website-speeder 0.4s linear infinite;
}

.website-loader .loader > span {
  position: absolute;
  top: -19px;
  left: 60px;
  width: 35px;
  height: 5px;
  border-radius: 2px 10px 1px 0;
  background: #ff6b9d;
}

.website-loader .base span {
  position: absolute;
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-right: 100px solid #ff6b9d;
  border-bottom: 6px solid transparent;
}

.website-loader .base span::before {
  position: absolute;
  top: -16px;
  right: -110px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #c44dff;
  box-shadow: 0 0 15px rgba(196, 77, 255, 0.6);
  content: '';
}

.website-loader .base span::after {
  position: absolute;
  top: -16px;
  right: -98px;
  width: 0;
  height: 0;
  border-top: 0 solid transparent;
  border-right: 55px solid #4d9eff;
  border-bottom: 16px solid transparent;
  content: '';
}

.website-loader .face {
  position: absolute;
  top: -15px;
  right: -125px;
  width: 20px;
  height: 12px;
  border-radius: 20px 20px 0 0;
  background: #c44dff;
  box-shadow: 0 0 10px rgba(196, 77, 255, 0.4);
  transform: rotate(-40deg);
}

.website-loader .face::after {
  position: absolute;
  top: 7px;
  right: 4px;
  width: 12px;
  height: 12px;
  border-radius: 0 0 0 2px;
  background: #4d9eff;
  box-shadow: 0 0 8px rgba(77, 158, 255, 0.4);
  content: '';
  transform: rotate(40deg);
  transform-origin: 50% 50%;
}

.website-loader .loader > span > span {
  position: absolute;
  width: 30px;
  height: 1px;
}

.website-loader .loader > span > span:nth-child(1) {
  background: #ff6b9d;
  animation: website-fazer-1 0.2s linear infinite;
}

.website-loader .loader > span > span:nth-child(2) {
  top: 3px;
  background: #c44dff;
  animation: website-fazer-2 0.4s linear infinite;
}

.website-loader .loader > span > span:nth-child(3) {
  top: 1px;
  background: #4d9eff;
  animation: website-fazer-3 0.4s linear -1s infinite;
}

.website-loader .loader > span > span:nth-child(4) {
  top: 4px;
  background: #ff6b9d;
  animation: website-fazer-4 1s linear -1s infinite;
}

.website-loader .longfazers {
  position: absolute;
  width: 100%;
  height: 100%;
}

.website-loader .longfazers span {
  position: absolute;
  width: 20%;
  height: 2px;
  opacity: 0.5;
}

.website-loader .longfazers span:nth-child(1) {
  top: 20%;
  background: #ff6b9d;
  animation: website-light-speed-1 0.6s linear -5s infinite;
}

.website-loader .longfazers span:nth-child(2) {
  top: 40%;
  background: #c44dff;
  animation: website-light-speed-2 0.8s linear -1s infinite;
}

.website-loader .longfazers span:nth-child(3) {
  top: 60%;
  background: #4d9eff;
  animation: website-light-speed-3 0.6s linear infinite;
}

.website-loader .longfazers span:nth-child(4) {
  top: 80%;
  background: #ff6b9d;
  animation: website-light-speed-4 0.5s linear -3s infinite;
}

@keyframes website-fazer-1 {
  to { left: -80px; opacity: 0; }
}

@keyframes website-fazer-2 {
  to { left: -100px; opacity: 0; }
}

@keyframes website-fazer-3 {
  to { left: -50px; opacity: 0; }
}

@keyframes website-fazer-4 {
  to { left: -150px; opacity: 0; }
}

@keyframes website-speeder {
  0% { transform: translate(2px, 1px) rotate(0deg); }
  10% { transform: translate(-1px, -3px) rotate(-1deg); }
  20% { transform: translate(-2px, 0) rotate(1deg); }
  30% { transform: translate(1px, 2px) rotate(0deg); }
  40% { transform: translate(1px, -1px) rotate(1deg); }
  50% { transform: translate(-1px, 3px) rotate(-1deg); }
  60% { transform: translate(-1px, 1px) rotate(0deg); }
  70% { transform: translate(3px, 1px) rotate(-1deg); }
  80% { transform: translate(-2px, -1px) rotate(1deg); }
  90% { transform: translate(2px, 1px) rotate(0deg); }
  100% { transform: translate(1px, -2px) rotate(-1deg); }
}

@keyframes website-light-speed-1 {
  from { left: 200%; }
  to { left: -200%; opacity: 0; }
}

@keyframes website-light-speed-2 {
  from { left: 200%; }
  to { left: -200%; opacity: 0; }
}

@keyframes website-light-speed-3 {
  from { left: 200%; }
  to { left: -100%; opacity: 0; }
}

@keyframes website-light-speed-4 {
  from { left: 200%; }
  to { left: -100%; opacity: 0; }
}
</style>
