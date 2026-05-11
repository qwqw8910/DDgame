import { ref } from 'vue'

const CUE_PATTERNS = {
  'phase-round1-start': [
    { freq: 554, duration: 0.07, type: 'triangle', delay: 0, gain: 0.04 },
    { freq: 659, duration: 0.08, type: 'triangle', delay: 0.08, gain: 0.04 },
  ],
  'phase-round1-answer': [
    { freq: 740, duration: 0.06, type: 'sine', delay: 0, gain: 0.032 },
    { freq: 587, duration: 0.06, type: 'sine', delay: 0.07, gain: 0.03 },
  ],
  'phase-round2-start': [
    { freq: 659, duration: 0.07, type: 'triangle', delay: 0, gain: 0.04 },
    { freq: 831, duration: 0.08, type: 'triangle', delay: 0.08, gain: 0.042 },
  ],
  'phase-round2-answer': [
    { freq: 831, duration: 0.06, type: 'sine', delay: 0, gain: 0.032 },
    { freq: 698, duration: 0.06, type: 'sine', delay: 0.07, gain: 0.03 },
  ],
  'phase-reveal': [
    { freq: 523, duration: 0.08, type: 'triangle', delay: 0, gain: 0.04 },
    { freq: 659, duration: 0.08, type: 'triangle', delay: 0.09, gain: 0.04 },
    { freq: 988, duration: 0.1, type: 'triangle', delay: 0.18, gain: 0.045 },
  ],
  'phase-finished': [
    { freq: 494, duration: 0.09, type: 'sine', delay: 0, gain: 0.038 },
    { freq: 659, duration: 0.1, type: 'sine', delay: 0.11, gain: 0.038 },
    { freq: 784, duration: 0.12, type: 'triangle', delay: 0.23, gain: 0.042 },
  ],
}

function createAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioCtx = window.AudioContext || window.webkitAudioContext
  return AudioCtx ? new AudioCtx() : null
}

export function useCharacterStormSfx() {
  const isSfxMuted = ref(false)

  let audioContext = null
  let isStarted = false

  function ensureAudioContext() {
    if (!audioContext) audioContext = createAudioContext()
    return audioContext
  }

  function unlockAudio() {
    const ctx = ensureAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }
  }

  function playTone(step) {
    const ctx = ensureAudioContext()
    if (!ctx || isSfxMuted.value) return
    if (ctx.state !== 'running') return

    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    const startAt = ctx.currentTime + (step.delay || 0)
    const duration = step.duration || 0.08
    const gain = step.gain || 0.03

    oscillator.type = step.type || 'sine'
    oscillator.frequency.setValueAtTime(step.freq || 440, startAt)

    gainNode.gain.setValueAtTime(0.0001, startAt)
    gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.015)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.start(startAt)
    oscillator.stop(startAt + duration + 0.02)
  }

  function playCue(cue) {
    const pattern = CUE_PATTERNS[cue]
    if (!pattern?.length) return
    pattern.forEach(playTone)
  }

  function handlePhaseCue(event) {
    const cue = event?.detail?.cue
    if (!cue) return
    playCue(cue)
  }

  function startSfx() {
    if (typeof window === 'undefined' || isStarted) return
    isStarted = true
    unlockAudio()

    window.addEventListener('character-storm:phase-cue', handlePhaseCue)
    window.addEventListener('pointerdown', unlockAudio, { passive: true })
    window.addEventListener('keydown', unlockAudio)
  }

  function stopSfx() {
    if (typeof window === 'undefined' || !isStarted) return
    isStarted = false

    window.removeEventListener('character-storm:phase-cue', handlePhaseCue)
    window.removeEventListener('pointerdown', unlockAudio)
    window.removeEventListener('keydown', unlockAudio)
  }

  function toggleSfxMute() {
    isSfxMuted.value = !isSfxMuted.value
    return isSfxMuted.value
  }

  return {
    isSfxMuted,
    startSfx,
    stopSfx,
    toggleSfxMute,
  }
}
