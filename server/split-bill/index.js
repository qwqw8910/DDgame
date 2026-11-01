'use strict';

// ================================================================
//  分帳系統 — Socket.io namespace `/split-bill`
//
//  - 房間管理（建立／加入／重連／踢人／轉移房主）全部交給統一房間模組。
//  - 身分 = 房間內名稱：playerId 由「房號 + 名稱」推導（見 logic.memberPlayerId），
//    同名者換裝置進來會被當成同一人重連。前端須以 room:join-ack 的 myPlayerId 為準。
//  - 帳務資料以 DB 為唯一真實來源；記憶體只是快取（roomCache.gameData），
//    每次變更「先寫 DB，成功後才更新快取並廣播」。
//  - 房間永不封存：全員離線逾時只釋放記憶體，之後可由 DB 重建。
//
//  Client → Server（`bill:*`）：
//    bill:state-request
//    bill:expense-add     { title, amount, currency?, category?, note?, paidAt?,
//                           payerId | payers:[{memberId,amount}],
//                           splitType?, participants:[{memberId, value?}] }
//    bill:expense-update  { expenseId, baseUpdatedAt?, ...同 add（整筆覆寫） }
//    bill:expense-delete  { expenseId }
//    bill:expense-restore { expenseId }
//    bill:member-add-virtual { name }（僅房主；之後有人以同名加入，就會接手這個成員的所有帳目）
//    bill:rate-set        { currency, rate }（任何成員；整個帳本共用，改了全部換算跟著變）
//    bill:rate-refresh    { currency }（重新抓取最新匯率，覆蓋手動值）
//    bill:base-currency-set { currency }（僅房主；結算幣別，會清空既有匯率並重新抓取）
//    bill:room-delete     （僅房主）
//    bill:room-rename     { name }（僅房主；帳本名稱，最多 30 字）
//
//  Server → Client：
//    bill:state, bill:members, bill:expense-changed, bill:settings { baseCurrency, rates },
//    bill:transfers-updated { transfers, missingRates }, bill:activity,
//    bill:room-deleted, bill:room-renamed, bill:error
// ================================================================

const crypto = require('node:crypto');
const { registerRoomHandlers } = require('../room');
const { createSupabaseStore } = require('./store');
const L = require('./logic');

const APP_ID = 'split-bill';
const NAMESPACE = '/split-bill';
const ACTIVITY_CAP = 200;

const EV = {
  STATE_REQUEST:       'bill:state-request',
  EXPENSE_ADD:         'bill:expense-add',
  EXPENSE_UPDATE:      'bill:expense-update',
  EXPENSE_DELETE:      'bill:expense-delete',
  EXPENSE_RESTORE:     'bill:expense-restore',
  MEMBER_ADD_VIRTUAL:  'bill:member-add-virtual',
  RATE_SET:            'bill:rate-set',
  RATE_REFRESH:        'bill:rate-refresh',
  BASE_CURRENCY_SET:   'bill:base-currency-set',
  ROOM_DELETE:         'bill:room-delete',
  ROOM_RENAME:         'bill:room-rename',

  STATE:               'bill:state',
  MEMBERS:             'bill:members',
  EXPENSE_CHANGED:     'bill:expense-changed',
  SETTINGS:            'bill:settings',
  TRANSFERS_UPDATED:   'bill:transfers-updated',
  ACTIVITY:            'bill:activity',
  ROOM_DELETED:        'bill:room-deleted',
  ROOM_RENAMED:        'bill:room-renamed',
  ERROR:               'bill:error',
};

const nowIso = () => new Date().toISOString();

/** 預設匯率來源：免費、免金鑰。回傳「1 單位 from = ? 單位 to」 */
async function fetchLiveRate(from, to) {
  const res = await fetch(`https://open.er-api.com/v6/latest/${from}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`rate API ${res.status}`);
  const rate = (await res.json())?.rates?.[to];
  if (typeof rate !== 'number') throw new Error(`rate API: no ${from}->${to}`);
  return rate;
}

/**
 * @param {import('socket.io').Server} io
 * @param {object} db            Supabase client（service_role）
 * @param {object} [opts]
 * @param {object} [opts.store]  資料存取層，預設 Supabase；測試可注入 createMemoryStore()
 * @param {number} [opts.idleMs] 全員離線多久後釋放記憶體快取，預設 30 分鐘
 * @param {(from:string,to:string)=>Promise<number>} [opts.fetchRate] 匯率來源，測試可注入
 */
function registerNamespace(io, db, opts = {}) {
  const store = opts.store ?? createSupabaseStore(db);
  const fetchRate = opts.fetchRate ?? fetchLiveRate;
  const ns = io.of(NAMESPACE);

  // ── 每個房間的操作序列化，避免兩人同時寫入造成快取與 DB 不一致 ─────
  const locks = new Map();
  function withLock(roomId, fn) {
    const prev = locks.get(roomId) ?? Promise.resolve();
    const run  = prev.then(fn);
    const tail = run.catch(() => {});
    locks.set(roomId, tail);
    tail.then(() => { if (locks.get(roomId) === tail) locks.delete(roomId); });
    return run;
  }

  // ── 取得（必要時由 DB 載入）房間帳務狀態 ──────────────────────────
  async function getState(roomId) {
    const entry = await roomCache.get(roomId);
    if (!entry) return null;
    if (!entry.gameData) {
      const data = await store.loadAll(roomId);
      data.members.forEach(m => { m.playerId = L.memberPlayerId(roomId, m.name); });
      roomCache.setGameData(roomId, data);
    }
    return entry.gameData;
  }

  const isHost = (roomId, me) =>
    roomCache.getEntry(roomId)?.room?.host_player_id === me.playerId;

  const activeMember = (state, id) => {
    const m = state.members.find(x => x.id === id);
    if (!m || m.leftAt) throw new L.BillError('MEMBER_NOT_FOUND', '找不到成員，或該成員已離開');
    return m;
  };

  // ── 輸出給前端的形狀 ───────────────────────────────────────────
  function wireMembers(roomId, state) {
    const online = new Map(roomCache.getPlayers(roomId).map(p => [p.id, !!p.is_online]));
    return state.members.map(m => ({
      id: m.id, name: m.name, isVirtual: m.isVirtual, leftAt: m.leftAt,
      isHost: isHost(roomId, m), online: online.get(m.playerId) ?? false,
    }));
  }

  const transfersOf = (state) => L.computeDebts({
    expenses: state.expenses, baseCurrency: state.baseCurrency, rates: state.rates,
  });
  const settingsOf = (state) => ({ baseCurrency: state.baseCurrency, rates: state.rates });

  function snapshot(roomId, state, me) {
    return {
      roomName:    state.roomName ?? '',
      meMemberId:  me?.id ?? null,
      members:     wireMembers(roomId, state),
      expenses:    state.expenses,
      activities:  state.activities,
      ...settingsOf(state),
      ...transfersOf(state),
    };
  }

  const broadcast = (roomId, event, data) => ns.to(roomId).emit(event, data);
  const broadcastTransfers = (roomId, state) => broadcast(roomId, EV.TRANSFERS_UPDATED, transfersOf(state));
  const broadcastSettings = (roomId, state) => {
    broadcast(roomId, EV.SETTINGS, settingsOf(state));
    broadcastTransfers(roomId, state);
  };

  /** 寫入一筆匯率（DB 成功後才更新快取） */
  async function putRate(roomId, state, currency, rate, source) {
    const entry = { rate: L.validateRate(rate), source, updatedAt: nowIso() };
    await store.saveRate(roomId, { currency, ...entry });
    state.rates = { ...state.rates, [currency]: entry };
    return entry;
  }

  /** 自動抓取並寫入；失敗時丟出可讀的錯誤 */
  async function autoRate(roomId, state, currency) {
    let live;
    try { live = await fetchRate(currency, state.baseCurrency); }
    catch (err) {
      console.warn(`[SplitBill] 抓取 ${currency}→${state.baseCurrency} 匯率失敗：${err.message}`);
      throw new L.BillError('RATE_UNAVAILABLE',
        `抓不到 ${currency} 的匯率，請先到「設定」手動輸入 ${currency} → ${state.baseCurrency} 的匯率`);
    }
    return putRate(roomId, state, currency, live, 'auto');
  }

  /** 外幣第一次出現時帶入匯率；已有匯率（含手動值）不會被覆蓋。回傳是否有新增 */
  async function ensureRate(roomId, state, currency) {
    if (currency === state.baseCurrency || state.rates[currency]) return false;
    await autoRate(roomId, state, currency);
    return true;
  }

  async function logActivity(roomId, state, me, action, entityType, entityId, before, after) {
    const saved = await store.insertActivity({
      roomId, actor: me.id, action, entityType, entityId, before: before ?? null, after: after ?? null,
    });
    state.activities.push(saved);
    if (state.activities.length > ACTIVITY_CAP) state.activities.shift();
    broadcast(roomId, EV.ACTIVITY, { activity: saved });
  }

  // ── 輸入驗證 ───────────────────────────────────────────────────
  const str = (v, max, label, { required = false } = {}) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (required && !s) throw new L.BillError('INVALID_INPUT', `${label}不可為空`);
    if ([...s].length > max) throw new L.BillError('INVALID_INPUT', `${label}最多 ${max} 個字`);
    return s;
  };

  const currencyOf = v => {
    const c = String(v ?? 'TWD').toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) throw new L.BillError('INVALID_INPUT', '幣別格式錯誤');
    return c;
  };

  const dateOf = (v, fallback) => {
    if (v == null || v === '') return fallback;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new L.BillError('INVALID_INPUT', '日期格式錯誤');
    return d.toISOString();
  };

  /** 將 add / update 的 payload 驗證並算出完整支出內容（分攤金額一律由後端計算） */
  function buildExpenseFields(state, p) {
    const title    = str(p.title, 100, '標題', { required: true });
    const note     = str(p.note, 500, '備註');
    const category = str(p.category ?? 'other', 20, '分類') || 'other';
    const currency = currencyOf(p.currency);
    const amount   = p.amount;
    L.assertAmount(amount);

    const payersIn = Array.isArray(p.payers) ? p.payers
      : p.payerId ? [{ memberId: p.payerId, amount }] : [];
    const payers = L.validatePayers(amount, payersIn);
    payers.forEach(x => activeMember(state, x.memberId));

    const participants = Array.isArray(p.participants) ? p.participants : [];
    participants.forEach(x => activeMember(state, x?.memberId));
    // 付款人排在前面：除不盡的零頭優先由付款人吸收
    const payerIds = new Set(payers.map(x => x.memberId));
    const ordered = [...participants].sort(
      (a, b) => Number(payerIds.has(b.memberId)) - Number(payerIds.has(a.memberId))
    );
    const splitType = p.splitType ?? 'equal';
    const splits = L.computeSplits(amount, splitType, ordered);

    return { title, note, category, currency, amount, payers, splits, splitType };
  }

  const canEdit = (roomId, me, createdBy) => me.id === createdBy || isHost(roomId, me);
  const forbidden = () => new L.BillError('FORBIDDEN', '只有建立者或房主可以這麼做');

  // ── 註冊事件的包裝：驗證身分 → 上鎖 → 載入狀態 → 執行 → 統一回報錯誤 ──
  function on(socket, event, fn) {
    socket.on(event, (payload) => {
      const { roomId, playerId } = socket.data ?? {};
      if (!roomId || !playerId) {
        return socket.emit(EV.ERROR, { code: 'NOT_IN_ROOM', message: '尚未加入房間' });
      }
      withLock(roomId, async () => {
        const state = await getState(roomId);
        if (!state) throw new L.BillError('ROOM_NOT_FOUND', '找不到房間');
        const me = state.members.find(m => m.playerId === playerId);
        if (!me) throw new L.BillError('NOT_IN_ROOM', '你不是這個房間的成員');
        await fn({ socket, roomId, state, me, p: payload ?? {} });
      }).catch((err) => {
        if (!(err instanceof L.BillError)) console.error(`[SplitBill:${event}]`, err);
        socket.emit(EV.ERROR, {
          code:    err instanceof L.BillError ? err.code : 'INTERNAL',
          message: err instanceof L.BillError ? err.message : '伺服器錯誤，請稍後再試',
          event,
        });
      });
    });
  }

  // ================================================================
  //  房間模組（建立／加入／重連／離開）
  // ================================================================
  const { roomCache } = registerRoomHandlers(ns, db, {
    appId:      APP_ID,
    minPlayers: 1,
    idleAction: 'evict',        // 永不封存，只釋放記憶體
    idleMs:     opts.idleMs,

    // 同一房間、同一名稱 → 同一個 playerId（名稱即 Key）
    resolvePlayerId: ({ roomId, nickname }) => L.memberPlayerId(roomId, nickname),

    // 分帳不分「遊戲中／等待中」，隨時可加入
    canJoinAsPlayer: () => true,

    // 玩家加入／重連：確保有對應的帳務成員，並送出完整帳務狀態
    async onPlayerJoined(socket, roomId, playerId) {
      try {
        await withLock(roomId, async () => {
          const state = await getState(roomId);
          if (!state) return;

          const player = roomCache.getPlayers(roomId).find(p => p.id === playerId);
          const name = L.normalizeName(player?.nickname);
          if (!name) return;

          let member = state.members.find(m => m.playerId === playerId);
          let membersChanged = false;
          let isNew = false;

          if (!member || member.leftAt || member.isVirtual) {
            const { member: saved, created } = await store.ensureMember(roomId, {
              name, nameKey: L.nameKey(name), isVirtual: false,
            });
            saved.playerId = playerId;
            if (member) Object.assign(member, saved);
            else { member = saved; state.members.push(member); }
            membersChanged = true;
            isNew = created;
          }

          socket.emit(EV.STATE, snapshot(roomId, state, member));
          if (membersChanged) socket.to(roomId).emit(EV.MEMBERS, { members: wireMembers(roomId, state) });
          if (isNew) await logActivity(roomId, state, member, 'member.join', 'member', member.id, null, { name });
        });
      } catch (err) {
        console.error('[SplitBill:onPlayerJoined]', err);
        socket.emit(EV.ERROR, { code: 'INTERNAL', message: '載入帳務失敗，請重新整理' });
      }
    },

    // 離開／被踢：帳目與餘額保留，只把成員標記為「已離開」。斷線不算離開。
    async onPlayerLeft(roomId, playerId, reason) {
      if (reason === 'disconnect') return;
      try {
        await withLock(roomId, async () => {
          const state = await getState(roomId);
          const member = state?.members.find(m => m.playerId === playerId);
          if (!member || member.leftAt) return;
          const leftAt = nowIso();
          await store.setMemberLeft(member.id, leftAt);
          member.leftAt = leftAt;
          await logActivity(roomId, state, member, `member.${reason}`, 'member', member.id, null, null);
          broadcast(roomId, EV.MEMBERS, { members: wireMembers(roomId, state) });
        });
      } catch (err) {
        console.error('[SplitBill:onPlayerLeft]', err);
      }
    },
  });

  // ================================================================
  //  帳務事件
  // ================================================================
  ns.on('connection', (socket) => {

    // ── 要求完整狀態 ──────────────────────────────────────────
    on(socket, EV.STATE_REQUEST, ({ socket, roomId, state, me }) => {
      socket.emit(EV.STATE, snapshot(roomId, state, me));
    });

    // ── 新增支出 ──────────────────────────────────────────────
    on(socket, EV.EXPENSE_ADD, async ({ roomId, state, me, p }) => {
      const f = buildExpenseFields(state, p);
      const rateAdded = await ensureRate(roomId, state, f.currency);
      const now = nowIso();
      const expense = {
        id: crypto.randomUUID(), roomId, ...f,
        paidAt: dateOf(p.paidAt, now),
        createdBy: me.id, createdAt: now, updatedAt: now, deletedAt: null,
      };
      await store.saveExpense(expense);
      state.expenses.push(expense);
      broadcast(roomId, EV.EXPENSE_CHANGED, { expense, action: 'add' });
      if (rateAdded) broadcastSettings(roomId, state); else broadcastTransfers(roomId, state);
      await logActivity(roomId, state, me, 'expense.add', 'expense', expense.id, null, expense);
    });

    // ── 編輯支出（整筆覆寫，樂觀鎖）──────────────────────────
    on(socket, EV.EXPENSE_UPDATE, async ({ roomId, state, me, p }) => {
      const old = state.expenses.find(e => e.id === p.expenseId);
      if (!old) throw new L.BillError('EXPENSE_NOT_FOUND', '找不到這筆支出');
      if (!canEdit(roomId, me, old.createdBy)) throw forbidden();
      if (old.deletedAt) throw new L.BillError('EXPENSE_DELETED', '這筆支出已刪除，請先復原');
      if (p.baseUpdatedAt && p.baseUpdatedAt !== old.updatedAt) {
        throw new L.BillError('EXPENSE_CONFLICT', '這筆支出剛被其他人修改過，請重新整理後再編輯');
      }

      const f = buildExpenseFields(state, p);
      const rateAdded = await ensureRate(roomId, state, f.currency);
      const updated = { ...old, ...f, paidAt: dateOf(p.paidAt, old.paidAt), updatedAt: nowIso() };
      await store.saveExpense(updated);
      state.expenses[state.expenses.indexOf(old)] = updated;
      broadcast(roomId, EV.EXPENSE_CHANGED, { expense: updated, action: 'update' });
      if (rateAdded) broadcastSettings(roomId, state); else broadcastTransfers(roomId, state);
      await logActivity(roomId, state, me, 'expense.update', 'expense', updated.id, old, updated);
    });

    // ── 刪除／復原支出（軟刪除）───────────────────────────────
    for (const [event, action] of [[EV.EXPENSE_DELETE, 'delete'], [EV.EXPENSE_RESTORE, 'restore']]) {
      on(socket, event, async ({ roomId, state, me, p }) => {
        const old = state.expenses.find(e => e.id === p.expenseId);
        if (!old) throw new L.BillError('EXPENSE_NOT_FOUND', '找不到這筆支出');
        if (!canEdit(roomId, me, old.createdBy)) throw forbidden();
        if (action === 'delete' && old.deletedAt) return;
        if (action === 'restore' && !old.deletedAt) return;

        const updated = { ...old, deletedAt: action === 'delete' ? nowIso() : null, updatedAt: nowIso() };
        await store.saveExpense(updated);
        state.expenses[state.expenses.indexOf(old)] = updated;
        broadcast(roomId, EV.EXPENSE_CHANGED, { expense: updated, action });
        broadcastTransfers(roomId, state);
        await logActivity(roomId, state, me, `expense.${action}`, 'expense', updated.id, null, null);
      });
    }

    // ── 匯率：新增幣別只有房主；已存在的匯率任何成員都能改，整個帳本共用，所有換算立即跟著變 ──
    on(socket, EV.RATE_SET, async ({ roomId, state, me, p }) => {
      const currency = currencyOf(p.currency);
      if (currency === state.baseCurrency) throw new L.BillError('INVALID_INPUT', '結算幣別本身不需要匯率');
      if (!state.rates[currency] && !isHost(roomId, me)) throw new L.BillError('FORBIDDEN', '只有房主可以新增幣別');
      const before = state.rates[currency]?.rate ?? null;
      const entry = await putRate(roomId, state, currency, p.rate, 'manual');
      broadcastSettings(roomId, state);
      await logActivity(roomId, state, me, 'rate.set', 'rate', currency, { currency, rate: before }, { currency, rate: entry.rate });
    });

    on(socket, EV.RATE_REFRESH, async ({ roomId, state, me, p }) => {
      const currency = currencyOf(p.currency);
      if (currency === state.baseCurrency) throw new L.BillError('INVALID_INPUT', '結算幣別本身不需要匯率');
      if (!state.rates[currency] && !isHost(roomId, me)) throw new L.BillError('FORBIDDEN', '只有房主可以新增幣別');
      const before = state.rates[currency]?.rate ?? null;
      const entry = await autoRate(roomId, state, currency);
      broadcastSettings(roomId, state);
      await logActivity(roomId, state, me, 'rate.refresh', 'rate', currency, { currency, rate: before }, { currency, rate: entry.rate });
    });

    // ── 結算幣別（僅房主）：舊匯率全部失效，並替用到的外幣重新抓取 ──
    on(socket, EV.BASE_CURRENCY_SET, async ({ roomId, state, me, p }) => {
      if (!isHost(roomId, me)) throw new L.BillError('FORBIDDEN', '只有房主可以更改結算幣別');
      const currency = currencyOf(p.currency);
      const before = state.baseCurrency;
      if (currency === before) return;

      await store.setBaseCurrency(roomId, currency);
      state.baseCurrency = currency;
      const kept = Object.keys(state.rates);          // 房主新增過的幣別，換結算幣別後也要保留
      state.rates = {};
      const used = new Set([...kept, ...state.expenses.filter(e => !e.deletedAt).map(e => e.currency)].filter(c => c !== currency));
      await Promise.allSettled([...used].map(c => autoRate(roomId, state, c)));   // 抓不到的留給使用者手動輸入

      broadcastSettings(roomId, state);
      await logActivity(roomId, state, me, 'room.base-currency', 'room', roomId, { currency: before }, { currency });
    });

    // ── 新增虛擬成員（尚未加入的人，之後用同名登入即自動認領）──
    on(socket, EV.MEMBER_ADD_VIRTUAL, async ({ roomId, state, me, p }) => {
      if (!isHost(roomId, me)) throw new L.BillError('FORBIDDEN', '只有房主可以新增成員');
      const name = L.validateName(p.name);
      const key  = L.nameKey(name);
      if (state.members.some(m => m.nameKey === key)) {
        throw new L.BillError('MEMBER_EXISTS', '已經有同名的成員了');
      }
      const { member } = await store.ensureMember(roomId, { name, nameKey: key, isVirtual: true });
      member.playerId = L.memberPlayerId(roomId, name);
      state.members.push(member);
      broadcast(roomId, EV.MEMBERS, { members: wireMembers(roomId, state) });
      await logActivity(roomId, state, me, 'member.add-virtual', 'member', member.id, null, { name });
    });

    // ── 帳本命名（僅房主）────────────────────────────────────
    on(socket, EV.ROOM_RENAME, async ({ roomId, state, me, p }) => {
      if (!isHost(roomId, me)) throw new L.BillError('FORBIDDEN', '只有房主可以幫帳本命名');
      const name = str(L.normalizeName(p.name), 30, '帳本名稱', { required: true });
      const before = state.roomName ?? '';
      if (name === before) return;
      await store.setRoomName(roomId, name);
      state.roomName = name;
      broadcast(roomId, EV.ROOM_RENAMED, { roomName: name });
      await logActivity(roomId, state, me, 'room.rename', 'room', roomId, { name: before }, { name });
    });

    // ── 刪除房間（僅房主；帳務資料連帶永久刪除）──────────────
    on(socket, EV.ROOM_DELETE, async ({ roomId, me }) => {
      if (!isHost(roomId, me)) throw new L.BillError('FORBIDDEN', '只有房主可以刪除房間');

      const { error } = await db.from('rooms').delete().eq('id', roomId);   // CASCADE 清除 players 與所有 bill_*
      if (error) throw error;
      await store.purgeRoom(roomId);

      broadcast(roomId, EV.ROOM_DELETED, { roomId });
      ns.in(roomId).socketsLeave(roomId);
      for (const s of ns.sockets.values()) {
        if (s.data?.roomId === roomId) s.data = {};
      }
      roomCache.delete(roomId);
      console.log(`[SplitBill] 房間 ${roomId} 已由房主刪除`);
    });
  });

  return { roomCache, namespace: ns };
}

module.exports = { registerNamespace, EV, APP_ID, NAMESPACE };
