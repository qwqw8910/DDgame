// ================================================================
//  分帳 — Socket.io Composable
//  房間部分由 useRoom() 處理；本檔案只處理 bill:* 事件與帳務狀態。
//  金額一律為最小單位整數；分攤與「誰給誰」由後端計算，前端只顯示。
// ================================================================
import { reactive, readonly, computed } from 'vue'
import { io } from 'socket.io-client'
import { getOrCreatePlayerId } from '@/shared/data/identity.js'
import { useRoom } from '@/shared/composables/useRoom.js'
import { SERVER_URL } from '@/shared/api/config.js'

let _socket = null
function getSocket() {
  if (!_socket) {
    _socket = io(`${SERVER_URL}/split-bill`, {
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      transports: ['websocket', 'polling'],
      autoConnect: false,
    })
  }
  return _socket
}

const bill = reactive({
  roomName: '',
  meMemberId: null,
  members: [],
  expenses: [],
  activities: [],
  baseCurrency: 'TWD',
  rates: {},          // { [currency]: { rate, source, updatedAt } }  1 外幣 = rate 結算幣別
  transfers: [],      // 誰該給誰（兩兩對沖）：{ from, to, amount, details:[{expenseId, amount}] }
  missingRates: [],   // 還沒有匯率、因此未計入的幣別
  loading: false,
  loadingText: '',
  error: '',
  errorCode: '',
  kicked: false,
  roomDeleted: false,
  errorSeq: 0,    // 每次錯誤 +1，讓頁面能 watch 到相同訊息的重複錯誤
})

let _handlersRegistered = false
let _currentRoom = null
let _reconnectListenerAttached = false

function upsert(list, item) {
  const i = list.findIndex(x => x.id === item.id)
  if (i === -1) list.push(item)
  else list[i] = item
}

function applyTransfers({ transfers, missingRates }) {
  bill.transfers = transfers ?? []
  bill.missingRates = missingRates ?? []
}

function applySettings({ baseCurrency, rates }) {
  bill.baseCurrency = baseCurrency ?? 'TWD'
  bill.rates = rates ?? {}
}

function registerHandlers(socket) {
  if (_handlersRegistered) return
  _handlersRegistered = true

  socket.on('bill:state', (s) => {
    bill.roomName = s.roomName ?? ''
    bill.meMemberId = s.meMemberId
    bill.members = s.members ?? []
    bill.expenses = s.expenses ?? []
    bill.activities = s.activities ?? []
    applySettings(s)
    applyTransfers(s)
    bill.loading = false
  })
  socket.on('bill:room-renamed', ({ roomName }) => { bill.roomName = roomName })
  socket.on('bill:members', ({ members }) => { bill.members = members })
  socket.on('bill:expense-changed', ({ expense }) => upsert(bill.expenses, expense))
  socket.on('bill:settings', applySettings)
  socket.on('bill:transfers-updated', applyTransfers)
  socket.on('bill:activity', ({ activity }) => upsert(bill.activities, activity))
  socket.on('bill:room-deleted', () => { bill.roomDeleted = true })
  socket.on('bill:error', ({ code, message }) => {
    bill.error = message
    bill.errorCode = code
    bill.errorSeq++
    bill.loading = false
  })
}

export function useSplitBill() {
  const socket = getSocket()
  registerHandlers(socket)

  const room = useRoom(socket, {
    onJoinAck() {
      bill.error = ''
      bill.errorCode = ''
    },
    onRoomError(code, message) {
      bill.error = message
      bill.errorCode = code
      bill.errorSeq++
      bill.loading = false
    },
    onKicked() { bill.kicked = true },
  })

  _currentRoom = room
  if (!_reconnectListenerAttached) {
    _reconnectListenerAttached = true
    socket.on('connect', () => _currentRoom?.rejoinOnReconnect())
  }

  /** 進房。playerId 僅作初始值，後端會依「房號+名稱」覆寫，之後以 join-ack 的 myPlayerId 為準 */
  function connect(roomId, nickname, isCreating = false, maxPlayers = 20) {
    const playerId = getOrCreatePlayerId()
    bill.loading = true
    bill.loadingText = isCreating ? '建立房間中…' : '加入房間中…'
    bill.error = ''
    bill.errorCode = ''
    bill.kicked = false
    bill.roomDeleted = false
    if (isCreating) room.createRoom({ roomId, nickname, playerId, maxPlayers, appId: 'split-bill' })
    else room.joinRoom({ roomId, nickname, playerId })
  }

  const emit = (event, payload = {}) => socket.emit(event, payload)

  function disconnect() {
    socket.disconnect()
    _socket = null
    _handlersRegistered = false
    _reconnectListenerAttached = false
    _currentRoom = null
  }

  // ── 派生資料 ────────────────────────────────────────────────
  const memberById = computed(() => Object.fromEntries(bill.members.map(m => [m.id, m])))
  const nameOf = (id) => memberById.value[id]?.name ?? '（未知）'

  return {
    bill: readonly(bill),
    roomState: room.roomState,
    memberById,
    nameOf,
    connect,
    disconnect,
    copyInviteLink: () => room.copyInviteLink('/split-bill'),
    // 帳務操作
    addExpense:      (p) => emit('bill:expense-add', p),
    updateExpense:   (p) => emit('bill:expense-update', p),
    deleteExpense:   (expenseId) => emit('bill:expense-delete', { expenseId }),
    restoreExpense:  (expenseId) => emit('bill:expense-restore', { expenseId }),
    addVirtualMember:(name) => emit('bill:member-add-virtual', { name }),
    setRate:         (currency, rate) => emit('bill:rate-set', { currency, rate }),
    refreshRate:     (currency) => emit('bill:rate-refresh', { currency }),
    setBaseCurrency: (currency) => emit('bill:base-currency-set', { currency }),
    deleteRoom:      () => emit('bill:room-delete'),
    renameRoom:      (name) => emit('bill:room-rename', { name }),
    requestState:    () => emit('bill:state-request'),
    // 房間操作
    kickPlayer:   room.kickPlayer,
    transferHost: room.transferHost,
    leaveRoom:    room.leaveRoom,
  }
}
