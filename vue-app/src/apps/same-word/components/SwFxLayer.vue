<template>
    <canvas ref="canvasRef" class="pointer-events-none fixed inset-0 z-30 h-full w-full" aria-hidden="true"></canvas>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { drawFx, hasLive, clearFx } from '../composables/useSwFx.js'

const canvasRef = ref(null)
let ctx = null
let raf = 0
let last = 0
let w = 0
let h = 0
let dpr = 1

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
}

// 沒有特效時不跑 rAF；有新特效進來時由 wake() 重新啟動
function frame(t) {
    const dt = Math.min((t - last) / 1000, 0.05)
    last = t
    ctx.clearRect(0, 0, w, h)
    if (hasLive()) {
        drawFx(ctx, w, h, dt)
        raf = requestAnimationFrame(frame)
    } else {
        raf = 0
    }
}
function wake() {
    if (raf || document.hidden) return
    last = performance.now()
    raf = requestAnimationFrame(frame)
}

// 特效是延遲放進佇列的，所以用低頻檢查來喚醒 rAF（閒置時幾乎沒有成本）
let poll = 0
onMounted(() => {
    resize()
    window.addEventListener('resize', resize)
    poll = setInterval(() => { if (hasLive()) wake() }, 120)
})
onUnmounted(() => {
    clearInterval(poll)
    window.removeEventListener('resize', resize)
    cancelAnimationFrame(raf)
    clearFx()
})
</script>
