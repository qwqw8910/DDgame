'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../../dots-boxes/gameLogic');

function started(options = {}, rng = () => 0) {
  const g = L.createGame();
  g.options = L.resolveOptions(options);
  L.startGame(g, ['A', 'B'], { rng });
  return g;
}
const seatId = (g, seat) => g.players[seat];
const play = (g, edge) => L.drawLine(g, seatId(g, g.turn), edge);

test('resolveOptions：只接受 4/5 與 classic/advanced，其餘回預設', () => {
  assert.deepEqual(L.resolveOptions({ size: 5, mode: 'advanced' }), { size: 5, mode: 'advanced' });
  assert.deepEqual(L.resolveOptions({ size: 9, mode: 'x' }), { size: 4, mode: 'classic' });
  assert.deepEqual(L.resolveOptions(), { size: 4, mode: 'classic' });
});

test('幾何：線段與格子互相對應，4×4 有 40 條線', () => {
  for (const n of L.SIZES) {
    assert.equal(L.lineCount(n), 2 * n * (n + 1));
    const seen = new Array(L.lineCount(n)).fill(0);
    for (let b = 0; b < n * n; b++) {
      for (const e of L.boxEdges(n, b)) {
        seen[e]++;
        assert.ok(L.boxesOfEdge(n, e).includes(b), `edge ${e} 應鄰接 box ${b}`);
      }
    }
    // 內部線被 2 格共用，外框線只屬於 1 格
    assert.ok(seen.every(c => c === 1 || c === 2));
    assert.equal(seen.filter(c => c === 1).length, 4 * n);
  }
});

test('進階分值：180° 點對稱、範圍 1–5；經典全為 1', () => {
  let i = 0;
  const rng = () => ((i++ * 0.37) % 1);
  for (const n of L.SIZES) {
    const v = L.makeValues(n, 'advanced', rng);
    assert.equal(v.length, n * n);
    v.forEach((x, k) => {
      assert.ok(x >= 1 && x <= 5);
      assert.equal(x, v[v.length - 1 - k]);
    });
    assert.ok(L.makeValues(n, 'classic').every(x => x === 1));
  }
});

test('startGame：需要剛好 2 人；重賽時先手交換', () => {
  const g = L.createGame();
  assert.throws(() => L.startGame(g, ['A']), { code: 'NEED_TWO' });
  L.startGame(g, ['A', 'B']);
  assert.deepEqual(g.players, ['A', 'B']);
  assert.throws(() => L.startGame(g, ['A', 'B']), { code: 'BAD_PHASE' });
  L.forfeit(g, 'A');
  L.resetGame(g);
  L.startGame(g, ['A', 'B']);
  assert.deepEqual(g.players, ['B', 'A']);
  assert.equal(g.startSeq, 2);
});

test('輪流：沒封格就換人，畫過的線與非當前玩家會被擋', () => {
  const g = started();
  assert.throws(() => L.drawLine(g, 'B', 0), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => L.drawLine(g, 'Z', 0), { code: 'NOT_PLAYER' });
  assert.throws(() => L.drawLine(g, 'A', 999), { code: 'BAD_EDGE' });
  assert.throws(() => L.drawLine(g, 'A', 1.5), { code: 'BAD_EDGE' });
  L.drawLine(g, 'A', 0);
  assert.equal(g.turn, 1);
  assert.throws(() => L.drawLine(g, 'B', 0), { code: 'EDGE_TAKEN' });
});

test('封格：拿下該格並再走一步；一條線可同時封兩格', () => {
  const g = started();
  const n = 4;
  // 先圍住 box0 與 box1 除了共用線 v(0,1) 以外的 7 條邊
  const box0 = L.boxEdges(n, 0);
  const box1 = L.boxEdges(n, 1);
  const shared = L.vEdge(n, 0, 1);
  const others = [...new Set([...box0, ...box1])].filter(e => e !== shared);
  assert.equal(others.length, 6);
  others.forEach(e => play(g, e));
  assert.equal(g.boxes[0], -1);
  const mover = g.turn;
  const r = play(g, shared);
  assert.deepEqual(r.claimed.sort(), [0, 1]);
  assert.equal(g.boxes[0], mover);
  assert.equal(g.boxes[1], mover);
  assert.equal(g.turn, mover, '拿到格子要繼續走');
  assert.equal(g.counts[mover], 2);
  assert.equal(g.scores[mover], 2);
});

test('進階模式：得分是格內分值總和', () => {
  const g = started({ mode: 'advanced' }, () => 0.99); // 全抽到 5
  const n = 4;
  const edges = L.boxEdges(n, 0);
  edges.slice(0, 3).forEach(e => play(g, e));
  const mover = g.turn;
  play(g, edges[3]);
  assert.equal(g.scores[mover], 5);
  assert.equal(g.counts[mover], 1);
});

test('整局打完：分高者勝，並在最後一格封閉時結束', () => {
  const g = started();
  const n = 4;
  // 依序畫完所有線；沒有刻意策略，只驗證守恆與結束
  for (let e = 0; e < L.lineCount(n); e++) play(g, e);
  assert.equal(g.phase, 'finished');
  assert.equal(g.endReason, 'complete');
  assert.equal(g.scores[0] + g.scores[1], 16);
  assert.ok(g.boxes.every(o => o === 0 || o === 1));
  if (g.scores[0] === g.scores[1]) assert.equal(g.winner, 'draw');
  else assert.equal(g.winner, g.scores[0] > g.scores[1] ? 0 : 1);
  assert.throws(() => play(g, 0), { code: 'BAD_PHASE' });
});

test('平手：兩人各拿同分', () => {
  const g = started();
  g.boxes.fill(-1);
  // 直接建構接近終局的盤面：只剩最後一格，雙方同為 7 格
  g.lines.fill(0);
  for (const e of L.boxEdges(4, 15)) g.lines[e] = -1;
  g.lines[L.boxEdges(4, 15)[0]] = 0; // 剩 3 條
  const edges = L.boxEdges(4, 15).filter(e => g.lines[e] === -1);
  // 其他 15 格先標記：A 7、B 8 → 最後一格給 A 後變 8:8
  for (let b = 0; b < 15; b++) { g.boxes[b] = b < 7 ? 0 : 1; }
  g.scores = [7, 8];
  g.counts = [7, 8];
  g.turn = 0;
  edges.slice(0, 2).forEach(e => { g.lines[e] = 1; });
  L.drawLine(g, 'A', edges[2]);
  assert.equal(g.phase, 'finished');
  assert.deepEqual(g.scores, [8, 8]);
  assert.equal(g.winner, 'draw');
});

test('投降／離開：對手獲勝；非進行中不處理', () => {
  const g = started();
  assert.equal(L.forfeit(g, 'A', 'resign'), true);
  assert.equal(g.winner, 1);
  assert.equal(g.endReason, 'resign');
  assert.equal(L.forfeit(g, 'A'), false);
  const h = L.createGame();
  assert.equal(L.forfeit(h, 'A'), false);
});

test('buildView：帶 mySeat，觀戰者為 -1', () => {
  const g = started();
  assert.equal(L.buildView(g, g.players[1]).mySeat, 1);
  assert.equal(L.buildView(g, 'someone').mySeat, -1);
  assert.equal(L.buildView(g, null).mySeat, -1);
});
