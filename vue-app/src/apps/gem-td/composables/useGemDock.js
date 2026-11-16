// 電腦版（≥1024px）左右欄的區塊停靠系統：每個區塊（GemDock）可收折、拖曳排序／換欄、彈出成浮動視窗、隱藏。
// 版面記在本機。手機與平板不啟用，GemDock 會退回成原本的普通 <section>。
import { reactive, shallowReactive, ref } from 'vue'

const KEY = 'gem-td-dock-v1'

// 預設所在的欄與順序（沒列到的區塊放右欄最後）
const LEFT = ['status', 'players', 'mutation', 'wave', 'testlog', 'recipes']
const RIGHT = ['ready', 'pending', 'choosing', 'vote', 'combine', 'selected', 'quality', 'wish', 'life', 'research']
// 預設高度（沒列到的依內容自動）
const DEFAULT_H = { recipes: 420 }

export const defaultWhere = id => (LEFT.includes(id) ? 'left' : 'right')

function load() {
    try {
        const v = JSON.parse(localStorage.getItem(KEY))
        if (v && typeof v.layout === 'object' && Array.isArray(v.order)) return v
    } catch { /* 略過 */ }
    return null
}
const saved = load()

export const dock = reactive({
    layout: saved?.layout ?? {}, // id → { where, collapsed, hidden, h, float:{x,y,w,h} }
    order: saved?.order ?? [...LEFT, ...RIGHT],
})
// 左欄、右欄、浮動層的 DOM 容器，由頁面用 function ref 填入
export const targets = shallowReactive({ left: null, right: null, float: null })
// 目前畫面上有的區塊（給「面板」選單列出）
export const mounted = reactive({})
const counts = {}
export const desktop = ref(false)

let timer = null
function save() {
    clearTimeout(timer)
    timer = setTimeout(() => {
        try { localStorage.setItem(KEY, JSON.stringify({ layout: dock.layout, order: dock.order })) } catch { /* 略過 */ }
    }, 150)
}

export function get(id) {
    return dock.layout[id] ?? { where: defaultWhere(id), collapsed: false, hidden: false, h: DEFAULT_H[id] ?? null, float: null }
}
function ensure(id) {
    if (!dock.layout[id]) dock.layout[id] = { ...get(id) }
    return dock.layout[id]
}
export const orderOf = (id) => {
    const i = dock.order.indexOf(id)
    return i < 0 ? 999 : i
}

export function register(id, title) {
    if (!dock.order.includes(id)) dock.order.push(id)
    counts[id] = (counts[id] ?? 0) + 1
    mounted[id] = title
}
export function unregister(id) {
    counts[id] = (counts[id] ?? 1) - 1
    if (counts[id] <= 0) { delete counts[id]; delete mounted[id] }
}
export function retitle(id, title) {
    if (id in mounted) mounted[id] = title
}

export function patch(id, props) {
    Object.assign(ensure(id), props)
    save()
}
export function toggleCollapsed(id) { patch(id, { collapsed: !get(id).collapsed }) }
export function setHidden(id, hidden) { patch(id, { hidden }) }
export function dockBack(id) { patch(id, { where: defaultWhere(id) === 'left' ? 'left' : 'right', float: null }) }
export function popOut(id, rect) {
    const w = Math.min(Math.max(rect.width, 260), 460)
    const h = Math.min(Math.max(rect.height, 120), 520)
    patch(id, {
        where: 'float', hidden: false,
        float: { x: Math.max(0, Math.min(rect.left, window.innerWidth - w)), y: Math.max(0, Math.min(rect.top, window.innerHeight - h)), w, h },
    })
}

// 把區塊移到某欄的 beforeId 前面（null＝該欄最後）
export function moveTo(id, col, beforeId) {
    const it = ensure(id)
    const order = dock.order.filter(x => x !== id)
    let at
    if (beforeId && order.includes(beforeId)) at = order.indexOf(beforeId)
    else {
        const last = order.map((x, i) => [x, i]).filter(([x]) => get(x).where === col).pop()
        at = last ? last[1] + 1 : order.length
    }
    order.splice(at, 0, id)
    const changed = it.where !== col || order.some((x, i) => x !== dock.order[i])
    if (!changed) return
    it.where = col
    it.float = null
    dock.order = order
    save()
}

export function resetLayout() {
    dock.layout = {}
    dock.order = [...LEFT, ...RIGHT]
    save()
}
