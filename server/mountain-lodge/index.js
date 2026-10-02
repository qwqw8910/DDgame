'use strict';

// ================================================================
//  山中別館殺人事件 — 遊戲邏輯（/mountain-lodge namespace）
//
//  房間管理（建立/加入/踢人/重連/觀戰/房主轉移）全部委託給 server/room。
//  使用既有的 Supabase rooms / players 表：
//    - rooms.app_id = 'mountain-lodge'，max_players = 房主選的人數（3–6）
//    - players.score = 累計勝場（每局結算後勝方 +1）
//  牌桌狀態只存在記憶體（與懂我再說相同）；server 重啟後房間會回到大廳。
//
//  伺服器只會把玩家「有權看到的內容」推給該玩家（見 gameLogic.buildView），
//  他人角色牌在結算前永不離開伺服器。
// ================================================================

const { registerRoomHandlers } = require('../room');
const EV = require('../room/events');
const L = require('./gameLogic');

const APP_ID = 'mountain-lodge';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// 每個房間一份牌桌狀態
const games = {};

function getGame(roomId) { return games[roomId] ?? null; }

function ensureGame(roomId) {
  if (!games[roomId]) games[roomId] = { ...L.createLobby(), _timer: null };
  return games[roomId];
}

function clearTimer(game) {
  if (game._timer) { clearTimeout(game._timer); game._timer = null; }
}

function registerNamespace(io, db) {
  const ns = io.of('/mountain-lodge');
  let _roomCache = null;
  let _broadcast = null;

  // ── 工具 ─────────────────────────────────────────────────────
  const roomPlayers = roomId => _roomCache?.getEntry(roomId)?.players ?? [];
  const isHost = (roomId, playerId) =>
    _roomCache?.getEntry(roomId)?.room?.host_player_id === playerId;
  const isOnline = (roomId, playerId) =>
    roomPlayers(roomId).find(p => p.id === playerId)?.is_online ?? false;

  function socketsInRoom(roomId) {
    return Array.from(ns.sockets.values()).filter(s => s.data?.roomId === roomId);
  }

  // 每位連線者各自收到自己的視圖
  function pushState(roomId) {
    const game = getGame(roomId);
    if (!game) return;
    for (const s of socketsInRoom(roomId)) {
      s.emit('lodge:state', L.buildView(game, s.data.isSpectator ? null : s.data.playerId));
    }
  }

  function notice(roomId, message) {
    ns.to(roomId).emit('lodge:notice', { message });
  }

  function fail(socket, err) {
    if (err instanceof L.GameError) {
      socket.emit('lodge:error', { code: err.code, message: err.message });
    } else {
      console.error('[Lodge]', err);
      socket.emit('lodge:error', { code: 'INTERNAL', message: '伺服器發生錯誤' });
    }
  }

  // ── 階段推進 ─────────────────────────────────────────────────
  function enterDiscussion(roomId, game) {
    clearTimer(game);
    L.beginDiscussion(game);
    game._timer = setTimeout(() => enterVoting(roomId, game), game.discussionSeconds * 1000);
    game._timer.unref();
    pushState(roomId);
  }

  function enterVoting(roomId, game) {
    clearTimer(game);
    if (game.phase !== 'discussion') return;
    L.beginVoting(game);
    pushState(roomId);
  }

  // 投票結束：Level 3+ 先進入開票階段（固定時長，讓律師 / 富商決定是否公開），其餘直接結算
  function endVoting(roomId, game) {
    if (game.phase !== 'voting') return;
    if (game.level < 3) {
      finishGame(roomId, game).catch(err => console.error('[Lodge finish]', err.message));
      return;
    }
    clearTimer(game);
    L.beginReveal(game);
    game._timer = setTimeout(
      () => finishGame(roomId, game).catch(err => console.error('[Lodge finish]', err.message)),
      L.REVEAL_SECONDS * 1000);
    game._timer.unref();
    pushState(roomId);
  }

  async function finishGame(roomId, game) {
    clearTimer(game);
    if (game.phase !== 'voting' && game.phase !== 'reveal') return;
    const result = L.resolveGame(game);
    await awardScores(roomId, result.winnerIds);
    pushState(roomId);
  }

  // 結算：勝方每人 players.score +1（記憶體 + DB）
  async function awardScores(roomId, winnerIds) {
    for (const id of winnerIds) {
      const p = roomPlayers(roomId).find(x => x.id === id);
      if (!p) continue;
      const score = (p.score ?? 0) + 1;
      _roomCache.updatePlayer(roomId, id, { score });
      try {
        await db.from('players')
          .update({ score, updated_at: new Date().toISOString() }).eq('id', id);
      } catch (err) {
        console.error('[Lodge] score update:', err.message);
      }
    }
    _broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: _roomCache.getPlayers(roomId) });
  }

  // 所有「連線中」的玩家都投完票 → 自動開票
  function maybeFinishVoting(roomId, game) {
    if (game.phase !== 'voting') return;
    const online = game.order.filter(id => isOnline(roomId, id));
    if (online.length > 0 && online.every(id => game.votes[id])) {
      endVoting(roomId, game);
    }
  }

  function backToLobby(roomId, game) {
    clearTimer(game);
    L.resetToLobby(game);
    _roomCache.updateRoom(roomId, { status: 'waiting' });
    pushState(roomId);
    // 觀戰者此時可以升為玩家
    for (const s of socketsInRoom(roomId)) {
      if (s.data.isSpectator) s.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
    }
  }

  // ── 房間 Hooks ───────────────────────────────────────────────
  const hooks = {
    appId:      APP_ID,
    minPlayers: L.MIN_PLAYERS,

    // 遊戲進行中不能加入，改為觀戰
    canJoinAsPlayer(roomId) {
      const game = getGame(roomId);
      return !game || game.phase === 'lobby';
    },

    spectatorCanUpgrade(roomId) {
      const game = getGame(roomId);
      return !game || game.phase === 'lobby';
    },

    // room:join-ack 帶的遊戲狀態（觀戰者只會收到這份，所以直接給公開視圖）
    buildGameState(roomId) {
      const game = getGame(roomId);
      return game ? L.buildView(game, null) : null;
    },

    async onPlayerJoined(socket, roomId, playerId) {
      ensureGame(roomId);
      pushState(roomId); // 新加入 / 重連的人拿到自己的視圖，其他人更新人數
    },

    onSpectatorUpgraded(socket, roomId) {
      pushState(roomId);
    },

    onPlayerLeft(roomId, playerId, reason) {
      const game = getGame(roomId);
      if (!game) return;

      if (reason === 'disconnect') {
        // 斷線：牌局保留，重連後補發。投票中若剩下的人都投完則直接開票。
        maybeFinishVoting(roomId, game);
        pushState(roomId);
        return;
      }

      // 主動離開 / 被踢：牌局缺一人無法繼續 → 中止並回大廳
      if (game.phase !== 'lobby' && game.order.includes(playerId)) {
        backToLobby(roomId, game);
        notice(roomId, '有玩家離開了房間，本局已中止，回到大廳。');
      } else {
        pushState(roomId);
      }
    },
  };

  const { roomCache, broadcast } = registerRoomHandlers(ns, db, hooks);
  _roomCache = roomCache;
  _broadcast = broadcast;

  // ── 遊戲事件 ─────────────────────────────────────────────────
  ns.on('connection', (socket) => {
    // 從 socket.data 取得身份；觀戰者一律不能操作
    const ctx = (roomId) => {
      const { playerId, isSpectator } = socket.data ?? {};
      if (!roomId || !playerId || isSpectator || socket.data.roomId !== roomId) return null;
      const game = getGame(roomId);
      return game ? { playerId, game } : null;
    };

    // 房主調整設定（僅大廳）
    socket.on('lodge:settings', ({ roomId, level, discussionSeconds } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以調整設定');
        if (c.game.phase !== 'lobby') throw new L.GameError('BAD_PHASE', '遊戲進行中無法調整設定');
        Object.assign(c.game, L.normalizeSettings({
          level: level ?? c.game.level,
          discussionSeconds: discussionSeconds ?? c.game.discussionSeconds,
        }));
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 開始遊戲（房主）
    socket.on('lodge:start', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以開始遊戲');
        const ids = roomPlayers(roomId).map(p => p.id);
        L.startGame(c.game, ids);
        _roomCache.updateRoom(roomId, { status: 'playing' });
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 傳牌：留一張，另一張傳給指定玩家
    socket.on('lodge:keep', ({ roomId, cardId, passTo } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const { done } = L.keepCard(c.game, c.playerId, cardId, passTo);
        if (done) enterDiscussion(roomId, c.game);
        else pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 房主代離線玩家操作（隨機決定）
    socket.on('lodge:autoplay', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以代為操作');
        if (c.game.phase !== 'passing' || !c.game.actorId) return;
        if (isOnline(roomId, c.game.actorId)) {
          throw new L.GameError('ACTOR_ONLINE', '該玩家仍在線上，請等他操作');
        }
        const { done } = L.autoPlay(c.game);
        if (done) enterDiscussion(roomId, c.game);
        else pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 房主提前結束討論
    socket.on('lodge:end-discussion', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以提前結束討論');
        enterVoting(roomId, c.game);
      } catch (err) { fail(socket, err); }
    });

    // 投票（投地點；可改票，直到所有人投完或房主強制開票）
    socket.on('lodge:vote', ({ roomId, targetId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.castVote(c.game, c.playerId, targetId);
        pushState(roomId);
        maybeFinishVoting(roomId, c.game);
      } catch (err) { fail(socket, err); }
    });

    // 房主強制開票（有人遲遲不投時）
    socket.on('lodge:force-result', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以強制開票');
        if (c.game.phase === 'voting') endVoting(roomId, c.game);
        else finishGame(roomId, c.game).catch(err => console.error('[Lodge finish]', err.message));
      } catch (err) { fail(socket, err); }
    });

    // 開票階段：律師 / 富商公開身份並發動能力（律師需帶 targetId）
    socket.on('lodge:reveal', ({ roomId, targetId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.revealAbility(c.game, c.playerId, targetId);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 再來一局（房主）→ 回大廳
    socket.on('lodge:again', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以重新開局');
        if (c.game.phase !== 'result') return;
        backToLobby(roomId, c.game);
      } catch (err) { fail(socket, err); }
    });
  });

  // 房間被 RoomCache 封存後，釋放對應的牌桌狀態與計時器
  const sweep = setInterval(() => {
    for (const roomId of Object.keys(games)) {
      if (_roomCache.getEntry(roomId)) continue;
      clearTimer(games[roomId]);
      delete games[roomId];
    }
  }, SWEEP_INTERVAL_MS);
  sweep.unref();

  console.log('[Lodge] /mountain-lodge namespace registered (RoomModule enabled)');
}

module.exports = { registerNamespace };
