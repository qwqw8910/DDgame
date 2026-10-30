'use strict';

// ================================================================
//  統一房間模組 — 核心入口
//
//  使用方式：
//    const { registerRoomHandlers } = require('./room');
//    registerRoomHandlers(namespace, db, hooks);
//
//  hooks（全部可選）：
//    hooks.appId               {string}   app 識別字串，設定後拒絕跨遊戲房間（未設則不驗證）
//    hooks.minPlayers          {number}   最低玩家數，預設 2
//    hooks.canJoinAsPlayer      {fn}       (roomId) => boolean
//    hooks.spectatorCanUpgrade  {fn}       (roomId) => boolean
//    hooks.buildGameState       {fn}       (roomId) => object|null
//    hooks.onPlayerJoined       {fn}       (socket, roomId, playerId, isReconnect)
//    hooks.onPlayerLeft         {fn}       (roomId, playerId, reason)
//    hooks.onSpectatorUpgraded  {fn}       (socket, roomId, playerId)
// ================================================================

const { RoomCache } = require('./RoomCache');
const EV = require('./events');

// 房主斷線後自動轉移的等待時間（毫秒）
const HOST_TRANSFER_DELAY_MS = 30 * 1000;

// Socket.io 連線狀態恢復：短暫斷線（切網路、進電梯、App 切背景）在時限內接回時，
// 伺服器還原 socket.data / 房間頻道並補送漏掉的廣播。new Server() 時傳入。
// 本模組沒有 middleware，恢復時可略過。伺服器重啟後無法恢復，client 會走一般 room:join 重連。
const CONNECTION_STATE_RECOVERY = {
  maxDisconnectionDuration: 2 * 60 * 1000,
  skipMiddlewares: true,
};

// DB 寫入不擋廣播：cache 已是真相來源，DB 只供伺服器重啟後重建
function persist(promise, label) {
  Promise.resolve(promise)
    .then(res => { if (res?.error) console.error(`[Room] ${label} DB error:`, res.error.message); })
    .catch(err => console.error(`[Room] ${label} DB error:`, err.message));
}

function registerRoomHandlers(namespace, db, hooks = {}) {
  // 正規化：若傳入的是 Server 實例而非 Namespace，取預設 namespace
  // Server.sockets 回傳的是 Namespace 物件；Namespace.sockets 才是 Map<socketId, Socket>
  if (!(namespace.sockets instanceof Map)) {
    namespace = namespace.sockets; // server.sockets === server.of('/')
  }

  const roomCache = new RoomCache(db);

  // ── 取得在線人數（玩家 socket 是否在 room channel） ────────────
  function getOnlineSockets(roomId) {
    return Array.from(namespace.sockets.values()).filter(
      s => s.data?.roomId === roomId
    );
  }

  // ── 找到某 playerId 對應的 socket ───────────────────────────
  function findSocket(playerId) {
    for (const s of namespace.sockets.values()) {
      if (s.data?.playerId === playerId) return s;
    }
    return null;
  }

  // ── 同一 playerId 在同房間是否還有「另一條」存活的連線 ──────
  function hasOtherLiveSocket(self, roomId, playerId) {
    for (const s of namespace.sockets.values()) {
      if (s !== self && s.data?.playerId === playerId && s.data?.roomId === roomId) return true;
    }
    return false;
  }

  // ── 廣播給玩家 + 觀戰者 ─────────────────────────────────────
  function broadcast(roomId, event, data) {
    namespace.to(roomId).emit(event, data);
  }

  // ── 發送 room:error 給單一 socket ───────────────────────────
  function sendError(socket, code, message) {
    socket.emit(EV.ROOM_ERROR, { code, message });
  }

  // ── 建構 join-ack payload ────────────────────────────────────
  async function buildJoinAck(roomId, playerId, type) {
    const entry = await roomCache.get(roomId);
    const gameState = hooks.buildGameState ? hooks.buildGameState(roomId) : null;
    return {
      type,
      room:       entry.room,
      players:    entry.players,
      spectators: entry.spectators,
      myPlayerId: playerId,
      gameState,
    };
  }

  // ── 房主轉移（內部工具）─────────────────────────────────────
  async function transferHostToNext(roomId, excludePlayerId) {
    const players = roomCache.getPlayers(roomId);
    const nextHost = players
      .filter(p => p.id !== excludePlayerId && p.is_online)
      .sort((a, b) => a.join_order - b.join_order)[0];

    if (!nextHost) return; // 全員離線，不轉移

    roomCache.updateRoom(roomId, { host_player_id: nextHost.id });
    broadcast(roomId, EV.ROOM_HOST_CHANGED, { newHostId: nextHost.id });
    persist(db.from('rooms')
      .update({ host_player_id: nextHost.id, updated_at: new Date().toISOString() })
      .eq('id', roomId), 'transferHost');
    console.log(`[Room] 房間 ${roomId} 房主轉移 → ${nextHost.id} (${nextHost.nickname})`);
  }

  // ── 連線 ────────────────────────────────────────────────────
  namespace.on('connection', (socket) => {
    // 短暫斷線後恢復：client 不會再送 room:join，由伺服器直接接回
    if (socket.recovered) handleRecovered(socket);

    // ── 建立房間 ────────────────────────────────────────────
    socket.on(EV.ROOM_CREATE, async ({ roomId, nickname, playerId, maxPlayers = 6, appId = '', options = {} }) => {
      if (!roomId || !nickname || !playerId) return;
      try {
        // 寫入 DB
        const { error: roomErr } = await db.from('rooms').insert({
          id:             roomId,
          host_player_id: playerId,
          max_players:    maxPlayers,
          app_id:         appId,
          status:         'waiting',
          updated_at:     new Date().toISOString(),
        });
        if (roomErr) throw roomErr;

        // 同一條 socket 還掛在別的房間 → 先離開（否則會殘留幽靈並繼續收到舊房廣播）
        await leaveCurrentRoom(socket, roomId);

        const now = new Date().toISOString();
        const { data: playerRow, error: pErr } = await db.from('players').upsert({
          id:         playerId,
          room_id:    roomId,
          nickname,
          is_online:  true,
          is_ready:   false,
          join_order: 0,
          score:      0,
          created_at: now,
          updated_at: now,
        }, { onConflict: 'id' }).select().single();
        if (pErr) throw pErr;

        // 初始化 cache
        roomCache.init(roomId, {
          room:    { id: roomId, host_player_id: playerId, max_players: maxPlayers, app_id: appId, status: 'waiting' },
          players: [playerRow],
        });

        socket.data = { roomId, playerId };
        socket.join(roomId);

        socket.emit(EV.ROOM_JOIN_ACK, await buildJoinAck(roomId, playerId, 'player'));

        // 通知遊戲模組：房主加入（初始化 csCache / 遊戲狀態）
        if (hooks.onPlayerJoined) {
          await hooks.onPlayerJoined(socket, roomId, playerId, false);
        }

        console.log(`[Room] 建立房間 ${roomId} by ${nickname} (app=${appId})`);

      } catch (err) {
        console.error('[Room:create]', err.message);
        // duplicate key：房主自己重試（例如上次 player 寫入失敗）→ 降級為加入；否則回報房號已存在
        if (err.message?.includes('duplicate key') || err.code === '23505') {
          const { data: existing } = await db.from('rooms')
            .select('host_player_id, status').eq('id', roomId).maybeSingle();
          if (existing && existing.status !== 'archived' && existing.host_player_id === playerId) {
            return handleJoin(socket, { roomId, nickname, playerId });
          }
          return sendError(socket, EV.ERR_ROOM_EXISTS, '此房號已被使用，請重新建立房間。');
        }
        sendError(socket, EV.ERR_CREATE_FAILED, '建立房間失敗：' + err.message);
      }
    });

    // ── 加入房間（含重連、觀戰）─────────────────────────────
    socket.on(EV.ROOM_JOIN, (payload) => handleJoin(socket, payload));

    // ── 觀戰者升為玩家 ──────────────────────────────────────
    socket.on(EV.ROOM_SPECTATOR_JOIN, async () => {
      const { roomId, playerId, isSpectator } = socket.data ?? {};
      if (!roomId || !playerId || !isSpectator) return;

      try {
        const entry = await roomCache.get(roomId);
        if (!entry) return;

        const spectator = entry.spectators.find(s => s.id === playerId);
        if (!spectator) return;

        // 再次確認可以加入
        if (hooks.spectatorCanUpgrade && !hooks.spectatorCanUpgrade(roomId)) {
          return sendError(socket, EV.ERR_JOIN_FAILED, '目前無法加入，請等待合適時機！');
        }
        if (entry.players.length >= entry.room.max_players) {
          return sendError(socket, EV.ERR_ROOM_FULL, '房間已滿！');
        }

        const joinOrder = entry.players.length;
        const now = new Date().toISOString();
        const { data: playerRow, error: pErr } = await db.from('players').upsert({
          id:         playerId,
          room_id:    roomId,
          nickname:   spectator.nickname,
          is_online:  true,
          is_ready:   false,
          join_order: joinOrder,
          score:      0,
          created_at: now,
          updated_at: now,
        }, { onConflict: 'id' }).select().single();
        if (pErr) throw pErr;

        roomCache.removeSpectator(roomId, playerId);
        roomCache.addPlayer(roomId, playerRow);
        socket.data = { roomId, playerId, isSpectator: false };

        socket.emit(EV.ROOM_JOIN_ACK, await buildJoinAck(roomId, playerId, 'player'));
        broadcast(roomId, EV.ROOM_PLAYER_JOINED, { player: playerRow });
        broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });
        broadcast(roomId, EV.ROOM_SPECTATORS_UPDATED, { spectators: roomCache.getSpectators(roomId) });

        if (hooks.onSpectatorUpgraded) {
          await hooks.onSpectatorUpgraded(socket, roomId, playerId);
        }

        console.log(`[Room] 觀戰升玩家 ${roomId}: ${spectator.nickname}`);
      } catch (err) {
        console.error('[Room:spectator-join]', err.message);
        sendError(socket, EV.ERR_JOIN_FAILED, '升級失敗：' + err.message);
      }
    });

    // ── 主動離開 ────────────────────────────────────────────
    // 客戶端需帶 ack 並等到回應再斷線：socket.io 會丟棄「斷線後才處理」的封包，
    // 若 leave 與 disconnect 背靠背送出，leave 會被吞掉、退出被誤判成掉線
    socket.on(EV.ROOM_LEAVE, async (ack) => {
      const { roomId, playerId, isSpectator } = socket.data ?? {};
      if (roomId && playerId) {
        await handlePlayerLeave(socket, roomId, playerId, isSpectator, 'leave');
      }
      if (typeof ack === 'function') ack();
    });

    // ── 踢人（房主）────────────────────────────────────────
    socket.on(EV.ROOM_KICK, async ({ targetPlayerId }) => {
      const { roomId, playerId } = socket.data ?? {};
      if (!roomId || !playerId || !targetPlayerId) return;

      try {
        const entry = await roomCache.get(roomId);
        if (!entry) return;

        if (entry.room.host_player_id !== playerId) {
          return sendError(socket, EV.ERR_FORBIDDEN, '只有房主可以踢人！');
        }
        if (targetPlayerId === playerId) {
          return sendError(socket, EV.ERR_CANNOT_KICK_SELF, '不能踢自己！');
        }

        const minPlayers = hooks.minPlayers ?? 2;
        const onlinePlayers = entry.players.filter(p => p.id !== targetPlayerId);
        if (onlinePlayers.length < minPlayers) {
          return sendError(socket, EV.ERR_KICK_BELOW_MIN,
            `踢出後只剩 ${onlinePlayers.length} 人，本遊戲至少需要 ${minPlayers} 人！`);
        }

        const targetSocket = findSocket(targetPlayerId);
        if (targetSocket) {
          targetSocket.emit(EV.ROOM_KICKED, { reason: '你被房主踢出了房間' });
          targetSocket.leave(roomId);
          targetSocket.data = {};
        }

        roomCache.removePlayer(roomId, targetPlayerId);
        try {
          await db.from('players').delete().eq('id', targetPlayerId).eq('room_id', roomId);
        } catch {}

        broadcast(roomId, EV.ROOM_PLAYER_LEFT, { playerId: targetPlayerId, reason: 'kick' });
        broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });

        if (hooks.onPlayerLeft) {
          hooks.onPlayerLeft(roomId, targetPlayerId, 'kick');
        }

        console.log(`[Room] 踢人 ${roomId}: ${targetPlayerId}`);
      } catch (err) {
        console.error('[Room:kick]', err.message);
      }
    });

    // ── 房主主動轉移 ────────────────────────────────────────
    socket.on(EV.ROOM_TRANSFER_HOST, async ({ targetPlayerId }) => {
      const { roomId, playerId } = socket.data ?? {};
      if (!roomId || !playerId || !targetPlayerId) return;

      try {
        const entry = await roomCache.get(roomId);
        if (!entry) return;
        if (entry.room.host_player_id !== playerId) {
          return sendError(socket, EV.ERR_FORBIDDEN, '只有房主可以轉移房主！');
        }
        const target = entry.players.find(p => p.id === targetPlayerId);
        if (!target) return sendError(socket, EV.ERR_ROOM_NOT_FOUND, '找不到目標玩家！');

        roomCache.updateRoom(roomId, { host_player_id: targetPlayerId });
        broadcast(roomId, EV.ROOM_HOST_CHANGED, { newHostId: targetPlayerId });
        persist(db.from('rooms')
          .update({ host_player_id: targetPlayerId, updated_at: new Date().toISOString() })
          .eq('id', roomId), 'transfer-host');
        console.log(`[Room] 主動轉移房主 ${roomId}: ${targetPlayerId}`);
      } catch (err) {
        console.error('[Room:transfer-host]', err.message);
      }
    });

    // ── 切換準備狀態 ────────────────────────────────────────
    socket.on(EV.ROOM_READY, async ({ ready }) => {
      const { roomId, playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      roomCache.updatePlayer(roomId, playerId, { is_ready: !!ready });
      broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });
      persist(db.from('players')
        .update({ is_ready: !!ready, updated_at: new Date().toISOString() })
        .eq('id', playerId), 'ready');
    });

    // ── 斷線處理 ────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const { roomId, playerId, isSpectator } = socket.data ?? {};
      if (!playerId) return;

      // 同一個人已用別條連線接手（重連 / 開了第二個分頁）→ 舊連線晚到的
      // disconnect 不能把他標成離線，也不能觸發房主轉移
      if (roomId && hasOtherLiveSocket(socket, roomId, playerId)) return;

      try {
        if (!roomId) return;
        const entry = await roomCache.get(roomId);
        if (!entry) return;

        if (isSpectator) {
          // 觀戰者直接移除
          roomCache.removeSpectator(roomId, playerId);
          broadcast(roomId, EV.ROOM_SPECTATORS_UPDATED, { spectators: roomCache.getSpectators(roomId) });
          return;
        }

        // 正式玩家：標記離線（不移除）
        // is_online 為 transient 狀態，只更新記憶體，不寫 DB
        roomCache.setPlayerOnline(roomId, playerId, false);

        broadcast(roomId, EV.ROOM_PLAYER_OFFLINE, { playerId });
        broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });

        // 通知遊戲邏輯（如檢查是否跳過此玩家）
        if (hooks.onPlayerLeft) {
          hooks.onPlayerLeft(roomId, playerId, 'disconnect');
        }

        // 房主斷線 → 30 秒後自動轉移
        if (entry.room.host_player_id === playerId) {
          const t = setTimeout(async () => {
            const current = await roomCache.get(roomId);
            if (!current) return;
            // 確認房主仍然是此玩家且仍然離線
            if (current.room.host_player_id !== playerId) return;
            const stillOffline = !current.players.find(p => p.id === playerId)?.is_online;
            if (stillOffline) {
              await transferHostToNext(roomId, playerId);
            }
          }, HOST_TRANSFER_DELAY_MS);
          t.unref();
        }

        console.log(`[Room] 斷線 ${roomId}: ${playerId}`);
      } catch (err) {
        console.error('[Room:disconnect]', err.message);
      }
    });
  });

  // ── 加入房間（含重連、觀戰）：ROOM_JOIN 與 create 的 duplicate 降級共用 ──
  async function handleJoin(socket, { roomId, nickname, playerId } = {}) {
    if (!roomId || !nickname || !playerId) return;
    try {
      // 從 cache（或 DB 重建）取得房間
      const entry = await roomCache.get(roomId);

      if (!entry) {
        // 嘗試讀 archived
        const { data: archivedRoom } = await db.from('rooms')
          .select('status').eq('id', roomId).maybeSingle();
        const code = archivedRoom?.status === 'archived'
          ? EV.ERR_ROOM_ARCHIVED : EV.ERR_ROOM_NOT_FOUND;
        return sendError(socket, code, code === EV.ERR_ROOM_ARCHIVED
          ? '此房間已結束（逾 30 分鐘），請重新建立。'
          : '找不到這個房間！');
      }

      const { room, players, spectators } = entry;

      // 跨 app 房間隔離：若 register 時帶 appId，拒絕加入屬於其他 app 的房間
      if (hooks.appId !== undefined) {
        if ((room.app_id || '') !== (hooks.appId || '')) {
          return sendError(socket, EV.ERR_WRONG_APP,
            '此房號屬於其他遊戲，無法加入。');
        }
      }

      // 判斷重連 or 新玩家 or 觀戰
      const existingPlayer = players.find(p => p.id === playerId);

      if (existingPlayer) {
        // ── 重連 ──────────────────────────────────────────
        await leaveCurrentRoom(socket, roomId);

        // is_online 為 transient 狀態，只更新記憶體，不寫 DB
        roomCache.setPlayerOnline(roomId, playerId, true);

        socket.data = { roomId, playerId };
        socket.join(roomId);

        socket.emit(EV.ROOM_JOIN_ACK, await buildJoinAck(roomId, playerId, 'reconnect'));
        broadcast(roomId, EV.ROOM_PLAYER_RECONNECTED, { playerId, nickname });
        broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });

        // 補發遊戲狀態
        if (hooks.onPlayerJoined) {
          await hooks.onPlayerJoined(socket, roomId, playerId, true);
        }

        console.log(`[Room] 重連 ${roomId}: ${nickname}`);

      } else {
        // 暱稱重複檢查
        const nickTaken = players.some(p => p.nickname === nickname);
        if (nickTaken) {
          return sendError(socket, EV.ERR_NICKNAME_TAKEN, '此暱稱已被使用，請換一個！');
        }

        // 判斷能否加入為玩家
        const canJoin = hooks.canJoinAsPlayer
          ? hooks.canJoinAsPlayer(roomId)
          : (room.status === 'waiting');

        if (!canJoin) {
          // ── 觀戰 ────────────────────────────────────────
          await leaveCurrentRoom(socket, roomId);
          roomCache.addSpectator(roomId, { id: playerId, nickname });
          socket.data = { roomId, playerId, isSpectator: true, nickname }; // nickname：恢復連線時重建觀戰者
          socket.join(roomId);

          socket.emit(EV.ROOM_JOIN_ACK, await buildJoinAck(roomId, playerId, 'spectator'));
          broadcast(roomId, EV.ROOM_SPECTATOR_JOINED, { spectator: { id: playerId, nickname } });
          broadcast(roomId, EV.ROOM_SPECTATORS_UPDATED, { spectators: roomCache.getSpectators(roomId) });

          // 檢查是否已可立即升為玩家
          if (hooks.spectatorCanUpgrade && hooks.spectatorCanUpgrade(roomId)) {
            socket.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
          }

          console.log(`[Room] 觀戰 ${roomId}: ${nickname}`);
          return;
        }

        // ── 新玩家加入 ───────────────────────────────────
        if (players.length >= room.max_players) {
          return sendError(socket, EV.ERR_ROOM_FULL, `房間已滿（最多 ${room.max_players} 人）！`);
        }

        // 先離開舊房（必須在 upsert 之前：離開時會刪掉舊房的 players 列）
        await leaveCurrentRoom(socket, roomId);

        const joinOrder = players.length;
        const now = new Date().toISOString();
        const { data: playerRow, error: pErr } = await db.from('players').upsert({
          id:         playerId,
          room_id:    roomId,
          nickname,
          is_online:  true,
          is_ready:   false,
          join_order: joinOrder,
          score:      0,
          created_at: now,
          updated_at: now,
        }, { onConflict: 'id' }).select().single();
        if (pErr) throw pErr;

        roomCache.addPlayer(roomId, playerRow);
        socket.data = { roomId, playerId };
        socket.join(roomId);

        socket.emit(EV.ROOM_JOIN_ACK, await buildJoinAck(roomId, playerId, 'player'));
        socket.to(roomId).emit(EV.ROOM_PLAYER_JOINED, { player: playerRow });
        broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });

        if (hooks.onPlayerJoined) {
          await hooks.onPlayerJoined(socket, roomId, playerId, false);
        }

        console.log(`[Room] 加入 ${roomId}: ${nickname}`);
      }

    } catch (err) {
      console.error('[Room:join]', err.message);
      sendError(socket, EV.ERR_JOIN_FAILED, '加入房間失敗：' + err.message);
    }
  }

  // ── 連線狀態恢復：與 room:join 重連相同的效果，但不必等 client 重送 ─────
  // socket.io 已還原 socket.data 與房間頻道、補送漏掉的廣播（先於此處送出），
  // 這裡再把人標回在線，並補發 join-ack 與遊戲狀態（斷線期間單獨發給他的事件不會被補送）
  async function handleRecovered(socket) {
    const { roomId, playerId, isSpectator, nickname } = socket.data ?? {};
    if (!roomId || !playerId) return;
    try {
      const entry = await roomCache.get(roomId);
      const player = entry?.players.find(p => p.id === playerId);

      // 斷線期間被踢出 / 房間已封存 → 座位已不在
      if (!entry || (!isSpectator && !player)) {
        socket.leave(roomId);
        socket.data = {};
        socket.emit(EV.ROOM_KICKED, { reason: entry ? '你已不在這個房間' : '房間已結束' });
        return;
      }

      if (isSpectator) {
        // 觀戰者斷線時已被移除 → 加回去
        roomCache.addSpectator(roomId, { id: playerId, nickname });
        socket.emit(EV.ROOM_JOIN_ACK, await buildJoinAck(roomId, playerId, 'spectator'));
        broadcast(roomId, EV.ROOM_SPECTATORS_UPDATED, { spectators: roomCache.getSpectators(roomId) });
        if (hooks.spectatorCanUpgrade && hooks.spectatorCanUpgrade(roomId)) {
          socket.emit(EV.ROOM_SPECTATOR_CAN_JOIN);
        }
        console.log(`[Room] 恢復連線（觀戰）${roomId}: ${nickname}`);
        return;
      }

      roomCache.setPlayerOnline(roomId, playerId, true);
      socket.emit(EV.ROOM_JOIN_ACK, await buildJoinAck(roomId, playerId, 'reconnect'));
      broadcast(roomId, EV.ROOM_PLAYER_RECONNECTED, { playerId, nickname: player.nickname });
      broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });

      if (hooks.onPlayerJoined) {
        await hooks.onPlayerJoined(socket, roomId, playerId, true);
      }
      console.log(`[Room] 恢復連線 ${roomId}: ${player.nickname}`);
    } catch (err) {
      console.error('[Room:recover]', err.message);
    }
  }

  // ── 內部輔助：socket 換房前先離開目前所在的房間 ───────────────
  // playerId 全站共用、同一條 socket 可能沒斷線就去建／加入另一間；
  // 不先離開的話，舊房會留下「在線」的幽靈（房主不轉移、永不封存），
  // 而且這條 socket 仍在舊房頻道，會收到舊房的廣播。
  async function leaveCurrentRoom(socket, nextRoomId) {
    const { roomId, playerId, isSpectator } = socket.data ?? {};
    if (!roomId || roomId === nextRoomId) return;
    await handlePlayerLeave(socket, roomId, playerId, isSpectator, 'leave');
    socket.leave(roomId); // 舊房 cache 已不存在時 handlePlayerLeave 會提早 return
    socket.data = {};
  }

  // ── 內部輔助：處理玩家主動離開 ─────────────────────────────
  async function handlePlayerLeave(socket, roomId, playerId, isSpectator, reason) {
    try {
      const entry = await roomCache.get(roomId);
      if (!entry) return;

      if (isSpectator) {
        roomCache.removeSpectator(roomId, playerId);
        socket.leave(roomId);
        socket.data = {};
        broadcast(roomId, EV.ROOM_SPECTATORS_UPDATED, { spectators: roomCache.getSpectators(roomId) });
        return;
      }

      const wasHost = entry.room.host_player_id === playerId;

      roomCache.removePlayer(roomId, playerId);
      try {
        await db.from('players').delete().eq('id', playerId).eq('room_id', roomId);
      } catch {}

      socket.leave(roomId);
      socket.data = {};

      broadcast(roomId, EV.ROOM_PLAYER_LEFT, { playerId, reason });
      broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });

      if (hooks.onPlayerLeft) {
        hooks.onPlayerLeft(roomId, playerId, reason);
      }

      // 房主離開 → 立即轉移
      if (wasHost) {
        await transferHostToNext(roomId, playerId);
      }

      console.log(`[Room] 離開 ${roomId}: ${playerId} (${reason})`);
    } catch (err) {
      console.error('[Room:leave]', err.message);
    }
  }

  // ── 對外暴露 cache（供遊戲邏輯讀寫）────────────────────────
  return { roomCache, broadcast };
}

module.exports = { registerRoomHandlers, CONNECTION_STATE_RECOVERY };
