// ================================================================
//  默契傳聲筒：字元風暴 — Socket.io Composable
//  連接後端 /character-storm namespace，管理所有遊戲狀態
// ================================================================
import { reactive, readonly } from 'vue'
import { io } from 'socket.io-client'
import { getOrCreatePlayerId } from '../../../data/identity.js'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

// 單一 socket 實例（/character-storm namespace）
let _socket = null

function getSocket() {
  if (!_socket) {
    _socket = io(`${SOCKET_URL}/character-storm`, {
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
  room: null,           // { id, hostId, status, maxPlayers }
  players: [],          // [{ id, nickname, role, quota, connected }]
  // 角色
  myRole: null,         // 'guesser' | 'clue-2' | 'clue-4' | 'clue-6'
  myQuota: null,        // 2 | 4 | 6 | null
  isHost: false,
  isGuesser: false,
  currentGuesserPlayerId: '',
  // 遊戲狀態
  status: 'waiting',    // waiting | round1 | round1-result | round2 | round2-result | revealing | finished
  currentWord: null,    // { id, word, category } — 提示者才看得到
  // 提示
  round1Hints: [],      // [{ playerId, maskedText }] — 猜題者視角
  round2Hints: [],
  round1HintsProvider: [], // [{ playerId, chars:[{char,isConflict}] }] — 提示者視角
  round2HintsProvider: [],
  symbolMap: {},        // { '字': '●' }
  // 進度
  submittedPlayerIds: [], // 已送出提示的玩家 id
  timerRemaining: 60,
  // 猜題
  guessResult: null,      // { correct, answer } — 最新一次
  round1GuessResult: null, // { correct, answer, a, b } — 第一輪猜題存檔
  // UI
  loading: false,
  loadingText: '',
  error: '',
  errorCode: '',
  // 答案字數（猜題者參考）
  wordLength: null,
  // A/B 判定（Bulls & Cows）
  guessAB: null,   // { a, b },
  floatingReactions: [],
})

let _reactionId = 0

// ── 事件處理 ──────────────────────────────────────────────────────
function registerHandlers(socket) {
  socket.on('connect', () => { state.connected = true })
  socket.on('disconnect', () => { state.connected = false })

  // 完整房間狀態（加入/重連）
  socket.on('cs:room-state', (data) => {
    state.room       = data.room
    state.players    = data.players
    state.status     = data.room.status
    state.isHost     = data.room.hostId === state.myPlayerId
    const guesser = state.players.find(p => p.role === 'guesser')
    state.currentGuesserPlayerId = guesser?.id ?? ''
    state.loading    = false
  })

  // 角色分配
  socket.on('cs:role-assigned', ({ role, quota }) => {
    state.myRole   = role
    state.myQuota  = quota
    state.isGuesser = role === 'guesser'
  })

  // 題目（提示者才收到）
  socket.on('cs:word-revealed', ({ word, category }) => {
    state.currentWord = { word, category }
  })

  // 提示進度更新（只有 id 清單，不含內容）
  socket.on('cs:hint-progress', ({ submittedIds }) => {
    state.submittedPlayerIds = submittedIds
  })

  // 倒數
  socket.on('cs:timer-tick', ({ remaining }) => {
    state.timerRemaining = remaining
  })

  // 第一輪結果
  socket.on('cs:round1-result', ({ hints, hintsProvider, symbolMap, wordLength }) => {
    state.round1Hints         = hints
    state.round1HintsProvider = hintsProvider ?? []
    state.symbolMap           = symbolMap
    state.status              = 'round1-result'
    state.submittedPlayerIds  = []
    state.timerRemaining      = 60
    state.wordLength          = wordLength ?? null
  })

  // 第二輪結果
  socket.on('cs:round2-result', ({ hints, hintsProvider, symbolMap, wordLength }) => {
    state.round2Hints         = hints
    state.round2HintsProvider = hintsProvider ?? []
    state.symbolMap           = symbolMap
    state.status              = 'round2-result'
    state.submittedPlayerIds  = []
    state.timerRemaining      = 60
    state.wordLength          = wordLength ?? null
  })

  // 猜題結果
  socket.on('cs:guess-result', ({ correct, answer, word, wasRound2, a, b }) => {
    state.guessResult = { correct, answer }
    state.guessAB     = (a !== undefined) ? { a, b } : null
    state.status      = 'revealing'
    if (word) state.currentWord = { word }
    // 第一輪答錯時存檔（wasRound2=false 表示是第一輪的猜題結果）
    if (!wasRound2) {
      state.round1GuessResult = { correct, answer: answer || '', a: a ?? 0, b: b ?? 0 }
    }
  })

  // 進入第一輪
  socket.on('cs:round1-start', ({ currentGuesserIndex }) => {
    state.status              = 'round1'
    state.currentWord         = null
    state.round1Hints         = []
    state.round2Hints         = []
    state.round1HintsProvider = []
    state.round2HintsProvider = []
    state.symbolMap           = {}
    state.submittedPlayerIds  = []
    state.guessResult         = null
    state.guessAB             = null
    state.round1GuessResult   = null
    state.wordLength          = null
    state.timerRemaining      = 60
    // 更新 isGuesser（猜題者輪轉）
    const guesser = state.players[currentGuesserIndex]
    if (guesser) {
      state.currentGuesserPlayerId = guesser.id
      state.isGuesser = guesser.id === state.myPlayerId
    }
  })

  // 進入第二輪
  socket.on('cs:round2-start', () => {
    state.status             = 'round2'
    state.submittedPlayerIds = []
    state.timerRemaining     = 60
  })

  // 揭曉
  socket.on('cs:revealing', ({ word }) => {
    state.status = 'revealing'
    state.currentWord = { word }
  })

  // 新玩家加入
  socket.on('cs:player-joined', ({ player }) => {
    if (!state.players.find(p => p.id === player.id)) {
      state.players.push(player)
    }
    state.isHost = state.room?.hostId === state.myPlayerId
  })

  // 玩家離開
  socket.on('cs:player-left', ({ playerId }) => {
    state.players = state.players.filter(p => p.id !== playerId)
    state.isHost  = state.room?.hostId === state.myPlayerId
  })

  // 房間狀態更新（房主轉移等）
  socket.on('cs:room-updated', (room) => {
    state.room   = room
    state.isHost = room.hostId === state.myPlayerId
    if (room.status) state.status = room.status
  })

  // 結算
  socket.on('cs:finished', () => {
    state.status = 'finished'
  })

  // 錯誤
  socket.on('cs:error', ({ code, message }) => {
    state.error    = message
    state.errorCode = code
    state.loading  = false
    console.error(`[CS] error ${code}:`, message)
  })
}

let _handlersRegistered = false

// ── Public API ────────────────────────────────────────────────────
export function useCharacterStorm() {
  const socket = getSocket()

  if (!_handlersRegistered) {
    registerHandlers(socket)
    _handlersRegistered = true
  }

  function connect(roomId, nickname, isCreating = false, maxPlayers = 6) {
    state.myPlayerId = getOrCreatePlayerId()
    state.myNickname = nickname
    state.roomId     = roomId
    state.loading    = true
    state.loadingText = isCreating ? '建立房間中…' : '加入房間中…'

    const doEmit = () => {
      if (isCreating) {
        socket.emit('cs:create', { roomId, nickname, playerId: state.myPlayerId, maxPlayers })
      } else {
        socket.emit('cs:join', { roomId, nickname, playerId: state.myPlayerId })
      }
    }

    if (!socket.connected) {
      socket.once('connect', doEmit)
      socket.connect()
    } else {
      doEmit()
    }
  }

  function submitHint(text) {
    socket.emit('cs:submit-hint', { roomId: state.roomId, text })
  }

  function submitGuess(answer) {
    socket.emit('cs:submit-guess', { roomId: state.roomId, answer })
  }

  function startGame() {
    socket.emit('cs:start', { roomId: state.roomId })
  }

  function nextTurn() {
    socket.emit('cs:next-round', { roomId: state.roomId })
  }

  function continueGame() {
    socket.emit('cs:continue', { roomId: state.roomId })
  }

  function endGame() {
    socket.emit('cs:end-game', { roomId: state.roomId })
  }

  function disconnect() {
    socket.disconnect()
    _socket = null
    _handlersRegistered = false
  }

  function copyInviteLink() {
    const base = window.location.href.split('#')[0]
    const link = `${base}#/character-storm?room=${state.roomId}`
    navigator.clipboard.writeText(link).catch(() => {})
    return link
  }

  return {
    state: readonly(state),
    connect,
    submitHint,
    submitGuess,
    startGame,
    nextTurn,
    continueGame,
    endGame,
    disconnect,
    copyInviteLink,
  }
}
