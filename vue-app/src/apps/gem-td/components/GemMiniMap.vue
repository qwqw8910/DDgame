<template>
    <canvas ref="canvasRef" class="gt-minimap block cursor-pointer touch-none select-none rounded-sm border border-(--gt-line) bg-(--gt-surface) shadow-(--gt-shadow)"
        :style="{ width: `${SIZE}px`, height: `${SIZE}px` }" role="img" aria-label="小地圖：點擊或拖曳跳到該位置"
        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" />
</template>

<script setup>
// 合作迷宮的小地圖：整張地圖縮成一小塊，畫路線、塔（依擁有者上色）、蟲子與主畫面目前看到的範圍。
// 點擊或拖曳 → 發出 goto { x, y }（格座標，可有小數），由 GemBoard 的相機跳過去。
import { ref, watch, onMounted, onUnmounted } from 'vue'

const SIZE = 148
const props = defineProps({
    view: { type: Object, required: true },
    frame: { type: Object, default: null },
    colors: { type: Object, default: null }, // 玩家 id → 顏色
    viewport: { type: Object, default: () => ({ x: 0, y: 0, w: 1, h: 1 }) }, // 主畫面看到的範圍（格）
})
const emit = defineEmits(['goto'])

const canvasRef = ref(null)
let dragging = false
let dpr = 1

const scaleOf = () => SIZE / Math.max(props.view.board.width, props.view.board.height)

function draw() {
    const canvas = canvasRef.value
    const board = props.view.board
    if (!canvas || !board) return
    const ctx = canvas.getContext('2d')
    const k = scaleOf()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.fillStyle = '#FBE3E8'
    ctx.fillRect(0, 0, board.width * k, board.height * k)

    const path = props.view.path ?? []
    if (path.length > 1) {
        ctx.beginPath()
        path.forEach((p, i) => (i ? ctx.lineTo((p.x + 0.5) * k, (p.y + 0.5) * k) : ctx.moveTo((p.x + 0.5) * k, (p.y + 0.5) * k)))
        ctx.strokeStyle = 'rgba(214,48,90,0.55)'
        ctx.lineWidth = Math.max(1, k * 0.6)
        ctx.lineJoin = 'round'
        ctx.stroke()
    }

    const dot = Math.max(2, k * 0.95)
    for (const t of props.view.towers) {
        ctx.fillStyle = t.kind === 'stone' ? '#C9955C' : props.colors?.[t.owner] ?? '#4A2C2A'
        ctx.fillRect(t.x * k + (k - dot) / 2, t.y * k + (k - dot) / 2, dot, dot)
    }

    for (const p of [board.start, board.end]) {
        ctx.fillStyle = p === board.start ? '#2E9E5B' : '#E8541E'
        ctx.beginPath()
        ctx.arc((p.x + 0.5) * k, (p.y + 0.5) * k, Math.max(3, k * 0.9), 0, Math.PI * 2)
        ctx.fill()
    }

    if (props.frame?.m) {
        ctx.fillStyle = '#1F1A1A'
        for (const m of props.frame.m) ctx.fillRect((m[2] / 10 + 0.5) * k - 1, (m[3] / 10 + 0.5) * k - 1, 2.5, 2.5)
    }

    const v = props.viewport
    ctx.strokeStyle = '#4A2C2A'
    ctx.lineWidth = 1.5
    ctx.strokeRect(v.x * k + 0.75, v.y * k + 0.75, Math.max(2, v.w * k - 1.5), Math.max(2, v.h * k - 1.5))
}

function emitGoto(e) {
    const r = canvasRef.value.getBoundingClientRect()
    const k = scaleOf()
    emit('goto', { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k })
}
function onDown(e) {
    dragging = true
    canvasRef.value.setPointerCapture(e.pointerId)
    emitGoto(e)
}
function onMove(e) { if (dragging) emitGoto(e) }
function onUp() { dragging = false }

let queued = 0
function schedule() {
    if (queued) return
    queued = requestAnimationFrame(() => { queued = 0; draw() })
}

watch([() => props.view, () => props.frame, () => props.viewport, () => props.colors], schedule)

onMounted(() => {
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    const canvas = canvasRef.value
    canvas.width = SIZE * dpr
    canvas.height = SIZE * dpr
    draw()
})
onUnmounted(() => cancelAnimationFrame(queued))
</script>
