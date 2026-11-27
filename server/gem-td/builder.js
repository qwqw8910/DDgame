'use strict';

// ================================================================
//  合作迷宮的建造者（純函式，不碰 socket 與遊戲規則）
//
//  建造者 = { x, y, tx, ty, job }：座標單位是「格」，格 (cx, cy) 的中心是 (cx + .5, cy + .5)。
//  工作 job = { type: 'build' | 'demolish', x, y, slot?, towerId?, duration, progress, started }。
//  一個建造者同一時間只做一件工作；指派新工作或下達移動，會取消目前這件。
//  規則（能不能蓋、佔格、完成後放塔）由呼叫端透過 onStart 回呼決定。
// ================================================================

const createBuilder = (x, y) => ({ x, y, tx: null, ty: null, job: null, queue: [] });

// 開局站位：n 位建造者圍著 (cx, cy) 排成一圈（半徑 radius 格），第 0 位在正上方、順時針；n = 1 站在中心。
// 超出地圖的位置夾回 [0.5, 邊長 - 0.5]。結果只取決於輸入，所以每次開局一樣、前端不用猜
function spreadStarts(cx, cy, n, { radius = 1.2, width = Infinity, height = Infinity } = {}) {
  const clamp = (v, hi) => Math.min(hi - 0.5, Math.max(0.5, v));
  return Array.from({ length: n }, (_, i) => {
    if (n <= 1) return { x: clamp(cx, width), y: clamp(cy, height) };
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: clamp(cx + Math.cos(a) * radius, width), y: clamp(cy + Math.sin(a) * radius, height) };
  });
}

// 取消目前的工作，回傳被取消的那件（沒有就是 null）；是否已佔格由呼叫端依 job.started 處理
function cancelJob(b) {
  const job = b.job;
  b.job = null;
  b.queue = [];
  return job;
}

function moveTo(b, x, y) {
  const cancelled = cancelJob(b);
  b.tx = x;
  b.ty = y;
  return cancelled;
}

// 排隊：目前沒工作就直接開工，否則接在後面（上限 max 件含目前這件）；回傳是否接受
function queueJob(b, job, max = 5) {
  if (!b.job) { assignJob(b, job); return true; }
  if (b.queue.length + 1 >= max) return false;
  b.queue.push({ ...job, progress: 0, started: false });
  return true;
}

function assignJob(b, job) {
  const cancelled = cancelJob(b);
  b.tx = null;
  b.ty = null;
  b.job = { ...job, progress: 0, started: false };
  return cancelled;
}

// 朝 (tx, ty) 走一段；回傳是否抵達。距離 <= stopAt 就停下
function walk(b, tx, ty, dist, stopAt = 0) {
  const dx = tx - b.x;
  const dy = ty - b.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt) return true;
  const move = Math.min(dist, d - stopAt);
  b.x += (dx / d) * move;
  b.y += (dy / d) * move;
  return d - move <= stopAt + 1e-9;
}

// 往前推進 dt 秒；回傳事件 [{ type: 'start' | 'reject' | 'done', job }]
//   start：走到範圍內、onStart 同意了，開始施工
//   reject：走到範圍內但 onStart 不同意（格子被搶走、會封路…），工作作廢
//   done：施工完成（工作已從建造者身上移除）
function stepBuilder(b, dt, { speed, range, onStart }) {
  const events = [];
  const job = b.job;
  if (!job) {
    if (b.tx !== null && walk(b, b.tx, b.ty, speed * dt)) { b.tx = null; b.ty = null; }
    return events;
  }
  if (!job.started) {
    const arrived = walk(b, job.x + 0.5, job.y + 0.5, speed * dt, range);
    if (!arrived) return events;
    if (onStart(job)) {
      job.started = true;
      events.push({ type: 'start', job });
    } else {
      b.job = b.queue.shift() ?? null; // 這件作廢，佇列裡的下一件接著做
      events.push({ type: 'reject', job });
      return events;
    }
  }
  job.progress += dt;
  if (job.progress >= job.duration) {
    b.job = b.queue.shift() ?? null;
    events.push({ type: 'done', job });
  }
  return events;
}

module.exports = { createBuilder, spreadStarts, cancelJob, moveTo, assignJob, queueJob, stepBuilder };
