// ================================================================
//  server/room/room.integration.test.js
//  統一房間模組 整合測試（node:test + socket.io-client）
//
//  完全在記憶體中執行（Mock DB，不需要 Supabase）。
//  執行：node --test server/room/room.integration.test.js
// ================================================================
'use strict';

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const { registerRoomHandlers } = require('./index');

// ── 工具 ────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

function waitFor(socket, event, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waitFor("${event}") timeout`)),
      timeout
    );
    socket.once(event, data => { clearTimeout(timer); resolve(data); });
  });
}

function waitForEither(socket, eventA, eventB, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`waitForEither("${eventA}","${eventB}") timeout`)),
      timeout
    );
    const done = (which, data) => {
      clearTimeout(timer);
      socket.off(eventA, handlerA);
      socket.off(eventB, handlerB);
      resolve({ which, data });
    };
    const handlerA = data => done(eventA, data);
    const handlerB = data => done(eventB, data);
    socket.on(eventA, handlerA);
    socket.on(eventB, handlerB);
  });
}

// ── Mock DB ──────────────────────────────────────────────────────

function makeMockDb() {
  const rooms   = {};
  const players = {};

  const noopQuery = {
    select: function() { return this; },
    eq:     function() { return this; },
    order:  function() { return this; },
    update: function() { return { eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }; },
    upsert: function(_data, _opts) {
      // 實際回傳需要 .select().single()，這裡回傳可 chain 的 mock
      return {
        select: () => ({
          single: async () => ({ data: _data, error: null }),
        }),
      };
    },
    insert: function(_data) {
      return { select: () => ({ single: async () => ({ data: _data, error: null }) }) };
    },
    delete: function() { return { eq: () => Promise.resolve({ error: null }) }; },
    maybeSingle: async function() { return { data: null }; },
    single:      async function() { return { data: null, error: null }; },
  };

  // 完整的 chainable DB mock（rooms / players 兩張表）
  return {
    _rooms:   rooms,
    _players: players,

    from(table) {
      if (table === 'rooms') {
        return {
          select: (_cols) => ({
            eq: (_col, id) => ({
              maybeSingle: async () => ({ data: rooms[id] ?? null }),
              single:      async () => ({ data: rooms[id] ?? null, error: rooms[id] ? null : new Error('not found') }),
            }),
          }),
          insert: (data) => {
            rooms[data.id] = data;
            return { select: () => ({ single: async () => ({ data, error: null }) }) };
          },
          update: (updates) => ({
            eq: (_col, id) => {
              if (rooms[id]) rooms[id] = { ...rooms[id], ...updates };
              return {
                select: () => ({ single: async () => ({ data: rooms[id] ?? null, error: null }) }),
              };
            },
          }),
        };
      }

      if (table === 'players') {
        return {
          select: (_cols) => ({
            eq: (_col, roomId) => ({
              order: (_col) => {
                const list = Object.values(players).filter(p => p.room_id === roomId)
                  .sort((a, b) => a.join_order - b.join_order);
                return Promise.resolve({ data: list, error: null });
              },
            }),
          }),
          upsert: (data, _opts) => {
            players[data.id] = { ...(players[data.id] || {}), ...data };
            return { select: () => ({ single: async () => ({ data: players[data.id], error: null }) }) };
          },
          update: (updates) => ({
            eq: (_col, id) => {
              if (players[id]) players[id] = { ...players[id], ...updates };
              return {
                select: () => ({ single: async () => ({ data: players[id] ?? null, error: null }) }),
              };
            },
          }),
          delete: () => ({
            eq: (_col, id) => {
              delete players[id];
              return Promise.resolve({ error: null });
            },
          }),
        };
      }

      return noopQuery;
    },
  };
}

// ── 測試伺服器 setup ──────────────────────────────────────────────

let httpServer;
let io;
let PORT;
let db;
let roomCache;

before(async () => {
  httpServer = http.createServer();
  io = new Server(httpServer, { cors: { origin: '*' } });

  db = makeMockDb();
  ({ roomCache } = registerRoomHandlers(io, db, {
    minPlayers: 2,
    canJoinAsPlayer: () => true,
    buildGameState:  () => null,
  }));

  await new Promise(res => httpServer.listen(0, res));
  PORT = httpServer.address().port;
});

after(() => {
  io.close();
  httpServer.close();
});

function makeClient() {
  return ioc(`http://localhost:${PORT}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
}

async function connectClient() {
  const c = makeClient();
  await waitFor(c, 'connect');
  return c;
}

// ── 工具：在 DB 直接建好房間供測試使用 ──────────────────────────
function seedRoom(roomId, hostId) {
  db._rooms[roomId] = {
    id:             roomId,
    host_player_id: hostId,
    max_players:    6,
    status:         'waiting',
    app_id:         'test',
    updated_at:     new Date().toISOString(),
  };
}

// ================================================================
describe('room:create', () => {
  test('建立房間 → 收到 room:join-ack，type=player', async () => {
    const c = await connectClient();
    try {
      const roomId   = uuid().slice(0, 6).toUpperCase();
      const playerId = uuid();
      const ackP = waitFor(c, 'room:join-ack');
      c.emit('room:create', { roomId, nickname: 'Host', playerId, maxPlayers: 4, appId: 'test' });
      const ack = await ackP;
      assert.equal(ack.type, 'player');
      assert.equal(ack.room.id, roomId);
      assert.equal(ack.myPlayerId, playerId);
      assert.equal(ack.players.length, 1);
      assert.equal(ack.players[0].nickname, 'Host');
    } finally {
      c.disconnect();
    }
  });

  test('建立房間後 roomCache 含此房間', async () => {
    const c = await connectClient();
    try {
      const roomId   = uuid().slice(0, 6).toUpperCase();
      const playerId = uuid();
      c.emit('room:create', { roomId, nickname: 'Host', playerId, maxPlayers: 4, appId: 'test' });
      await waitFor(c, 'room:join-ack');
      const entry = roomCache.getEntry(roomId);
      assert.ok(entry, 'cache 應有此房間');
      assert.equal(entry.room.host_player_id, playerId);
    } finally {
      c.disconnect();
    }
  });
});

// ================================================================
describe('room:join — 新玩家', () => {
  test('加入後收到 room:join-ack（type=player），房間廣播 room:players-updated', async () => {
    const hostC   = await connectClient();
    const guestC  = await connectClient();
    const roomId  = uuid().slice(0, 6).toUpperCase();
    const hostId  = uuid();
    const guestId = uuid();

    try {
      // 房主建立
      hostC.emit('room:create', { roomId, nickname: 'Host', playerId: hostId, maxPlayers: 6, appId: 'test' });
      await waitFor(hostC, 'room:join-ack');

      // Guest 加入
      const ackP        = waitFor(guestC, 'room:join-ack');
      const updatedHostP = waitFor(hostC,  'room:players-updated');

      guestC.emit('room:join', { roomId, nickname: 'Guest', playerId: guestId });
      const [ack, updated] = await Promise.all([ackP, updatedHostP]);

      assert.equal(ack.type, 'player');
      assert.equal(ack.players.length, 2);
      assert.equal(updated.players.length, 2);
    } finally {
      hostC.disconnect();
      guestC.disconnect();
    }
  });

  test('暱稱重複 → room:error (NICKNAME_TAKEN)', async () => {
    const c1 = await connectClient();
    const c2 = await connectClient();
    const roomId = uuid().slice(0, 6).toUpperCase();
    const id1 = uuid(), id2 = uuid();

    try {
      c1.emit('room:create', { roomId, nickname: 'Alice', playerId: id1, maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');

      const errP = waitFor(c2, 'room:error');
      c2.emit('room:join', { roomId, nickname: 'Alice', playerId: id2 });
      const err = await errP;
      assert.equal(err.code, 'NICKNAME_TAKEN');
    } finally {
      c1.disconnect();
      c2.disconnect();
    }
  });

  test('房間不存在 → room:error (ROOM_NOT_FOUND)', async () => {
    const c = await connectClient();
    try {
      const errP = waitFor(c, 'room:error');
      c.emit('room:join', { roomId: 'XXXXX', nickname: 'Bob', playerId: uuid() });
      const err = await errP;
      assert.equal(err.code, 'ROOM_NOT_FOUND');
    } finally {
      c.disconnect();
    }
  });
});

// ================================================================
describe('room:join — 重連', () => {
  test('重連時 type=reconnect，is_online 更新為 true', async () => {
    const c1 = await connectClient();
    const c2 = await connectClient();
    const roomId = uuid().slice(0, 6).toUpperCase();
    const id1 = uuid(), id2 = uuid();

    try {
      c1.emit('room:create', { roomId, nickname: 'Alpha', playerId: id1, maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');

      c2.emit('room:join', { roomId, nickname: 'Beta', playerId: id2 });
      await waitFor(c2, 'room:join-ack');

      // c2 斷線後重連模擬：id2 再次 join
      const c3 = await connectClient();
      try {
        const ackP = waitFor(c3, 'room:join-ack');
        c3.emit('room:join', { roomId, nickname: 'Beta', playerId: id2 });
        const ack = await ackP;
        assert.equal(ack.type, 'reconnect');
        const me = ack.players.find(p => p.id === id2);
        assert.ok(me, '玩家仍在清單中');
        assert.equal(me.is_online, true);
      } finally {
        c3.disconnect();
      }
    } finally {
      c1.disconnect();
      c2.disconnect();
    }
  });
});

// ================================================================
describe('room:join — 觀戰', () => {
  test('canJoinAsPlayer=false → type=spectator', async () => {
    // 建立一個 canJoinAsPlayer 永遠回傳 false 的 namespace
    const specHttp = http.createServer();
    const specIo   = new Server(specHttp, { cors: { origin: '*' } });
    const specDb   = makeMockDb();

    registerRoomHandlers(specIo, specDb, {
      minPlayers:       2,
      canJoinAsPlayer:  () => false, // 永遠觀戰
      buildGameState:   () => null,
    });

    await new Promise(res => specHttp.listen(0, res));
    const specPort = specHttp.address().port;

    const mkClient = () => ioc(`http://localhost:${specPort}`, { transports: ['websocket'], reconnection: false, forceNew: true });

    const host  = mkClient();
    const later = mkClient();

    try {
      await waitFor(host, 'connect');
      await waitFor(later, 'connect');

      const roomId = uuid().slice(0, 6).toUpperCase();
      const hostId = uuid();

      host.emit('room:create', { roomId, nickname: 'Host', playerId: hostId, maxPlayers: 4, appId: 'test' });
      await waitFor(host, 'room:join-ack');

      // 新人加入 → 應成為觀戰者
      const specAckP = waitFor(later, 'room:join-ack');
      later.emit('room:join', { roomId, nickname: 'Viewer', playerId: uuid() });
      const ack = await specAckP;

      assert.equal(ack.type, 'spectator');
    } finally {
      host.disconnect();
      later.disconnect();
      specIo.close();
      specHttp.close();
    }
  });
});

// ================================================================
describe('room:ready', () => {
  test('切換 ready → room:players-updated 廣播', async () => {
    const c1 = await connectClient();
    const c2 = await connectClient();
    const roomId = uuid().slice(0, 6).toUpperCase();
    const id1 = uuid(), id2 = uuid();

    try {
      c1.emit('room:create', { roomId, nickname: 'A', playerId: id1, maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');
      // 等待加入廣播的 players-updated 先到，避免和 ready 廣播混淆
      const joinUpdP = waitFor(c1, 'room:players-updated');
      c2.emit('room:join', { roomId, nickname: 'B', playerId: id2 });
      await Promise.all([waitFor(c2, 'room:join-ack'), joinUpdP]);

      const updP = waitFor(c1, 'room:players-updated');
      c2.emit('room:ready', { ready: true });
      const upd = await updP;
      const p2 = upd.players.find(p => p.id === id2);
      assert.equal(p2.is_ready, true);
    } finally {
      c1.disconnect();
      c2.disconnect();
    }
  });
});

// ================================================================
describe('room:kick', () => {
  test('房主踢人 → 被踢者收到 room:kicked，其他人收到 room:players-updated', async () => {
    const host  = await connectClient();
    const guest = await connectClient();
    const roomId  = uuid().slice(0, 6).toUpperCase();
    const hostId  = uuid();
    const guestId = uuid();

    try {
      host.emit('room:create', { roomId, nickname: 'Host', playerId: hostId, maxPlayers: 6, appId: 'test' });
      await waitFor(host, 'room:join-ack');

      // 先補充到 minPlayers(2) 以上再多加一個，讓踢人後 >= minPlayers
      const extra = await connectClient();
      const extraId = uuid();
      const extraUpdP = waitFor(host, 'room:players-updated');
      extra.emit('room:join', { roomId, nickname: 'Extra', playerId: extraId });
      await Promise.all([waitFor(extra, 'room:join-ack'), extraUpdP]);

      const guestUpdP = waitFor(host, 'room:players-updated');
      guest.emit('room:join', { roomId, nickname: 'Guest', playerId: guestId });
      await Promise.all([waitFor(guest, 'room:join-ack'), guestUpdP]);

      const kickedP = waitFor(guest, 'room:kicked');
      const updP    = waitFor(host,  'room:players-updated');
      host.emit('room:kick', { targetPlayerId: guestId });
      await Promise.all([kickedP, updP]);

      const players = roomCache.getPlayers(roomId);
      assert.ok(!players.find(p => p.id === guestId), '被踢者不在清單');
    } finally {
      host.disconnect();
      guest.disconnect();
    }
  });

  test('踢人後人數低於 minPlayers → room:error (KICK_BELOW_MIN)', async () => {
    const host  = await connectClient();
    const guest = await connectClient();
    const roomId  = uuid().slice(0, 6).toUpperCase();
    const hostId  = uuid();
    const guestId = uuid();

    try {
      host.emit('room:create', { roomId, nickname: 'H', playerId: hostId, maxPlayers: 4, appId: 'test' });
      await waitFor(host, 'room:join-ack');
      guest.emit('room:join', { roomId, nickname: 'G', playerId: guestId });
      await waitFor(guest, 'room:join-ack');
      // 只有 2 人，踢 1 人 → 剩 1 < minPlayers(2)
      const errP = waitFor(host, 'room:error');
      host.emit('room:kick', { targetPlayerId: guestId });
      const err = await errP;
      assert.equal(err.code, 'KICK_BELOW_MIN');
    } finally {
      host.disconnect();
      guest.disconnect();
    }
  });

  test('非房主踢人 → room:error (FORBIDDEN)', async () => {
    const host  = await connectClient();
    const guest = await connectClient();
    const roomId  = uuid().slice(0, 6).toUpperCase();
    const hostId  = uuid();
    const guestId = uuid();

    try {
      host.emit('room:create', { roomId, nickname: 'H', playerId: hostId, maxPlayers: 4, appId: 'test' });
      await waitFor(host, 'room:join-ack');
      guest.emit('room:join', { roomId, nickname: 'G', playerId: guestId });
      await waitFor(guest, 'room:join-ack');

      const errP = waitFor(guest, 'room:error');
      guest.emit('room:kick', { targetPlayerId: hostId });
      const err = await errP;
      assert.equal(err.code, 'FORBIDDEN');
    } finally {
      host.disconnect();
      guest.disconnect();
    }
  });
});

// ================================================================
describe('room:transfer-host', () => {
  test('主動轉移房主 → 所有人收到 room:host-changed', async () => {
    const c1 = await connectClient();
    const c2 = await connectClient();
    const roomId = uuid().slice(0, 6).toUpperCase();
    const id1 = uuid(), id2 = uuid();

    try {
      c1.emit('room:create', { roomId, nickname: 'Host', playerId: id1, maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');
      c2.emit('room:join', { roomId, nickname: 'Guest', playerId: id2 });
      await waitFor(c2, 'room:join-ack');

      const hostChangedP = waitFor(c2, 'room:host-changed');
      c1.emit('room:transfer-host', { targetPlayerId: id2 });
      const evt = await hostChangedP;
      assert.equal(evt.newHostId, id2);

      const entry = roomCache.getEntry(roomId);
      assert.equal(entry.room.host_player_id, id2);
    } finally {
      c1.disconnect();
      c2.disconnect();
    }
  });
});

// ================================================================
describe('room:leave', () => {
  test('主動離開 → 其他人收到 room:players-updated（玩家移除）', async () => {
    const c1 = await connectClient();
    const c2 = await connectClient();
    const roomId = uuid().slice(0, 6).toUpperCase();
    const id1 = uuid(), id2 = uuid();

    try {
      c1.emit('room:create', { roomId, nickname: 'Stay', playerId: id1, maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');
      // 等待加入廣播的 players-updated 先到，避免和 leave 廣播混淆
      const joinUpdP2 = waitFor(c1, 'room:players-updated');
      c2.emit('room:join', { roomId, nickname: 'Leave', playerId: id2 });
      await Promise.all([waitFor(c2, 'room:join-ack'), joinUpdP2]);

      const updP = waitFor(c1, 'room:players-updated');
      c2.emit('room:leave');
      const upd = await updP;
      assert.ok(!upd.players.find(p => p.id === id2), '離開者不在清單');
    } finally {
      c1.disconnect();
      c2.disconnect();
    }
  });
});

// ================================================================
describe('disconnect', () => {
  test('玩家斷線 → room:player-offline 廣播（玩家仍在名單）', async () => {
    const c1 = await connectClient();
    const c2 = await connectClient();
    const roomId = uuid().slice(0, 6).toUpperCase();
    const id1 = uuid(), id2 = uuid();

    try {
      c1.emit('room:create', { roomId, nickname: 'Online', playerId: id1, maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');
      c2.emit('room:join', { roomId, nickname: 'WillDrop', playerId: id2 });
      await waitFor(c2, 'room:join-ack');

      const offlineP = waitFor(c1, 'room:player-offline');
      c2.disconnect();
      const evt = await offlineP;
      assert.equal(evt.playerId, id2);

      // 玩家仍在 cache，但 is_online = false
      const p = roomCache.getPlayers(roomId).find(p => p.id === id2);
      assert.ok(p, '玩家應仍在清單');
      assert.equal(p.is_online, false);
    } finally {
      c1.disconnect();
    }
  });

  test('房主斷線 → 30 秒後自動轉移（啟動計時不等待）', async () => {
    const c1 = await connectClient();
    const c2 = await connectClient();
    const roomId = uuid().slice(0, 6).toUpperCase();
    const id1 = uuid(), id2 = uuid();

    try {
      c1.emit('room:create', { roomId, nickname: 'Host', playerId: id1, maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');
      c2.emit('room:join', { roomId, nickname: 'Guest', playerId: id2 });
      await waitFor(c2, 'room:join-ack');

      // 房主斷線（計時器啟動，30s 後轉移，但我們不等）
      c1.disconnect();
      // 等待 c2 收到 room:player-offline
      await waitFor(c2, 'room:player-offline');

      const entry = roomCache.getEntry(roomId);
      // 目前房主仍為 id1（計時未到），確認 cache 狀態正確
      assert.equal(entry.room.host_player_id, id1);
    } finally {
      c2.disconnect();
    }
  });
});

// ================================================================
describe('room:join-ack — gameState', () => {
  test('buildGameState hook 的回傳值出現在 room:join-ack.gameState', async () => {
    // 建立帶有 buildGameState hook 的 namespace
    const gsHttp = http.createServer();
    const gsIo   = new Server(gsHttp, { cors: { origin: '*' } });
    const gsDb   = makeMockDb();

    const gameState = { roundPhase: 'round1', timerRemaining: 50 };
    registerRoomHandlers(gsIo, gsDb, {
      minPlayers:      2,
      canJoinAsPlayer: () => true,
      buildGameState:  (_roomId) => gameState,
    });

    await new Promise(res => gsHttp.listen(0, res));
    const gsPort = gsHttp.address().port;

    const mkC = () => ioc(`http://localhost:${gsPort}`, { transports: ['websocket'], reconnection: false, forceNew: true });
    const c1 = mkC();
    const c2 = mkC();

    try {
      await waitFor(c1, 'connect');
      await waitFor(c2, 'connect');

      const roomId = uuid().slice(0, 6).toUpperCase();
      c1.emit('room:create', { roomId, nickname: 'H', playerId: uuid(), maxPlayers: 4, appId: 'test' });
      await waitFor(c1, 'room:join-ack');

      const ackP = waitFor(c2, 'room:join-ack');
      c2.emit('room:join', { roomId, nickname: 'J', playerId: uuid() });
      const ack = await ackP;

      assert.deepEqual(ack.gameState, gameState);
    } finally {
      c1.disconnect();
      c2.disconnect();
      gsIo.close();
      gsHttp.close();
    }
  });
});

// ================================================================
describe('spectator upgrade (room:spectator-join)', () => {
  test('觀戰者申請升格 → 收到 room:join-ack(player)', async () => {
    const specHttp = http.createServer();
    const specIo   = new Server(specHttp, { cors: { origin: '*' } });
    const specDb   = makeMockDb();

    let canUpgrade = false;
    registerRoomHandlers(specIo, specDb, {
      minPlayers:          2,
      canJoinAsPlayer:     () => false,       // 新人一律觀戰
      spectatorCanUpgrade: () => canUpgrade,  // 由外部控制
      buildGameState:      () => null,
    });

    await new Promise(res => specHttp.listen(0, res));
    const sPort = specHttp.address().port;
    const mkC = () => ioc(`http://localhost:${sPort}`, { transports: ['websocket'], reconnection: false, forceNew: true });

    const host = mkC();
    const spec = mkC();

    try {
      await waitFor(host, 'connect');
      await waitFor(spec, 'connect');

      const roomId = uuid().slice(0, 6).toUpperCase();
      host.emit('room:create', { roomId, nickname: 'Host', playerId: uuid(), maxPlayers: 4, appId: 'test' });
      await waitFor(host, 'room:join-ack');

      spec.emit('room:join', { roomId, nickname: 'Viewer', playerId: uuid() });
      const specAck = await waitFor(spec, 'room:join-ack');
      assert.equal(specAck.type, 'spectator');

      // 開放升格
      canUpgrade = true;
      spec.emit('room:spectator-join');
      const upgradeAck = await waitFor(spec, 'room:join-ack');
      assert.equal(upgradeAck.type, 'player');
    } finally {
      host.disconnect();
      spec.disconnect();
      specIo.close();
      specHttp.close();
    }
  });
});
