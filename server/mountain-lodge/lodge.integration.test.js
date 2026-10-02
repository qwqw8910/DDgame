// ================================================================
//  山中別館殺人事件 — 整合測試（真 socket.io + 記憶體 Mock DB）
//  執行：node --test mountain-lodge/lodge.integration.test.js
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
    _players: players,
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
        delete: () => ({ eq: (_c, id) => { delete players[id]; return Promise.resolve({ error: null }); } }),
      };
    },
  };
}

let httpServer, io, port, db;
const clients = [];

before(async () => {
  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  db = makeMockDb();
  registerNamespace(io, db);
  await new Promise(r => httpServer.listen(0, r));
  port = httpServer.address().port;
});

after(() => {
  clients.forEach(c => c.close());
  io.close();
  httpServer.close();
});

// ── 玩家封裝：記錄最新 state ─────────────────────────────────────
async function connect(name) {
  const socket = ioc(`http://localhost:${port}/mountain-lodge`, {
    transports: ['websocket'], reconnection: false, forceNew: true,
  });
  clients.push(socket);
  const p = { name, id: `id-${name}`, socket, view: null, ack: null, errors: [] };
  socket.on('lodge:state', v => { p.view = v; });
  socket.on('lodge:error', e => p.errors.push(e));
  socket.on('room:join-ack', a => { p.ack = a; });
  await new Promise(r => socket.on('connect', r));
  return p;
}

const until = async (fn, label = 'condition', ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 15));
  }
  throw new Error(`timeout waiting for ${label}`);
};

test('完整一局：建立 → 加入 → 傳牌 → 討論 → 投票 → 結算 → 再來一局', async () => {
  const roomId = 'LODGE1';
  const [a, b, c, d] = await Promise.all(['a', 'b', 'c', 'd'].map(connect));
  const all = [a, b, c, d];

  a.socket.emit('room:create', { roomId, nickname: 'a', playerId: a.id, maxPlayers: 4, appId: 'mountain-lodge' });
  await until(() => a.ack, 'host ack');
  for (const p of [b, c, d]) {
    p.socket.emit('room:join', { roomId, nickname: p.name, playerId: p.id });
    await until(() => p.ack, `${p.name} ack`);
  }
  await until(() => all.every(p => p.view?.phase === 'lobby'), 'lobby views');

  // 非房主不能開始；人數 4 夠
  b.socket.emit('lodge:start', { roomId });
  await until(() => b.errors.length, 'forbidden');
  assert.equal(b.errors[0].code, 'FORBIDDEN');

  // 房主調整設定
  a.socket.emit('lodge:settings', { roomId, level: 2, discussionSeconds: 60 });
  await until(() => a.view.level === 2 && a.view.discussionSeconds === 60, 'settings');

  a.socket.emit('lodge:start', { roomId });
  await until(() => all.every(p => p.view.phase === 'passing'), 'passing');

  // 傳牌：輪流由 actor 操作
  const byId = Object.fromEntries(all.map(p => [p.id, p]));
  for (let step = 0; step < 4; step++) {
    const actor = byId[a.view.actorId];
    await until(() => actor.view.me.hand.length === 2, 'actor hand');
    // 非 actor 看不到手牌
    for (const p of all) if (p !== actor) assert.equal(p.view.me.hand.length, 0);
    const keep = actor.view.me.hand[0].id;
    const passTo = actor.view.me.passTargets[0] ?? null;
    const before = a.view.keptIds.length;
    actor.socket.emit('lodge:keep', { roomId, cardId: keep, passTo });
    if (step < 3) await until(() => a.view.keptIds.length === before + 1, 'next step');
  }
  await until(() => all.every(p => p.view.phase === 'discussion'), 'discussion');
  assert.ok(a.view.endsAt > Date.now());
  assert.ok(all.every(p => p.view.me.card), '每位玩家都有自己的角色牌');
  assert.equal(a.view.lodgeRoomFilled, true);

  // 只有房主能提前結束討論
  b.socket.emit('lodge:end-discussion', { roomId });
  await until(() => b.errors.length === 2, 'non-host end-discussion rejected');
  a.socket.emit('lodge:end-discussion', { roomId });
  await until(() => all.every(p => p.view.phase === 'voting'), 'voting');

  // 投票：大家投 a 的地點；他人票隱藏，只看到已投名單
  for (const p of all) p.socket.emit('lodge:vote', { roomId, targetId: a.id });
  await until(() => all.every(p => p.view.phase === 'result'), 'result');

  const r = a.view.result;
  assert.deepEqual(r.boilerIds, [a.id]);
  assert.equal(Object.keys(r.cards).length, 4);
  assert.equal(r.replay.length, 4);
  // 勝方 +1 分（寫入 players.score）
  for (const id of r.winnerIds) assert.equal(db._players[id].score, 1);

  // 再來一局 → 回大廳，設定保留
  a.socket.emit('lodge:again', { roomId });
  await until(() => all.every(p => p.view.phase === 'lobby'), 'back to lobby');
  assert.equal(a.view.level, 2);
});

test('遊戲中加入者成為觀戰者：看得到公開桌面但沒有手牌；離開的玩家使牌局中止', async () => {
  const roomId = 'LODGE2';
  const [a, b, c, s] = await Promise.all(['a2', 'b2', 'c2', 's2'].map(connect));
  a.socket.emit('room:create', { roomId, nickname: 'a2', playerId: a.id, maxPlayers: 4, appId: 'mountain-lodge' });
  await until(() => a.ack, 'ack');
  for (const p of [b, c]) {
    p.socket.emit('room:join', { roomId, nickname: p.name, playerId: p.id });
    await until(() => p.ack, 'ack');
  }
  a.socket.emit('lodge:start', { roomId });
  await until(() => [a, b, c].every(p => p.view?.phase === 'passing'), 'passing');

  s.socket.emit('room:join', { roomId, nickname: 's2', playerId: s.id });
  await until(() => s.ack, 'spectator ack');
  assert.equal(s.ack.type, 'spectator');
  assert.equal(s.ack.gameState.phase, 'passing');
  assert.equal(s.ack.gameState.me, null);
  // levelRoles 是公開的角色板塊（本局有哪些角色），不算洩漏；其餘欄位不得出現角色牌
  const { levelRoles, ...rest } = s.ack.gameState;
  assert.ok(Array.isArray(levelRoles));
  assert.ok(!JSON.stringify(rest).includes('killer'));

  // 玩家離開 → 回大廳
  c.socket.emit('room:leave');
  await until(() => a.view.phase === 'lobby', 'aborted to lobby');
});
