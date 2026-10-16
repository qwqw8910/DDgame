'use strict';

// ================================================================
//  血染鐘樓 — 遊戲邏輯（/clocktower namespace）
//
//  房間管理（建立/加入/踢人/重連/觀戰/房主轉移）全部委託給 server/room，
//  只使用既有 hooks，不修改共用模組。使用既有的 Supabase rooms / players 表：
//    - rooms.app_id = 'clocktower'，max_players = 座位上限 + 1（說書人）
//    - players.score = 累計勝場（每局結算後勝方 +1；說書人不計分）
//  遊戲狀態只存在記憶體；server 重啟後房間會回到大廳。
//
//  魔典權限綁在遊戲狀態的 storytellerId，與 room.host_player_id 無關：
//  房主轉移不會讓任何人拿到魔典。說書人斷線 → 遊戲暫停；說書人離開 → 本局中止。
//
//  伺服器只會把觀看者「有權看到的內容」推給他（見 gameLogic.buildView）。
// ================================================================

const { registerRoomHandlers } = require('../room');
const EV = require('../room/events');
const L = require('./gameLogic');

const APP_ID = 'clocktower';
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const BOT_REPLY_MS = 800;
const BOT_HAND_CHANCE = 0.4;

const games = {};

function getGame(roomId) { return games[roomId] ?? null; }

function clearTimers(game) {
  if (game._voteTimer) { clearTimeout(game._voteTimer); game._voteTimer = null; }
}

// 計時器等不可序列化的欄位不放進遊戲狀態本體（buildView 會 clone）
function stripInternal(game) {
  const { _voteTimer, ...rest } = game;
  return rest;
}

function registerNamespace(io, db) {
  const ns = io.of('/clocktower');
  let _roomCache = null;
  let _broadcast = null;

  // ── 工具 ─────────────────────────────────────────────────────
  const entryOf = roomId => _roomCache?.getEntry(roomId) ?? null;
  const roomPlayers = roomId => entryOf(roomId)?.players ?? [];
  const roomSpectators = roomId => entryOf(roomId)?.spectators ?? [];
  const isHost = (roomId, playerId) => entryOf(roomId)?.room?.host_player_id === playerId;
  const inRoom = (roomId, playerId) =>
    roomPlayers(roomId).some(p => p.id === playerId) || roomSpectators(roomId).some(s => s.id === playerId);

  function socketsInRoom(roomId) {
    return Array.from(ns.sockets.values()).filter(s => s.data?.roomId === roomId);
  }
  const socketsOf = (roomId, playerIds) => socketsInRoom(roomId).filter(s => playerIds.includes(s.data.playerId));
  const isConnected = (roomId, playerId) => L.isBotId(playerId) || socketsOf(roomId, [playerId]).length > 0;

  function ensureGame(roomId) {
    if (!games[roomId]) {
      const max = entryOf(roomId)?.room?.max_players ?? (L.MIN_SEATS + 1);
      games[roomId] = { ...L.createLobby({ seatCount: max - 1 }), _voteTimer: null };
    }
    return games[roomId];
  }

  // 暱稱表：房內玩家 + 觀戰者；離開的人保留最後的暱稱（座位上仍要顯示）
  function refreshNames(roomId, game) {
    for (const p of roomPlayers(roomId)) game.names[p.id] = p.nickname;
    for (const s of roomSpectators(roomId)) game.names[s.id] = s.nickname;
  }

  function onlineMap(roomId, game) {
    const ids = new Set([
      ...game.lobbySeats.filter(Boolean), ...game.seats.map(s => s.playerId),
      ...roomPlayers(roomId).map(p => p.id), ...(game.storytellerId ? [game.storytellerId] : []),
    ]);
    return Object.fromEntries([...ids].map(id => [id, isConnected(roomId, id)]));
  }

  function viewFor(roomId, game, playerId) {
    const view = L.buildView(stripInternal(game), playerId);
    view.online = onlineMap(roomId, game);
    view.hostId = entryOf(roomId)?.room?.host_player_id ?? null;
    return view;
  }

  // 每位連線者各自收到自己的視圖（觀戰者也依 playerId 判斷：說書人可能是房間觀戰者）
  function pushState(roomId) {
    const game = getGame(roomId);
    if (!game) return;
    refreshNames(roomId, game);
    for (const s of socketsInRoom(roomId)) s.emit('ct:state', viewFor(roomId, game, s.data.playerId));
  }

  // 只重推給特定玩家（夜晚延遲到期時用：不讓其他人的畫面跟著動）
  function pushStateTo(roomId, playerIds) {
    const game = getGame(roomId);
    if (!game) return;
    for (const s of socketsOf(roomId, playerIds)) s.emit('ct:state', viewFor(roomId, game, s.data.playerId));
  }

  // 夜晚隨機延遲 0～1.5 秒（白天立即）。回傳延遲毫秒數
  const nightDelay = game => (game.phase === 'night' ? L.randomDelay() : 0);

  // 延遲到期才推給玩家；+20ms 確保 buildView 判斷 visibleAt 時已經到期
  function deliverLater(roomId, game, playerId, visibleAt, fn) {
    const ms = Math.max(0, visibleAt - Date.now());
    const run = () => {
      if (getGame(roomId) !== game) return;
      fn?.();
      pushStateTo(roomId, [playerId]);
    };
    if (ms === 0) return run();
    setTimeout(run, ms + 20).unref?.();
  }

  function sendScript(socket, game) {
    socket.emit('ct:script', L.scriptInfo(game.scriptId));
  }

  function notice(roomId, message) {
    ns.to(roomId).emit('ct:notice', { message });
  }

  function fail(socket, err) {
    if (err instanceof L.GameError) {
      socket.emit('ct:error', { code: err.code, message: err.message });
    } else {
      console.error('[Clocktower]', err);
      socket.emit('ct:error', { code: 'INTERNAL', message: '伺服器發生錯誤' });
    }
  }

  // ── 說書人在場 / 暫停 ────────────────────────────────────────
  function maybePause(roomId, game, playerId) {
    if (!game || playerId !== game.storytellerId) return;
    if (isConnected(roomId, playerId)) return; // 還有其他分頁連著
    if (L.pause(game)) {
      clearTimers(game);
      notice(roomId, '說書人斷線了，遊戲暫停，等待說書人重新連線…');
    }
  }

  function maybeResume(roomId, game, playerId) {
    if (!game || playerId !== game.storytellerId) return;
    if (L.resume(game)) notice(roomId, '說書人回來了，遊戲繼續！');
  }

  function abortGame(roomId, game) {
    clearTimers(game);
    L.resetToLobby(game, roomPlayers(roomId).map(p => p.id));
    game.storytellerId = null;
    _roomCache.updateRoom(roomId, { status: 'waiting' });
    notice(roomId, '說書人離開了，本局中止，回到大廳。');
    pushState(roomId);
    for (const s of socketsInRoom(roomId)) if (s.data.isSpectator) s.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
  }

  function handleLeft(roomId, playerId) {
    const game = getGame(roomId);
    if (!game) return;
    const r = L.playerLeft(game, playerId);
    if (r === 'abort') return abortGame(roomId, game);
    if (r === 'setup') {
      L.resetToLobby(game, roomPlayers(roomId).map(p => p.id).filter(id => id !== playerId));
      _roomCache.updateRoom(roomId, { status: 'waiting' });
      notice(roomId, '有玩家在開局設定時離開，回到大廳重新入座。');
    }
    pushState(roomId);
  }

  // ── 投票指針 ─────────────────────────────────────────────────
  function scheduleVoteTick(roomId, game) {
    clearTimers(game);
    const v = game.voting;
    if (!v || v.paused || game.phase !== 'day') return;
    game._voteTimer = setTimeout(() => {
      game._voteTimer = null;
      if (getGame(roomId) !== game || !game.voting || game.phase !== 'day') return;
      L.voteTick(game);
      pushState(roomId);
      scheduleVoteTick(roomId, game);
    }, v.handSpeedMs);
    game._voteTimer.unref?.();
  }

  // ── 測試機器人（DEV_BOTS）────────────────────────────────────
  function botReply(roomId, game, prompt) {
    setTimeout(() => {
      if (getGame(roomId) !== game || game.phase !== 'night') return;
      const s = game.seats[prompt.seat];
      if (!s || game.prompts[s.playerId]?.id !== prompt.id) return;
      const options = game.seats.map((x, i) => i).filter(i => !game.seats[i].hasLeft && !(prompt.notSelf && i === prompt.seat));
      const targets = L.shuffle(options).slice(0, prompt.count);
      try { L.replyPrompt(game, s.playerId, prompt.id, targets); } catch { return; }
      pushState(roomId);
    }, BOT_REPLY_MS).unref?.();
  }

  function botHands(game) {
    game.seats.forEach((s, i) => {
      if (L.isBotId(s.playerId) && Math.random() < BOT_HAND_CHANCE) {
        try { L.setHand(game, i, true); } catch { /* 幽靈票用完等 */ }
      }
    });
  }

  // ── 結算 ─────────────────────────────────────────────────────
  async function awardScores(roomId, winnerIds) {
    for (const id of winnerIds) {
      const p = roomPlayers(roomId).find(x => x.id === id);
      if (!p) continue; // 機器人、已離開的人
      const score = (p.score ?? 0) + 1;
      _roomCache.updatePlayer(roomId, id, { score });
      try {
        await db.from('players').update({ score, updated_at: new Date().toISOString() }).eq('id', id);
      } catch (err) {
        console.error('[Clocktower] score update:', err.message);
      }
    }
    _broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: _roomCache.getPlayers(roomId) });
  }

  function afterWinner(roomId, game) {
    if (game.phase !== 'result') return;
    clearTimers(game);
    awardScores(roomId, game.winner.winnerIds).catch(err => console.error('[Clocktower score]', err.message));
  }

  // ── 房間 Hooks ───────────────────────────────────────────────
  const hooks = {
    appId:      APP_ID,
    minPlayers: 1,

    // 大廳以外（開局設定 / 遊戲中）新加入者成為觀戰者
    canJoinAsPlayer(roomId) {
      const game = getGame(roomId);
      return !game || game.phase === 'lobby';
    },

    spectatorCanUpgrade(roomId) {
      const game = getGame(roomId);
      return !game || game.phase === 'lobby';
    },

    // room:join-ack 帶的遊戲狀態：公開視圖（本人視圖隨後由 ct:state 補發）
    buildGameState(roomId) {
      const game = getGame(roomId);
      return game ? L.buildView(stripInternal(game), null) : null;
    },

    async onPlayerJoined(socket, roomId, playerId) {
      const game = ensureGame(roomId);
      sendScript(socket, game);
      maybeResume(roomId, game, playerId);
      pushState(roomId);
    },

    onSpectatorUpgraded(socket, roomId) {
      pushState(roomId);
    },

    onPlayerLeft(roomId, playerId, reason) {
      const game = getGame(roomId);
      if (!game) return;
      if (reason === 'disconnect') {
        // 一般玩家斷線：遊戲繼續、座位保留，重連後補發；說書人斷線 → 暫停
        maybePause(roomId, game, playerId);
        pushState(roomId);
        return;
      }
      handleLeft(roomId, playerId);
    },
  };

  const { roomCache, broadcast } = registerRoomHandlers(ns, db, hooks);
  _roomCache = roomCache;
  _broadcast = broadcast;

  // ── 遊戲事件 ─────────────────────────────────────────────────
  ns.on('connection', (socket) => {
    const ctx = (roomId) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId || socket.data.roomId !== roomId) return null;
      const game = getGame(roomId);
      return game ? { playerId, game } : null;
    };
    const asStoryteller = (roomId) => {
      const c = ctx(roomId);
      if (c) L.assertStoryteller(c.game, c.playerId);
      return c;
    };

    // 說書人是房間觀戰者時（遊戲中交接），room 模組不會通知離線 / 離開，這裡自行處理
    socket.on('disconnect', () => {
      const { roomId, playerId, isSpectator } = socket.data ?? {};
      if (!roomId || !isSpectator) return;
      const game = getGame(roomId);
      if (game && playerId === game.storytellerId) { maybePause(roomId, game, playerId); pushState(roomId); }
    });
    socket.on(EV.ROOM_LEAVE, () => {
      const { roomId, playerId, isSpectator } = socket.data ?? {};
      if (!roomId || !isSpectator) return;
      const game = getGame(roomId);
      if (game && playerId === game.storytellerId) handleLeft(roomId, playerId);
    });

    // 加入後索取自己的視圖（觀戰者不會觸發 onPlayerJoined）
    socket.on('ct:sync', ({ roomId } = {}) => {
      const c = ctx(roomId); if (!c) return;
      sendScript(socket, c.game);
      maybeResume(roomId, c.game, c.playerId);
      pushState(roomId);
    });

    // 指定 / 隨機抽說書人（房主，大廳）
    socket.on('ct:set-storyteller', ({ roomId, playerId, random } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!isHost(roomId, c.playerId)) throw new L.GameError('FORBIDDEN', '只有房主可以指定說書人');
        if (random) {
          const ids = roomPlayers(roomId).filter(p => p.is_online).map(p => p.id);
          const id = L.pickRandomStoryteller(c.game, ids);
          notice(roomId, `抽中說書人：${c.game.names[id] ?? '?'}`);
        } else {
          if (!roomPlayers(roomId).some(p => p.id === playerId)) throw new L.GameError('BAD_TARGET', '找不到這位玩家');
          L.setStoryteller(c.game, playerId);
        }
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 遊戲中把說書人交給觀戰者
    socket.on('ct:transfer-storyteller', ({ roomId, playerId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!inRoom(roomId, playerId) || !isConnected(roomId, playerId)) throw new L.GameError('BAD_TARGET', '對方不在線上');
        L.transferStoryteller(c.game, c.playerId, playerId);
        notice(roomId, `說書人交接給 ${c.game.names[playerId] ?? '?'}`);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:claim-seat', ({ roomId, seat } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        if (!roomPlayers(roomId).some(p => p.id === c.playerId)) throw new L.GameError('FORBIDDEN', '觀戰者請先加入房間');
        L.claimSeat(c.game, c.playerId, seat);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:arrange-seats', ({ roomId, a, b } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.swapSeats(c.game, a, b);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 開局設定（說書人）：begin（自動隨機配好全部）/ back / roles / random-roles / auto / drunk / bluffs / random-bluffs / settings / add-bots / remove-bots
    socket.on('ct:setup', ({ roomId, action, roles, roleId, bluffs, settings, count } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        const g = c.game;
        switch (action) {
          case 'begin':
            L.beginSetup(g);
            L.autoSetup(g);
            _roomCache.updateRoom(roomId, { status: 'playing' });
            break;
          case 'back':
            L.backToLobbyFromSetup(g);
            _roomCache.updateRoom(roomId, { status: 'waiting' });
            break;
          case 'roles': L.selectRoles(g, roles); break;
          case 'random-roles': L.randomRoles(g); break;
          case 'auto': L.autoSetup(g); break;
          case 'drunk': L.setDrunkAs(g, roleId); break;
          case 'bluffs': L.setBluffs(g, bluffs); break;
          case 'random-bluffs': L.randomBluffs(g); break;
          case 'settings': L.updateSettings(g, settings); break;
          case 'add-bots': L.addBots(g, count ?? Infinity); break;
          case 'remove-bots': L.removeBots(g); break;
          default: throw new L.GameError('BAD_ACTION', '未知的設定操作');
        }
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // setup 階段修改座位角色：set / swap / random
    socket.on('ct:assign-role', ({ roomId, action, seat, roleId, a, b } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        if (action === 'random') L.randomAssign(c.game);
        else if (action === 'swap') L.swapSeatRoles(c.game, a, b);
        else L.setSeatRole(c.game, seat, roleId);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:start', ({ roomId, force } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.startGame(c.game, { force: !!force });
        // 沒入座也不是說書人的房內玩家，本局視同觀戰者（由 buildView 依座位判斷）
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // ── 夜晚 ───────────────────────────────────────────────────
    socket.on('ct:wake', ({ roomId, seat, roleId, count, notSelf, text } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        const prompt = L.wake(c.game, seat, { roleId, count, notSelf, text, delayMs: nightDelay(c.game) });
        const target = c.game.seats[seat].playerId;
        pushState(roomId); // 目標玩家的視圖在延遲到期前不含這個 prompt
        deliverLater(roomId, c.game, target, prompt.visibleAt, () => {
          if (c.game.prompts[target]?.id !== prompt.id) return;
          for (const s of socketsOf(roomId, [target])) s.emit('ct:prompt', prompt);
          if (L.isBotId(target)) botReply(roomId, c.game, prompt);
        });
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:cancel-prompt', ({ roomId, seat } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.cancelPrompt(c.game, seat);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:prompt-reply', ({ roomId, promptId, targets } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.replyPrompt(c.game, c.playerId, promptId, targets);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:act-for', ({ roomId, seat, targets } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.actFor(c.game, seat, targets);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:send-info', ({ roomId, target, info } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        const g = c.game;
        const out = L.sendInfo(g, target, info, Date.now(), () => nightDelay(g));
        pushState(roomId); // 收件人的視圖在延遲到期前不含這則資訊
        for (const { playerId, message } of out) {
          deliverLater(roomId, g, playerId, message.visibleAt, () => {
            for (const s of socketsOf(roomId, [playerId])) s.emit('ct:info', message);
          });
        }
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:queue-done', ({ roomId, key, done } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.setQueueDone(c.game, key, done);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:reminder', ({ roomId, action, seat, reminderId, id } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        if (action === 'remove') L.removeReminder(c.game, id);
        else L.addReminder(c.game, seat, reminderId);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:set-dead', ({ roomId, seat, dead } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.setDead(c.game, seat, !!dead);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:change-role', ({ roomId, seat, roleId } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.changeRole(c.game, seat, roleId);
        if (!c.game.pendingWinner && c.game.phase === 'day') L.checkWinner(c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 天亮（night → day）/ 結束白天（處決 → night）
    socket.on('ct:phase', ({ roomId, to } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        if (to === 'dawn') L.toDawn(c.game);
        else if (to === 'night') {
          clearTimers(c.game);
          L.endDay(c.game);
        } else throw new L.GameError('BAD_ACTION', '未知的階段');
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // ── 白天 ───────────────────────────────────────────────────
    socket.on('ct:day-phase', ({ roomId, to } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.setDayPhase(c.game, to);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:nominate', ({ roomId, nominee } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.nominate(c.game, c.playerId, nominee);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:start-vote', ({ roomId, handSpeedMs } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.startVote(c.game, { handSpeedMs });
        if (L.DEV_BOTS) botHands(c.game);
        pushState(roomId);
        scheduleVoteTick(roomId, c.game);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:vote', ({ roomId, up } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const seat = L.activeSeatOf(c.game, c.playerId);
        if (seat < 0) throw new L.GameError('FORBIDDEN', '只有在座的玩家可以投票');
        L.setHand(c.game, seat, !!up);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 說書人：pause / resume / speed / cancel / hand（代座位舉手）
    socket.on('ct:vote-control', ({ roomId, action, seat, up, handSpeedMs } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        if (action === 'hand') L.setHand(c.game, seat, !!up, { by: 'storyteller' });
        else L.voteControl(c.game, { action, handSpeedMs });
        pushState(roomId);
        if (['resume', 'speed', 'pause', 'cancel'].includes(action)) scheduleVoteTick(roomId, c.game);
      } catch (err) { fail(socket, err); }
    });

    // ── 勝負 ───────────────────────────────────────────────────
    socket.on('ct:confirm-winner', ({ roomId, confirm } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.confirmWinner(c.game, !!confirm);
        afterWinner(roomId, c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:declare-winner', ({ roomId, team, reason } = {}) => {
      try {
        const c = asStoryteller(roomId); if (!c) return;
        L.declareWinner(c.game, team, reason);
        afterWinner(roomId, c.game);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    // 回大廳（說書人；沒有說書人時由房主）
    socket.on('ct:again', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const g = c.game;
        const allowed = g.storytellerId ? c.playerId === g.storytellerId : isHost(roomId, c.playerId);
        if (!allowed) throw new L.GameError('FORBIDDEN', '只有說書人可以回到大廳');
        if (!['result', 'setup'].includes(g.phase)) throw new L.GameError('BAD_PHASE', '遊戲進行中');
        clearTimers(g);
        L.resetToLobby(g, roomPlayers(roomId).map(p => p.id));
        _roomCache.updateRoom(roomId, { status: 'waiting' });
        pushState(roomId);
        for (const s of socketsInRoom(roomId)) if (s.data.isSpectator) s.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
      } catch (err) { fail(socket, err); }
    });

    // ── 聊天（增量推送 ct:chat-message；成員變動才重推 ct:state）──────────
    socket.on('ct:chat-public', ({ roomId, text } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const message = L.chatPublic(c.game, c.playerId, text);
        ns.to(roomId).emit('ct:chat-message', { channel: 'public', message });
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:whisper-invite', ({ roomId, playerIds } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const invites = L.whisperInvite(c.game, c.playerId, playerIds);
        for (const inv of invites) {
          for (const s of socketsOf(roomId, [inv.to])) s.emit('ct:whisper-invited', inv);
        }
        if (invites.length) {
          // 邀請過期時重推，讓雙方的邀請提示消失
          setTimeout(() => { if (getGame(roomId) === c.game) pushState(roomId); }, L.INVITE_TTL_MS + 100).unref?.();
        }
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:whisper-respond', ({ roomId, inviteId, accept } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        try {
          L.whisperRespond(c.game, c.playerId, inviteId, !!accept);
        } finally {
          pushState(roomId); // 失敗時也重推，讓失效的邀請消失
        }
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:whisper-leave', ({ roomId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        L.whisperLeave(c.game, c.playerId);
        pushState(roomId);
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:whisper-send', ({ roomId, text } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const { group, message } = L.whisperSend(c.game, c.playerId, text);
        const readers = [...new Set(group.memberLog.map(m => m.playerId))];
        for (const s of socketsOf(roomId, readers)) s.emit('ct:chat-message', { channel: 'whisper', groupId: group.id, message });
      } catch (err) { fail(socket, err); }
    });

    socket.on('ct:chat-storyteller', ({ roomId, text, toPlayerId } = {}) => {
      try {
        const c = ctx(roomId); if (!c) return;
        const { playerId, message } = L.chatStoryteller(c.game, c.playerId, text, toPlayerId);
        for (const s of socketsOf(roomId, [playerId, c.game.storytellerId])) {
          s.emit('ct:chat-message', { channel: 'storyteller', thread: playerId, message });
        }
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

  console.log('[Clocktower] /clocktower namespace registered (RoomModule enabled)');
}

module.exports = { registerNamespace, _games: games };
