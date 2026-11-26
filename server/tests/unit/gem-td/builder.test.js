'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const B = require('../../../gem-td/builder');

const opts = (onStart = () => true) => ({ speed: 4, range: 3, onStart });
const run = (b, seconds, o) => {
  const events = [];
  for (let t = 0; t < seconds * 10; t++) events.push(...B.stepBuilder(b, 0.1, o));
  return events;
};
const job = (over = {}) => ({ type: 'build', x: 20, y: 0, slot: 0, duration: 3, ...over });

test('建造者：自由移動，速度每秒 4 格，到了就停', () => {
  const b = B.createBuilder(0.5, 0.5);
  B.moveTo(b, 8.5, 0.5);
  run(b, 1, opts());
  assert.ok(Math.abs(b.x - 4.5) < 1e-6);
  run(b, 3, opts());
  assert.equal(b.x, 8.5);
  assert.equal(b.tx, null);
});

test('建造者：走到範圍內才開始施工，施工滿 3 秒完成', () => {
  const b = B.createBuilder(0.5, 0.5);
  B.assignJob(b, job());
  const events = run(b, 10, opts());
  assert.deepEqual(events.map(e => e.type), ['start', 'done']);
  // 20.5 - 3（範圍）= 17.5，距離 17 格 ÷ 4 格/秒 ≈ 4.25 秒後開始
  assert.ok(b.x > 17.4 && b.x < 17.6, `停在範圍邊緣 (${b.x})`);
  assert.equal(b.job, null);
});

test('建造者：onStart 不同意（格子被搶、會封路）→ 工作作廢，沒有開始施工', () => {
  const b = B.createBuilder(19.5, 0.5);
  B.assignJob(b, job());
  const events = run(b, 1, opts(() => false));
  assert.deepEqual(events.map(e => e.type), ['reject']);
  assert.equal(b.job, null);
});

test('建造者：指派新工作或移動會取消目前這件，回傳被取消的工作', () => {
  const b = B.createBuilder(19.5, 0.5);
  B.assignJob(b, job());
  run(b, 1, opts());
  assert.equal(b.job.started, true);
  const cancelled = B.assignJob(b, job({ x: 25, slot: 1 }));
  assert.equal(cancelled.slot, 0);
  assert.equal(cancelled.started, true, '呼叫端靠 started 判斷要不要釋放格子');
  assert.equal(b.job.slot, 1);
  assert.equal(B.moveTo(b, 1, 1).slot, 1);
  assert.equal(b.job, null);
  assert.equal(B.cancelJob(b), null);
});

test('建造者：施工中取消，進度不保留；重新指派從 0 開始', () => {
  const b = B.createBuilder(19.5, 0.5);
  B.assignJob(b, job());
  run(b, 2, opts());
  assert.ok(b.job.progress > 0);
  B.cancelJob(b);
  B.assignJob(b, job());
  assert.equal(b.job.progress, 0);
  assert.equal(b.job.started, false);
});

test('開局站位：多位建造者圍著起點散開，互相至少 1.5 格，且都在地圖內', () => {
  for (const n of [2, 3]) {
    const spots = B.spreadStarts(2.5, 1.5, n, { width: 35, height: 35 });
    assert.equal(spots.length, n);
    for (const s of spots) assert.ok(s.x >= 0.5 && s.x <= 34.5 && s.y >= 0.5 && s.y <= 34.5);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].y - spots[j].y) >= 1.5, `${i}/${j}`);
  }
  assert.deepEqual(B.spreadStarts(2.5, 1.5, 3, { width: 35, height: 35 }), B.spreadStarts(2.5, 1.5, 3, { width: 35, height: 35 }), '同樣輸入同樣結果');
});

test('開局站位：一個人站中心；貼著地圖角落會夾回範圍內', () => {
  assert.deepEqual(B.spreadStarts(2.5, 1.5, 1), [{ x: 2.5, y: 1.5 }]);
  const corner = B.spreadStarts(0.5, 0.5, 3, { width: 10, height: 10 });
  assert.ok(corner.every(s => s.x >= 0.5 && s.y >= 0.5));
});
