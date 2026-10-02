// 山中別館 — 音效 / 環境音（素材放在 public/mountain-lodge/audio/）
// 音效開關（sfx）預設開啟；環境音（雨聲）預設關閉，避免干擾玩家的 Discord 語音。
import { ref, watch } from 'vue'

const BASE = `${import.meta.env.BASE_URL}mountain-lodge/audio/`

const SOUNDS = {
    flip: { src: 'sfx/card-flip.mp3', volume: 0.7, group: 'sfx' },
    pass: { src: 'sfx/card-pass.mp3', volume: 0.7, group: 'sfx' },
    tick: { src: 'sfx/tick.mp3', volume: 0.5, group: 'sfx', loop: true },
    rain: { src: 'ambient/rain.mp3', volume: 0.35, group: 'ambient', loop: true },
}

const KEY = 'lodge-sound'
function loadPrefs() {
    try { return { sfx: true, ambient: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } }
    catch { return { sfx: true, ambient: false } }
}

// 模組層級單例：多個元件共用同一份開關與 Audio 物件
const prefs = loadPrefs()
const sfxOn = ref(!!prefs.sfx)
const ambientOn = ref(!!prefs.ambient)
const audios = {}
const wantedLoops = new Set()
let retryBound = false

watch([sfxOn, ambientOn], () => {
    try { localStorage.setItem(KEY, JSON.stringify({ sfx: sfxOn.value, ambient: ambientOn.value })) } catch { /* 略過 */ }
    syncLoops()
})

function enabled(name) {
    return SOUNDS[name].group === 'ambient' ? ambientOn.value : sfxOn.value
}

function get(name) {
    if (!audios[name]) {
        const def = SOUNDS[name]
        const a = new Audio(BASE + def.src)
        a.volume = def.volume
        a.loop = !!def.loop
        a.preload = 'auto'
        audios[name] = a
    }
    return audios[name]
}

// 瀏覽器在使用者互動前會擋自動播放：失敗時等下一次點擊再重試
function safePlay(a) {
    a.play()?.catch(() => {
        if (retryBound) return
        retryBound = true
        window.addEventListener('pointerdown', () => { retryBound = false; syncLoops() }, { once: true })
    })
}

function syncLoops() {
    for (const name of Object.keys(SOUNDS)) {
        if (!SOUNDS[name].loop) continue
        const a = get(name)
        if (wantedLoops.has(name) && enabled(name)) { if (a.paused) safePlay(a) }
        else if (!a.paused) { a.pause(); if (name === 'tick') a.currentTime = 0 }
    }
}

function play(name) {
    if (!enabled(name)) return
    const a = get(name)
    a.currentTime = 0
    safePlay(a)
}

function setLoop(name, wanted) {
    if (wanted) wantedLoops.add(name)
    else wantedLoops.delete(name)
    syncLoops()
}

function stopAll() {
    wantedLoops.clear()
    syncLoops()
}

export function useSound() {
    return {
        sfxOn, ambientOn, play, setLoop, stopAll,
        toggleSfx: () => { sfxOn.value = !sfxOn.value },
        toggleAmbient: () => { ambientOn.value = !ambientOn.value },
    }
}
