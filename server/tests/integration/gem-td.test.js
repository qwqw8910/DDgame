// ================================================================
//  寶石塔防 — 整合測試（真 socket.io + 記憶體 Mock DB）
//  執行（在 server/ 下）：node --test --test-force-exit tests/integration/gem-td.test.js
// ================================================================
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const { registerNamespace } = require('../../gem-td/index');
const { MAX_LEVEL } = require('../../gem-td/config');
const L = require('../../gem-td/gameLogic');
const { unpackView } = require('../../gem-td/wire');

// ── Mock DB（rooms / players 兩張表）────────────────────────────
function makeMockDb() {
  const rooms = {};
  const players = {};
  return {
    from(table) {
      if (table === 'rooms') {
        return {
          select: () => ({ eq: (_c, id) => ({ maybeSingle: async () => ({ data: rooms[id] ?? null }) }) }),
          insert: (data) => { rooms[data.id] = data; return Promise.resolve({ error: null }); },
          update: (u) => ({ eq: (_c, id) => { if (rooms[id]) Object.assign(rooms[id], u); return Promise.resolve({}); } }),
        };
      }
      return {
        select: () => ({
          eq: (_c, roomId) => ({
            order: () => Promise.resolve({
              data: Object.values(players).filter(p => p.room_id === roomId), error: null,
            }),
          }),
        }),
        upsert: (data) => {
          players[data.id] = { ...(players[data.id] || {}), ...data };
          return { select: () => ({ single: async () => ({ data: players[data.id], error: null }) }) };
        },
        update: (u) => ({ eq: (_c, id) => { if (players[id]) Object.assign(players[id], u); return Promise.resolve({}); } }),
        delete: () => { const f = {}; const q = { eq: (c, v) => { f[c] = v; return q; }, then: (res, rej) => { const p = players[f.id]; if (p && (f.room_id === undefined || p.room_id === f.room_id)) delete players[f.id]; return Promise.resolve({ error: null }).then(res, rej); } }; return q; },
      };
    },
  };
}

let httpServer, io, port, games;
const clients = [];

before(async () => {
  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  ({ games } = registerNamespace(io, makeMockDb()));
  await new Promise(r => httpServer.listen(0, r));
  port = httpServer.address().port;
});

after(() => {
  clients.forEach(c => c.close());
  io.close();
  httpServer.close();
});

async function connect(name) {
  const socket = ioc(`http://localhost:${port}/gem-td`, {
    transports: ['websocket'], reconnection: false, forceNew: true, auth: { gtWire: 1 },
  });
  clients.push(socket);
  const p = { name, id: `id-${name}`, socket, view: null, ack: null, catalog: null, frames: [], errors: [] };
  socket.on('gt:state', v => { p.view = unpackView(v); }); // 跟前端一樣先還原傳輸格式
  socket.on('gt:catalog', c => { p.catalog = c; });
  socket.on('gt:frame', f => p.frames.push(f));
  socket.on('gt:builders', f => { p.builders = f; });
  socket.on('gt:error', e => p.errors.push(e));
  socket.on('room:join-ack', a => { p.ack = a; });
  await new Promise(r => socket.on('connect', r));
  return p;
}

const until = async (fn, label = 'condition', ms = 5000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error(`timeout waiting for ${label}`);
};

async function makeRoom(roomId, names, maxPlayers = 4) {
  const ps = await Promise.all(names.map(connect));
  const [host, ...rest] = ps;
  host.socket.emit('room:create', { roomId, nickname: host.name, playerId: host.id, maxPlayers, appId: 'gem-td' });
  await until(() => host.ack, 'host ack');
  for (const p of rest) {
    p.socket.emit('room:join', { roomId, nickname: p.name, playerId: p.id });
    await until(() => p.ack, `${p.name} ack`);
  }
  await until(() => ps.every(p => p.view?.phase === 'waiting'), 'waiting views');
  return ps;
}

const emit = (roomId, p, ev, data = {}) => p.socket.emit(ev, { roomId, ...data });

// 把這回合 5 顆放完，並保留第一顆
async function placeAndKeep(roomId, p, row) {
  const slots = p.view.me.pending.map(g => g.slot);
  slots.forEach((slot, i) => emit(roomId, p, 'gt:place', { slot, x: 3 + i * 2, y: row }));
  await until(() => p.view.me.choosing, `${p.name} placed`);
  emit(roomId, p, 'gt:keep', { towerId: p.view.me.fresh[0].id });
  await until(() => p.view.me.resolved, `${p.name} resolved`);
}

// 把這一波縮短到幾秒內打完
function shortenWave(roomId) {
  for (const p of Object.values(games[roomId].players)) {
    if (!p.sim) continue;
    p.sim.def.count = 2;
    p.sim.path = p.sim.path.slice(0, 6);
  }
}

test('完整回合：放置 → 保留 → 準備 → 出怪收幀 → 下一回合 → 重開', async () => {
  const roomId = 'GT0001';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);
  assert.ok(a.catalog.gems.D.levels.length === MAX_LEVEL, '加入時收到型錄（每種甜點都有完整等級）');

  emit(roomId, b, 'gt:set-options', { options: { waves: 15 } });
  await until(() => b.errors.length === 1, 'non-host options rejected');
  assert.equal(b.errors[0].code, 'FORBIDDEN');
  emit(roomId, a, 'gt:set-options', { options: { waves: 15, buildSeconds: 0 } });
  await until(() => a.view.options.waves === 15, 'options applied');

  emit(roomId, a, 'gt:start');
  await until(() => [a, b].every(p => p.view.phase === 'build'), 'build phase');
  assert.equal(a.view.me.pending.length, 5);
  assert.equal(a.view.buildEndsAt, null, '不限時');
  assert.ok(a.view.path.length > 20);

  await placeAndKeep(roomId, a, 3);
  emit(roomId, a, 'gt:ready');
  await until(() => a.view.players[a.id].ready, 'a ready');
  assert.equal(a.view.phase, 'build', '還在等 b');

  await placeAndKeep(roomId, b, 5);
  assert.equal(b.view.towers.filter(t => t.kind !== 'stone').length, 1, '只看到自己地圖上的塔');
  assert.equal(b.view.watching, b.id);
  emit(roomId, b, 'gt:ready');

  await until(() => a.view.phase === 'wave', 'wave phase');
  shortenWave(roomId);
  await until(() => a.frames.length > 0 && b.frames.length > 0, 'frames');
  assert.equal(a.frames[0].wave, 1);
  assert.equal(a.frames[0].owner, a.id);
  assert.equal(b.frames[0].owner, b.id);

  await until(() => a.view.phase === 'build' && a.view.wave === 1, 'next round');
  assert.equal(a.view.me.pending.length, 5);
  assert.ok(a.view.me.gold > 0);

  emit(roomId, a, 'gt:restart');
  await until(() => [a, b].every(p => p.view.phase === 'waiting'), 'back to lobby');
  assert.equal(a.view.options.waves, 15, '保留設定');
  assert.equal(a.view.towers.length, 0);
});

test('斷線的人不擋開波，時間到由伺服器代選；重連後拿回自己的視圖', async () => {
  const roomId = 'GT0002';
  const [a, b] = await makeRoom(roomId, ['c', 'd']);
  emit(roomId, a, 'gt:set-options', { options: { buildSeconds: 0 } });
  await until(() => a.view.options.buildSeconds === 0, 'no limit');
  emit(roomId, a, 'gt:start');
  await until(() => b.view?.phase === 'build', 'build');

  await placeAndKeep(roomId, a, 3);
  emit(roomId, a, 'gt:ready');
  await until(() => a.view.players[a.id].ready, 'a ready');

  b.socket.close();
  await until(() => a.view.phase === 'wave', 'wave starts without b');
  shortenWave(roomId);
  const kept = games[roomId].players[b.id].towers.filter(t => t.kind !== 'stone');
  assert.equal(kept.length, 1, 'b 自動保留一顆');

  const b2 = await connect('d');
  b2.socket.emit('room:join', { roomId, nickname: 'd', playerId: b.id });
  await until(() => b2.view?.me, 'b view restored');
  assert.equal(b2.ack.type, 'reconnect');
  assert.ok(b2.catalog);
});

test('開局後新加入者變觀戰，不能操作', async () => {
  const roomId = 'GT0003';
  const [a] = await makeRoom(roomId, ['e']);
  emit(roomId, a, 'gt:start');
  await until(() => a.view.phase === 'build', 'build');

  const s = await connect('s');
  s.socket.emit('room:join', { roomId, nickname: 's', playerId: s.id });
  await until(() => s.ack?.type === 'spectator', 'spectator');
  emit(roomId, s, 'gt:sync');
  await until(() => s.view?.phase === 'build' && s.catalog, 'spectator view');
  assert.equal(s.view.me, null);

  emit(roomId, s, 'gt:place', { slot: 0, x: 4, y: 4 });
  await new Promise(r => setTimeout(r, 100));
  assert.equal(a.view.towers.length, 0);
});

test('切換視角：看別人的地圖，波次快照跟著換，手上的資料還是自己的', async () => {
  const roomId = 'GT0005';
  const [a, b] = await makeRoom(roomId, ['h', 'i']);
  emit(roomId, a, 'gt:set-options', { options: { buildSeconds: 0 } });
  await until(() => a.view.options.buildSeconds === 0, 'no limit');
  emit(roomId, a, 'gt:start');
  await until(() => [a, b].every(p => p.view?.phase === 'build'), 'build');
  await placeAndKeep(roomId, b, 5);

  emit(roomId, a, 'gt:watch', { targetId: b.id });
  await until(() => a.view.watching === b.id, 'a watches b');
  assert.equal(a.view.towers.length, 5);
  assert.equal(a.view.me.towers.length, 0);
  assert.equal(a.view.me.pending.length, 5);

  emit(roomId, b, 'gt:ready');
  await placeAndKeep(roomId, a, 3);
  emit(roomId, a, 'gt:ready');
  await until(() => a.view.phase === 'wave', 'wave');
  assert.equal(a.view.watching, b.id, '波次開始後維持原本的視角');
  a.frames.length = 0;
  await until(() => a.frames.length > 0, 'frames');
  assert.equal(a.frames[0].owner, b.id);
  assert.equal(b.frames.at(-1).owner, b.id);
  shortenWave(roomId);
  await until(() => a.view.phase === 'build', 'next round');
});

test('獨立血量：血量歸零的人出局，只剩一人時結算', async () => {
  const roomId = 'GT0006';
  const [a, b] = await makeRoom(roomId, ['j', 'k']);
  emit(roomId, a, 'gt:set-options', { options: { buildSeconds: 0, livesMode: 'solo' } });
  await until(() => a.view.options.livesMode === 'solo', 'solo mode');
  emit(roomId, a, 'gt:start');
  await until(() => [a, b].every(p => p.view?.phase === 'build'), 'build');
  await placeAndKeep(roomId, a, 3);
  await placeAndKeep(roomId, b, 5);
  emit(roomId, a, 'gt:ready');
  emit(roomId, b, 'gt:ready');
  await until(() => a.view.phase === 'wave', 'wave');

  games[roomId].players[b.id].lives = 1;
  games[roomId].players[b.id].towers.forEach((t) => { t.kind = 'stone'; });
  games[roomId].players[b.id].sim.towers = [];
  shortenWave(roomId);
  await until(() => a.view.phase === 'finished', 'finished');
  assert.deepEqual(a.view.result.winnerIds, [a.id]);
  assert.equal(b.view.result.scores.find(s => s.id === b.id).out, true);
});

test('唯一的玩家離開 → 本局中止回大廳，計時器清掉', async () => {
  const roomId = 'GT0004';
  const [a, b] = await makeRoom(roomId, ['f', 'g']);
  emit(roomId, a, 'gt:start');
  await until(() => a.view.phase === 'build', 'build');
  b.socket.emit('room:leave');
  await until(() => a.view.playerIds.length === 1, 'b left');
  a.socket.emit('room:leave');
  await until(() => games[roomId].phase === 'waiting', 'reset');
  assert.equal(games[roomId]._timer, null);
});

test('環形接力：單一真人帶假人，切到別區操作、整圈一份快照、首領波按鈕', async () => {
  const roomId = 'GT0007';
  const [a] = await makeRoom(roomId, ['r']);
  emit(roomId, a, 'gt:set-options', { options: { mode: 'relay', zones: 3, buildSeconds: 0, waves: 15, livesMode: 'solo' } });
  await until(() => a.view.options.mode === 'relay', 'relay options');
  assert.equal(a.view.options.livesMode, 'team', '環形接力強制共用血量');
  emit(roomId, a, 'gt:start');
  await until(() => a.view.phase === 'build', 'build');
  assert.equal(a.view.relay.n, 3);
  assert.equal(a.view.playerIds.length, 3);
  assert.equal(a.view.relay.operateAny, true);

  // 切到區 2（假人）操作：放甜點會放在那一區
  const botId = a.view.playerIds[1];
  emit(roomId, a, 'gt:watch', { targetId: botId });
  await until(() => a.view.watching === botId, 'watching bot zone');
  assert.equal(a.view.me.zoneId, botId);
  emit(roomId, a, 'gt:place', { slot: a.view.me.pending[0].slot, x: 5, y: 5 });
  await until(() => a.view.relay.zones[1].towers.length === 1, 'tower placed in zone 2');
  assert.equal(a.view.relay.zones[0].towers.length, 0, '自己的區沒有被動到');

  // 自己的區放完保留 → 準備 → 開波（假人的區由伺服器代選）
  emit(roomId, a, 'gt:watch', { targetId: a.id });
  await until(() => a.view.watching === a.id, 'back home');
  await placeAndKeep(roomId, a, 5);
  emit(roomId, a, 'gt:ready');
  await until(() => a.view.phase === 'wave', 'wave');
  await until(() => a.frames.some(f => f.ring && f.m.length), 'ring frame');
  assert.equal(a.frames.find(f => f.ring).owner, null);

  // 首領波：不推進波數
  for (const p of Object.values(games[roomId].players)) { p.sim.def.count = 0; p.sim.monsters = []; }
  await until(() => a.view.phase === 'build', 'wave over');
  const wave = a.view.wave;
  emit(roomId, a, 'gt:boss-wave');
  await until(() => a.view.phase === 'wave', 'boss wave');
  assert.equal(games[roomId].devBoss, true);
  assert.equal(a.view.wave, wave, '首領波不推進波數');
});

// 計時器裡的錯誤沒人接會讓整個伺服器掛掉、所有房間一起斷線：要接住並只中止出錯的那一局
async function readyOne(roomId, name) {
  const [a] = await makeRoom(roomId, [name]);
  emit(roomId, a, 'gt:start');
  await until(() => a.view.phase === 'build', 'build');
  await placeAndKeep(roomId, a, 3);
  return a;
}

test('開波時出錯：伺服器不掛，這局回大廳並通知', async () => {
  const roomId = 'GT0901';
  const a = await readyOne(roomId, 'crash1');
  const notices = [];
  a.socket.on('gt:notice', n => notices.push(n.message));
  const orig = L.startWave;
  const logErr = console.error;
  L.startWave = () => { throw new Error('boom: startWave'); };
  console.error = () => {};
  try {
    emit(roomId, a, 'gt:ready');
    await until(() => a.view.phase === 'waiting', 'back to lobby');
  } finally {
    L.startWave = orig;
    console.error = logErr;
  }
  await until(() => notices.some(m => m.includes('伺服器發生錯誤')), 'error notice');
  assert.equal(games[roomId]._timer, null);
  assert.equal(games[roomId]._ticker, null);
});

test('出怪中出錯、連結束這一波也出錯：伺服器不掛，這局回大廳', async () => {
  const roomId = 'GT0902';
  const a = await readyOne(roomId, 'crash2');
  const origTick = L.tick;
  const origFinish = L.finishWave;
  const logErr = console.error;
  L.tick = () => { throw new Error('boom: tick'); };
  L.finishWave = () => { throw new Error('boom: finishWave'); };
  console.error = () => {};
  try {
    emit(roomId, a, 'gt:ready');
    await until(() => a.view.phase === 'wave', 'wave');
    await until(() => a.view.phase === 'waiting', 'back to lobby');
  } finally {
    L.tick = origTick;
    L.finishWave = origFinish;
    console.error = logErr;
  }
  assert.equal(games[roomId]._ticker, null);
});

test('合作迷宮：兩個玩家共用地圖同時放置、同格 CELL_TAKEN、開波打完一波', async () => {
  const roomId = 'GT0008';
  const [a, b] = await makeRoom(roomId, ['ca', 'cb']);
  assert.equal(a.catalog.coop.maxPlayers, 3, '型錄帶 coop 設定');
  emit(roomId, a, 'gt:set-options', { options: { mode: 'coop', waves: 15, buildSeconds: 0, damageTest: true, livesMode: 'solo', buildMode: 'instant' } });
  await until(() => b.view.options.mode === 'coop', 'coop options');
  assert.equal(b.view.options.livesMode, 'team');
  assert.equal(b.view.options.damageTest, false);
  emit(roomId, a, 'gt:start');
  await until(() => [a, b].every(p => p.view?.phase === 'build'), 'build');
  assert.equal(a.view.board.width, 35);
  assert.equal(a.view.board.height, 35);

  // 同時放：a 放 5 顆（第一排），b 先搶 a 的第一格、再放自己的 5 顆
  const aSlots = a.view.me.pending.map(g => g.slot);
  const bSlots = b.view.me.pending.map(g => g.slot);
  aSlots.forEach((slot, i) => emit(roomId, a, 'gt:place', { slot, x: 3 + i * 2, y: 10 }));
  emit(roomId, b, 'gt:place', { slot: bSlots[0], x: 3, y: 10 });
  bSlots.slice(1).forEach((slot, i) => emit(roomId, b, 'gt:place', { slot, x: 3 + i * 2, y: 14 }));
  await until(() => a.view.towers.length + b.view.towers.length >= 18, 'towers synced to both');
  await until(() => b.errors.length >= 1, 'b gets CELL_TAKEN');
  // 先到先得：搶格失敗的是 b（a 的第一個封包先到），而且錯誤碼是 CELL_TAKEN
  const placed = a.view.towers;
  assert.equal(placed.length, 9, 'a 的 5 顆 + b 成功的 4 顆');
  assert.equal(b.errors[0].code, 'CELL_TAKEN');
  assert.deepEqual(a.view.towers.map(t => [t.id, t.owner, t.x, t.y]), b.view.towers.map(t => [t.id, t.owner, t.x, t.y]), '兩邊看到同樣的塔');
  assert.equal(placed.filter(t => t.owner === a.id).length, 5);
  assert.equal(placed.filter(t => t.owner === b.id).length, 4);
  assert.equal(b.view.me.pending.length, 1, 'b 被拒絕的那顆還在手牌');
  assert.equal(b.view.me.towers.length, 4, '手上的塔只含自己放的');

  // b 把剩下那顆放到空格，兩人各自保留一顆
  emit(roomId, b, 'gt:place', { slot: b.view.me.pending[0].slot, x: 13, y: 14 });
  await until(() => b.view.me.choosing, 'b placed all');
  await until(() => a.view.me.choosing, 'a placed all');
  emit(roomId, a, 'gt:keep', { towerId: a.view.me.fresh[0].id });
  emit(roomId, b, 'gt:keep', { towerId: b.view.me.fresh[0].id });
  await until(() => a.view.me.resolved && b.view.me.resolved, 'both resolved');
  emit(roomId, a, 'gt:ready');
  emit(roomId, b, 'gt:ready');
  await until(() => a.view.phase === 'wave' && b.view.phase === 'wave', 'wave');

  // 每人都收到同一張圖的快照（含自己不是第一位的那位）
  a.frames.length = 0;
  b.frames.length = 0;
  await until(() => a.frames.length > 0 && b.frames.length > 0, 'frames for both');
  assert.equal(a.frames.at(-1).owner, b.frames.at(-1).owner);
  assert.ok(Object.keys(b.frames.at(-1).players).includes(a.id));

  const sim = games[roomId].shared.sim;
  sim.def.count = 2;
  sim.path = sim.path.slice(0, 6);
  await until(() => a.view.phase === 'build' && b.view.phase === 'build', 'next round');
  assert.equal(a.view.wave, 1);
  assert.equal(a.view.towers.length, 10, '兩人各 5 顆：2 顆留下的塔 + 8 面餅乾牆');
  assert.equal(a.view.towers.filter(t => t.kind !== 'stone').length, 2);
});

test('合作迷宮建造者：移動、施工、取消、完成，兩邊同步；直接 gt:place 被擋', async () => {
  const roomId = 'GT0009';
  const [a, b] = await makeRoom(roomId, ['ba', 'bb']);
  emit(roomId, a, 'gt:set-options', { options: { mode: 'coop', waves: 15, buildSeconds: 0 } });
  await until(() => b.view.options.mode === 'coop', 'coop');
  assert.equal(b.view.options.buildMode, 'builder');
  emit(roomId, a, 'gt:start');
  await until(() => [a, b].every(p => p.view?.phase === 'build'), 'build');
  assert.equal(a.view.builders.length, 2);

  emit(roomId, a, 'gt:place', { slot: 0, x: 10, y: 10 });
  await until(() => a.errors.length === 1, 'place rejected');
  assert.equal(a.errors[0].code, 'USE_BUILDER');

  // a 走向 (10,10) 並施工；b 看到格子被佔（施工開始）與進度串流
  emit(roomId, a, 'gt:build', { slot: 0, x: 6, y: 4 });
  await until(() => b.view.builders.find(x => x.id === a.id).job?.started, 'job started visible to b');
  assert.ok(b.builders, '收到 gt:builders 串流');
  emit(roomId, b, 'gt:build', { slot: 0, x: 6, y: 4 });
  await until(() => b.errors.length === 1, 'b CELL_TAKEN');
  assert.equal(b.errors[0].code, 'CELL_TAKEN');

  // 取消 → 格子釋放、寶石還在手牌；再蓋一次直到完成
  emit(roomId, a, 'gt:cancel-job');
  await until(() => a.view.builders.find(x => x.id === a.id).job === null, 'cancelled');
  assert.equal(a.view.me.pending.length, 5);
  assert.equal(games[roomId].shared.grid.size, 0);
  emit(roomId, a, 'gt:build', { slot: 0, x: 6, y: 4 });
  await until(() => a.view.towers.length === 1, 'tower built', 8000);
  assert.equal(b.view.towers[0].owner, a.id);
  assert.equal(a.view.me.pending.length, 4);

  // 一邊拆除自己的餅乾牆需要時間；他人的牆不能拆
  emit(roomId, b, 'gt:demolish', { towerId: a.view.towers[0].id });
  await until(() => b.errors.length === 2, 'b cannot demolish');
  assert.equal(b.errors[1].code, 'BAD_TOWER');
});

test('合作迷宮試玩紀錄：房主中途結束也寫一行 JSON（aborted），不進排行榜；其他模式不寫', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gt-playtest-')), 'log.jsonl');
  const saved = process.env.GEM_TD_PLAYTEST_LOG;
  process.env.GEM_TD_PLAYTEST_LOG = file;
  try {
    const roomId = 'GT0010';
    const [a, b] = await makeRoom(roomId, ['pa', 'pb']);
    emit(roomId, a, 'gt:set-options', { options: { mode: 'coop', waves: 15, buildSeconds: 0 } });
    await until(() => b.view.options.mode === 'coop', 'coop');
    emit(roomId, a, 'gt:start');
    await until(() => [a, b].every(p => p.view?.phase === 'build'), 'build');
    // 兩人搶同一格：b 收到 CELL_TAKEN，會算進紀錄
    emit(roomId, a, 'gt:build', { slot: 0, x: 6, y: 4 });
    await until(() => b.view.builders.find(x => x.id === a.id).job?.started, 'started');
    emit(roomId, b, 'gt:build', { slot: 0, x: 6, y: 4 });
    await until(() => b.errors.length === 1, 'b CELL_TAKEN');
    emit(roomId, a, 'gt:cancel-job');
    await until(() => a.view.builders.find(x => x.id === a.id).job === null, 'cancelled');
    emit(roomId, a, 'gt:finish-now');
    await until(() => a.view.phase === 'finished', 'finished');
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const rec = JSON.parse(lines[0]);
    assert.equal(rec.mode, 'coop');
    assert.equal(rec.aborted, true);
    assert.equal(rec.players, 2);
    assert.equal(rec.cellTaken, 1);
    assert.equal(rec.cancels, 1);
    assert.equal(rec.byPlayer[1].cellTaken, 1);
    assert.equal(games[roomId].playtest, null, '寫完就清掉，同一局不重複寫');

    // 一般模式結束：不寫紀錄
    const [c] = await makeRoom('GT0011', ['pc']);
    emit('GT0011', c, 'gt:start');
    await until(() => c.view?.phase === 'build', 'single build');
    emit('GT0011', c, 'gt:finish-now');
    await until(() => c.view.phase === 'finished', 'single finished');
    assert.equal(fs.readFileSync(file, 'utf8').trim().split('\n').length, 1);
  } finally {
    if (saved === undefined) delete process.env.GEM_TD_PLAYTEST_LOG; else process.env.GEM_TD_PLAYTEST_LOG = saved;
  }
});
