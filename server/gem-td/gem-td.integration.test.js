// ================================================================
//  寶石塔防 — 整合測試（真 socket.io + 記憶體 Mock DB）
//  執行：node --test --test-force-exit gem-td/gem-td.integration.test.js
// ================================================================
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const { registerNamespace } = require('./index');

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
    transports: ['websocket'], reconnection: false, forceNew: true,
  });
  clients.push(socket);
  const p = { name, id: `id-${name}`, socket, view: null, ack: null, catalog: null, frames: [], errors: [] };
  socket.on('gt:state', v => { p.view = v; });
  socket.on('gt:catalog', c => { p.catalog = c; });
  socket.on('gt:frame', f => p.frames.push(f));
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
  assert.ok(a.catalog.gems.D.levels.length === 6, '加入時收到型錄');

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
