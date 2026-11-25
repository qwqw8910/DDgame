// ================================================================
//  gt:state 傳輸格式 — 單元測試：packView 之後再 unpackView，要跟 buildView 原本的樣子一模一樣
//  執行（在 server/ 下）：node --test tests/unit/gem-td/wire.test.js
// ================================================================
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../../gem-td/gameLogic');
const { packView, unpackView } = require('../../../gem-td/wire');

function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 經過 JSON 傳輸後還原，要等於原本視圖經過 JSON 的樣子（undefined 欄位本來就不會送）
function roundTrip(view) {
  const wire = JSON.parse(JSON.stringify(packView(view)));
  assert.deepEqual(unpackView(wire), JSON.parse(JSON.stringify(view)));
  return wire;
}

// 擺塔：每人把這輪的寶石放下，留一顆（其餘變石頭），重複幾輪，讓場上有新塔、舊塔、石頭
function build(game, rounds, rng) {
  for (let r = 0; r < rounds; r++) {
    for (const id of game.playerIds) L.autoResolve(game, id, rng);
    L.startWave(game, { rng });
    let guard = 0;
    while (!L.tick(game, 0.1, rng).done && guard++ < 20000);
    L.finishWave(game, { now: 1000, rng });
  }
  // 停在建造中、還沒放的狀態，再放一顆讓有 fresh 塔（帶 slot）
  for (const id of game.playerIds) {
    const p = game.players[id];
    const free = [];
    for (let y = 0; y < game.board.height && free.length < 3; y++) for (let x = 0; x < game.board.width; x++) if (!p.grid.has(`${x},${y}`)) free.push({ x, y });
    for (const c of free) {
      try { L.placeGem(game, id, p.pending[0].slot, c.x, c.y); break; } catch { /* 封路就換一格 */ }
    }
  }
}

test('一般模式：看自己、看別人、觀戰者，都能完整還原；看自己時 me.towers 共用 view.towers', () => {
  const rng = seededRng(2);
  const game = L.createGame();
  game.options = { ...game.options, waves: 15, buildSeconds: 0 };
  L.startGame(game, ['a', 'b'], { now: 1000, rng });
  build(game, 3, rng);

  const self = roundTrip(L.buildView(game, 'a', 'a'));
  assert.equal(self.me.towers, 0, '看自己時不重複送 me.towers');
  const other = roundTrip(L.buildView(game, 'a', 'b'));
  assert.notEqual(other.me.towers, 0, '看別人時 me.towers 仍是自己的塔');
  assert.ok(unpackView(other).me.towers.every(t => t.owner === 'a'));
  roundTrip(L.buildView(game, null, 'b')); // 觀戰者：沒有 me
});

test('環形接力：正在看的那一區不重複送塔與路線，還原後跟其他區格式相同', () => {
  const rng = seededRng(3);
  const game = L.createGame();
  game.options = L.resolveOptions({ mode: 'relay', zones: 3, waves: 15, buildSeconds: 0 });
  L.startGame(game, ['a'], { now: 1000, rng });
  build(game, 3, rng);

  for (const watch of game.playerIds) {
    const view = L.buildView(game, 'a', watch);
    const wire = roundTrip(view);
    const i = game.playerIds.indexOf(watch);
    assert.equal(wire.relay.zones[i].towers, null);
    assert.equal(wire.relay.zones[i].path, null);
    assert.ok(view.relay.zones[i].towers.length > 0, '測試要有塔才有意義');
  }
});

test('不是壓縮格式的視圖原樣通過（相容舊伺服器）', () => {
  const plain = { phase: 'waiting', towers: [], path: [] };
  assert.equal(unpackView(plain), plain);
  assert.equal(unpackView(null), null);
});
