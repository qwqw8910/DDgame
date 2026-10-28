import { ref, computed } from 'vue'

// Module-level state: `beforeinstallprompt` can fire before any page mounts, and the banner
// (PwaPrompt) and the portal header button must see the same install event.
const installEvent = ref(null)
const isIosSafari = ref(false)
const standalone = ref(false)
let listening = false

function detectStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
}

function listen() {
  if (listening || typeof window === 'undefined') return
  listening = true
  standalone.value = detectStandalone()
  if (standalone.value) return
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent.value = e
  })
  window.addEventListener('appinstalled', () => {
    installEvent.value = null
    isIosSafari.value = false
    standalone.value = true
  })
  const ua = navigator.userAgent
  const isIos = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua)
  isIosSafari.value = isIos && isSafari
}

async function install() {
  const e = installEvent.value
  if (!e) return
  e.prompt()
  await e.userChoice
  installEvent.value = null
}

export function usePwaInstall() {
  listen()
  return {
    installEvent,
    isIosSafari,
    // True when this browser can install the app (Chromium prompt available, or iOS needs manual steps).
    canInstall: computed(() => !standalone.value && (!!installEvent.value || isIosSafari.value)),
    install,
  }
}
