// ================================================================
//  點格棋 — Socket.io Composable（對照 useSameWord.js）
//  房間部分由共用 useRoom() 處理；本檔只處理 db:* 遊戲事件。
//  伺服器每次狀態變動都推一份完整視圖（db:state），觀戰者與玩家同一份，只有 mySeat 不同。
// ================================================================
import { reactive, readonly } from 'vue'
import { io } from 'socket.io-client'
import { getOrCreatePlayerId } from '@/shared/data/identity.js'
import { useRoom } from '@/shared/composables/useRoom.js'
import { SERVER_URL } from '@/shared/api/config.js'
import { APP_ID, MAX_PLAYERS } from '../data/constants.js'

let _socket = null

function getSocket() {
  if (!_socket) {
    _socket = io(`${SERVER_URL}/dots-boxes`, {
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

const db = reactive({
  view: null,
  loading: false,
  loadingText: '',
  error: '',
  errorCode: '',
  notice: '',
  kicked: '',
})

let _handlersRegistered = false
let _currentRoom = null
let _reconnectListenerAttached = false

function registerGameHandlers(socket) {
  if (_handlersRegistered) return
  _handlersRegistered = true
  socket.on('db:state', (view) => { db.view = view })
  socket.on('db:notice', ({ message }) => { db.notice = message })
  socket.on('db:error', ({ code, message }) => {
    db.error = message
    db.errorCode = code
    db.loading = false
  })
}

export function useDotsBoxes() {
  const socket = getSocket()
  registerGameHandlers(socket)

  const room = useRoom(socket, {
    onJoinAck(data) {
      db.loading = false
      db.error = ''
      db.errorCode = ''
      if (data.gameState?.phase) db.view = data.gameState
      // 觀戰者不會觸發伺服器的 onPlayerJoined，主動索取自己的視圖
      socket.emit('db:sync', { roomId: data.room?.id ?? room.roomState.roomId })
    },
    // 切回前景：補拿背景期間漏掉的 db:state（iOS 凍結時伺服器推的狀態會遺失）
    onResume() { socket.emit('db:sync', { roomId: room.roomState.roomId }) },
    onKicked(reason) { db.kicked = reason || '你被房主踢出了房間' },
    onRoomError(code, message) {
      db.error = message
      db.errorCode = code
      db.loading = false
    },
  })

  _currentRoom = room
  if (!_reconnectListenerAttached) {
    _reconnectListenerAttached = true
    socket.on('connect', () => { _currentRoom?.rejoinOnReconnect() })
  }

  function connect(roomId, nickname, isCreating = false) {
    const playerId = getOrCreatePlayerId()
    db.view = null
    db.kicked = ''
    db.loading = true
    db.error = ''
    db.errorCode = ''
    db.loadingText = isCreating ? '建立房間中…' : '加入房間中…'
    if (isCreating) room.createRoom({ roomId, nickname, playerId, maxPlayers: MAX_PLAYERS, appId: APP_ID })
    else room.joinRoom({ roomId, nickname, playerId })
  }

  const emit = (event, payload = {}) =>
    socket.emit(event, { roomId: room.roomState.roomId, ...payload })

  return {
    state: readonly(db),
    roomState: room.roomState,
    connect,
    setOptions: (options) => emit('db:set-options', { options }),
    start:      () => emit('db:start'),
    move:       (edge) => emit('db:move', { edge }),
    resign:     () => emit('db:resign'),
    restart:    () => emit('db:restart'),
    clearError()  { db.error = ''; db.errorCode = '' },
    clearNotice() { db.notice = '' },
    disconnect() {
      socket.disconnect()
      _socket = null
      _handlersRegistered = false
      _reconnectListenerAttached = false
      _currentRoom = null
      db.view = null
    },
    copyInviteLink: () => room.copyInviteLink('/dots-boxes'),
    kickPlayer:           room.kickPlayer,
    transferHost:         room.transferHost,
    leaveRoom:            room.leaveRoom,
    upgradeFromSpectator: room.upgradeFromSpectator,
  }
}
