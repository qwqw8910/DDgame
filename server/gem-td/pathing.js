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

module.exports = { findLeg, findFullPath };
