<template>
    <div class="sw-ambient pointer-events-none fixed inset-0 z-0 overflow-hidden" :data-mood="mood" aria-hidden="true">
        <i class="sw-blob sw-blob-a"></i>
        <i class="sw-blob sw-blob-b"></i>
        <i class="sw-blob sw-blob-c"></i>
        <canvas ref="canvasRef" class="absolute inset-0 h-full w-full"></canvas>
        <i class="sw-vignette"></i>
    </div>
</template>

<script setup>
// 氛圍背景：三團緩慢漂移的色光 + 螢火蟲粒子 + 暈影。
// mood 控制色調與速度：calm（書寫／大廳）、warm（揭曉）、party（結算）。
// 使用者偏好減少動態時只留靜態色光，不跑 rAF；分頁隱藏時暫停。
import { ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({ mood: { type: String, default: 'calm' } })

const canvasRef = ref(null)
const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// 各 mood 的粒子色（HSL 色相）與速度倍率
const MOODS = {
    calm:  { hues: [265, 190, 320], speed: 1 },
    warm:  { hues: [340, 20, 300], speed: 1.4 },
    party: { hues: [340, 45, 190, 280], speed: 2 },
}

let ctx = null
let raf = 0
let last = 0
let w = 0
let h = 0
let dpr = 1
let parts = []

function makePart(initial) {
    const hues = MOODS[props.mood].hues
    return {
        x: Math.random() * w,
        y: initial ? Math.random() * h : h + 10,
        r: 1 + Math.random() * 2.4,
        vy: 8 + Math.random() * 18,
        sway: 10 + Math.random() * 24,
        phase: Math.random() * Math.PI * 2,
        tw: 0.6 + Math.random() * 1.4,
        hue: hues[Math.floor(Math.random() * hues.length)],
    }
}

function resize() {
    const c = canvasRef.value
    if (!c) return
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    w = window.innerWidth
    h = window.innerHeight
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
    ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    // 粒子數隨畫面面積調整，手機較少
    const n = Math.round(Math.min(48, Math.max(18, (w * h) / 26000)))
    parts = Array.from({ length: n }, () => makePart(true))
}

function frame(t) {
    const dt = Math.min((t - last) / 1000, 0.05)
    last = t
    const speed = MOODS[props.mood].speed
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < parts.length; i++) {
        const p = parts[i]
        p.y -= p.vy * speed * dt
        p.phase += dt * p.tw
        if (p.y < -10) { parts[i] = makePart(false); continue }
        const x = p.x + Math.sin(p.phase) * p.sway
        const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase * 2.3))
        const g = ctx.createRadialGradient(x, p.y, 0, x, p.y, p.r * 6)
        g.addColorStop(0, `hsla(${p.hue}, 90%, 75%, ${a})`)
        g.addColorStop(1, `hsla(${p.hue}, 90%, 60%, 0)`)
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, p.y, p.r * 6, 0, Math.PI * 2)
        ctx.fill()
    }
    raf = requestAnimationFrame(frame)
}

function start() {
    if (raf || reduced || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
}
function stop() {
    cancelAnimationFrame(raf)
    raf = 0
}
function onVisibility() { document.hidden ? stop() : start() }

// mood 切換時把現有粒子漸漸換色（下次重生時套用新色，並立刻換掉一半）
watch(() => props.mood, () => {
    parts = parts.map((p, i) => (i % 2 ? p : { ...makePart(true), y: p.y }))
})

onMounted(() => {
    resize()
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVisibility)
    start()
})
onUnmounted(() => {
    stop()
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<style scoped>
.sw-blob {
    position: absolute;
    width: 60vmax;
    height: 60vmax;
    border-radius: 50%;
    filter: blur(70px);
    opacity: .35;
    transition: background 1.6s ease, opacity 1.6s ease;
    will-change: transform;
}
.sw-blob-a { top: -25vmax; left: -15vmax; background: #8b5cf6; animation: sw-drift-a 26s ease-in-out infinite alternate; }
.sw-blob-b { bottom: -30vmax; right: -20vmax; background: #e11d48; animation: sw-drift-b 32s ease-in-out infinite alternate; }
.sw-blob-c { top: 30%; left: 35%; width: 40vmax; height: 40vmax; background: #06b6d4; opacity: .18; animation: sw-drift-c 38s ease-in-out infinite alternate; }

[data-mood='warm'] .sw-blob-a { background: #e11d48; }
[data-mood='warm'] .sw-blob-b { background: #f59e0b; opacity: .3; }
[data-mood='warm'] .sw-blob-c { background: #ec4899; opacity: .22; }
[data-mood='party'] .sw-blob-a { background: #f43f5e; opacity: .42; }
[data-mood='party'] .sw-blob-b { background: #fbbf24; opacity: .34; }
[data-mood='party'] .sw-blob-c { background: #8b5cf6; opacity: .28; }

.sw-vignette {
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, transparent 45%, rgba(5, 5, 15, .65) 100%);
}

:global([data-theme='light']) .sw-vignette { display: none; }
:global([data-theme='light']) .sw-blob { opacity: .18; }

@keyframes sw-drift-a { to { transform: translate(18vmax, 12vmax) scale(1.15); } }
@keyframes sw-drift-b { to { transform: translate(-16vmax, -14vmax) scale(.9); } }
@keyframes sw-drift-c { to { transform: translate(-12vmax, 10vmax) scale(1.25); } }

@media (prefers-reduced-motion: reduce) {
    .sw-blob { animation: none; }
}
</style>
