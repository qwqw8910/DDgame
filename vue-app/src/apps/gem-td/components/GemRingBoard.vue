<template>
    <div ref="wrapRef" class="relative h-full w-full overflow-hidden">
        <canvas ref="canvasRef" class="block touch-none select-none"
            :class="spaceDown ? 'cursor-grab' : placing ? 'cursor-crosshair' : 'cursor-default'"
            role="img" aria-label="環形接力地圖：多個區域排成一圈，蟲群沿外環輸送帶傳給下一區"
            @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp"
            @pointerleave="hover = null" @wheel.prevent="onWheel" @dblclick="onDblClick" />
        <!-- 浮動按鈕放在「沒被面板蓋住」的那塊裡 -->
        <div class="pointer-events-none absolute [&>*]:pointer-events-auto" :style="frameStyle">
        <!-- 視角：縮放、整圈、顯示路線。電腦版另有滾輪、左鍵拖拉、空白鍵拖拉、F、雙擊聚焦 -->
        <div class="absolute top-2 right-2 flex flex-col gap-1" role="group" aria-label="地圖視角">
            <button class="gt-chip !min-h-10 !w-10 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!w-11 justify-center !px-0 text-xl font-bold" aria-label="放大地圖" title="放大" @click="zoomBy(1.4)">＋</button>
            <button class="gt-chip !min-h-10 !w-10 [@media(pointer:coarse)]:!min-h-11 [@media(pointer:coarse)]:!w-11 justify-center !px-0 text-xl font-bold" aria-label="縮小地圖" title="縮小" @click="zoomBy(1 / 1.4)">－</button>
        </div>
        <!-- 左右逛每一區：玩家橫排，拖拉、Shift＋滾輪、兩側按鈕都能移動 -->
        <!-- 手機：頂部一排區域按鈕（點一下跳過去），也可以左右滑動，放開會吸附到最近的一區 -->
        <div v-if="zoneChips.length > 1" class="absolute top-2 right-14 left-2 hidden gap-1 overflow-x-auto max-sm:flex" role="group" aria-label="切換區域">
            <button v-for="c in zoneChips" :key="c.id" class="gt-chip shrink-0 !min-h-10 justify-center !px-3" :class="c.on && 'gt-chip--on'" :style="{ borderColor: c.color }" :aria-pressed="c.on" @click="jumpZone(c.index)">{{ c.label }}</button>
        </div>
        <button class="gt-chip max-sm:hidden absolute top-1/2 left-2 !min-h-12 !w-10 -translate-y-1/2 justify-center !px-0 text-xl font-bold opacity-90 [@media(pointer:coarse)]:!w-11" aria-label="看上一區" title="上一區" @click="stepZone(-1)">‹</button>
        <button class="gt-chip max-sm:hidden absolute top-1/2 right-14 !min-h-12 !w-10 -translate-y-1/2 justify-center !px-0 text-xl font-bold opacity-90 [@media(pointer:coarse)]:!w-11" aria-label="看下一區" title="下一區" @click="stepZone(1)">›</button>
        <div class="absolute bottom-2 left-2 flex flex-wrap gap-1">
            <button class="gt-chip" :title="keys ? '整排視角（F）' : '整排視角'" aria-keyshortcuts="F" @click="fit(true)">全部<kbd v-if="keys" class="gt-kbd ml-1.5 max-sm:hidden" aria-hidden="true">F</kbd></button>
            <button class="gt-chip" :class="showRoutes && 'gt-chip--on'" :aria-pressed="showRoutes" @click="showRoutes = !showRoutes">路線</button>
            <button v-if="hasBoss" class="gt-chip" :class="follow && 'gt-chip--on'" :aria-pressed="follow" title="鏡頭跟著首領移動；拖拉或縮放地圖會暫停，再按一次恢復" @click="toggleFollow">聚焦首領</button>
        </div>
        </div>
    </div>
</template>

<script setup>
// 環形接力的整圈地圖：單一 <canvas>，世界座標以「格」為單位（環心是原點），相機 = 縮放 + 平移。
// 每區的地板、牆、塔畫在各自的離屏 canvas，該區有變動才重畫；每幀只畫蟲、輸送帶與特效，畫面外的區域跳過。
// 縮放 < 0.4（1.0 = 單一區域剛好塞滿畫面）改成簡化顯示：每組蟲一個帶數量的圓點、不畫格線、區域上方顯示大字區號。
import { ref, computed, watch, onMounted, onUnmounted, toRaw } from 'vue'
import { zoneLabels, CAKE_IMAGE, CHECKPOINT_IMAGE, NEST_IMAGE, GEM_LOOK, MONSTER_LOOK, ZONE_COLORS, gemScale, isSpecial, monsterImage, towerImage } from '../data/gems.js'
import { fullPathLength } from '../data/pathing.js'

const props = defineProps({
    view: { type: Object, required: true },
    frame: { type: Object, default: null },
    catalog: { type: Object, default: null },
    myId: { type: String, default: '' }, // 目前操作的區（單一真人時是正在看的那區）
    pendingGem: { type: Object, default: null },
    selectedId: { type: Number, default: null },
    keys: { type: Boolean, default: false },
})
const emit = defineEmits(['cell', 'tower', 'clear', 'arm', 'zone', 'camera'])

const wrapRef = ref(null)
const canvasRef = ref(null)
const hover = ref(null) // { zone, x, y }
const armed = ref(null) // 觸控：第一次點選的格子 { x, y }（在操作中的那一區）
const showRoutes = ref(true) // 預設打開路線：一眼看出每區的蟲怎麼走
const follow = ref(false) // 鏡頭跟著首領
const uiInset = ref({ l: 0, r: 0, t: 0, b: 0 }) // 被面板蓋住的邊（給浮動按鈕用）
const frameStyle = computed(() => ({ left: `${uiInset.value.l}px`, right: `${uiInset.value.r}px`, top: `${uiInset.value.t}px`, bottom: `${uiInset.value.b}px` }))
const hasBoss = ref(false) // 場上有首領（或傷害測試的巨獸）
const spaceDown = ref(false)
const placing = computed(() => !!props.pendingGem)

watch(armed, c => emit('arm', c ? { x: c.x, y: c.y } : null))
watch(() => [props.view.phase, props.view.me?.pending?.length ?? 0, props.view.watching], () => { armed.value = null })
watch(() => props.pendingGem, () => { armed.value = null })
defineExpose({
    disarm: () => { armed.value = null },
    fit: () => fit(true),
    focusZone: (i) => { follow.value = false; focusZone(i) },
    panTo: (x, y) => { follow.value = false; animateTo(Math.max(scale, zoneScale() * 0.5), x, y, 350) },
})

const COLOR = { bg: '#F3EBDD', cloth: '#FFFFFF', tint: '#FBE3E8', cross: '#F5C9D3', ink: '#4A2C2A', path: '#D6305A', cookie: '#D9A066', cookieEdge: '#A86B3C', chip: '#6B3F26' }
const SIMPLE_BELOW = 0.4 // 縮放低於這個值改簡化顯示
const CPX = 32 // 離屏 canvas 每格的像素數
const TAP_MOVE = 10 // 觸控：位移 < 10px 才算點擊
const TAP_MS = 250 // 觸控：按住 < 250ms 才算點擊
const DRAG_MOVE_MOUSE = 5 // 滑鼠：位移超過這麼多像素才算拖拉

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// 每區的短標籤（暱稱前兩字）；暱稱不常變，每次視圖更新才重算
let labels = []
watch(() => props.view, () => { labels = zoneLabels(toRaw(props.view)) }, { immediate: true })
const labelOf = i => labels[i] ?? `P${i + 1}`
const zoneColor = i => props.catalog?.relay?.colors?.[i] ?? ZONE_COLORS[i % ZONE_COLORS.length]

let ctx = null
let cw = 0
let ch = 0
let dpr = 1
let raf = 0
let observer = null
let dirty = true
const invalidate = () => { dirty = true }

// ── 相機 ─────────────────────────────────────────────────────────
let scale = 8 // 每格幾個畫面像素
let camX = 0 // 畫面左上角的世界座標
let camY = 0
let anim = null
const relay = () => toRaw(props.view).relay
const layout = () => relay()?.layout
// 浮動版面：地圖鋪滿整個舞台，面板浮在四周。insets 是被面板蓋住的邊，取景與置中都以「沒被蓋住的那塊」為準
let insets = { l: 0, r: 0, t: 0, b: 0 }
const freeW = () => Math.max(120, cw - insets.l - insets.r)
const freeH = () => Math.max(120, ch - insets.t - insets.b)
const freeX = () => insets.l + freeW() / 2 // 沒被蓋住那塊的中心（畫面像素）
const freeY = () => insets.t + freeH() / 2
const camCenter = () => ({ x: camX + freeX() / scale, y: camY + freeY() / scale })
function measureInsets() {
    insets = { l: 0, r: 0, t: 0, b: 0 }
    const game = wrapRef.value?.closest('.gt-game')
    const rail = game?.querySelector('.gt-rail')
    const side = game?.querySelector('.gt-side')
    const tray = game?.querySelector('.gt-tray')
    if (!game || !rail || !side || getComputedStyle(rail).position !== 'absolute') { uiInset.value = { ...insets }; return }
    const g = game.getBoundingClientRect()
    insets.l = rail.getBoundingClientRect().right - g.left + 14
    insets.r = g.right - side.getBoundingClientRect().left + 14
    insets.t = 14
    if (tray && getComputedStyle(tray).display !== 'none') insets.b = g.bottom - tray.getBoundingClientRect().top + 14
    uiInset.value = { ...insets }
}
const zoneScale = () => Math.min(freeW(), freeH()) / (layout()?.size ?? 25) // 縮放 1.0 的 scale
const zoomLevel = () => scale / zoneScale()
const maxScale = () => zoneScale() * 2.2
const minScale = () => fitScale() * 0.75

function fitScale() {
    const b = layout()?.bounds
    if (!b || !cw) return 8
    return Math.min(freeW() / (b.maxX - b.minX), freeH() / (b.maxY - b.minY))
}

function setCamera(nextScale, centerX, centerY) {
    scale = Math.min(maxScale(), Math.max(minScale(), nextScale))
    camX = centerX - freeX() / scale
    camY = centerY - freeY() / scale
    clampCamera()
    invalidate()
}

// 至少留 1/5 的範圍在畫面內，避免拖到找不到
function clampCamera() {
    const b = layout()?.bounds
    if (!b) return
    const vw = cw / scale
    const vh = ch / scale
    camX = Math.min(b.maxX - vw * 0.2, Math.max(b.minX - vw * 0.8, camX))
    camY = Math.min(b.maxY - vh * 0.2, Math.max(b.minY - vh * 0.8, camY))
}

function animateTo(nextScale, centerX, centerY, ms = 450) {
    const target = Math.min(maxScale(), Math.max(minScale(), nextScale))
    if (reducedMotion) { setCamera(target, centerX, centerY); return }
    anim = {
        t0: performance.now(), ms,
        from: { s: scale, x: camCenter().x, y: camCenter().y },
        to: { s: target, x: centerX, y: centerY },
    }
    invalidate()
}

function fit(smooth = false) {
    const b = layout()?.bounds
    if (!b) return
    const cx = (b.minX + b.maxX) / 2
    const cy = (b.minY + b.maxY) / 2
    if (smooth) animateTo(fitScale(), cx, cy)
    else setCamera(fitScale(), cx, cy)
}

function focusZone(i, smooth = true) {
    const l = layout()
    const z = l?.zones[i]
    if (!z) return
    const s = zoneScale() * 0.92
    if (smooth) animateTo(s, z.cx, z.cy)
    else setCamera(s, z.cx, z.cy)
}

function zoomAt(factor, px, py) {
    anim = null
    follow.value = false
    const wx = camX + px / scale
    const wy = camY + py / scale
    const next = Math.min(maxScale(), Math.max(minScale(), scale * factor))
    camX = wx - px / next
    camY = wy - py / next
    scale = next
    clampCamera()
    invalidate()
}
const zoomBy = factor => zoomAt(factor, freeX(), freeY())

function stepAnim(now) {
    if (!anim) return
    const k = Math.min(1, (now - anim.t0) / anim.ms)
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
    scale = anim.from.s + (anim.to.s - anim.from.s) * e
    const cx = anim.from.x + (anim.to.x - anim.from.x) * e
    const cy = anim.from.y + (anim.to.y - anim.from.y) * e
    camX = cx - freeX() / scale
    camY = cy - freeY() / scale
    if (k >= 1) anim = null
}

// ── 尺寸 ─────────────────────────────────────────────────────────
let fitted = false
function resize() {
    const el = wrapRef.value
    const canvas = canvasRef.value
    if (!el || !canvas) return
    const oldCx = cw ? camCenter().x : null
    const oldCy = ch ? camCenter().y : null
    cw = Math.max(1, Math.floor(el.clientWidth))
    ch = Math.max(1, Math.floor(el.clientHeight))
    measureInsets()
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.style.width = `${cw}px`
    canvas.style.height = `${ch}px`
    canvas.width = cw * dpr
    canvas.height = ch * dpr
    ctx = canvas.getContext('2d')
    if (layout() && (!fitted || oldCx === null)) { focusZone(watchIndex(), false); fitted = true } else if (oldCx !== null) setCamera(scale, oldCx, oldCy)
    invalidate()
}

// ── 座標與命中 ───────────────────────────────────────────────────
const worldOf = ({ x, y }) => ({ x: camX + x / scale, y: camY + y / scale })

// 世界座標落在哪一區的哪一格；不在任何區回傳 null
function hitZone(w) {
    const l = layout()
    if (!l) return null
    for (let i = 0; i < l.zones.length; i++) {
        const o = l.zones[i].origin
        const x = Math.floor(w.x - o.x)
        const y = Math.floor(w.y - o.y)
        if (x >= 0 && y >= 0 && x < l.size && y < l.size) return { zone: i, x, y }
    }
    return null
}

const watchIndex = () => relay()?.watchZone ?? 0

// ── 輸入 ─────────────────────────────────────────────────────────
const pointers = new Map() // id → { x, y, sx, sy, t0, type }
let dragged = false // 這一次手勢已經是平移或縮放：放開時不算點擊
let pinchDist = 0
let lastTap = { t: 0, zone: -1, x: -1, y: -1 }

function localPos(e) {
    const r = canvasRef.value.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
}

function onDown(e) {
    canvasRef.value.setPointerCapture(e.pointerId)
    const pos = localPos(e)
    pointers.set(e.pointerId, { ...pos, sx: pos.x, sy: pos.y, t0: performance.now(), type: e.pointerType, from: pointers.size === 0 ? nearestZone() : -1 })
    if (pointers.size === 1) dragged = false
    if (e.pointerType === 'mouse' && spaceDown.value) dragged = true // 空白鍵加拖拉：一按下就是平移
    if (pointers.size === 2) {
        dragged = true // 雙指：整次手勢都不算點擊
        pinchDist = pinchLength()
    }
    anim = null
}

const pinchLength = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
}

function onMove(e) {
    const pos = localPos(e)
    if (e.pointerType === 'mouse') {
        const hit = hitZone(worldOf(pos))
        hover.value = hit && hit.zone === watchIndex() ? hit : null
    }
    const p = pointers.get(e.pointerId)
    if (!p) return

    if (pointers.size === 2) {
        // 捏合縮放，同時跟著兩指中點平移
        const [a, b] = [...pointers.values()]
        const beforeMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        p.x = pos.x
        p.y = pos.y
        const midNow = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        const dist = pinchLength()
        camX -= (midNow.x - beforeMid.x) / scale
        camY -= (midNow.y - beforeMid.y) / scale
        if (pinchDist > 0) zoomAt(dist / pinchDist, midNow.x, midNow.y)
        else { clampCamera(); invalidate() }
        pinchDist = dist
        return
    }

    const moved = Math.hypot(pos.x - p.sx, pos.y - p.sy)
    if (!dragged && moved >= (p.type === 'mouse' ? DRAG_MOVE_MOUSE : TAP_MOVE)) dragged = true
    if (dragged) {
        follow.value = false
        camX -= (pos.x - p.x) / scale
        camY -= (pos.y - p.y) / scale
        clampCamera()
        invalidate()
    }
    p.x = pos.x
    p.y = pos.y
}

function onUp(e) {
    const p = pointers.get(e.pointerId)
    const pos = localPos(e)
    const wasOnly = pointers.size === 1
    pointers.delete(e.pointerId)
    if (p && wasOnly && dragged && p.type !== 'mouse' && e.type === 'pointerup') snapToZone(p.from, pos.x - p.sx)
    if (!p || !wasOnly || dragged || e.type !== 'pointerup') return
    // 觸控：位移 < 10px 且按住 < 250ms 才是點擊（滑鼠沒有時間限制）
    if (p.type !== 'mouse' && performance.now() - p.t0 >= TAP_MS) return
    tap(hitZone(worldOf(pos)), p.type)
}

function tap(hit, pointerType) {
    const now = performance.now()
    const again = hit && now - lastTap.t < 300 && lastTap.zone === hit.zone && lastTap.x === hit.x && lastTap.y === hit.y
    lastTap = hit ? { t: now, zone: hit.zone, x: hit.x, y: hit.y } : { t: 0, zone: -1, x: -1, y: -1 }
    if (again && pointerType === 'mouse') return // 雙擊的第二下交給 dblclick（聚焦），不再放一次
    if (!hit) {
        emit('clear')
        return
    }
    const zones = relay().zones
    // 點到別區：切換成那一區（單人可操作那一區、多人是改看那一區）
    if (hit.zone !== watchIndex()) {
        armed.value = null
        emit('zone', zones[hit.zone].id)
        return
    }
    const v = toRaw(props.view)
    const tower = v.towers.find(t => t.x === hit.x && t.y === hit.y)
    if (tower) {
        armed.value = null
        emit('tower', tower)
        return
    }
    if (!props.pendingGem) {
        emit('clear')
        return
    }
    const confirmed = pointerType === 'mouse' || (armed.value?.x === hit.x && armed.value?.y === hit.y)
    if (confirmed) {
        armed.value = null
        emit('cell', hit.x, hit.y)
    } else {
        armed.value = { x: hit.x, y: hit.y }
    }
}

function onDblClick(e) {
    const hit = hitZone(worldOf(localPos(e)))
    if (!hit) return
    if (hit.zone !== watchIndex()) emit('zone', relay().zones[hit.zone].id)
    focusZone(hit.zone)
}

function onWheel(e) {
    // 橫向滾動或 Shift＋滾輪：左右平移；一般滾輪：縮放
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        follow.value = false
        anim = null
        camX += (e.deltaX || e.deltaY) / scale
        clampCamera()
        invalidate()
        return
    }
    const { x, y } = localPos(e)
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y)
}

const zoneChips = computed(() => {
    const names = zoneLabels(props.view)
    return (props.view.relay?.zones ?? []).map((z, i) => ({ id: z.id, index: i, label: names[i], color: zoneColor(i), on: z.id === props.view.watching }))
})
function jumpZone(i) {
    const z = relay()?.zones[i]
    if (!z) return
    follow.value = false
    emit('zone', z.id)
    focusZone(i)
}

// 觸控滑動放開：整區大小的縮放下，吸附到最近的一區（放大看細節時不吸附）
function nearestZone() {
    const l = layout()
    const c = camCenter()
    let best = 0
    let bestD = Infinity
    l?.zones.forEach((z, i) => {
        const d = Math.hypot(z.cx - c.x, z.cy - c.y)
        if (d < bestD) { bestD = d; best = i }
    })
    return best
}
// from：開始滑動時的那一區；dx：這次滑了多少像素。滑超過一小段就直接換到相鄰的一區（區與區隔很遠，不用拖好幾下）
function snapToZone(from, dx) {
    const l = layout()
    if (!l || follow.value || zoomLevel() > 1.05) return
    const n = l.zones.length
    const best = Math.abs(dx) > 40 && from >= 0 ? Math.min(n - 1, Math.max(0, from + (dx < 0 ? 1 : -1))) : nearestZone()
    if (best !== watchIndex()) emit('zone', relay().zones[best].id)
    focusZone(best)
}

function stepZone(d) {
    const zones = relay()?.zones
    if (!zones?.length) return
    const i = (watchIndex() + d + zones.length) % zones.length
    follow.value = false
    emit('zone', zones[i].id)
    focusZone(i)
}

function toggleFollow() {
    follow.value = !follow.value
    if (follow.value && zoomLevel() < 0.6) animateTo(zoneScale() * 0.75, camCenter().x, camCenter().y)
}

function isTyping(t) {
    return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName))
}
function onKeyDown(e) {
    if (e.code === 'Space' && !isTyping(e.target)) {
        if (!spaceDown.value) spaceDown.value = true
        e.preventDefault() // 不讓頁面跟著捲動
    }
}
function onKeyUp(e) {
    if (e.code === 'Space') spaceDown.value = false
}

// ── 圖片 ─────────────────────────────────────────────────────────
const images = new Map()
let imageVersion = 0
function imageOf(url) {
    let img = images.get(url)
    if (!img) {
        img = new Image()
        img.onload = () => { imageVersion++; invalidate() }
        img.src = url
        images.set(url, img)
    }
    return img.complete && img.naturalWidth ? img : null
}

// ── 每區的資料與離屏畫布 ─────────────────────────────────────────
// zoneData[i]：{ towers: [{id,x,y,kind,level,fresh,kills}], path: [x,y,...], sig, canvas, drawnSig }
const zoneData = []
let towerIndex = new Map() // 塔 id → { wx, wy, kind }（射擊線用）
const rankOf = (steps, kills) => { let n = 0; while (steps && n < steps.length && kills >= steps[n]) n++; return n }

function syncZones() {
    const r = relay()
    if (!r) return
    const steps = toRaw(props.catalog)?.mastery?.kills
    towerIndex = new Map()
    r.zones.forEach((z, i) => {
        const towers = z.towers.map(([id, x, y, kind, level, fresh, kills]) => ({ id, x, y, kind, level, fresh: !!fresh, rank: rankOf(steps, kills) }))
        const sig = `${towers.map(t => `${t.id}@${t.x},${t.y}${t.kind}${t.level}${t.fresh ? 1 : 0}${t.rank}`).join('|')}#${imageVersion}`
        const d = (zoneData[i] ??= { canvas: null, drawnSig: null })
        d.towers = towers
        d.path = z.path
        d.sig = sig
        const o = r.layout.zones[i].origin
        for (const t of towers) towerIndex.set(t.id, { wx: o.x + t.x + 0.5, wy: o.y + t.y + 0.5, kind: t.kind })
    })
    zoneData.length = r.zones.length
    invalidate()
}

function drawGemTo(c, kind, level, cx, cy, cell) {
    const special = isSpecial(kind)
    const drawn = cell * (special ? 1.2 : Math.min(1.15, gemScale(level) * 1.35))
    const img = imageOf(towerImage(kind))
    if (img) {
        c.drawImage(img, cx - drawn / 2, cy - drawn / 2, drawn, drawn)
    } else {
        c.fillStyle = GEM_LOOK[kind]?.color ?? '#999'
        c.beginPath()
        c.arc(cx, cy, drawn / 2.4, 0, Math.PI * 2)
        c.fill()
    }
}

let cloth = null
function clothOf(board) {
    if (cloth?.board === board) return cloth.canvas
    const canvas = document.createElement('canvas')
    canvas.width = board.width
    canvas.height = board.height
    const c = canvas.getContext('2d')
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            c.fillStyle = [COLOR.cloth, COLOR.tint, COLOR.cross][(x % 2) + (y % 2)]
            c.fillRect(x, y, 1, 1)
        }
    }
    cloth = { board, canvas }
    return canvas
}

// 一區的地板、路徑點、餅乾牆、塔：畫在自己的離屏 canvas，塔有變動才重畫
function renderZone(i) {
    const d = zoneData[i]
    const board = toRaw(props.view).board
    if (!d || !board) return
    if (d.drawnSig === d.sig && d.canvas) return
    const size = board.width * CPX
    if (!d.canvas) d.canvas = document.createElement('canvas')
    if (d.canvas.width !== size) { d.canvas.width = size; d.canvas.height = size }
    const c = d.canvas.getContext('2d')
    c.clearRect(0, 0, size, size)
    c.imageSmoothingEnabled = false
    c.drawImage(clothOf(board), 0, 0, size, size)
    c.imageSmoothingEnabled = true

    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (const [pt, url, fallback] of [[board.start, NEST_IMAGE, '#2E9E5B'], [board.end, CAKE_IMAGE, '#E8541E']]) {
        const img = imageOf(url)
        const cx = (pt.x + 0.5) * CPX
        const cy = (pt.y + 0.5) * CPX
        if (img) c.drawImage(img, cx - CPX * 0.625, cy - CPX * 0.625, CPX * 1.25, CPX * 1.25)
        else { c.fillStyle = fallback; c.beginPath(); c.arc(cx, cy, CPX * 0.5, 0, Math.PI * 2); c.fill() }
    }
    board.checkpoints.forEach((p, k) => {
        const cx = (p.x + 0.5) * CPX
        const cy = (p.y + 0.5) * CPX
        const candy = imageOf(CHECKPOINT_IMAGE)
        if (candy) c.drawImage(candy, cx - CPX * 0.55, cy - CPX * 0.55, CPX * 1.1, CPX * 1.1)
        else { c.fillStyle = COLOR.path; c.beginPath(); c.arc(cx, cy, CPX * 0.5, 0, Math.PI * 2); c.fill() }
        c.fillStyle = '#FFFFFF'
        c.strokeStyle = '#7A1530'
        c.lineWidth = Math.max(2, CPX * 0.12)
        c.lineJoin = 'round'
        c.font = `700 ${CPX * 0.62}px 'Noto Sans TC', sans-serif`
        c.strokeText(String(k + 1), cx, cy + CPX * 0.04)
        c.fillText(String(k + 1), cx, cy + CPX * 0.04)
    })

    const color = zoneColor(i)
    for (const t of d.towers) {
        const x = t.x * CPX
        const y = t.y * CPX
        if (t.kind === 'stone') { drawCookie(c, x, y); continue }
        // 該區的代表色：塔底與外框
        c.fillStyle = `${color}33`
        c.fillRect(x + CPX * 0.04, y + CPX * 0.04, CPX * 0.92, CPX * 0.92)
        c.strokeStyle = color
        c.lineWidth = Math.max(1.5, CPX * (t.fresh ? 0.1 : 0.06))
        c.strokeRect(x + CPX * 0.06, y + CPX * 0.06, CPX * 0.88, CPX * 0.88)
        drawGemTo(c, t.kind, t.level, x + CPX / 2, y + CPX / 2, CPX * (1 + 0.025 * t.rank))
        if (!isSpecial(t.kind)) {
            const badge = CPX * 0.2
            c.fillStyle = COLOR.ink
            c.beginPath()
            c.arc(x + badge, y + CPX - badge, badge, 0, Math.PI * 2)
            c.fill()
            c.fillStyle = '#FFFFFF'
            c.font = `700 ${CPX * 0.3}px 'Noto Sans TC', sans-serif`
            c.fillText(String(t.level), x + badge, y + CPX - badge + CPX * 0.01)
        }
        if (t.rank) {
            c.fillStyle = '#F2B632'
            c.strokeStyle = COLOR.ink
            c.lineWidth = Math.max(1, CPX * 0.04)
            c.font = `800 ${CPX * 0.32}px 'Noto Sans TC', sans-serif`
            c.strokeText(`★${t.rank}`, x + CPX * 0.74, y + CPX * 0.18)
            c.fillText(`★${t.rank}`, x + CPX * 0.74, y + CPX * 0.18)
        }
    }
    d.drawnSig = d.sig
}

function drawCookie(c, x, y) {
    const inset = CPX * 0.05
    const s = CPX - inset * 2
    c.fillStyle = COLOR.cookieEdge
    c.fillRect(x + inset, y + inset, s, s)
    c.fillStyle = COLOR.cookie
    c.fillRect(x + inset * 2, y + inset * 2, s - inset * 2, s - inset * 2)
    c.fillStyle = COLOR.chip
    for (const [dx, dy] of [[0.3, 0.32], [0.68, 0.42], [0.42, 0.7]]) c.fillRect(x + CPX * dx - CPX * 0.05, y + CPX * dy - CPX * 0.05, CPX * 0.1, CPX * 0.1)
}

// ── 蟲子補間（伺服器 5 幀 / 秒）──────────────────────────────────
let prevMap = new Map()
let curMap = new Map()
let curAt = 0
let frameGap = 200
const shots = []
const fx = [] // { kind, zone, text, born }
const ghosts = [] // { x, y, born, born_zone }
const FX_MS = 750
const GHOST_MS = 320
const SHOT_MS = 170
const facing = new Map()

const catalogRaw = () => toRaw(props.catalog)

watch(() => props.frame, (frame) => {
    if (!frame || !frame.ring) {
        hasBoss.value = false
        prevMap = new Map()
        curMap = new Map()
        shots.length = 0
        fx.length = 0
        ghosts.length = 0
        facing.clear()
        invalidate()
        return
    }
    const now = performance.now()
    frameGap = Math.min(600, Math.max(80, now - curAt))
    curAt = now
    prevMap = curMap
    curMap = new Map(frame.m.map(([id, type, x, y, hp, flags, born, relieved, zone]) => [id, { type, x: x / 10, y: y / 10, hp, flags, born, relieved, zone }]))

    const bossNow = frame.m.some(row => catalogRaw()?.monsters?.[row[1]]?.boss)
    if (bossNow && !hasBoss.value) follow.value = !!toRaw(props.view).nextWave?.test // 傷害測試預設聚焦巨獸；一般首領手動開
    if (hasBoss.value !== bossNow) hasBoss.value = bossNow
    if (!bossNow) follow.value = false

    // 消失的蟲：不在出口附近就是被打死的，放一個淡出的小爆點
    const l = layout()
    if (l && !reducedMotion) {
        for (const [id, m] of prevMap) {
            if (curMap.has(id)) continue
            facing.delete(id)
            const nearExit = l.zones.some(z => Math.hypot(m.x - (z.origin.x + toRaw(props.view).board.end.x + 0.5), m.y - (z.origin.y + toRaw(props.view).board.end.y + 0.5)) < 2.5)
            if (!nearExit) {
                if (ghosts.length > 40) ghosts.shift()
                ghosts.push({ x: m.x, y: m.y, born: now, type: m.type, from: m.born })
            }
        }
    }
    for (const [towerId, monsterId] of frame.s) {
        const tower = towerIndex.get(towerId)
        if (tower) shots.push({ tower, monsterId, born: now })
    }
    for (const [kind, zone, value] of frame.e ?? []) fx.push({ kind, zone, text: kind === 1 ? `−${value}` : '', born: now })
}, { flush: 'sync' })

function monsterPos(id, m, t) {
    const prev = prevMap.get(id)
    if (!prev) return m
    // 換區（輸送帶 ↔ 區內）座標本來就連續，直接補間即可
    return { x: prev.x + (m.x - prev.x) * t, y: prev.y + (m.y - prev.y) * t }
}

// ── 繪製 ─────────────────────────────────────────────────────────
const px = v => v / scale // 畫面像素 → 世界單位

function visible(rect, pad = 0) {
    const vw = cw / scale
    const vh = ch / scale
    return rect.x1 + pad >= camX && rect.x0 - pad <= camX + vw && rect.y1 + pad >= camY && rect.y0 - pad <= camY + vh
}

function drawZones(l, simple, now) {
    const board = toRaw(props.view).board
    const view = toRaw(props.view)
    const zones = view.relay.zones
    for (let i = 0; i < l.zones.length; i++) {
        const o = l.zones[i].origin
        const rect = { x0: o.x, y0: o.y, x1: o.x + l.size, y1: o.y + l.size }
        if (!visible(rect)) continue
        const color = zoneColor(i)
        const isWatched = i === watchIndex()
        drawTray(o, l.size)
        if (simple) {
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(o.x, o.y, l.size, l.size)
            ctx.fillStyle = `${color}22`
            ctx.fillRect(o.x, o.y, l.size, l.size)
        } else {
            renderZone(i)
            const d = zoneData[i]
            if (d?.canvas) ctx.drawImage(d.canvas, o.x, o.y, l.size, l.size)
        }
        // 邊框：該區代表色；正在看的那區加粗
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(px(isWatched ? 3.5 : 2), isWatched ? 0.5 : 0.3)
        ctx.strokeRect(o.x, o.y, l.size, l.size)

        const z = zones[i]
        if (simple) {
            // 簡化顯示：區域上方大字區號，下面一行路徑長度
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.font = `800 ${px(Math.min(64, Math.max(34, scale * 6)))}px 'Noto Sans TC', sans-serif`
            ctx.fillStyle = color
            ctx.globalAlpha = 0.9
            ctx.fillText(labelOf(i), o.x + l.size / 2, o.y + l.size / 2 - px(10))
            ctx.font = `700 ${px(15)}px 'Noto Sans TC', sans-serif`
            ctx.fillText(`路徑 ${z.pathLength}${z.bot ? '・電腦' : ''}`, o.x + l.size / 2, o.y + l.size / 2 + px(26))
            ctx.globalAlpha = 1
        } else {
            drawZoneBadge(o, i, z, color)
        }
        if (showRoutes.value) drawRoute(o, zoneData[i]?.path, color, simple)
    }
    void board
    void now
}

// 烤盤：銀色金屬邊加一圈落地陰影，讓每一區像放在桌上的一個盤子
function drawTray(o, size) {
    const rim = Math.max(0.55, px(7))
    ctx.save()
    ctx.shadowColor = 'rgba(40,20,5,0.5)'
    ctx.shadowBlur = 18 * dpr
    ctx.shadowOffsetY = 7 * dpr
    const g = ctx.createLinearGradient(o.x, o.y, o.x + size, o.y + size)
    g.addColorStop(0, '#E6E9EC')
    g.addColorStop(1, '#A2A8AF')
    ctx.fillStyle = g
    ctx.fillRect(o.x - rim, o.y - rim, size + rim * 2, size + rim * 2)
    ctx.restore()
}

// 每區角落：P1～P6 與目前路徑長度
function drawZoneBadge(o, i, z, color) {
    const label = `${labelOf(i)}・路徑 ${z.pathLength}${z.bot ? (z.left ? '・已離開' : '・電腦') : ''}`
    const fontPx = Math.max(10, scale * 0.8)
    ctx.font = `700 ${px(fontPx)}px 'Noto Sans TC', sans-serif`
    const w = ctx.measureText(label).width + px(12)
    const h = px(fontPx + 8)
    ctx.fillStyle = color
    ctx.fillRect(o.x, o.y, w, h)
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, o.x + px(6), o.y + h / 2)
}

function drawRoute(o, path, color, simple) {
    if (!path || path.length < 4) return
    ctx.beginPath()
    for (let k = 0; k < path.length; k += 2) {
        const x = o.x + path[k] + 0.5
        const y = o.y + path[k + 1] + 0.5
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    }
    ctx.strokeStyle = color
    ctx.globalAlpha = simple ? 0.55 : 0.7
    ctx.lineWidth = Math.max(px(2.5), simple ? 0.35 : 0.22)
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.globalAlpha = 1
}

function drawMonstersFull(catalog, now) {
    const t = Math.min(1, (now - curAt) / frameGap)
    const types = catalog?.monsters ?? []
    const vw = cw / scale
    const vh = ch / scale
    for (const [id, m] of curMap) {
        const pos = monsterPos(id, m, t)
        if (pos.x < camX - 3 || pos.y < camY - 3 || pos.x > camX + vw + 3 || pos.y > camY + vh + 3) continue
        const type = types[m.type]?.id ?? 'normal'
        const look = MONSTER_LOOK[type]
        const r = look.size
        const color = zoneColor(m.born)

        ctx.fillStyle = 'rgba(74,44,42,0.22)'
        ctx.beginPath()
        ctx.ellipse(pos.x, pos.y + r * 0.8, r, r * 0.3, 0, 0, Math.PI * 2)
        ctx.fill()

        // 出生區的顏色底盤：整隻蟲「坐」在自己玩家的顏色上
        ctx.fillStyle = `${color}66`
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r * 1.35, 0, Math.PI * 2)
        ctx.fill()

        // 出生區的顏色環；已傳給後援的蟲外面再加白色外框
        ctx.lineWidth = Math.max(px(2.5), r * 0.18)
        if (m.relieved) {
            ctx.strokeStyle = '#FFFFFF'
            ctx.lineWidth = Math.max(px(5.5), r * 0.36)
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, r * 1.12, 0, Math.PI * 2)
            ctx.stroke()
            ctx.lineWidth = Math.max(px(2.5), r * 0.18)
        }
        ctx.strokeStyle = color
        ctx.beginPath()
        ctx.arc(pos.x, pos.y, r * 1.12, 0, Math.PI * 2)
        ctx.stroke()

        const img = imageOf(monsterImage(type))
        if (img) {
            const prev = prevMap.get(id)
            if (prev && Math.abs(m.x - prev.x) > 0.01) facing.set(id, m.x > prev.x)
            ctx.save()
            ctx.translate(pos.x, pos.y)
            ctx.scale(facing.get(id) ? -1 : 1, 1)
            ctx.drawImage(img, -r * 1.25, -r * 1.25, r * 2.5, r * 2.5)
            ctx.restore()
        } else {
            ctx.fillStyle = look.color
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2)
            ctx.fill()
        }
        if (m.flags & 1) {
            ctx.strokeStyle = '#2F7FD1'
            ctx.lineWidth = Math.max(px(1.5), 0.08)
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, r * 1.3, 0, Math.PI * 2)
            ctx.stroke()
        }
        if (m.flags & 2) {
            ctx.fillStyle = '#2E9E5B'
            ctx.beginPath()
            ctx.arc(pos.x + r * 0.9, pos.y - r * 0.9, r * 0.28, 0, Math.PI * 2)
            ctx.fill()
        }
        const traitId = m.flags >= 4 ? catalog?.traitIds.find((_, k) => m.flags & (4 << k)) : null
        if (traitId) {
            ctx.strokeStyle = catalog.traits[traitId].color
            ctx.lineWidth = Math.max(px(1.5), 0.06)
            ctx.setLineDash([0.28, 0.2])
            ctx.beginPath()
            ctx.arc(pos.x, pos.y, r * 1.5, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
        }
        if (scale >= 9) drawOwnerTag(pos.x, pos.y + r * 1.55, m.born, color, m.relieved)
        if (scale >= 14) {
            const w = Math.max(0.8, r * 2)
            const h = Math.max(px(2), 0.11)
            const by = pos.y - r - h * 2.4
            ctx.fillStyle = COLOR.ink
            ctx.fillRect(pos.x - w / 2, by, w, h)
            ctx.fillStyle = m.hp > 50 ? '#3CCB72' : m.hp > 25 ? '#F2B233' : '#F0506E'
            ctx.fillRect(pos.x - w / 2, by, (w * m.hp) / 100, h)
        }
    }
}

// 蟲腳下的小標籤：P1、P2…，是哪一區出的蟲；已經漏到別區的加一個箭頭
function drawOwnerTag(x, y, born, color, relieved) {
    const size = Math.max(px(11), 0.5)
    const label = `${labelOf(born)}${relieved ? ' →' : ''}`
    ctx.font = `800 ${size}px 'Noto Sans TC', sans-serif`
    const w = ctx.measureText(label).width + size * 0.8
    const h = size * 1.35
    ctx.fillStyle = color
    ctx.fillRect(x - w / 2, y, w, h)
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, x, y + h / 2 + size * 0.04)
}

// 簡化顯示：附近、同出生區的蟲合成一個帶數量的圓點
function drawMonstersSimple(now) {
    const t = Math.min(1, (now - curAt) / frameGap)
    const cellSize = 7
    const buckets = new Map()
    for (const [id, m] of curMap) {
        const pos = monsterPos(id, m, t)
        const key = `${m.born}:${m.relieved}:${Math.floor(pos.x / cellSize)}:${Math.floor(pos.y / cellSize)}`
        const b = buckets.get(key)
        if (b) { b.x += pos.x; b.y += pos.y; b.n++ } else buckets.set(key, { x: pos.x, y: pos.y, n: 1, born: m.born, relieved: m.relieved })
    }
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const b of buckets.values()) {
        const x = b.x / b.n
        const y = b.y / b.n
        const r = px(Math.min(20, 8 + Math.sqrt(b.n) * 2.6))
        ctx.fillStyle = zoneColor(b.born)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.lineWidth = px(b.relieved ? 3 : 1.5)
        ctx.strokeStyle = b.relieved ? '#FFFFFF' : 'rgba(255,255,255,0.7)'
        ctx.stroke()
        ctx.fillStyle = '#FFFFFF'
        ctx.font = `800 ${px(Math.min(20, 9 + Math.sqrt(b.n) * 2.2))}px 'Noto Sans TC', sans-serif`
        ctx.fillText(String(b.n), x, y + px(1))
    }
}

function drawShots(now) {
    if (scale < 8) { shots.length = 0; return }
    const t = Math.min(1, (now - curAt) / frameGap)
    for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i]
        const age = now - s.born
        const target = curMap.get(s.monsterId)
        if (age > SHOT_MS || !target) { shots.splice(i, 1); continue }
        const pos = monsterPos(s.monsterId, target, t)
        if (!visible({ x0: Math.min(pos.x, s.tower.wx), y0: Math.min(pos.y, s.tower.wy), x1: Math.max(pos.x, s.tower.wx), y1: Math.max(pos.y, s.tower.wy) })) continue // 畫面外的射擊不畫
        ctx.globalAlpha = 1 - age / SHOT_MS
        ctx.strokeStyle = GEM_LOOK[s.tower.kind]?.color ?? COLOR.ink
        ctx.lineWidth = Math.max(px(1.5), 0.09)
        ctx.beginPath()
        ctx.moveTo(s.tower.wx, s.tower.wy)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
        ctx.globalAlpha = 1
    }
}

function drawGhosts(now) {
    for (let i = ghosts.length - 1; i >= 0; i--) {
        const g = ghosts[i]
        const k = (now - g.born) / GHOST_MS
        if (k >= 1) { ghosts.splice(i, 1); continue }
        ctx.globalAlpha = 1 - k
        ctx.strokeStyle = zoneColor(g.from)
        ctx.lineWidth = Math.max(px(2), 0.12)
        ctx.beginPath()
        ctx.arc(g.x, g.y, 0.3 + k * 0.9, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
    }
}

// 傳給後援：出口閃箭頭；扣血：出口閃紅並跳「−N」
function drawFx(l, now) {
    const board = toRaw(props.view).board
    if (!board) return
    for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i]
        const k = (now - f.born) / FX_MS
        if (k >= 1) { fx.splice(i, 1); continue }
        const o = l.zones[f.zone]?.origin
        if (!o) { fx.splice(i, 1); continue }
        const ex = o.x + board.end.x + 0.5
        const ey = o.y + board.end.y + 0.5
        if (f.kind === 0) {
            drawTeleport(l, f, k, ex, ey)
        } else {
            ctx.globalAlpha = (1 - k) * 0.6
            ctx.fillStyle = '#E02A3F'
            ctx.beginPath()
            ctx.arc(ex, ey, Math.max(px(14), 1.2) * (0.6 + k), 0, Math.PI * 2)
            ctx.fill()
            ctx.globalAlpha = 1 - k * k
            const size = Math.max(px(20), 1.4)
            ctx.font = `800 ${size}px 'Noto Sans TC', sans-serif`
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.lineWidth = size * 0.2
            ctx.strokeStyle = COLOR.ink
            ctx.lineJoin = 'round'
            ctx.strokeText(f.text, ex, ey - k * size * 1.6)
            ctx.fillStyle = '#FF8896'
            ctx.fillText(f.text, ex, ey - k * size * 1.6)
        }
        ctx.globalAlpha = 1
    }
}

// 漏怪傳送：出口 → 下一區入口的弧線，箭頭沿線飛過去，入口綻開一圈該區顏色的光
function drawTeleport(l, f, k, ex, ey) {
    const conv = l.conveyors[f.zone]
    if (!conv) return
    const [tx, ty] = conv.points[1]
    const color = zoneColor(f.zone)
    const dist = Math.hypot(tx - ex, ty - ey)
    const cx = (ex + tx) / 2
    const cy = Math.min(ey, ty) - Math.max(6, dist * 0.18)
    const at = (u) => ({
        x: (1 - u) * (1 - u) * ex + 2 * (1 - u) * u * cx + u * u * tx,
        y: (1 - u) * (1 - u) * ey + 2 * (1 - u) * u * cy + u * u * ty,
    })
    const e = Math.min(1, k * 1.6)
    ctx.save()
    ctx.globalAlpha = Math.min(1, (1 - k) * 1.4)
    ctx.lineCap = 'round'
    ctx.setLineDash([Math.max(px(9), 0.9), Math.max(px(7), 0.7)])
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = Math.max(px(6), 0.45)
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.quadraticCurveTo(cx, cy, at(e).x, at(e).y)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.lineWidth = Math.max(px(3.5), 0.26)
    ctx.stroke()
    ctx.setLineDash([])
    // 飛行的箭頭
    const a = at(e)
    const b = at(Math.min(1, e + 0.02))
    ctx.translate(a.x, a.y)
    ctx.rotate(Math.atan2(b.y - a.y, b.x - a.x))
    const s = Math.max(px(11), 1)
    ctx.fillStyle = color
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = Math.max(px(1.5), 0.1)
    ctx.beginPath()
    ctx.moveTo(s, 0)
    ctx.lineTo(-s * 0.6, s * 0.8)
    ctx.lineTo(-s * 0.2, 0)
    ctx.lineTo(-s * 0.6, -s * 0.8)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    // 入口光圈
    if (k > 0.35) {
        const kk = (k - 0.35) / 0.65
        ctx.globalAlpha = (1 - kk) * 0.8
        ctx.strokeStyle = color
        ctx.lineWidth = Math.max(px(3), 0.2)
        ctx.beginPath()
        ctx.arc(tx, ty, Math.max(px(8), 0.8) + kk * Math.max(px(20), 1.8), 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
    }
}

function drawRange(kind, level, cx, cy, color) {
    const c = toRaw(props.catalog)
    const stats = isSpecial(kind) ? c?.specials[kind]?.stats : c?.gems[kind]?.levels[level - 1]
    if (!stats) return
    ctx.beginPath()
    ctx.arc(cx, cy, stats.range, 0, Math.PI * 2)
    ctx.fillStyle = `${color}14`
    ctx.fill()
    ctx.strokeStyle = `${color}99`
    ctx.lineWidth = Math.max(px(1.5), 0.05)
    ctx.stroke()
}

// 選中的塔、擺放預覽（只在正在看的那一區）
function drawOverlays(l) {
    const view = toRaw(props.view)
    const o = l.zones[watchIndex()]?.origin
    if (!o) return
    const selected = view.towers.find(t => t.id === props.selectedId)
    if (selected) {
        if (selected.kind !== 'stone') drawRange(selected.kind, selected.level, o.x + selected.x + 0.5, o.y + selected.y + 0.5, '#4A2C2A')
        ctx.strokeStyle = COLOR.path
        ctx.lineWidth = Math.max(px(2), 0.1)
        ctx.strokeRect(o.x + selected.x, o.y + selected.y, 1, 1)
    }
    const ghost = armed.value ?? hover.value
    const gem = props.pendingGem
    if (!gem || !ghost || view.towers.some(t => t.x === ghost.x && t.y === ghost.y)) return
    const { board } = view
    const onStop = [board.start, board.end, ...board.checkpoints].some(p => p.x === ghost.x && p.y === ghost.y)
    let label = ''
    let blocked = false
    if (!onStop) {
        const taken = new Set(view.towers.map(t => t.y * board.width + t.x))
        const now = fullPathLength(board, (x, y) => taken.has(y * board.width + x))
        const next = fullPathLength(board, (x, y) => taken.has(y * board.width + x) || (x === ghost.x && y === ghost.y))
        blocked = next < 0
        label = blocked ? '封路，不能放' : `路線 ${next - now >= 0 ? '+' : ''}${next - now}`
    }
    const cx = o.x + ghost.x + 0.5
    const cy = o.y + ghost.y + 0.5
    if (blocked) {
        ctx.fillStyle = 'rgba(214,48,90,0.35)'
        ctx.fillRect(o.x + ghost.x, o.y + ghost.y, 1, 1)
    } else {
        drawRange(gem.kind, gem.level, cx, cy, GEM_LOOK[gem.kind].color)
        const img = imageOf(towerImage(gem.kind))
        const d = isSpecial(gem.kind) ? 1.2 : Math.min(1.15, gemScale(gem.level) * 1.35)
        ctx.globalAlpha = 0.75
        if (img) ctx.drawImage(img, cx - d / 2, cy - d / 2, d, d)
        ctx.globalAlpha = 1
    }
    if (label) {
        const size = Math.max(px(12), 0.5)
        ctx.font = `700 ${size}px sans-serif`
        ctx.textAlign = 'left'
        ctx.textBaseline = 'bottom'
        ctx.lineWidth = size * 0.28
        ctx.strokeStyle = '#4A2C2A'
        ctx.strokeText(label, cx + 0.7, cy - 0.6)
        ctx.fillStyle = blocked ? '#FF9AA8' : '#FFFFFF'
        ctx.fillText(label, cx + 0.7, cy - 0.6)
    }
}

// 首領的位置（補間後）；沒有首領回傳 null
function bossPosition(now) {
    const types = catalogRaw()?.monsters ?? []
    const t = Math.min(1, (now - curAt) / frameGap)
    for (const [id, m] of curMap) {
        if (types[m.type]?.boss) return monsterPos(id, m, t)
    }
    return null
}

function followBoss(now) {
    if (!follow.value || anim) return
    const b = bossPosition(now)
    if (!b) return
    const { x: cx, y: cy } = camCenter()
    const want = zoneScale() * 0.75
    if (scale < want * 0.97) scale = Math.min(want, scale * 1.04)
    camX += (b.x - cx) * 0.14 - 0
    camY += (b.y - cy) * 0.14 - 0
    clampCamera()
}

let lastCam = ''
let lastCamAt = 0
function emitCamera(now) {
    if (now - lastCamAt < 90) return
    const key = [camX, camY, cw / scale, ch / scale].map(v => v.toFixed(1)).join(',')
    if (key === lastCam) return
    lastCam = key
    lastCamAt = now
    emit('camera', { x: camX + insets.l / scale, y: camY + insets.t / scale, w: freeW() / scale, h: freeH() / scale })
}

function draw(now) {
    raf = requestAnimationFrame(draw)
    const view = toRaw(props.view)
    const l = view?.relay?.layout
    if (!ctx || !cw || !l) return
    const animating = view.phase === 'wave' || !!anim || shots.length > 0 || fx.length > 0 || ghosts.length > 0
    if (!animating && !dirty) return
    dirty = false
    stepAnim(now)
    followBoss(now)
    emitCamera(now)
    const catalog = catalogRaw()
    const simple = zoomLevel() < SIMPLE_BELOW

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cw, ch) // 桌面由外層 CSS 畫（木紋＋暗角）
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, -dpr * scale * camX, -dpr * scale * camY)

    drawZones(l, simple, now)
    if (!simple) drawOverlays(l)
    drawShots(now)
    if (simple) drawMonstersSimple(now)
    else drawMonstersFull(catalog, now)
    drawGhosts(now)
    drawFx(l, now)
}

// 伺服器推新的視圖：重算每區的塔；整圈排版變了（區域數改變）就重新取景
let layoutKey = ''
watch(() => props.view, () => {
    const l = layout()
    if (!l) return
    const key = `${l.zones.length}`
    syncZones()
    if (key !== layoutKey) {
        layoutKey = key
        fitted = false
        if (cw) { focusZone(watchIndex(), false); fitted = true }
    }
}, { immediate: true })
// 看的區換了：已經放大就順便把鏡頭移過去
watch(() => props.view.watching, () => {
    const i = watchIndex()
    if (cw && zoomLevel() >= SIMPLE_BELOW && !anim && !follow.value) focusZone(i)
    invalidate()
})
watch([() => props.selectedId, () => props.pendingGem, () => props.catalog, hover, armed, showRoutes, follow], invalidate)

onMounted(() => {
    resize()
    observer = new ResizeObserver(resize)
    observer.observe(wrapRef.value)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    raf = requestAnimationFrame(draw)
})

onUnmounted(() => {
    cancelAnimationFrame(raf)
    observer?.disconnect()
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
})
</script>
