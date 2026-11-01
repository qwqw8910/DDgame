// ================================================================
//  server/split-bill/split-bill.integration.test.js
//  分帳系統整合測試（node:test + socket.io-client）
//
//  完全在記憶體中執行（Fake DB + Memory store，不需要 Supabase）。
//  執行：node --test --test-force-exit split-bill/split-bill.integration.test.js
// ================================================================
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http   = require('node:http');
const { Server } = require('socket.io');
const { io: ioc } = require('socket.io-client');
const { registerNamespace } = require('./index');
const { createMemoryStore } = require('./store');

// ── Fake DB：只實作房間模組用到的 rooms / players ──────────────────
function makeFakeDb() {
  const tables = { rooms: [], players: [] };

  function from(name) {
    const rows = tables[name];
    let op = 'select', payload, opts, wantOne = false, wantMaybe = false;
    const filters = [];
    const match = r => filters.every(([c, v]) => r[c] === v);

    const exec = () => {
      switch (op) {
        case 'select': {
          let list = rows.filter(match);
          if (name === 'players') list = [...list].sort((a, b) => a.join_order - b.join_order);
          if (wantOne)   return list[0] ? { data: list[0], error: null } : { data: null, error: { message: 'not found' } };
          if (wantMaybe) return { data: list[0] ?? null, error: null };
          return { data: list, error: null };
        }
        case 'insert': {
          if (rows.some(r => r.id === payload.id)) {
            return { data: null, error: { code: '23505', message: 'duplicate key value' } };
          }
          rows.push({ ...payload });
          return { data: payload, error: null };
        }
        case 'upsert': {
          const i = rows.findIndex(r => r.id === payload.id);
          if (i >= 0) rows[i] = { ...rows[i], ...payload }; else rows.push({ ...payload });
          return { data: rows.find(r => r.id === payload.id), error: null };
        }
        case 'update': {
          const hit = rows.filter(match);
          hit.forEach(r => Object.assign(r, payload));
          return { data: hit[0] ?? null, error: null };
        }
        case 'delete': {
          const keep = rows.filter(r => !match(r));
          rows.length = 0; rows.push(...keep);
          return { data: null, error: null };
        }
      }
    };

    const q = {
      select()      { return q; },
      eq(c, v)      { filters.push([c, v]); return q; },
      order()       { return q; },
      insert(p)     { op = 'insert'; payload = p; return q; },
      update(p)     { op = 'update'; payload = p; return q; },
      upsert(p, o)  { op = 'upsert'; payload = p; opts = o; return q; },
      delete()      { op = 'delete'; return q; },
      single()      { wantOne = true; return q; },
      maybeSingle() { wantMaybe = true; return q; },
      then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
    };
    return q;
  }

  // 房間被刪時模擬 ON DELETE CASCADE 清除 players
  const fromWithCascade = (name) => {
    const q = from(name);
    if (name !== 'rooms') return q;
    const origDelete = q.delete;
    q.delete = () => {
      const r = origDelete();
      const origEq = r.eq;
      r.eq = (c, v) => {
        if (c === 'id') tables.players = tables.players.filter(p => p.room_id !== v);
        return origEq(c, v);
      };
      return r;
    };
    return q;
  };

  return { _tables: tables, from: fromWithCascade };
}

// ── 工具 ─────────────────────────────────────────────────────────
const waitFor = (socket, event, timeout = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`waitFor("${event}") timeout`)), timeout);
  socket.once(event, d => { clearTimeout(timer); resolve(d); });
});

/** 等到「符合條件」的那一次事件（廣播會連自己的動作一起收到，需過濾） */
const waitMatch = (socket, event, pred, timeout = 4000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(event, h); reject(new Error(`waitMatch("${event}") timeout`)); }, timeout);
  const h = d => { if (pred(d)) { clearTimeout(timer); socket.off(event, h); resolve(d); } };
  socket.on(event, h);
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function startServer(db, store, opts = {}) {
  const httpServer = http.createServer();
  const io = new Server(httpServer, { cors: { origin: '*' } });
  registerNamespace(io, db, { store, ...opts });
  await new Promise(r => httpServer.listen(0, r));
  const url = `http://localhost:${httpServer.address().port}/split-bill`;
  const clients = [];

  /** 連線並建立／加入房間，回傳 { socket, ack, state } */
  async function enter({ roomId, nickname, create = false }) {
    const socket = ioc(url, { forceNew: true, transports: ['websocket'] });
    clients.push(socket);
    await waitFor(socket, 'connect');
    const gotAck   = waitFor(socket, 'room:join-ack');
    const gotState = waitFor(socket, 'bill:state');
    const gotErr   = waitFor(socket, 'room:error').then(e => { throw new Error(`room:error ${e.code}`); });
    gotErr.catch(() => {});
    socket.emit(create ? 'room:create' : 'room:join', {
      roomId, nickname,
      playerId: 'ignored-by-server-' + Math.random(),   // 伺服器會以「房號+名稱」覆寫
      maxPlayers: 8, appId: 'split-bill',
    });
    const [ack, state] = await Promise.all([gotAck, gotState]);
    return { socket, ack, state };
  }

  async function close() {
    clients.forEach(c => c.disconnect());
    await io.close();
  }
  return { enter, close, io };
}

const idOf = (state, name) => state.members.find(m => m.name === name)?.id;
const sum = a => a.reduce((x, y) => x + y, 0);

// ================================================================
describe('分帳系統（房間 + 名稱即 Key + DB 持久化）', () => {
  const db = makeFakeDb();
  const store = createMemoryStore();
  let srv;
  const ROOM = 'BILL01';
  let amy, bob, amyId, bobId, carolId, firstExpenseId;

  before(async () => { srv = await startServer(db, store); });
  after(async () => { await srv.close(); });

  test('房主建房 → 自動成為帳務成員，且 playerId 由名稱推導', async () => {
    amy = await srv.enter({ roomId: ROOM, nickname: 'Amy', create: true });
    assert.equal(amy.ack.type, 'player');
    assert.equal(amy.state.members.length, 1);
    assert.equal(amy.state.members[0].name, 'Amy');
    assert.equal(amy.state.members[0].isHost, true);
    assert.equal(amy.state.meMemberId, amy.state.members[0].id);
    assert.equal(db._tables.rooms[0].app_id, 'split-bill');
    amyId = amy.state.meMemberId;
  });

  test('第二人加入；房主收到成員更新', async () => {
    const membersUpdated = waitFor(amy.socket, 'bill:members');
    bob = await srv.enter({ roomId: ROOM, nickname: 'Bob' });
    assert.equal(bob.state.members.length, 2);
    bobId = bob.state.meMemberId;
    const upd = await membersUpdated;
    assert.equal(upd.members.length, 2);
  });

  test('新增虛擬成員 Carol', async () => {
    const changed = waitFor(bob.socket, 'bill:members');
    amy.socket.emit('bill:member-add-virtual', { name: 'Carol' });
    const { members } = await changed;
    const carol = members.find(m => m.name === 'Carol');
    assert.equal(carol.isVirtual, true);
    carolId = carol.id;
  });

  test('新增支出：Amy 墊 100 三人均分 → 34/33/33，Bob、Carol 各欠 Amy，全房即時同步', async () => {
    const seenByBob = waitFor(bob.socket, 'bill:expense-changed');
    const transfersUpdated = waitFor(bob.socket, 'bill:transfers-updated');
    amy.socket.emit('bill:expense-add', {
      title: '晚餐', amount: 100, payerId: amyId, splitType: 'equal',
      participants: [{ memberId: bobId }, { memberId: carolId }, { memberId: amyId }],
    });
    const { expense, action } = await seenByBob;
    assert.equal(action, 'add');
    assert.equal(sum(expense.splits.map(s => s.amount)), 100);
    assert.equal(expense.splits.find(s => s.memberId === amyId).amount, 34);   // 付款人吸收零頭
    firstExpenseId = expense.id;

    const { transfers } = await transfersUpdated;
    assert.equal(transfers.length, 2);
    assert.ok(transfers.every(t => t.to === amyId && t.amount === 33));
    assert.deepEqual(transfers.map(t => t.from).sort(), [bobId, carolId].sort());
    assert.deepEqual(transfers[0].details, [{ expenseId: expense.id, amount: 33 }]);
    assert.equal(store._t.expenses.length, 1, '已寫入 DB');
  });

  test('分攤金額不信任前端：加總不符會被擋下，且不寫 DB', async () => {
    const err = waitFor(amy.socket, 'bill:error');
    amy.socket.emit('bill:expense-add', {
      title: '壞帳', amount: 100, payerId: amyId, splitType: 'exact',
      participants: [{ memberId: amyId, value: 10 }, { memberId: bobId, value: 10 }],
    });
    assert.equal((await err).code, 'INVALID_SPLIT_SUM');
    assert.equal(store._t.expenses.length, 1);
  });

  test('換手機：用「相同名稱（大小寫不同）」進房 → 視為同一人，不是 NICKNAME_TAKEN', async () => {
    const amyPhone = await srv.enter({ roomId: ROOM, nickname: 'amy' });
    assert.equal(amyPhone.ack.type, 'reconnect');
    assert.equal(amyPhone.ack.myPlayerId, amy.ack.myPlayerId);
    assert.equal(amyPhone.state.meMemberId, amyId);
    assert.equal(amyPhone.state.members.length, 3, '沒有產生新成員');
    assert.equal(amyPhone.state.expenses.length, 1, '看得到原本的帳');
    assert.equal(amyPhone.state.expenses[0].id, firstExpenseId);
  });

  test('非建立者不能改別人的支出；房主可以', async () => {
    const err = waitFor(bob.socket, 'bill:error');
    bob.socket.emit('bill:expense-update', {
      expenseId: firstExpenseId, title: '偷改', amount: 100, payerId: amyId,
      participants: [{ memberId: amyId }, { memberId: bobId }],
    });
    assert.equal((await err).code, 'FORBIDDEN');

    // Bob 新增的支出，房主 Amy 可編輯
    const added = waitMatch(amy.socket, 'bill:expense-changed', d => d.expense.title === '計程車');
    bob.socket.emit('bill:expense-add', {
      title: '計程車', amount: 90, payerId: bobId,
      participants: [{ memberId: amyId }, { memberId: bobId }, { memberId: carolId }],
    });
    const { expense } = await added;
    const updated = waitMatch(bob.socket, 'bill:expense-changed', d => d.action === 'update');
    amy.socket.emit('bill:expense-update', {
      expenseId: expense.id, baseUpdatedAt: expense.updatedAt,
      title: '計程車(改)', amount: 90, payerId: bobId,
      participants: [{ memberId: amyId }, { memberId: bobId }],
    });
    const u = await updated;
    assert.equal(u.action, 'update');
    assert.deepEqual(u.expense.splits.map(s => s.amount), [45, 45]);
  });

  test('樂觀鎖：用過期的 baseUpdatedAt 編輯會衝突', async () => {
    const err = waitFor(amy.socket, 'bill:error');
    amy.socket.emit('bill:expense-update', {
      expenseId: firstExpenseId, baseUpdatedAt: '1999-01-01T00:00:00.000Z',
      title: '晚餐', amount: 100, payerId: amyId,
      participants: [{ memberId: amyId }, { memberId: bobId }],
    });
    assert.equal((await err).code, 'EXPENSE_CONFLICT');
  });

  test('刪除支出後「誰給誰」重算', async () => {
    const deleted = waitMatch(bob.socket, 'bill:expense-changed', d => d.action === 'delete');
    const recomputed = waitMatch(bob.socket, 'bill:transfers-updated', () => true);
    amy.socket.emit('bill:expense-delete', { expenseId: firstExpenseId });
    await deleted;
    const { transfers } = await recomputed;
    // 刪掉晚餐後只剩 Bob 墊的計程車(Amy 欠 45)；晚餐的明細不再出現
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].from, amyId);
    assert.equal(transfers[0].to, bobId);
    assert.ok(transfers[0].details.every(d => d.expenseId !== firstExpenseId));
    assert.ok(store._t.expenses.find(e => e.id === firstExpenseId).deletedAt, '軟刪除，資料仍在 DB');

    // 復原
    const restored = waitMatch(bob.socket, 'bill:expense-changed', d => d.action === 'restore');
    amy.socket.emit('bill:expense-restore', { expenseId: firstExpenseId });
    assert.equal((await restored).expense.deletedAt, null);
    assert.equal(store._t.expenses.find(e => e.id === firstExpenseId).deletedAt, null);
  });

  test('離開房間：帳目保留，成員標記為已離開；用同名重新加入即復原', async () => {
    const left = waitFor(amy.socket, 'bill:members');
    bob.socket.emit('room:leave');
    const { members } = await left;
    assert.ok(members.find(m => m.id === bobId).leftAt, '標記已離開');
    assert.equal(members.length, 3, '成員未被刪除');

    const bob2 = await srv.enter({ roomId: ROOM, nickname: 'BOB' });
    assert.equal(bob2.state.meMemberId, bobId, '同名 → 接回原成員');
    assert.equal(bob2.state.members.find(m => m.id === bobId).leftAt, null);
    assert.ok(bob2.state.expenses.length >= 2, '歷史帳目都在');
    bob = bob2;
  });

  test('離開時已離開的成員不能再被指定為新支出的分攤者', async () => {
    const left = waitFor(amy.socket, 'bill:members');
    bob.socket.emit('room:leave');
    await left;
    const err = waitFor(amy.socket, 'bill:error');
    amy.socket.emit('bill:expense-add', {
      title: 'x', amount: 10, payerId: amyId, participants: [{ memberId: amyId }, { memberId: bobId }],
    });
    assert.equal((await err).code, 'MEMBER_NOT_FOUND');
  });
});

// ================================================================
describe('長期保存：server 重啟後資料仍在 DB', () => {
  test('同一個 DB 換一個全新的 server → 用名稱進房即可還原全部帳務', async () => {
    const db = makeFakeDb();
    const store = createMemoryStore();
    const ROOM = 'BILL02';

    let srv = await startServer(db, store);
    const amy = await srv.enter({ roomId: ROOM, nickname: 'Amy', create: true });
    const amyId = amy.state.meMemberId;
    const added = waitFor(amy.socket, 'bill:expense-changed');
    amy.socket.emit('bill:expense-add', {
      title: '住宿', amount: 3000, payerId: amyId, participants: [{ memberId: amyId }],
    });
    await added;
    await sleep(50);
    await srv.close();                          // 模擬 server 重啟：記憶體快取全部消失

    srv = await startServer(db, store);         // 全新的 process 狀態，只剩 DB
    const again = await srv.enter({ roomId: ROOM, nickname: 'amy' });
    assert.equal(again.state.meMemberId, amyId);
    assert.equal(again.state.expenses.length, 1);
    assert.equal(again.state.expenses[0].title, '住宿');
    assert.equal(again.state.expenses[0].amount, 3000);
    assert.ok(again.state.activities.length >= 1, '活動紀錄也還在');
    await srv.close();
  });
});

// ================================================================
describe('房主刪除房間', () => {
  test('只有房主能刪；刪除後房間與帳務資料都消失', async () => {
    const db = makeFakeDb();
    const store = createMemoryStore();
    const srv = await startServer(db, store);
    const ROOM = 'BILL03';

    const amy = await srv.enter({ roomId: ROOM, nickname: 'Amy', create: true });
    const bob = await srv.enter({ roomId: ROOM, nickname: 'Bob' });

    const err = waitFor(bob.socket, 'bill:error');
    bob.socket.emit('bill:room-delete');
    assert.equal((await err).code, 'FORBIDDEN');
    assert.equal(db._tables.rooms.length, 1);

    const gone = waitFor(bob.socket, 'bill:room-deleted');
    amy.socket.emit('bill:room-delete');
    await gone;
    await sleep(50);
    assert.equal(db._tables.rooms.length, 0);
    assert.equal(store._t.members.length, 0);

    const ghost = ioc(`http://localhost:${srv.io.httpServer.address().port}/split-bill`, { forceNew: true });
    await waitFor(ghost, 'connect');
    const e = waitFor(ghost, 'room:error');
    ghost.emit('room:join', { roomId: ROOM, nickname: 'Amy', playerId: 'x' });
    assert.equal((await e).code, 'ROOM_NOT_FOUND');
    ghost.disconnect();
    await srv.close();
  });
});

// ================================================================
describe('外幣與群組匯率', () => {
  test('首次出現外幣自動帶入匯率；改匯率整個群組一起變；換結算幣別會重抓', async () => {
    const db = makeFakeDb();
    const store = createMemoryStore();
    const live = { 'JPY>TWD': 0.2, 'TWD>JPY': 5, 'JPY>USD': 0.007 };
    let calls = 0;
    const fetchRate = async (from, to) => {
      calls++;
      if (live[`${from}>${to}`] == null) throw new Error('no rate');
      return live[`${from}>${to}`];
    };
    const srv = await startServer(db, store, { fetchRate });
    const ROOM = 'BILL04';

    const amy = await srv.enter({ roomId: ROOM, nickname: 'Amy', create: true });
    const bob = await srv.enter({ roomId: ROOM, nickname: 'Bob' });
    const amyId = amy.state.meMemberId;
    const bobId = bob.state.meMemberId;
    assert.equal(amy.state.baseCurrency, 'TWD');

    // 1) 日幣 3000 兩人均分：自動抓 0.2 → Bob 欠 Amy 300
    const settings = waitFor(bob.socket, 'bill:settings');
    const transfers = waitMatch(bob.socket, 'bill:transfers-updated', d => d.transfers.length === 1);
    amy.socket.emit('bill:expense-add', {
      title: '吃飯', amount: 3000, currency: 'JPY', payerId: amyId,
      participants: [{ memberId: amyId }, { memberId: bobId }],
    });
    assert.equal((await settings).rates.JPY.rate, 0.2);
    assert.equal((await settings).rates.JPY.source, 'auto');
    assert.equal((await transfers).transfers[0].amount, 300);
    assert.equal(calls, 1);

    // 2) 同幣別再記一筆不會再抓
    const second = waitFor(bob.socket, 'bill:expense-changed');
    amy.socket.emit('bill:expense-add', {
      title: '車票', amount: 1000, currency: 'JPY', payerId: amyId,
      participants: [{ memberId: amyId }, { memberId: bobId }],
    });
    await second;
    assert.equal(calls, 1);

    // 3) 任何人改匯率：兩筆日幣支出一起重算，來源變 manual
    const manual = waitMatch(amy.socket, 'bill:settings', d => d.rates.JPY.source === 'manual');
    const recomputed = waitMatch(amy.socket, 'bill:transfers-updated', () => true);
    bob.socket.emit('bill:rate-set', { currency: 'JPY', rate: 0.25 });
    assert.equal((await manual).rates.JPY.rate, 0.25);
    assert.equal((await recomputed).transfers[0].amount, 500);        // (3000+1000)/2 × 0.25
    assert.equal(store._t.expenses.length, 2);

    // 4) 非法匯率會被擋
    const err = waitFor(bob.socket, 'bill:error');
    bob.socket.emit('bill:rate-set', { currency: 'JPY', rate: -1 });
    assert.equal((await err).code, 'INVALID_RATE');

    // 5) 抓不到匯率時，支出不會被寫入，並提示手動輸入
    const err2 = waitFor(amy.socket, 'bill:error');
    amy.socket.emit('bill:expense-add', {
      title: '歐洲', amount: 100, currency: 'EUR', payerId: amyId, participants: [{ memberId: amyId }],
    });
    assert.equal((await err2).code, 'RATE_UNAVAILABLE');
    assert.equal(store._t.expenses.length, 2);

    // 6) 只有房主能換結算幣別；換成 USD 後舊匯率清空並重抓 JPY→USD
    const forbidden = waitFor(bob.socket, 'bill:error');
    bob.socket.emit('bill:base-currency-set', { currency: 'USD' });
    assert.equal((await forbidden).code, 'FORBIDDEN');

    const changed = waitMatch(bob.socket, 'bill:settings', d => d.baseCurrency === 'USD');
    amy.socket.emit('bill:base-currency-set', { currency: 'USD' });
    const s = await changed;
    assert.deepEqual(Object.keys(s.rates), ['JPY']);
    assert.equal(s.rates.JPY.rate, 0.007);
    assert.equal(s.rates.JPY.source, 'auto', '換幣別後回到系統匯率');

    // 7) 重新連線仍是 USD 與新匯率（來自 DB）
    const again = await srv.enter({ roomId: ROOM, nickname: 'amy' });
    assert.equal(again.state.baseCurrency, 'USD');
    assert.equal(again.state.rates.JPY.rate, 0.007);
    await srv.close();
  });
});
