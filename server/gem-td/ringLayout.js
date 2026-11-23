'use strict';

// ================================================================
//  環形接力 — 排版（純函式）
//  座標單位是「格」，世界座標原點在環心，y 向下（與 canvas 相同）。
//  區域不旋轉、等角度排成一圈，從正上方開始順時針；區 i 的出口接外環輸送帶，通往區 i+1 的入口。
//  輸送帶 = 出口 → 徑向短連接線 → 外圈弧線 → 徑向短連接線 → 下一區入口。
// ================================================================

const C = require('./config');

const round2 = v => Math.round(v * 100) / 100;

// 區域的世界座標：origin 是地圖左上角；格子 (x, y) 的中心在 origin + (x + 0.5, y + 0.5)
function ringLayout(n, board = {}, opts = {}) {
  const size = board.width ?? C.BOARD_SIZE;
  const start = board.start ?? { x: 2, y: 2 };
  const end = board.end ?? { x: size - 3, y: size - 3 };
  const gap = opts.gap ?? C.RELAY_ZONE_GAP;
  const margin = opts.margin ?? C.RELAY_ARC_MARGIN;
  const step = opts.step ?? C.RELAY_ARC_STEP;

  const diag = size * Math.SQRT2;
  // 相鄰中心距（弦長）= 2R·sin(π/n) 必須 ≥ 對角線 + 間距；區域不旋轉，圓形外切就保證不重疊
  const radius = n <= 1 ? 0 : (diag + gap) / (2 * Math.sin(Math.PI / n));
  const arcRadius = radius + diag / 2 + margin;

  const zones = Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const cx = radius * Math.cos(angle);
    const cy = radius * Math.sin(angle);
    return { index: i, cx: round2(cx), cy: round2(cy), origin: { x: round2(cx - size / 2), y: round2(cy - size / 2) } };
  });

  const world = (zone, cell) => ({ x: zones[zone].origin.x + cell.x + 0.5, y: zones[zone].origin.y + cell.y + 0.5 });
  const onArc = angle => ({ x: arcRadius * Math.cos(angle), y: arcRadius * Math.sin(angle) });

  const conveyors = n <= 1 ? [] : zones.map((_, i) => {
    const j = (i + 1) % n;
    const exit = world(i, end);
    const entry = world(j, start);
    const aOut = Math.atan2(exit.y, exit.x);
    const aIn = Math.atan2(entry.y, entry.x);
    const sweep = (((aIn - aOut) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const segments = Math.max(2, Math.ceil((sweep * arcRadius) / step));
    const raw = [exit];
    for (let k = 0; k <= segments; k++) raw.push(onArc(aOut + (sweep * k) / segments));
    raw.push(entry);
    const points = raw.map(p => [round2(p.x), round2(p.y)]);
    const cum = [0];
    for (let k = 1; k < points.length; k++) {
      cum.push(cum[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
    }
    return {
      from: i, to: j, points, cum: cum.map(round2), length: round2(cum[cum.length - 1]),
      // 前後各一段徑向連接線（索引範圍），其餘是外圈弧線
      arcFrom: 1, arcTo: points.length - 2,
    };
  });

  // 畫面範圍：所有區域與輸送帶，外加一點邊
  const xs = [];
  const ys = [];
  for (const z of zones) {
    xs.push(z.origin.x, z.origin.x + size);
    ys.push(z.origin.y, z.origin.y + size);
  }
  for (const c of conveyors) for (const [x, y] of c.points) { xs.push(x); ys.push(y); }
  const pad = 3;
  const bounds = { minX: Math.min(...xs) - pad, minY: Math.min(...ys) - pad, maxX: Math.max(...xs) + pad, maxY: Math.max(...ys) + pad };

  return { n, size, radius: round2(radius), arcRadius: round2(arcRadius), diag: round2(diag), zones, conveyors, bounds };
}

// 沿輸送帶走 d 格的位置（超出就停在兩端）
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
