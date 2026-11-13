// ================================================================
//  點格棋 — 整合測試（真 socket.io + 記憶體 Mock DB）
//  執行：node --test --test-force-exit tests/integration/dots-boxes.test.js
// ================================================================
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const { registerNamespace } = require('../../dots-boxes/index');
const L = require('../../dots-boxes/gameLogic');

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

let httpServer, io, port;
const clients = [];

before(async () => {
  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  registerNamespace(io, makeMockDb());
  await new Promise(r => httpServer.listen(0, r));
  port = httpServer.address().port;
});

after(() => {
  clients.forEach(c => c.close());
  io.close();
  httpServer.close();
});

async function connect(name) {
  const socket = ioc(`http://localhost:${port}/dots-boxes`, {
    transports: ['websocket'], reconnection: false, forceNew: true,
  });
  clients.push(socket);
  const p = { name, id: `id-${name}`, socket, view: null, ack: null, errors: [], canJoin: false };
  socket.on('db:state', v => { p.view = v; });
  socket.on('db:error', e => p.errors.push(e));
  socket.on('room:join-ack', a => { p.ack = a; });
  socket.on('room:spectator-can-join', () => { p.canJoin = true; });
  await new Promise(r => socket.on('connect', r));
  return p;
}

const until = async (fn, label = 'condition', ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error(`timeout waiting for ${label}`);
};

async function makeRoom(roomId, names) {
  const ps = await Promise.all(names.map(connect));
  const [host, ...rest] = ps;
  host.socket.emit('room:create', { roomId, nickname: host.name, playerId: host.id, maxPlayers: 2, appId: 'dots-boxes' });
  await until(() => host.ack, 'host ack');
  for (const p of rest) {
    p.socket.emit('room:join', { roomId, nickname: p.name, playerId: p.id });
    await until(() => p.ack, `${p.name} ack`);
  }
  await until(() => ps.every(p => p.view?.phase === 'waiting'), 'waiting views');
  return ps;
}

async function addSpectator(roomId, name) {
  const c = await connect(name);
  c.socket.emit('room:join', { roomId, nickname: c.name, playerId: c.id });
  await until(() => c.ack, 'spectator ack');
  assert.equal(c.ack.type, 'spectator');
  return c;
}

const emit = (roomId, p, ev, data = {}) => p.socket.emit(ev, { roomId, ...data });

test('完整一局：設定 → 開局 → 輪流 → 打完 → 回大廳換先手', async () => {
  const roomId = 'DB0001';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);

  emit(roomId, b, 'db:set-options', { options: { size: 5 } });
  await until(() => b.errors.some(e => e.code === 'FORBIDDEN'), 'non-host options rejected');
  emit(roomId, a, 'db:set-options', { options: { size: 5, mode: 'advanced' } });
  await until(() => b.view.options.size === 5 && b.view.options.mode === 'advanced', 'options applied');

  emit(roomId, b, 'db:start');
  await until(() => b.errors.length === 2, 'non-host start rejected');
  emit(roomId, a, 'db:start');
  await until(() => [a, b].every(p => p.view.phase === 'playing'), 'playing');
  assert.equal(a.view.lines.length, L.lineCount(5));
  assert.equal(a.view.values.length, 25);
  assert.equal(a.view.mySeat + b.view.mySeat, 1);

  const byId = { [a.id]: a, [b.id]: b };
  const cur = () => byId[a.view.players[a.view.turn]];
  const other = () => byId[a.view.players[1 - a.view.turn]];

  const wrong = other();
  emit(roomId, wrong, 'db:move', { edge: 0 });
  await until(() => wrong.errors.some(e => e.code === 'NOT_YOUR_TURN'), 'wrong turn rejected');

  let guard = 0;
  while (a.view.phase === 'playing' && guard++ < 200) {
    const free = a.view.lines.findIndex(x => x === -1);
    const prev = a.view.moveCount;
    emit(roomId, cur(), 'db:move', { edge: free });
    await until(() => a.view.moveCount === prev + 1, 'move applied');
  }
  assert.equal(a.view.phase, 'finished');
  assert.equal(a.view.endReason, 'complete');
  const total = a.view.values.reduce((s, x) => s + x, 0);
  assert.equal(a.view.scores[0] + a.view.scores[1], total);

  const firstBefore = a.view.players[0];
  emit(roomId, b, 'db:restart');
  await until(() => a.view.phase === 'waiting', 'back to lobby');
  emit(roomId, a, 'db:start');
  await until(() => a.view.phase === 'playing', 'second game');
  assert.notEqual(a.view.players[0], firstBefore, '先手應交換');
});

test('第 3 人成為觀戰者、看得到盤面但不能下；玩家投降後對手獲勝', async () => {
  const roomId = 'DB0002';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);
  const c = await addSpectator(roomId, 'c');

  emit(roomId, a, 'db:start');
  await until(() => c.view?.phase === 'playing', 'spectator sees game');
  assert.equal(c.view.mySeat, -1);

  emit(roomId, c, 'db:move', { edge: 0 });
  await until(() => c.errors.some(e => e.code === 'NOT_PLAYER'), 'spectator cannot move');

  const loser = a.view.mySeat === 0 ? a : b;
  emit(roomId, loser, 'db:resign');
  await until(() => c.view.phase === 'finished', 'finished');
  assert.equal(c.view.winner, 1 - loser.view.mySeat);
  assert.equal(c.view.endReason, 'resign');
});

test('進行中玩家離開 → 對手獲勝，觀戰者收到可入座通知', async () => {
  const roomId = 'DB0003';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);
  const c = await addSpectator(roomId, 'c');
  emit(roomId, a, 'db:start');
  await until(() => b.view.phase === 'playing', 'playing');

  await new Promise(r => b.socket.emit('room:leave', r));
  await until(() => a.view.phase === 'finished', 'finished by leave');
  assert.equal(a.view.endReason, 'leave');
  assert.equal(a.view.winner, a.view.mySeat);
  await until(() => c.canJoin, 'spectator offered seat');
});
