<script setup>
import { ref } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import { usePwaInstall } from '@/shared/composables/usePwaInstall.js'

const DISMISS_KEY = 'pwa-install-dismissed'

// A new version found right after load is applied silently. One found mid-session stays waiting
// behind a banner, so a running game is only reloaded when the player taps update.
const LOAD_WINDOW_MS = 10000
const CHECK_INTERVAL_MS = 30 * 60 * 1000
const loadedAt = Date.now()
const updateDismissed = ref(false)

const { needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_url, registration) {
    if (!registration) return
    registration.update()
    // Long-lived tabs / installed PWAs never reload on their own, so poll and re-check on return.
    setInterval(() => registration.update(), CHECK_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update()
    })
  },
  onNeedRefresh() {
    if (Date.now() - loadedAt < LOAD_WINDOW_MS) updateServiceWorker(true)
  },
})

const { installEvent, canInstall, install } = usePwaInstall()
const installDismissed = ref(readDismissed())

function readDismissed() {
  try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
}

// Dismissing only hides this banner; the portal header install button stays available.
function dismissInstall() {
  installDismissed.value = true
  try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* storage unavailable */ }
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] flex flex-col items-center gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
    <div v-if="needRefresh && !updateDismissed" role="dialog"
      class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-border-glow bg-card-solid px-4 py-3 text-sm text-heading shadow-lg">
      <span class="flex-1">有新版本可用</span>
      <button type="button" class="rounded-lg bg-neon-rose px-3 py-1.5 font-medium text-white hover:bg-neon-rose-hover"
        @click="updateServiceWorker(true)">更新</button>
      <button type="button" class="text-body hover:text-heading" aria-label="稍後再說" @click="updateDismissed = true">✕</button>
    </div>
    <div v-if="!installDismissed && canInstall" role="dialog"
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
