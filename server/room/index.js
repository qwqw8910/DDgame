'use strict';

// ================================================================
//  統一房間模組 — 核心入口
//
//  使用方式：
//    const { registerRoomHandlers } = require('./room');
//    registerRoomHandlers(namespace, db, hooks);
//
//  hooks（全部可選）：
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
    try {
      await db.from('rooms')
        .update({ host_player_id: nextHost.id, updated_at: new Date().toISOString() })
        .eq('id', roomId);
    } catch (err) {
      console.error('[Room] transferHost DB error:', err.message);
    }

    broadcast(roomId, EV.ROOM_HOST_CHANGED, { newHostId: nextHost.id });
    console.log(`[Room] 房間 ${roomId} 房主轉移 → ${nextHost.id} (${nextHost.nickname})`);
  }

  // ── 連線 ────────────────────────────────────────────────────
  namespace.on('connection', (socket) => {

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
        console.log(`[Room] 建立房間 ${roomId} by ${nickname} (app=${appId})`);

      } catch (err) {
        console.error('[Room:create]', err.message);
        // duplicate key → 降級為加入
        if (err.message?.includes('duplicate key') || err.code === '23505') {
          socket.emit(EV.ROOM_CREATE, { roomId, nickname, playerId });
          return;
        }
        sendError(socket, EV.ERR_CREATE_FAILED, '建立房間失敗：' + err.message);
      }
    });

    // ── 加入房間（含重連、觀戰）─────────────────────────────
    socket.on(EV.ROOM_JOIN, async ({ roomId, nickname, playerId }) => {
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

        // 判斷重連 or 新玩家 or 觀戰
        const existingPlayer = players.find(p => p.id === playerId);

        if (existingPlayer) {
          // ── 重連 ──────────────────────────────────────────
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
            roomCache.addSpectator(roomId, { id: playerId, nickname });
            socket.data = { roomId, playerId, isSpectator: true };
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
    });

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
    socket.on(EV.ROOM_LEAVE, async () => {
      const { roomId, playerId, isSpectator } = socket.data ?? {};
      if (!roomId || !playerId) return;
      await handlePlayerLeave(socket, roomId, playerId, isSpectator, 'leave');
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
          await db.from('players').delete().eq('id', targetPlayerId);
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
        await db.from('rooms')
          .update({ host_player_id: targetPlayerId, updated_at: new Date().toISOString() })
          .eq('id', roomId);

        broadcast(roomId, EV.ROOM_HOST_CHANGED, { newHostId: targetPlayerId });
        console.log(`[Room] 主動轉移房主 ${roomId}: ${targetPlayerId}`);
      } catch (err) {
        console.error('[Room:transfer-host]', err.message);
      }
    });

    // ── 切換準備狀態 ────────────────────────────────────────
    socket.on(EV.ROOM_READY, async ({ ready }) => {
      const { roomId, playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        roomCache.updatePlayer(roomId, playerId, { is_ready: !!ready });
        await db.from('players')
          .update({ is_ready: !!ready, updated_at: new Date().toISOString() })
          .eq('id', playerId);
        broadcast(roomId, EV.ROOM_PLAYERS_UPDATED, { players: roomCache.getPlayers(roomId) });
      } catch (err) {
        console.error('[Room:ready]', err.message);
      }
    });

    // ── 斷線處理 ────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const { roomId, playerId, isSpectator } = socket.data ?? {};
      if (!playerId) return;

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
          setTimeout(async () => {
            const current = await roomCache.get(roomId);
            if (!current) return;
            // 確認房主仍然是此玩家且仍然離線
            if (current.room.host_player_id !== playerId) return;
            const stillOffline = !current.players.find(p => p.id === playerId)?.is_online;
            if (stillOffline) {
              await transferHostToNext(roomId, playerId);
            }
          }, HOST_TRANSFER_DELAY_MS);
        }

        console.log(`[Room] 斷線 ${roomId}: ${playerId}`);
      } catch (err) {
        console.error('[Room:disconnect]', err.message);
      }
    });
  });

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
        await db.from('players').delete().eq('id', playerId);
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

module.exports = { registerRoomHandlers };
