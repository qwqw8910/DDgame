// ================================================================
//  血染鐘樓 — 整合測試（真 socket.io + 記憶體 Mock DB）
//  執行：node --test --test-force-exit clocktower/clocktower.integration.test.js
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
        delete: () => { const f = {}; const q = { eq: (c, v) => { f[c] = v; return q; }, then: (res, rej) => { const p = players[f.id]; if (p && (f.room_id === undefined || p.room_id === f.room_id)) delete players[f.id]; return Promise.resolve({ error: null }).then(res, rej); } }; return q; },
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

async function connect(name) {
  const socket = ioc(`http://localhost:${port}/clocktower`, {
    transports: ['websocket'], reconnection: false, forceNew: true,
  });
  clients.push(socket);
  const p = { name, id: `id-${name}`, socket, view: null, ack: null, errors: [], chats: [], prompts: [], script: null };
  socket.on('ct:state', v => { p.view = v; });
  socket.on('ct:error', e => p.errors.push(e));
  socket.on('ct:chat-message', m => p.chats.push(m));
  socket.on('ct:prompt', pr => p.prompts.push(pr));
  socket.on('ct:script', s => { p.script = s; });
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

async function makeRoom(roomId, names, seats) {
  const ps = await Promise.all(names.map(connect));
  const [host, ...rest] = ps;
  host.socket.emit('room:create', { roomId, nickname: host.name, playerId: host.id, maxPlayers: seats + 1, appId: 'clocktower' });
  await until(() => host.ack, 'host ack');
  for (const p of rest) {
    p.socket.emit('room:join', { roomId, nickname: p.name, playerId: p.id });
    await until(() => p.ack, `${p.name} ack`);
  }
  await until(() => ps.every(p => p.view?.phase === 'lobby'), 'lobby views');
  return ps;
}

const ROLES5 = ['washerwoman', 'empath', 'monk', 'poisoner', 'imp'];

test('完整一局：指定說書人 → 入座 → 開局 → 一晚一天 → 處決惡魔 → 結算 → 回大廳', async () => {
  const roomId = 'CT0001';
  const all = await makeRoom(roomId, ['st', 'b', 'c', 'd', 'e', 'f'], 5);
  const [st, ...players] = all;
  const emit = (p, ev, data = {}) => p.socket.emit(ev, { roomId, ...data });

  assert.equal(st.script.roles.length, 22, '進房收到劇本');

  // 非房主不能指定說書人
  emit(players[0], 'ct:set-storyteller', { playerId: players[0].id });
  await until(() => players[0].errors.length, 'forbidden');
  emit(st, 'ct:set-storyteller', { playerId: st.id });
  await until(() => all.every(p => p.view.storytellerId === st.id), 'storyteller set');

  // 房主轉移不影響說書人
  st.socket.emit('room:transfer-host', { targetPlayerId: players[0].id });
  await until(() => st.view && players[0].ack, 'transfer');

  players.forEach((p, i) => emit(p, 'ct:claim-seat', { seat: i }));
  await until(() => st.view.lobbySeats.every(Boolean), 'all seated');

  emit(st, 'ct:setup', { action: 'begin' });
  await until(() => all.every(p => p.view.phase === 'setup'), 'setup');
  // 玩家（新房主）不能操作魔典
  emit(players[0], 'ct:assign-role', { seat: 0, roleId: 'imp' });
  await until(() => players[0].errors.length === 2, 'player cannot assign');
  ROLES5.forEach((r, i) => emit(st, 'ct:assign-role', { seat: i, roleId: r }));
  await until(() => st.view.seats.every(s => s.roleId), 'assigned');
  assert.deepEqual(st.view.grimoire.setupErrors, []);
  assert.equal(players[1].view.seats[0].roleId, undefined, 'setup 時玩家看不到角色');

  emit(st, 'ct:start');
  await until(() => all.every(p => p.view.phase === 'night'), 'night');
  players.forEach((p, i) => assert.equal(p.view.me.roleId, ROLES5[i]));
  for (const p of players) {
    assert.ok(p.view.seats.every(s => s.roleId === undefined), '玩家看不到座位角色');
    assert.equal(p.view.grimoire, null);
  }

  // 喚醒投毒者（座位 3）→ 玩家選擇 → 自動放中毒標記
  emit(st, 'ct:wake', { seat: 3 });
  await until(() => players[3].prompts.length && players[3].view.me.prompt, 'prompt arrives');
  emit(players[3], 'ct:prompt-reply', { promptId: players[3].view.me.prompt.id, targets: [1] });
  await until(() => st.view.grimoire.reminders.some(r => r.reminderId === 'poisoner:poisoned' && r.seat === 1), 'auto reminder');
  assert.ok(st.view.grimoire.impaired[1]);

  // 送資訊給洗衣婦
  emit(st, 'ct:send-info', { target: 0, info: { type: 'info-players-role', players: [1, 2], showRole: 'empath' } });
  await until(() => players[0].view.me.messages.length === 1, 'info');

  emit(st, 'ct:phase', { to: 'dawn' });
  await until(() => all.every(p => p.view.phase === 'day' && p.view.daySubPhase === 'dawn'), 'dawn');

  // 自由時間：私聊
  emit(st, 'ct:day-phase', { to: 'free' });
  await until(() => players[0].view.daySubPhase === 'free', 'free');
  emit(players[0], 'ct:whisper-invite', { playerIds: [players[1].id] });
  await until(() => players[1].view.me.invites.length === 1, 'invite');
  emit(players[1], 'ct:whisper-respond', { inviteId: players[1].view.me.invites[0].id, accept: true });
  await until(() => players[4].view.whisperGroups.length === 1, 'group visible to all');
  assert.deepEqual(players[4].view.whisperGroups[0].members.sort(), [players[0].id, players[1].id].sort());
  emit(players[0], 'ct:whisper-send', { text: '我是洗衣婦' });
  await until(() => players[1].chats.some(m => m.channel === 'whisper'), 'whisper msg');
  await new Promise(r => setTimeout(r, 100));
  assert.ok(!players[2].chats.some(m => m.channel === 'whisper'), '非成員收不到私聊');
  assert.ok(!st.chats.some(m => m.channel === 'whisper'), '說書人收不到私聊內容');

  // 私訊說書人
  emit(players[2], 'ct:chat-storyteller', { text: '我想問規則' });
  await until(() => st.chats.some(m => m.channel === 'storyteller'), 'dm');
  assert.ok(!players[3].chats.some(m => m.channel === 'storyteller'));

  // 提名惡魔（座位 4）→ 投票
  emit(st, 'ct:day-phase', { to: 'nomination' });
  await until(() => players[0].view.daySubPhase === 'nomination' && !players[0].view.whisperGroups.length, 'nomination');
  emit(players[3], 'ct:chat-public', { text: '我提名 [[seat:5]]' });
  await until(() => players[4].chats.some(m => m.channel === 'public'), 'public chat');
  emit(players[0], 'ct:nominate', { nominee: 4 });
  await until(() => st.view.nominations.current?.stage === 'speech', 'nominated');
  emit(st, 'ct:start-vote', { handSpeedMs: 300 });
  await until(() => players[0].view.voting, 'voting');
  for (const p of players.slice(0, 3)) emit(p, 'ct:vote', { up: true });
  await until(() => st.view.nominations.results.length === 1, 'vote finished', 6000);
  assert.equal(st.view.nominations.results[0].votes, 3);
  assert.equal(st.view.nominations.onTheBlock, 4);

  emit(st, 'ct:phase', { to: 'night' });
  await until(() => st.view.grimoire.pendingWinner?.team === 'good', 'pending winner');
  assert.equal(players[0].view.seats[4].isDead, true);
  emit(st, 'ct:confirm-winner', { confirm: true });
  await until(() => all.every(p => p.view.phase === 'result'), 'result');
  assert.equal(players[0].view.seats[4].roleId, 'imp', '終局公開角色');
  assert.ok(players[0].view.chat.whispers && Object.values(players[4].view.chat.whispers).some(g => g.history.length), '終局公開私聊');
  await until(() => db._players[players[0].id].score === 1, 'score');
  assert.equal(db._players[st.id].score, 0, '說書人不計分');
  assert.equal(db._players[players[4].id].score, 0);

  emit(st, 'ct:again');
  await until(() => all.every(p => p.view.phase === 'lobby'), 'back to lobby');
  assert.equal(st.view.storytellerId, st.id);
  assert.equal(st.view.lobbySeats.filter(Boolean).length, 5);
});

test('觀戰、說書人斷線暫停 / 重連恢復、玩家離開保留座位、說書人離開中止', async () => {
  const roomId = 'CT0002';
  const all = await makeRoom(roomId, ['st2', 'b2', 'c2', 'd2', 'e2', 'f2'], 5);
  const [st, ...players] = all;
  const emit = (p, ev, data = {}) => p.socket.emit(ev, { roomId, ...data });
  emit(st, 'ct:set-storyteller', { playerId: st.id });
  await until(() => st.view.storytellerId === st.id, 'st');
  players.forEach((p, i) => emit(p, 'ct:claim-seat', { seat: i }));
  await until(() => st.view.lobbySeats.every(Boolean), 'seated');
  emit(st, 'ct:setup', { action: 'begin' });
  await until(() => st.view.phase === 'setup', 'setup');
  emit(st, 'ct:setup', { action: 'random-roles' });
  await until(() => st.view.grimoire.setupRoles.length === 5, 'roles');
  emit(st, 'ct:assign-role', { action: 'random' });
  await until(() => st.view.seats.every(s => s.roleId), 'random assign');
  emit(st, 'ct:start');
  await until(() => players.every(p => p.view.phase === 'night'), 'night');

  // 觀戰者：只看到公開資訊
  const w = await connect('w2');
  w.socket.emit('room:join', { roomId, nickname: 'w2', playerId: w.id });
  await until(() => w.ack, 'spectator ack');
  assert.equal(w.ack.type, 'spectator');
  w.socket.emit('ct:sync', { roomId });
  await until(() => w.view?.phase === 'night', 'spectator view');
  assert.equal(w.view.viewer.role, 'spectator');
  assert.ok(w.view.seats.every(s => s.roleId === undefined));
  assert.equal(w.view.me, null);
  w.socket.emit('ct:chat-storyteller', { roomId, text: 'hi' });
  await until(() => w.errors.length, 'spectator cannot DM');

  // 說書人斷線 → 暫停；同 playerId 重連 → 恢復
  st.socket.disconnect();
  await until(() => players[0].view.phase === 'paused', 'paused');
  assert.equal(players[0].view.pausedFrom, 'night');
  const st2 = await connect('st2');
  st2.socket.emit('room:join', { roomId, nickname: 'st2', playerId: st.id });
  await until(() => players[0].view.phase === 'night', 'resumed');
  await until(() => st2.view?.grimoire, 'storyteller grimoire after reconnect');

  // 玩家主動離開：座位保留、已離開
  players[4].socket.emit('room:leave');
  await until(() => st2.view.seats[4].hasLeft, 'left');
  assert.equal(players[0].view.seats[4].isDead, true);
  assert.equal(players[0].view.phase, 'night', '玩家離開不中止遊戲');

  // 遊戲中交接說書人給觀戰者
  st2.socket.emit('ct:transfer-storyteller', { roomId, playerId: players[0].id });
  await until(() => st2.errors.length, 'cannot transfer to seated player');
  st2.socket.emit('ct:transfer-storyteller', { roomId, playerId: w.id });
  await until(() => w.view?.viewer.role === 'storyteller' && w.view.grimoire, 'spectator became storyteller');
  assert.equal(st2.view.grimoire, null, '原說書人失去魔典');

  // 說書人（房間觀戰者）離開 → 本局中止回大廳
  w.socket.emit('room:leave');
  await until(() => players[0].view.phase === 'lobby', 'aborted');
  assert.equal(players[0].view.storytellerId, null);
});
