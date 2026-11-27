// ================================================================
//  寶石塔防 — 單元測試
//  執行（在 server/ 下）：node --test tests/unit/gem-td/gameLogic.test.js
// ================================================================
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../../gem-td/gameLogic');
const C = require('../../../gem-td/config');
const { prepareTowers, stepWave } = require('../../../gem-td/waveSim');
const { findFullPath } = require('../../../gem-td/pathing');

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

function newGame(ids = ['a'], { rng = seededRng(), options } = {}) {
  const game = L.createGame();
  if (options) game.options = L.resolveOptions(options);
  L.startGame(game, ids, { now: 0, rng });
  return game;
}

const setPending = (game, id, gems) => {
  game.players[id].pending = gems.map(([kind, level], slot) => ({ slot, kind, level }));
};

// 依序放在第 row 列的空格（避開路徑點）
function placeAll(game, id, row = 4) {
  const placed = [];
  let x = 4;
  while (game.players[id].pending.length) {
    const { slot } = game.players[id].pending[0];
    placed.push(L.placeGem(game, id, slot, x, row));
    x += 2;
  }
  return placed;
}

function runWave(game, rng = seededRng(7)) {
  L.startWave(game, { rng });
  for (let i = 0; i < 20000; i++) {
    if (L.tick(game, 0.1, rng).done) break;
  }
  return L.finishWave(game, { now: 0, rng });
}

// 清空一位玩家的地圖，讓這一波全部漏掉
function emptyField(game, id) {
  const p = game.players[id];
  p.towers = [];
  p.grid.clear();
  p.pending = [];
  p.resolved = true;
}

test('開局：每人 5 顆寶石，路徑依序經過所有路徑點', () => {
  const game = newGame(['a', 'b']);
  assert.equal(game.phase, 'build');
  assert.equal(game.board.width, 25);
  assert.equal(game.players.a.pending.length, 5);
  assert.equal(game.players.b.pending.length, 5);

  const stops = [game.board.start, ...game.board.checkpoints, game.board.end];
  let cursor = 0;
  for (const stop of stops) {
    cursor = game.players.a.path.findIndex((c, i) => i >= cursor && c.x === stop.x && c.y === stop.y);
    assert.ok(cursor >= 0, `路徑缺少 ${stop.x},${stop.y}`);
  }
});

test('品質 1 不會抽到 L4 以上；品質 8 不會抽到 L1、L2', () => {
  const rng = seededRng(3);
  // 每跑一次 finishWave 就重抽一手
  const levelsAt = (quality) => {
    const game = newGame(['a'], { rng });
    game.players.a.quality = quality;
    const levels = [];
    for (let i = 0; i < 50; i++) {
      game.phase = 'wave';
      game.wave = 0;
      game.players.a.sim = { wave: 1, earned: 0, def: { count: 0 } };
      L.finishWave(game, { now: 0, rng });
      levels.push(...game.players.a.pending.map(g => g.level));
    }
    return levels;
  };
  assert.ok(Math.max(...levelsAt(1)) <= 3);
  assert.ok(Math.min(...levelsAt(8)) >= 3);
});

test('不能放在路徑點、已有物體的格子，也不能封死路線', () => {
  const game = newGame();
  const { start } = game.board;
  assert.throws(() => L.placeGem(game, 'a', 0, start.x, start.y), { code: 'BAD_CELL' });
  L.placeGem(game, 'a', 0, 5, 5);
  assert.throws(() => L.placeGem(game, 'a', 1, 5, 5), { code: 'BAD_CELL' });

  // 用石牆把起點整列圍住，只留一格；堵最後一格必須被拒絕
  const g2 = newGame();
  const { width } = g2.board;
  for (let x = 0; x < width - 1; x++) {
    g2.players.a.grid.set(`${x},${g2.board.start.y + 1}`, true);
  }
  // 起點列的出口只剩右邊往下；封住第一路徑點周圍
  const cp = g2.board.checkpoints[0];
  g2.players.a.grid.set(`${cp.x},${cp.y + 1}`, true);
  g2.players.a.grid.set(`${cp.x + 1},${cp.y}`, true);
  g2.players.a.grid.set(`${cp.x},${cp.y - 1}`, true);
  assert.throws(() => L.placeGem(g2, 'a', 0, cp.x - 1, cp.y), { code: 'PATH_BLOCKED' });
  assert.equal(g2.players.a.pending.length, 5, '被拒絕的寶石要留在手上');
  assert.equal(g2.players.a.grid.has(`${cp.x - 1},${cp.y}`), false, '被拒絕的格子要復原');
});

test('放完才能選；保留 1 顆，其餘變石頭', () => {
  const game = newGame();
  setPending(game, 'a', [['B', 1], ['D', 1], ['E', 1], ['O', 1], ['R', 3]]);
  const first = L.placeGem(game, 'a', 0, 4, 4);
  assert.throws(() => L.keepGem(game, 'a', first.id), { code: 'NOT_PLACED' });
  const rest = placeAll(game, 'a', 6);
  L.keepGem(game, 'a', rest[3].id);

  assert.equal(game.players.a.towers.filter(t => t.kind === 'stone').length, 4);
  const kept = game.players.a.towers.find(t => t.kind !== 'stone');
  assert.deepEqual([kept.kind, kept.level], ['R', 3]);
  assert.equal(kept.fresh, false);
  assert.equal(game.players.a.resolved, true);
  assert.throws(() => L.keepGem(game, 'a', kept.id), { code: 'ALREADY_RESOLVED' });
});

test('同級合成：2 顆 +1、4 顆 +2，不同級不算', () => {
  const two = newGame();
  setPending(two, 'a', [['R', 2], ['R', 2], ['D', 2], ['E', 1], ['O', 3]]);
  const placed = placeAll(two, 'a');
  assert.throws(() => L.mergeGem(two, 'a', placed[2].id), { code: 'CANNOT_MERGE' });
  L.mergeGem(two, 'a', placed[0].id);
  assert.equal(placed[0].level, 3);

  const four = newGame();
  setPending(four, 'a', [['Q', 1], ['Q', 1], ['Q', 1], ['Q', 1], ['O', 3]]);
  const p4 = placeAll(four, 'a');
  L.mergeGem(four, 'a', p4[1].id);
  assert.equal(p4[1].level, 3);

  const cap = newGame();
  setPending(cap, 'a', [['Q', 7], ['Q', 7], ['Q', 1], ['G', 1], ['O', 3]]);
  const p7 = placeAll(cap, 'a');
  assert.throws(() => L.mergeGem(cap, 'a', p7[0].id), { code: 'CANNOT_MERGE' }, '至尊是最高等級');

  const top = newGame();
  setPending(top, 'a', [['Q', 6], ['Q', 6], ['Q', 1], ['G', 1], ['O', 3]]);
  const p6 = placeAll(top, 'a');
  L.mergeGem(top, 'a', p6[0].id);
  assert.equal(p6[0].level, 7, '兩顆巨型合成至尊');
});

test('特殊塔：用本回合材料合成，其餘全變石頭', () => {
  const game = newGame();
  setPending(game, 'a', [['B', 2], ['Q', 2], ['D', 2], ['E', 1], ['O', 3]]);
  const placed = placeAll(game, 'a');
  assert.ok(L.availableRecipes(game, 'a').some(r => r.id === 'silver'));
  const tower = L.combine(game, 'a', 'silver', placed[1].id);
  assert.equal(tower.id, placed[1].id);
  assert.equal(tower.kind, 'silver');
  assert.equal(game.players.a.resolved, true);
  assert.equal(game.players.a.towers.filter(t => t.kind === 'stone').length, 4);
});

test('特殊塔：只用場上保留的寶石時，本回合繼續', () => {
  const game = newGame();
  for (const [kind, x] of [['E', 3], ['G', 5], ['O', 7]]) {
    const t = { id: game.nextTowerId++, x, y: 3, kind, level: 2, owner: 'a', fresh: false, kills: 0, damage: 0 };
    game.players.a.towers.push(t);
    game.players.a.grid.set(`${x},3`, t);
  }
  const before = game.players.a.pending.length;
  const tower = L.combine(game, 'a', 'malachite');
  assert.equal(tower.kind, 'malachite');
  assert.equal(game.players.a.resolved, false);
  assert.equal(game.players.a.pending.length, before);
});

test('至尊（Lv7）：只能合成不能抽到；8 種各一顆至尊合成隱藏塔甜點之神', () => {
  assert.equal(C.MAX_LEVEL, 7);
  assert.equal(C.catalog().levelNames[6], '至尊');
  assert.ok(C.catalog().gems.B.levels[6].damage > C.catalog().gems.B.levels[5].damage);
  for (const row of C.QUALITY_RATES) assert.ok(row.length <= 6 && row.every((w, i) => i < 6 || w === 0));
  for (let i = 0; i < 300; i++) assert.ok(L.rollGems(8, Math.random).every(g => g.level <= 6));

  const game = newGame();
  const p = game.players.a;
  p.pending = [];
  const kinds = ['B', 'D', 'E', 'G', 'O', 'Q', 'R', 'P'];
  const add = (kind, level, x, y) => {
    const t = { id: game.nextTowerId++, x, y, kind, level, owner: 'a', fresh: false, kills: 10, damage: 100 };
    p.towers.push(t);
    p.grid.set(`${x},${y}`, t);
  };
  kinds.slice(0, 7).forEach((k, i) => add(k, 7, 2 + i, 3));
  add('P', 6, 2, 5);
  assert.ok(!L.availableRecipes(game, 'a').some(r => r.id === 'godsweet'), '少一顆或等級不夠都不能合成');
  p.towers.find(t => t.kind === 'P').level = 7;
  assert.ok(L.availableRecipes(game, 'a').some(r => r.id === 'godsweet'));
  const tower = L.combine(game, 'a', 'godsweet');
  assert.equal(tower.kind, 'godsweet');
  assert.equal(tower.kills, 80);
  assert.equal(p.towers.filter(t => t.kind !== 'godsweet' && t.kind !== 'stone').length, 0, '8 顆材料都變石頭');
  assert.ok(L.combineNotice(game, 'a', tower).includes('甜點之神'));
  assert.ok(C.catalog().recipes.find(r => r.id === 'godsweet').hidden);
});

test('特殊塔：同種兩顆的配方分別配對，且不偷用別人的寶石', () => {
  const game = newGame(['a', 'b']);
  const add = (owner, kind, level, x) => {
    const t = { id: game.nextTowerId++, x, y: 3, kind, level, owner, fresh: false, kills: 0, damage: 0 };
    game.players[owner].towers.push(t);
    game.players[owner].grid.set(`${x},3`, t);
  };
  add('a', 'P', 5, 3);
  add('a', 'D', 3, 5);
  add('b', 'P', 3, 7);
  assert.ok(!L.availableRecipes(game, 'a').some(r => r.id === 'gold'), '一顆紫水晶不能兼任兩個材料');
  add('a', 'P', 3, 9);
  assert.ok(L.availableRecipes(game, 'a').some(r => r.id === 'gold'));
  const tower = L.combine(game, 'a', 'gold');
  assert.equal(tower.kind, 'gold');
  assert.equal(game.players.b.towers[0].kind, 'P');
});

test('特殊塔升級：留在原本的特殊塔位置', () => {
  const game = newGame();
  const add = (kind, level, x) => {
    const t = { id: game.nextTowerId++, x, y: 3, kind, level, owner: 'a', fresh: false, kills: 0, damage: 0 };
    game.players.a.towers.push(t);
    game.players.a.grid.set(`${x},3`, t);
    return t;
  };
  add('D', 4, 3);
  const silver = add('silver', 1, 5);
  add('B', 4, 7);
  const tower = L.combine(game, 'a', 'starsilver');
  assert.equal(tower.id, silver.id);
  assert.equal(tower.level, 2);
});

test('商店：升品質、換位置、拆除都要扣金幣', () => {
  const game = newGame();
  assert.throws(() => L.upgradeQuality(game, 'a'), { code: 'NO_GOLD' });
  game.players.a.gold = 100;
  L.upgradeQuality(game, 'a');
  assert.equal(game.players.a.quality, 2);
  assert.equal(game.players.a.gold, 100 - C.QUALITY_COSTS[0]);

  setPending(game, 'a', [['B', 1], ['D', 1], ['E', 1], ['O', 1], ['R', 3]]);
  const placed = placeAll(game, 'a');
  L.keepGem(game, 'a', placed[4].id);
  const stone = game.players.a.towers.find(t => t.kind === 'stone');
  const [sx, sy] = [stone.x, stone.y];

  game.players.a.gold = C.SWAP_COST;
  L.swapWithStone(game, 'a', placed[4].id, stone.id);
  assert.deepEqual([placed[4].x, placed[4].y], [sx, sy]);
  assert.equal(game.players.a.grid.get(`${sx},${sy}`), placed[4]);

  L.removeStone(game, 'a', stone.id);
  assert.equal(game.players.a.gold, 0);
  assert.equal(game.players.a.towers.includes(stone), false);
  assert.throws(() => L.removeStone(game, 'a', placed[4].id), { code: 'BAD_TOWER' });
  const another = game.players.a.towers.find(t => t.kind === 'stone');
  L.removeStone(game, 'a', another.id); // 免費，沒錢也能拆
  assert.equal(game.players.a.gold, 0);
});

test('女王蟻扣血依整局進度調整：後面的王扣比較多，最後一隻固定最高', () => {
  const early = C.waveDef(10, 50).groups.find(g => g.type === 'boss');
  const last = C.waveDef(50, 50).groups.find(g => g.type === 'boss');
  assert.ok(early.leak < last.leak, '前面的王扣得少');
  assert.equal(C.waveDef(15, 15).groups[0].leak, last.leak, '不同長度的局，最後一隻王扣一樣多');
  assert.equal(C.waveDef(3, 30).groups[0].leak, undefined, '一般蟲不受影響');
});

test('重骰：一次換掉五格、只收一次錢、品質越高越貴、每骰一次加價、放下後不能骰、下回合歸零', () => {
  const game = newGame();
  const p = game.players.a;
  assert.throws(() => L.rerollGems(game, 'a', { rng: seededRng(3) }), { code: 'NO_GOLD' });

  p.gold = 1000;
  const first = C.rerollCost(1, 0);
  const before = p.pending.map(g => ({ ...g }));
  L.rerollGems(game, 'a', { rng: seededRng(3) });
  assert.equal(p.gold, 1000 - first);
  assert.equal(p.pending.length, C.GEMS_PER_ROUND);
  assert.deepEqual(p.pending.map(g => g.slot), before.map(g => g.slot), 'slot 不變');
  assert.notDeepEqual(p.pending, before, '五格都重新抽過');
  assert.equal(p.rerolls, 1, '一次只算一骰');
  assert.ok(C.rerollCost(1, 1) > first, '第二骰比較貴');
  assert.equal(L.buildView(game, 'a').me.rerollCost, C.rerollCost(1, 1));

  L.upgradeQuality(game, 'a');
  assert.ok(C.rerollCost(2, 1) > C.rerollCost(1, 1), '升品質後比較貴');
  assert.equal(L.buildView(game, 'a').me.rerollCost, C.rerollCost(2, 1));

  L.placeGem(game, 'a', p.pending[0].slot, 4, 6);
  assert.throws(() => L.rerollGems(game, 'a'), { code: 'ALREADY_PLACED' });
  assert.equal(L.buildView(game, 'a').me.canReroll, false);

  placeAll(game, 'a');
  L.keepGem(game, 'a', p.towers.find(t => t.fresh).id);
  runWave(game);
  assert.equal(p.rerolls, 0);
  assert.equal(L.buildView(game, 'a').me.rerollCost, C.rerollCost(2, 0));
});

test('熟練度：每階加傷害與攻速，合成特殊塔時擊殺數繼承', () => {
  assert.deepEqual(C.MASTERY_KILLS.map(n => C.masteryRank(n - 1)), [0, 1, 2, 3]);
  assert.equal(C.masteryRank(C.MASTERY_KILLS[3]), 4);

  const game = newGame();
  const mk = (kind, level, kills) => {
    const t = { id: game.nextTowerId++, x: game.nextTowerId, y: 3, kind, level, owner: 'a', fresh: false, kills, damage: kills * 10 };
    game.players.a.towers.push(t);
    return t;
  };
  const b = mk('B', 2, 20);
  mk('Q', 2, 5);
  mk('D', 2, 7);
  const result = L.combine(game, 'a', 'silver', b.id);
  assert.equal(result.kills, 32);
  assert.equal(result.damage, 320);
});

test('沒選完不能準備；線上的人都準備好才算全員準備', () => {
  const game = newGame(['a', 'b']);
  assert.throws(() => L.setReady(game, 'a'), { code: 'NOT_RESOLVED' });
  const placed = placeAll(game, 'a');
  L.keepGem(game, 'a', placed[0].id);
  L.setReady(game, 'a');
  assert.equal(L.allReady(game, ['a', 'b']), false);
  assert.equal(L.allReady(game, ['a']), true, 'b 斷線時不用等');
  assert.equal(L.allReady(game, []), false);
});

test('時間到代選：補完放置並保留最好的一顆', () => {
  const rng = seededRng(5);
  const game = newGame(['a'], { rng });
  setPending(game, 'a', [['B', 1], ['D', 1], ['E', 4], ['O', 1], ['R', 2]]);
  L.startWave(game, { rng });
  assert.equal(game.phase, 'wave');
  const kept = game.players.a.towers.filter(t => t.kind !== 'stone');
  assert.equal(kept.length, 1);
  assert.equal(kept[0].kind, 'E');
  assert.ok(findFullPath(game.board, (x, y) => game.players.a.grid.has(`${x},${y}`)));
});

test('沒有塔時怪物走到終點扣血，全部漏完後進入下一回合', () => {
  const game = newGame();
  emptyField(game, 'a');
  const { finished } = runWave(game);
  assert.equal(finished, false);
  assert.equal(game.lives, C.START_LIVES - C.waveDef(1, 30).count * C.MONSTERS.normal.leak);
  assert.equal(game.phase, 'build');
  assert.equal(game.wave, 1);
  assert.equal(game.players.a.pending.length, 5);
  assert.equal(game.players.a.gold, C.waveClearBonus(1));
});

test('對地塔打不到空軍，對空塔打不到地面', () => {
  const put = (game, kind) => {
    emptyField(game, 'a');
    const { x, y } = game.board.start;
    const t = { id: game.nextTowerId++, x: x + 1, y: y + 1, kind, level: 6, owner: 'a', fresh: false, kills: 0, damage: 0 };
    game.players.a.towers = [t];
    return t;
  };
  const air = newGame();
  air.wave = 4; // 第 5 波是空軍
  const diamond = put(air, 'D');
  runWave(air);
  assert.equal(diamond.damage, 0);

  const air2 = newGame();
  air2.wave = 4;
  const amethyst = put(air2, 'P');
  runWave(air2);
  assert.ok(amethyst.damage > 0);

  const ground = newGame();
  const amethyst2 = put(ground, 'P');
  runWave(ground);
  assert.equal(amethyst2.damage, 0);
});

test('緩速讓怪物走得比較慢；護甲會減傷', () => {
  const timeFor = (kind) => {
    const game = newGame();
    emptyField(game, 'a');
    const { x, y } = game.board.checkpoints[2];
    game.players.a.towers = kind ? [{ id: 1, x: x + 1, y: y + 1, kind, level: 1, owner: 'a', fresh: false, kills: 0, damage: 0 }] : [];
    L.startWave(game);
    game.players.a.sim.queue[0].hp = 1e9;
    game.players.a.sim.def.count = 1;
    let t = 0;
    while (!L.tick(game, 0.1).done) t += 0.1;
    return t;
  };
  assert.ok(timeFor('B') > timeFor(null));
  assert.ok(C.armorFactor(10) < C.armorFactor(0));
  assert.ok(C.armorFactor(-5) > 1);
});

test('隊伍血量歸零 → 失敗；打完最後一波 → 勝利', () => {
  const lose = newGame();
  lose.lives = 1;
  emptyField(lose, 'a');
  assert.equal(runWave(lose).finished, true);
  assert.equal(lose.phase, 'finished');
  assert.equal(lose.result.win, false);

  const win = newGame(['a'], { options: { waves: 15, damageTest: false } });
  win.wave = 14;
  win.lives = 100;
  emptyField(win, 'a');
  L.startWave(win);
  assert.equal(win.players.a.sim.def.type, 'boss', '最後一波一定是首領');
  win.players.a.sim.def.count = 0;
  assert.equal(L.tick(win, 0.1).done, true);
  assert.equal(L.finishWave(win, { now: 0 }).finished, true);
  assert.equal(win.result.win, true);
});

test('每人一張地圖：放在同一格互不影響，也動不到別人的餅乾牆', () => {
  const game = newGame(['a', 'b']);
  L.placeGem(game, 'a', 0, 5, 5);
  L.placeGem(game, 'b', 0, 5, 5);
  assert.equal(game.players.a.towers.length, 1);
  assert.equal(game.players.b.towers.length, 1);

  emptyField(game, 'a');
  emptyField(game, 'b');
  setPending(game, 'a', [['B', 1], ['D', 1], ['E', 1], ['O', 1], ['R', 3]]);
  game.players.a.resolved = false;
  const placed = placeAll(game, 'a');
  L.keepGem(game, 'a', placed[0].id);
  const stone = game.players.a.towers.find(t => t.kind === 'stone');
  assert.throws(() => L.removeStone(game, 'b', stone.id), { code: 'BAD_TOWER' });
});

test('每張地圖打一份完整的波次，血量不隨人數變動；金幣各賺各的', () => {
  const game = newGame(['a', 'b']);
  emptyField(game, 'a');
  emptyField(game, 'b');
  const { x, y } = game.board.start;
  game.players.b.towers = [{ id: 99, x: x + 1, y: y + 1, kind: 'R', level: 6, owner: 'b', fresh: false, kills: 0, damage: 0 }];
  L.startWave(game);
  assert.notEqual(game.players.a.sim, game.players.b.sim);
  assert.equal(game.players.a.sim.def.hp, C.waveDef(1, 30).hp);
  assert.equal(L.tick(game, 0.1).done, false);
  for (let i = 0; i < 20000; i++) if (L.tick(game, 0.1).done) break;
  L.finishWave(game, { now: 0 });
  assert.equal(game.players.a.gold, C.waveClearBonus(1), 'a 沒有擊殺，只拿過關獎勵');
  assert.ok(game.players.b.gold > C.waveClearBonus(1));
});

test('共用血量：任何一張地圖漏怪都扣同一條血', () => {
  const game = newGame(['a', 'b']);
  emptyField(game, 'a');
  emptyField(game, 'b');
  runWave(game);
  const leaks = C.waveDef(1, 30).count * C.MONSTERS.normal.leak;
  assert.equal(game.lives, C.START_LIVES * 2 - leaks * 2);
  assert.equal(game.players.a.out, false);
});

test('獨立血量：歸零的人出局，其他人繼續；不能再操作，也不用等他準備', () => {
  const game = newGame(['a', 'b', 'c'], { options: { livesMode: 'solo' } });
  for (const id of ['a', 'b', 'c']) emptyField(game, id);
  game.players.a.lives = 1;
  const { finished } = runWave(game);
  assert.equal(finished, false);
  assert.equal(game.players.a.out, true);
  assert.equal(game.players.a.outWave, 1);
  assert.equal(game.players.a.pending.length, 0, '出局的人不再發甜點');
  assert.equal(game.players.b.pending.length, 5);
  assert.equal(game.lives, C.START_LIVES, '共用血量不動');
  assert.ok(game.players.b.lives < C.START_LIVES);
  assert.throws(() => L.placeGem(game, 'a', 0, 5, 5), { code: 'PLAYER_OUT' });

  for (const id of ['b', 'c']) {
    const placed = placeAll(game, id);
    L.keepGem(game, id, placed[0].id);
    L.setReady(game, id);
  }
  assert.equal(L.allReady(game, ['a', 'b', 'c']), true);
  assert.equal(L.buildView(game, 'a').me.out, true);
});

test('獨立血量：只剩一人立刻獲勝；單人局歸零就輸', () => {
  const game = newGame(['a', 'b'], { options: { livesMode: 'solo' } });
  emptyField(game, 'a');
  emptyField(game, 'b');
  game.players.a.lives = 1;
  assert.equal(runWave(game).finished, true);
  assert.deepEqual(game.result.winnerIds, ['b']);
  assert.equal(game.result.scores[0].id, 'b');

  const solo = newGame(['a'], { options: { livesMode: 'solo' } });
  emptyField(solo, 'a');
  solo.players.a.lives = 1;
  assert.equal(runWave(solo).finished, true);
  assert.deepEqual(solo.result.winnerIds, []);
  assert.equal(solo.result.win, false);
});

test('獨立血量：打完最後一波比剩餘血量，同分並列', () => {
  const game = newGame(['a', 'b', 'c'], { options: { waves: 15, livesMode: 'solo', damageTest: false } });
  game.wave = 14;
  for (const id of ['a', 'b', 'c']) emptyField(game, id);
  game.players.a.lives = 90;
  game.players.b.lives = 90;
  game.players.c.lives = 50;
  L.startWave(game);
  for (const id of ['a', 'b', 'c']) game.players[id].sim.def.count = 0;
  assert.equal(L.tick(game, 0.1).done, true);
  assert.equal(L.finishWave(game, { now: 0 }).finished, true);
  assert.deepEqual(game.result.winnerIds, ['a', 'b']);
});

test('玩家離開：他的地圖收掉；獨立血量剩一人時直接獲勝', () => {
  const team = newGame(['a', 'b']);
  placeAll(team, 'b');
  assert.deepEqual(L.leavePlayer(team, 'b'), { changed: true, remaining: 1, finished: false });
  assert.equal(L.buildView(team, 'a').playerIds.includes('b'), false);

  const solo = newGame(['a', 'b'], { options: { livesMode: 'solo' } });
  assert.deepEqual(L.leavePlayer(solo, 'b'), { changed: true, remaining: 1, finished: true });
  assert.deepEqual(solo.result.winnerIds, ['a']);
});

test('視圖：預設看自己的地圖，可切換；觀戰者看第一位玩家', () => {
  const game = newGame(['a', 'b']);
  L.placeGem(game, 'b', 0, 5, 5);
  assert.equal(L.buildView(game, 'a').watching, 'a');
  assert.equal(L.buildView(game, 'a').towers.length, 0);
  const watched = L.buildView(game, 'a', 'b');
  assert.equal(watched.watching, 'b');
  assert.equal(watched.towers.length, 1);
  assert.equal(watched.me.towers.length, 0, 'me 仍是自己的塔');
  assert.equal(L.buildView(game, null).watching, 'a');
  assert.equal(L.buildView(game, 'a', 'ghost').watching, 'a', '對象不在場時回到自己');
});

test('快照：每張地圖一份，摘要含所有人', () => {
  const game = newGame(['a', 'b'], { options: { livesMode: 'solo' } });
  emptyField(game, 'a');
  emptyField(game, 'b');
  L.startWave(game);
  for (let i = 0; i < 10; i++) L.tick(game, 0.1);
  const frames = L.buildFrames(game);
  assert.equal(frames.a.owner, 'a');
  assert.equal(frames.b.owner, 'b');
  assert.equal(frames.a.m.length > 0, true);
  assert.equal(frames.a.players.b.lives, C.START_LIVES);
});

test('視圖：觀戰者沒有 me；只看得到自己的手牌', () => {
  const game = newGame(['a', 'b']);
  assert.equal(L.buildView(game, null).me, null);
  const view = L.buildView(game, 'a');
  assert.equal(view.me.pending.length, 5);
  assert.equal(JSON.stringify(view.players).includes('pending'), false);
  JSON.stringify(view); // Map 等內部欄位不能讓序列化出錯
});

// ── 怪物特性 ────────────────────────────────────────────────────
const traitSim = (group) => {
  const def = { type: group.type, count: 1, interval: 1, groups: [group] };
  return {
    def, wave: 1, board: { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } }, pool: { lives: 100 },
    time: 0, queue: [group], spawned: 0, splits: 0, nextId: 1, monsters: [], towers: [], armorAuras: [],
    path: Array.from({ length: 200 }, (_, x) => ({ x, y: 0 })), airLength: 1, killed: 0, leaked: 0, earned: 0, shots: [], done: false,
  };
};
const towerAt = (kind, level, x = 1) => {
  const ref = { id: 1, x, y: 1, kind, level, kills: 0, damage: 0 };
  return prepareTowers([ref])[0];
};

test('波次：前幾波單一怪種，之後主力帶特性並混入護衛，總隻數等於各組相加', () => {
  assert.equal(C.waveDef(5, 30).groups.length, 1);
  const def = C.waveDef(6, 30);
  assert.equal(def.groups.length, 2);
  assert.ok(C.TRAIT_IDS.includes(def.groups[0].trait));
  assert.equal(def.count, def.groups[0].count + def.groups[1].count);
  assert.notEqual(def.groups[0].type, def.groups[1].type);
  for (let wave = 1; wave <= 50; wave++) {
    const w = C.waveDef(wave, 50);
    assert.equal(new Set(w.groups.map(g => g.type)).size, w.groups.length, `第 ${wave} 波`);
  }
});

test('沒有回血特性：任何波次的蟲都不會回血（回血會懲罰蓋迷宮的人）', () => {
  assert.equal(C.TRAIT_IDS.includes('regen'), false);
  for (const total of [15, 30, 50]) {
    for (let wave = 1; wave <= total; wave++) {
      for (const g of C.waveDef(wave, total).groups) assert.notEqual(g.trait, 'regen', `${total} 波局第 ${wave} 波`);
    }
  }
});

test('分裂：死亡時生出兩隻沒有特性、沒有金幣的小蟲，波次總數跟著增加', () => {
  const sim = traitSim({ type: 'normal', count: 1, hp: 10, armor: 0, speed: 0.01, trait: 'split' });
  sim.towers = [towerAt('D', 6)];
  stepWave(sim, 0.1);
  assert.equal(sim.killed, 1);
  assert.equal(sim.splits, C.SPLIT_COUNT);
  const kids = sim.monsters.filter(m => !m.dead);
  assert.equal(kids.length, C.SPLIT_COUNT);
  assert.ok(kids.every(m => m.trait === null && m.gold === 0 && m.hp === 10 * C.SPLIT_HP_RATIO));
});

test('免控：緩速與中毒無效；護盾：單次傷害有上限', () => {
  const sim = traitSim({ type: 'normal', count: 1, hp: 1e6, armor: 0, speed: 0.01, trait: 'immune' });
  sim.towers = [towerAt('silver', 1), towerAt('bloodstone', 1)];
  stepWave(sim, 0.1);
  const [m] = sim.monsters;
  assert.ok(m.hp < 1e6, '直接傷害照吃');
  assert.equal(m.slowPct, 0);
  assert.equal(m.poisonDps, 0);

  const shielded = traitSim({ type: 'normal', count: 1, hp: 100, armor: 0, speed: 0.01, trait: 'shield' });
  shielded.towers = [towerAt('royalgold', 2)];
  stepWave(shielded, 0.1);
  assert.equal(shielded.monsters[0].hp, 100 * (1 - C.SHIELD_HIT_CAP));
});

test('許願價格：隨波數上漲、前期便宜、單次最貴 60 金', () => {
  assert.ok(C.wishCost(1, 0) < C.wishCost(20, 0), '波數越高底價越貴');
  assert.ok(C.wishCost(1, 2) <= 20, '前期連疊 3 次也不貴');
  for (const wave of [1, 10, 30, 50, 100]) {
    for (const s of [0, 1, 2]) assert.ok(C.wishCost(wave, s) <= 60);
  }
  assert.equal(C.wishCost(100, 2), 60);
});

test('許願池：疊加扣金幣、價格遞增、一次只影響一格、只影響下一回合', () => {
  const game = newGame();
  const p = game.players.a;
  assert.deepEqual(Object.keys(C.GEM_CATEGORIES).sort(), Object.keys(C.GEMS).sort()); // 直接選 8 種甜點之一
  assert.throws(() => L.makeWish(game, 'a', { category: 'B' }), { code: 'NO_GOLD' });
  assert.throws(() => L.makeWish(game, 'a', { category: 'nope' }), { code: 'BAD_ARG' });
  p.gold = 1000;
  const base = C.wishCost(game.wave, 0);
  assert.equal(L.buildView(game, 'a').me.wishCost, base);
  L.makeWish(game, 'a', { category: 'B' });
  assert.equal(p.gold, 1000 - base);
  assert.throws(() => L.makeWish(game, 'a', { category: 'D' }), { code: 'WISHED' });
  L.makeWish(game, 'a', { category: 'B' });
  L.makeWish(game, 'a', { category: 'B' });
  assert.equal(p.wish.stacks, 3);
  assert.equal(p.gold, 1000 - base * (1 + 2 + 3));
  assert.throws(() => L.makeWish(game, 'a', { category: 'B' }), { code: 'WISH_MAX' });

  // 一次許到指定層數：付清中間每一層，不用按三次
  const quick = newGame();
  const q = quick.players.a;
  q.gold = 1000;
  assert.deepEqual(L.buildView(quick, 'a').me.wishCosts, [0, 1, 2].map(s => C.wishCost(quick.wave, s)));
  L.makeWish(quick, 'a', { category: 'D', stacks: 2 });
  assert.deepEqual(q.wish, { category: 'D', stacks: 2 });
  assert.equal(q.gold, 1000 - base * 3);
  assert.throws(() => L.makeWish(quick, 'a', { category: 'D', stacks: 2 }), { code: 'BAD_ARG' }); // 不能往回
  L.makeWish(quick, 'a', { category: 'D', stacks: 3 });
  assert.equal(q.gold, 1000 - base * 6);
  const poor = newGame();
  poor.players.a.gold = base * 2;
  assert.throws(() => L.makeWish(poor, 'a', { category: 'B', stacks: 3 }), { code: 'NO_GOLD' });
  assert.equal(poor.players.a.wish ?? null, null);

  // 許願只影響 1 格：該格機率隨層數提高（3 層 100%），其餘 4 格維持原本隨機（約 1/8 為該甜點）
  const fruit = C.GEM_CATEGORIES.B.kinds;
  const N = 1500;
  const stats = stacks => {
    let wished = 0, others = 0, wishedLevel = 0;
    for (let i = 0; i < N; i++) {
      const hand = L.rollGems(1, Math.random, { category: 'B', stacks });
      assert.equal(hand.length, 5);
      wished += fruit.includes(hand[0].kind) ? 1 : 0;
      wishedLevel += hand[0].level;
      others += hand.slice(1).filter(g => fruit.includes(g.kind)).length;
    }
    return { wished: wished / N, others: others / (N * 4), level: wishedLevel / N };
  };
  const [s1, s2, s3] = [stats(1), stats(2), stats(3)];
  assert.ok(s1.wished > 0.55 && s2.wished > s1.wished && s3.wished === 1); // 1 層：0.6 + 0.4 × 1/8 ≈ 0.65
  assert.ok([s1, s2, s3].every(s => s.others < 0.2)); // 其餘格不受影響（約 1/8）
  assert.ok(s3.level > s2.level); // 第 3 次連等級也提高
});

test('研究：滿 5 級後進入匠心加給，加成平緩且成本遞增', () => {
  assert.equal(C.researchValue('damage', 5), 5 * 0.08);
  assert.ok(Math.abs(C.researchValue('damage', 15) - (0.4 + 0.1)) < 1e-9);
  assert.ok(Math.abs(C.researchValue('speed', 10) - (0.3 + 0.025)) < 1e-9);
  assert.ok(C.RESEARCH_COSTS[5] > C.RESEARCH_COSTS[4]);
  assert.ok(C.RESEARCH_COSTS.every((c, i, a) => i === 0 || c > a[i - 1]));
  assert.equal(C.catalog().researchBaseLevels, 5);
});

test('研究：扣金幣、加成生效、有上限；利息依存款發放且有上限', () => {
  const game = newGame();
  assert.throws(() => L.upgradeResearch(game, 'a', 'damage'), { code: 'NO_GOLD' });
  assert.throws(() => L.upgradeResearch(game, 'a', 'toString'), { code: 'BAD_ARG' });
  game.players.a.gold = C.RESEARCH_COSTS.reduce((n, c) => n + c, 0);
  C.RESEARCH_COSTS.forEach(() => L.upgradeResearch(game, 'a', 'damage'));
  assert.equal(game.players.a.gold, 0);
  assert.throws(() => L.upgradeResearch(game, 'a', 'damage'), { code: 'MAX_RESEARCH' });

  const ref = { id: 1, x: 1, y: 1, kind: 'D', level: 1, kills: 0, damage: 0 };
  const [plain] = prepareTowers([ref]);
  const [boosted] = prepareTowers([ref], { damage: 5, speed: 5, range: 5 });
  assert.ok(boosted.stats.damage > plain.stats.damage);
  assert.ok(boosted.cooldown < plain.cooldown);
  assert.ok(boosted.stats.range > plain.stats.range);

  assert.equal(C.interestOn(100), 5);
  assert.equal(C.interestOn(100000), C.interestOn(1000000));
});

test('視圖：下一波預告列出各組的怪種與特性', () => {
  const game = newGame();
  game.wave = 5;
  const { nextWave } = L.buildView(game, 'a');
  assert.equal(nextWave.groups.length, 2);
  assert.ok(nextWave.groups[0].trait);
});

test('配方：每個結果都有定義，第三階由第二階升級', () => {
  for (const r of C.RECIPES) {
    assert.ok(C.SPECIALS[r.result], r.id);
    for (const need of r.ingredients) assert.ok(C.GEMS[need.kind] || C.SPECIALS[need.kind], need.kind);
  }
  const t3 = C.RECIPES.filter(r => C.SPECIALS[r.result].tier === 3);
  assert.equal(t3.length, 5);
  assert.ok(t3.every(r => C.SPECIALS[r.ingredients[0].kind].tier === 2));
});

test('共用血量隨人數增加，獨立血量每人固定', () => {
  const team = newGame(['a', 'b', 'c']);
  assert.equal(team.lives, C.START_LIVES * 3);
  assert.equal(L.buildView(team, 'a').maxLives, C.START_LIVES * 3);

  const solo = L.createGame();
  solo.options = L.resolveOptions({ livesMode: 'solo' });
  L.startGame(solo, ['a', 'b'], { now: 0, rng: seededRng(1) });
  assert.equal(solo.players.a.lives, C.START_LIVES);
  assert.equal(L.buildView(solo, 'a').maxLives, C.START_LIVES);
});

test('買命：價格隨波次上漲、封頂 30 金且連買不加價，不能超過上限、金幣不足會被擋', () => {
  const game = newGame(['a'], { options: { livesMode: 'solo' } });
  assert.throws(() => L.buyLife(game, 'a'), { code: 'MAX_LIVES' });
  game.players.a.lives = 90;
  assert.throws(() => L.buyLife(game, 'a'), { code: 'NO_GOLD' });
  const price = C.lifeCost(0);
  game.players.a.gold = price * 2 + 5;
  L.buyLife(game, 'a');
  assert.equal(L.buildView(game, 'a').me.lifeCost, price, '連買不加價');
  L.buyLife(game, 'a');
  assert.equal(game.players.a.lives, 92);
  assert.equal(game.players.a.gold, 5);
  assert.equal(game.players.a.stats.lifeBought, 2);
  assert.ok(C.lifeCost(10) > C.lifeCost(1), '後期價格比較高');
  assert.equal(C.lifeCost(40), 30, '單價最多 30 金');

  const team = newGame(['a', 'b']);
  team.lives = 150;
  team.players.b.gold = C.lifeCost(0);
  L.buyLife(team, 'b');
  assert.equal(team.lives, 151, '共用血量加在隊伍身上');
});

test('傷害測試：打完最後一波多一個巨獸關卡，漏怪不扣血、結算記錄每人傷害', () => {
  const game = newGame(['a'], { options: { waves: 15 } });
  assert.equal(game.options.damageTest, true);
  game.wave = 14;
  emptyField(game, 'a');
  L.startWave(game);
  game.players.a.sim.def.count = 0;
  L.tick(game, 0.1);
  const step = L.finishWave(game, { now: 0 });
  assert.equal(step.finished, false, '還要打傷害測試');
  assert.equal(game.phase, 'build');
  assert.equal(L.buildView(game, 'a').nextWave.test, true);
  assert.throws(() => L.buyLife(game, 'a'), { code: 'BAD_PHASE' });

  const livesBefore = game.lives;
  L.startWave(game);
  const { sim } = game.players.a;
  assert.equal(sim.def.type, 'titan');
  const boss = C.waveDef(15, 15).groups[0];
  assert.ok(sim.def.hp >= boss.hp * 3, '巨獸血量是一般首領的好幾倍');
  for (let i = 0; i < 20000; i++) if (L.tick(game, 0.1).done) break;
  assert.equal(game.lives, livesBefore, '巨獸走到終點不扣血');
  L.finishWave(game, { now: 0 });
  assert.equal(game.phase, 'finished');
  assert.equal(game.result.win, true, '勝負沿用正式波次的結果');
  assert.equal(game.result.test.rounds[0].rows[0].id, 'a');
  assert.equal(game.result.test.rounds[0].rows[0].escaped, true);
  assert.ok(game.result.test.rounds[0].rows[0].damage < game.result.test.rounds[0].maxHp, '沒打死的話傷害小於血量');
});

test('關掉傷害測試：打完最後一波直接結算；結算帶漏怪與存錢指標', () => {
  const game = newGame(['a', 'b'], { options: { waves: 15, damageTest: false, livesMode: 'solo' } });
  game.wave = 14;
  emptyField(game, 'a');
  emptyField(game, 'b');
  game.players.a.stats.peakGold = 300;
  L.startWave(game);
  game.players.b.sim.def.count = 0;
  game.players.b.sim.monsters = [];
  game.players.b.sim.spawned = 0;
  for (let i = 0; i < 20000; i++) if (L.tick(game, 0.1).done) break;
  L.finishWave(game, { now: 0 });
  assert.equal(game.phase, 'finished');
  const { awards, scores } = game.result;
  assert.equal(game.result.test, null);
  assert.equal(awards.saver.id, 'a');
  assert.ok(scores.find(s => s.id === 'a').leaked >= 1);
  assert.equal(awards.perfectIds.includes('b'), true);
});

test('最多 6 人：7 人開局會被擋；只組有人在看的地圖快照', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  assert.equal(C.MAX_PLAYERS, 6);
  assert.throws(() => newGame([...ids, 'g']), { code: 'BAD_PLAYER_COUNT' });

  const game = newGame(ids, { options: { livesMode: 'solo' } });
  L.startWave(game);
  const all = L.buildFrames(game);
  assert.deepEqual(Object.keys(all).sort(), ids);
  const some = L.buildFrames(game, new Set(['b', 'e']));
  assert.deepEqual(Object.keys(some).sort(), ['b', 'e']);
  assert.equal(Object.keys(some.b.players).length, 6, '摘要仍包含所有人');
  assert.deepEqual(game.players.a.sim.shots, [], '沒人看的地圖會清掉射擊事件');
});

test('每 15 波加賽傷害測試：中途打完回到建造，最後一場才結算，另有總傷害榜', () => {
  assert.equal(C.testAfterWave(15, 50), true);
  assert.equal(C.testAfterWave(45, 50), true);
  assert.equal(C.testAfterWave(50, 50), true);
  assert.equal(C.testAfterWave(20, 50), false);

  const game = newGame(['a', 'b'], { options: { waves: 30, livesMode: 'solo' } });
  const finishField = () => {
    for (const id of ['a', 'b']) emptyField(game, id);
    L.startWave(game);
    for (const id of ['a', 'b']) game.players[id].sim.def.count = 0;
    L.tick(game, 0.1);
    return L.finishWave(game, { now: 0 });
  };
  const runTest = () => {
    L.startWave(game);
    for (let i = 0; i < 20000; i++) if (L.tick(game, 0.1).done) break;
    return L.finishWave(game, { now: 0 });
  };

  game.wave = 14;
  assert.equal(finishField().finished, false);
  assert.equal(game.testAt, 15, '第 15 波之後加賽');
  assert.equal(L.buildView(game, 'a').nextWave.test, true);
  const hp15 = C.testWaveDef(15).hp;
  const goldBefore = game.players.a.gold;
  assert.equal(runTest().finished, false, '中途測試打完還要繼續');
  assert.equal(game.testAt, null);
  const row = L.buildView(game, 'a').testLog.rounds[0].rows.find(r => r.id === 'a');
  assert.equal(row.reward, C.testReward(15, row.damage, row.maxHp));
  assert.ok(game.players.a.gold >= goldBefore + row.reward, '獎金入帳');
  assert.equal(game.wave, 15);
  assert.equal(L.buildView(game, 'a').nextWave.number, 16);
  assert.equal(L.buildView(game, 'a').testLog.rounds.length, 1, '中途就看得到紀錄');
  assert.equal(L.buildView(game, 'a').testLog.rounds[0].maxHp, hp15);

  game.wave = 29;
  assert.equal(finishField().finished, false);
  assert.equal(game.testAt, 30);
  assert.ok(C.testWaveDef(30).hp > hp15);
  assert.equal(runTest().finished, true);
  const { test: result } = game.result;
  assert.deepEqual(result.rounds.map(r => r.at), [15, 30]);
  assert.equal(result.totals.length, 2, '兩場以上有總傷害榜');
});

test('傷害測試獎金：依傷害比例，最多打滿，15／30／45 波滿分 190／340／490', () => {
  assert.equal(C.testReward(15, 1000, 1000), 190);
  assert.equal(C.testReward(30, 5000, 1000), 340, '超過 100% 也只算打滿');
  assert.equal(C.testReward(45, 500, 1000), 245);
  assert.equal(C.testReward(45, 0, 1000), 0);
  assert.equal(C.testReward(45, 1000, 1000), 490);

  const game = newGame(['a'], { options: { waves: 15 } });
  game.wave = 14;
  emptyField(game, 'a');
  L.startWave(game);
  game.players.a.sim.def.count = 0;
  L.tick(game, 0.1);
  L.finishWave(game, { now: 0 });
  const gold = game.players.a.gold;
  L.startWave(game);
  for (let i = 0; i < 20000; i++) if (L.tick(game, 0.1).done) break;
  L.finishWave(game, { now: 0 });
  assert.equal(game.phase, 'finished');
  assert.equal(game.players.a.gold, gold, '最後一場不發金幣');
});

test('難度：簡單最弱、困難最硬，未知值回到簡單', () => {
  const easy = C.waveDef(10, 30, 'easy');
  const normal = C.waveDef(10, 30, 'normal');
  const hard = C.waveDef(10, 30, 'hard');
  assert.ok(easy.hp < normal.hp && normal.hp < hard.hp);
  assert.ok(easy.armor < normal.armor && normal.armor < hard.armor);
  assert.equal(L.resolveOptions({ difficulty: 'nope' }).difficulty, 'easy');
  assert.equal(newGame(['a'], { options: { difficulty: 'hard' } }).options.difficulty, 'hard');
});

test('倍速：支援 1、2、4，其他拒絕', () => {
  const game = newGame();
  L.setSpeed(game, 4);
  assert.equal(game.speed, 4);
  assert.throws(() => L.setSpeed(game, 3), /不支援/);
});

test('暫停：單人建造階段凍結倒數，恢復後接續；多人不能暫停', () => {
  const game = newGame(['a'], { options: { buildSeconds: 60 } });
  L.setPaused(game, true, { now: 20000 });
  assert.equal(game.paused, true);
  assert.equal(game.buildEndsAt, null);
  assert.throws(() => L.setReady(game, 'a'), /暫停/);
  L.setPaused(game, false, { now: 50000 });
  assert.equal(game.buildEndsAt, 90000);
  assert.throws(() => L.setPaused(newGame(['a', 'b']), true, { now: 0 }), /單人/);
});

test('combineNotice 只公告第二階以上的特殊塔', () => {
  const game = { names: { a: '小明' } };
  assert.equal(L.combineNotice(game, 'a', { kind: 'silver' }), null);
  assert.match(L.combineNotice(game, 'a', { kind: 'starsilver' }), /小明 合成了/);
  assert.match(L.combineNotice(game, 'a', { kind: 'galaxy' }), /最高階的銀河慕斯/);
});

test('50 波最終傷害測試：巨獸血量 ×4、護甲 ×2，只限 50 波局的最後一場', () => {
  const base = C.testWaveDef(30, 'easy', 30).hp;
  assert.equal(C.testWaveDef(30, 'easy', 50).hp, base, '50 波局的中途測試不加強');
  const final = C.testWaveDef(50, 'easy', 50).hp;
  const mid = C.testWaveDef(50, 'easy', 100).hp;
  assert.equal(final, mid * C.FINAL_TEST_HP_MULT);
  assert.equal(C.testWaveDef(50, 'easy', 50).armor, C.testWaveDef(50, 'easy', 100).armor * C.FINAL_TEST_ARMOR_MULT);
  assert.equal(C.testWaveDef(30, 'easy', 30).hp, C.testWaveDef(30, 'easy').hp, '15／30 波局不變');
});

test('排行榜紀錄：通關、倒下、提早結束', () => {
  const lb = require('../../../gem-td/leaderboard');
  const game = newGame(['a'], { options: { livesMode: 'solo', waves: 15, damageTest: false } });
  game.startedAt = 1000;
  game.pausedMs = 20000;
  game.wave = 7;
  game.players.a.lives = 0;
  game.players.a.out = true;
  game.players.a.outWave = 8;
  game.phase = 'wave';
  L.finishNow(game);
  assert.deepEqual(game.records, [], '房主提早結束不列入');

  const g2 = newGame(['a'], { options: { waves: 15, damageTest: false } });
  g2.wave = 14;
  g2.lives = 100;
  emptyField(g2, 'a');
  g2.startedAt = Date.now() - 100000;
  g2.pausedMs = 40000;
  L.startWave(g2);
  g2.players.a.sim.def.count = 0;
  L.tick(g2, 0.1);
  L.finishWave(g2, { now: 0 });
  assert.equal(g2.records.length, 1);
  const rec = g2.records[0];
  assert.equal(rec.cleared, true);
  assert.equal(rec.reachedWave, 15);
  assert.ok(Math.abs(rec.clearSeconds - 60) <= 1, '扣掉暫停');
  assert.equal(rec.finalDamage, null, '沒開傷害測試沒有最終傷害');
  assert.equal(rec.damageRatio, null);

  const mk = (name, reached, diff, ratio, sec = null) => ({ player_name: name, reached_wave: reached, difficulty: diff, damage_ratio: ratio, clear_seconds: sec, created_at: name });
  // 綜合分數 = (波數×100 + 傷害比率×100) × 難度倍率：簡單 ×1、困難 ×2
  assert.equal(lb.score(mk('x', 30, 'easy', 0.5)), 3050);
  assert.equal(lb.score(mk('x', 30, 'hard', 0.5)), 6100);
  assert.equal(lb.score(mk('x', 30, 'easy', null)), 3000, '舊資料沒有傷害比率，傷害分算 0');
  const data = [mk('A', 30, 'easy', 1), mk('B', 20, 'hard', 0.2), mk('C', 30, 'easy', 1, 100), mk('D', 30, 'easy', 0.4), mk('E', 30, 'easy', null)];
  assert.deepEqual(lb.rank(data).map(r => r.name), ['B', 'C', 'A', 'D', 'E'], '困難加倍、同分先比通關時間');
  assert.equal(lb.rank(Array.from({ length: 80 }, (_, i) => mk(`p${i}`, 10, 'easy', 0))).length, 50, '榜單放 50 筆');
});

test('無盡模式：沒有最後一波、不會通關，每 15 波仍有傷害測試，排行榜取最高傷害比率', () => {
  const game = newGame(['a'], { options: { waves: C.ENDLESS } });
  assert.equal(game.options.waves, C.ENDLESS);
  game.wave = 49;
  game.lives = 100;
  emptyField(game, 'a');
  L.startWave(game);
  game.players.a.sim.def.count = 0;
  L.tick(game, 0.1);
  L.finishWave(game, { now: 0 });
  assert.equal(game.phase, 'build', '50 波之後還沒結束');
  assert.equal(game.testAt, null);
  assert.ok(C.testAfterWave(15, C.ENDLESS) && C.testAfterWave(45, C.ENDLESS));
  assert.ok(!C.testAfterWave(20, C.ENDLESS));
  assert.ok(C.waveDef(60, C.ENDLESS).hp > C.waveDef(30, C.ENDLESS).hp, '怪物持續變強');
  assert.equal(C.waveDef(20, C.ENDLESS).groups[0].type, 'boss', '每 10 波一隻首領');

  const p = game.players.a;
  p.stats.tests.push({ at: 15, damage: 500, maxHp: 1000, killed: false }, { at: 30, damage: 3000, maxHp: 2000, killed: true });
  game.startedAt = Date.now() - 1000;
  game.finishedAt = Date.now();
  const [rec] = L.buildRecords(game, []);
  assert.equal(rec.cleared, false);
  assert.equal(rec.reachedWave, game.wave + 1, '無盡的到達波數不設上限');
  assert.equal(rec.damageRatio, 1, '比率最多 100%，取最高的一場');
  assert.equal(rec.finalDamage, 3000);
});

test('房主無法透過設定關掉傷害測試', () => {
  assert.equal(L.resolveOptions({}).damageTest, true);
});

// ── 還原 ──────────────────────────────────────────────────────
test('還原：放置後還原，糖果回到手上、格子清空', () => {
  const game = newGame();
  const p = game.players.a;
  const before = p.pending.length;
  L.placeGem(game, 'a', p.pending[0].slot, 4, 4);
  assert.equal(p.towers.length, 1);
  L.undo(game, 'a');
  assert.equal(p.towers.length, 0);
  assert.equal(p.pending.length, before);
  assert.equal(p.grid.size, 0);
  assert.throws(() => L.undo(game, 'a'), /沒有可以還原/);
});

test('還原：拆餅乾牆與金幣一併還原，且可逐步退回', () => {
  const game = newGame();
  const p = game.players.a;
  setPending(game, 'a', [['ruby', 1], ['ruby', 1], ['ruby', 1], ['ruby', 1], ['ruby', 1]]);
  placeAll(game, 'a');
  L.keepGem(game, 'a', p.towers[0].id);
  const stone = p.towers.find(t => t.kind === 'stone');
  p.gold = 100;
  L.removeStone(game, 'a', stone.id);
  assert.equal(p.towers.length, 4);
  L.undo(game, 'a');
  assert.equal(p.towers.length, 5);
  assert.equal(p.gold, 100);
  assert.ok(p.grid.get(`${stone.x},${stone.y}`));
  L.undo(game, 'a'); // 回到保留之前
  assert.equal(p.resolved, false);
  assert.ok(p.towers.every(t => t.fresh));
});

test('還原：重骰後不能退回重骰之前；按準備後不能還原', () => {
  const game = newGame();
  const p = game.players.a;
  p.gold = 999;
  L.upgradeQuality(game, 'a');
  L.rerollGems(game, 'a', { rng: seededRng(3) });
  assert.throws(() => L.undo(game, 'a'), /沒有可以還原/);
  placeAll(game, 'a');
  L.keepGem(game, 'a', p.towers[0].id);
  L.setReady(game, 'a');
  assert.throws(() => L.undo(game, 'a'), /準備/);
});

test('地圖選項：預設經典圖、可隨機九宮格，非法值退回預設，環形接力固定經典圖', () => {
  assert.equal(L.createGame().options.map, 0);
  assert.equal(newGame(['a']).board.mapId, 0);
  assert.equal(C.MAP_COUNT, 1, '只留經典圖');
  assert.equal(L.resolveOptions({ map: 1 }).map, 0);
  assert.equal(L.resolveOptions({ map: '2' }).map, 0);
  assert.equal(L.resolveOptions({ map: 'random' }).map, 'random');
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const g = newGame(['a'], { rng: seededRng(seed), options: { map: 'random' } });
    const pts = [g.board.start, ...g.board.checkpoints, g.board.end];
    assert.equal(g.board.mapId, 'random');
    assert.equal(pts.length, 6);
    assert.equal(new Set(pts.map(c => `${Math.floor(c.x / 8.34)},${Math.floor(c.y / 8.34)}`)).size, 6, '六點在六個不同區塊');
    assert.ok(g.players.a.path?.length ?? g.board.width, '開局成功');
    seen.add(pts.map(c => `${c.x},${c.y}`).join('|'));
  }
  assert.ok(seen.size > 5);
  assert.equal(newGame(['a'], { options: { mode: 'relay', map: 'random' } }).board.mapId, 0);
});

test('boardOf：現有模式每人一張地圖，棋盤狀態就是玩家自己的', () => {
  const game = newGame(['a', 'b']);
  for (const id of ['a', 'b']) {
    const p = game.players[id];
    const b = L.boardOf(game, p);
    assert.equal(b, p);
    assert.ok(b.grid instanceof Map);
    assert.ok(Array.isArray(b.path) && b.path.length > 1);
  }
  assert.notEqual(L.boardOf(game, game.players.a).grid, L.boardOf(game, game.players.b).grid);
});

// ── 合作迷宮（coop）────────────────────────────────────────────
const coopOptions = { mode: 'coop', waves: 15, buildSeconds: 0, difficulty: 'easy' };
const newCoop = (ids = ['a', 'b']) => newGame(ids, { options: coopOptions });

test('合作迷宮：人數限制 2～3，其他人數開不了局', () => {
  assert.throws(() => newCoop(['a']), /合作迷宮需要/);
  assert.throws(() => newCoop(['a', 'b', 'c', 'd']), /合作迷宮需要/);
  assert.doesNotThrow(() => newCoop(['a', 'b', 'c']));
});

test('合作迷宮：地圖依人數放大、路徑點增加，空地圖每一段都走得通', () => {
  const g2 = newCoop(['a', 'b']);
  const g3 = newCoop(['a', 'b', 'c']);
  assert.equal(g2.board.width, 35);
  assert.equal(g3.board.width, 40);
  assert.equal(g2.board.checkpoints.length, 4);
  assert.equal(g3.board.checkpoints.length, 4);
  for (const g of [g2, g3]) {
    assert.ok(g.shared.path.length > g.board.width, '共用路線存在');
    const stops = [g.board.start, ...g.board.checkpoints, g.board.end].map(c => `${c.x},${c.y}`);
    assert.equal(new Set(stops).size, stops.length, '路徑點不重疊');
  }
});

test('合作迷宮：全隊共用一份格子與路線，塔仍屬於放下的人', () => {
  const game = newCoop();
  const [ta] = placeAll(game, 'a', 4).slice(0, 1);
  assert.equal(L.boardOf(game, game.players.a), L.boardOf(game, game.players.b));
  assert.equal(L.boardOf(game, game.players.a), game.shared);
  // b 不能放在 a 已經放的格子
  assert.throws(() => L.placeGem(game, 'b', game.players.b.pending[0].slot, ta.x, ta.y), /這格已經有東西/);
  const tb = L.placeGem(game, 'b', game.players.b.pending[0].slot, ta.x + 1, ta.y);
  assert.equal(ta.owner, 'a');
  assert.equal(tb.owner, 'b');
  assert.equal(game.players.a.towers.includes(tb), false);
  assert.equal(game.shared.grid.size, 6); // a 放了 5 顆 + b 放了 1 顆
});

test('合作迷宮：不能還原（會動到別人的格子）', () => {
  const game = newCoop();
  L.placeGem(game, 'a', game.players.a.pending[0].slot, 4, 4);
  assert.throws(() => L.undo(game, 'a'), /不能還原/);
});

test('合作迷宮：一場打完，擊殺金只給塔的擁有者，怪物血量依人數加成', () => {
  const game = newCoop();
  // a 留下 3 級塔，b 讓系統代選：各人的金幣 = 自己塔的擊殺金 + 過關獎勵 + 利息
  setPending(game, 'a', [['B', 3], ['B', 3], ['B', 3], ['B', 3], ['B', 3]]);
  // 路線每局不同：把塔蓋在路線旁邊（沿路每隔幾格找一個空的鄰格）
  const route = game.shared.path;
  for (let i = 6; game.players.a.pending.length; i += 4) {
    const c = route[i];
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      try { L.placeGem(game, 'a', game.players.a.pending[0].slot, c.x + dx, c.y + dy); break; } catch { /* 這格不行換下一格 */ }
    }
  }
  const keep = game.players.a.towers[0];
  L.keepGem(game, 'a', keep.id);
  L.autoResolve(game, 'b', seededRng(3));
  const goldB = game.players.b.gold;
  const goldA = game.players.a.gold;
  L.startWave(game, { rng: seededRng(2) });
  assert.equal(game.shared.sim.coop, true);
  assert.equal(game.shared.sim.def.hp, Math.round(C.waveDef(1, 15, 'easy').groups[0].hp * C.coopHpMult(2)));
  const rng = seededRng(7);
  for (let i = 0; i < 20000; i++) if (L.tick(game, 0.1, rng).done) break;
  const earnedBy = { ...game.shared.sim.earnedBy };
  L.finishWave(game, { now: 0, rng });
  const base = Math.round(C.waveClearBonus(1));
  assert.equal(game.players.b.gold - goldB - base - C.interestOn(goldB), earnedBy.b ?? 0);
  assert.equal(game.players.a.gold - goldA - base - C.interestOn(goldA), earnedBy.a ?? 0);
  assert.ok((earnedBy.a ?? 0) + (earnedBy.b ?? 0) > 0, '這一波有擊殺');
});

test('合作迷宮：結算附上各人的擊殺金累計與塔數；其他模式的結算欄位不變', () => {
  const game = newCoop();
  setPending(game, 'a', [['B', 3], ['B', 3], ['B', 3], ['B', 3], ['B', 3]]);
  placeAll(game, 'a', 4);
  L.keepGem(game, 'a', game.players.a.towers[0].id);
  L.autoResolve(game, 'b', seededRng(3));
  L.startWave(game, { rng: seededRng(2) });
  const rng = seededRng(7);
  for (let i = 0; i < 20000; i++) if (L.tick(game, 0.1, rng).done) break;
  const earnedBy = { ...game.shared.sim.earnedBy };
  L.finishWave(game, { now: 0, rng });
  assert.equal(game.players.a.stats.killGold, earnedBy.a ?? 0);
  assert.equal(game.players.b.stats.killGold, earnedBy.b ?? 0);
  L.finishNow(game);
  const sa = game.result.scores.find(s => s.id === 'a');
  assert.equal(sa.killGold, earnedBy.a ?? 0);
  assert.equal(sa.towers, 1, '只算塔、不含餅乾牆');
  assert.equal(typeof game.result.scores.find(s => s.id === 'b').killGold, 'number');

  const single = newGame(['a']);
  L.finishNow(single);
  assert.equal('killGold' in single.result.scores[0], false);
  assert.equal('towers' in single.result.scores[0], false);
});

test('合作迷宮：研究依塔的擁有者，兩人的塔在同一張圖各用各的研究', () => {
  const { prepareTowers } = require('../../../gem-td/waveSim');
  const towers = [
    { id: 1, x: 3, y: 3, kind: 'B', level: 3, owner: 'a', kills: 0 },
    { id: 2, x: 6, y: 3, kind: 'B', level: 3, owner: 'b', kills: 0 },
  ];
  const research = { a: { damage: 5, speed: 0, range: 0 }, b: { damage: 0, speed: 0, range: 0 } };
  const [ta, tb] = prepareTowers(towers, t => research[t.owner]);
  assert.ok(ta.stats.damage > tb.stats.damage);
  // 傳一份研究的舊用法照舊
  const [ua, ub] = prepareTowers(towers, research.a);
  assert.equal(ua.stats.damage, ub.stats.damage);
});

test('合作迷宮：不寫排行榜，離開的玩家塔留著不收地圖', () => {
  const game = newCoop(['a', 'b', 'c']);
  placeAll(game, 'a', 4);
  const before = game.shared.grid.size;
  const res = L.leavePlayer(game, 'a');
  assert.equal(res.changed, true);
  assert.equal(game.shared.grid.size, before);
  assert.deepEqual(L.buildRecords(game, []), []);
});

test('合作迷宮：視圖給全隊的塔，快照每人收到同一份', () => {
  const game = newCoop();
  placeAll(game, 'a', 4);
  placeAll(game, 'b', 6);
  L.autoResolve(game, 'a', seededRng(1));
  L.autoResolve(game, 'b', seededRng(1));
  const view = L.buildView(game, 'a', 'a');
  assert.equal(view.towers.length, 10);
  L.startWave(game, { rng: seededRng(2) });
  for (let i = 0; i < 30; i++) L.tick(game, 0.1, seededRng(5));
  const frames = L.buildFrames(game);
  assert.equal(frames.a, frames.b);
  assert.ok(frames.a.m.length > 0);
});

test('合作迷宮：同格先到先得，後到者收到 CELL_TAKEN；現有模式仍是 BAD_CELL', () => {
  const game = newCoop();
  const [ta] = placeAll(game, 'a', 4).slice(0, 1);
  const slot = game.players.b.pending[0].slot;
  assert.throws(() => L.placeGem(game, 'b', slot, ta.x, ta.y), e => e instanceof L.GameError && e.code === 'CELL_TAKEN');
  assert.equal(game.players.b.pending.length, 5, '被拒絕時寶石還在手牌');
  // 超出範圍、路徑點仍是 BAD_CELL
  assert.throws(() => L.placeGem(game, 'b', slot, -1, 0), e => e.code === 'BAD_CELL');
  assert.throws(() => L.placeGem(game, 'b', slot, game.board.start.x, game.board.start.y), e => e.code === 'BAD_CELL');

  const single = newGame(['a']);
  const t = L.placeGem(single, 'a', single.players.a.pending[0].slot, 4, 4);
  assert.throws(() => L.placeGem(single, 'a', single.players.a.pending[0].slot, t.x, t.y), e => e.code === 'BAD_CELL');
});

test('合作迷宮：型錄下發 coop 設定（人數限制、尺寸表、路徑點數）', () => {
  const { coop } = C.catalog();
  assert.equal(coop.minPlayers, C.COOP.minPlayers);
  assert.equal(coop.maxPlayers, C.COOP.maxPlayers);
  assert.equal(coop.sizes[2], 35);
  assert.equal(coop.sizes[3], 40);
  assert.equal(coop.checkpoints[2], 4);
  assert.equal(coop.checkpoints[3], 4);
  assert.equal(coop.hpPerPlayer, C.COOP.hpPerPlayer);
  assert.ok(C.catalog().relay, '現有的 relay 型錄沒被動到');
});

test('合作迷宮：只有一張圖，gt:watch 指定別人也看自己的視角', () => {
  const game = newCoop();
  assert.equal(L.resolveWatch(game, 'a', 'b'), 'a');
  assert.equal(L.resolveWatch(game, 'b', 'a'), 'b');
  assert.equal(L.resolveWatch(game, 'spectator', 'b'), 'a');
  assert.equal(L.buildView(game, 'b', 'a').watching, 'b');
});

// ── 合作迷宮：建造者（M3b）─────────────────────────────────────
const stepUntil = (game, fn, seconds = 30) => {
  const out = { errors: [] };
  for (let i = 0; i < seconds * 10 && !fn(); i++) out.errors.push(...L.stepBuilders(game, 0.1).errors);
  return out;
};
const jobOf = (game, id) => game.shared.builders[id].job;
const gridHas = (game, x, y) => game.shared.grid.has(`${x},${y}`);

test('建造者：合作迷宮預設用建造者，直接放置被擋下；instant 可選', () => {
  const game = newCoop();
  assert.equal(game.options.buildMode, 'builder');
  assert.equal(L.isBuilderMode(game), true);
  assert.throws(() => L.requestPlace(game, 'a', 0, 4, 4), e => e.code === 'USE_BUILDER');
  assert.equal(L.resolveOptions({ mode: 'coop', buildMode: 'instant' }).buildMode, 'instant');
  assert.equal(L.resolveOptions({ mode: 'coop', buildMode: 'x' }).buildMode, 'builder');
  assert.equal(L.resolveOptions({ mode: 'single' }).buildMode, undefined, '其他模式沒有這個選項');
  const inst = newGame(['a', 'b'], { options: { ...coopOptions, buildMode: 'instant' } });
  assert.doesNotThrow(() => L.requestPlace(inst, 'a', 0, 4, 4));
  assert.throws(() => L.buildAt(inst, 'a', 1, 6, 4), e => e.code === 'BAD_MODE');
});

test('建造者：走到現場、施工 3 秒後寶石才放下並歸屬於自己', () => {
  const game = newCoop();
  const cell = { x: game.board.start.x + 6, y: game.board.start.y + 2 };
  L.buildAt(game, 'a', 2, cell.x, cell.y);
  assert.equal(gridHas(game, cell.x, cell.y), false, '還沒走到之前不佔格');
  stepUntil(game, () => jobOf(game, 'a')?.started);
  assert.equal(gridHas(game, cell.x, cell.y), true, '施工開始就佔格');
  assert.equal(game.players.a.towers.length, 0, '施工中還不是塔');
  assert.equal(game.players.a.pending.length, 5, '寶石還在手牌');
  stepUntil(game, () => !jobOf(game, 'a'));
  const [tower] = game.players.a.towers;
  assert.equal(tower.owner, 'a');
  assert.deepEqual([tower.x, tower.y, tower.slot], [cell.x, cell.y, 2]);
  assert.equal(game.players.a.pending.length, 4);
  assert.equal(game.shared.grid.get(`${cell.x},${cell.y}`), tower);
});

test('建造者：取消施工 → 格子釋放、寶石留在手牌、可以馬上重新指派', () => {
  const game = newCoop();
  const cell = { x: game.board.start.x + 5, y: game.board.start.y + 2 };
  L.buildAt(game, 'a', 0, cell.x, cell.y);
  stepUntil(game, () => jobOf(game, 'a')?.started);
  assert.equal(gridHas(game, cell.x, cell.y), true);
  L.cancelJobCommand(game, 'a');
  assert.equal(gridHas(game, cell.x, cell.y), false);
  assert.equal(jobOf(game, 'a'), null);
  assert.equal(game.players.a.pending.length, 5);
  assert.equal(game.players.a.gold, C.START_GOLD, '沒有扣任何東西');
  L.buildAt(game, 'a', 0, cell.x + 1, cell.y);
  assert.equal(jobOf(game, 'a').started, false);
  // 施工中再點另一顆另一格 = 排在後面，不打斷目前這件；最多排 5 顆，右鍵（移動）清空
  stepUntil(game, () => jobOf(game, 'a')?.started);
  L.buildAt(game, 'a', 1, cell.x + 2, cell.y);
  assert.equal(gridHas(game, cell.x + 1, cell.y), true);
  assert.equal(game.shared.builders.a.queue.length, 1);
  for (let i = 2; i < 5; i++) L.buildAt(game, 'a', i, cell.x + 2 + i, cell.y);
  assert.throws(() => L.buildAt(game, 'a', 5, cell.x + 9, cell.y));
  L.moveBuilder(game, 'a', 3.5, 3.5);
  assert.equal(game.shared.builders.a.queue.length, 0);
  assert.equal(gridHas(game, cell.x + 1, cell.y), false);
});

test('建造者：別人已經在施工的格子是 CELL_TAKEN；兩人同時趕往同一格，先到的蓋，後到的作廢', () => {
  const game = newCoop();
  const cell = { x: game.board.start.x + 5, y: game.board.start.y + 2 };
  L.buildAt(game, 'a', 0, cell.x, cell.y);
  game.shared.builders.b.x = cell.x + 0.5; // b 站在旁邊，一定先到
  game.shared.builders.b.y = cell.y + 0.5;
  L.buildAt(game, 'b', 0, cell.x, cell.y); // 都還沒開始施工，指派時都合法
  const { errors } = stepUntil(game, () => !jobOf(game, 'a') && !jobOf(game, 'b'));
  assert.equal(errors.length, 1);
  assert.deepEqual([errors[0].playerId, errors[0].code], ['a', 'CELL_TAKEN']);
  assert.equal(game.players.b.towers.length, 1);
  assert.equal(game.players.a.towers.length, 0);
  assert.equal(game.players.a.pending.length, 5, '作廢的寶石還在手牌');
  assert.throws(() => L.buildAt(game, 'a', 0, cell.x, cell.y), e => e.code === 'CELL_TAKEN');
});

test('建造者：拆餅乾牆要時間、免費，任何人都能拆；塔不能被別人拆；施工中取消什麼都沒發生', () => {
  const game = newCoop();
  const [, , , , t] = (() => {
    const placed = placeAll(game, 'a', 4);
    return [0, 0, 0, 0, placed[4]];
  })();
  t.kind = 'stone';
  t.level = 0;
  const gem = game.players.a.towers[0]; // 還是塔，不能拆
  assert.throws(() => L.demolishAt(game, 'b', gem.id), e => e.code === 'BAD_TOWER');
  const gold = game.players.a.gold;
  game.shared.builders.a.x = t.x + 0.5;
  game.shared.builders.a.y = t.y + 0.5;
  L.demolishAt(game, 'a', t.id);
  stepUntil(game, () => jobOf(game, 'a')?.started);
  L.cancelJobCommand(game, 'a');
  assert.equal(gridHas(game, t.x, t.y), true, '取消後牆還在');
  L.demolishAt(game, 'a', t.id);
  stepUntil(game, () => !jobOf(game, 'a'));
  assert.equal(gridHas(game, t.x, t.y), false);
  assert.equal(game.players.a.gold, gold);
  // 隊友 b 也能拆 a 放的餅乾牆
  const t2 = game.players.a.towers[1];
  t2.kind = 'stone';
  game.shared.builders.b.x = t2.x + 0.5;
  game.shared.builders.b.y = t2.y + 0.5;
  L.demolishAt(game, 'b', t2.id);
  stepUntil(game, () => !jobOf(game, 'b'));
  assert.equal(gridHas(game, t2.x, t2.y), false);
  assert.equal(game.players.a.towers.includes(t2), false);
});

test('建造者：時間到開波時，施工中的工作放棄，剩下的寶石由系統代放；視圖帶出建造者與工作', () => {
  const game = newCoop();
  const cell = { x: game.board.start.x + 5, y: game.board.start.y + 2 };
  L.buildAt(game, 'a', 0, cell.x, cell.y);
  stepUntil(game, () => jobOf(game, 'a')?.started);
  const view = L.buildView(game, 'b', 'b');
  assert.equal(view.builders.length, 2);
  assert.equal(view.builders.find(b => b.id === 'a').job.started, true);
  assert.equal(L.builderFrame(game).builders.length, 2);
  L.startWave(game, { rng: seededRng(2) });
  assert.equal(game.phase, 'wave');
  assert.equal(game.players.a.pending.length, 0);
  assert.equal(game.players.a.resolved, true);
  assert.equal(L.buildView(game, 'a', 'a').builders.every(b => b.job === null), true);
});

// ── 合作迷宮：堵死拆牆（M4, breach）────────────────────────────
// 一定被路線穿過、又不含路徑點的列：最上面那個點往下 3 列（點都在 3×3 區塊中心，相鄰兩列相隔 >= 10 格）
const crossRow = game => Math.min(game.board.start.y, ...game.board.checkpoints.map(c => c.y), game.board.end.y) + 3;
// 在第 y 列從頭到尾排滿餅乾牆（整排封死），塔的擁有者是 owner
function wallOff(game, y, owner = 'a') {
  if (y === 'cross') y = crossRow(game);
  for (let x = 0; x < game.board.width; x++) {
    const t = { id: game.nextTowerId++, x, y, kind: 'stone', level: 0, owner, fresh: false, slot: 0, kills: 0, damage: 0 };
    game.players[owner].towers.push(t);
    game.shared.grid.set(`${x},${y}`, t);
  }
  game.shared.route = null;
}
test('breach：整排堵死不會被拒絕，路線穿過成本最低的牆並標出突破點', () => {
  const game = newCoop();
  assert.equal(C.COOP.blockPolicy, 'breach');
  wallOff(game, 'cross');
  // 再放一顆：路線重算，堵死也能放
  assert.doesNotThrow(() => L.placeGem(game, 'b', game.players.b.pending[0].slot, 10, 10));
  const view = L.buildView(game, 'a', 'a');
  assert.ok(view.breaches.length >= 1, '標出突破點');
  assert.ok(view.breaches.every(c => c.y === crossRow(game) && c.tower === false), '突破點在那排餅乾牆上');
  assert.ok(game.shared.path.length > game.board.width, '仍有一條完整路線');
  // 單一模式與 validate 仍不能封路
  assert.equal(L.buildView(newGame(['a']), 'a', 'a').breaches, null);
  C.COOP.blockPolicy = 'validate';
  try {
    const g2 = newCoop();
    wallOff(g2, 'cross');
    assert.throws(() => L.placeGem(g2, 'b', g2.players.b.pending[0].slot, 10, 10), e => e.code === 'PATH_BLOCKED');
    assert.equal(L.buildView(g2, 'a', 'a').breaches, null);
  } finally {
    C.COOP.blockPolicy = 'breach';
  }
});

test('breach：留一個缺口時路線走缺口，不拆牆', () => {
  const game = newCoop();
  wallOff(game, 'cross');
  const gy = crossRow(game);
  game.shared.grid.delete(`20,${gy}`);
  game.players.a.towers = game.players.a.towers.filter(t => !(t.x === 20 && t.y === gy));
  L.placeGem(game, 'b', game.players.b.pending[0].slot, 10, 10);
  assert.deepEqual(L.buildView(game, 'a', 'a').breaches, []);
  assert.ok(game.shared.path.some(c => c.x === 20 && c.y === gy), '路線穿過缺口');
});

test('breach：蟲停在牆前攻擊，牆破了消失、重新尋路，後面的蟲通過', () => {
  const game = newCoop();
  wallOff(game, 'cross');
  for (const id of ['a', 'b']) Object.assign(game.players[id], { pending: [], resolved: true });
  const before = game.players.a.towers.length;
  L.startWave(game, { rng: seededRng(2) });
  const { sim } = game.shared;
  assert.equal(sim.wallIdx.length >= 1, true);
  const rng = seededRng(3);
  let sawWall = false;
  let broke = false;
  for (let i = 0; i < 20000 && !broke; i++) {
    broke = L.tick(game, 0.1, rng).changed; // changed：有牆被打破，伺服器要推送新狀態
    if (sim.walls.size && L.buildFrames(game).a?.w) sawWall = true;
  }
  assert.equal(sawWall, true, '被攻擊的牆有血量快照');
  assert.equal(broke, true, '牆被打破了');
  assert.equal(game.players.a.towers.length, before - 1, '被打破的牆從擁有者身上消失');
  assert.equal(game.shared.grid.size, before - 1);
  assert.deepEqual(sim.wallIdx, [], '缺口打開後路線不再需要拆牆');
  assert.equal(game.lives, L.buildView(game, 'a', 'a').maxLives, '還沒有蟲漏過去');
  // 之後蟲沿新路線走完
  for (let i = 0; i < 20000 && !L.tick(game, 0.1, rng).done; i++);
  assert.ok(game.shared.sim.done);
});

test('breach：牆的血量隨波數成長，塔比餅乾牆硬很多（開波時每面牆的血量）', () => {
  const game = newCoop();
  wallOff(game, 'cross');
  for (const id of ['a', 'b']) Object.assign(game.players[id], { pending: [], resolved: true });
  game.wave = 9; // 第 10 波
  L.startWave(game, { rng: seededRng(2) });
  const { sim } = game.shared;
  const stone = sim.breach.grid.get(`${sim.path[sim.wallIdx[0]].x},${sim.path[sim.wallIdx[0]].y}`);
  assert.equal(sim.breach.hpOf(stone, sim.wave), C.COOP.wallHpBase + C.COOP.wallHpPerWave * 10);
  assert.equal(sim.breach.hpOf({ kind: 'B' }, sim.wave), (C.COOP.wallHpBase + C.COOP.wallHpPerWave * 10) * C.COOP.towerHpMult);
});

// ── 合作迷宮：開局站位與試玩紀錄（M7 前置）──────────────────────
test('合作迷宮：開局建造者不疊在同一點（2 人與 3 人），且都圍著起點', () => {
  for (const ids of [['a', 'b'], ['a', 'b', 'c']]) {
    const game = newCoop(ids);
    const bs = ids.map(id => game.shared.builders[id]);
    for (let i = 0; i < bs.length; i++) {
      assert.ok(Math.hypot(bs[i].x - (game.board.start.x + 0.5), bs[i].y - (game.board.start.y + 0.5)) <= 1.5, '離起點不遠');
      for (let j = i + 1; j < bs.length; j++) assert.ok(Math.hypot(bs[i].x - bs[j].x, bs[i].y - bs[j].y) >= 1.5, `${ids[i]}/${ids[j]} 至少隔 1.5 格`);
    }
  }
});

test('試玩紀錄：搶格、取消、改派、被拒各自計數（含玩家分帳）', () => {
  const game = newCoop();
  const cell = { x: game.board.start.x + 5, y: game.board.start.y + 2 };
  const st = game.shared.stats;
  L.buildAt(game, 'a', 0, cell.x, cell.y);
  stepUntil(game, () => jobOf(game, 'a')?.started);
  assert.throws(() => L.buildAt(game, 'b', 0, cell.x, cell.y), e => e.code === 'CELL_TAKEN');
  assert.equal(st.cellTaken, 1);
  assert.equal(st.byPlayer.b.cellTaken, 1);
  L.cancelJobCommand(game, 'a');
  L.cancelJobCommand(game, 'a'); // 沒有工作時不算
  assert.equal(st.cancels, 1);
  assert.equal(st.byPlayer.a.cancels, 1);
  L.buildAt(game, 'a', 0, cell.x, cell.y);
  L.moveBuilder(game, 'a', 3.5, 3.5); // 放棄工作改走路
  L.buildAt(game, 'a', 1, cell.x + 1, cell.y);
  L.buildAt(game, 'a', 2, cell.x + 2, cell.y);
  assert.equal(st.replaced, 1, '只有移動放掉一件；排隊不算改派');
  assert.equal(st.cancels, 1, '改派不算按取消');
  // 兩人趕往同一格，後到者走到現場才被拒
  L.cancelJobCommand(game, 'a');
  L.buildAt(game, 'a', 0, cell.x + 6, cell.y);
  game.shared.builders.a.x = cell.x + 6.5;
  game.shared.builders.a.y = cell.y + 0.5;
  L.buildAt(game, 'b', 0, cell.x + 6, cell.y);
  game.shared.builders.b.x = cell.x + 6.5;
  game.shared.builders.b.y = cell.y + 1.5;
  const before = st.cellTaken;
  stepUntil(game, () => !jobOf(game, 'a') && !jobOf(game, 'b'));
  assert.equal(st.rejected, 1);
  assert.equal(st.cellTaken, before + 1, '現場被拒也算一次 CELL_TAKEN');
});

test('試玩紀錄：整排堵死算一次，只在「有通路 → 要拆牆」的轉換上加', () => {
  const game = newCoop();
  const st = game.shared.stats;
  assert.equal(st.blocked, 0);
  wallOff(game, 'cross');
  const cell = { x: game.board.start.x + 5, y: 8 }; // 牆那排之外
  L.buildAt(game, 'a', 0, cell.x, cell.y);
  stepUntil(game, () => jobOf(game, 'a')?.started);
  assert.equal(st.blocked, 1);
  L.cancelJobCommand(game, 'a'); // 路線仍堵著，不再計
  L.buildAt(game, 'a', 0, cell.x, cell.y);
  stepUntil(game, () => !jobOf(game, 'a'));
  assert.equal(st.blocked, 1);
  // 拆開一面牆讓路線通了、再蓋回去堵上 → 第二次
  const wall = game.players.a.towers.find(t => t.kind === 'stone' && t.y === crossRow(game));
  game.shared.builders.a.x = wall.x + 0.5;
  game.shared.builders.a.y = wall.y + 0.5;
  L.demolishAt(game, 'a', wall.id);
  stepUntil(game, () => !jobOf(game, 'a'));
  assert.equal(st.demolishes, 1);
  assert.equal(st.blocked, 1, '缺口打開後路線通了');
  L.buildAt(game, 'a', 1, wall.x, wall.y);
  stepUntil(game, () => !jobOf(game, 'a'));
  assert.equal(st.blocked, 2, '重新堵上算第二次');
});

test('試玩紀錄：拆牆分「拆自己的」與「拆別人的」', () => {
  const game = newCoop();
  wallOff(game, 'cross', 'a');
  const [w1, w2] = game.players.a.towers.filter(t => t.y === crossRow(game));
  for (const [who, w] of [['a', w1], ['b', w2]]) {
    game.shared.builders[who].x = w.x + 0.5;
    game.shared.builders[who].y = w.y + 0.5;
    L.demolishAt(game, who, w.id);
    stepUntil(game, () => !jobOf(game, who));
  }
  const by = game.shared.stats.byPlayer;
  assert.deepEqual([by.a.demolishOwn, by.a.demolishOthers], [1, 0]);
  assert.deepEqual([by.b.demolishOwn, by.b.demolishOthers], [0, 1]);
});

test('試玩紀錄：局結束產生一筆 JSON，欄位齊全、不含玩家 id，其他模式沒有', () => {
  const game = newCoop(['a', 'b', 'c']);
  game.shared.stats.cellTaken = 2;
  game.shared.stats.cancels = 3;
  game.shared.stats.demolishes = 4;
  game.shared.stats.byPlayer.a = { demolishOwn: 1, demolishOthers: 2, cellTaken: 2, cancels: 3 };
  game.shared.stats.byPlayer.b = { demolishOwn: 0, demolishOthers: 1, cellTaken: 0, cancels: 0 };
  game.wave = 9;
  L.finishNow(game);
  const rec = JSON.parse(JSON.stringify(game.playtest));
  assert.deepEqual(Object.keys(rec).sort(), [
    'aborted', 'blocked', 'board', 'byPlayer', 'cancels', 'cellTaken', 'completion', 'demolishOthers', 'demolishOwn', 'demolishes',
    'finishedAt', 'livesLeft', 'mode', 'options', 'players', 'rejected', 'replaced', 'schema', 'seconds', 'towersBroken', 'wallsBroken', 'wave', 'win',
  ]);
  assert.equal(rec.mode, 'coop');
  assert.equal(rec.players, 3);
  assert.equal(rec.win, false);
  assert.equal(rec.aborted, true);
  assert.equal(rec.wave, 9);
  assert.equal(rec.completion, 0.6, '9 / 15 波');
  assert.deepEqual(rec.options, { waves: 15, difficulty: 'easy', buildMode: 'builder', blockPolicy: 'breach' });
  assert.deepEqual([rec.cellTaken, rec.cancels, rec.demolishes, rec.demolishOwn, rec.demolishOthers], [2, 3, 4, 1, 3]);
  assert.deepEqual(rec.byPlayer.map(p => p.player), ['P1', 'P2', 'P3']);
  assert.deepEqual(rec.byPlayer[0], { player: 'P1', left: false, cellTaken: 2, cancels: 3, demolishOwn: 1, demolishOthers: 2 });
  assert.equal(rec.byPlayer[2].cancels, 0, '沒操作的玩家補 0');
  assert.deepEqual(rec.board, { name: game.board.mapName, width: 40, height: 40 });
  assert.equal(JSON.stringify(rec).includes('"a"'), false, '不含玩家 id');
  assert.equal(game.records.length, 0, '不進排行榜');
  const single = newGame(['a']);
  L.finishNow(single);
  assert.equal(single.playtest, null);
});

test('試玩紀錄：到達波數的完成率；通關是 1，無盡沒有完成率', () => {
  const game = newCoop();
  game.wave = 15;
  L.finishNow(game);
  assert.equal(game.playtest.completion, 1);
  const endless = newGame(['a', 'b'], { options: { ...coopOptions, waves: C.ENDLESS } });
  endless.wave = 40;
  L.finishNow(endless);
  assert.equal(endless.playtest.completion, null);
  assert.equal(endless.playtest.options.waves, null);
});

test('試玩紀錄：蟲打破牆與塔分開計數', () => {
  const game = newCoop();
  wallOff(game, 'cross');
  for (const id of ['a', 'b']) Object.assign(game.players[id], { pending: [], resolved: true });
  L.startWave(game, { rng: seededRng(2) });
  const rng = seededRng(3);
  for (let i = 0; i < 20000 && !L.tick(game, 0.1, rng).changed; i++);
  assert.equal(game.shared.stats.wallsBroken, 1);
  assert.equal(game.shared.stats.towersBroken, 0);
});

test('試玩紀錄：instant 模式直接拆自己的餅乾牆也記進拆牆統計', () => {
  const game = newGame(['a', 'b'], { options: { ...coopOptions, buildMode: 'instant' } });
  wallOff(game, 'cross', 'a');
  const wall = game.players.a.towers.find(t => t.y === crossRow(game));
  L.removeStone(game, 'a', wall.id);
  const st = game.shared.stats;
  assert.deepEqual([st.demolishes, st.byPlayer.a.demolishOwn, st.byPlayer.a.demolishOthers], [1, 1, 0]);
});

test('合作迷宮：怪物護甲依人數加成（每多一人 +armorPerPlayer），其他模式不加', () => {
  assert.equal(C.coopArmorAdd(1), 0);
  assert.equal(C.coopArmorAdd(2), C.COOP.armorPerPlayer);
  assert.equal(C.coopArmorAdd(3), C.COOP.armorPerPlayer * 2);
  const base = C.waveDef(6, 15, 'easy').groups.find(g => g.type === 'armored').armor;
  for (const n of [2, 3]) {
    const game = newCoop(n === 2 ? ['a', 'b'] : ['a', 'b', 'c']);
    for (const id of game.playerIds) Object.assign(game.players[id], { pending: [], resolved: true });
    game.wave = 5;
    L.startWave(game, { rng: seededRng(2) });
    const armored = game.shared.sim.def.groups.find(g => g.type === 'armored');
    assert.equal(armored.armor, base + C.coopArmorAdd(n), `${n} 人`);
  }
  const single = newGame(['a']);
  single.wave = 5;
  for (const id of single.playerIds) Object.assign(single.players[id], { pending: [], resolved: true });
  L.startWave(single, { rng: seededRng(2) });
  assert.equal(single.players.a.sim.def.groups.find(g => g.type === 'armored').armor, base);
});

test('合作迷宮：6 個點從 3×3 九宮格隨機挑、隨機排成 1~6，每區只用一次且落在區塊中心', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const g = newGame(['a', 'b'], { rng: seededRng(seed), options: coopOptions });
    const pts = [g.board.start, ...g.board.checkpoints, g.board.end];
    assert.equal(pts.length, 6);
    const zones = pts.map(c => `${Math.floor(c.x / (g.board.width / 3))},${Math.floor(c.y / (g.board.height / 3))}`);
    assert.equal(new Set(zones).size, 6, '六個點在六個不同的區塊');
    assert.ok(g.shared.path.length > g.board.width, '空地圖路線存在');
    seen.add(pts.map(c => `${c.x},${c.y}`).join('|'));
  }
  assert.ok(seen.size > 5, '不同種子會得到不同路線');
});
