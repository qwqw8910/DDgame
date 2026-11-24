<template>
    <div ref="wrapRef" class="relative flex h-full w-full items-center justify-center overflow-hidden">
        <GemTableDecor />
        <canvas ref="canvasRef" class="relative block touch-none select-none max-sm:rounded-none rounded-sm" :class="placing ? 'cursor-crosshair' : 'cursor-default'"
            role="img" aria-label="遊戲地圖"
            @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"
            @pointerleave="hover = null" @wheel.prevent="onWheel" />
        <!-- 縮放：滾輪、雙指也可以；放大後拖曳平移 -->
        <div class="absolute top-2 right-2 flex flex-col gap-1" role="group" aria-label="地圖縮放">
            <button class="gt-chip !min-h-10 !w-10 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!w-11 justify-center !px-0 text-xl font-bold" aria-label="放大地圖" title="放大" :disabled="zoom >= 5" @click="zoomBy(1.4)">＋</button>
            <button class="gt-chip !min-h-10 !w-10 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!w-11 justify-center !px-0 text-xl font-bold" aria-label="縮小地圖" title="縮小" :disabled="zoom <= 1.01" @click="zoomBy(1 / 1.4)">－</button>
        </div>
        <button v-if="zoom > 1.01" class="gt-chip absolute right-2 bottom-2" @click="resetView">看全圖</button>
        <!-- 多人：切換看誰的地圖（一次只畫一張，其他人的地圖不吃效能） -->
        <template v-if="(view.playerIds?.length ?? 0) > 1">
            <button class="gt-chip absolute top-1/2 left-2 !min-h-12 !w-10 -translate-y-1/2 justify-center !px-0 text-xl font-bold opacity-90 [@media(pointer:coarse)]:!w-11" aria-label="看上一位玩家的地圖" title="上一位玩家" @click="emit('step', -1)">‹</button>
            <button class="gt-chip absolute top-1/2 right-14 !min-h-12 !w-10 -translate-y-1/2 justify-center !px-0 text-xl font-bold opacity-90 [@media(pointer:coarse)]:!w-11" aria-label="看下一位玩家的地圖" title="下一位玩家" @click="emit('step', 1)">›</button>
        </template>
    </div>
</template>

<script setup>
// 地圖畫布：只負責畫面與輸入。座標以「格」為單位，格子中心是 (x + .5, y + .5)。
// 手機點一下先預覽、同一格再點一下才放；滑鼠直接放。雙指或滾輪縮放，放大後拖曳平移。
import { ref, computed, watch, onMounted, onUnmounted, toRaw } from 'vue'
import { CAKE_IMAGE, CHECKPOINT_IMAGE, NEST_IMAGE, GEM_LOOK, MONSTER_LOOK, gemScale, isSpecial, monsterImage, towerImage } from '../data/gems.js'
import { fullPathLength } from '../data/pathing.js'
import GemTableDecor from './GemTableDecor.vue'
import { spawnHit, spawnDeath, clearFx, drawFx, hasFx } from '../composables/usePixelFx.js'

const props = defineProps({
    view: { type: Object, required: true },
    frame: { type: Object, default: null },
    catalog: { type: Object, default: null },
    myId: { type: String, default: '' },
    pendingGem: { type: Object, default: null }, // 目前要放下的甜點
    selectedId: { type: Number, default: null },
    highlightIds: { type: Array, default: () => [] }, // 合成選位置：可以選的材料塔
})
const emit = defineEmits(['cell', 'tower', 'clear', 'arm', 'step'])

const wrapRef = ref(null)
const canvasRef = ref(null)
const zoom = ref(1)
const hover = ref(null)
const armed = ref(null) // 手機：第一次點選的格子
const placing = computed(() => !!props.pendingGem)
// 預覽中的格子交給外面（底部操作列顯示「放在這裡」）；放下一顆、或回合結束就不再預覽
watch(armed, c => emit('arm', c ? { x: c.x, y: c.y } : null))
watch(() => [props.view.phase, props.view.me?.pending?.length ?? 0, props.view.watching], () => { armed.value = null })
defineExpose({ disarm: () => { armed.value = null } })

let ctx = null
let size = 0
let dpr = 1
let panX = 0
let panY = 0
let raf = 0
let observer = null
// 畫面沒有動態（建造中、沒有特效）時只在有變化才重畫，不必每秒畫 60 次
let dirty = true
const invalidate = () => { dirty = true }

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
    invalidate()
}

function clampPan() {
    const max = size * zoom.value - size
    panX = Math.min(0, Math.max(-max, panX))
    panY = Math.min(0, Math.max(-max, panY))
    invalidate()
}

function resetView() {
    zoom.value = 1
    panX = 0
    panY = 0
    invalidate()
}

function zoomBy(factor) { zoomAt(factor, size / 2, size / 2) }

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
const facing = new Map() // 怪物 id → 是否面向右（用於水平翻轉）
// 走路動畫參數：period 越小越快；hop 彈跳高度（× 半徑）；sway 搖擺弧度；float 為飛行（漂浮不壓扁）；
// flip 為 false 表示圖片是正面、不需要依方向翻轉
const WALK = {
    normal: { period: 85, hop: 0.14, sway: 0.1, flip: true },
    armored: { period: 130, hop: 0.07, sway: 0.05, flip: true },
    fast: { period: 55, hop: 0.1, sway: 0.12, flip: true },
    swarm: { period: 75, hop: 0.1, sway: 0.08, flip: true },
    air: { period: 160, hop: 0.2, sway: 0.07, flip: true, float: true },
    boss: { period: 120, hop: 0.07, sway: 0.04, flip: true },
    titan: { period: 170, hop: 0.05, sway: 0.03, flip: false },
}

// ── 打擊感（Juice）：受擊閃白、暴擊數字、螢幕震動 ───────────────
const FLASH_MS = 90
const POP_MS = 700
const MAX_POPS = 24
const MAX_GHOSTS = 30 // 同時播放的輕量退場上限
const MAX_BURSTS = 4 // 同一幀最多幾個 pixelfx 爆點
const GHOST_MS = 280
const ghosts = [] // 輕量退場 { type, x, y, born }
const flashes = new Map() // monsterId → 閃白結束時間
const pops = [] // 傷害數字 { x, y, text, born, big }
let shakeAmp = 0 // 格；每幀衰減
const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

function shake(amount) {
    if (!reducedMotion) shakeAmp = Math.min(0.5, Math.max(shakeAmp, amount))
}

// ── 主動技能特效：全圖染色＋擴散光環＋粒子（frame.sk 的冷卻突然增加＝有人施放）──
const SKILL_FX_MS = 1100
const SKILL_FX = {
    freeze: { tint: '#9BD8FF', ring: '#E6F6FF', spark: '#FFFFFF' },
    stun: { tint: '#FFD25A', ring: '#FFF1B8', spark: '#FFB300' },
}
const skillFx = [] // { id, born }
let prevSk = null

function playSkillFx(id) {
    skillFx.push({ id, born: performance.now() })
    if (id === 'stun') shake(0.28)
}

function resetJuice() {
    skillFx.length = 0
    prevSk = null
    flashes.clear()
    pops.length = 0
    ghosts.length = 0
    shakeAmp = 0
}

watch(() => props.frame, (frame) => {
    if (!frame) {
        prevMap = new Map()
        curMap = new Map()
        shots.length = 0
        facing.clear()
        resetJuice()
        clearFx()
        return
    }
    const sk = frame.sk
    if (sk && prevSk) sk.forEach((v, i) => { if (v > prevSk[i]) playSkillFx(i === 0 ? 'freeze' : 'stun') })
    prevSk = sk ? [...sk] : null
    const now = performance.now()
    frameGap = Math.min(600, Math.max(80, now - curAt))
    curAt = now
    prevMap = curMap
    curMap = new Map(frame.m.map(([id, type, x, y, hp, flags]) => [id, { type, x: x / 10, y: y / 10, hp, flags }]))

    // 消失的蟲子：離出口夠遠就是被打死的，放爆點（走到出口的不算）
    const view = toRaw(props.view)
    const end = view.board?.end
    let bursts = 0
    for (const [id, m] of prevMap) {
        if (curMap.has(id)) continue
        flashes.delete(id)
        facing.delete(id)
        const reachedEnd = end && Math.hypot(m.x - end.x, m.y - end.y) <= 1.5
        if (!reachedEnd) {
            const type = catalogRaw()?.monsters?.[m.type]?.id ?? 'normal'
            const big = type === 'boss' || type === 'titan'
            // 退場分級：大怪與甲蟲才用 pixelfx 爆點（同一幀最多 MAX_BURSTS 個），
            // 其餘走便宜的 canvas 小動畫；偏好減少動態時一律不播
            if (!reducedMotion) {
                if (big || (type === 'armored' && bursts < MAX_BURSTS)) {
                    spawnDeath(m.x, m.y)
                    bursts++
                } else {
                    if (ghosts.length >= MAX_GHOSTS) ghosts.shift()
                    ghosts.push({ type, x: m.x, y: m.y, born: now })
                }
            }
            // 大型怪倒下要有份量
            if (big) shake(0.3)
        } else {
            shake(0.22) // 蟲子搬走蛋糕
        }
    }

    const towers = new Map(view.towers.map(t => [t.id, t]))
    for (const [towerId, monsterId, crit, dealt] of frame.s) {
        const tower = towers.get(towerId)
        if (!tower) continue
        shots.push({ tower, monsterId, born: now })
        // 這一幀就被打死的蟲子已不在 curMap，退回用上一幀的位置
        const target = curMap.get(monsterId) ?? prevMap.get(monsterId)
        if (!target) continue
        flashes.set(monsterId, now + FLASH_MS)
        spawnHit(target.x, target.y, Math.atan2(target.y - tower.y, target.x - tower.x), GEM_LOOK[tower.kind]?.color ?? '#ffffff')
        if (crit) {
            if (pops.length >= MAX_POPS) pops.shift()
            pops.push({ x: target.x, y: target.y, text: `${compactDamage(dealt)}!`, born: now })
            shake(0.1)
        }
    }
}, { flush: 'sync' })

const catalogRaw = () => toRaw(props.catalog)

function compactDamage(n) {
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
    if (n >= 1e4) return `${Math.round(n / 1e3)}K`
    return String(n)
}

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
        img.onload = invalidate
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

// 受擊閃白：把圖片的不透明部分染成白色，疊在原圖上
let flashCanvas = null
function drawFlash(img, x, y, w, h, alpha) {
    if (!flashCanvas) flashCanvas = document.createElement('canvas')
    const fw = Math.max(1, Math.ceil(w))
    const fh = Math.max(1, Math.ceil(h))
    if (flashCanvas.width !== fw || flashCanvas.height !== fh) {
        flashCanvas.width = fw
        flashCanvas.height = fh
    }
    const c = flashCanvas.getContext('2d')
    c.globalCompositeOperation = 'source-over'
    c.clearRect(0, 0, fw, fh)
    c.drawImage(img, 0, 0, fw, fh)
    c.globalCompositeOperation = 'source-atop'
    c.fillStyle = '#FFFFFF'
    c.fillRect(0, 0, fw, fh)
    ctx.globalAlpha = alpha
    ctx.drawImage(flashCanvas, x, y, w, h)
    ctx.globalAlpha = 1
}

function statsOf(kind, level) {
    const c = toRaw(props.catalog)
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
// 格紋桌布每幀都一樣：先畫成「一格一像素」的小圖，之後每幀一次 drawImage 放大貼上
// （關閉平滑，放大後仍是銳利的方格），取代每幀 25×25 次 fillRect
let clothCache = null
function clothOf(board) {
    if (clothCache?.board === board) return clothCache.canvas
    const canvas = document.createElement('canvas')
    canvas.width = board.width
    canvas.height = board.height
    const c = canvas.getContext('2d')
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            // 直條與橫條交疊處最深
            c.fillStyle = [COLOR.cloth, COLOR.tint, COLOR.cross][(x % 2) + (y % 2)]
            c.fillRect(x, y, 1, 1)
        }
    }
    clothCache = { board, canvas }
    return canvas
}

function drawBoard(view, cell) {
    const { board, path } = view
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(clothOf(board), 0, 0, board.width * cell, board.height * cell)
    ctx.imageSmoothingEnabled = true

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
        ...board.checkpoints.map((p, i) => ({ p, label: String(i + 1), color: COLOR.path })),
    ]
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const [pt, url, fallback] of [[board.start, NEST_IMAGE, '#2E9E5B'], [board.end, CAKE_IMAGE, '#E8541E']]) {
        const img = imageOf(url)
        const cx = (pt.x + 0.5) * cell
        const cy = (pt.y + 0.5) * cell
        if (img) {
            const d = cell * 1.25
            ctx.drawImage(img, cx - d / 2, cy - d / 2, d, d)
        } else {
            ctx.beginPath()
            ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2)
            ctx.fillStyle = fallback
            ctx.fill()
        }
    }
    for (const { p, label, color } of stops) {
        const cx = (p.x + 0.5) * cell
        const cy = (p.y + 0.5) * cell
        const candy = imageOf(CHECKPOINT_IMAGE)
        if (candy) {
            ctx.drawImage(candy, cx - cell * 0.55, cy - cell * 0.55, cell * 1.1, cell * 1.1)
        } else {
            ctx.beginPath()
            ctx.arc(cx, cy, cell * 0.5, 0, Math.PI * 2)
            ctx.fillStyle = color
            ctx.fill()
        }
        ctx.fillStyle = '#FFFFFF'
        ctx.strokeStyle = '#7A1530'
        ctx.lineWidth = Math.max(2, cell * 0.12)
        ctx.lineJoin = 'round'
        ctx.font = `700 ${cell * 0.62}px 'Noto Sans TC', sans-serif`
        ctx.strokeText(label, cx, cy + cell * 0.04)
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

function drawTowers(view, catalog, cell, now) {
    const steps = catalog?.mastery?.kills
    const showLevel = zoom.value * cell >= 22
    const showRank = steps && zoom.value * cell >= 16
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
        const rank = showRank ? countReached(steps, t.kills) : 0
        if (rank) drawRankGlow(cx, cy, cell, rank, steps.length)
        drawGem(t.kind, t.level, cx, cy, cell * (1 + 0.025 * rank))
        if (showLevel && !isSpecial(t.kind)) {
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
        if (rank) drawRankPips(x, y, cell, rank, steps.length)
    }
}

// 熟練度外觀：階數越高，光暈越亮；頂端的星依階數增加，滿階換成皇冠
function drawRankGlow(cx, cy, cell, rank, max) {
    const t = rank / max
    const r = cell * (0.5 + 0.12 * t)
    const g = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r)
    g.addColorStop(0, `rgba(255, 214, 79, ${0.25 + 0.4 * t})`)
    g.addColorStop(1, 'rgba(255, 214, 79, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fill()
}

function drawRankPips(x, y, cell, rank, max) {
    const cx = x + cell / 2
    if (rank >= max) {
        // 皇冠
        const w = cell * 0.46
        const h = cell * 0.26
        const left = cx - w / 2
        const top = y - cell * 0.02
        ctx.beginPath()
        ctx.moveTo(left, top + h)
        ctx.lineTo(left, top + h * 0.25)
        ctx.lineTo(left + w * 0.25, top + h * 0.6)
        ctx.lineTo(cx, top)
        ctx.lineTo(left + w * 0.75, top + h * 0.6)
        ctx.lineTo(left + w, top + h * 0.25)
        ctx.lineTo(left + w, top + h)
        ctx.closePath()
        ctx.fillStyle = '#F2B632'
        ctx.fill()
        ctx.strokeStyle = COLOR.ink
        ctx.lineWidth = Math.max(1, cell * 0.05)
        ctx.lineJoin = 'round'
        ctx.stroke()
        return
    }
    const r = cell * 0.09
    const gap = r * 2.3
    const startX = cx - ((rank - 1) * gap) / 2
    const cy = y + r + cell * 0.02
    ctx.fillStyle = '#F2B632'
    ctx.strokeStyle = COLOR.ink
    ctx.lineWidth = Math.max(1, cell * 0.04)
    ctx.lineJoin = 'round'
    for (let i = 0; i < rank; i++) {
        const px = startX + i * gap
        ctx.beginPath()
        for (let k = 0; k < 10; k++) {
            const rr = k % 2 ? r * 0.45 : r
            const a = -Math.PI / 2 + (k * Math.PI) / 5
            ctx.lineTo(px + Math.cos(a) * rr, cy + Math.sin(a) * rr)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
    }
}

// 達到幾個熟練度門檻（門檻由小到大）；每幀每座塔都會呼叫，不建立新陣列
function countReached(steps, kills) {
    let n = 0
    while (n < steps.length && kills >= steps[n]) n++
    return n
}

function drawMonsters(catalog, cell, now) {
    if (!curMap.size) return
    const t = Math.min(1, (now - curAt) / frameGap)
    const types = catalog?.monsters ?? []
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
            // 走路感：圖片頭朝左，往右走時水平翻轉，並依種類加上彈跳／漂浮與左右搖擺
            const gait = reducedMotion ? null : WALK[type]
            if (gait) {
                const prev = prevMap.get(id)
                if (prev && Math.abs(m.x - prev.x) > 0.01) facing.set(id, m.x > prev.x)
                const phase = now / gait.period + (Number(id) || 0) * 1.7
                const hop = gait.float ? (Math.sin(phase) + 1) / 2 : Math.abs(Math.sin(phase))
                const squash = gait.float ? 0 : (1 - hop) * 0.05
                ctx.save()
                ctx.translate(cx, cy + r * 0.8)
                ctx.rotate(Math.sin(phase) * gait.sway)
                ctx.scale((gait.flip && facing.get(id) ? -1 : 1) * (1 + squash), 1 - squash)
                ctx.translate(0, -r * 0.8 - hop * r * gait.hop)
                ctx.drawImage(img, -r * 1.25, -r * 1.25, r * 2.5, r * 2.5)
                const left = (flashes.get(id) ?? 0) - now
                if (left > 0) drawFlash(img, -r * 1.25, -r * 1.25, r * 2.5, r * 2.5, 0.75 * (left / FLASH_MS))
                ctx.restore()
            } else {
                ctx.drawImage(img, cx - r * 1.25, cy - r * 1.25, r * 2.5, r * 2.5)
                const left = (flashes.get(id) ?? 0) - now
                if (left > 0) drawFlash(img, cx - r * 1.25, cy - r * 1.25, r * 2.5, r * 2.5, 0.75 * (left / FLASH_MS))
            }
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
        if (m.flags & 4) {
            // 暈眩：三顆星星繞著頭頂轉
            ctx.fillStyle = '#FFC21A'
            for (let k = 0; k < 3; k++) {
                const a = now / 220 + (k * Math.PI * 2) / 3
                const sx2 = cx + Math.cos(a) * r * 0.9
                const sy2 = cy - r * 1.35 + Math.sin(a) * r * 0.28
                ctx.beginPath()
                ctx.arc(sx2, sy2, Math.max(1.5, r * 0.22), 0, Math.PI * 2)
                ctx.fill()
            }
        }
        if (m.flags & 2) {
            ctx.fillStyle = '#2E9E5B'
            ctx.beginPath()
            ctx.arc(cx + r * 0.9, cy - r * 0.9, r * 0.28, 0, Math.PI * 2)
            ctx.fill()
        }

        const traitId = m.flags >= 8 ? catalog?.traitIds.find((_, i) => m.flags & (8 << i)) : null
        if (traitId) {
            ctx.strokeStyle = catalog.traits[traitId].color
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

// 輕量退場：依怪物種類換不同收尾，只用 canvas 變形，不產生新節點
//   工蟻縮小淡出、疾行甲蟲旋轉縮小、碎屑蟲膨脹破掉、胡蜂墜落
function drawGhosts(cell, now) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
        const g = ghosts[i]
        const k = (now - g.born) / GHOST_MS
        if (k >= 1) {
            ghosts.splice(i, 1)
            continue
        }
        const look = MONSTER_LOOK[g.type] ?? MONSTER_LOOK.normal
        const r = cell * look.size
        let scale = 1 - k * 0.8
        let rot = 0
        let dy = 0
        if (g.type === 'fast') {
            rot = k * Math.PI * 3
        } else if (g.type === 'swarm') {
            scale = 1 + k * 0.6
        } else if (g.type === 'air') {
            dy = k * k * cell * 0.9
            rot = k * 0.8
        }
        ctx.save()
        ctx.globalAlpha = 1 - k
        ctx.translate((g.x + 0.5) * cell, (g.y + 0.5) * cell + dy)
        ctx.rotate(rot)
        ctx.scale(scale, scale)
        const img = imageOf(monsterImage(g.type))
        if (img) {
            ctx.drawImage(img, -r * 1.25, -r * 1.25, r * 2.5, r * 2.5)
        } else {
            ctx.fillStyle = look.color
            ctx.beginPath()
            ctx.arc(0, 0, r, 0, Math.PI * 2)
            ctx.fill()
        }
        ctx.restore()
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

function drawPops(cell, now) {
    if (!pops.length) return
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]
        const k = (now - p.born) / POP_MS
        if (k >= 1) {
            pops.splice(i, 1)
            continue
        }
        // 先彈大再回到正常大小，往上飄並淡出
        const pop = k < 0.15 ? 1 + (1 - k / 0.15) * 0.5 : 1
        const size = cell * 0.62 * pop
        const x = (p.x + 0.5) * cell
        const y = (p.y + 0.5) * cell - cell * (0.5 + k * 0.9)
        ctx.globalAlpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4
        ctx.font = `800 ${size}px 'Noto Sans TC', sans-serif`
        ctx.lineWidth = Math.max(2, size * 0.2)
        ctx.strokeStyle = COLOR.ink
        ctx.strokeText(p.text, x, y)
        ctx.fillStyle = '#FFD23F'
        ctx.fillText(p.text, x, y)
    }
    ctx.globalAlpha = 1
}

function drawSkillFx(now) {
    for (let i = skillFx.length - 1; i >= 0; i--) {
        const fx = skillFx[i]
        const t = (now - fx.born) / SKILL_FX_MS
        if (t >= 1) { skillFx.splice(i, 1); continue }
        const look = SKILL_FX[fx.id]
        const fade = 1 - t
        const c = size / 2
        ctx.save()
        // 全圖染色：很快亮起、慢慢退
        ctx.globalAlpha = (t < 0.12 ? t / 0.12 : fade) * (fx.id === 'stun' ? 0.28 : 0.24)
        ctx.fillStyle = look.tint
        ctx.fillRect(0, 0, size, size)
        if (!reducedMotion) {
            // 擴散光環：暈眩兩圈，冰凍一圈
            const rings = fx.id === 'stun' ? [0, 0.18] : [0]
            for (const delay of rings) {
                const rt = Math.min(1, Math.max(0, (t - delay) / 0.7))
                if (rt <= 0) continue
                ctx.globalAlpha = (1 - rt) * 0.9
                ctx.strokeStyle = look.ring
                ctx.lineWidth = Math.max(2, size * 0.02 * (1 - rt) + 1)
                ctx.beginPath()
                ctx.arc(c, c, rt * size * 0.75, 0, Math.PI * 2)
                ctx.stroke()
            }
            // 粒子：冰凍是往下飄的雪花，暈眩是往外迸的火花
            ctx.fillStyle = look.spark
            for (let k = 0; k < 28; k++) {
                const rx = (Math.sin(k * 12.9898) * 43758.5453) % 1
                const ry = (Math.sin(k * 78.233) * 12345.6789) % 1
                const ax = Math.abs(rx)
                const ay = Math.abs(ry)
                let px, py
                if (fx.id === 'freeze') {
                    px = ax * size + Math.sin(t * 6 + k) * size * 0.012
                    py = ((ay + t * 0.35) % 1) * size
                } else {
                    const ang = (k / 28) * Math.PI * 2
                    const dist = t * size * (0.2 + ax * 0.45)
                    px = c + Math.cos(ang) * dist
                    py = c + Math.sin(ang) * dist
                }
                const r = size * (0.004 + ay * 0.006)
                ctx.globalAlpha = fade * 0.9
                ctx.beginPath()
                ctx.arc(px, py, r, 0, Math.PI * 2)
                ctx.fill()
            }
        }
        ctx.restore()
    }
}

function drawOverlays(view, cell) {
    // 合成選位置：材料塔打上金框，點哪一座，合成後的塔就出現在那裡
    for (const id of props.highlightIds) {
        const t = view.towers.find(o => o.id === id)
        if (!t) continue
        ctx.fillStyle = 'rgba(255,210,63,0.35)'
        ctx.fillRect(t.x * cell, t.y * cell, cell, cell)
        ctx.strokeStyle = '#E8A800'
        ctx.lineWidth = Math.max(2.5, cell * 0.14)
        ctx.strokeRect(t.x * cell + 1, t.y * cell + 1, cell - 2, cell - 2)
    }
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
        // 路線預覽：放這格路線變長幾格；會封路就標紅
        const { board } = view
        const onStop = [board.start, board.end, ...board.checkpoints].some(p => p.x === ghost.x && p.y === ghost.y)
        const inside = ghost.x >= 0 && ghost.y >= 0 && ghost.x < board.width && ghost.y < board.height
        let label = ''
        let blocked = false
        if (inside && !onStop) {
            const taken = new Set(view.towers.map(t => t.y * board.width + t.x))
            const now = fullPathLength(board, (x, y) => taken.has(y * board.width + x))
            const next = fullPathLength(board, (x, y) => taken.has(y * board.width + x) || (x === ghost.x && y === ghost.y))
            blocked = next < 0
            label = blocked ? '封路，不能放' : `路線 ${next - now >= 0 ? '+' : ''}${next - now}`
        }
        if (blocked) {
            ctx.fillStyle = 'rgba(214,48,90,0.35)'
            ctx.fillRect(ghost.x * cell, ghost.y * cell, cell, cell)
        } else {
            drawRange(gem.kind, gem.level, cx, cy, cell, GEM_LOOK[gem.kind].color)
            drawGem(gem.kind, gem.level, cx, cy, cell, 0.75)
        }
        if (label) {
            ctx.font = `700 ${Math.max(11, cell * 0.5)}px sans-serif`
            ctx.textAlign = 'left'
            ctx.textBaseline = 'bottom'
            const tx = Math.min((ghost.x + 1.1) * cell, size / zoom.value - cell * 6)
            ctx.lineWidth = Math.max(3, cell * 0.16)
            ctx.strokeStyle = '#4A2C2A'
            ctx.strokeText(label, tx, ghost.y * cell)
            ctx.fillStyle = blocked ? '#FF9AA8' : '#FFFFFF'
            ctx.fillText(label, tx, ghost.y * cell)
        }
    }
}

let lastDraw = 0

function draw(now) {
    raf = requestAnimationFrame(draw)
    const dt = Math.min(0.05, (now - (lastDraw || now)) / 1000)
    lastDraw = now
    // view / catalog 是深層響應式（readonly reactive）；每幀繪製不需要追蹤，
    // 直接讀原始物件，省掉幾千次 Proxy 存取
    const view = toRaw(props.view)
    const catalog = toRaw(props.catalog)
    if (!ctx || !size || !view?.board) return
    const animating = view.phase === 'wave' || shots.length > 0 || hasFx() || pops.length > 0 || skillFx.length > 0 || ghosts.length > 0 || shakeAmp > 0.002
        || view.towers.some(t => t.fresh && t.owner === props.myId) // 剛放下的塔外框會閃
    if (!animating && !dirty) return
    dirty = false
    const cell = size / view.board.width

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    // 震動：整張地圖隨機偏移，幅度每幀衰減
    let sx = 0
    let sy = 0
    if (shakeAmp > 0.002) {
        sx = (Math.random() * 2 - 1) * shakeAmp * cell
        sy = (Math.random() * 2 - 1) * shakeAmp * cell
        shakeAmp *= Math.pow(0.001, dt) // 約 0.33 秒衰減到千分之一以下
    } else {
        shakeAmp = 0
    }
    ctx.setTransform(dpr * zoom.value, 0, 0, dpr * zoom.value, dpr * (panX + sx), dpr * (panY + sy))

    drawBoard(view, cell)
    drawTowers(view, catalog, cell, now)
    drawShots(cell, now)
    drawMonsters(catalog, cell, now)
    drawGhosts(cell, now)
    drawFx(ctx, cell, dt)
    drawPops(cell, now)
    drawSkillFx(now)
    drawOverlays(view, cell)
}

watch(() => props.pendingGem, () => { armed.value = null })
watch([() => props.view, () => props.selectedId, () => props.highlightIds, () => props.pendingGem, () => props.catalog, hover, armed, zoom], invalidate)

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
