// 稱號與 server/same-word/gameLogic.js 的 CHEMISTRY_TIERS 保持一致（伺服器傳 tierId 與同詞比例 value）
export const APP_ID = 'same-word'
export const MIN_PLAYERS = 2
export const MAX_PLAYERS = 12
export const WORD_MAX_LEN = 12
export const WORD_PATTERN = /^[一-鿿A-Za-z]+$/

export const TIERS = {
  soulmates:    { id: 'soulmates',  emoji: '💘', title: '天生一對', badge: 'badge-t1' },
  telepathy:    { id: 'telepathy',  emoji: '✨', title: '心有靈犀', badge: 'badge-t2' },
  'in-sync':    { id: 'in-sync',    emoji: '🤝', title: '默契十足', badge: 'badge-t3' },
  compatible:   { id: 'compatible', emoji: '😊', title: '還算合拍', badge: 'badge-t4' },
  'slow-burn':  { id: 'slow-burn',  emoji: '🌱', title: '慢熟型',   value: 40,  badge: 'badge-t5' },
  'needs-work': { id: 'needs-work', emoji: '🔧', title: '需要磨合', badge: 'badge-t6' },
  barely:       { id: 'barely',     emoji: '😅', title: '勉強同頻', badge: 'badge-t7' },
  'near-miss':  { id: 'near-miss',  emoji: '🩹', title: '差點錯過', badge: 'badge-t8' },
  rivals:       { id: 'rivals',     emoji: '💔', title: '死對頭',   value: 0,   badge: 'badge-enemy' },
}
export const tierOf = id => TIERS[id] ?? TIERS.rivals
export const badgeUrl = name => `${import.meta.env.BASE_URL}same-word/${name}.webp`

// 同詞群組配色（循環使用）
export const GROUP_COLORS = ['#FB7185', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6']

// 同詞比例 → 熱力圖底色
export function heatColor(value) {
  const a = (0.12 + (value / 100) * 0.78).toFixed(2)
  return `rgba(251,113,133,${a})`
}

export const TIMER_PRESETS = [20, 30, 45, 60]
export const ROUND_PRESETS = [3, 5, 7, 10]
export const REACTIONS = ['🤣', '🤔', '👏']
export const CONVERGE_MAX = 3
export const CHAIN_ROUNDS = 6
export const ALL_SAME_BONUS = 3

export function checkWord(raw) {
  const w = String(raw ?? '').trim()
  if (!w) return '請輸入一個詞'
  if (w.length > WORD_MAX_LEN) return `最多 ${WORD_MAX_LEN} 個字`
  if (!WORD_PATTERN.test(w)) return '請輸入中文或英文'
  return ''
}

export const MODE_CHOICES = [
  { id: 'prompts', emoji: '📝', title: '題目模式', desc: '每題一個新題目，比誰跟別人想得一樣，最後有合作終局' },
  { id: 'chain', emoji: '🔗', title: '接龍模式', desc: '只有第 1 輪有題目，之後看大家的詞一路往中間靠，共 6 輪' },
  { id: 'relay', emoji: '💬', title: '接句模式', desc: '輪流快速接三個字，只看得到上一段，最後揭曉整段話' },
]

// ── 接句模式（與 server/same-word/gameLogic.js 保持一致）──────────
export const SEGMENT_LEN = 3
export const SEGMENT_PUNCT = '，。！？、…～'
export const TURN_PRESETS = [5, 8, 10, 15]
export const LAP_PRESETS = [1, 2, 3, 4]

// 去空白、半形標點轉全形；回傳 { text, count }，count 是不含標點的字數
export function readSegment(raw) {
  const text = String(raw ?? '').replace(/\s+/g, '')
    .replace(/,/g, '，').replace(/\?/g, '？').replace(/!/g, '！').replace(/~/g, '～')
  const count = [...text].filter(c => !SEGMENT_PUNCT.includes(c)).length
  return { text, count }
}

export function checkSegment(raw) {
  const { text, count } = readSegment(raw)
  if (!count) return `請寫 ${SEGMENT_LEN} 個字`
  if (count !== SEGMENT_LEN) return `要剛好 ${SEGMENT_LEN} 個字（現在 ${count} 個，標點不算）`
  if (![...text].every(c => SEGMENT_PUNCT.includes(c) || /^[一-鿿A-Za-z0-9Ａ-Ｚａ-ｚ０-９]$/.test(c))) return '只能用中文、英文或數字'
  return ''
}
