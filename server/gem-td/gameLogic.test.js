// ================================================================
//  寶石塔防 — 單元測試
//  執行：node --test gem-td/gameLogic.test.js
// ================================================================
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./gameLogic');
const C = require('./config');
const { prepareTowers, stepWave } = require('./waveSim');
const { findFullPath } = require('./pathing');

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
  setPending(cap, 'a', [['Q', 6], ['Q', 6], ['Q', 1], ['G', 1], ['O', 3]]);
  const p6 = placeAll(cap, 'a');
  assert.throws(() => L.mergeGem(cap, 'a', p6[0].id), { code: 'CANNOT_MERGE' });
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

  game.players.a.gold = C.SWAP_COST + C.REMOVE_STONE_COST;
  L.swapWithStone(game, 'a', placed[4].id, stone.id);
  assert.deepEqual([placed[4].x, placed[4].y], [sx, sy]);
  assert.equal(game.players.a.grid.get(`${sx},${sy}`), placed[4]);

  L.removeStone(game, 'a', stone.id);
  assert.equal(game.players.a.gold, 0);
  assert.equal(game.players.a.towers.includes(stone), false);
  assert.throws(() => L.removeStone(game, 'a', placed[4].id), { code: 'BAD_TOWER' });
  const another = game.players.a.towers.find(t => t.kind === 'stone');
  assert.throws(() => L.removeStone(game, 'a', another.id), { code: 'NO_GOLD' });
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

  const win = newGame(['a'], { options: { waves: 15 } });
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
  const game = newGame(['a', 'b', 'c'], { options: { waves: 15, livesMode: 'solo' } });
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

test('回血：沒中毒時回血，中毒時停止', () => {
  const sim = traitSim({ type: 'normal', count: 1, hp: 1000, armor: 0, speed: 0.01, trait: 'regen' });
  stepWave(sim, 0.1);
  const [m] = sim.monsters;
  m.hp = 500;
  stepWave(sim, 1);
  assert.ok(m.hp > 500);
  const healed = m.hp;
  m.poisonUntil = sim.time + 10;
  stepWave(sim, 1);
  assert.equal(m.hp, healed);
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
