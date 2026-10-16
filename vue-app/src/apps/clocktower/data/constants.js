// 血染鐘樓 — 前端共用常數（與 server/clocktower/gameLogic.js 對應）

export const APP_ID = 'clocktower'
// 開發模式：可填入測試機器人（與 server/clocktower/gameLogic.js 的 DEV_BOTS 同步）
// TODO: 正式上線改回 false
export const DEV_BOTS = true

export const MIN_SEATS = 5
export const MAX_SEATS = 15

// 人數 → 鎮民 / 外來者 / 爪牙 / 惡魔（只用於顯示，合法性檢查以伺服器為準）
export const COMPOSITION = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1],
  13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
}
export const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon']
export const GOOD_TEAMS = ['townsfolk', 'outsider']

export const CHAT_MAX_LEN = 300
export const HAND_SPEEDS = [
  { ms: 500, label: '快（0.5 秒）' },
  { ms: 1000, label: '標準（1 秒）' },
  { ms: 2000, label: '慢（2 秒）' },
]

export const DAY_SUB_PHASES = {
  dawn: { label: '天亮', hint: '說書人在 Discord 宣布昨晚的結果' },
  free: { label: '自由時間', hint: '在 Discord 公開討論；網頁上可以開私聊群組' },
  nomination: { label: '提名與投票', hint: '存活玩家可以提名；私聊已關閉（訊息仍可閱讀）' },
}

// 說書人送資訊的類型（prompt.type）
export const INFO_TYPES = [
  { type: 'info-number', label: '數字' },
  { type: 'info-players-role', label: '玩家 + 角色' },
  { type: 'info-yes-no', label: '是 / 否' },
  { type: 'info-role', label: '角色' },
  { type: 'info-grimoire', label: '魔典快照' },
  { type: 'custom', label: '自訂文字' },
]

export function formatSeconds(total) {
  const s = Math.max(0, Math.ceil(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function formatClock(ts) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
