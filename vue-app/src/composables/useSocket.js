// ================================================================
//  Socket.io composable — useSocket()
//  提供 socket 單例與遊戲所有狀態（reactive）
// ================================================================
import { reactive, readonly } from 'vue'
import { io } from 'socket.io-client'

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
  socket.on('connect', () => {
    state.connected = true
    if (state.myNickname && state.roomId) {
      callbacks.onReconnect?.()
      socket.emit('join_room', {
        roomId:   state.roomId,
        playerId: state.myPlayerId,
        nickname: state.myNickname,
      })
    }
  })

  socket.on('disconnect', () => {
    state.connected = false
  })

  socket.on('room_state', (data) => {
    state.room            = data.room
    state.players         = data.players
    state.topics          = data.topics || []
    state.currentRound    = data.currentRound
    state.currentQuestion = data.currentQuestion
    state.guesses         = data.guesses || []
    state.isHost          = data.room.host_player_id === state.myPlayerId
    state.isSubject       = data.currentRound?.subject_player_id === state.myPlayerId

    const rndStatus = data.currentRound?.status
    if (['guessing', 'revealing'].includes(rndStatus)) {
      state.hasSubmittedGuess = state.guesses.some(g => g.player_id === state.myPlayerId)
      const mine = state.guesses.find(g => g.player_id === state.myPlayerId)
      if (mine) state.myCurrentGuess = mine.guess
    }
    if (rndStatus === 'selecting_answer' && state.isSubject) {
      state.hasSubmittedAnswer = !!data.currentRound.subject_answer
    }

    state.loading = false
    callbacks.onRoomState?.()
  })

  socket.on('join_error', ({ message }) => {
    state.loading = false
    state.error   = message
    callbacks.onJoinError?.(message)
  })

  socket.on('players_updated', ({ players }) => {
    state.players = players
    state.isHost  = state.room?.host_player_id === state.myPlayerId
  })

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

    if (currentQuestion !== undefined) {
      state.currentQuestion = currentQuestion
    }
    if (isNewRound) {
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
    state.myCurrentGuess   = null
    state.guessSubmitted   = 0
    state.guessTotal       = 0
    state.guessSubmittedIds = []
    state.revealAnimDone   = false
    state.previewQuestion  = null
    state.previewSwapCount = 0
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

  socket.on('you_were_kicked', () => {
    callbacks.onKicked?.()
  })

  socket.on('error', ({ message }) => {
    callbacks.onError?.(message)
  })
}

// ── 公開 composable ───────────────────────────────────────────────
export function useSocket(callbacks = {}) {
  const socket = getSocket()

  // 只在第一次掛載時綁定 listener（避免重複）
  if (!socket._listenersAttached) {
    socket._listenersAttached = true
    setupListeners(socket, callbacks)
  } else {
    // 更新 callback 引用
    Object.assign(socket._callbacks || {}, callbacks)
  }

  function connectAndJoin(roomId, playerId, nickname) {
    state.roomId     = roomId
    state.myPlayerId = playerId
    state.myNickname = nickname
    state.loading    = true
    state.loadingText = '連線中…'
    state.error      = ''

    if (!socket.connected) {
      socket.connect()
    }
    socket.emit('join_room', { roomId, playerId, nickname })
  }

  function emit(event, payload) {
    socket.emit(event, payload)
  }

  // 遊戲動作包裝
  const actions = {
    toggleReady:    () => emit('toggle_ready',   { roomId: state.roomId, playerId: state.myPlayerId, ready: true }),
    startGame:      () => emit('start_game',     { roomId: state.roomId, playerId: state.myPlayerId }),
    selectTopic:    (topicId) => emit('select_topic',   { roomId: state.roomId, playerId: state.myPlayerId, topicId }),
    submitAnswer:   (answer)  => emit('submit_answer',  { roomId: state.roomId, playerId: state.myPlayerId, answer }),
    submitGuess:    (guess)   => {
      state.myCurrentGuess    = guess
      state.hasSubmittedGuess = true
      emit('submit_guess', { roomId: state.roomId, playerId: state.myPlayerId, guess })
    },
    revealRound:    () => emit('reveal_round',   { roomId: state.roomId, playerId: state.myPlayerId }),
    nextRound:      () => emit('next_round',     { roomId: state.roomId, playerId: state.myPlayerId }),
    endGame:        () => emit('end_game',       { roomId: state.roomId, playerId: state.myPlayerId }),
    restartGame:    () => emit('restart_game',   { roomId: state.roomId, playerId: state.myPlayerId }),
    kickPlayer:     (targetId) => emit('kick_player', { roomId: state.roomId, hostId: state.myPlayerId, targetPlayerId: targetId }),
    sendReaction:   (emoji)   => emit('send_reaction', { roomId: state.roomId, playerId: state.myPlayerId, emoji }),
    requestPreview: () => emit('request_preview', { roomId: state.roomId, playerId: state.myPlayerId }),
    swapPreview:    () => emit('swap_question',   { roomId: state.roomId, playerId: state.myPlayerId }),
    confirmPreview: () => emit('confirm_question', { roomId: state.roomId, playerId: state.myPlayerId }),
    setOnline:      (isOnline) => emit('set_online', { isOnline }),
  }

  return {
    state: readonly(state),
    connectAndJoin,
    ...actions,
  }
}
