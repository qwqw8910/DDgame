// ================================================================
//  點格棋 — 音效引擎（Web Audio 即時合成，不需要任何音檔）
//  模組層級單例：共用同一個 AudioContext 與靜音偏好（做法同 useGemTdSfx / useCharacterStormSfx）
//  用法：const { playSfx, haptic, isSfxMuted, toggleSfxMute, startSfx, stopSfx } = useDotsBoxesSfx()
//  playSfx('line' | 'claim' | 'turn' | 'win' | 'lose' | 'draw' | 'join' | 'click', { level })
//  level（claim 專用）：1–5，分值越高音越高
// ================================================================
import { ref, watch } from 'vue'

const PREF_KEY = 'dots-boxes-sfx'
const clamp01 = v => (Number.isFinite(+v) ? Math.min(1, Math.max(0, +v)) : 0.5)

function loadPrefs() {
  const base = { muted: false, volume: 0.5 }
  try { return { ...base, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') } }
  catch { return base }
}

const prefs = loadPrefs()
const isSfxMuted = ref(!!prefs.muted)
const sfxVolume = ref(clamp01(prefs.volume))

let ctx = null
let master = null

watch([isSfxMuted, sfxVolume], () => {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify({ muted: isSfxMuted.value, volume: sfxVolume.value }))
  } catch { /* 略過 */ }
  applyMasterGain()
})

function applyMasterGain() {
  if (!master || !ctx) return
  const target = isSfxMuted.value ? 0 : sfxVolume.value * 0.55
  master.gain.setTargetAtTime(target, ctx.currentTime, 0.02)
}

function ensureContext() {
  if (ctx || typeof window === 'undefined') return ctx
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  if (!AudioCtx) return null
  ctx = new AudioCtx()
  // master → 壓縮器 → 輸出：連續拿格時音效疊加不爆音
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.knee.value = 12
  comp.ratio.value = 4
  master = ctx.createGain()
  master.connect(comp)
  comp.connect(ctx.destination)
  applyMasterGain()
  return ctx
}

function envelope(t, gain, attack, dur) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  g.connect(master)
  return g
}

function tone(t, { freq, to, type = 'sine', dur = 0.12, gain = 0.15, attack = 0.004 }) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  osc.connect(envelope(t, gain, attack, dur))
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

// 音階：C 大調五聲，分值 1–5 對應往上一階
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5]

const SOUNDS = {
  // 畫線：短促的木頭輕敲
  line(t) {
    tone(t, { freq: 330, to: 150, dur: 0.07, gain: 0.2, type: 'triangle' })
    tone(t, { freq: 1800, to: 900, dur: 0.03, gain: 0.05 })
  },
  // 拿下格子：兩音上行，分值越高音越高
  claim(t, { level = 1 } = {}) {
    const i = Math.min(SCALE.length - 3, Math.max(0, level - 1))
    tone(t, { freq: SCALE[i], dur: 0.14, gain: 0.16, type: 'triangle' })
    tone(t + 0.07, { freq: SCALE[i + 2], dur: 0.22, gain: 0.14, type: 'triangle' })
  },
  // 輪到你：輕柔的提示
  turn(t) {
    tone(t, { freq: 660, dur: 0.1, gain: 0.08 })
    tone(t + 0.09, { freq: 880, dur: 0.16, gain: 0.08 })
  },
  win(t) {
    ;[0, 2, 4, 5, 7].forEach((s, k) => tone(t + k * 0.09, { freq: SCALE[s], dur: 0.28, gain: 0.13, type: 'triangle' }))
  },
  lose(t) {
    ;[4, 3, 2, 0].forEach((s, k) => tone(t + k * 0.13, { freq: SCALE[s] / 2, dur: 0.3, gain: 0.12, type: 'sine' }))
  },
  draw(t) {
    tone(t, { freq: SCALE[2], dur: 0.2, gain: 0.12, type: 'triangle' })
    tone(t + 0.15, { freq: SCALE[2], dur: 0.3, gain: 0.12, type: 'triangle' })
  },
  join(t) {
    tone(t, { freq: 660, dur: 0.08, gain: 0.12 })
    tone(t + 0.08, { freq: 990, dur: 0.12, gain: 0.1 })
  },
  click(t) {
    tone(t, { freq: 900, to: 600, dur: 0.05, gain: 0.1 })
  },
}

function unlockAudio() {
  const c = ensureContext()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

function playSfx(name, opts) {
  if (isSfxMuted.value) return
  const c = ensureContext()
  if (!c || c.state !== 'running') return
  SOUNDS[name]?.(c.currentTime + 0.005, opts)
}

// 手機震動回饋（跟著靜音開關）
function haptic(pattern) {
  if (isSfxMuted.value) return
  try { navigator.vibrate?.(pattern) } catch { /* 略過 */ }
}

let listeners = 0

export function useDotsBoxesSfx() {
  // 瀏覽器要求先有使用者操作才能出聲：第一次點擊／按鍵時解鎖
  function startSfx() {
    if (typeof window === 'undefined') return
    if (listeners++ > 0) return
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)
  }

  function stopSfx() {
    if (typeof window === 'undefined' || listeners === 0) return
    if (--listeners > 0) return
    window.removeEventListener('pointerdown', unlockAudio)
    window.removeEventListener('keydown', unlockAudio)
  }

  function toggleSfxMute() {
    isSfxMuted.value = !isSfxMuted.value
    if (!isSfxMuted.value) {
      unlockAudio()
      setTimeout(() => playSfx('click'), 30)
    }
    return isSfxMuted.value
  }

  return { isSfxMuted, sfxVolume, startSfx, stopSfx, toggleSfxMute, playSfx, haptic }
}
