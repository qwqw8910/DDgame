// ================================================================
//  甜點守衛戰 — Socket.io Composable
//  房間部分由共用 useRoom() 處理；本檔案只處理 gt:* 遊戲事件。
//
//  gt:state 是每人專屬的完整視圖；gt:frame 是正在看的那張地圖的波次快照，
//  頻率高，放 shallowRef 不走深層響應式，由 GemBoard 直接取用。
// ================================================================
import { reactive, readonly, shallowRef } from 'vue'
import { io } from 'socket.io-client'
import { getOrCreatePlayerId } from '@/shared/data/identity.js'
import { useRoom } from '@/shared/composables/useRoom.js'
import { SERVER_URL } from '@/shared/api/config.js'
import { APP_ID } from '../data/gems.js'

let _socket = null

function getSocket() {
  if (!_socket) {
    _socket = io(`${SERVER_URL}/gem-td`, {
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
      timeout:              10000,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

const gem = reactive({
  view: null,
  catalog: null,
  clockOffset: 0, // 伺服器時間 - 本機時間
  loading: false,
  loadingText: '',
  error: '',
  errorCode: '',
  notice: '',
  kicked: '',
})
const frame = shallowRef(null)

let _handlersRegistered = false
let _currentRoom = null
let _reconnectListenerAttached = false

function applyView(view) {
  const switched = view.watching !== gem.view?.watching
  gem.view = view
  if (view.serverNow) gem.clockOffset = view.serverNow - Date.now()
  if (view.phase !== 'wave' || switched) frame.value = null
}

function registerGameHandlers(socket) {
  if (_handlersRegistered) return
  _handlersRegistered = true

  socket.on('gt:state', applyView)
  socket.on('gt:catalog', (catalog) => { gem.catalog = catalog })
  // 切換視角的瞬間可能還收到舊地圖的快照
  socket.on('gt:frame', (f) => { if (f.owner === gem.view?.watching) frame.value = f })
  socket.on('gt:notice', ({ message }) => { gem.notice = message })
  socket.on('gt:error', ({ code, message }) => {
    gem.error = message
    gem.errorCode = code
    gem.loading = false
  })
}

export function useGemTd() {
  const socket = getSocket()
  registerGameHandlers(socket)

  const emit = (event, payload = {}) =>
    socket.emit(event, { roomId: room.roomState.roomId, ...payload })

  const room = useRoom(socket, {
    onJoinAck(data) {
      gem.loading = false
      gem.error = ''
      gem.errorCode = ''
      if (data.gameState?.phase) applyView(data.gameState)
      // 觀戰者不會觸發 onPlayerJoined，主動索取型錄與視圖
      if (data.type === 'spectator') emit('gt:sync')
    },
    onKicked(reason) {
      gem.kicked = reason || '你被房主踢出了房間'
    },
    onRoomError(code, message) {
      gem.error = message
      gem.errorCode = code
      gem.loading = false
    },
  })

  _currentRoom = room
  if (!_reconnectListenerAttached) {
    _reconnectListenerAttached = true
    socket.on('connect', () => { _currentRoom?.rejoinOnReconnect() })
  }

  function connect(roomId, nickname, isCreating = false, maxPlayers = 4) {
    const playerId = getOrCreatePlayerId()
    gem.view = null
    gem.kicked = ''
    gem.loading = true
    gem.error = ''
    gem.errorCode = ''
    gem.loadingText = isCreating ? '建立房間中…' : '加入房間中…'
    frame.value = null
    if (isCreating) room.createRoom({ roomId, nickname, playerId, maxPlayers, appId: APP_ID })
    else room.joinRoom({ roomId, nickname, playerId })
  }

  return {
    state: readonly(gem),
    frame,
    roomState: room.roomState,
    connect,
    // 遊戲操作
    setOptions:     (options) => emit('gt:set-options', { options }),
    watch:          (targetId) => emit('gt:watch', { targetId }),
    startGame:      () => emit('gt:start'),
    place:          (slot, x, y) => emit('gt:place', { slot, x, y }),
    keep:           (towerId) => emit('gt:keep', { towerId }),
    merge:          (towerId) => emit('gt:merge', { towerId }),
    combine:        (recipeId, towerId) => emit('gt:combine', { recipeId, towerId }),
    upgradeQuality: () => emit('gt:upgrade-quality'),
    upgradeResearch: (track) => emit('gt:research', { track }),
    removeStone:    (towerId) => emit('gt:remove-stone', { towerId }),
    swap:           (towerId, stoneId) => emit('gt:swap', { towerId, stoneId }),
    ready:          () => emit('gt:ready'),
    setSpeed:       (speed) => emit('gt:set-speed', { speed }),
    finishNow:      () => emit('gt:finish-now'),
    restart:        () => emit('gt:restart'),
    clearError()  { gem.error = ''; gem.errorCode = '' },
    clearNotice() { gem.notice = '' },
    disconnect() {
      socket.disconnect()
      _socket = null
      _handlersRegistered = false
      _reconnectListenerAttached = false
      _currentRoom = null
      gem.view = null
      frame.value = null
    },
    copyInviteLink: () => room.copyInviteLink('/gem-td'),
    // 房間操作（轉發 useRoom）
    kickPlayer:           room.kickPlayer,
    transferHost:         room.transferHost,
    leaveRoom:            room.leaveRoom,
    upgradeFromSpectator: room.upgradeFromSpectator,
  }
}
