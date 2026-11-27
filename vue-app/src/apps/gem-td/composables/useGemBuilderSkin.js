// ================================================================
//  合作迷宮：建造者外觀（5 款小烘焙師 × 玩家色）
//
//  像素換色是純函式（只吃 RGBA 陣列），不碰 DOM；畫布與快取在 GemBoard.vue。
//  規則：飽和度夠高、亮度夠、色相落在這款「主色 ± tol」內的像素（帽帶與圍裙）換成玩家色，
//  保留原本的明暗與透明度；膚色、握把、工具、白色帽子與描邊都不動。
// ================================================================

export const skinIndexOf = (playerIndex, count) => (((Number.isInteger(playerIndex) ? playerIndex : 0) % count) + count) % count

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

export function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b) / 255
  const min = Math.min(r, g, b) / 255
  const d = max - min
  const v = max
  const s = max === 0 ? 0 : d / max
  let h = 0
  const R = r / 255; const G = g / 255; const B = b / 255
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6
    else if (max === G) h = (B - R) / d + 2
    else h = (R - G) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, v }
}

export function hsvToRgb(h, s, v) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

// 把 data（RGBA，Uint8ClampedArray 或一般陣列）原地換色；回傳換掉幾個像素。target 不是 #RRGGBB 就不動。
// skin = { hue, tol, vMin, refS?, refV? }；refS／refV 是原圖「主色」的平均飽和度與亮度（預設 0.8／0.9），換色時依目標色的比例縮放，保留明暗
export function recolorAccent(data, skin, targetHex) {
  const target = hexToRgb(targetHex)
  if (!target || !skin || !data) return 0
  const t = rgbToHsv(target.r, target.g, target.b)
  let changed = 0
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue
    const { h, s, v } = rgbToHsv(data[i], data[i + 1], data[i + 2])
    if (s < 0.45 || v < skin.vMin || hueDist(h, skin.hue) > skin.tol) continue
    const out = hsvToRgb(t.h, Math.min(1, s * (t.s / (skin.refS || 0.8))), Math.min(1, v * (t.v / (skin.refV || 0.9))))
    data[i] = out.r
    data[i + 1] = out.g
    data[i + 2] = out.b
    changed += 1
  }
  return changed
}
