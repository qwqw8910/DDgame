'use strict';

// ================================================================
//  甜點守衛戰 — 事件轉接（/gem-td namespace）
//
//  房間管理全部委託給 server/room，只使用既有 hooks，不修改共用模組。
//  rooms.app_id = 'gem-td'，max_players = 1–4。
//  規則全在 gameLogic.js / waveSim.js；本檔只負責：事件 → gameLogic、計時器、狀態推送。
//  - gt:state：每人專屬視圖，只在狀態變動時推送
//  - gt:frame：波次中的快照，只送觀看者正在看的那張地圖；用 volatile 發送，掉幀由下一幀補上，
//    也不會被 connectionStateRecovery 累積
//  遊戲狀態只存在記憶體；server 重啟後房間會回到大廳。
// ================================================================

const { registerRoomHandlers } = require('../room');
const EV = require('../room/events');
const L = require('./gameLogic');

const APP_ID = 'gem-td';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const TICK_MS = 100;
const TICK_SECONDS = TICK_MS / 1000;
const FRAME_EVERY_TICKS = 2;
const READY_COUNTDOWN_MS = 2000;
const IDLE_RETRY_MS = 5000; // 全員離線時暫停，每隔一段時間再看一次

const games = {};

const getGame = roomId => games[roomId] ?? null;

function clearTimers(game) {
  if (game._timer) { clearTimeout(game._timer); game._timer = null; }
  if (game._ticker) { clearInterval(game._ticker); game._ticker = null; }
}

function registerNamespace(io, db) {
  const ns = io.of('/gem-td');
  let _roomCache = null;

  // ── 工具 ─────────────────────────────────────────────────────
  const entryOf = roomId => _roomCache?.getEntry(roomId) ?? null;
  const roomPlayers = roomId => entryOf(roomId)?.players ?? [];
  const roomSpectators = roomId => entryOf(roomId)?.spectators ?? [];
  const hostOf = roomId => entryOf(roomId)?.room?.host_player_id ?? null;
  const isHost = (roomId, playerId) => hostOf(roomId) === playerId;

  const socketsInRoom = roomId => Array.from(ns.sockets.values()).filter(s => s.data?.roomId === roomId);
  const onlineIds = roomId => socketsInRoom(roomId).filter(s => !s.data.isSpectator).map(s => s.data.playerId);

  function ensureGame(roomId) {
    if (!games[roomId]) games[roomId] = { ...L.createGame(), names: {}, _timer: null, _ticker: null };
    return games[roomId];
  }

  // 離開的人保留最後的暱稱（結算畫面仍要顯示）
  function refreshNames(roomId, game) {
    for (const p of roomPlayers(roomId)) game.names[p.id] = p.nickname;
    for (const s of roomSpectators(roomId)) game.names[s.id] = s.nickname;
  }

  function viewFor(roomId, game, socket) {
    const view = L.buildView(game, socket.data.playerId, socket.data.gtWatch);
    view.names = game.names;
    view.hostId = hostOf(roomId);
    view.serverNow = Date.now();
    return view;
  }

  function pushState(roomId) {
    const game = getGame(roomId);
    if (!game) return;
    refreshNames(roomId, game);
    for (const s of socketsInRoom(roomId)) s.emit('gt:state', viewFor(roomId, game, s));
  }

  function notice(roomId, message) {
    ns.to(roomId).emit('gt:notice', { message });
  }

  function fail(socket, err) {
    if (err instanceof L.GameError) {
      socket.emit('gt:error', { code: err.code, message: err.message });
    } else {
      console.error('[GemTD]', err);
      socket.emit('gt:error', { code: 'INTERNAL', message: '伺服器發生錯誤' });
    }
  }

  // ── 計時 ─────────────────────────────────────────────────────
  function scheduleBuild(roomId, game) {
    clearTimers(game);
    if (game.buildEndsAt === null) return;
    game._timer = setTimeout(() => {
      game._timer = null;
      if (getGame(roomId) !== game || game.phase !== 'build') return;
      // 全員離線就不開波，避免沒人看的時候被打爆
      if (!onlineIds(roomId).length) {
        game.buildEndsAt = Date.now() + IDLE_RETRY_MS;
        return scheduleBuild(roomId, game);
      }
      launchWave(roomId, game);
    }, Math.max(0, game.buildEndsAt - Date.now()));
    game._timer.unref?.();
  }

  function launchWave(roomId, game) {
    clearTimers(game);
    L.startWave(game);
    pushState(roomId);

    let ticks = 0;
    game._ticker = setInterval(() => {
      if (getGame(roomId) !== game || game.phase !== 'wave') return clearTimers(game);
      if (!onlineIds(roomId).length) return; // 全員離線：暫停

      const out = [];
      try {
        for (let i = 0; i < game.speed; i++) {
          const step = L.tick(game, TICK_SECONDS);
          out.push(...step.out);
          if (step.done) {
            announceOut(roomId, game, out);
            return endWave(roomId, game);
          }
        }
      } catch (err) {
        console.error('[GemTD tick]', err);
        return endWave(roomId, game);
      }
      if (out.length) {
        announceOut(roomId, game, out);
        pushState(roomId);
      }
      if (++ticks % FRAME_EVERY_TICKS === 0) sendFrames(roomId, game);
    }, TICK_MS);
    game._ticker.unref?.();
  }

  function sendFrames(roomId, game) {
    const frames = L.buildFrames(game);
    for (const s of socketsInRoom(roomId)) {
      const frame = frames[L.resolveWatch(game, s.data.playerId, s.data.gtWatch)];
      if (frame) s.volatile.emit('gt:frame', frame);
    }
  }

  function announceOut(roomId, game, ids) {
    for (const id of ids) notice(roomId, `${game.names[id] ?? '玩家'} 出局了`);
  }

  function closeFinished(roomId, game) {
    clearTimers(game);
    _roomCache.updateRoom(roomId, { status: 'finished' });
    pushState(roomId);
    for (const s of socketsInRoom(roomId)) if (s.data.isSpectator) s.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
  }

  function endWave(roomId, game) {
    clearTimers(game);
    const { finished } = L.finishWave(game, { now: Date.now() });
    if (finished) return closeFinished(roomId, game);
    scheduleBuild(roomId, game);
    pushState(roomId);
  }

  // 線上玩家都準備好：縮短倒數，稍後開波
  function checkReady(roomId, game) {
    if (game.phase !== 'build' || !L.allReady(game, onlineIds(roomId))) return;
    const target = Date.now() + READY_COUNTDOWN_MS;
    if (game.buildEndsAt === null || game.buildEndsAt > target) {
      game.buildEndsAt = target;
      scheduleBuild(roomId, game);
    }
  }

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
    const { changed, remaining, finished } = L.leavePlayer(game, playerId);
    if (changed && remaining < L.MIN_PLAYERS && game.phase !== 'finished') {
      return backToLobby(roomId, game, '所有玩家都離開了，本局中止，回到大廳。');
    }
    if (finished) return closeFinished(roomId, game);
    checkReady(roomId, game);
    pushState(roomId);
  }

  // ── 房間 Hooks ───────────────────────────────────────────────
  const joinable = (roomId) => {
    const game = getGame(roomId);
    return !game || game.phase === 'waiting' || game.phase === 'finished';
  };

  const hooks = {
    appId:      APP_ID,
    minPlayers: L.MIN_PLAYERS,

    // 遊戲進行中新加入者成為觀戰者
    canJoinAsPlayer: joinable,
    spectatorCanUpgrade: joinable,

    buildGameState(roomId) {
      const game = getGame(roomId);
      return game ? { ...L.buildView(game, null), hostId: hostOf(roomId), serverNow: Date.now(), names: game.names } : null;
    },

    async onPlayerJoined(socket, roomId) {
      ensureGame(roomId);
      socket.emit('gt:catalog', L.catalog());
      pushState(roomId);
    },

    onSpectatorUpgraded(socket, roomId) {
      pushState(roomId);
    },

    onPlayerLeft(roomId, playerId, reason) {
      const game = getGame(roomId);
      if (!game) return;
      // 斷線：座位保留，時間到由伺服器代選；其他人都準備好了就不用等他
      if (reason === 'disconnect') {
        checkReady(roomId, game);
        return pushState(roomId);
      }
      handleLeft(roomId, playerId);
    },
  };

  const { roomCache } = registerRoomHandlers(ns, db, hooks);
  _roomCache = roomCache;

  // ── 遊戲事件 ─────────────────────────────────────────────────
  ns.on('connection', (socket) => {
    const ctx = (roomId) => {
      const { playerId, isSpectator } = socket.data ?? {};
      if (!roomId || !playerId || isSpectator || socket.data.roomId !== roomId) return null;
      const game = getGame(roomId);
      return game ? { playerId, game } : null;
    };
    const asHost = (roomId) => {
      const c = ctx(roomId);
      if (c && !isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以這樣做');
      return c;
    };
    // 玩家動作的共用外殼：成功後推送狀態
    const action = (event, run) => {
      socket.on(event, (payload = {}) => {
        try {
          const c = ctx(payload.roomId); if (!c) return;
          run(c, payload);
          pushState(payload.roomId);
        } catch (err) { fail(socket, err); }
      });
    };

    // 加入後索取型錄與自己的視圖（觀戰者不會觸發 onPlayerJoined）
    socket.on('gt:sync', ({ roomId } = {}) => {
      if (!roomId || socket.data?.roomId !== roomId) return;
      socket.emit('gt:catalog', L.catalog());
      pushState(roomId);
    });

    // 切換要看的地圖：任何在房間裡的人都可以，觀戰者也一樣
    socket.on('gt:watch', ({ roomId, targetId } = {}) => {
      if (!roomId || socket.data?.roomId !== roomId) return;
      const game = getGame(roomId);
      if (!game) return;
      socket.data.gtWatch = targetId;
      socket.emit('gt:state', viewFor(roomId, game, socket));
    });

    socket.on('gt:set-options', ({ roomId, options } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        if (c.game.phase !== 'waiting') throw new L.GameError('BAD_PHASE', '遊戲開始後不能改設定');
        c.game.options = L.resolveOptions({ ...c.game.options, ...(options ?? {}) });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('gt:start', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        L.startGame(c.game, roomPlayers(roomId).map(p => p.id), { now: Date.now() });
        _roomCache.updateRoom(roomId, { status: 'playing' });
        scheduleBuild(roomId, c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    action('gt:place', ({ playerId, game }, { slot, x, y }) => L.placeGem(game, playerId, slot, x, y));
    action('gt:keep', ({ playerId, game }, { towerId }) => L.keepGem(game, playerId, towerId));
    action('gt:merge', ({ playerId, game }, { towerId }) => L.mergeGem(game, playerId, towerId));
    action('gt:combine', ({ playerId, game }, { recipeId, towerId }) => L.combine(game, playerId, recipeId, towerId));
    action('gt:upgrade-quality', ({ playerId, game }) => L.upgradeQuality(game, playerId));
    action('gt:research', ({ playerId, game }, { track }) => L.upgradeResearch(game, playerId, track));
    action('gt:remove-stone', ({ playerId, game }, { towerId }) => L.removeStone(game, playerId, towerId));
    action('gt:swap', ({ playerId, game }, { towerId, stoneId }) => L.swapWithStone(game, playerId, towerId, stoneId));

    socket.on('gt:ready', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.setReady(c.game, c.playerId);
        checkReady(roomId, c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('gt:set-speed', ({ roomId, speed } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        L.setSpeed(c.game, speed);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('gt:finish-now', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
        clearTimers(c.game);
        L.finishNow(c.game);
        _roomCache.updateRoom(roomId, { status: 'finished' });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('gt:restart', ({ roomId } = {}) => {
      try {
        const c = asHost(roomId); if (!c) return;
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

  console.log('[GemTD] /gem-td namespace registered (RoomModule enabled)');
  return { games }; // 供整合測試調整狀態
}

module.exports = { registerNamespace };
