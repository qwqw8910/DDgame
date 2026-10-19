<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const DISMISS_KEY = 'pwa-install-dismissed'

const { needRefresh, updateServiceWorker } = useRegisterSW()

const installEvent = ref(null)
const showIosHint = ref(false)
const installDismissed = ref(readDismissed())

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

function onBeforeInstallPrompt(e) {
  e.preventDefault()
  installEvent.value = e
}

function onInstalled() {
  installEvent.value = null
  showIosHint.value = false
}

onMounted(() => {
  if (isStandalone()) return
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onInstalled)
  const ua = navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
  showIosHint.value = isIos && isSafari
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.removeEventListener('appinstalled', onInstalled)
})

function dismissInstall() {
  installDismissed.value = true
  installEvent.value = null
  showIosHint.value = false
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* storage unavailable */ }
}

async function install() {
  const e = installEvent.value
  if (!e) return
  e.prompt()
  await e.userChoice
  installEvent.value = null
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <div v-if="needRefresh" role="status"
      class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border-glow bg-card-solid px-4 py-3 text-sm text-heading shadow-lg">
      <span class="flex-1">有新版本可用</span>
      <button type="button" class="rounded-lg bg-neon-purple px-3 py-1.5 font-medium text-white hover:bg-neon-purple-hover"
        @click="updateServiceWorker(true)">更新</button>
      <button type="button" class="text-body hover:text-heading" aria-label="稍後" @click="needRefresh = false">✕</button>
    </div>

    <div v-if="!installDismissed && (installEvent || showIosHint)" role="dialog"
      class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border-glow bg-card-solid px-4 py-3 text-sm text-heading shadow-lg">
      <template v-if="installEvent">
        <span class="flex-1">安裝到主畫面，像 App 一樣使用</span>
        <button type="button" class="rounded-lg bg-neon-rose px-3 py-1.5 font-medium text-white hover:bg-neon-rose-hover"
          @click="install">安裝</button>
      </template>
      <span v-else class="flex-1">點 Safari 的「分享」→「加入主畫面」即可安裝</span>
      <button type="button" class="text-body hover:text-heading" aria-label="不再提示" @click="dismissInstall">✕</button>
    </div>
  </div>
</template>
