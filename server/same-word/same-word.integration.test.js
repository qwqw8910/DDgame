// ================================================================
//  同詞相遇 — 整合測試（真 socket.io + 記憶體 Mock DB）
//  執行：node --test --test-force-exit same-word/same-word.integration.test.js
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

let httpServer, io, port, db, games;
const clients = [];

before(async () => {
  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });
  db = makeMockDb();
  ({ games } = registerNamespace(io, db));
  await new Promise(r => httpServer.listen(0, r));
  port = httpServer.address().port;
});

after(() => {
  clients.forEach(c => c.close());
  io.close();
  httpServer.close();
});

async function connect(name) {
  const socket = ioc(`http://localhost:${port}/same-word`, {
    transports: ['websocket'], reconnection: false, forceNew: true,
  });
  clients.push(socket);
  const p = { name, id: `id-${name}`, socket, view: null, ack: null, errors: [] };
  socket.on('sw:state', v => { p.view = v; });
  socket.on('sw:error', e => p.errors.push(e));
  socket.on('room:join-ack', a => { p.ack = a; });
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

async function makeRoom(roomId, names, maxPlayers = 12) {
  const ps = await Promise.all(names.map(connect));
  const [host, ...rest] = ps;
  host.socket.emit('room:create', { roomId, nickname: host.name, playerId: host.id, maxPlayers, appId: 'same-word' });
  await until(() => host.ack, 'host ack');
  for (const p of rest) {
    p.socket.emit('room:join', { roomId, nickname: p.name, playerId: p.id });
    await until(() => p.ack, `${p.name} ack`);
  }
  await until(() => ps.every(p => p.view?.phase === 'waiting'), 'waiting views');
  return ps;
}

const emit = (roomId, p, ev, data = {}) => p.socket.emit(ev, { roomId, ...data });

test('完整一局：設定 → 開局 → 書寫（別人的詞不外洩）→ 揭曉 → 下一輪 → 結算 → 重玩', async () => {
  const roomId = 'SW0001';
  const [a, b, c] = await makeRoom(roomId, ['a', 'b', 'c']);

  emit(roomId, b, 'sw:set-options', { options: { maxRounds: 5 } });
  await until(() => b.errors.length === 1, 'non-host options rejected');
  assert.equal(b.errors[0].code, 'FORBIDDEN');
  emit(roomId, a, 'sw:set-options', { options: { maxRounds: 5, outlierVote: false } });
  await until(() => a.view?.options.maxRounds === 5, 'options applied');

  emit(roomId, b, 'sw:start');
  await until(() => b.errors.length === 2, 'non-host start rejected');
  emit(roomId, a, 'sw:start');
  await until(() => [a, b, c].every(p => p.view.phase === 'writing' && p.view.round === 1), 'writing');

  emit(roomId, a, 'sw:submit', { word: '祕密西瓜' });
  await until(() => c.view.submitted?.[a.id] === true, 'submitted flag');
  assert.equal(JSON.stringify(c.view).includes('祕密西瓜'), false);
  assert.equal(a.view.myWord, '祕密西瓜');

  emit(roomId, b, 'sw:submit', { word: '123' });
  await until(() => b.errors.some(e => e.code === 'BAD_WORD'), 'bad word rejected');

  emit(roomId, b, 'sw:submit', { word: 'ＸＹＺ' });
  emit(roomId, c, 'sw:submit', { word: 'xyz' });
  await until(() => [a, b, c].every(p => p.view.phase === 'revealed'), 'revealed');
  assert.deepEqual(a.view.rounds[0].groups, [['id-a'], ['id-b', 'id-c']]);
  assert.equal(a.view.endsAfterThis, 'allPaired');

  emit(roomId, b, 'sw:next-round');
  await until(() => b.errors.length === 3, 'non-host next rejected');
  emit(roomId, a, 'sw:next-round');
  await until(() => [a, b, c].every(p => p.view.phase === 'finished'), 'finished');
  assert.equal(a.view.result.unique, 'id-a');
  assert.equal(a.view.result.bestPairs[0].tierId, 'soulmates');

  emit(roomId, a, 'sw:restart');
  await until(() => [a, b, c].every(p => p.view.phase === 'waiting'), 'back to waiting');
  assert.equal(a.view.options.maxRounds, 5);
});

test('逾時：伺服器自動揭曉，未送出視為空白', async () => {
  const roomId = 'SW0002';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);
  games[roomId].options.timerSeconds = 1;
  emit(roomId, a, 'sw:start');
  await until(() => a.view.phase === 'writing', 'writing');
  emit(roomId, a, 'sw:submit', { word: '海' });
  await until(() => a.view.phase === 'revealed', 'auto reveal', 3000);
  assert.deepEqual(b.view.rounds[0].words, { 'id-a': '海', 'id-b': '' });
  assert.equal(b.view.endsAfterThis, null);

  emit(roomId, a, 'sw:next-round');
  await until(() => a.view.phase === 'writing' && a.view.round === 2, 'round 2');
  emit(roomId, a, 'sw:finish-now');
  await until(() => a.view.phase === 'finished', 'host finish');
  assert.equal(a.view.result.endReason, 'host');
  assert.deepEqual(a.view.result.loners, ['id-a', 'id-b']);
});

test('重連：書寫中斷線後重新加入，還原階段與自己已送出的詞', async () => {
  const roomId = 'SW0003';
  const [a, b, c] = await makeRoom(roomId, ['a', 'b', 'c']);
  emit(roomId, a, 'sw:start');
  await until(() => b.view.phase === 'writing', 'writing');
  emit(roomId, b, 'sw:submit', { word: '山' });
  await until(() => b.view.myWord === '山', 'own word');

  b.socket.close();
  const b2 = await connect('b');
  b2.socket.emit('room:join', { roomId, nickname: 'b', playerId: b.id });
  await until(() => b2.ack?.type === 'reconnect', 'reconnect ack');
  await until(() => b2.view?.phase === 'writing', 'view restored');
  assert.equal(b2.view.myWord, '山');
  assert.equal(b2.view.submitted['id-b'], true);
  assert.equal(c.view.phase, 'writing');
});

test('離開：最後沒送出的人離開 → 立即揭曉；剩不到 2 人 → 中止回大廳；中途加入者是觀戰者', async () => {
  const roomId = 'SW0004';
  const [a, b, c] = await makeRoom(roomId, ['a', 'b', 'c']);
  emit(roomId, a, 'sw:start');
  await until(() => c.view.phase === 'writing', 'writing');

  const late = await connect('late');
  late.socket.emit('room:join', { roomId, nickname: 'late', playerId: late.id });
  await until(() => late.ack?.type === 'spectator', 'late joiner is spectator');
  emit(roomId, late, 'sw:submit', { word: '海' });
  await until(() => late.errors.some(e => e.code === 'FORBIDDEN'), 'spectator cannot submit');

  emit(roomId, a, 'sw:submit', { word: '海' });
  emit(roomId, b, 'sw:submit', { word: '海' });
  await until(() => a.view.submitted?.['id-b'] === true, 'a,b submitted');
  c.socket.emit('room:leave');
  await until(() => a.view.phase === 'revealed', 'settled after leave');
  assert.deepEqual(a.view.leftIds, ['id-c']);
  assert.equal(a.view.rounds[0].words['id-c'], undefined);

  emit(roomId, a, 'sw:next-round');
  await until(() => a.view.phase === 'finished', 'finished (all paired)');

  emit(roomId, a, 'sw:restart');
  await until(() => a.view.phase === 'waiting', 'waiting');
  emit(roomId, a, 'sw:start');
  await until(() => a.view.phase === 'writing', 'writing again');
  b.socket.emit('room:leave');
  await until(() => a.view.phase === 'waiting', 'aborted to lobby');
});

test('揭曉後不自動前進（沒有計時器）；房主可在進行中重新開房，保留設定', async () => {
  const roomId = 'SW0005';
  const [a, b, c] = await makeRoom(roomId, ['a', 'b', 'c']);
  emit(roomId, a, 'sw:set-options', { options: { maxRounds: 12 } });
  await until(() => a.view.options.maxRounds === 12, 'options');
  emit(roomId, a, 'sw:restart');
  await until(() => a.errors.some(e => e.code === 'BAD_PHASE'), 'restart in lobby rejected');

  emit(roomId, a, 'sw:start');
  await until(() => c.view.phase === 'writing', 'writing');
  for (const [i, p] of [a, b, c].entries()) emit(roomId, p, 'sw:submit', { word: `詞${'一二三'[i]}` });
  await until(() => c.view.phase === 'revealed', 'revealed');
  assert.equal(games[roomId]._timer, null);
  assert.equal('autoNextAt' in c.view, false);

  emit(roomId, b, 'sw:restart');
  await until(() => b.errors.some(e => e.code === 'FORBIDDEN'), 'non-host restart rejected');
  emit(roomId, a, 'sw:next-round');
  await until(() => c.view.phase === 'writing' && c.view.round === 2, 'round 2');

  emit(roomId, a, 'sw:restart'); // 書寫中也可重新開房
  await until(() => [a, b, c].every(p => p.view.phase === 'waiting'), 'back to lobby mid-game');
  assert.equal(a.view.options.maxRounds, 12);
  assert.deepEqual(a.view.rounds, []);
  assert.equal(games[roomId]._timer, null);

  emit(roomId, a, 'sw:start');
  await until(() => c.view.phase === 'writing' && c.view.round === 1, 'new game');
});
