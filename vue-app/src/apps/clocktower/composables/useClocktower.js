// ================================================================
//  血染鐘樓 — Socket.io Composable（對照 useMountainLodge.js）
//  房間部分（建立 / 加入 / 踢人 / 重連 / 觀戰）由共用 useRoom() 處理；
//  本檔案只處理 ct:* 遊戲事件。
//
//  伺服器每次狀態變動都推一份「該觀看者專屬」的完整視圖（ct:state）；
//  聊天訊息以增量 ct:chat-message 推送，這裡併入目前的視圖。
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
    _socket = io(`${SERVER_URL}/clocktower`, {
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
      timeout:              10000,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

const ct = reactive({
  view: null,       // 伺服器推來的視圖
  script: null,     // 劇本（角色定義），進房時由 ct:script 推送
  loading: false,
  loadingText: '',
  error: '',
  errorCode: '',
  notice: '',
  kicked: '',
  infoPopup: null,  // 剛收到的夜晚資訊（彈窗用）
  invitePing: 0,    // 收到私聊邀請時 +1（通知用）
  chatPing: null,   // 最新一則增量聊天 { channel, groupId, thread, message }
})

// 角色定義查詢（RoleToken 等元件共用）
export function roleInfo(id) {
  return ct.script?.roles?.find(r => r.id === id) ?? null
}
export const scriptState = readonly(ct)

let _handlersRegistered = false
let _currentRoom = null
let _reconnectListenerAttached = false

function mergeChat({ channel, groupId, thread, message }) {
  const chat = ct.view?.chat
  if (!chat) return
  if (channel === 'public') {
    if (!chat.public.some(m => m.id === message.id)) chat.public.push(message)
  } else if (channel === 'whisper') {
    if (!chat.whispers[groupId]) chat.whispers[groupId] = { id: groupId, history: [], participants: [] }
    const h = chat.whispers[groupId].history
    if (!h.some(m => m.id === message.id)) h.push(message)
  } else if (channel === 'storyteller') {
    if (!chat.storyteller[thread]) chat.storyteller[thread] = []
    const h = chat.storyteller[thread]
    if (!h.some(m => m.id === message.id)) h.push(message)
  }
  ct.chatPing = { channel, groupId, thread, message }
}

function registerGameHandlers(socket) {
  if (_handlersRegistered) return
  _handlersRegistered = true

  socket.on('ct:state', (view) => { ct.view = view })
  socket.on('ct:script', (script) => { ct.script = script })
  socket.on('ct:chat-message', mergeChat)
  socket.on('ct:info', (message) => { ct.infoPopup = message })
  socket.on('ct:whisper-invited', () => { ct.invitePing += 1 })
  socket.on('ct:notice', ({ message }) => { ct.notice = message })
  socket.on('ct:error', ({ code, message }) => {
    ct.error = message
    ct.errorCode = code
    ct.loading = false
  })
}

export function useClocktower() {
  const socket = getSocket()
  registerGameHandlers(socket)

  const room = useRoom(socket, {
    onJoinAck(data) {
      ct.loading = false
      ct.error = ''
      ct.errorCode = ''
      if (data.gameState?.phase) ct.view = data.gameState
      // 觀戰者不會觸發伺服器的 onPlayerJoined，主動索取自己的視圖與劇本
      socket.emit('ct:sync', { roomId: data.room?.id ?? room.roomState.roomId })
    },
    onKicked(reason) {
      ct.kicked = reason || '你被房主踢出了房間'
    },
    onRoomError(code, message) {
      ct.error = message
      ct.errorCode = code
      ct.loading = false
    },
  })

  _currentRoom = room
  if (!_reconnectListenerAttached) {
    _reconnectListenerAttached = true
    socket.on('connect', () => { _currentRoom?.rejoinOnReconnect() })
  }

  function connect(roomId, nickname, isCreating = false, seats = 7) {
    const playerId = getOrCreatePlayerId()
    ct.view = null
    ct.kicked = ''
    ct.loading = true
    ct.error = ''
    ct.errorCode = ''
    ct.loadingText = isCreating ? '建立房間中…' : '加入房間中…'
    // max_players = 座位上限 + 1（說書人）
    if (isCreating) room.createRoom({ roomId, nickname, playerId, maxPlayers: seats + 1, appId: APP_ID })
    else room.joinRoom({ roomId, nickname, playerId })
  }

  const emit = (event, payload = {}) =>
    socket.emit(event, { roomId: room.roomState.roomId, ...payload })

  return {
    state: readonly(ct),
    roomState: room.roomState,
    connect,
    // 大廳
    setStoryteller:       (playerId) => emit('ct:set-storyteller', { playerId }),
    randomStoryteller:    () => emit('ct:set-storyteller', { random: true }),
    transferStoryteller:  (playerId) => emit('ct:transfer-storyteller', { playerId }),
    claimSeat:            (seat) => emit('ct:claim-seat', { seat }),
    swapSeats:            (a, b) => emit('ct:arrange-seats', { a, b }),
    // 開局設定
    setup:                (action, data = {}) => emit('ct:setup', { action, ...data }),
    assignRole:           (data) => emit('ct:assign-role', data),
    startGame:            (force = false) => emit('ct:start', { force }),
    // 夜晚
    wake:                 (seat, opts = {}) => emit('ct:wake', { seat, ...opts }),
    cancelPrompt:         (seat) => emit('ct:cancel-prompt', { seat }),
    replyPrompt:          (promptId, targets) => emit('ct:prompt-reply', { promptId, targets }),
    actFor:               (seat, targets) => emit('ct:act-for', { seat, targets }),
    sendInfo:             (target, info) => emit('ct:send-info', { target, info }),
    queueDone:            (key, done) => emit('ct:queue-done', { key, done }),
    addReminder:          (seat, reminderId) => emit('ct:reminder', { action: 'add', seat, reminderId }),
    removeReminder:       (id) => emit('ct:reminder', { action: 'remove', id }),
    setDead:              (seat, dead) => emit('ct:set-dead', { seat, dead }),
    changeRole:           (seat, roleId) => emit('ct:change-role', { seat, roleId }),
    toDawn:               () => emit('ct:phase', { to: 'dawn' }),
    endDay:               () => emit('ct:phase', { to: 'night' }),
    // 白天
    dayPhase:             (to) => emit('ct:day-phase', { to }),
    nominate:             (nominee) => emit('ct:nominate', { nominee }),
    startVote:            (handSpeedMs) => emit('ct:start-vote', { handSpeedMs }),
    vote:                 (up) => emit('ct:vote', { up }),
    voteControl:          (action, data = {}) => emit('ct:vote-control', { action, ...data }),
    confirmWinner:        (confirm) => emit('ct:confirm-winner', { confirm }),
    declareWinner:        (team, reason) => emit('ct:declare-winner', { team, reason }),
    playAgain:            () => emit('ct:again'),
    // 聊天
    chatPublic:           (text) => emit('ct:chat-public', { text }),
    whisperInvite:        (playerIds) => emit('ct:whisper-invite', { playerIds }),
    whisperRespond:       (inviteId, accept) => emit('ct:whisper-respond', { inviteId, accept }),
    whisperLeave:         () => emit('ct:whisper-leave'),
    whisperSend:          (text) => emit('ct:whisper-send', { text }),
    chatStoryteller:      (text, toPlayerId = null) => emit('ct:chat-storyteller', { text, toPlayerId }),
    clearError()  { ct.error = ''; ct.errorCode = '' },
    clearNotice() { ct.notice = '' },
    clearInfoPopup() { ct.infoPopup = null },
    disconnect() {
      socket.disconnect()
      _socket = null
      _handlersRegistered = false
      _reconnectListenerAttached = false
      _currentRoom = null
      ct.view = null
    },
    copyInviteLink: () => room.copyInviteLink('/clocktower'),
    // 房間操作（轉發 useRoom）
    kickPlayer:           room.kickPlayer,
    transferHost:         room.transferHost,
    leaveRoom:            room.leaveRoom,
    upgradeFromSpectator: room.upgradeFromSpectator,
  }
}
