<template>
    <div ref="wrapRef" class="relative flex h-full w-full items-center justify-center overflow-hidden">
        <canvas ref="canvasRef" class="block touch-none select-none rounded-sm" :class="placing ? 'cursor-crosshair' : 'cursor-default'"
            role="img" aria-label="遊戲地圖"
            @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"
            @pointerleave="hover = null" @wheel.prevent="onWheel" />
        <button v-if="zoom > 1.01" class="gt-chip absolute right-2 bottom-2" @click="resetView">看全圖</button>
    </div>
</template>

<script setup>
// 地圖畫布：只負責畫面與輸入。座標以「格」為單位，格子中心是 (x + .5, y + .5)。
// 手機點一下先預覽、同一格再點一下才放；滑鼠直接放。雙指或滾輪縮放，放大後拖曳平移。
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { GEM_LOOK, MONSTER_LOOK, gemScale, isSpecial, monsterImage, towerImage } from '../data/gems.js'

const props = defineProps({
    view: { type: Object, required: true },
    frame: { type: Object, default: null },
    catalog: { type: Object, default: null },
    myId: { type: String, default: '' },
    pendingGem: { type: Object, default: null }, // 目前要放下的甜點
    selectedId: { type: Number, default: null },
})
const emit = defineEmits(['cell', 'tower', 'clear'])

const wrapRef = ref(null)
const canvasRef = ref(null)
const zoom = ref(1)
const hover = ref(null)
const armed = ref(null) // 手機：第一次點選的格子
const placing = computed(() => !!props.pendingGem)

let ctx = null
let size = 0
let dpr = 1
let panX = 0
let panY = 0
let raf = 0
let observer = null

const COLOR = {
    cloth: '#FFFFFF', tint: '#FBE3E8', cross: '#F5C9D3', ink: '#4A2C2A',
    path: '#D6305A', cookie: '#D9A066', cookieEdge: '#A86B3C', chip: '#6B3F26',
}

// ── 尺寸 ─────────────────────────────────────────────────────────
function resize() {
    const el = wrapRef.value
    const canvas = canvasRef.value
    if (!el || !canvas) return
    size = Math.floor(Math.min(el.clientWidth, el.clientHeight))
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx = canvas.getContext('2d')
    clampPan()
}

function clampPan() {
    const max = size * zoom.value - size
    panX = Math.min(0, Math.max(-max, panX))
    panY = Math.min(0, Math.max(-max, panY))
}

function resetView() {
    zoom.value = 1
    panX = 0
    panY = 0
}

function zoomAt(factor, cx, cy) {
    const next = Math.min(5, Math.max(1, zoom.value * factor))
    const k = next / zoom.value
    panX = cx - (cx - panX) * k
    panY = cy - (cy - panY) * k
    zoom.value = next
    clampPan()
}

// ── 輸入 ─────────────────────────────────────────────────────────
const pointers = new Map()
let dragged = false
let pinchDist = 0

function localPos(e) {
    const r = canvasRef.value.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function cellAt({ x, y }) {
    const w = props.view.board.width
    const cell = (size * zoom.value) / w
    const cx = Math.floor((x - panX) / cell)
    const cy = Math.floor((y - panY) / cell)
    return cx >= 0 && cy >= 0 && cx < w && cy < w ? { x: cx, y: cy } : null
}

function onDown(e) {
    canvasRef.value.setPointerCapture(e.pointerId)
    pointers.set(e.pointerId, { ...localPos(e), startX: e.clientX, startY: e.clientY })
    dragged = false
    if (pointers.size === 2) pinchDist = pinchLength()
}

const pinchLength = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
}

function onMove(e) {
    const pos = localPos(e)
    if (e.pointerType === 'mouse') hover.value = cellAt(pos)
    const p = pointers.get(e.pointerId)
    if (!p) return

    if (pointers.size === 2) {
        p.x = pos.x
        p.y = pos.y
        const [a, b] = [...pointers.values()]
        const dist = pinchLength()
        if (pinchDist > 0) zoomAt(dist / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2)
        pinchDist = dist
        dragged = true
        return
    }

    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 6) dragged = true
    if (dragged) {
        panX += pos.x - p.x
        panY += pos.y - p.y
        clampPan()
    }
    p.x = pos.x
    p.y = pos.y
}

function onUp(e) {
    const wasTap = pointers.size === 1 && !dragged && e.type === 'pointerup'
    const pos = localPos(e)
    pointers.delete(e.pointerId)
    if (wasTap) tap(cellAt(pos), e.pointerType)
}

function tap(cell, pointerType) {
    if (!cell) return
    const tower = props.view.towers.find(t => t.x === cell.x && t.y === cell.y)
    if (tower) {
        armed.value = null
        emit('tower', tower)
        return
    }
    if (!props.pendingGem) {
        emit('clear')
        return
    }
    const confirmed = pointerType === 'mouse' || (armed.value?.x === cell.x && armed.value?.y === cell.y)
    if (confirmed) {
        armed.value = null
        emit('cell', cell.x, cell.y)
    } else {
        armed.value = cell
    }
}

function onWheel(e) {
    const { x, y } = localPos(e)
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y)
}

// ── 蟲子補間（伺服器 5 幀 / 秒）──────────────────────────────────
let prevMap = new Map()
let curMap = new Map()
let curAt = 0
let frameGap = 200
const shots = []

watch(() => props.frame, (frame) => {
    if (!frame) {
        prevMap = new Map()
        curMap = new Map()
        shots.length = 0
        return
    }
    const now = performance.now()
    frameGap = Math.min(600, Math.max(80, now - curAt))
    curAt = now
    prevMap = curMap
    curMap = new Map(frame.m.map(([id, type, x, y, hp, flags]) => [id, { type, x: x / 10, y: y / 10, hp, flags }]))

    const towers = new Map(props.view.towers.map(t => [t.id, t]))
    for (const [towerId, monsterId] of frame.s) {
        const tower = towers.get(towerId)
        if (tower) shots.push({ tower, monsterId, born: now })
    }
}, { flush: 'sync' })

function monsterPos(id, m, t) {
    const prev = prevMap.get(id)
    if (!prev) return m
    return { x: prev.x + (m.x - prev.x) * t, y: prev.y + (m.y - prev.y) * t }
}

// ── 圖片 ─────────────────────────────────────────────────────────
const images = new Map()

function imageOf(url) {
    let img = images.get(url)
    if (!img) {
        img = new Image()
        img.src = url
        images.set(url, img)
    }
    return img.complete && img.naturalWidth ? img : null
}

function drawGem(kind, level, cx, cy, cell, alpha = 1) {
    const special = isSpecial(kind)
    const scale = special ? 1.2 : Math.min(1.15, gemScale(level) * 1.35)
    const drawn = cell * scale
    const img = imageOf(towerImage(kind))
    ctx.globalAlpha = alpha
    if (img) {
        ctx.drawImage(img, cx - drawn / 2, cy - drawn / 2, drawn, drawn)
    } else {
        ctx.fillStyle = GEM_LOOK[kind].color
        ctx.beginPath()
        ctx.arc(cx, cy, drawn / 2.4, 0, Math.PI * 2)
        ctx.fill()
    }
    ctx.globalAlpha = 1
}

function statsOf(kind, level) {
    const c = props.catalog
    if (!c) return null
    return isSpecial(kind) ? c.specials[kind]?.stats : c.gems[kind]?.levels[level - 1]
}

function drawRange(kind, level, cx, cy, cell, color) {
    const stats = statsOf(kind, level)
    if (!stats) return
    ctx.beginPath()
    ctx.arc(cx, cy, stats.range * cell, 0, Math.PI * 2)
    ctx.fillStyle = `${color}14`
    ctx.fill()
    ctx.strokeStyle = `${color}99`
    ctx.lineWidth = Math.max(1, cell * 0.05)
    ctx.stroke()
}

// ── 繪製 ─────────────────────────────────────────────────────────
function drawBoard(view, cell) {
    const { board, path } = view
    // 格紋桌布：直條與橫條交疊處最深
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            ctx.fillStyle = [COLOR.cloth, COLOR.tint, COLOR.cross][(x % 2) + (y % 2)]
            ctx.fillRect(x * cell, y * cell, cell + 0.5, cell + 0.5)
        }
    }

    if (path.length > 1) {
        ctx.beginPath()
        path.forEach((p, i) => {
            const px = (p.x + 0.5) * cell
            const py = (p.y + 0.5) * cell
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
        })
        ctx.strokeStyle = 'rgba(214,48,90,0.45)'
        ctx.lineWidth = cell * 0.16
        ctx.lineJoin = 'round'
        ctx.stroke()
    }

    const stops = [
        { p: board.start, label: '入', color: '#2E9E5B' },
        ...board.checkpoints.map((p, i) => ({ p, label: String(i + 1), color: COLOR.path })),
        { p: board.end, label: '出', color: '#4A2C2A' },
    ]
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const { p, label, color } of stops) {
        const cx = (p.x + 0.5) * cell
        const cy = (p.y + 0.5) * cell
        ctx.beginPath()
        ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
        ctx.fillStyle = '#FFFFFF'
        ctx.font = `700 ${cell * 0.68}px 'Noto Sans TC', sans-serif`
        ctx.fillText(label, cx, cy + cell * 0.04)
    }
}

// 餅乾牆：取代原版的石頭，程式畫的，不必另外載圖
function drawCookie(x, y, cell) {
    const inset = cell * 0.05
    const size = cell - inset * 2
    ctx.fillStyle = COLOR.cookieEdge
    ctx.fillRect(x + inset, y + inset, size, size)
    ctx.fillStyle = COLOR.cookie
    ctx.fillRect(x + inset * 2, y + inset * 2, size - inset * 2, size - inset * 2)
    ctx.fillStyle = COLOR.chip
    for (const [dx, dy] of [[0.3, 0.32], [0.68, 0.42], [0.42, 0.7]]) {
        ctx.fillRect(x + cell * dx - cell * 0.05, y + cell * dy - cell * 0.05, cell * 0.1, cell * 0.1)
    }
}

function drawTowers(view, cell, now) {
    for (const t of view.towers) {
        const x = t.x * cell
        const y = t.y * cell
        const cx = x + cell / 2
        const cy = y + cell / 2
        if (t.kind === 'stone') {
            drawCookie(x, y, cell)
            continue
        }
        if (t.fresh && t.owner === props.myId) {
            ctx.strokeStyle = COLOR.path
            ctx.globalAlpha = 0.45 + 0.35 * Math.sin(now / 260)
            ctx.lineWidth = Math.max(1, cell * 0.07)
            ctx.strokeRect(x + cell * 0.05, y + cell * 0.05, cell * 0.9, cell * 0.9)
            ctx.globalAlpha = 1
        }
        drawGem(t.kind, t.level, cx, cy, cell)
        if (zoom.value * cell >= 22 && !isSpecial(t.kind)) {
            const badge = cell * 0.2
            const bx = x + badge
            const by = y + cell - badge
            ctx.fillStyle = COLOR.ink
            ctx.beginPath()
            ctx.arc(bx, by, badge, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#FFFFFF'
            ctx.font = `700 ${cell * 0.3}px 'Noto Sans TC', sans-serif`
            ctx.fillText(String(t.level), bx, by + cell * 0.01)
        }
    }
}

function drawMonsters(cell, now) {
    if (!curMap.size) return
    const t = Math.min(1, (now - curAt) / frameGap)
    const types = props.catalog?.monsters ?? []
    for (const [id, m] of curMap) {
        const pos = monsterPos(id, m, t)
        const cx = (pos.x + 0.5) * cell
        const cy = (pos.y + 0.5) * cell
        const type = types[m.type]?.id ?? 'normal'
        const look = MONSTER_LOOK[type]
        const r = cell * look.size

        ctx.fillStyle = 'rgba(74,44,42,0.22)'
        ctx.beginPath()
        ctx.ellipse(cx, cy + r * 0.8, r, r * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()

        const img = imageOf(monsterImage(type))
        if (img) {
            ctx.drawImage(img, cx - r * 1.25, cy - r * 1.25, r * 2.5, r * 2.5)
        } else {
            ctx.fillStyle = look.color
            ctx.beginPath()
            ctx.arc(cx, cy, r, 0, Math.PI * 2)
            ctx.fill()
        }
        if (m.flags & 1) {
            ctx.strokeStyle = '#2F7FD1'
            ctx.lineWidth = Math.max(1, cell * 0.08)
            ctx.beginPath()
            ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2)
            ctx.stroke()
        }
        if (m.flags & 2) {
            ctx.fillStyle = '#2E9E5B'
            ctx.beginPath()
            ctx.arc(cx + r * 0.9, cy - r * 0.9, r * 0.28, 0, Math.PI * 2)
            ctx.fill()
        }

        const traitId = props.catalog?.traitIds.find((_, i) => m.flags & (4 << i))
        if (traitId) {
            ctx.strokeStyle = props.catalog.traits[traitId].color
            ctx.lineWidth = Math.max(1, cell * 0.06)
            ctx.setLineDash([cell * 0.14, cell * 0.1])
            ctx.beginPath()
            ctx.arc(cx, cy, r * 1.32, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
        }

        const w = Math.max(cell * 0.8, r * 2)
        const h = Math.max(1.5, cell * 0.11)
        const by = cy - r - h * 2.2
        ctx.fillStyle = COLOR.ink
        ctx.fillRect(cx - w / 2, by, w, h)
        ctx.fillStyle = m.hp > 50 ? '#3CCB72' : m.hp > 25 ? '#F2B233' : '#F0506E'
        ctx.fillRect(cx - w / 2, by, (w * m.hp) / 100, h)
    }
}

function drawShots(cell, now) {
    const LIFE = 170
    const t = Math.min(1, (now - curAt) / frameGap)
    for (let i = shots.length - 1; i >= 0; i--) {
        const shot = shots[i]
        const age = now - shot.born
        const target = curMap.get(shot.monsterId)
        if (age > LIFE || !target) {
            shots.splice(i, 1)
            continue
        }
        const pos = monsterPos(shot.monsterId, target, t)
        ctx.globalAlpha = 1 - age / LIFE
        ctx.strokeStyle = GEM_LOOK[shot.tower.kind]?.color ?? COLOR.ink
        ctx.lineWidth = Math.max(1, cell * 0.09)
        ctx.beginPath()
        ctx.moveTo((shot.tower.x + 0.5) * cell, (shot.tower.y + 0.5) * cell)
        ctx.lineTo((pos.x + 0.5) * cell, (pos.y + 0.5) * cell)
        ctx.stroke()
        ctx.globalAlpha = 1
    }
}

function drawOverlays(view, cell) {
    const selected = view.towers.find(t => t.id === props.selectedId)
    if (selected) {
        const cx = (selected.x + 0.5) * cell
        const cy = (selected.y + 0.5) * cell
        if (selected.kind !== 'stone') drawRange(selected.kind, selected.level, cx, cy, cell, '#4A2C2A')
        ctx.strokeStyle = COLOR.path
        ctx.lineWidth = Math.max(1.5, cell * 0.1)
        ctx.strokeRect(selected.x * cell, selected.y * cell, cell, cell)
    }

    const ghost = armed.value ?? hover.value
    const gem = props.pendingGem
    if (gem && ghost && !view.towers.some(t => t.x === ghost.x && t.y === ghost.y)) {
        const cx = (ghost.x + 0.5) * cell
        const cy = (ghost.y + 0.5) * cell
        drawRange(gem.kind, gem.level, cx, cy, cell, GEM_LOOK[gem.kind].color)
        drawGem(gem.kind, gem.level, cx, cy, cell, 0.75)
    }
}

function draw(now) {
    raf = requestAnimationFrame(draw)
    const view = props.view
    if (!ctx || !size || !view?.board) return
    const cell = size / view.board.width

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    ctx.setTransform(dpr * zoom.value, 0, 0, dpr * zoom.value, dpr * panX, dpr * panY)

    drawBoard(view, cell)
    drawTowers(view, cell, now)
    drawShots(cell, now)
    drawMonsters(cell, now)
    drawOverlays(view, cell)
}

watch(() => props.pendingGem, () => { armed.value = null })

onMounted(() => {
    resize()
    observer = new ResizeObserver(resize)
    observer.observe(wrapRef.value)
    raf = requestAnimationFrame(draw)
})

onUnmounted(() => {
    cancelAnimationFrame(raf)
    observer?.disconnect()
})
</script>
