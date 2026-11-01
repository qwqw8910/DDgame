// 最近進過的房間（只存在本機 localStorage，不需帳號）
const KEY = 'split_bill_recent'
const MAX = 8

export function loadRecentRooms() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

/** name 省略時沿用先前記住的帳本名稱 */
export function rememberRoom(roomId, nickname, name) {
  try {
    const old = loadRecentRooms()
    const prev = old.find(r => r.roomId === roomId)
    const rest = old.filter(r => r.roomId !== roomId)
    const entry = { roomId, nickname, name: name ?? prev?.name ?? '', at: Date.now() }
    localStorage.setItem(KEY, JSON.stringify([entry, ...rest].slice(0, MAX)))
  } catch { /* 無痕模式等情況略過 */ }
}

export function forgetRoom(roomId) {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadRecentRooms().filter(r => r.roomId !== roomId)))
  } catch { /* ignore */ }
}
