// ================================================================
//  甜點守衛戰 — 地圖相機（縮放與平移）
//
//  全部是純函式，不碰 DOM、不依賴 Vue：
//    · 相機狀態 { zoom, panX, panY }：panX / panY 是「畫面像素」，zoom 是倍率（1 = 整張圖剛好塞進畫面）
//    · 畫面是正方形，邊長 viewSize；地圖以長邊為準，每格 cell = viewSize / max(width, height)
//    · 輸入事件先正規化成 { type, id, x, y, delta, pointerType }（x、y 是相對畫布左上角的像素），
//      再交給 createCameraController 處理，所以以後接觸控只要多寫一個轉接函式
//    · 螢幕座標 → 格子座標只有 screenToCell 一個函式
// ================================================================

export const MIN_ZOOM = 1
export const MAX_ZOOM = 5
const DRAG_THRESHOLD = 6 // 超過幾像素才算拖曳（否則是點擊）
const WHEEL_STEP = 0.0015 // 滾輪每單位的縮放指數

export const createCamera = () => ({ zoom: 1, panX: 0, panY: 0 })

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// 每格的像素大小（zoom = 1 時）
export const cellSizeOf = (board, viewSize) => viewSize / Math.max(board.width, board.height)

// 平移範圍：地圖放大後的邊緣不能離開畫面；比畫面小的那一邊置於左上
export function clampCamera(cam, board, viewSize) {
  const cell = cellSizeOf(board, viewSize) * cam.zoom
  const minX = Math.min(0, viewSize - board.width * cell)
  const minY = Math.min(0, viewSize - board.height * cell)
  return { ...cam, panX: clamp(cam.panX, minX, 0), panY: clamp(cam.panY, minY, 0) }
}

// 以畫面上 (cx, cy) 為中心縮放 factor 倍
export function zoomAt(cam, factor, cx, cy, board, viewSize, { min = MIN_ZOOM, max = MAX_ZOOM } = {}) {
  const zoom = clamp(cam.zoom * factor, min, max)
  const k = zoom / cam.zoom
  return clampCamera({ zoom, panX: cx - (cx - cam.panX) * k, panY: cy - (cy - cam.panY) * k }, board, viewSize)
}

export const panBy = (cam, dx, dy, board, viewSize) => clampCamera({ ...cam, panX: cam.panX + dx, panY: cam.panY + dy }, board, viewSize)

// 把格子座標 (cellX, cellY) 移到畫面正中央（小地圖點擊用）；座標是「格」，可以有小數
export function centerOn(cam, cellX, cellY, board, viewSize) {
  const cell = cellSizeOf(board, viewSize) * cam.zoom
  return clampCamera({ ...cam, panX: viewSize / 2 - cellX * cell, panY: viewSize / 2 - cellY * cell }, board, viewSize)
}

// 螢幕座標（相對畫布左上角的像素）→ 格子座標；點在地圖外回傳 null。座標轉換只在這裡
export function screenToCell(cam, point, board, viewSize) {
  const cell = cellSizeOf(board, viewSize) * cam.zoom
  const x = Math.floor((point.x - cam.panX) / cell)
  const y = Math.floor((point.y - cam.panY) / cell)
  return x >= 0 && y >= 0 && x < board.width && y < board.height ? { x, y } : null
}

// 畫面目前看到的範圍（單位：格，可有小數），小地圖畫視窗框用
export function visibleRect(cam, board, viewSize) {
  const cell = cellSizeOf(board, viewSize) * cam.zoom
  const x = clamp(-cam.panX / cell, 0, board.width)
  const y = clamp(-cam.panY / cell, 0, board.height)
  return { x, y, w: Math.min(board.width - x, viewSize / cell), h: Math.min(board.height - y, viewSize / cell) }
}

// ── 輸入正規化：DOM 事件 → { type, id, x, y, delta, pointerType } ──────────
// rect 是畫布的 getBoundingClientRect()
export function normalizePointer(e, rect) {
  const type = { pointerdown: 'down', pointermove: 'move', pointerup: 'up', pointercancel: 'cancel', pointerleave: 'leave' }[e.type]
  return { type, id: e.pointerId, x: e.clientX - rect.left, y: e.clientY - rect.top, delta: 0, pointerType: e.pointerType }
}

export const normalizeWheel = (e, rect) => ({ type: 'wheel', id: 0, x: e.clientX - rect.left, y: e.clientY - rect.top, delta: e.deltaY, pointerType: 'mouse' })

// ── 手勢控制器：把正規化的事件變成「縮放、平移、點擊、游標所在格」─────────
// ctx()：回傳 { board, viewSize }；callbacks：
//   onChange(cam)        相機變了
//   onTap({ cell, pointerType })   點擊（沒拖曳、沒縮放）；cell 可能是 null（點在地圖外）
//   onHover(cell|null)   滑鼠游標移到的格子（只有滑鼠；離開畫布是 null）
export function createCameraController({ ctx, onChange, onTap, onHover, wheelZoom = false, camera = createCamera() }) {
  let cam = camera
  const pointers = new Map() // id → { x, y, startX, startY }
  let dragged = false
  let pinchDist = 0

  const set = (next) => {
    if (next.zoom === cam.zoom && next.panX === cam.panX && next.panY === cam.panY) return
    cam = next
    onChange?.(cam)
  }
  const pinchLength = () => {
    const [a, b] = [...pointers.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function handle(ev) {
    const { board, viewSize } = ctx()
    switch (ev.type) {
    case 'down':
      pointers.set(ev.id, { x: ev.x, y: ev.y, startX: ev.x, startY: ev.y })
      dragged = false
      if (pointers.size === 2) pinchDist = pinchLength()
      break
    case 'move': {
      if (ev.pointerType === 'mouse') onHover?.(screenToCell(cam, ev, board, viewSize))
      const p = pointers.get(ev.id)
      if (!p) break
      if (pointers.size === 2) {
        p.x = ev.x
        p.y = ev.y
        const [a, b] = [...pointers.values()]
        const dist = pinchLength()
        if (pinchDist > 0) set(zoomAt(cam, dist / pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2, board, viewSize))
        pinchDist = dist
        dragged = true
        break
      }
      if (Math.hypot(ev.x - p.startX, ev.y - p.startY) > DRAG_THRESHOLD) dragged = true
      if (dragged) set(panBy(cam, ev.x - p.x, ev.y - p.y, board, viewSize))
      p.x = ev.x
      p.y = ev.y
      break
    }
    case 'up': {
      const wasTap = pointers.size === 1 && pointers.has(ev.id) && !dragged
      pointers.delete(ev.id)
      if (wasTap) onTap?.({ cell: screenToCell(cam, ev, board, viewSize), pointerType: ev.pointerType })
      break
    }
    case 'cancel':
      pointers.delete(ev.id)
      break
    case 'leave':
      onHover?.(null)
      break
    case 'wheel':
      if (wheelZoom) set(zoomAt(cam, Math.exp(-ev.delta * WHEEL_STEP), ev.x, ev.y, board, viewSize))
      break
    }
  }

  return {
    handle,
    get camera() { return cam },
    // 按鈕縮放、小地圖跳轉、重設視角、視窗大小改變時重新夾住範圍：都走這幾個，保持狀態只有一份
    zoomBy: factor => { const { board, viewSize } = ctx(); set(zoomAt(cam, factor, viewSize / 2, viewSize / 2, board, viewSize)) },
    centerOn: (x, y) => { const { board, viewSize } = ctx(); set(centerOn(cam, x, y, board, viewSize)) },
    reset: () => set(createCamera()),
    clamp: () => { const { board, viewSize } = ctx(); set(clampCamera(cam, board, viewSize)) },
  }
}
