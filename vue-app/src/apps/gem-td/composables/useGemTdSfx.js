// ================================================================
//  甜點守衛戰 — 音效引擎（Web Audio 即時合成，不需要任何音檔）
//  模組層級單例：共用同一個 AudioContext 與音量偏好
//  useGemTdSfx()：音量與 playSfx；useGemTdCues()：比對 gt:state / gt:frame 決定何時出聲
//  聲音跟著畫面走：戰鬥音效只播正在看的那張地圖
// ================================================================
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { isSpecial } from '../data/gems.js'

const PREF_KEY = 'gem-td-sfx'
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

  // master → 壓縮器 → 輸出：波次中音效密集，疊加時不爆音
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
const C5 = 523.25, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.5, G6 = 1568

const SOUNDS = {
  // 一般按鈕 / 選取
  click(t) {
    tone(t, { freq: 900, to: 700, dur: 0.05, gain: 0.07, type: 'triangle' })
  },
  // 放下甜點：軟軟的落桌
  place(t) {
    tone(t, { freq: 320, to: 150, dur: 0.1, gain: 0.26 })
    noise(t, { dur: 0.04, gain: 0.1, type: 'lowpass', freq: 1800 })
  },
  // 保留一個甜點
  keep(t) {
    tone(t, { freq: E5, dur: 0.09, gain: 0.1, type: 'triangle' })
    tone(t + 0.08, { freq: A5, dur: 0.16, gain: 0.1, type: 'triangle' })
  },
  // 同級合成：升一階
  merge(t) {
    arpeggio(t, [C5, E5, G5, C6], 0.06, { dur: 0.2, gain: 0.1, type: 'triangle' })
  },
  // 合成特殊塔：琶音加上閃光
  combine(t) {
    noise(t, { dur: 0.3, gain: 0.14, freq: 500, to: 4200, q: 0.9, attack: 0.08 })
    arpeggio(t + 0.14, [C5, E5, G5, C6, E6], 0.07, { dur: 0.3, gain: 0.1, type: 'triangle' })
    chord(t + 0.5, [C6, E6, G6], { dur: 0.7, gain: 0.05 })
    noise(t + 0.5, { dur: 0.5, gain: 0.07, type: 'highpass', freq: 6000, attack: 0.01 })
  },
  // 拆除餅乾牆：酥脆碎裂
  crumble(t) {
    noise(t, { dur: 0.05, gain: 0.26, freq: 2600, q: 1.6 })
    noise(t + 0.05, { dur: 0.04, gain: 0.18, freq: 1900, q: 1.6 })
    noise(t + 0.1, { dur: 0.08, gain: 0.12, freq: 1300, q: 1.2 })
  },
  // 塔跟餅乾牆換位置：滑過去
  swap(t) {
    noise(t, { dur: 0.16, gain: 0.14, freq: 700, to: 2200, q: 1.1, attack: 0.04 })
    tone(t + 0.12, { freq: 300, to: 180, dur: 0.08, gain: 0.18 })
  },
  // 提升品質：金幣聲
  upgrade(t) {
    tone(t, { freq: 1975, dur: 0.09, gain: 0.07, type: 'triangle' })
    tone(t + 0.08, { freq: 2637, dur: 0.3, gain: 0.08, type: 'triangle' })
  },
  // 按下準備
  ready(t) {
    tone(t, { freq: 740, dur: 0.08, gain: 0.1, type: 'triangle' })
    tone(t + 0.09, { freq: 988, dur: 0.16, gain: 0.1, type: 'triangle' })
  },
  // 建造倒數最後 5 秒
  tick(t) {
    tone(t, { freq: 1250, dur: 0.04, gain: 0.1, type: 'triangle' })
  },
  // 操作被伺服器擋下
  error(t) {
    tone(t, { freq: 155, dur: 0.08, gain: 0.14, type: 'square', lp: 700 })
    tone(t + 0.11, { freq: 155, dur: 0.1, gain: 0.14, type: 'square', lp: 700 })
  },
  // 有玩家出局等房間通知
  notice(t) {
    tone(t, { freq: G5, dur: 0.1, gain: 0.08 })
    tone(t + 0.1, { freq: E5, dur: 0.18, gain: 0.08 })
  },
  // 開局
  gameStart(t) {
    arpeggio(t, [G5 / 2, C5, E5, G5], 0.09, { dur: 0.24, gain: 0.1, type: 'triangle' })
    chord(t + 0.36, [C5, E5, G5], { dur: 0.6, gain: 0.05, type: 'triangle' })
  },
  // 開波：蟲群逼近
  waveStart(t) {
    noise(t, { dur: 0.4, gain: 0.18, freq: 280, to: 1800, q: 0.8, attack: 0.12 })
    tone(t + 0.26, { freq: 130.8, to: 98, dur: 0.3, gain: 0.25 })
  },
  // 女王蟻來了：兩記重鼓加低鳴
  bossWave(t) {
    for (const at of [0, 0.34]) {
      tone(t + at, { freq: 150, to: 50, dur: 0.3, gain: 0.45 })
      noise(t + at, { dur: 0.08, gain: 0.16, type: 'lowpass', freq: 1200 })
    }
    tone(t + 0.62, { freq: 110, to: 82, dur: 0.8, gain: 0.14, type: 'sawtooth', lp: 500 })
  },
  // 撐過一波
  waveClear(t) {
    arpeggio(t, [G5, C6, E6], 0.07, { dur: 0.22, gain: 0.08, type: 'triangle' })
  },
  // 塔射擊：很輕的一聲啵，一直響也不吵
  shot(t) {
    const freq = 1100 + Math.random() * 500
    tone(t, { freq, to: freq * 0.6, dur: 0.05, gain: 0.03 })
  },
  // 打死蟲子：啪嘰
  kill(t) {
    const freq = 240 + Math.random() * 120
    tone(t, { freq, to: freq * 2.4, dur: 0.07, gain: 0.11 })
    noise(t, { dur: 0.04, gain: 0.08, freq: 2100, q: 1.2 })
  },
  // 蟲子搬走蛋糕：警示下滑
  leak(t) {
    tone(t, { freq: 440, to: 208, dur: 0.24, gain: 0.13, type: 'sawtooth', lp: 1100 })
  },
  // 自己出局
  out(t) {
    tone(t, { freq: 294, to: 220, dur: 0.3, gain: 0.13, type: 'sawtooth', lp: 1000 })
    tone(t + 0.3, { freq: 208, to: 110, dur: 0.6, gain: 0.13, type: 'sawtooth', lp: 800 })
  },
  // 獲勝：小號角接大和弦
  win(t) {
    tone(t, { freq: G5 / 2, dur: 0.14, gain: 0.1, type: 'square', lp: 2200 })
    tone(t + 0.15, { freq: G5 / 2, dur: 0.1, gain: 0.1, type: 'square', lp: 2200 })
    tone(t + 0.26, { freq: C5, dur: 0.18, gain: 0.1, type: 'square', lp: 2200 })
    chord(t + 0.46, [C5, E5, G5, C6], { dur: 0.9, gain: 0.06, type: 'triangle' })
    noise(t + 0.46, { dur: 0.8, gain: 0.07, type: 'highpass', freq: 5000, attack: 0.01 })
  },
  // 落敗：一路往下
  lose(t) {
    arpeggio(t, [G5 / 2, 349.2, 311.1, 233.1], 0.2, { dur: 0.34, gain: 0.11, type: 'triangle' })
    tone(t + 0.8, { freq: 110, to: 65, dur: 0.7, gain: 0.2 })
  },
}

function unlockAudio() {
  const c = ensureContext()
  if (c && c.state === 'suspended') c.resume().catch(() => {})
}

function playSfx(name, delay = 0) {
  if (isSfxMuted.value) return
  const c = ensureContext()
  if (!c || c.state !== 'running') return
  SOUNDS[name]?.(c.currentTime + 0.005 + delay)
}

let listeners = 0

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

export function useGemTdSfx() {
  return { isSfxMuted, sfxVolume, unlockSfx: unlockAudio, toggleSfxMute, playSfx }
}

// ── 遊戲事件 → 音效 ─────────────────────────────────────────────
const FRAME_MS = 200 // 伺服器 5 幀 / 秒，同一幀的聲音在這段時間內散開，避免整齊地一拍一響
const MAX_SHOTS_PER_FRAME = 2
const MAX_KILLS_PER_FRAME = 3

function phaseCue(next, prev, myId) {
  if (next.phase === 'build') return prev.phase === 'waiting' ? 'gameStart' : 'waveClear'
  if (next.phase === 'wave') return next.nextWave?.type === 'boss' ? 'bossWave' : 'waveStart'
  if (next.phase !== 'finished' || !next.result) return null
  const { versus, win, winnerIds } = next.result
  return (versus && next.me ? winnerIds.includes(myId) : win) ? 'win' : 'lose'
}

// 比對前後兩份 me；一次操作只回一個音效，範圍大的優先（合成也會動到其他塔）
function actionCue(before, after) {
  const was = new Map(before.towers.map(t => [t.id, t]))
  if (after.out && !before.out) return 'out'
  if (after.quality > before.quality) return 'upgrade'
  if (after.towers.some(t => isSpecial(t.kind) && t.kind !== was.get(t.id)?.kind)) return 'combine'
  if (after.towers.some(t => t.level > was.get(t.id)?.level)) return 'merge'
  if (before.fresh.length && !after.fresh.length) return 'keep'
  if (after.towers.length > before.towers.length) return 'place'
  if (after.towers.length < before.towers.length) return 'crumble'
  if (after.gold < before.gold) return 'swap'
  if (after.ready && !before.ready) return 'ready'
  return null
}

function playFrame(next, prev) {
  const shots = Math.min(next.s.length, MAX_SHOTS_PER_FRAME)
  for (let i = 0; i < shots; i++) playSfx('shot', Math.random() * FRAME_MS / 1000)

  // 換視角的第一幀沒有可比對的進度
  if (next.owner !== prev?.owner) return
  const before = prev.players[next.owner]
  const after = next.players[next.owner]
  if (!before || !after) return
  const kills = Math.min(after.killed - before.killed, MAX_KILLS_PER_FRAME)
  for (let i = 0; i < kills; i++) playSfx('kill', i * 0.06)
  if (after.leaked > before.leaked) playSfx('leak')
}

// view / frame / myId / secondsLeft 都是 getter 或 ref，第一份 view（進房、重連）不出聲
export function useGemTdCues({ view, frame, myId, secondsLeft }) {
  onMounted(startSfx)
  onUnmounted(stopSfx)

  watch(view, (next, prev) => {
    if (!next || !prev) return
    if (next.phase !== prev.phase) {
      const cue = phaseCue(next, prev, myId())
      if (cue) playSfx(cue)
      return
    }
    if (!next.me || !prev.me) return
    const cue = actionCue(prev.me, next.me)
    if (cue) playSfx(cue)
  })

  watch(frame, (next, prev) => {
    if (next) playFrame(next, prev)
  })

  watch(secondsLeft, (s) => {
    const me = view()?.me
    if (s >= 1 && s <= 5 && me && !me.ready && !me.out) playSfx('tick')
  })
}
