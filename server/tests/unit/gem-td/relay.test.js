// ================================================================
//  環形接力 — 單元測試
//  執行（在 server/ 下）：node --test tests/unit/gem-td/relay.test.js
// ================================================================
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../../gem-td/gameLogic');
const C = require('../../../gem-td/config');
const R = require('../../../gem-td/relay');
const { ringLayout } = require('../../../gem-td/ringLayout');
const { prepareTowers, stepWave } = require('../../../gem-td/waveSim');

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

function relayGame(ids = ['a'], zones = 3, extra = {}) {
  const game = L.createGame();
  game.options = L.resolveOptions({ mode: 'relay', zones, waves: 15, buildSeconds: 0, ...extra });
  L.startGame(game, ids, { now: 1000, rng: seededRng() });
  return game;
}

// 清空所有區的塔，讓蟲一路走到底
function emptyAll(game) {
  for (const id of game.playerIds) {
    const p = game.players[id];
    p.towers = [];
    p.grid.clear();
    p.pending = []; // 免得開波時自動擺出塔
    p.resolved = true;
  }
}

function putTower(game, id, x, y, kind = 'D', level = 6) {
  const p = game.players[id];
  const ref = { id: game.nextTowerId++, x, y, kind, level, kills: 0, damage: 0, owner: id, fresh: false };
  p.towers.push(ref);
  p.grid.set(`${x},${y}`, ref);
  return ref;
}

function runWave(game, rng = seededRng(7)) {
  L.startWave(game, { rng });
  for (let i = 0; i < 30000; i++) if (L.tick(game, 0.1, rng).done) break;
  return L.finishWave(game, { now: 0, rng });
}

test('設定：環形接力強制共用血量；區域數限制在 1～6', () => {
  const o = L.resolveOptions({ mode: 'relay', livesMode: 'solo', zones: 4 });
  assert.equal(o.livesMode, 'team');
  assert.equal(o.zones, 4);
  assert.equal(L.resolveOptions({ mode: 'relay', zones: 9 }).zones, C.DEFAULT_OPTIONS.zones);
  assert.equal(L.resolveOptions({ mode: 'nope' }).mode, 'single');
  assert.equal(L.resolveOptions({ livesMode: 'solo' }).livesMode, 'solo');
});

test('區域數 1：沒有環與輸送帶，蟲在這張地圖走完直接扣血，同單人模式', () => {
  const game = relayGame(['a'], 1);
  assert.equal(game.ring, null);
  assert.equal(game.playerIds.length, 1);
  assert.equal(L.buildView(game, 'a').relay, null);
  emptyAll(game);
  const lives = game.lives;
  runWave(game);
  const def = C.waveDef(1, 15, 'easy');
  const expected = def.groups.reduce((n, g) => n + g.count * (g.leak ?? C.MONSTERS[g.type].leak), 0);
  assert.equal(lives - game.lives, expected);
});

test('單一真人：區域數由設定決定，其餘是假人；多位真人：區域數 = 玩家數', () => {
  const solo = relayGame(['a'], 4);
  assert.deepEqual(solo.playerIds, ['a', 'bot-1', 'bot-2', 'bot-3']);
  assert.equal(solo.players['bot-1'].bot, true);
  assert.equal(solo.players.a.bot, false);
  assert.equal(solo.lives, C.START_LIVES * 4);
  const multi = relayGame(['a', 'b'], 5);
  assert.deepEqual(multi.playerIds, ['a', 'b']);
  assert.equal(multi.ring.layout.n, 2);
});

test('交棒：每隻蟲連走 3 區才離場；傳給下一區不扣血，從第 3 區出口離場才扣；整波扣血 = 各蟲 leak 的總和', () => {
  const game = relayGame(['a'], 2);
  emptyAll(game);
  const maxLives = game.lives;
  L.startWave(game, { rng: seededRng() });
  const hub = game.ring.hub;
  for (let i = 0; i < 30000; i++) {
    const { done } = L.tick(game, 0.1, seededRng());
    assert.equal(hub.transit.length, 0, '傳送沒有移動時間，不會有蟲停在半路');
    if (done) break;
  }
  const def = C.waveDef(1, 15, 'easy');
  const perZone = def.groups.reduce((n, g) => n + g.count * (g.leak ?? C.MONSTERS[g.type].leak), 0);
  assert.equal(maxLives - game.lives, perZone * 2, '兩組蟲都走完 3 區後離場');
  for (const id of game.playerIds) {
    const s = R.liveStats(game.players[id]);
    assert.equal(s.handoff, def.count * 2, '自己的蟲傳出第 1 次，別區傳來的蟲再傳出第 2 次');
    assert.equal(s.leaks, def.count, '繞回出生區才離場（3 區、2 個人）');
    assert.equal(s.kills, 0);
  }
});

test('傳送：漏出去的蟲立刻出現在下一區入口（最後一區接回第一區）', () => {
  const ring = { layout: ringLayout(3), events: [] };
  const hub = R.createHub(ring);
  const board = { start: { x: 2, y: 2 } };
  const sims = [0, 1, 2].map(() => ({ board, monsters: [], spawned: 0, def: { count: 0 } }));
  const a = { id: 1, speed: 5, hop: 1 };
  const b = { id: 2, speed: 2, hop: 1 };
  hub.transit.push({ m: a, from: 0, d: 0 }, { m: b, from: 2, d: 0 });
  R.stepTransit(hub, sims, 0.05);
  assert.ok(sims[1].monsters.includes(a));
  assert.ok(sims[0].monsters.includes(b), '區 3 的出口接回區 1');
  assert.deepEqual([a.pos, a.x, a.y], [0, 2, 2]);
  assert.equal(hub.transit.length, 0);
});

test('首領：每區各出一隻、血量 × 0.8，各自繞完整圈後才離場扣血', () => {
  const game = relayGame(['a'], 3);
  game.options.waves = 1; // 第 1 波就是最後一波首領
  emptyAll(game);
  L.startWave(game, { rng: seededRng() });
  const base = C.waveDef(1, 1, 'easy').groups[0];
  const sims = game.playerIds.map(id => game.players[id].sim);
  assert.deepEqual(sims.map(s => s.def.count), [1, 1, 1]);
  assert.equal(sims[1].def.groups[0].hp, Math.round(base.hp * C.RELAY_BOSS_HP_MULT));
  const lives = game.lives;
  for (let i = 0; i < 30000; i++) if (L.tick(game, 0.1, seededRng()).done) break;
  assert.equal(lives - game.lives, base.leak * 3, '三隻首領各扣一次');
  const stats = game.playerIds.map(id => R.liveStats(game.players[id]));
  assert.deepEqual(stats.map(s => s.handoff), [2, 2, 2], '每隻首領前兩區傳出去');
  assert.deepEqual(stats.map(s => s.leaks), [1, 1, 1], '第三區離場');
});

test('一般蟲：血量依人數加成、走三區、護甲調高', () => {
  const game = relayGame(['a'], 3);
  L.startWave(game, { rng: seededRng() });
  const base = C.waveDef(1, 15, 'easy');
  const sim = game.players.a.sim;
  assert.equal(sim.def.groups[0].hp, Math.round(base.groups[0].hp * C.relayGroupHpMult(3)));
  assert.equal(sim.def.groups[0].armor, Math.round(base.groups[0].armor * C.RELAY_ARMOR_MULT));
  assert.ok(C.relayGroupHpMult(4) > C.relayGroupHpMult(2) && C.relayGroupHpMult(1) === C.RELAY_PASSES);
  stepWave(sim, 0.7);
  assert.equal(sim.monsters[0].hops, C.RELAY_PASSES);
  const view = L.buildView(game, 'a').nextWave;
  assert.equal(view.groups[0].hp, sim.def.groups[0].hp, '預告與實際出的血量一致');
});

test('一般蟲：區數超過 3 時繞完整圈，血量跟著走過的區數放大', () => {
  assert.equal(C.relayPasses(2), C.RELAY_PASSES);
  assert.equal(C.relayPasses(4), 4);
  assert.equal(C.relayPasses(6), 6);
  assert.ok(Math.abs(C.relayGroupHpMult(4) - 4 * (1 + 3 * C.RELAY_PLAYER_HP_STEP)) < 1e-9);
  const game = relayGame(['a'], 4);
  L.startWave(game, { rng: seededRng() });
  const sim = game.players.a.sim;
  stepWave(sim, 0.7);
  assert.equal(sim.monsters[0].hops, 4);
});

test('分裂小蟲繼承出生區、已走區數與「已傳給後援」標記，編號整圈不重複', () => {
  const game = relayGame(['a'], 3);
  L.startWave(game, { rng: seededRng() });
  const sim = game.players['bot-1'].sim; // 區 3
  stepWave(sim, 0.01);
  const m = sim.monsters[0];
  Object.assign(m, { trait: 'split', hop: 1, hp: 1, born: 1 });
  const ref = { id: 999, x: Math.round(m.x) + 1, y: Math.round(m.y), kind: 'D', level: 6, kills: 0, damage: 0 };
  sim.towers = prepareTowers([ref], { damage: 0, speed: 0, range: 0 });
  sim.towers[0].stats.range = 20;
  stepWave(sim, 0.01);
  const kids = sim.monsters.filter(k => k.id !== m.id);
  assert.equal(kids.length, C.SPLIT_COUNT);
  for (const k of kids) {
    assert.equal(k.hop, 1);
    assert.equal(k.hops, m.hops);
    assert.equal(k.born, 1);
  }
  assert.equal(sim.rs.relief, 1, '在後援位置打死的算補救');
  assert.equal(new Set([...kids, m].map(k => k.id)).size, kids.length + 1);
});

test('擊殺金歸擊殺的那一區；過關獎勵每區相同', () => {
  const game = relayGame(['a'], 2);
  emptyAll(game);
  putTower(game, 'bot-1', 12, 12); // 只有區 2 有強塔：區 1 的蟲也會在區 2 被補救
  runWave(game);
  assert.equal(game.wave, 1);
  const bonus = C.waveClearBonus(1);
  assert.equal(game.players.a.gold, bonus, '沒有塔的區只有過關獎勵');
  assert.ok(game.players['bot-1'].gold > bonus, '有塔那區另外賺到擊殺金');
  assert.ok(game.players['bot-1'].rstats.kills > 0);
});

test('離開：環不收，他的區停止建造；真人全走光回報剩餘 0', () => {
  const game = relayGame(['a', 'b', 'c'], 3);
  assert.equal(L.leavePlayer(game, 'b').remaining, 2);
  assert.equal(game.players.b.left, true);
  assert.equal(game.playerIds.length, 3, '環不收');
  assert.equal(L.leavePlayer(game, 'b').changed, false);
  runWave(game);
  if (game.phase === 'build') assert.deepEqual(game.players.b.pending, [], '離開的區不再發甜點');
  assert.equal(L.leavePlayer(game, 'a').remaining, 1);
  assert.equal(L.leavePlayer(game, 'c').remaining, 0);
});

test('暫停：多位真人不行，只剩一位真人可以', () => {
  const multi = relayGame(['a', 'b'], 2);
  assert.throws(() => L.setPaused(multi, true, { now: 1 }), /暫停/);
  L.leavePlayer(multi, 'b');
  L.setPaused(multi, true, { now: 1 });
  assert.equal(multi.paused, true);
  const solo = relayGame(['a'], 3);
  L.setPaused(solo, true, { now: 1 });
  assert.equal(solo.paused, true);
});

test('單一真人可操作任何一區；多位真人只能操作自己的區', () => {
  const solo = relayGame(['a'], 3);
  assert.equal(L.actorOf(solo, 'a', 'bot-2'), 'bot-2');
  assert.equal(L.actorOf(solo, 'a', undefined), 'a');
  const view = L.buildView(solo, 'a', 'bot-1');
  assert.equal(view.me.zoneId, 'bot-1');
  assert.equal(view.relay.operateAny, true);
  const multi = relayGame(['a', 'b'], 2);
  assert.equal(L.actorOf(multi, 'a', 'b'), 'a');
  assert.equal(L.buildView(multi, 'a', 'b').relay.operateAny, false);
});

test('傷害測試：一隻巨獸繞完整圈，各區傷害加總，漏怪不扣血', () => {
  const game = relayGame(['a'], 3);
  game.wave = 15;
  game.testAt = 15;
  emptyAll(game);
  putTower(game, 'bot-1', 12, 12); // 只有區 2 有塔
  const lives = game.lives;
  L.startWave(game, { rng: seededRng() });
  for (let i = 0; i < 30000; i++) if (L.tick(game, 0.1, seededRng()).done) break;
  assert.equal(game.lives, lives, '巨獸走到終點不扣血');
  L.finishWave(game, { now: 0, rng: seededRng() });
  const tests = game.playerIds.map(id => game.players[id].stats.tests.at(-1));
  const base = C.testWaveDef(15, 'easy', 15).hp;
  // 巨獸血量 = 單人 × 區域數 × 首領倍數 × 傷害測試加碼 × 人數加成，公式集中在 C.relayTestHpMult
  assert.ok(tests.every(t => t.maxHp === Math.round(base * C.relayTestHpMult(3))), '隊伍的巨獸血量');
  assert.ok(tests[1].damage > 0 && tests[0].damage === 0, '只有有塔的那區有傷害');
  const log = L.buildView(game, 'a').testLog;
  assert.equal(log.rounds[0].team.damage, tests.reduce((n, t) => n + t.damage, 0));
});

test('首領波按鈕：不推進波數、不發獎勵，這局不列入排行榜', () => {
  const game = relayGame(['a'], 2);
  L.startBossWave(game);
  assert.equal(game.devBoss, true);
  const wave = game.wave;
  runWave(game);
  assert.equal(game.wave, wave);
  assert.equal(game.devBoss, false);
  assert.equal(game.tainted, true);
  assert.equal(game.phase, 'build');
  game.finishedAt = Date.now();
  assert.deepEqual(L.buildRecords(game, []), []);
  assert.throws(() => L.startBossWave(relayGame(['a'], 1)), /環形接力/);
});

test('排行榜紀錄：環形接力每位真人一筆，帶區域數；提早結束不列入', () => {
  const early = relayGame(['a', 'b'], 2);
  L.finishNow(early);
  assert.deepEqual(early.records, []);
  const game = relayGame(['a', 'b'], 2);
  game.finishedAt = Date.now();
  game.wave = 3;
  const records = L.buildRecords(game, []);
  assert.equal(records.length, 2);
  assert.equal(records[0].mode, 'relay');
  assert.equal(records[0].zones, 2);
  assert.equal(records[0].reachedWave, 4);
});

test('事件紀錄與分區統計：數字與實際傳遞一致', () => {
  const game = relayGame(['a'], 3);
  emptyAll(game);
  runWave(game);
  const events = game.ring.events.map(e => e.text);
  const def = C.waveDef(1, 15, 'easy');
  assert.ok(events[0].includes(`傳 ${def.count * 2} 隻給`), events[0]);
  const rows = L.buildView(game, 'a').relay.zones.map(z => z.stats);
  assert.ok(rows.every(s => s.handoff === def.count * 2 && s.leaks === def.count));
});

test('快照：整圈一份，每隻蟲帶世界座標、出生區、是否已傳給後援與所在區', () => {
  const game = relayGame(['a'], 3);
  emptyAll(game);
  L.startWave(game, { rng: seededRng() });
  let frame = null;
  let relieved = null;
  for (let i = 0; i < 3000 && !relieved; i++) {
    L.tick(game, 0.1, seededRng());
    frame = L.buildFrames(game).ring;
    relieved = frame.m.find(m => m[7] === 1);
  }
  assert.ok(frame.ring);
  assert.ok(frame.m.every(m => m.length === 9 && m[8] >= 0), '沒有輸送帶，每隻蟲都在某一區裡');
  assert.ok(relieved, '有蟲已經傳給後援');
});
