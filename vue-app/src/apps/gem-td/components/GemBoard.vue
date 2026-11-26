<template>
    <div ref="wrapRef" class="relative flex h-full w-full items-center justify-center overflow-hidden">
        <GemTableDecor />
        <canvas ref="canvasRef" class="relative block touch-none select-none max-sm:rounded-none rounded-sm" :class="placing ? 'cursor-crosshair' : 'cursor-default'"
            role="img" aria-label="遊戲地圖"
            @pointerdown="onPointer" @pointermove="onPointer" @pointerup="onPointer" @pointercancel="onPointer"
            @pointerleave="onPointer" @wheel.prevent="onWheel" @contextmenu.prevent="onContext" />
        <!-- 縮放：按鈕或雙指（滾輪不縮放）；放大後拖曳平移 -->
        <div class="absolute top-2 right-2 flex flex-col gap-1" role="group" aria-label="地圖縮放">
            <button class="gt-chip !min-h-10 !w-10 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!w-11 justify-center !px-0 text-xl font-bold" aria-label="放大地圖" title="放大" :disabled="zoom >= MAX_ZOOM" @click="controller.zoomBy(1.4)">＋</button>
            <button class="gt-chip !min-h-10 !w-10 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!w-11 justify-center !px-0 text-xl font-bold" aria-label="縮小地圖" title="縮小" :disabled="zoom <= 1.01" @click="controller.zoomBy(1 / 1.4)">－</button>
        </div>
        <div class="absolute right-2 bottom-2 flex flex-col items-end gap-1">
            <!-- 合作迷宮：把鏡頭拉回自己的建造者（快捷鍵 C）；跟隨 = 鏡頭一直貼著他（Shift＋C），拖曳或點小地圖就解除 -->
            <template v-if="hasMyBuilder">
                <button class="gt-chip" :aria-pressed="following" title="鏡頭持續跟著我的建造者（Shift＋C）；拖曳地圖或點小地圖就解除" @click="toggleFollow()">跟隨<span v-if="following"> ✓</span></button>
                <button class="gt-chip" title="鏡頭移到我的建造者（C）" @click="focusMine()">◎ 找到我</button>
            </template>
            <button v-if="zoom > 1.01" class="gt-chip" @click="controller.reset()">看全圖</button>
        </div>
        <!-- 放大後自己的建造者不在畫面內：貼著邊緣的箭頭（顏色是自己的玩家色），點一下就飛過去 -->
        <button v-if="marker" class="gt-builder-marker absolute z-10 flex items-center gap-1 rounded-full border-2 border-white bg-white/90 px-1.5 py-0.5 text-xs font-bold shadow-md"
            :style="{ left: `${marker.left}px`, top: `${marker.top}px`, color: marker.color, borderColor: marker.color }"
            :aria-label="`我的建造者在畫面外，約 ${marker.cells} 格`" @click="focusMine()">
            <span class="inline-block text-base leading-none" :style="{ transform: `rotate(${marker.angle}rad)` }" aria-hidden="true">➤</span>我 {{ marker.cells }}
        </button>
        <!-- 合作迷宮：小地圖（點擊或拖曳跳轉），放左下角 -->
        <GemMiniMap v-if="isCoop" class="absolute bottom-2 left-2" :view="view" :frame="frame" :colors="ownerColors" :viewport="viewport" :builders="builders" :my-id="myId" :size="miniSize" @goto="p => controller.centerOn(p.x, p.y)" />
        <!-- 多人：切換看誰的地圖（一次只畫一張，其他人的地圖不吃效能） -->
        <template v-if="!isCoop && (view.playerIds?.length ?? 0) > 1">
            <button class="gt-chip absolute top-1/2 left-2 !min-h-12 !w-10 -translate-y-1/2 justify-center !px-0 text-xl font-bold opacity-90 [@media(pointer:coarse)]:!w-11" aria-label="看上一位玩家的地圖" title="上一位玩家" @click="emit('step', -1)">‹</button>
            <button class="gt-chip absolute top-1/2 right-14 !min-h-12 !w-10 -translate-y-1/2 justify-center !px-0 text-xl font-bold opacity-90 [@media(pointer:coarse)]:!w-11" aria-label="看下一位玩家的地圖" title="下一位玩家" @click="emit('step', 1)">›</button>
        </template>
    </div>
</template>

<script setup>
// 地圖畫布：只負責畫面與輸入。座標以「格」為單位，格子中心是 (x + .5, y + .5)。
// 手機點一下先預覽、同一格再點一下才放；滑鼠直接放。按鈕或雙指縮放（滾輪不縮放），放大後拖曳平移。
import { ref, computed, watch, onMounted, onUnmounted, toRaw } from 'vue'
import { CAKE_IMAGE, CHECKPOINT_IMAGE, NEST_IMAGE, GEM_LOOK, MONSTER_LOOK, PLAYER_MARKS, BUILDER_IMAGE, gemScale, isSpecial, monsterImage, towerImage } from '../data/gems.js'
import { fullPathLength } from '../data/pathing.js'
import GemTableDecor from './GemTableDecor.vue'
import GemMiniMap from './GemMiniMap.vue'
import { MAX_ZOOM, createCameraController, normalizePointer, normalizeWheel, screenToCell, cellSizeOf, visibleRect, offscreenMarker } from '../composables/useGemCamera.js'
import { spawnHit, spawnDeath, spawnDust, clearFx, drawFx, hasFx } from '../composables/usePixelFx.js'
import { createPrediction, predictMove, predictJob, stopPrediction, stepPrediction, reconcilePrediction } from '../composables/useGemBuilderPrediction.js'

const props = defineProps({
    view: { type: Object, required: true },
    frame: { type: Object, default: null },
    catalog: { type: Object, default: null },
    myId: { type: String, default: '' },
    pendingGem: { type: Object, default: null }, // 目前要放下的甜點
    selectedId: { type: Number, default: null },
    highlightIds: { type: Array, default: () => [] }, // 合成選位置：可以選的材料塔
    builders: { type: Object, default: null }, // 合作迷宮建造者的即時快照 { builders: [{ id, x, y, p }] }
    builderMode: { type: Boolean, default: false }, // 點空格 = 叫建造者走過去；右鍵一律是移動
})
const emit = defineEmits(['cell', 'tower', 'clear', 'arm', 'step', 'move'])

const wrapRef = ref(null)
const canvasRef = ref(null)
const zoom = ref(1)
const viewSize = ref(0) // 畫布邊長（px），給小地圖決定自己多大
const miniSize = computed(() => Math.round(Math.min(148, Math.max(88, viewSize.value * 0.26))))
const viewport = ref({ x: 0, y: 0, w: 1, h: 1 }) // 目前看到的範圍（格），給小地圖畫視窗框
const hover = ref(null)
const following = ref(false) // 鏡頭持續跟著自己的建造者
const marker = ref(null) // 自己的建造者在畫面外時的邊緣箭頭 { left, top, angle, cells, color }
const canvasOffset = { x: 0, y: 0 } // 畫布在容器內的位置（箭頭用的是畫布座標）
const armed = ref(null) // 手機：第一次點選的格子
const placing = computed(() => !!props.pendingGem)
const hasMyBuilder = computed(() => !!props.view.builders?.some(b => b.id === props.myId))
// 合作迷宮：全隊共用一張圖，每座塔依擁有者上玩家色（顏色跟玩家清單的順序一致）
const isCoop = computed(() => props.view.options?.mode === 'coop')
const ownerColors = computed(() => (isCoop.value ? Object.fromEntries((props.view.playerIds ?? []).map((id, i) => [id, PLAYER_MARKS[i % PLAYER_MARKS.length]])) : null))
// 預覽中的格子交給外面（底部操作列顯示「放在這裡」）；放下一顆、或回合結束就不再預覽
watch(armed, c => emit('arm', c ? { x: c.x, y: c.y } : null))
watch(() => [props.view.phase, props.view.me?.pending?.length ?? 0, props.view.watching], () => { armed.value = null })
defineExpose({ focusMine: (follow = false) => (follow ? toggleFollow() : focusMine()), disarm: () => { armed.value = null }, panTo: (x, y) => controller.centerOn(x, y), stopPrediction: () => stopPrediction(pred), predictDemolish: t => predictBuildMine(t, 'demolish') })

let ctx = null
let size = 0
let dpr = 1
let raf = 0
let observer = null
// 畫面沒有動態（建造中、沒有特效）時只在有變化才重畫，不必每秒畫 60 次
let dirty = true
const invalidate = () => { dirty = true }

const COLOR = {
    cloth: '#FFFFFF', tint: '#FBE3E8', cross: '#F5C9D3', ink: '#4A2C2A',
    path: '#D6305A', cookie: '#D9A066', cookieEdge: '#A86B3C', chip: '#6B3F26',
}

// ── 尺寸與相機 ────────────────────────────────────────────────────
// 縮放、平移、手勢全在 useGemCamera.js（純函式）；這裡只把 DOM 事件正規化後交給它
const controller = createCameraController({
    ctx: () => ({ board: props.view.board, viewSize: size }),
    wheelZoom: true,
    onChange: syncCamera,
    onHover: (cell) => { hover.value = cell },
    onTap: ({ cell, pointerType }) => tap(cell, pointerType),
})

// 相機被「自己以外」的力量平移（拖曳、小地圖跳轉）就解除跟隨；縮放、視窗大小改變、跟隨本身不算
let internalMove = false
let lastZoom = 1
const internal = (fn) => { internalMove = true; try { fn() } finally { internalMove = false } }

function myBuilderPos() {
    const st = bst.get(props.myId)
    return st ? { x: st.x, y: st.y } : serverOfMine()
}
function focusMine() {
    const p = myBuilderPos()
    if (p) internal(() => controller.centerOn(p.x, p.y))
}
function toggleFollow() {
    if (!hasMyBuilder.value) return false
    following.value = !following.value
    if (following.value) focusMine()
    return true
}

function updateMarker(view) {
    let next = null
    const p = hasMyBuilder.value && zoom.value > 1.01 ? myBuilderPos() : null
    const m = p && offscreenMarker(controller.camera, p, view.board, size, { inset: 34, margin: 6 })
    if (m) {
        next = {
            left: Math.round(m.x + canvasOffset.x), top: Math.round(m.y + canvasOffset.y), angle: Math.round(m.angle * 100) / 100,
            cells: Math.round(m.distance), color: ownerColors.value?.[props.myId] ?? COLOR.ink,
        }
    }
    const cur = marker.value
    if (!next && !cur) return
    if (next && cur && next.left === cur.left && next.top === cur.top && next.angle === cur.angle && next.cells === cur.cells) return
    marker.value = next
}

function syncCamera() {
    if (following.value && !internalMove && controller.camera.zoom === lastZoom) following.value = false
    lastZoom = controller.camera.zoom
    zoom.value = controller.camera.zoom
    if (size && props.view.board) viewport.value = visibleRect(controller.camera, props.view.board, size)
    invalidate()
}

function resize() {
    const el = wrapRef.value
    const canvas = canvasRef.value
    if (!el || !canvas) return
    size = Math.floor(Math.min(el.clientWidth, el.clientHeight))
    viewSize.value = size
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${size}px`
    canvas.style.height = `${size}px`
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx = canvas.getContext('2d')
    canvasOffset.x = canvas.offsetLeft
    canvasOffset.y = canvas.offsetTop
    internal(() => controller.clamp())
    syncCamera()
}

// ── 輸入 ─────────────────────────────────────────────────────────
function onPointer(e) {
    if (e.pointerType === 'mouse' && e.button > 0) return // 右鍵走 onContext，不當成點擊
    if (e.type === 'pointerdown') canvasRef.value.setPointerCapture(e.pointerId)
    controller.handle(normalizePointer(e, canvasRef.value.getBoundingClientRect()))
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
        if (props.builderMode) moveMine(cell.x + 0.5, cell.y + 0.5)
        emit('clear')
        return
    }
    const confirmed = pointerType === 'mouse' || (armed.value?.x === cell.x && armed.value?.y === cell.y)
    if (confirmed) {
        armed.value = null
        if (props.builderMode) predictBuildMine(cell)
        emit('cell', cell.x, cell.y)
    } else {
        armed.value = cell
    }
}

// 建造者模式：右鍵 = 叫建造者走到那裡（會取消目前的工作）
function onContext(e) {
    if (!props.builderMode) return
    const r = canvasRef.value.getBoundingClientRect()
    const cell = screenToCell(controller.camera, { x: e.clientX - r.left, y: e.clientY - r.top }, props.view.board, size)
    if (cell) moveMine(cell.x + 0.5, cell.y + 0.5)
}

// ── 自己的建造者：送出指令的同一幀就開始走（預測），伺服器的快照之後接手 ──────────
// 預測的細節與放棄條件見 useGemBuilderPrediction.js；畫面上位置的唯一來源是 bst（見 drawBuilders）
const pred = createPrediction()
function serverOfMine() {
    const s = props.builders?.builders?.find(b => b.id === props.myId) ?? props.view.builders?.find(b => b.id === props.myId)
    return s ? { x: s.x, y: s.y } : null
}
function moveMine(x, y) {
    const from = bst.get(props.myId)
    if (from) predictMove(pred, from, x, y, performance.now(), serverOfMine())
    emit('move', { x, y })
}
function predictBuildMine(cell, type = 'build') {
    const from = bst.get(props.myId)
    if (from) predictJob(pred, from, cell, props.catalog?.coop?.buildRange ?? 3, type, performance.now(), serverOfMine())
}

// 滑鼠在浮動的左欄或右欄範圍內（含卡片間的空隙）時，滾輪只捲那一欄；在地圖上時：
// 合作迷宮的大地圖用滾輪縮放，其他模式滾輪不縮放（縮放用按鈕或雙指）
function onWheel(e) {
    const game = canvasRef.value?.closest('.gt-game')
    for (const [panel, scroller] of [['.gt-side', '.gt-side'], ['.gt-rail', '.gt-rail-top']]) {
        const el = game?.querySelector(panel)
        if (!el || getComputedStyle(el).position !== 'absolute') continue
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            ;(el.matches(scroller) ? el : el.querySelector(scroller))?.scrollBy({ top: e.deltaY })
            return
        }
    }
    if (isCoop.value) controller.handle(normalizeWheel(e, canvasRef.value.getBoundingClientRect()))
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
    const colors = ownerColors.value
    for (const t of view.towers) {
        const x = t.x * cell
        const y = t.y * cell
        const cx = x + cell / 2
        const cy = y + cell / 2
        const ownerColor = colors?.[t.owner]
        if (t.kind === 'stone') {
            drawCookie(x, y, cell)
            if (ownerColor) {
                ctx.fillStyle = ownerColor
                ctx.beginPath()
                ctx.arc(x + cell * 0.8, y + cell * 0.2, Math.max(1.5, cell * 0.13), 0, Math.PI * 2)
                ctx.fill()
            }
            continue
        }
        if (ownerColor) {
            ctx.fillStyle = `${ownerColor}38`
            ctx.fillRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88)
            ctx.strokeStyle = ownerColor
            ctx.lineWidth = Math.max(1.5, cell * 0.08)
            ctx.strokeRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88)
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

// 放置預覽的路線長度：只跟「游標在哪一格」與「場上的塔」有關。塔只會隨伺服器推送的新 view 改變，
// 所以用 view 物件本身＋格子座標當快取鍵，游標換格才重跑兩次尋路（原本每幀都跑）
let preview = { view: null, x: -1, y: -1, label: '', blocked: false }
function pathPreview(view, ghost) {
    if (preview.view === view && preview.x === ghost.x && preview.y === ghost.y) return preview
    const { board } = view
    const taken = new Set(view.towers.map(t => t.y * board.width + t.x))
    for (const b of view.builders ?? []) if (b.job?.started && b.job.type === 'build') taken.add(b.job.y * board.width + b.job.x)
    const now = fullPathLength(board, (x, y) => taken.has(y * board.width + x))
    const next = fullPathLength(board, (x, y) => taken.has(y * board.width + x) || (x === ghost.x && y === ghost.y))
    const blocked = next < 0
    preview = { view, x: ghost.x, y: ghost.y, blocked, label: blocked ? '封路，不能放' : `路線 ${next - now >= 0 ? '+' : ''}${next - now}` }
    return preview
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
        // 合作迷宮 breach：允許堵死（view.breaches 不是 null），不做封路預覽；路線與突破點由伺服器算
        if (inside && !onStop && view.breaches == null) ({ label, blocked } = pathPreview(view, ghost))
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

// ── 堵死拆牆（合作迷宮 breach）：路線上必須打破的牆用紅框閃爍標出；被攻擊的牆顯示剩餘血量 ──
function drawBreaches(view, cell, now) {
    const pulse = reducedMotion ? 0.6 : 0.45 + 0.3 * Math.sin(now / 260)
    for (const c of view.breaches ?? []) {
        const x = c.x * cell
        const y = c.y * cell
        ctx.fillStyle = `rgba(214,48,90,${pulse * 0.45})`
        ctx.fillRect(x, y, cell, cell)
        ctx.strokeStyle = `rgba(214,48,90,${0.5 + pulse * 0.5})`
        ctx.lineWidth = Math.max(2, cell * 0.12)
        ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2)
        ctx.beginPath()
        ctx.moveTo(x + cell * 0.25, y + cell * 0.25)
        ctx.lineTo(x + cell * 0.75, y + cell * 0.75)
        ctx.moveTo(x + cell * 0.75, y + cell * 0.25)
        ctx.lineTo(x + cell * 0.25, y + cell * 0.75)
        ctx.stroke()
    }
}

// 被蟲攻擊中的牆血量條：畫在蟲的上面（蟲站在牆前，先畫會被蟲的圖擋住，M7 實測發現）；放大後才看得清楚，所以加白邊與最小厚度
function drawWallBars(cell) {
    const h = Math.max(cell * 0.2, 3 / zoom.value)
    for (const [wx, wy, pct] of props.frame?.w ?? []) {
        const x = wx * cell
        const y = wy * cell - h * 0.35
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(x - 1 / zoom.value, y - 1 / zoom.value, cell + 2 / zoom.value, h + 2 / zoom.value)
        ctx.fillStyle = COLOR.ink
        ctx.fillRect(x, y, cell, h)
        ctx.fillStyle = pct > 50 ? '#3CCB72' : pct > 25 ? '#F2B233' : '#F0506E'
        ctx.fillRect(x, y, (cell * pct) / 100, h)
    }
}

// ── 建造者與施工中的工作 ───────────────────────────────────────────
// 畫面上的位置往伺服器的最新快照靠過去（10Hz → 平滑）；自己的建造者在送出指令後先用前端預測的位置
// （見 useGemBuilderPrediction.js）。縮得太小（每格 < BUILDER_MIN_CELL 像素）就只畫玩家色圓點加名字。
// 動畫：待機輕輕浮動呼吸；走路一蹦一蹦、落地壓扁、身體往前傾、腳邊揚灰塵；施工時左右搖晃、一下一下敲，
// 工地冒灰塵，完成時一大團。偏好減少動態時全部關掉（只剩位置移動）。
const BUILDER_MIN_CELL = 14
const bst = new Map() // 建造者 id → 畫面位置與動畫狀態 { x, y, vx, speed, phase, stepAt, workAt, job, p }
function drawBuilders(view, cell, now, dt) {
    const list = view.builders
    if (!list?.length) { bst.clear(); stopPrediction(pred); return }
    const live = new Map((props.builders?.builders ?? []).map(b => [b.id, b]))
    const k = 1 - Math.exp(-dt * 14)
    const small = zoom.value * cell < BUILDER_MIN_CELL
    const px = 1 / zoom.value // 一個螢幕像素有幾個世界單位
    const speedCfg = props.catalog?.coop?.builderSpeed ?? 4
    const mineView = list.find(b => b.id === props.myId)
    if (mineView) {
        const s = live.get(mineView.id) ?? mineView
        reconcilePrediction(pred, { x: s.x, y: s.y, job: mineView.job }, now)
        stepPrediction(pred, dt, speedCfg)
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    for (const [i, b] of list.entries()) {
        const color = ownerColors.value?.[b.id] ?? COLOR.ink
        const src = live.get(b.id) ?? b
        const mine = b.id === props.myId
        let st = bst.get(b.id)
        if (!st) { st = { x: src.x, y: src.y, vx: 0, speed: 0, phase: i * 1.7, stepAt: 0, workAt: 0, job: null, p: 0 }; bst.set(b.id, st) }
        const lastX = st.x
        const lastY = st.y
        if (mine && pred.active) { st.x = pred.x; st.y = pred.y } else { st.x += (src.x - st.x) * k; st.y += (src.y - st.y) * k }
        if (mine && window.__gtBuilderLog) window.__gtBuilderLog.push([now, st.x, st.y, src.x, src.y, pred.active]) // 量測用：畫面位置 vs 伺服器位置
        const step = Math.hypot(st.x - lastX, st.y - lastY)
        st.speed += (step / Math.max(dt, 0.001) - st.speed) * Math.min(1, dt * 12)
        st.vx += ((st.x - lastX) / Math.max(dt, 0.001) - st.vx) * Math.min(1, dt * 10)

        // 要畫的工作：伺服器還沒回報時，自己剛下的指令先用預測的目標格頂著（點了立刻有反應）
        const job = b.job ?? (mine && pred.job ? { ...pred.job, started: false, p: 0 } : null)
        if (job) {
            const jx = job.x * cell
            const jy = job.y * cell
            const demolish = job.type === 'demolish'
            if (job.started) {
                const p = live.get(b.id)?.p ?? job.p
                ctx.fillStyle = `${color}59`
                ctx.fillRect(jx, jy, cell, cell)
                ctx.fillStyle = COLOR.ink
                ctx.fillRect(jx, jy + cell * 0.8, cell, cell * 0.2)
                ctx.fillStyle = color
                ctx.fillRect(jx, jy + cell * 0.8, cell * p, cell * 0.2)
                st.p = p
                if (demolish) {
                    ctx.strokeStyle = '#F0506E'
                    ctx.lineWidth = Math.max(2, cell * 0.12)
                    ctx.beginPath()
                    ctx.moveTo(jx + cell * 0.2, jy + cell * 0.2)
                    ctx.lineTo(jx + cell * 0.8, jy + cell * 0.7)
                    ctx.moveTo(jx + cell * 0.8, jy + cell * 0.2)
                    ctx.lineTo(jx + cell * 0.2, jy + cell * 0.7)
                    ctx.stroke()
                }
            } else {
                // 還在路上：虛線框標出目標格，再拉一條虛線連到建造者
                ctx.strokeStyle = color
                ctx.lineWidth = Math.max(1.5, cell * 0.07)
                ctx.setLineDash([cell * 0.2, cell * 0.14])
                ctx.strokeRect(jx + cell * 0.06, jy + cell * 0.06, cell * 0.88, cell * 0.88)
                ctx.beginPath()
                ctx.moveTo(st.x * cell, st.y * cell)
                ctx.lineTo((job.x + 0.5) * cell, (job.y + 0.5) * cell)
                ctx.globalAlpha = 0.5
                ctx.stroke()
                ctx.globalAlpha = 1
                ctx.setLineDash([])
            }
        } else if (mine && pred.active && !pred.job) {
            // 右鍵移動：目的地畫一圈小記號
            ctx.strokeStyle = `${color}B3`
            ctx.lineWidth = Math.max(1.5, cell * 0.07)
            ctx.beginPath()
            ctx.arc(pred.tx * cell, pred.ty * cell, cell * (0.3 + 0.06 * Math.sin(now / 140)), 0, Math.PI * 2)
            ctx.stroke()
        }

        // 施工剛完成：工地噴一大團灰塵（上一幀還在施工、進度快滿，這一幀工作沒了）
        if (st.job && !b.job && st.p > 0.7 && !small && !reducedMotion) spawnDust(st.job.x + 0.5, st.job.y + 0.85, true)
        st.job = b.job?.started ? b.job : null
        if (!b.job?.started) st.p = 0

        const working = !!b.job?.started
        const walking = !working && st.speed > 0.8
        let hop = 0 // 往上離地的高度（格）
        let sx = 1
        let sy = 1
        let rot = 0
        if (!reducedMotion) {
            if (working) {
                const beat = now / 115 + i
                const hit = Math.abs(Math.sin(beat))
                rot = Math.sin(beat * 2) * 0.1 + Math.sign(b.job.x + 0.5 - st.x) * 0.05
                sy = 1 - 0.07 * hit
                sx = 1 + 0.05 * hit
                if (!small && now >= st.workAt) {
                    spawnDust(b.job.x + 0.5 + (Math.random() - 0.5) * 0.4, b.job.y + 0.85)
                    st.workAt = now + 260
                }
            } else if (walking) {
                st.phase += dt * (7 + st.speed * 1.3)
                const w = Math.abs(Math.sin(st.phase))
                hop = w * 0.13
                sy = 1 + (w - 0.5) * 0.1
                sx = 1 - (w - 0.5) * 0.08
                rot = Math.sin(st.phase) * 0.05 + Math.max(-1, Math.min(1, st.vx / speedCfg)) * 0.1
                if (!small && now >= st.stepAt) {
                    spawnDust(st.x, st.y + 0.38)
                    st.stepAt = now + 170
                }
            } else {
                st.phase += dt * 2.4
                const s = Math.sin(st.phase)
                hop = (s * 0.5 + 0.5) * 0.05
                sy = 1 + s * 0.015
                sx = 1 - s * 0.012
            }
        }
        const cx = st.x * cell
        const foot = st.y * cell + cell * 0.36
        const img = small ? null : imageOf(BUILDER_IMAGE)
        let labelY
        if (img) {
            ctx.fillStyle = `${color}99`
            ctx.beginPath()
            ctx.ellipse(cx, foot + cell * 0.02, cell * 0.42 * (1 - hop * 0.8), cell * 0.16 * (1 - hop * 0.8), 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.strokeStyle = color
            ctx.lineWidth = Math.max(1.5, cell * 0.07)
            ctx.stroke()
            ctx.save()
            ctx.translate(cx, foot - hop * cell)
            ctx.rotate(rot)
            ctx.scale(sx, sy)
            ctx.drawImage(img, -cell * 0.6, -cell * 1.2, cell * 1.2, cell * 1.2)
            ctx.restore()
            labelY = foot - hop * cell + cell * 0.22
        } else {
            const cy = st.y * cell - hop * cell
            const rad = Math.max(cell * 0.4, 4 * px)
            ctx.fillStyle = color
            ctx.strokeStyle = '#FFFFFF'
            ctx.lineWidth = 1.5 * px
            ctx.beginPath()
            ctx.arc(cx, cy, rad, 0, Math.PI * 2)
            ctx.fill()
            ctx.stroke()
            // 縮小時圓點只差兩三格、名字會疊在一起：名字放在圓點下方，依序往下錯開（上方貼近地圖邊緣會被切掉）
            labelY = cy + rad + (11 * px) * (1 + 1.05 * (i % 3))
        }
        const name = view.names?.[b.id] ?? ''
        if (name && (small || mine || zoom.value * cell >= 22)) {
            const fs = Math.max(11 * px, cell * 0.38)
            const ty = img ? labelY + fs * 0.7 : labelY
            ctx.font = `700 ${fs}px 'Noto Sans TC', sans-serif`
            ctx.lineJoin = 'round'
            ctx.lineWidth = fs * 0.28
            ctx.strokeStyle = '#FFFFFF'
            ctx.strokeText(name, cx, ty)
            ctx.fillStyle = color
            ctx.fillText(name, cx, ty)
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
        || !!view.builders?.length // 建造者會浮動、走動
        || !!view.breaches?.length // 突破點的紅框會閃
    if (!animating && !dirty) return
    dirty = false
    // 量測用（預設關閉）：瀏覽器 console 設 window.__gtPerf = [] 就會記每幀 [繪製毫秒, 蟲數, 塔數, 時間, 各段毫秒]
    const perf = window.__gtPerf
    const perfStart = perf ? performance.now() : 0
    const laps = perf ? [] : null
    let lapAt = perfStart
    const lap = () => { if (laps) { const t = performance.now(); laps.push(+(t - lapAt).toFixed(2)); lapAt = t } }
    const cell = cellSizeOf(view.board, size)
    // 跟隨：先把相機往自己的建造者靠近一步，這一幀就用新的位置畫（用上一幀的畫面位置，差一幀看不出來）
    if (following.value) {
        const p = myBuilderPos()
        if (p) internal(() => controller.followToward(p, 1 - Math.exp(-dt * 10)))
    }
    const cam = controller.camera

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
    ctx.setTransform(dpr * cam.zoom, 0, 0, dpr * cam.zoom, dpr * (cam.panX + sx), dpr * (cam.panY + sy))

    drawBoard(view, cell)
    lap()
    drawTowers(view, catalog, cell, now)
    lap()
    drawBreaches(view, cell, now)
    drawBuilders(view, cell, now, dt)
    updateMarker(view)
    lap()
    drawShots(cell, now)
    lap()
    drawMonsters(catalog, cell, now)
    drawWallBars(cell)
    lap()
    drawGhosts(cell, now)
    lap()
    drawFx(ctx, cell, dt)
    lap()
    drawPops(cell, now)
    drawSkillFx(now)
    lap()
    drawOverlays(view, cell)
    lap()
    if (perf) perf.push([performance.now() - perfStart, curMap.size, view.towers.length, now, laps])
}

watch(() => props.pendingGem, () => { armed.value = null })
watch([() => props.view, () => props.selectedId, () => props.highlightIds, () => props.pendingGem, () => props.catalog, hover, armed, zoom], invalidate)
watch(() => [props.view.board?.width, props.view.board?.height], () => { controller.clamp(); syncCamera() })

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
