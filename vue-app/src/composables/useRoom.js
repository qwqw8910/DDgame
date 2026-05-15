// ================================================================
//  統一房間模組 — 前端 Composable：useRoom()
//
//  提供所有 room:* 事件的響應式狀態與操作方法。
//  每個遊戲的 composable（useSocket / useCharacterStorm）應引用此模組
//  處理房間部分，自行處理遊戲專屬部分。
//
//  使用方式：
//    const { roomState, connectRoom, leaveRoom, kickPlayer, ... } = useRoom(socket)
//
//  room:join-ack payload：
//    { type: 'player'|'reconnect'|'spectator', room, players, spectators, myPlayerId, gameState }
// ================================================================

import { reactive, readonly } from 'vue'

// ── 事件名稱常數（與 server/room/events.js 保持一致）────────
export const ROOM_EVENTS = {
  // Client → Server
  CREATE:         'room:create',
  JOIN:           'room:join',
  LEAVE:          'room:leave',
  KICK:           'room:kick',
  READY:          'room:ready',
  TRANSFER_HOST:  'room:transfer-host',
  SPECTATOR_JOIN: 'room:spectator-join',

  // Server → Client
  JOIN_ACK:            'room:join-ack',
  PLAYER_JOINED:       'room:player-joined',
  PLAYER_RECONNECTED:  'room:player-reconnected',
  PLAYER_OFFLINE:      'room:player-offline',
  PLAYER_LEFT:         'room:player-left',
  PLAYERS_UPDATED:     'room:players-updated',
  SPECTATOR_JOINED:    'room:spectator-joined',
  SPECTATOR_CAN_JOIN:  'room:spectator-can-join',
  SPECTATORS_UPDATED:  'room:spectators-updated',
  HOST_CHANGED:        'room:host-changed',
  KICKED:              'room:kicked',
  ERROR:               'room:error',
  CLOSED:              'room:closed',

  // ── Error codes（保持與 server/room/events.js 同步） ───────
  ERR_WRONG_APP: 'ROOM_WRONG_APP',
}

/**
 * 建立共用房間狀態與 socket 事件綁定。
 *
 * @param {import('socket.io-client').Socket} socket - 已建立的 socket 實例
 * @param {object} callbacks - 可選回調
 *   callbacks.onJoinAck(data)         - 收到 join-ack（含 gameState）
 *   callbacks.onPlayersUpdated(players)
 *   callbacks.onKicked(reason)
 *   callbacks.onHostChanged(newHostId)
 *   callbacks.onSpectatorCanJoin()
 *   callbacks.onRoomError(code, message)
 */
export function useRoom(socket, callbacks = {}) {
  const roomState = reactive({
    // 房間
    roomId:    '',
    room:      null,
    // 玩家清單
    players:   [],
    spectators: [],
    // 自身身份
    myPlayerId: '',
    myNickname: '',
    isHost:     false,
    isSpectator: false,
    // 連線
    connected:      false,
    // 加入類型（'player' | 'reconnect' | 'spectator'）
    joinType: null,
    // 觀戰者可升為玩家
    spectatorCanJoin: false,
    // 錯誤
    error:     '',
    errorCode: '',
    // 遊戲狀態（由後端 buildGameState hook 決定內容，透傳給遊戲 composable）
    gameState: null,
  })

  let _handlersRegistered = false

  function _registerHandlers() {
    if (_handlersRegistered) return
    _handlersRegistered = true

    socket.on('connect',    () => { roomState.connected = true })
    socket.on('disconnect', () => { roomState.connected = false })

    // ── 加入/重連確認 ───────────────────────────────────────
    socket.on(ROOM_EVENTS.JOIN_ACK, (data) => {
      roomState.joinType  = data.type
      roomState.room      = data.room
      roomState.players   = data.players   ?? []
      roomState.spectators = data.spectators ?? []
      roomState.myPlayerId = data.myPlayerId
      roomState.gameState  = data.gameState ?? null
      roomState.isHost     = data.room?.host_player_id === data.myPlayerId
      roomState.isSpectator = data.type === 'spectator'
      roomState.error      = ''
      callbacks.onJoinAck?.(data)
    })

    // ── 玩家清單更新 ────────────────────────────────────────
    socket.on(ROOM_EVENTS.PLAYERS_UPDATED, ({ players }) => {
      roomState.players = players
      roomState.isHost  = roomState.room?.host_player_id === roomState.myPlayerId
      callbacks.onPlayersUpdated?.(players)
    })

    // ── 新玩家加入 ──────────────────────────────────────────
    socket.on(ROOM_EVENTS.PLAYER_JOINED, ({ player }) => {
      const idx = roomState.players.findIndex(p => p.id === player.id)
      if (idx === -1) roomState.players.push(player)
      else roomState.players[idx] = { ...roomState.players[idx], ...player }
    })

    // ── 玩家重連 ────────────────────────────────────────────
    socket.on(ROOM_EVENTS.PLAYER_RECONNECTED, ({ playerId, nickname }) => {
      const idx = roomState.players.findIndex(p => p.id === playerId)
      if (idx >= 0) roomState.players[idx] = { ...roomState.players[idx], is_online: true, nickname }
    })

    // ── 玩家離線 ────────────────────────────────────────────
    socket.on(ROOM_EVENTS.PLAYER_OFFLINE, ({ playerId }) => {
      const idx = roomState.players.findIndex(p => p.id === playerId)
      if (idx >= 0) roomState.players[idx] = { ...roomState.players[idx], is_online: false }
    })

    // ── 玩家離開 ────────────────────────────────────────────
    socket.on(ROOM_EVENTS.PLAYER_LEFT, ({ playerId }) => {
      roomState.players = roomState.players.filter(p => p.id !== playerId)
    })

    // ── 觀戰者清單更新 ──────────────────────────────────────
    socket.on(ROOM_EVENTS.SPECTATORS_UPDATED, ({ spectators }) => {
      roomState.spectators = spectators
    })

    // ── 觀戰者現在可升為玩家 ────────────────────────────────
    socket.on(ROOM_EVENTS.SPECTATOR_CAN_JOIN, () => {
      roomState.spectatorCanJoin = true
      callbacks.onSpectatorCanJoin?.()
    })

    // ── 房主更換 ────────────────────────────────────────────
    socket.on(ROOM_EVENTS.HOST_CHANGED, ({ newHostId }) => {
      if (roomState.room) roomState.room = { ...roomState.room, host_player_id: newHostId }
      roomState.isHost = newHostId === roomState.myPlayerId
      callbacks.onHostChanged?.(newHostId)
    })

    // ── 被踢出 ──────────────────────────────────────────────
    socket.on(ROOM_EVENTS.KICKED, ({ reason } = {}) => {
      callbacks.onKicked?.(reason)
    })

    // ── 房間錯誤 ────────────────────────────────────────────
    socket.on(ROOM_EVENTS.ERROR, ({ code, message }) => {
      roomState.error     = message
      roomState.errorCode = code
      callbacks.onRoomError?.(code, message)
    })
  }

  // ── 房間操作 ─────────────────────────────────────────────────

  /**
   * 建立新房間並加入（房主）。
   * @param {object} opts - { roomId, nickname, playerId, maxPlayers, appId, options }
   */
  function createRoom({ roomId, nickname, playerId, maxPlayers = 6, appId = '', options = {} }) {
    _registerHandlers()
    roomState.roomId     = roomId
    roomState.myPlayerId = playerId
    roomState.myNickname = nickname

    const doEmit = () =>
      socket.emit(ROOM_EVENTS.CREATE, { roomId, nickname, playerId, maxPlayers, appId, options })

    if (!socket.connected) {
      socket.once('connect', doEmit)
      socket.connect()
    } else {
      doEmit()
    }
  }

  /**
   * 加入既有房間（或重連）。
   * @param {object} opts - { roomId, nickname, playerId }
   */
  function joinRoom({ roomId, nickname, playerId }) {
    _registerHandlers()
    roomState.roomId     = roomId
    roomState.myPlayerId = playerId
    roomState.myNickname = nickname

    const doEmit = () =>
      socket.emit(ROOM_EVENTS.JOIN, { roomId, nickname, playerId })

    if (!socket.connected) {
      socket.once('connect', doEmit)
      socket.connect()
    } else {
      doEmit()
    }
  }

  /** socket 重連後自動重送 join（由遊戲 composable 的 connect 事件呼叫） */
  function rejoinOnReconnect() {
    if (roomState.myNickname && roomState.roomId && roomState.myPlayerId) {
      socket.emit(ROOM_EVENTS.JOIN, {
        roomId:   roomState.roomId,
        nickname: roomState.myNickname,
        playerId: roomState.myPlayerId,
      })
    }
  }

  /** 主動離開房間 */
  function leaveRoom() {
    socket.emit(ROOM_EVENTS.LEAVE)
  }

  /** 觀戰者升為玩家 */
  function upgradeFromSpectator() {
    socket.emit(ROOM_EVENTS.SPECTATOR_JOIN)
    roomState.spectatorCanJoin = false
  }

  /** 切換準備狀態 */
  function setReady(ready) {
    socket.emit(ROOM_EVENTS.READY, { ready: !!ready })
  }

  /** 踢出玩家（僅房主） */
  function kickPlayer(targetPlayerId) {
    socket.emit(ROOM_EVENTS.KICK, { targetPlayerId })
  }

  /** 轉移房主 */
  function transferHost(targetPlayerId) {
    socket.emit(ROOM_EVENTS.TRANSFER_HOST, { targetPlayerId })
  }

  /** 產生邀請連結（遊戲路由由呼叫方提供） */
  function copyInviteLink(routePath) {
    const base = window.location.href.split('#')[0]
    const link = `${base}#${routePath}?room=${roomState.roomId}`
    navigator.clipboard.writeText(link).catch(() => {})
    return link
  }

  return {
    roomState: readonly(roomState),
    createRoom,
    joinRoom,
    rejoinOnReconnect,
    leaveRoom,
    upgradeFromSpectator,
    setReady,
    kickPlayer,
    transferHost,
    copyInviteLink,
    ROOM_EVENTS,
  }
}
