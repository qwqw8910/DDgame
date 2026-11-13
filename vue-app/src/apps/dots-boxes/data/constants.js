// 與 server/dots-boxes/gameLogic.js 保持一致（盤面幾何、模式、人數）
export const APP_ID = 'dots-boxes'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 2

export const SIZE_CHOICES = [
  { value: 4, title: '4 × 4', desc: '16 格，約 5 分鐘' },
  { value: 5, title: '5 × 5', desc: '25 格，約 10 分鐘' },
]

export const MODE_CHOICES = [
  { id: 'classic', title: '普通模式', desc: '一格一分，拿最多格的人獲勝' },
  { id: 'advanced', title: '進階模式', desc: '每格有 1–5 分，搶高分格才划算' },
]

// ── 線段編號（與伺服器相同）──────────────────────────────────
// 橫線 h(r,c) = r*n + c；直線 v(r,c) = H + r*(n+1) + c，H = (n+1)*n
export const hCount = n => (n + 1) * n
export const hEdge = (n, r, c) => r * n + c
export const vEdge = (n, r, c) => hCount(n) + r * (n + 1) + c
export const boxEdges = (n, boxIdx) => {
  const r = Math.floor(boxIdx / n)
  const c = boxIdx % n
  return [hEdge(n, r, c), hEdge(n, r + 1, c), vEdge(n, r, c), vEdge(n, r, c + 1)]
}

// 線段在 SVG（座標單位：格寬 CELL，外圍留 PAD）上的兩端點，與橫／直資訊
export const CELL = 100
export const PAD = 36
export function edgeGeometry(n, edge) {
  const H = hCount(n)
  const pt = (r, c) => [PAD + c * CELL, PAD + r * CELL]
  if (edge < H) {
    const r = Math.floor(edge / n)
    const c = edge % n
    return { horizontal: true, r, c, from: pt(r, c), to: pt(r, c + 1) }
  }
  const k = edge - H
  const r = Math.floor(k / (n + 1))
  const c = k % (n + 1)
  return { horizontal: false, r, c, from: pt(r, c), to: pt(r + 1, c) }
}
export const boardSize = n => n * CELL + PAD * 2

export const END_REASON_TEXT = {
  resign: '對手投降',
  leave: '對手離開了房間',
}
