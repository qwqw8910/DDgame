// 像素特效層：用 pixelfx 在地圖 canvas 上疊命中火花與蟲子消散的爆點。
// 每個特效先畫進自己的小畫格，再放大貼回地圖（關閉平滑，保留像素感）。
import { createFrame, clearFrame, createFx, composite } from 'pixelfx'
import * as hitSpark from 'pixelfx/fx/impacts/hit-spark'
import * as collectBurst from 'pixelfx/fx/pickups/collect-burst'

const PX_PER_CELL = 14 // 一格對應幾個特效像素，越小特效越大
const MAX_LIVE = 40 // 同時存在的特效上限，避免手機掉幀

// 蟲子被打死時的粉糖色
const DEATH_PALETTE = ['#4a1730', '#9c2a63', '#e8528f', '#ff9ec4', '#ffd6e6', '#fff3f7', '#ffffff']

const live = []
const sheets = new Map() // module → { frame, img, canvas, ctx }

function sheetOf(mod) {
    let s = sheets.get(mod)
    if (!s) {
        const [w, h] = mod.meta.size
        const [ox, oy] = mod.meta.origin
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        s = { frame: createFrame(w, h, -ox, -oy), img: new ImageData(w, h), canvas, ctx: canvas.getContext('2d'), ox, oy }
        sheets.set(mod, s)
    }
    return s
}

// 由寶石底色產生 7 階色帶（暗→亮），讓火花跟著塔的顏色走
function rampOf(hex) {
    const n = parseInt(hex.slice(1), 16)
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    const mix = (to, k) => '#' + c.map((v, i) => Math.round(v + (to[i] - v) * k).toString(16).padStart(2, '0')).join('')
    return [mix([0, 0, 0], 0.7), mix([0, 0, 0], 0.4), mix([0, 0, 0], 0.1), hex, mix([255, 255, 255], 0.45), mix([255, 255, 255], 0.8), '#ffffff']
}

function spawn(mod, x, y, opts) {
    if (live.length >= MAX_LIVE) live.shift()
    live.push({ mod, x, y, fx: createFx(mod, { x: 0, y: 0, ...opts }) })
}

/** 命中：從塔打向蟲子的火花。x, y 為格子座標，aim 為出手方向（弧度）。 */
export function spawnHit(x, y, aim, color) {
    spawn(hitSpark, x, y, { height: 0, aim, palette: rampOf(color), seed: (Math.random() * 1000) | 0 })
}

/** 蟲子被消滅：粉糖爆點。 */
export function spawnDeath(x, y) {
    spawn(collectBurst, x, y, { palette: DEATH_PALETTE, seed: (Math.random() * 1000) | 0 })
}

export function clearFx() {
    live.length = 0
}

/** 更新並畫出所有特效。座標系與地圖相同（cell 為一格的像素寬）。 */
export function drawFx(ctx, cell, dt) {
    if (!live.length) return
    const k = cell / PX_PER_CELL
    ctx.save()
    ctx.imageSmoothingEnabled = false
    for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i]
        e.fx.update(dt)
        if (e.fx.done()) {
            live.splice(i, 1)
            continue
        }
        const s = sheetOf(e.mod)
        clearFrame(s.frame)
        e.fx.draw(s.frame)
        composite(s.frame, s.img.data)
        s.ctx.putImageData(s.img, 0, 0)
        ctx.drawImage(s.canvas, (e.x + 0.5) * cell - s.ox * k, (e.y + 0.5) * cell - s.oy * k, s.canvas.width * k, s.canvas.height * k)
    }
    ctx.restore()
}
