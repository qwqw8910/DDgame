// ================================================================
//  server/room/RoomCache.test.js
//  RoomCache 單元測試（node:test + node:assert）
//
//  執行：node --test server/room/RoomCache.test.js
// ================================================================
'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { RoomCache } = require('./RoomCache');

// ── Mock DB（不需要真實 Supabase）────────────────────────────────
function makeMockDb(roomOverride = {}, playersOverride = []) {
  return {
    from(table) {
      return {
        select: () => this,
        eq:     () => this,
        order:  () => this,
        maybeSingle: async () => ({
          data: table === 'rooms' ? { id: 'R001', status: 'waiting', host_player_id: 'P1', max_players: 6, app_id: 'test', ...roomOverride } : null,
        }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: {}, error: null }) }) }) }),
      };
    },
    _rooms: roomOverride,
    _players: playersOverride,
  };
}

// ── 測試資料 ─────────────────────────────────────────────────────
const ROOM = { id: 'R001', host_player_id: 'P1', max_players: 6, status: 'waiting', app_id: 'test' };
const P1   = { id: 'P1', nickname: 'Alice', is_online: true,  join_order: 0, score: 0 };
const P2   = { id: 'P2', nickname: 'Bob',   is_online: true,  join_order: 1, score: 0 };

describe('RoomCache — 初始化與取得', () => {
  test('init 後 getEntry 應返回 entry', () => {
    const db    = makeMockDb();
    const cache = new RoomCache(db);
    cache.init('R001', { room: ROOM, players: [P1, P2] });

    const entry = cache.getEntry('R001');
    assert.ok(entry, 'entry 不應為 null');
    assert.equal(entry.room.id, 'R001');
    assert.equal(entry.players.length, 2);
    assert.deepEqual(entry.spectators, []);
  });

  test('未初始化的 roomId → getEntry 返回 null', () => {
    const db    = makeMockDb();
    const cache = new RoomCache(db);
    assert.equal(cache.getEntry('UNKNOWN'), null);
  });

  test('init 應淺拷貝 players，不共享陣列參考', () => {
    const db    = makeMockDb();
    const cache = new RoomCache(db);
    const players = [{ ...P1 }];
    cache.init('R001', { room: ROOM, players });

    players.push({ id: 'P3' }); // 修改原始陣列
    assert.equal(cache.getPlayers('R001').length, 1); // cache 不應受影響
  });
});

describe('RoomCache — 玩家操作', () => {
  let cache;
  beforeEach(() => {
    const db = makeMockDb();
    cache = new RoomCache(db);
    cache.init('R001', { room: ROOM, players: [{ ...P1 }, { ...P2 }] });
  });

  test('addPlayer — 新增全新玩家', () => {
    const P3 = { id: 'P3', nickname: 'Carol', is_online: true, join_order: 2 };
    cache.addPlayer('R001', P3);
    assert.equal(cache.getPlayers('R001').length, 3);
    assert.ok(cache.getPlayers('R001').find(p => p.id === 'P3'));
  });

  test('addPlayer — 已存在的 ID 應 merge', () => {
    cache.addPlayer('R001', { id: 'P1', score: 10 });
    const p = cache.getPlayers('R001').find(p => p.id === 'P1');
    assert.equal(p.score, 10);
    assert.equal(p.nickname, 'Alice'); // 原有欄位保留
  });

  test('updatePlayer — 更新單一欄位', () => {
    cache.updatePlayer('R001', 'P2', { is_ready: true });
    const p = cache.getPlayers('R001').find(p => p.id === 'P2');
    assert.equal(p.is_ready, true);
    assert.equal(p.nickname, 'Bob');
  });

  test('removePlayer — 移除後 getPlayers 不含該玩家', () => {
    cache.removePlayer('R001', 'P1');
    const players = cache.getPlayers('R001');
    assert.equal(players.length, 1);
    assert.ok(!players.find(p => p.id === 'P1'));
  });

  test('setPlayerOnline — 設定離線', () => {
    cache.setPlayerOnline('R001', 'P1', false);
    const p = cache.getPlayers('R001').find(p => p.id === 'P1');
    assert.equal(p.is_online, false);
  });

  test('getPlayers — 回傳陣列，未知 roomId 回傳空陣列', () => {
    assert.deepEqual(cache.getPlayers('UNKNOWN'), []);
  });
});

describe('RoomCache — 觀戰者操作', () => {
  let cache;
  beforeEach(() => {
    const db = makeMockDb();
    cache = new RoomCache(db);
    cache.init('R001', { room: ROOM, players: [{ ...P1 }] });
  });

  test('addSpectator → getSpectators 含此人', () => {
    cache.addSpectator('R001', { id: 'S1', nickname: 'Viewer' });
    assert.equal(cache.getSpectators('R001').length, 1);
  });

  test('addSpectator 同 ID 應 replace', () => {
    cache.addSpectator('R001', { id: 'S1', nickname: 'Old' });
    cache.addSpectator('R001', { id: 'S1', nickname: 'New' });
    assert.equal(cache.getSpectators('R001').length, 1);
    assert.equal(cache.getSpectators('R001')[0].nickname, 'New');
  });

  test('removeSpectator → 移除後清單為空', () => {
    cache.addSpectator('R001', { id: 'S1', nickname: 'Viewer' });
    cache.removeSpectator('R001', 'S1');
    assert.equal(cache.getSpectators('R001').length, 0);
  });

  test('getSpectators 未知 roomId 回傳空陣列', () => {
    assert.deepEqual(cache.getSpectators('UNKNOWN'), []);
  });
});

describe('RoomCache — 房間資料操作', () => {
  let cache;
  beforeEach(() => {
    const db = makeMockDb();
    cache = new RoomCache(db);
    cache.init('R001', { room: { ...ROOM }, players: [{ ...P1 }] });
  });

  test('updateRoom — 合併更新', () => {
    cache.updateRoom('R001', { status: 'playing' });
    assert.equal(cache.getEntry('R001').room.status, 'playing');
    assert.equal(cache.getEntry('R001').room.id, 'R001'); // 其他欄位保留
  });

  test('updateRoom — 未知房間不報錯', () => {
    assert.doesNotThrow(() => cache.updateRoom('UNKNOWN', { status: 'playing' }));
  });
});

describe('RoomCache — 遊戲資料 (setGameData / getGameData)', () => {
  test('setGameData → getGameData 返回相同物件', () => {
    const db = makeMockDb();
    const cache = new RoomCache(db);
    cache.init('R001', { room: ROOM, players: [] });

    const gameData = { roundPhase: 'round1', timerRemaining: 45 };
    cache.setGameData('R001', gameData);
    assert.deepEqual(cache.getGameData('R001'), gameData);
  });

  test('getGameData 未知 roomId 返回 null', () => {
    const db = makeMockDb();
    const cache = new RoomCache(db);
    assert.equal(cache.getGameData('UNKNOWN'), null);
  });
});

describe('RoomCache — delete', () => {
  test('delete 後 getEntry 為 null', () => {
    const db = makeMockDb();
    const cache = new RoomCache(db);
    cache.init('R001', { room: ROOM, players: [P1] });
    cache.delete('R001');
    assert.equal(cache.getEntry('R001'), null);
  });
});

describe('RoomCache — DB fallback (async get)', () => {
  test('cache miss → 從 DB 重建 entry', async () => {
    // 建立可以回應 DB 查詢的 mock
    const mockDb = {
      from(table) {
        const self = this;
        return {
          select: () => self._q(table),
          _q(table) {
            return {
              eq:   () => this,
              order: () => this,
              maybeSingle: async () =>
                table === 'rooms'
                  ? { data: { id: 'R002', status: 'waiting', host_player_id: 'P9', max_players: 4, app_id: '' } }
                  : { data: null },
              // 用於 players 查詢
              then: undefined,
            };
          },
        };
      },
    };

    // 重建 mock 讓 players 查詢也能工作
    const db2 = {
      from(table) {
        if (table === 'rooms') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: 'R002', status: 'waiting', host_player_id: 'P9', max_players: 4, app_id: '' },
                }),
              }),
            }),
          };
        }
        if (table === 'players') {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  data: [{ id: 'P9', nickname: 'Ghost', join_order: 0, is_online: false, score: 0 }],
                  error: null,
                  // Supabase 回傳的是 async，這裡用 thenable 模擬
                  then(resolve) {
                    resolve({ data: [{ id: 'P9', nickname: 'Ghost', join_order: 0, is_online: false, score: 0 }], error: null });
                    return this;
                  },
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      },
    };

    // 直接使用已內建 DB fallback 的 get()
    // 注意：Supabase client 回傳 promise，這裡用更精確的 mock
    const preciseDb = {
      from(table) {
        if (table === 'rooms') {
          return {
            select: (_cols) => ({
              eq: (_col, _val) => ({
                maybeSingle: () => Promise.resolve({
                  data: { id: 'R002', status: 'waiting', host_player_id: 'P9', max_players: 4, app_id: '' },
                }),
              }),
            }),
          };
        }
        // players
        return {
          select: (_cols) => ({
            eq: (_col, _val) => ({
              order: (_col) => Promise.resolve({
                data: [{ id: 'P9', nickname: 'Ghost', join_order: 0, is_online: false, score: 0 }],
                error: null,
              }),
            }),
          }),
        };
      },
    };

    const cache = new RoomCache(preciseDb);
    const entry = await cache.get('R002');

    assert.ok(entry, 'DB fallback 應重建 entry');
    assert.equal(entry.room.id, 'R002');
    assert.equal(entry.players.length, 1);
    assert.equal(entry.players[0].nickname, 'Ghost');
  });

  test('DB fallback — 房間為 archived → 返回 null', async () => {
    const preciseDb = {
      from(_table) {
        return {
          select: (_cols) => ({
            eq: (_col, _val) => ({
              maybeSingle: () => Promise.resolve({
                data: { id: 'R_ARC', status: 'archived', host_player_id: 'P1', max_players: 4, app_id: '' },
              }),
            }),
          }),
        };
      },
    };

    const cache = new RoomCache(preciseDb);
    const entry = await cache.get('R_ARC');
    assert.equal(entry, null, 'archived 房間應返回 null');
  });

  test('DB fallback — 房間不存在 → 返回 null', async () => {
    const preciseDb = {
      from(_table) {
        return {
          select: (_cols) => ({
            eq: (_col, _val) => ({
              maybeSingle: () => Promise.resolve({ data: null }),
            }),
          }),
        };
      },
    };

    const cache = new RoomCache(preciseDb);
    const entry = await cache.get('R_MISSING');
    assert.equal(entry, null);
  });
});

describe('RoomCache — 封存計時器 (_checkAllOffline)', () => {
  test('所有玩家離線 → 觸發封存計時（不等待，只確認 timer 被設置）', (t, done) => {
    let archiveCalled = false;
    const db = {
      from(_table) {
        return {
          update: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      },
    };

    const cache = new RoomCache(db);
    // 將封存超時改為極短時間（1ms）方便測試
    const origTimeout = global.ARCHIVE_TIMEOUT_MS;
    cache._ARCHIVE_TIMEOUT_MS = 1; // 無法外部注入，跳過實際觸發

    cache.init('R001', { room: ROOM, players: [{ ...P1, is_online: true }] });
    cache.setPlayerOnline('R001', 'P1', false);

    // 等待一個 tick 讓計時器被設置
    setImmediate(() => {
      const entry = cache._cache['R001'];
      // 計時器存在表示封存流程已啟動
      assert.ok(entry._archiveTimer !== null, '_archiveTimer 應被設置');
      // 清除計時器避免測試後續副作用
      clearTimeout(entry._archiveTimer);
      entry._archiveTimer = null;
      done();
    });
  });
});
