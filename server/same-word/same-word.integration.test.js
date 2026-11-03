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

test('完整一局：設定 → 開局 → 書寫（別人的詞不外洩）→ 揭曉 → 反應 → 房主跳過 → 終局 → 結算 → 重玩', async () => {
  const roomId = 'SW0001';
  const [a, b, c] = await makeRoom(roomId, ['a', 'b', 'c']);

  emit(roomId, b, 'sw:set-options', { options: { rounds: 3 } });
  await until(() => b.errors.length === 1, 'non-host options rejected');
  assert.equal(b.errors[0].code, 'FORBIDDEN');
  emit(roomId, a, 'sw:set-options', { options: { rounds: 3 } });
  await until(() => a.view?.options.rounds === 3, 'options applied');

  emit(roomId, b, 'sw:start');
  await until(() => b.errors.length === 2, 'non-host start rejected');
  emit(roomId, a, 'sw:start');
  await until(() => [a, b, c].every(p => p.view.phase === 'writing' && p.view.round === 1), 'writing');
  assert.equal(a.view.kind, 'prompt');
  assert.ok(a.view.prompt);

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
  assert.deepEqual(a.view.scores, { 'id-a': 0, 'id-b': 1, 'id-c': 1 });
  assert.deepEqual(a.view.rounds[0].lone, ['id-a']);
  assert.equal(a.view.nextStep, 'prompt');
  assert.ok(a.view.autoNextAt > Date.now());

  emit(roomId, b, 'sw:react', { targetId: 'id-a', emoji: '🤣' });
  await until(() => a.view.rounds[0].reactions['id-a']?.['🤣'] === 1, 'reaction counted');
  assert.deepEqual(b.view.myReactions, { 'id-a': '🤣' });
  assert.deepEqual(c.view.myReactions, {});

  emit(roomId, b, 'sw:next-round');
  await until(() => b.errors.length === 3, 'non-host next rejected');
  emit(roomId, a, 'sw:next-round');
  await until(() => [a, b, c].every(p => p.view.phase === 'writing' && p.view.round === 2), 'round 2');
  emit(roomId, a, 'sw:next-round'); // 書寫中按下一輪：被拒絕，且不影響計時器
  await until(() => a.errors.some(e => e.code === 'BAD_PHASE'), 'next during writing rejected');
  assert.notEqual(games[roomId]._timer, null);

  for (const p of [a, b, c]) emit(roomId, p, 'sw:submit', { word: '同' });
  await until(() => a.view.phase === 'revealed', 'revealed 2');
  assert.equal(a.view.rounds[1].allSame, true);
  emit(roomId, a, 'sw:next-round');
  await until(() => a.view.round === 3 && a.view.phase === 'writing', 'round 3');
  for (const [i, p] of [a, b, c].entries()) emit(roomId, p, 'sw:submit', { word: `詞${'一二三'[i]}` });
  await until(() => a.view.phase === 'revealed', 'revealed 3');

  emit(roomId, a, 'sw:next-round');
  await until(() => a.view.kind === 'converge' && a.view.attempt === 1 && a.view.phase === 'writing', 'converge');
  assert.equal(a.view.prompt, null);
  for (const p of [a, b, c]) emit(roomId, p, 'sw:submit', { word: '詞二' });
  await until(() => a.view.phase === 'revealed', 'converge revealed');
  assert.deepEqual(a.view.converge, { success: true, attempt: 1 });
  assert.equal(a.view.nextStep, null);

  emit(roomId, a, 'sw:next-round');
  await until(() => [a, b, c].every(p => p.view.phase === 'finished'), 'finished');
  assert.equal(a.view.result.scores['id-b'], 1 + 5 + 0 + 6);
  assert.equal(a.view.result.laugh.playerIds[0], 'id-a');

  emit(roomId, a, 'sw:restart');
  await until(() => [a, b, c].every(p => p.view.phase === 'waiting'), 'back to waiting');
  assert.equal(a.view.options.rounds, 3);
});

test('逾時：伺服器自動揭曉，未送出視為空白；揭曉後自動前進', async () => {
  const roomId = 'SW0002';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);
  games[roomId].options.timerSeconds = 1;
  games[roomId].options.revealSeconds = 1;
  emit(roomId, a, 'sw:start');
  await until(() => a.view.phase === 'writing', 'writing');
  emit(roomId, a, 'sw:submit', { word: '海' });
  await until(() => a.view.phase === 'revealed', 'auto reveal', 3000);
  assert.deepEqual(b.view.rounds[0].words, { 'id-a': '海', 'id-b': '' });

  await until(() => a.view.phase === 'writing' && a.view.round === 2, 'auto advance', 3000);
  emit(roomId, a, 'sw:finish-now');
  await until(() => a.view.phase === 'finished', 'host finish');
  assert.equal(a.view.result.endReason, 'host');
  assert.equal(games[roomId]._timer, null);
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
  assert.ok(b2.view.prompt);
  assert.equal(c.view.phase, 'writing');
});

test('離開：最後沒送出的人離開 → 立即揭曉；剩不到 2 人 → 中止回大廳；中途加入者是觀戰者', async () => {
  const roomId = 'SW0004';
  const [a, b, c] = await makeRoom(roomId, ['a', 'b', 'c']);
  emit(roomId, a, 'sw:set-options', { options: { converge: false, rounds: 3 } });
  await until(() => a.view.options.converge === false, 'options');
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

  emit(roomId, a, 'sw:restart');
  await until(() => a.view.phase === 'waiting', 'waiting');
  emit(roomId, a, 'sw:start');
  await until(() => a.view.phase === 'writing', 'writing again');
  b.socket.emit('room:leave');
  await until(() => a.view.phase === 'waiting', 'aborted to lobby');
});

test('房主可在進行中重新開房，保留設定並清掉計時器', async () => {
  const roomId = 'SW0005';
  const [a, b, c] = await makeRoom(roomId, ['a', 'b', 'c']);
  emit(roomId, a, 'sw:set-options', { options: { rounds: 8 } });
  await until(() => a.view.options.rounds === 8, 'options');
  emit(roomId, a, 'sw:restart');
  await until(() => a.errors.some(e => e.code === 'BAD_PHASE'), 'restart in lobby rejected');

  emit(roomId, a, 'sw:start');
  await until(() => c.view.phase === 'writing', 'writing');
  emit(roomId, b, 'sw:restart');
  await until(() => b.errors.some(e => e.code === 'FORBIDDEN'), 'non-host restart rejected');

  emit(roomId, a, 'sw:restart');
  await until(() => [a, b, c].every(p => p.view.phase === 'waiting'), 'back to lobby mid-game');
  assert.equal(a.view.options.rounds, 8);
  assert.deepEqual(a.view.rounds, []);
  assert.equal(games[roomId]._timer, null);

  emit(roomId, a, 'sw:start');
  await until(() => c.view.phase === 'writing' && c.view.round === 1, 'new game');
});

test('反應：只能在揭曉階段、對別人的詞', async () => {
  const roomId = 'SW0006';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);
  emit(roomId, a, 'sw:start');
  await until(() => b.view.phase === 'writing', 'writing');
  emit(roomId, a, 'sw:react', { targetId: 'id-b', emoji: '🤣' });
  await until(() => a.errors.some(e => e.code === 'BAD_PHASE'), 'react during writing rejected');
  emit(roomId, a, 'sw:submit', { word: '海' });
  emit(roomId, b, 'sw:submit', { word: '山' });
  await until(() => a.view.phase === 'revealed', 'revealed');
  emit(roomId, a, 'sw:react', { targetId: 'id-a', emoji: '🤣' });
  await until(() => a.errors.some(e => e.code === 'BAD_TARGET'), 'self react rejected');
  emit(roomId, a, 'sw:react', { targetId: 'id-b', emoji: '💩' });
  await until(() => a.errors.some(e => e.code === 'BAD_REACTION'), 'bad emoji rejected');
});

test('接龍模式：第 1 輪有題目、之後沒有；用過的詞被拒絕；全員同詞提早結束', async () => {
  const roomId = 'SW0007';
  const [a, b] = await makeRoom(roomId, ['a', 'b']);
  emit(roomId, a, 'sw:set-options', { options: { mode: 'chain' } });
  await until(() => a.view.options.mode === 'chain', 'chain mode');
  emit(roomId, a, 'sw:start');
  await until(() => b.view.phase === 'writing', 'writing');
  assert.ok(b.view.prompt);
  assert.equal(b.view.promptTotal, 6);

  emit(roomId, a, 'sw:submit', { word: '海' });
  emit(roomId, b, 'sw:submit', { word: '山' });
  await until(() => a.view.phase === 'revealed', 'revealed 1');
  emit(roomId, a, 'sw:next-round');
  await until(() => a.view.phase === 'writing' && a.view.kind === 'chain', 'chain round');
  assert.equal(a.view.prompt, null);

  emit(roomId, a, 'sw:submit', { word: '山' });
  await until(() => a.errors.some(e => e.code === 'WORD_USED'), 'used word rejected');
  emit(roomId, a, 'sw:submit', { word: '河' });
  emit(roomId, b, 'sw:submit', { word: '河' });
  await until(() => a.view.phase === 'revealed', 'revealed 2');
  assert.equal(a.view.nextStep, null);
  emit(roomId, a, 'sw:next-round');
  await until(() => a.view.phase === 'finished', 'finished early');
  assert.equal(a.view.result.allSameAt, 2);
});
