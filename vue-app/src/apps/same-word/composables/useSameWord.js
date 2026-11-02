// ================================================================
//  同詞相遇 — Socket.io Composable（對照 useClocktower.js）
//  房間部分由共用 useRoom() 處理；本檔只處理 sw:* 遊戲事件。
//  伺服器每次狀態變動都推一份「該觀看者專屬」的完整視圖（sw:state）。
// ================================================================
import { reactive, readonly } from 'vue'
import { io } from 'socket.io-client'
import { getOrCreatePlayerId } from '@/shared/data/identity.js'
import { useRoom } from '@/shared/composables/useRoom.js'
import { SERVER_URL } from '@/shared/api/config.js'
import { APP_ID } from '../data/constants.js'

let _socket = null

function getSocket() {
  if (!_socket) {
    _socket = io(`${SERVER_URL}/same-word`, {
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

const sw = reactive({
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
  socket.on('sw:state', (view) => { sw.view = view })
  socket.on('sw:notice', ({ message }) => { sw.notice = message })
  socket.on('sw:error', ({ code, message }) => {
    sw.error = message
    sw.errorCode = code
    sw.loading = false
  })
}

export function useSameWord() {
  const socket = getSocket()
  registerGameHandlers(socket)

  const room = useRoom(socket, {
    onJoinAck(data) {
      sw.loading = false
      sw.error = ''
      sw.errorCode = ''
      if (data.gameState?.phase) sw.view = data.gameState
      // 觀戰者不會觸發伺服器的 onPlayerJoined，主動索取自己的視圖
      socket.emit('sw:sync', { roomId: data.room?.id ?? room.roomState.roomId })
    },
    onKicked(reason) { sw.kicked = reason || '你被房主踢出了房間' },
    onRoomError(code, message) {
      sw.error = message
      sw.errorCode = code
      sw.loading = false
    },
  })

  _currentRoom = room
  if (!_reconnectListenerAttached) {
    _reconnectListenerAttached = true
    socket.on('connect', () => { _currentRoom?.rejoinOnReconnect() })
  }

  function connect(roomId, nickname, isCreating = false, maxPlayers = 8) {
    const playerId = getOrCreatePlayerId()
    sw.view = null
    sw.kicked = ''
    sw.loading = true
    sw.error = ''
    sw.errorCode = ''
    sw.loadingText = isCreating ? '建立房間中…' : '加入房間中…'
    if (isCreating) room.createRoom({ roomId, nickname, playerId, maxPlayers, appId: APP_ID })
    else room.joinRoom({ roomId, nickname, playerId })
  }

  const emit = (event, payload = {}) =>
    socket.emit(event, { roomId: room.roomState.roomId, ...payload })

  return {
    state: readonly(sw),
    roomState: room.roomState,
    connect,
    setOptions:  (options) => emit('sw:set-options', { options }),
    start:       () => emit('sw:start'),
    submit:      (word) => emit('sw:submit', { word }),
    voteOutlier: (targetId) => emit('sw:vote-outlier', { targetId }),
    nextRound:   () => emit('sw:next-round'),
    finishNow:   () => emit('sw:finish-now'),
    restart:     () => emit('sw:restart'),
    clearError()  { sw.error = ''; sw.errorCode = '' },
    clearNotice() { sw.notice = '' },
    disconnect() {
      socket.disconnect()
      _socket = null
      _handlersRegistered = false
      _reconnectListenerAttached = false
      _currentRoom = null
      sw.view = null
    },
    copyInviteLink: () => room.copyInviteLink('/same-word'),
    kickPlayer:           room.kickPlayer,
    transferHost:         room.transferHost,
    leaveRoom:            room.leaveRoom,
    upgradeFromSpectator: room.upgradeFromSpectator,
  }
}
