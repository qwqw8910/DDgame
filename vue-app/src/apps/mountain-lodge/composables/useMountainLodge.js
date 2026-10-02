// ================================================================
//  山中別館殺人事件 — Socket.io Composable
//  房間部分（建立 / 加入 / 踢人 / 重連 / 觀戰）由共用 useRoom() 處理；
//  本檔案只處理 lodge:* 遊戲事件。
//
//  伺服器每次牌桌變動都會推一份「該玩家專屬」的完整視圖（lodge:state），
//  前端只負責顯示，不在本地推算任何隱藏資訊。
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
    _socket = io(`${SERVER_URL}/mountain-lodge`, {
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
      timeout:              10000,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

const lodge = reactive({
  view: null,      // 伺服器推來的視圖（phase / order / locations / me / result …）
  loading: false,
  loadingText: '',
  error: '',
  errorCode: '',
  notice: '',      // 一次性通知（例如牌局中止）
  kicked: '',      // 被房主踢出時的訊息
})

let _handlersRegistered = false
let _currentRoom = null
let _reconnectListenerAttached = false

function registerGameHandlers(socket) {
  if (_handlersRegistered) return
  _handlersRegistered = true

  socket.on('lodge:state', (view) => { lodge.view = view })
  socket.on('lodge:notice', ({ message }) => { lodge.notice = message })
  socket.on('lodge:error', ({ code, message }) => {
    lodge.error = message
    lodge.errorCode = code
    lodge.loading = false
  })
}

export function useMountainLodge() {
  const socket = getSocket()
  registerGameHandlers(socket)

  const room = useRoom(socket, {
    onJoinAck(data) {
      lodge.loading = false
      lodge.error = ''
      lodge.errorCode = ''
      // 觀戰者只會收到這份公開視圖；玩家稍後會再收到含 me 的 lodge:state
      if (data.gameState?.phase) lodge.view = data.gameState
    },
    onKicked(reason) {
      lodge.kicked = reason || '你被房主踢出了房間'
    },
    onRoomError(code, message) {
      lodge.error = message
      lodge.errorCode = code
      lodge.loading = false
    },
  })

  _currentRoom = room
  if (!_reconnectListenerAttached) {
    _reconnectListenerAttached = true
    socket.on('connect', () => { _currentRoom?.rejoinOnReconnect() })
  }

  // ── 連線進入房間 ──────────────────────────────────────────────
  function connect(roomId, nickname, isCreating = false, maxPlayers = 6) {
    const playerId = getOrCreatePlayerId()
    lodge.view = null
    lodge.kicked = ''
    lodge.loading = true
    lodge.error = ''
    lodge.errorCode = ''
    lodge.loadingText = isCreating ? '建立房間中…' : '加入房間中…'
    if (isCreating) room.createRoom({ roomId, nickname, playerId, maxPlayers, appId: APP_ID })
    else room.joinRoom({ roomId, nickname, playerId })
  }

  const emit = (event, payload = {}) =>
    socket.emit(event, { roomId: room.roomState.roomId, ...payload })

  return {
    state: readonly(lodge),
    roomState: room.roomState,
    connect,
    // 遊戲操作
    setSettings:   (settings) => emit('lodge:settings', settings),
    startGame:     () => emit('lodge:start'),
    keepCard:      (cardId, passTo) => emit('lodge:keep', { cardId, passTo }),
    autoPlay:      () => emit('lodge:autoplay'),
    endDiscussion: () => emit('lodge:end-discussion'),
    vote:          (targetId) => emit('lodge:vote', { targetId }),
    forceResult:   () => emit('lodge:force-result'),
    revealAbility: (targetId) => emit('lodge:reveal', { targetId }),
    playAgain:     () => emit('lodge:again'),
    clearError()  { lodge.error = ''; lodge.errorCode = '' },
    clearNotice() { lodge.notice = '' },
    disconnect() {
      socket.disconnect()
      _socket = null
      _handlersRegistered = false
      _reconnectListenerAttached = false
      _currentRoom = null
      lodge.view = null
    },
    copyInviteLink: () => room.copyInviteLink('/mountain-lodge'),
    // 房間操作（轉發 useRoom）
    kickPlayer:           room.kickPlayer,
    transferHost:         room.transferHost,
    leaveRoom:            room.leaveRoom,
    upgradeFromSpectator: room.upgradeFromSpectator,
  }
}
