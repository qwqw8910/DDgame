<template>
    <canvas ref="canvasRef" class="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
</template>

<script setup>
// 一般模式的桌面擺設：畫在地圖後面（地圖是桌上的烤盤）。位置用畫面比例，大小跟著短邊走，只在大小改變時重畫一次。
import { ref, onMounted, onUnmounted } from 'vue'
import { drawTableProp } from '../data/tableware.js'

const canvasRef = ref(null)
let observer = null

// [種類, x 比例, y 比例, 大小（短邊的幾分之幾）, 旋轉]
const ITEMS = [
    ['plate', 0.07, 0.1, 0.07], ['fork', 0.14, 0.1, 0.026, 0.08], ['knife', 0.172, 0.1, 0.026, -0.06],
    ['bowl', 0.07, 0.4, 0.085], ['mug', 0.06, 0.66, 0.04], ['cookie', 0.13, 0.55, 0.026], ['cookie', 0.155, 0.585, 0.02],
    ['tin', 0.1, 0.9, 0.022], ['pin', 0.3, 0.965, 0.026, 0.03],
    ['plate', 0.93, 0.09, 0.07], ['spoon', 0.86, 0.1, 0.026, 0.05], ['jar', 0.94, 0.36, 0.04], ['whisk', 0.58, 0.035, 0.03, 0.5],
    ['bowl', 0.93, 0.66, 0.075], ['mug', 0.9, 0.9, 0.04], ['cookie', 0.84, 0.82, 0.026], ['plate', 0.72, 0.96, 0.05], ['fork', 0.665, 0.96, 0.022, 1.45],
    ['mug', 0.4, 0.035, 0.032], ['cookie', 0.28, 0.04, 0.02], ['jar', 0.5, 0.965, 0.04],
]
const SPRINKLES = ['#FF6B86', '#FFD166', '#6FE0A9', '#7F9BF0', '#FFFFFF']

function paint() {
    const cv = canvasRef.value
    if (!cv) return
    const r = cv.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    cv.width = Math.round(r.width * dpr)
    cv.height = Math.round(r.height * dpr)
    const c = cv.getContext('2d')
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, r.width, r.height)
    if (r.width < 520 || r.height < 360) return
    const u = Math.min(r.width, r.height)
    // 糖粒（固定的偽隨機）
    let a = 7
    const rnd = () => { a = (a * 16807) % 2147483647; return a / 2147483647 }
    for (let i = 0; i < 90; i++) {
        c.save(); c.translate(rnd() * r.width, rnd() * r.height); c.rotate(rnd() * 3)
        c.fillStyle = SPRINKLES[i % 5]; c.fillRect(-4, -1.2, 8, 2.4); c.restore()
    }
    for (const [kind, x, y, s, rot] of ITEMS) drawTableProp(c, dpr, kind, x * r.width, y * r.height, s * u, rot ?? 0)
}

onMounted(() => {
    paint()
    observer = new ResizeObserver(paint)
    observer.observe(canvasRef.value)
})
onUnmounted(() => observer?.disconnect())
</script>
