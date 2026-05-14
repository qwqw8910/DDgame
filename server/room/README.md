# 統一房間模組 (`server/room/`)

提供所有遊戲共用的房間管理功能。每個遊戲的 namespace 只需呼叫 `registerRoomHandlers()` 並實作自己的 hooks，即可獲得完整的房間進出、踢人、房主轉移、斷線重連、觀戰等能力。

---

## 快速上手

```javascript
const { registerRoomHandlers } = require('../room');

const { roomCache, broadcast } = registerRoomHandlers(namespace, db, {
  minPlayers: 4,                // 最低玩家人數（決定踢人下限）

  canJoinAsPlayer(roomId) {
    // 遊戲進行中是否允許加入？
    const game = myGameCache[roomId];
    return game?.roundPhase === 'waiting' || game?.roundPhase === 'finished';
  },

  spectatorCanUpgrade(roomId) {
    // 觀戰者目前可以升格為玩家嗎？
    const game = myGameCache[roomId];
    return game?.roundPhase === 'revealing';
  },

  buildGameState(roomId) {
    // 提供給 room:join-ack 的遊戲狀態（回傳 null = 無遊戲資料）
    const game = myGameCache[roomId];
    if (!game) return null;
    return {
      roundPhase: game.roundPhase,
      timerRemaining: game.timerRemaining,
      // ...任何前端重連時需要的資料
    };
  },

  async onPlayerJoined(socket, roomId, playerId, isReconnect) {
    if (!isReconnect) return;
    // 重連時補發遊戲特定資料（角色、計時器等）
    const game = myGameCache[roomId];
    if (game?.myRole?.[playerId]) {
      socket.emit('my-game:role-assigned', { role: game.myRole[playerId] });
    }
  },

  async onPlayerLeft(roomId, playerId, reason) {
    // 'kick' | 'leave' | 'disconnect'
    // 根據遊戲規則處理玩家消失（跳回合、重算分數等）
    const game = myGameCache[roomId];
    if (!game) return;
    if (game.subjectPlayerId === playerId) {
      advanceToNextRound(roomId);
    }
  },

  async onSpectatorUpgraded(socket, roomId, playerId) {
    // 觀戰者升格為玩家後，初始化其遊戲狀態
  },
});
```

---

## 回傳值

```javascript
const { roomCache, broadcast } = registerRoomHandlers(...);
```

| 名稱 | 類型 | 說明 |
|------|------|------|
| `roomCache` | `RoomCache` | 房間/玩家快取（詳見 [RoomCache API](#roomcache-api)）|
| `broadcast` | `(roomId, event, data) => void` | 廣播到整個房間（namespace channel）|

---

## Hooks 說明

所有 hooks 均為可選。

| Hook | 型別 | 何時呼叫 | 說明 |
|------|------|----------|------|
| `minPlayers` | `number` | 踢人時 | 踢出後若低於此數則阻止，預設 `2` |
| `canJoinAsPlayer(roomId)` | `boolean` | 新玩家嘗試加入時 | `false` → 進入觀戰席 |
| `spectatorCanUpgrade(roomId)` | `boolean` | 觀戰者送出 `room:spectator-join` 時 | `false` → 拒絕升格 |
| `buildGameState(roomId)` | `object \| null` | 建構 `room:join-ack` 時 | 回傳值放入 `payload.gameState` |
| `onPlayerJoined(socket, roomId, playerId, isReconnect)` | `async fn` | 玩家加入/重連後 | 補發遊戲特定事件 |
| `onPlayerLeft(roomId, playerId, reason)` | `async fn` | 踢出 / 主動離開 / 斷線後 | 處理遊戲邏輯 |
| `onSpectatorUpgraded(socket, roomId, playerId)` | `async fn` | 觀戰者升格後 | 初始化玩家遊戲狀態 |

---

## 前端事件對照表

### Client → Server

| 事件 | Payload | 說明 |
|------|---------|------|
| `room:create` | `{ roomId, nickname, playerId, maxPlayers, appId, options }` | 建立並加入房間 |
| `room:join` | `{ roomId, nickname, playerId }` | 加入或重連 |
| `room:leave` | — | 主動離開 |
| `room:kick` | `{ targetPlayerId }` | 踢出玩家（僅房主）|
| `room:ready` | `{ ready: boolean }` | 切換準備狀態 |
| `room:transfer-host` | `{ targetPlayerId }` | 主動轉移房主 |
| `room:spectator-join` | — | 觀戰者申請升格 |

### Server → Client

| 事件 | Payload | 說明 |
|------|---------|------|
| `room:join-ack` | `{ type, room, players, spectators, myPlayerId, gameState }` | 加入確認（`type`: `'player'` / `'reconnect'` / `'spectator'`）|
| `room:players-updated` | `{ players }` | 玩家清單有任何變更 |
| `room:player-joined` | `{ player }` | 新玩家加入（廣播給其他人）|
| `room:player-reconnected` | `{ playerId, nickname }` | 玩家重連 |
| `room:player-offline` | `{ playerId }` | 玩家斷線（保留在名單）|
| `room:player-left` | `{ playerId, reason }` | 玩家離開（移出名單，`reason`: `'kick'`/`'leave'`）|
| `room:spectator-joined` | `{ spectator }` | 新觀戰者加入 |
| `room:spectators-updated` | `{ spectators }` | 觀戰者清單變更 |
| `room:spectator-can-join` | — | 通知觀戰者現可升格 |
| `room:host-changed` | `{ newHostId }` | 房主變動 |
| `room:kicked` | `{ reason }` | 告知被踢出的玩家 |
| `room:error` | `{ code, message }` | 操作失敗 |

---

## RoomCache API

```javascript
// 初始化（建立房間時）
roomCache.init(roomId, { room, players, spectators });

// 非同步取得（含 DB fallback）
const entry = await roomCache.get(roomId); // { room, players, spectators, gameData }

// 同步快速取得（僅 in-memory，不做 DB fallback）
const entry = roomCache.getEntry(roomId);

// 房間資料
roomCache.updateRoom(roomId, updates);

// 玩家
roomCache.addPlayer(roomId, player);
roomCache.updatePlayer(roomId, playerId, updates);
roomCache.removePlayer(roomId, playerId);
roomCache.setPlayerOnline(roomId, playerId, isOnline);
roomCache.getPlayers(roomId);          // [{ id, nickname, is_ready, is_online, join_order, score, ... }]

// 觀戰者
roomCache.addSpectator(roomId, spectator);
roomCache.removeSpectator(roomId, spectatorId);
roomCache.getSpectators(roomId);

// 遊戲資料（各遊戲自行管理）
roomCache.setGameData(roomId, data);
roomCache.getGameData(roomId);
```

### 封存機制

全員離線後，等待 **30 分鐘**才封存（`rooms.status = 'archived'` 並清除 cache）。只要有任何玩家上線，計時器就重置。

---

## 錯誤碼

| Code | 說明 |
|------|------|
| `ROOM_NOT_FOUND` | 找不到房間 |
| `ROOM_FULL` | 人數已滿 |
| `ROOM_ARCHIVED` | 房間已封存 |
| `NICKNAME_TAKEN` | 暱稱重複 |
| `FORBIDDEN` | 無權限（非房主操作） |
| `CANNOT_KICK_SELF` | 不能踢自己 |
| `KICK_BELOW_MIN` | 踢出後低於最少人數 |
| `CREATE_FAILED` | 建立房間失敗 |
| `JOIN_FAILED` | 加入失敗 |

---

## 目前使用此模組的遊戲

| 遊戲 | Namespace | 最少玩家 | 觀戰 | 中途加入 |
|------|-----------|---------|------|---------|
| 默契傳聲筒 | `/character-storm` | 4 | ✅ 可升格為玩家 | 等待 / 結算階段可加入 |
| 懂我再說 | `/` (default) | 2 | ❌ | ✅ 隨時可加入 |
