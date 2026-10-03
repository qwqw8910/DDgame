// 山中別館殺人事件 — 前端共用常數（id 與 server/mountain-lodge/gameLogic.js 對應）

export const APP_ID = 'mountain-lodge'
// 單人試玩模式（與 server/mountain-lodge/gameLogic.js 的 SOLO_TEST 同步）
// TODO: 正式上線改回 false
export const SOLO_TEST = true
export const MIN_PLAYERS = SOLO_TEST ? 1 : 3
export const MAX_PLAYERS = 6

// 圖片素材（public/mountain-lodge/，webp）
const IMG = `${import.meta.env.BASE_URL}mountain-lodge/`
export const CARD_BACK_IMG = `${IMG}cards/card-back.webp`
export const BANNER_IMG = `${IMG}bg/banner.webp`
export const PATTERN_BG_IMG = `${IMG}bg/pattern.webp`

// 玩家可分配的 6 個地點
export const LOCATIONS = {
  lounge:    { name: '交誼廳', emoji: '🛋️', img: `${IMG}locations/lounge.webp` },
  gallery:   { name: '畫廊',   emoji: '🖼️', img: `${IMG}locations/gallery.webp` },
  billiards: { name: '撞球室', emoji: '🎱', img: `${IMG}locations/billiards.webp` },
  study:     { name: '書房',   emoji: '📚', img: `${IMG}locations/study.webp` },
  entrance:  { name: '玄關',   emoji: '🚪', img: `${IMG}locations/entrance.webp` },
  dining:    { name: '餐廳',   emoji: '🍽️', img: `${IMG}locations/dining.webp` },
}

// 固定在畫面中央的兩個地點
export const LODGE_ROOM_ID = 'lodge-room'
export const LODGE_ROOM = { name: '客房',   emoji: '🛏️', img: `${IMG}locations/lodge-room.webp` }
export const BOILER     = { name: '鍋爐室', emoji: '🔥', img: `${IMG}locations/boiler.webp` }

export const GUEST_COLORS = {
  yellow: { name: '黃', hex: '#FBBF24', img: `${IMG}roles/guest-yellow.webp` },
  blue:   { name: '藍', hex: '#3B82F6', img: `${IMG}roles/guest-blue.webp` },
  red:    { name: '紅', hex: '#F43F5E', img: `${IMG}roles/guest-red.webp` },
  green:  { name: '綠', hex: '#10B981', img: `${IMG}roles/guest-green.webp` },
  purple: { name: '紫', hex: '#8B5CF6', img: `${IMG}roles/guest-purple.webp` },
}

export const ROLES = {
  killer:     { name: '殺人魔', emoji: '🔪', team: 'killer', hint: '你不能被送進鍋爐室，誤導大家！', img: `${IMG}roles/killer.webp` },
  accomplice: { name: '共犯',   emoji: '🎭', team: 'killer', hint: '幫殺人魔脫身，你不一定知道誰是殺人魔。', img: `${IMG}roles/accomplice.webp` },
  lawyer:     { name: '律師',   emoji: '⚖️', team: 'good',   hint: '開票時可公開身份，作廢一位玩家的 1 票。', ability: '公開身份，作廢 1 票', img: `${IMG}roles/lawyer.webp` },
  bomber:     { name: '炸彈客', emoji: '💣', team: 'bomber', hint: '你被送進鍋爐室就單獨獲勝！可以假裝殺人魔。', img: `${IMG}roles/bomber.webp` },
  merchant:   { name: '富商',   emoji: '💰', team: 'good',   hint: '開票時可公開身份，你的票算 2 票。', ability: '公開身份，自己的票算 2 票', img: `${IMG}roles/merchant.webp` },
  guest:      { name: '客人',   emoji: '🧑', team: 'good',   hint: '把殺人魔送進鍋爐室！' },
}

// 角色介紹彈窗用：能力與勝利條件（顯示順序）
export const ROLE_GUIDE = [
  { kind: 'killer',     level: 'Level 1+', ability: '可以說謊、誤導大家，把嫌疑推給別人。', win: '殺人魔沒有被送進鍋爐室。' },
  { kind: 'accomplice', level: 'Level 2、3', ability: '不一定知道誰是殺人魔；可假扮殺人魔，或製造假嫌疑人。', win: '與殺人魔相同：殺人魔沒有進鍋爐室。' },
  { kind: 'lawyer',     level: 'Level 3', ability: '開票階段可公開身份並指定一位玩家，該玩家原本投出的 1 票無效（不能選自己）。', win: '殺人魔被送進鍋爐室。' },
  { kind: 'bomber',     level: 'Level 4、5', ability: '裝成殺人魔，想辦法讓大家把自己關進鍋爐室。', win: '自己被送進鍋爐室，單獨獲勝，其他人的勝利條件全部失效。' },
  { kind: 'merchant',   level: 'Level 5', ability: '開票階段可公開身份，自己投的票算 2 票。', win: '殺人魔被送進鍋爐室。' },
  { kind: 'guest',      level: '所有 Level', ability: '沒有特殊能力，只能靠目擊情報與推理。客人有黃、藍、紅、綠、紫色，僅用於討論時辨識。', win: '殺人魔被送進鍋爐室。' },
]

export const TEAM_NAMES ={ good: '好人陣營', killer: '殺人魔陣營', bomber: '炸彈客' }

export const DISCUSSION_CHOICES = [60, 120, 180, 240, 300]
// 輪到自己傳牌時，固定要等這麼久才能按下「確認傳牌」（10~15 秒內，給壞人想策略/說法的時間）
export const MIN_PASS_SECONDS = 12
export const LEVEL_CHOICES = [
  { value: 1, label: 'Level 1：殺人魔 + 客人', desc: '新手建議' },
  { value: 2, label: 'Level 2：加入共犯',      desc: '共犯會幫殺人魔說謊' },
  { value: 3, label: 'Level 3：加入律師',      desc: '至少 4 人；律師可作廢 1 票' },
  { value: 4, label: 'Level 4：炸彈客取代共犯', desc: '炸彈客想被關進鍋爐室' },
  { value: 5, label: 'Level 5：炸彈客 + 富商',  desc: '至少 4 人；富商可讓票變 2 票' },
]

// Level 3、5 至少 4 人（與 server LEVEL_MIN_PLAYERS 對應）
export const LEVEL_MIN_PLAYERS = SOLO_TEST ? {} : { 3: 4, 5: 4 }
export const minPlayersForLevel = level => LEVEL_MIN_PLAYERS[level] ?? MIN_PLAYERS

// 牌面圖：客人依顏色、其他依角色
export function cardImage(card) {
  if (!card) return null
  return card.kind === 'guest' ? GUEST_COLORS[card.color]?.img ?? null : ROLES[card.kind]?.img ?? null
}

export function cardLabel(card) {
  if (!card) return ''
  const role = ROLES[card.kind]
  if (card.kind === 'guest') return `${GUEST_COLORS[card.color]?.name ?? ''}色${role.name}`
  return role.name
}

export function formatSeconds(total) {
  const s = Math.max(0, Math.ceil(total))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
