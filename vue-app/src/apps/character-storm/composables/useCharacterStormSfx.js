// ================================================================
//  默契字囊團 — 音效引擎（Web Audio 即時合成，不需要任何音檔）
//  模組層級單例：大廳 / 房間共用同一個 AudioContext 與靜音偏好
//  用法：playSfx('submit')；階段切換仍可透過 'character-storm:phase-cue' 事件觸發
// ================================================================
import { ref, watch } from 'vue'

const PREF_KEY = 'cs-sfx-v2' // v2：預設音量改 50%，不沿用舊的 70% 偏好
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
let noiseBuffer = null

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

  // master → 壓縮器 → 輸出：多個音效疊加時不爆音
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

function getNoise() {
  if (noiseBuffer) return noiseBuffer
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return noiseBuffer
}

function envelope(t, gain, attack, dur) {
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  g.connect(master)
  return g
}

// ── 基本音色 ────────────────────────────────────────────────────
function tone(t, { freq, to, type = 'sine', dur = 0.12, gain = 0.15, attack = 0.004, lp }) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
  const out = envelope(t, gain, attack, dur)
  if (lp) {
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = lp
    osc.connect(f)
    f.connect(out)
  } else {
    osc.connect(out)
  }
  osc.start(t)
  osc.stop(t + dur + 0.03)
}

function noise(t, { dur = 0.1, gain = 0.2, type = 'bandpass', freq = 1000, to, q = 1, attack = 0.003 }) {
  const src = ctx.createBufferSource()
  src.buffer = getNoise()
  const f = ctx.createBiquadFilter()
  f.type = type
  f.Q.value = q
  f.frequency.setValueAtTime(freq, t)
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
  src.connect(f)
  f.connect(envelope(t, gain, attack, dur))
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.03)
}

function chord(t, freqs, opts) {
  freqs.forEach(freq => tone(t, { ...opts, freq }))
}

function arpeggio(t, freqs, step, opts) {
  freqs.forEach((freq, i) => tone(t + i * step, { ...opts, freq }))
}

// ── 音效表 ──────────────────────────────────────────────────────
const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5, E6 = 1318.5, G6 = 1568

const SOUNDS = {
  // 字牌落桌：木頭碰撞
  tile(t) {
    noise(t, { dur: 0.05, gain: 0.32, freq: 2400, q: 1.4 })
    tone(t, { freq: 240, to: 110, dur: 0.08, gain: 0.22 })
  },
  // 打字：極短的輕敲
  type(t) {
    noise(t, { dur: 0.025, gain: 0.1, type: 'highpass', freq: 3500 })
  },
  // 自己送出提示 / 答案
  submit(t) {
    SOUNDS.tile(t)
    tone(t + 0.05, { freq: E6, dur: 0.12, gain: 0.08, type: 'triangle' })
    tone(t + 0.12, { freq: G6, dur: 0.2, gain: 0.08, type: 'triangle' })
  },
  // 其他人送出
  pop(t) {
    tone(t, { freq: 480, to: 920, dur: 0.09, gain: 0.14 })
  },
  // 玩家加入
  join(t) {
    tone(t, { freq: 660, dur: 0.08, gain: 0.12 })
    tone(t + 0.08, { freq: 990, dur: 0.14, gain: 0.12 })
  },
  // 一般按鈕
  click(t) {
    tone(t, { freq: 900, to: 700, dur: 0.05, gain: 0.08, type: 'triangle' })
  },
  // 倒數滴答（最後 10 秒）
  tick(t) {
    tone(t, { freq: 1250, dur: 0.04, gain: 0.1, type: 'triangle' })
  },
  // 倒數最後 3 秒：加上低音心跳
  tickUrgent(t) {
    tone(t, { freq: 1700, dur: 0.05, gain: 0.13, type: 'triangle' })
    tone(t, { freq: 90, to: 55, dur: 0.14, gain: 0.3 })
  },
  // 回合開始：風聲掃過 + 和弦
  roundStart(t) {
    noise(t, { dur: 0.45, gain: 0.26, freq: 280, to: 3800, q: 0.8, attack: 0.12 })
    chord(t + 0.3, [C5, E5, G5], { dur: 0.45, gain: 0.06, type: 'triangle' })
    tone(t + 0.3, { freq: 130.8, to: 98, dur: 0.3, gain: 0.25 })
  },
  // 輪到猜題者作答
  turn(t) {
    tone(t, { freq: 740, dur: 0.08, gain: 0.1, type: 'triangle' })
    tone(t + 0.09, { freq: 988, dur: 0.16, gain: 0.1, type: 'triangle' })
  },
  // 揭曉倒數鼓聲
  drum(t) {
    tone(t, { freq: 190, to: 70, dur: 0.22, gain: 0.42 })
    noise(t, { dur: 0.07, gain: 0.16, type: 'lowpass', freq: 1400 })
  },
  // 答對：上行琶音 + 閃光
  correct(t) {
    arpeggio(t, [C5, E5, G5, C6], 0.075, { dur: 0.3, gain: 0.11, type: 'triangle' })
    chord(t + 0.32, [C6, E6, G6], { dur: 0.6, gain: 0.05, type: 'sine' })
    arpeggio(t + 0.36, [2093, 2637, 3136, 4186], 0.05, { dur: 0.12, gain: 0.035 })
    noise(t + 0.3, { dur: 0.5, gain: 0.08, type: 'highpass', freq: 6000, attack: 0.01 })
  },
  // 答錯：下滑的「哇哇」
  wrong(t) {
    tone(t, { freq: 311, to: 293, dur: 0.26, gain: 0.13, type: 'sawtooth', lp: 1100 })
    tone(t + 0.28, { freq: 277, to: 196, dur: 0.6, gain: 0.13, type: 'sawtooth', lp: 900 })
  },
  // 答案揭曉：閃爍上行
  reveal(t) {
    arpeggio(t, [G5, C6, E6, G6], 0.06, { dur: 0.22, gain: 0.06 })
  },
  // 一局結束：小號角
  finished(t) {
    tone(t, { freq: G5 / 2, dur: 0.14, gain: 0.1, type: 'square', lp: 2200 })
    tone(t + 0.15, { freq: G5 / 2, dur: 0.1, gain: 0.1, type: 'square', lp: 2200 })
    tone(t + 0.26, { freq: C5, dur: 0.18, gain: 0.1, type: 'square', lp: 2200 })
    chord(t + 0.46, [C5, E5, G5, C6], { dur: 0.9, gain: 0.06, type: 'triangle' })
    noise(t + 0.46, { dur: 0.8, gain: 0.07, type: 'highpass', freq: 5000, attack: 0.01 })
  },
  // 丟火：呼～
  fire(t) {
    noise(t, { dur: 0.4, gain: 0.24, freq: 450, to: 2600, q: 1.2, attack: 0.05 })
  },
  // 丟蛋：飛出去 → 啪
  egg(t) {
    tone(t, { freq: 520, to: 260, dur: 0.3, gain: 0.08 })
    noise(t + 0.62, { dur: 0.14, gain: 0.34, type: 'lowpass', freq: 900 })
    tone(t + 0.62, { freq: 150, to: 60, dur: 0.14, gain: 0.26 })
  },
  // 輸入錯誤
  error(t) {
    tone(t, { freq: 155, dur: 0.08, gain: 0.14, type: 'square', lp: 700 })
    tone(t + 0.11, { freq: 155, dur: 0.1, gain: 0.14, type: 'square', lp: 700 })
  },
}

// 舊的 phase-cue 事件名稱 → 新音效
const CUE_TO_SOUND = {
  'phase-round1-start': 'roundStart',
  'phase-round2-start': 'roundStart',
  'phase-round1-answer': 'turn',
  'phase-round2-answer': 'turn',
  'phase-reveal': 'reveal',
  'phase-finished': 'finished',
}

function unlockAudio() {
  const c = ensureContext()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

function playSfx(name) {
  if (isSfxMuted.value) return
  const c = ensureContext()
  if (!c || c.state !== 'running') return
  SOUNDS[name]?.(c.currentTime + 0.005)
}

// 手機震動回饋（跟著音效開關）
function haptic(pattern) {
  if (isSfxMuted.value) return
  try { navigator.vibrate?.(pattern) } catch { /* 略過 */ }
}

function handlePhaseCue(event) {
  const sound = CUE_TO_SOUND[event?.detail?.cue]
  if (sound) playSfx(sound)
}

let listeners = 0

export function useCharacterStormSfx() {
  function startSfx() {
    if (typeof window === 'undefined') return
    if (listeners++ > 0) return
    window.addEventListener('character-storm:phase-cue', handlePhaseCue)
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)
  }

  function stopSfx() {
    if (typeof window === 'undefined' || listeners === 0) return
    if (--listeners > 0) return
    window.removeEventListener('character-storm:phase-cue', handlePhaseCue)
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

  return {
    isSfxMuted,
    sfxVolume,
    unlockSfx: unlockAudio,
    startSfx,
    stopSfx,
    toggleSfxMute,
    playSfx,
    haptic,
  }
}
