// 像素特效層：沿用甜點守衛戰的 pixelfx 用法（usePixelFx.js），畫在全螢幕 canvas 上。
// 每個特效先畫進自己的小畫格，再放大貼回（關閉平滑，保留像素感）。
// 關閉特效的情況：使用者偏好減少動態；低階裝置只保留少量輕特效。
import { createFrame, clearFrame, createFx, composite } from 'pixelfx'
import * as collectBurst from 'pixelfx/fx/pickups/collect-burst'
import * as heartPickup from 'pixelfx/fx/pickups/heart-pickup'
import * as sunburst from 'pixelfx/fx/holy/sunburst'
import * as confetti from 'pixelfx/fx/ui/confetti'

// 每種特效：模組、最長存活秒數（loop 型特效自己不會結束）、放大倍率
const KINDS = {
  burst:    { mod: collectBurst, life: Infinity, scale: 3 },
  heart:    { mod: heartPickup,  life: 1.3,      scale: 4 },
  sunburst: { mod: sunburst,     life: 1.8,      scale: 4 },
  confetti: { mod: confetti,     life: Infinity, scale: 4, heavy: true },
}

// 默契稱號 → 要放哪些特效（第 1 輪最華麗）
const TIER_FX = {
  soulmates:    ['confetti', 'sunburst', 'heart', 'heart'],
  telepathy:    ['sunburst', 'heart', 'heart'],
  'in-sync':    ['heart', 'burst'],
  compatible:   ['heart'],
  'slow-burn':  ['burst'],
  'needs-work': ['burst'],
  barely:       ['burst'],
  'near-miss':  ['burst'],
}

const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const lowEnd = typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency ?? 8) <= 4 || (navigator.deviceMemory ?? 8) <= 2)
const MAX_LIVE = lowEnd ? 6 : 16

const live = []
const sheets = new Map()

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

/** x, y 為 0–1 的畫面比例。回傳是否真的放了特效。 */
export function spawnFx(kind, x, y) {
  const def = KINDS[kind]
  if (!def || reduced || (lowEnd && def.heavy)) return false
  if (live.length >= MAX_LIVE) live.shift()
  live.push({ def, x, y, age: 0, fx: createFx(def.mod, { x: 0, y: 0, seed: (Math.random() * 1000) | 0 }) })
  return true
}

/** 依稱號放一組特效，x, y 為中心比例，彼此錯開 */
export function spawnTier(tierId, x = 0.5, y = 0.4) {
  const list = TIER_FX[tierId]
  if (!list) return
  list.forEach((kind, i) => {
    const dx = i === 0 ? 0 : (i % 2 ? 1 : -1) * (0.08 + 0.05 * Math.ceil(i / 2))
    setTimeout(() => spawnFx(kind, Math.min(0.95, Math.max(0.05, x + dx)), y), i * 160)
  })
}

export const hasLive = () => live.length > 0
export function clearFx() { live.length = 0 }

/** 更新並畫出所有特效到 ctx（座標為 CSS px，w/h 為畫布 CSS 尺寸） */
export function drawFx(ctx, w, h, dt) {
  ctx.save()
  ctx.imageSmoothingEnabled = false
  for (let i = live.length - 1; i >= 0; i--) {
    const e = live[i]
    e.age += dt
    e.fx.update(dt)
    if (e.age > e.def.life || e.fx.done()) { live.splice(i, 1); continue }
    const s = sheetOf(e.def.mod)
    clearFrame(s.frame)
    e.fx.draw(s.frame)
    composite(s.frame, s.img.data)
    s.ctx.putImageData(s.img, 0, 0)
    const k = e.def.scale
    ctx.drawImage(s.canvas, e.x * w - s.ox * k, e.y * h - s.oy * k, s.canvas.width * k, s.canvas.height * k)
  }
  ctx.restore()
}
