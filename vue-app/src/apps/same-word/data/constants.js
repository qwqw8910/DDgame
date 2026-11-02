// 與 server/same-word/gameLogic.js 的 CHEMISTRY_TIERS 保持一致（伺服器只傳 tierId）
export const APP_ID = 'same-word'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 12
export const WORD_MAX_LEN = 12
export const WORD_PATTERN = /^[一-鿿A-Za-z]+$/

export const TIERS = {
  soulmates:    { id: 'soulmates',  emoji: '💘', title: '天生一對', value: 100, badge: 'badge-t1' },
  telepathy:    { id: 'telepathy',  emoji: '✨', title: '心有靈犀', value: 85,  badge: 'badge-t2' },
  'in-sync':    { id: 'in-sync',    emoji: '🤝', title: '默契十足', value: 70,  badge: 'badge-t3' },
  compatible:   { id: 'compatible', emoji: '😊', title: '還算合拍', value: 55,  badge: 'badge-t4' },
  'slow-burn':  { id: 'slow-burn',  emoji: '🌱', title: '慢熟型',   value: 40,  badge: 'badge-t5' },
  'needs-work': { id: 'needs-work', emoji: '🔧', title: '需要磨合', value: 30,  badge: 'badge-t6' },
  barely:       { id: 'barely',     emoji: '😅', title: '勉強同頻', value: 20,  badge: 'badge-t7' },
  'near-miss':  { id: 'near-miss',  emoji: '🩹', title: '差點錯過', value: 10,  badge: 'badge-t8' },
  rivals:       { id: 'rivals',     emoji: '💔', title: '死對頭',   value: 0,   badge: 'badge-enemy' },
}
export const tierOf = id => TIERS[id] ?? TIERS.rivals
export const badgeUrl = name => `${import.meta.env.BASE_URL}same-word/${name}.webp`

// 同詞群組配色（循環使用）
export const GROUP_COLORS = ['#FB7185', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6']

// 默契值 → 熱力圖底色
export function heatColor(value) {
  const a = (0.12 + (value / 100) * 0.78).toFixed(2)
  return `rgba(251,113,133,${a})`
}

export const TIMER_PRESETS = [30, 45, 60, 90]
export const ROUND_PRESETS = [5, 8, 12, 0]

export function checkWord(raw) {
  const w = String(raw ?? '').trim()
  if (!w) return '請輸入一個詞'
  if (w.length > WORD_MAX_LEN) return `最多 ${WORD_MAX_LEN} 個字`
  if (!WORD_PATTERN.test(w)) return '請輸入中文或英文'
  return ''
}
