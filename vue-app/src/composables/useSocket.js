// ================================================================
//  Socket.io composable — useSocket()
//  房間事件由 useRoom() 處理；本檔案只負責懂我再說的遊戲事件
// ================================================================
import { reactive, readonly } from 'vue'
import { io } from 'socket.io-client'
import { useRoom } from './useRoom.js'

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
let _gameListenersAttached = false

// ── 遊戲事件監聽（房間事件已由 useRoom 接管） ────────────────────
function setupGameListeners(socket, callbacks) {
  socket.on('connect',    () => { state.connected = true })
  socket.on('disconnect', () => { state.connected = false })

  socket.on('game_started', ({ room, currentRound, topics }) => {
    state.room             = room
    state.isHost           = room.host_player_id === state.myPlayerId
    state.currentRound     = currentRound
    if (Array.isArray(topics)) state.topics = topics
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
    // 限制畫面上同時飛舞的 emoji 數量，避免大量同時 animation 拖累主執行緒
    if (state.floatingReactions.length > 12) {
      state.floatingReactions.splice(0, state.floatingReactions.length - 12)
    }
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

  // 房間事件透過 useRoom 接管，並把 roomState 透過 callback 同步到 state
  const room = useRoom(socket, {
    onJoinAck(data) {
      state.room       = data.room
      state.players    = data.players ?? []
      state.myPlayerId = data.myPlayerId

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
    },
    onPlayersUpdated(players) {
      state.players = players
      state.isHost  = state.room?.host_player_id === state.myPlayerId
    },
    onHostChanged(newHostId) {
      if (state.room) state.room = { ...state.room, host_player_id: newHostId }
      state.isHost = newHostId === state.myPlayerId
    },
    onKicked() {
      callbacks.onKicked?.()
    },
    onRoomError(_code, message) {
      state.loading = false
      state.error   = message
      callbacks.onJoinError?.(message)
    },
  })

  if (!_gameListenersAttached) {
    _gameListenersAttached = true
    setupGameListeners(socket, callbacks)
    // 重連後自動 rejoin（useRoom 內部記住了 roomId/playerId/nickname）
    socket.on('connect', () => {
      callbacks.onReconnect?.()
      room.rejoinOnReconnect()
    })
  }

  function connectAndJoin(roomId, playerId, nickname) {
    state.roomId      = roomId
    state.myPlayerId  = playerId
    state.myNickname  = nickname
    state.loading     = true
    state.loadingText = '連線中…'
    state.error       = ''
    room.joinRoom({ roomId, playerId, nickname })
  }

  function emit(event, payload) {
    socket.emit(event, payload)
  }

  // 遊戲動作包裝
  const actions = {
    // 房間操作（委派給 useRoom）
    toggleReady:    () => room.setReady(true),
    kickPlayer:     (targetId) => room.kickPlayer(targetId),
    transferHost:   (targetId) => room.transferHost(targetId),
    leaveRoom:      () => room.leaveRoom(),

    // 遊戲操作
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
