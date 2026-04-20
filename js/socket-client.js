// ================================================================
//  Socket.io 客戶端初始化
//  全域 `socket` 物件供 room-page.js 使用
//  SOCKET_SERVER_URL 由 config.js 提供
// ================================================================

const socket = io(SOCKET_SERVER_URL, {
  // 斷線時自動重連，最多等 10 秒
  reconnectionDelay:    1000,
  reconnectionDelayMax: 10000,
  // 連線逾時 10 秒
  timeout: 10000,
  // 先嘗試 WebSocket，失敗才降級 HTTP long-polling
  transports: ['websocket', 'polling'],
});
