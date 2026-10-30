'use strict';

// ================================================================
//  同詞相遇 — 事件轉接（/same-word namespace）
//
//  房間管理（建立/加入/踢人/重連/觀戰/房主轉移）全部委託給 server/room，
//  只使用既有 hooks，不修改共用模組。rooms.app_id = 'same-word'，max_players = 2–12。
//  規則全在 gameLogic.js（純函式）；本檔只負責：事件 → gameLogic、計時器、每人專屬視圖推送。
//  遊戲狀態只存在記憶體；server 重啟後房間會回到大廳。
//
//  房間模組不保存建房 options，所以遊戲設定（計時、回合上限…）由房主在大廳用 sw:set-options 設定。
// ================================================================

const { registerRoomHandlers } = require('../room');
const EV = require('../room/events');
const L = require('./gameLogic');
const SEED_PAIRS = require('./seedWords');

const APP_ID = 'same-word';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const games = {};

const getGame = roomId => games[roomId] ?? null;

function clearTimers(game) {
  if (game._timer) { clearTimeout(game._timer); game._timer = null; }
}

// 計時器等不可序列化的欄位不放進遊戲狀態本體
function stripInternal(game) {
  const { _timer, ...rest } = game;
  return rest;
}

function registerNamespace(io, db) {
  const ns = io.of('/same-word');
  let _roomCache = null;

  // ── 工具 ─────────────────────────────────────────────────────
  const entryOf = roomId => _roomCache?.getEntry(roomId) ?? null;
  const roomPlayers = roomId => entryOf(roomId)?.players ?? [];
  const roomSpectators = roomId => entryOf(roomId)?.spectators ?? [];
  const hostOf = roomId => entryOf(roomId)?.room?.host_player_id ?? null;
  const isHost = (roomId, playerId) => hostOf(roomId) === playerId;

  const socketsInRoom = roomId => Array.from(ns.sockets.values()).filter(s => s.data?.roomId === roomId);
  const isConnected = (roomId, playerId) => socketsInRoom(roomId).some(s => s.data.playerId === playerId);

  function ensureGame(roomId) {
    if (!games[roomId]) games[roomId] = { ...L.createGame(), names: {}, _timer: null };
    return games[roomId];
  }

  // 暱稱表：房內玩家 + 觀戰者；離開的人保留最後的暱稱（歷史輪仍要顯示）
  function refreshNames(roomId, game) {
    for (const p of roomPlayers(roomId)) game.names[p.id] = p.nickname;
    for (const s of roomSpectators(roomId)) game.names[s.id] = s.nickname;
  }

  function viewFor(roomId, game, playerId) {
    const view = L.buildView(stripInternal(game), playerId);
    view.names = game.names;
    view.hostId = hostOf(roomId);
    view.online = Object.fromEntries(game.activeIds.map(id => [id, isConnected(roomId, id)]));
    return view;
  }

  // 每位連線者各自收到自己的視圖
  function pushState(roomId) {
    const game = getGame(roomId);
    if (!game) return;
    refreshNames(roomId, game);
    for (const s of socketsInRoom(roomId)) s.emit('sw:state', viewFor(roomId, game, s.data.playerId));
  }

  function notice(roomId, message) {
    ns.to(roomId).emit('sw:notice', { message });
  }

  function fail(socket, err) {
    if (err instanceof L.GameError) {
      socket.emit('sw:error', { code: err.code, message: err.message });
    } else {
      console.error('[SameWord]', err);
      socket.emit('sw:error', { code: 'INTERNAL', message: '伺服器發生錯誤' });
    }
  }

  // ── 計時 ─────────────────────────────────────────────────────
  // 書寫倒數：到時間由伺服器揭曉
  function scheduleWriting(roomId, game) {
    clearTimers(game);
    game._timer = setTimeout(() => {
      game._timer = null;
      if (getGame(roomId) !== game || game.phase !== 'writing') return;
      settle(roomId, game);
    }, Math.max(0, game.roundEndsAt - Date.now()));
    game._timer.unref?.();
  }

  function settle(roomId, game) {
    clearTimers(game);
    try {
      // setTimeout 可能比 roundEndsAt 早幾毫秒觸發，所以取較大者
      L.settleRound(game, { now: Math.max(Date.now(), game.roundEndsAt ?? 0) });
    } catch (err) {
      console.error('[SameWord settle]', err);
      return;
    }
    // 揭曉後不自動前進：玩家可能需要討論，由房主按「下一輪」
    pushState(roomId);
  }

  function advance(roomId, game) {
    clearTimers(game);
    const r = L.nextRound(game, { now: Date.now() });
    if (!r.finished) scheduleWriting(roomId, game);
    pushState(roomId);
  }

  // 全員回到等待大廳（保留設定），讓新玩家加入後再開始；觀戰者可升格
  function backToLobby(roomId, game, message) {
    clearTimers(game);
    L.resetGame(game);
    _roomCache.updateRoom(roomId, { status: 'waiting' });
    if (message) notice(roomId, message);
    pushState(roomId);
    for (const s of socketsInRoom(roomId)) if (s.data.isSpectator) s.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
  }

  function handleLeft(roomId, playerId) {
    const game = getGame(roomId);
    if (!game) return;
    const r = L.leavePlayer(game, playerId);
    if (!r.changed) return pushState(roomId);
    if (r.remaining < L.MIN_PLAYERS) return backToLobby(roomId, game, '玩家不足，本局中止，回到大廳。');
    if (r.allSubmitted) return settle(roomId, game);
    pushState(roomId);
  }

  // ── 房間 Hooks ───────────────────────────────────────────────
  const hooks = {
    appId:      APP_ID,
    minPlayers: L.MIN_PLAYERS,

    // 遊戲進行中新加入者成為觀戰者
    canJoinAsPlayer(roomId) {
      const game = getGame(roomId);
      return !game || game.phase === 'waiting' || game.phase === 'finished';
    },

    spectatorCanUpgrade(roomId) {
      const game = getGame(roomId);
      return !game || game.phase === 'waiting' || game.phase === 'finished';
    },

    // room:join-ack 帶的遊戲狀態：公開視圖（本人視圖隨後由 sw:state 補發）
    buildGameState(roomId) {
      const game = getGame(roomId);
      return game ? L.buildView(stripInternal(game), null) : null;
    },

    async onPlayerJoined(socket, roomId) {
      ensureGame(roomId);
      pushState(roomId);
    },

    onSpectatorUpgraded(socket, roomId) {
      pushState(roomId);
    },

    onPlayerLeft(roomId, playerId, reason) {
      const game = getGame(roomId);
      if (!game) return;
      // 斷線：座位保留，逾時視為空白；重連後由 onPlayerJoined 補發視圖
      if (reason === 'disconnect') return pushState(roomId);
      handleLeft(roomId, playerId);
    },
  };

  const { roomCache } = registerRoomHandlers(ns, db, hooks);
  _roomCache = roomCache;

  // ── 遊戲事件 ─────────────────────────────────────────────────
  ns.on('connection', (socket) => {
    const ctx = (roomId) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId || socket.data.roomId !== roomId) return null;
      const game = getGame(roomId);
      return game ? { playerId, game } : null;
    };
    const asHost = (roomId) => {
      const c = ctx(roomId);
      if (c && !isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以這樣做');
      return c;
    };

    // 加入後索取自己的視圖（觀戰者不會觸發 onPlayerJoined）
    socket.on('sw:sync', ({ roomId } = {}) => {
      const c = ctx(roomId); if (!c) return;
      pushState(roomId);
    });

    // 房主在大廳調整設定（房間模組不保存建房 options）
    socket.on('sw:set-options', ({ roomId, options } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        if (c.game.phase !== 'waiting') throw new L.GameError('BAD_PHASE', '遊戲開始後不能改設定');
        c.game.options = L.resolveOptions({ ...c.game.options, ...(options ?? {}) });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('sw:start', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        const ids = roomPlayers(roomId).map(p => p.id);
        L.startGame(c.game, ids, { now: Date.now(), seedPairs: SEED_PAIRS });
        _roomCache.updateRoom(roomId, { status: 'playing' });
        scheduleWriting(roomId, c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('sw:submit', ({ roomId, word } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const { allSubmitted } = L.submitWord(c.game, c.playerId, word, { now: Date.now() });
        if (allSubmitted) return settle(roomId, c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('sw:vote-outlier', ({ roomId, targetId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.voteOutlier(c.game, c.playerId, targetId ?? null, { now: Date.now() });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('sw:next-round', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        advance(roomId, c.game);
      } catch (err) { fail(socket, err); }
    });

    socket.on('sw:finish-now', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        clearTimers(c.game);
        L.finishNow(c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('sw:restart', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        // 進行中或結算後都可以重新開房（參考 cs:reset-lobby）；已在大廳則不需要
        if (c.game.phase === 'waiting') throw new L.GameError('BAD_PHASE', '已經在大廳了');
        backToLobby(roomId, c.game, '房主重新開房，回到大廳。');
      } catch (err) { fail(socket, err); }
    });
  });

  // 房間被 RoomCache 封存後，釋放對應的遊戲狀態與計時器
  const sweep = setInterval(() => {
    for (const roomId of Object.keys(games)) {
      if (_roomCache.getEntry(roomId)) continue;
      clearTimers(games[roomId]);
      delete games[roomId];
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  console.log('[SameWord] /same-word namespace registered (RoomModule enabled)');
  return { games }; // 供整合測試調整計時
}

module.exports = { registerNamespace };
