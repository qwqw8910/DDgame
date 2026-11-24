'use strict';

// ================================================================
//  環形接力 — 排版（純函式）
//  座標單位是「格」，y 向下（與 canvas 相同）。所有區域由左到右橫排成一列，玩家左右拖動就能逛每個人的地圖；
//  區 i 的出口直接傳送到區 i+1 的入口（最後一區回到第一區），沒有實體輸送帶。
//  conveyors 只留「出口 → 下一區入口」的直線，給傳送特效決定方向用。
// ================================================================

const C = require('./config');

const round2 = v => Math.round(v * 100) / 100;

// 區域的世界座標：origin 是地圖左上角；格子 (x, y) 的中心在 origin + (x + 0.5, y + 0.5)
function ringLayout(n, board = {}, opts = {}) {
  const size = board.width ?? C.BOARD_SIZE;
  const start = board.start ?? { x: 2, y: 2 };
  const end = board.end ?? { x: size - 3, y: size - 3 };
  const gap = opts.gap ?? C.RELAY_ZONE_GAP;
  const pitch = size + gap;

  const zones = Array.from({ length: n }, (_, i) => {
    const cx = i * pitch;
    return { index: i, cx: round2(cx), cy: 0, origin: { x: round2(cx - size / 2), y: round2(-size / 2) } };
  });

  const world = (zone, cell) => ({ x: zones[zone].origin.x + cell.x + 0.5, y: zones[zone].origin.y + cell.y + 0.5 });

  const conveyors = n <= 1 ? [] : zones.map((_, i) => {
    const j = (i + 1) % n;
    const points = [world(i, end), world(j, start)].map(p => [round2(p.x), round2(p.y)]);
    const length = round2(Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]));
    return { from: i, to: j, points, cum: [0, length], length, arcFrom: 0, arcTo: 1 };
  });

  // 畫面範圍：所有區域，外加一點邊
  const pad = 3;
  const bounds = {
    minX: zones[0].origin.x - pad,
    minY: -size / 2 - pad,
    maxX: zones[n - 1].origin.x + size + pad,
    maxY: size / 2 + pad,
  };

  return { n, size, pitch, zones, conveyors, bounds };
}

// 沿線段走 d 格的位置（超出就停在兩端）
function pointAt(conveyor, d) {
  const { points, cum, length } = conveyor;
  if (d <= 0) return { x: points[0][0], y: points[0][1] };
  if (d >= length) { const last = points[points.length - 1]; return { x: last[0], y: last[1] }; }
  let i = 0;
  while (i < cum.length - 2 && d >= cum[i + 1]) i++;
  const seg = cum[i + 1] - cum[i];
  const t = seg > 0 ? (d - cum[i]) / seg : 1;
  return {
    x: points[i][0] + (points[i + 1][0] - points[i][0]) * t,
    y: points[i][1] + (points[i + 1][1] - points[i][1]) * t,
  };
}

module.exports = { ringLayout, pointAt };
