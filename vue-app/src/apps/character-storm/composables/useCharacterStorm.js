// ================================================================
//  默契傳聲筒：字元風暴 — Socket.io Composable
//  房間部分由 useRoom() 處理（room:create / room:join / room:join-ack 等）
//  本檔案只處理：cs:* 遊戲事件 + 遊戲狀態
// ================================================================
import { reactive, readonly, computed } from 'vue'
import { io } from 'socket.io-client'
import { getOrCreatePlayerId } from '../../../data/identity.js'
import { useRoom } from '../../../composables/useRoom.js'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const GAME_TIMER_SECONDS = 90

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

// ── 遊戲專屬狀態（房間/玩家狀態改由 roomState 管理）────────────
const gameState = reactive({
  // 角色
  myRole: null,         // 'guesser' | 'clue-2' | 'clue-4' | 'clue-6'
  myQuota: null,
  isGuesser: false,
  currentGuesserPlayerId: '',
  themePreference: -1,
  // 遊戲流程
  status: 'waiting',    // waiting | round1 | round1-result | round2 | round2-result | revealing | finished
  currentWord: null,
  // 提示
  round1Hints: [],
  round2Hints: [],
  round1HintsProvider: [],
  round2HintsProvider: [],
  symbolMap: {},
  submittedPlayerIds: [],
  timerRemaining: GAME_TIMER_SECONDS,
  // 猜題
  guessResult: null,
  round1GuessResult: null,
  guessAB: null,
  wordLength: null,
  // UI
  loading: false,
  loadingText: '',
  error: '',
  errorCode: '',
  // 角色資料（房間/玩家清單以 roomState 為準）
  rolesById: {}, // { [playerId]: { role, quota } }
  // ── 串聊互動（丟火/丟雞蛋）──
  reactions:  {}, // { [playerId]: Array<{ id, emoji, fromPlayerId }> }
})

let _revealTimer = null
let _onGuessResultCb = null
let _gameHandlersRegistered = false

// ── CS 遊戲事件處理 ───────────────────────────────────────────────
function registerGameHandlers(socket) {
  if (_gameHandlersRegistered) return
  _gameHandlersRegistered = true

  // 題目（提示者才收到）
  socket.on('cs:word-revealed', ({ word, category, author }) => {
    gameState.currentWord = { word, category, author }
  })

  // 提示進度
  socket.on('cs:hint-progress', ({ submittedIds }) => {
    gameState.submittedPlayerIds = submittedIds
  })

  // 倒數
  socket.on('cs:timer-tick', ({ remaining }) => {
    gameState.timerRemaining = remaining
  })

  // 第一輪結果
  socket.on('cs:round1-result', ({ hints, hintsProvider, symbolMap, wordLength }) => {
    gameState.round1Hints         = hints
    gameState.round1HintsProvider = hintsProvider ?? []
    gameState.symbolMap           = symbolMap
    gameState.status              = 'round1-result'
    gameState.submittedPlayerIds  = []
    gameState.timerRemaining      = GAME_TIMER_SECONDS
    gameState.wordLength          = wordLength ?? null
  })

  // 第二輪結果
  socket.on('cs:round2-result', ({ hints, hintsProvider, symbolMap, wordLength }) => {
    gameState.round2Hints         = hints
    gameState.round2HintsProvider = hintsProvider ?? []
    gameState.symbolMap           = symbolMap
    gameState.status              = 'round2-result'
    gameState.submittedPlayerIds  = []
    gameState.timerRemaining      = GAME_TIMER_SECONDS
    gameState.wordLength          = wordLength ?? null
  })

  // 猜題結果
  socket.on('cs:guess-result', ({ correct, answer, word, author, wasRound2, a, b }) => {
    if (_revealTimer) { clearInterval(_revealTimer); _revealTimer = null }
    gameState.guessResult = { correct, answer }
    gameState.guessAB     = (a !== undefined) ? { a, b } : null
    if (word) gameState.currentWord = { word, author: author ?? null }
    if (!wasRound2) {
      gameState.round1GuessResult = { correct, answer: answer || '', a: a ?? 0, b: b ?? 0 }
    }
    if (_onGuessResultCb) {
      _onGuessResultCb({ correct, answer, a: a ?? 0, b: b ?? 0, isFinal: wasRound2 })
    }
    if (correct || wasRound2) {
      _revealTimer = setTimeout(() => {
        _revealTimer = null
        gameState.status = 'revealing'
        if (word) gameState.currentWord = { word, author: author ?? null }
      }, 5000)
    }
  })

  // 進入第一輪
  socket.on('cs:round1-start', ({ currentGuesserIndex, players: updatedPlayers }) => {
    if (Array.isArray(updatedPlayers) && updatedPlayers.length) {
      _applyRoles(updatedPlayers)
    }
    gameState.status              = 'round1'
    gameState.currentWord         = null
    gameState.round1Hints         = []
    gameState.round2Hints         = []
    gameState.round1HintsProvider = []
    gameState.round2HintsProvider = []
    gameState.symbolMap           = {}
    gameState.submittedPlayerIds  = []
    gameState.guessResult         = null
    gameState.guessAB             = null
    gameState.round1GuessResult   = null
    gameState.wordLength          = null
    gameState.timerRemaining      = GAME_TIMER_SECONDS
  })

  // 進入第二輪
  socket.on('cs:round2-start', ({ players: updatedPlayers }) => {
    if (_revealTimer) { clearInterval(_revealTimer); _revealTimer = null }
    if (Array.isArray(updatedPlayers) && updatedPlayers.length) {
      _applyRoles(updatedPlayers)
    }
    gameState.status             = 'round2'
    gameState.submittedPlayerIds = []
    gameState.timerRemaining     = GAME_TIMER_SECONDS
  })

  // 揭曉
  socket.on('cs:revealing', ({ word }) => {
    gameState.status = 'revealing'
    gameState.currentWord = { word }
  })

  // 房間狀態更新（結算等）
  socket.on('cs:finished', () => {
    gameState.status = 'finished'
  })

  // 互動反應（丟火/丟雞蛋）
  socket.on('cs:react', ({ fromPlayerId, toPlayerId, emoji }) => {
    if (!gameState.reactions[toPlayerId]) gameState.reactions[toPlayerId] = []
    const id = Date.now() + Math.random()
    const x = (Math.random() * 60 + 20).toFixed(1) + '%'
    gameState.reactions[toPlayerId].push({ id, emoji, fromPlayerId, x })
    setTimeout(() => {
      if (gameState.reactions[toPlayerId]) {
        gameState.reactions[toPlayerId] = gameState.reactions[toPlayerId].filter(r => r.id !== id)
      }
    }, 2500)
  })

  // 錯誤
  socket.on('cs:error', ({ code, message }) => {
    gameState.error     = message
    gameState.errorCode = code
    gameState.loading   = false
    console.error(`[CS] error ${code}:`, message)
  })
}

// 將遊戲事件帶來的 role/quota 寫進 gameState.rolesById；同步 currentGuesser / my* 欄位
let _roomStateRef = null
function _applyRoles(updatedPlayers) {
  for (const up of updatedPlayers) {
    if (!up?.id) continue
    gameState.rolesById[up.id] = { role: up.role ?? null, quota: up.quota ?? null }
  }
  const guesser = updatedPlayers.find(p => p.role === 'guesser')
  if (guesser) gameState.currentGuesserPlayerId = guesser.id
  const myId = _roomStateRef?.myPlayerId
  if (myId) {
    const me = updatedPlayers.find(p => p.id === myId)
    if (me) {
      gameState.myRole    = me.role  ?? gameState.myRole
      gameState.myQuota   = me.quota ?? gameState.myQuota
      gameState.isGuesser = me.role === 'guesser'
    }
  }
}

// ── Public API ────────────────────────────────────────────────────
export function useCharacterStorm() {
  const socket = getSocket()
  registerGameHandlers(socket)

  // 建立 room composable（共用房間邏輯）
  const room = useRoom(socket, {
    onJoinAck(data) {
      gameState.loading = false
      const gs = data.gameState
      if (gs) {
        gameState.status          = gs.roundPhase || gs.status || 'waiting'
        gameState.themePreference = gs.themePreference ?? -1
        if (Array.isArray(gs.players)) _applyRoles(gs.players)
      }
    },
    onRoomError(code, message) {
      gameState.error     = message
      gameState.errorCode = code
      gameState.loading   = false
    },
  })

  // 保存 roomState 引用供 _applyRoles 使用
  _roomStateRef = room.roomState

  // socket 重連自動重新加入
  socket.on('connect', () => {
    room.rejoinOnReconnect()
  })

  // ── 連線進入遊戲 ──────────────────────────────────────────────
  function connect(roomId, nickname, isCreating = false, maxPlayers = 6, themePreference = -1) {
    const playerId = getOrCreatePlayerId()
    gameState.loading     = true
    gameState.loadingText = isCreating ? '建立房間中…' : '加入房間中…'
    gameState.themePreference = themePreference

    if (isCreating) {
      room.createRoom({
        roomId, nickname, playerId, maxPlayers,
        appId: 'character-storm',
        options: { themePreference },
      })
    } else {
      room.joinRoom({ roomId, nickname, playerId })
    }
  }

  // ── 角色分配事件（與 room:join-ack 分開，可能在遊戲開始後送出）
  socket.on('cs:role-assigned', ({ role, quota }) => {
    gameState.myRole    = role
    gameState.myQuota   = quota
    gameState.isGuesser = role === 'guesser'
    const myId = _roomStateRef?.myPlayerId
    if (myId) gameState.rolesById[myId] = { role, quota }
  })

  // ── 遊戲操作 ──────────────────────────────────────────────────
  function submitHint(text) {
    socket.emit('cs:submit-hint', { roomId: room.roomState.roomId, text })
  }

  function submitGuess(answer) {
    socket.emit('cs:submit-guess', { roomId: room.roomState.roomId, answer })
  }

  function startGame() {
    socket.emit('cs:start', { roomId: room.roomState.roomId })
  }

  function nextTurn() {
    socket.emit('cs:next-round', { roomId: room.roomState.roomId })
  }

  function continueGame() {
    socket.emit('cs:continue', { roomId: room.roomState.roomId })
  }

  function endGame() {
    socket.emit('cs:end-game', { roomId: room.roomState.roomId })
  }

  function disconnect() {
    if (_revealTimer) clearInterval(_revealTimer)
    socket.disconnect()
    _socket = null
    _gameHandlersRegistered = false
  }

  function copyInviteLink() {
    return room.copyInviteLink('/character-storm')
  }

  function onGuessResult(cb) {
    _onGuessResultCb = cb
  }

  function sendReaction(toPlayerId, emoji) {
    socket.emit('cs:react', { roomId: room.roomState.roomId, toPlayerId, emoji })
  }

  // 合併 roomState.players（含 nickname / is_online 等）與 rolesById（role / quota）
  const playersWithRoles = computed(() =>
    room.roomState.players.map(p => ({
      ...p,
      role:  gameState.rolesById[p.id]?.role  ?? null,
      quota: gameState.rolesById[p.id]?.quota ?? null,
    }))
  )

  return {
    // 遊戲狀態（唯讀）
    state: readonly(gameState),
    // 房間狀態（唯讀）
    roomState: room.roomState,
    // 合併房間玩家 + 角色（template 用此取代舊 state.players）
    playersWithRoles,
    // 連線 / 遊戲操作
    connect,
    submitHint,
    submitGuess,
    startGame,
    nextTurn,
    continueGame,
    endGame,
    disconnect,
    copyInviteLink,
    onGuessResult,
    sendReaction,
    // 房間操作（轉發 useRoom 的方法）
    kickPlayer:      room.kickPlayer,
    transferHost:    room.transferHost,
    setReady:        room.setReady,
    leaveRoom:       room.leaveRoom,
    upgradeFromSpectator: room.upgradeFromSpectator,
  }
}
