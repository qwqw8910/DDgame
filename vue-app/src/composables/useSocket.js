// ================================================================
//  Socket.io composable — useSocket()
//  提供 socket 單例與遊戲所有狀態（reactive）
//  房間事件：room:join / room:join-ack / room:players-updated / room:kicked 等
//  遊戲事件：game_started / round_updated / ... 等（不變）
// ================================================================
import { reactive, readonly } from 'vue'
import { io } from 'socket.io-client'
import { ROOM_EVENTS } from './useRoom.js'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

// 單一 socket 實例（全域，只建一次）
let _socket = null

function getSocket() {
  if (!_socket) {
    _socket = io(SOCKET_URL, {
      reconnectionDelay:    1000,
      reconnectionDelayMax: 10000,
      timeout:              10000,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

// ── 全域遊戲狀態 ──────────────────────────────────────────────────
const state = reactive({
  // 連線
  connected: false,
  // 玩家
  myPlayerId: '',
  myNickname: '',
  // 房間
  roomId: '',
  room: null,
  players: [],
  topics: [],
  // 回合
  currentRound: null,
  currentQuestion: null,
  guesses: [],
  // 衍生
  isHost: false,
  isSubject: false,
  hasSubmittedAnswer: false,
  hasSubmittedGuess: false,
  // 猜測進度
  guessSubmitted: 0,
  guessTotal: 0,
  guessSubmittedIds: [],
  // 預覽
  previewQuestion: null,
  previewSwapCount: 0,
  previewSwapLimit: 3,
  // 自己的猜測（樂觀更新）
  myCurrentGuess: null,
  // UI
  loading: false,
  loadingText: '',
  error: '',
  // 揭曉動畫鎖
  revealAnimDone: false,
  // 浮動 emoji 反應
  floatingReactions: [],
})

let _reactionId = 0

function setupListeners(socket, callbacks = {}) {
  // ── 連線狀態 ──────────────────────────────────────────────────
  socket.on('connect', () => {
    state.connected = true
    // socket 重連後自動重新加入
    if (state.myNickname && state.roomId && state.myPlayerId) {
      callbacks.onReconnect?.()
      socket.emit(ROOM_EVENTS.JOIN, {
        roomId:   state.roomId,
        playerId: state.myPlayerId,
        nickname: state.myNickname,
      })
    }
  })

  socket.on('disconnect', () => {
    state.connected = false
  })

  // ── 房間：加入確認（room:join-ack）────────────────────────────
  socket.on(ROOM_EVENTS.JOIN_ACK, (data) => {
    state.room       = data.room
    state.players    = data.players ?? []
    state.myPlayerId = data.myPlayerId

    // gameState 攜帶遊戲特定資料
    const gs = data.gameState
    state.topics          = gs?.topics          ?? []
    state.currentRound    = gs?.currentRound    ?? null
    state.currentQuestion = gs?.currentQuestion ?? null
    state.guesses         = gs?.guesses         ?? []
    state.isHost          = data.room?.host_player_id === state.myPlayerId
    state.isSubject       = state.currentRound?.subject_player_id === state.myPlayerId

    const rndStatus = state.currentRound?.status
    if (['guessing', 'revealing'].includes(rndStatus)) {
      state.hasSubmittedGuess = state.guesses.some(g => g.player_id === state.myPlayerId)
      const mine = state.guesses.find(g => g.player_id === state.myPlayerId)
      if (mine) state.myCurrentGuess = mine.guess
    }
    if (rndStatus === 'selecting_answer' && state.isSubject) {
      state.hasSubmittedAnswer = !!state.currentRound.subject_answer
    }

    state.loading = false
    callbacks.onRoomState?.()
  })

  // ── 房間：錯誤（取代舊 join_error）───────────────────────────
  socket.on(ROOM_EVENTS.ERROR, ({ code, message }) => {
    state.loading = false
    state.error   = message
    callbacks.onJoinError?.(message)
  })

  // ── 房間：玩家清單更新 ────────────────────────────────────────
  socket.on(ROOM_EVENTS.PLAYERS_UPDATED, ({ players }) => {
    state.players = players
    state.isHost  = state.room?.host_player_id === state.myPlayerId
  })

  // ── 房間：玩家離線（標記）────────────────────────────────────
  socket.on(ROOM_EVENTS.PLAYER_OFFLINE, ({ playerId }) => {
    const idx = state.players.findIndex(p => p.id === playerId)
    if (idx >= 0) state.players[idx] = { ...state.players[idx], is_online: false }
  })

  // ── 房間：玩家重連 ────────────────────────────────────────────
  socket.on(ROOM_EVENTS.PLAYER_RECONNECTED, ({ playerId, nickname }) => {
    const idx = state.players.findIndex(p => p.id === playerId)
    if (idx >= 0) state.players[idx] = { ...state.players[idx], is_online: true, nickname }
  })

  // ── 房間：玩家離開（主動或被踢）─────────────────────────────
  socket.on(ROOM_EVENTS.PLAYER_LEFT, ({ playerId }) => {
    state.players = state.players.filter(p => p.id !== playerId)
  })

  // ── 房間：房主更換 ────────────────────────────────────────────
  socket.on(ROOM_EVENTS.HOST_CHANGED, ({ newHostId }) => {
    if (state.room) state.room = { ...state.room, host_player_id: newHostId }
    state.isHost = newHostId === state.myPlayerId
  })

  // ── 房間：被踢出（取代舊 you_were_kicked）────────────────────
  socket.on(ROOM_EVENTS.KICKED, () => {
    callbacks.onKicked?.()
  })

  // ── 遊戲：以下事件名稱不變 ────────────────────────────────────
  socket.on('game_started', ({ room, currentRound }) => {
    state.room             = room
    state.isHost           = room.host_player_id === state.myPlayerId
    state.currentRound     = currentRound
    state.currentQuestion  = null
    state.isSubject        = currentRound.subject_player_id === state.myPlayerId
    state.hasSubmittedAnswer = false
    state.hasSubmittedGuess  = false
    state.myCurrentGuess   = null
    state.guessSubmitted   = 0
    state.guessTotal       = 0
    state.guessSubmittedIds = []
    state.revealAnimDone   = false
    state.previewQuestion  = null
    state.previewSwapCount = 0
    state.guesses          = []
  })

  socket.on('round_updated', ({ currentRound, currentQuestion }) => {
    const isNewRound = currentRound.id !== state.currentRound?.id
    state.currentRound = currentRound
    state.isSubject    = currentRound.subject_player_id === state.myPlayerId
    if (currentQuestion !== undefined) state.currentQuestion = currentQuestion
    if (isNewRound) {
      state.hasSubmittedAnswer = false
      state.hasSubmittedGuess  = false
      state.myCurrentGuess     = null
      state.guessSubmitted     = 0
      state.guessTotal         = 0
      state.guessSubmittedIds  = []
      state.revealAnimDone     = false
      state.previewQuestion    = null
      state.previewSwapCount   = 0
      state.guesses            = []
    }
  })

  socket.on('guess_progress', ({ submitted, total, submittedIds }) => {
    state.guessSubmitted    = submitted
    state.guessTotal        = total
    state.guessSubmittedIds = submittedIds || []
  })

  socket.on('round_revealed', ({ currentRound, guesses, players }) => {
    state.currentRound = currentRound
    state.guesses      = guesses
    state.players      = players
    callbacks.onRoundRevealed?.({ currentRound, guesses })
  })

  socket.on('game_finished', ({ room, players }) => {
    state.room    = room
    state.players = players
  })

  socket.on('game_restarted', ({ room, players }) => {
    state.room             = room
    state.players          = players
    state.currentRound     = null
    state.currentQuestion  = null
    state.guesses          = []
    state.hasSubmittedAnswer = false
    state.hasSubmittedGuess  = false
    state.myCurrentGuess     = null
    state.guessSubmitted     = 0
    state.guessTotal         = 0
    state.guessSubmittedIds  = []
    state.revealAnimDone     = false
    state.previewQuestion    = null
    state.previewSwapCount   = 0
  })

  socket.on('preview_question', ({ question, swapCount, swapLimit }) => {
    state.previewQuestion  = question
    state.previewSwapCount = swapCount
    state.previewSwapLimit = swapLimit
  })

  socket.on('reaction_broadcast', ({ emoji, nickname }) => {
    const id = ++_reactionId
    state.floatingReactions.push({ id, emoji, nickname })
    setTimeout(() => {
      const idx = state.floatingReactions.findIndex(r => r.id === id)
      if (idx !== -1) state.floatingReactions.splice(idx, 1)
    }, 3000)
  })

  socket.on('answer_accepted', ({ answer }) => {
    state.hasSubmittedAnswer = true
    callbacks.onAnswerAccepted?.(answer)
  })

  socket.on('error', ({ message }) => {
    callbacks.onError?.(message)
  })
}

// ── 公開 composable ───────────────────────────────────────────────
export function useSocket(callbacks = {}) {
  const socket = getSocket()

  if (!socket._listenersAttached) {
    socket._listenersAttached = true
    setupListeners(socket, callbacks)
  } else {
    Object.assign(socket._callbacks || {}, callbacks)
  }

  function connectAndJoin(roomId, playerId, nickname) {
    state.roomId      = roomId
    state.myPlayerId  = playerId
    state.myNickname  = nickname
    state.loading     = true
    state.loadingText = '連線中…'
    state.error       = ''

    const doJoin = () => socket.emit(ROOM_EVENTS.JOIN, { roomId, playerId, nickname })
    if (!socket.connected) {
      socket.once('connect', doJoin)
      socket.connect()
    } else {
      doJoin()
    }
  }

  function emit(event, payload) {
    socket.emit(event, payload)
  }

  // 遊戲動作包裝
  const actions = {
    // 房間操作（改用 room:* 事件）
    toggleReady:    () => socket.emit(ROOM_EVENTS.READY,         { ready: true }),
    kickPlayer:     (targetId) => socket.emit(ROOM_EVENTS.KICK,  { targetPlayerId: targetId }),
    transferHost:   (targetId) => socket.emit(ROOM_EVENTS.TRANSFER_HOST, { targetPlayerId: targetId }),
    leaveRoom:      () => socket.emit(ROOM_EVENTS.LEAVE),

    // 遊戲操作（事件名稱不變）
    startGame:      () => emit('start_game',      {}),
    selectTopic:    (topicId) => emit('select_topic',   { topicId }),
    submitAnswer:   (answer)  => emit('submit_answer',  { answer }),
    submitGuess:    (guess)   => {
      state.myCurrentGuess    = guess
      state.hasSubmittedGuess = true
      emit('submit_guess', { guess })
    },
    revealRound:    () => emit('reveal_round',    {}),
    nextRound:      () => emit('next_round',      {}),
    endGame:        () => emit('end_game',        {}),
    restartGame:    () => emit('restart_game',    {}),
    sendReaction:   (emoji)   => emit('send_reaction',  { emoji }),
    swapPreview:    () => emit('swap_question',   {}),
    confirmPreview: () => emit('confirm_question',{}),
    // set_online 已由 socket disconnect/reconnect 自動管理，保留 API 相容性
    setOnline:      (_isOnline) => {},
  }

  return {
    state: readonly(state),
    connectAndJoin,
    ...actions,
  }
}
