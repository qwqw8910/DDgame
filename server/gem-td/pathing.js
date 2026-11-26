'use strict';

// ================================================================
//  寶石塔防 — 尋路（四方向 BFS）
//  地面怪必須依序踩過所有路徑點；任何一段走不通，該擺放就不合法。
// ================================================================

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

// 回傳 from → to 的格子清單（含兩端）；走不通回傳 null
function findLeg(width, height, isBlocked, from, to) {
  const size = width * height;
  const prev = new Int32Array(size).fill(-1);
  const startIdx = from.y * width + from.x;
  const goalIdx = to.y * width + to.x;
  prev[startIdx] = startIdx;
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  queue[tail++] = startIdx;

  while (head < tail) {
    const idx = queue[head++];
    if (idx === goalIdx) break;
    const x = idx % width;
    const y = (idx - x) / width;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (prev[nIdx] !== -1 || isBlocked(nx, ny)) continue;
      prev[nIdx] = idx;
      queue[tail++] = nIdx;
    }
  }

  if (prev[goalIdx] === -1) return null;
  const cells = [];
  for (let idx = goalIdx; ; idx = prev[idx]) {
    const x = idx % width;
    cells.push({ x, y: (idx - x) / width });
    if (idx === startIdx) break;
  }
  return cells.reverse();
}

// 串起整條路徑：起點 → 各路徑點 → 終點；任一段不通回傳 null
function findFullPath(board, isBlocked) {
  const stops = [board.start, ...board.checkpoints, board.end];
  const path = [{ ...board.start }];
  for (let i = 0; i + 1 < stops.length; i++) {
    const leg = findLeg(board.width, board.height, isBlocked, stops[i], stops[i + 1]);
    if (!leg) return null;
    path.push(...leg.slice(1));
  }
  return path;
}

// ── 加權最短路（合作迷宮的 breach 堵死策略）────────────────────────
// costOf(x, y) 回傳走進該格的成本：空地 1，餅乾牆與塔更高（沒有「不能走」的格子）。
// 成本差距夠大時，只要有通路就一定走通路；全堵死才會走成本最低的突破點。
class MinHeap {
  constructor() { this.keys = []; this.vals = []; }
  get size() { return this.keys.length; }
  push(key, val) {
    const { keys, vals } = this;
    let i = keys.push(key) - 1;
    vals.push(val);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[i] = keys[parent]; vals[i] = vals[parent];
      i = parent;
    }
    keys[i] = key; vals[i] = val;
  }
  pop() {
    const { keys, vals } = this;
    const topVal = vals[0];
    const lastKey = keys.pop();
    const lastVal = vals.pop();
    const n = keys.length;
    if (n) {
      let i = 0;
      for (;;) {
        let child = 2 * i + 1;
        if (child >= n) break;
        if (child + 1 < n && keys[child + 1] < keys[child]) child++;
        if (keys[child] >= lastKey) break;
        keys[i] = keys[child]; vals[i] = vals[child];
        i = child;
      }
      keys[i] = lastKey; vals[i] = lastVal;
    }
    return topVal;
  }
}

function findLegWeighted(width, height, costOf, from, to) {
  const size = width * height;
  const dist = new Float64Array(size).fill(Infinity);
  const prev = new Int32Array(size).fill(-1);
  const startIdx = from.y * width + from.x;
  const goalIdx = to.y * width + to.x;
  dist[startIdx] = 0;
  prev[startIdx] = startIdx;
  const heap = new MinHeap();
  heap.push(0, startIdx);
  while (heap.size) {
    const idx = heap.pop();
    if (idx === goalIdx) break;
    const x = idx % width;
    const y = (idx - x) / width;
    const d = dist[idx];
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const nIdx = ny * width + nx;
      const nd = d + costOf(nx, ny);
      if (nd >= dist[nIdx]) continue;
      dist[nIdx] = nd;
      prev[nIdx] = idx;
      heap.push(nd, nIdx);
    }
  }
  const cells = [];
  for (let idx = goalIdx; ; idx = prev[idx]) {
    const x = idx % width;
    cells.push({ x, y: (idx - x) / width });
    if (idx === startIdx) break;
  }
  return cells.reverse();
}

// 整條路線：{ path, legStarts, breaches }
//   path        起點 → 各路徑點 → 終點的格子（可能穿過牆）
//   legStarts   每一段（路徑點到路徑點）在 path 裡的起始索引
//   breaches    路線上必須打破的牆 [{ x, y, index }]（index 是 path 的索引），沒有就是空陣列
function findFullRoute(board, costOf) {
  const stops = [board.start, ...board.checkpoints, board.end];
  const path = [{ ...board.start }];
  const legStarts = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const leg = findLegWeighted(board.width, board.height, costOf, stops[i], stops[i + 1]);
    legStarts.push(path.length - 1); // 這一段從 path 的哪個索引開始
    path.push(...leg.slice(1));
  }
  const breaches = [];
  path.forEach((c, index) => { if (index > 0 && costOf(c.x, c.y) > 1) breaches.push({ x: c.x, y: c.y, index }); });
  return { path, legStarts, breaches };
}

module.exports = { findLeg, findFullPath, findFullRoute };
