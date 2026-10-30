// 後端 (Express + Socket.io) 的 base URL；HTTP 與 socket 共用同一個來源
export const SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

// 背景喚醒後端（免費方案閒置會休眠，冷啟動約 30~60 秒）：
// 使用者還在挑遊戲、輸入暱稱時就先叫醒，按下建立／加入時多半已就緒。整個分頁只送一次。
let _warmedUp = false
export function warmUpServer() {
  if (_warmedUp) return
  _warmedUp = true
  // no-cors：不需後端 CORS 設定，只要觸發請求即可
  fetch(`${SERVER_URL}/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => { _warmedUp = false })
}
