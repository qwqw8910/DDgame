'use strict';

// ================================================================
//  點格棋 — 事件轉接（/dots-boxes namespace）
//
//  房間管理（建立/加入/踢人/重連/觀戰/房主轉移）全部委託給 server/room，
//  rooms.app_id = 'dots-boxes'，max_players = 2；第 3 人起自動成為觀戰者。
//  規則全在 gameLogic.js（純函式）；本檔只負責：事件 → gameLogic、廣播狀態。
//  盤面沒有隱藏資訊，所有人（含觀戰者）收到同一份視圖，只有 mySeat 不同。
//  遊戲狀態只存在記憶體；server 重啟後房間會回到大廳。
// ================================================================

const { registerRoomHandlers } = require('../room');
const EV = require('../room/events');
const L = require('./gameLogic');

const APP_ID = 'dots-boxes';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const games = {};
const getGame = roomId => games[roomId] ?? null;

function registerNamespace(io, db) {
  const ns = io.of('/dots-boxes');
  let _roomCache = null;

  const entryOf = roomId => _roomCache?.getEntry(roomId) ?? null;
  const roomPlayers = roomId => entryOf(roomId)?.players ?? [];
  const roomSpectators = roomId => entryOf(roomId)?.spectators ?? [];
  const hostOf = roomId => entryOf(roomId)?.room?.host_player_id ?? null;
  const isHost = (roomId, playerId) => hostOf(roomId) === playerId;

  const socketsInRoom = roomId => Array.from(ns.sockets.values()).filter(s => s.data?.roomId === roomId);
  const isConnected = (roomId, playerId) => socketsInRoom(roomId).some(s => s.data.playerId === playerId);

  function ensureGame(roomId) {
    if (!games[roomId]) games[roomId] = { ...L.createGame(), names: {} };
    return games[roomId];
  }

  function refreshNames(roomId, game) {
    for (const p of roomPlayers(roomId)) game.names[p.id] = p.nickname;
    for (const s of roomSpectators(roomId)) game.names[s.id] = s.nickname;
  }

  function viewFor(roomId, game, playerId) {
    const { names, ...core } = game;
    const view = L.buildView(core, playerId);
    view.names = names;
    view.hostId = hostOf(roomId);
    view.online = Object.fromEntries(
      [...new Set([...game.players, ...roomPlayers(roomId).map(p => p.id)])]
        .map(id => [id, isConnected(roomId, id)]),
    );
    return view;
  }

  function pushState(roomId) {
    const game = getGame(roomId);
    if (!game) return;
    refreshNames(roomId, game);
    for (const s of socketsInRoom(roomId)) s.emit('db:state', viewFor(roomId, game, s.data.playerId));
  }

  function notice(roomId, message) {
    ns.to(roomId).emit('db:notice', { message });
  }

  function fail(socket, err) {
    if (err instanceof L.GameError) {
      socket.emit('db:error', { code: err.code, message: err.message });
    } else {
      console.error('[DotsBoxes]', err);
      socket.emit('db:error', { code: 'INTERNAL', message: '伺服器發生錯誤' });
    }
  }

  function offerSeatToSpectators(roomId) {
    for (const s of socketsInRoom(roomId)) if (s.data.isSpectator) s.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
  }

  function backToLobby(roomId, game, message) {
    L.resetGame(game);
    _roomCache.updateRoom(roomId, { status: 'waiting' });
    if (message) notice(roomId, message);
    pushState(roomId);
    if (roomPlayers(roomId).length < L.MAX_PLAYERS) offerSeatToSpectators(roomId);
  }

  const seatOpen = (roomId) => {
    const game = getGame(roomId);
    const idle = !game || game.phase === 'waiting' || game.phase === 'finished';
    return idle && roomPlayers(roomId).length < L.MAX_PLAYERS;
  };

  // ── 房間 Hooks ───────────────────────────────────────────────
  const hooks = {
    appId:      APP_ID,
    minPlayers: L.MIN_PLAYERS,

    // 只有大廳／結算且座位未滿時能入座；其餘一律觀戰
    canJoinAsPlayer: seatOpen,
    spectatorCanUpgrade: seatOpen,

    buildGameState(roomId) {
      const game = getGame(roomId);
      if (!game) return null;
      const { names, ...core } = game;
      return L.buildView(core, null);
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
      if (reason === 'disconnect') return pushState(roomId); // 座位保留，等重連
      if (game.phase === 'playing' && L.forfeit(game, playerId, 'leave')) {
        _roomCache.updateRoom(roomId, { status: 'waiting' });
        notice(roomId, `${game.names[playerId] ?? '對手'} 離開了，這局由你獲勝。`);
      }
      pushState(roomId);
      if (game.phase !== 'playing' && roomPlayers(roomId).length < L.MAX_PLAYERS) offerSeatToSpectators(roomId);
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

    // 加入後索取視圖（觀戰者不會觸發 onPlayerJoined）
    socket.on('db:sync', ({ roomId } = {}) => {
      const c = ctx(roomId); if (!c) return;
      pushState(roomId);
    });

    socket.on('db:set-options', ({ roomId, options } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        if (c.game.phase !== 'waiting') throw new L.GameError('BAD_PHASE', '遊戲開始後不能改設定');
        c.game.options = L.resolveOptions({ ...c.game.options, ...(options ?? {}) });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('db:start', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        const ids = roomPlayers(roomId).map(p => p.id);
        L.startGame(c.game, ids);
        _roomCache.updateRoom(roomId, { status: 'playing' });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('db:move', ({ roomId, edge } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.drawLine(c.game, c.playerId, edge);
        if (c.game.phase === 'finished') _roomCache.updateRoom(roomId, { status: 'waiting' });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('db:resign', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!L.forfeit(c.game, c.playerId, 'resign')) throw new L.GameError('BAD_PHASE', '現在不能投降');
        _roomCache.updateRoom(roomId, { status: 'waiting' });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 結算後任一玩家可回大廳（再來一局）；房主可在對局中途中止
    socket.on('db:restart', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const playing = c.game.phase === 'playing';
        if (c.game.phase === 'waiting') throw new L.GameError('BAD_PHASE', '已經在大廳了');
        const isPlayer = roomPlayers(roomId).some(p => p.id === c.playerId);
        if (playing ? !isHost(roomId, c.playerId) : !isPlayer) {
          throw new L.GameError('FORBIDDEN', playing ? '只有房主可以中止對局' : '只有玩家可以這樣做');
        }
        backToLobby(roomId, c.game, playing ? '房主中止了對局，回到大廳。' : '');
      } catch (err) { fail(socket, err); }
    });
  });

  // 房間被 RoomCache 封存後，釋放對應的遊戲狀態
  const sweep = setInterval(() => {
    for (const roomId of Object.keys(games)) {
      if (_roomCache.getEntry(roomId)) continue;
      delete games[roomId];
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  console.log('[DotsBoxes] /dots-boxes namespace registered (RoomModule enabled)');
  return { games };
}

module.exports = { registerNamespace };
