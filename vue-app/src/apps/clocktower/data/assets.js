// 血染鐘樓 — 視覺素材唯一登記處
// 元件一律透過 RoleToken.vue / GameIcon.vue 顯示，元件內不直接寫 emoji 或圖片路徑。
// 換成真圖片：把圖檔放到 public/clocktower/<分類>/<id>.webp，再把該筆的 img 改成 true（或填完整路徑）。
// img 為 null / false 時，自動退回 icon（emoji）。
const BASE = `${import.meta.env.BASE_URL}clocktower/`

export const ROLE_ASSETS = {
  // 鎮民 Townsfolk
  washerwoman:   { icon: '🧺', img: null },
  librarian:     { icon: '📖', img: null },
  investigator:  { icon: '🔍', img: null },
  chef:          { icon: '👨‍🍳', img: null },
  empath:        { icon: '💞', img: null },
  fortuneteller: { icon: '🔮', img: null },
  undertaker:    { icon: '⚰️', img: null },
  monk:          { icon: '🙏', img: null },
  ravenkeeper:   { icon: '🐦‍⬛', img: null },
  virgin:        { icon: '🕊️', img: null },
  slayer:        { icon: '🏹', img: null },
  soldier:       { icon: '🛡️', img: null },
  mayor:         { icon: '🎩', img: null },
  // 外來者 Outsider
  butler:        { icon: '🤵', img: null },
  drunk:         { icon: '🍺', img: null },
  recluse:       { icon: '🏚️', img: null },
  saint:         { icon: '😇', img: null },
  // 爪牙 Minion
  poisoner:      { icon: '🧪', img: null },
  spy:           { icon: '🕵️', img: null },
  scarletwoman:  { icon: '💋', img: null },
  baron:         { icon: '👑', img: null },
  // 惡魔 Demon
  imp:           { icon: '😈', img: null },
  // 首夜固定項目（夜晚順序清單用）
  minioninfo:    { icon: '🗡️', img: null, name: '爪牙互認' },
  demoninfo:     { icon: '👹', img: null, name: '惡魔得知爪牙與偽裝' },
}

// 提醒標記（id 格式：<角色id>:<標記名>）
export const REMINDER_ASSETS = {
  'poisoner:poisoned':        { icon: '☠️', label: '中毒' },
  'drunk:drunk':              { icon: '🥴', label: '酒鬼' },
  'monk:protected':           { icon: '✋', label: '受保護' },
  'imp:target':               { icon: '🗡️', label: '攻擊目標' },
  'imp:dead':                 { icon: '💀', label: '死亡' },
  'butler:master':            { icon: '🤵', label: '主人' },
  'fortuneteller:redherring': { icon: '🐟', label: '紅鯡魚' },
  'washerwoman:townsfolk':    { icon: '🧺', label: '鎮民' },
  'washerwoman:wrong':        { icon: '❌', label: '錯誤' },
  'librarian:outsider':       { icon: '📖', label: '外來者' },
  'librarian:wrong':          { icon: '❌', label: '錯誤' },
  'investigator:minion':      { icon: '🔍', label: '爪牙' },
  'investigator:wrong':       { icon: '❌', label: '錯誤' },
  'undertaker:executed':      { icon: '⚰️', label: '今日處決' },
  'virgin:used':              { icon: '🕊️', label: '能力已用' },
  'slayer:used':              { icon: '🏹', label: '能力已用' },
  'scarletwoman:demon':       { icon: '💋', label: '成為惡魔' },
}

// 陣營
export const TEAM_ASSETS = {
  townsfolk: { icon: '🏘️', color: '#3B82F6', img: null, name: '鎮民' },
  outsider:  { icon: '🧭', color: '#06B6D4', img: null, name: '外來者' },
  minion:    { icon: '🗡️', color: '#F97316', img: null, name: '爪牙' },
  demon:     { icon: '👹', color: '#EF4444', img: null, name: '惡魔' },
  good:      { icon: '🌞', color: '#3B82F6', img: null, name: '善良陣營' },
  evil:      { icon: '🌑', color: '#EF4444', img: null, name: '邪惡陣營' },
}

// UI 通用圖示
export const UI_ASSETS = {
  night:       { icon: '🌙', img: null },
  day:         { icon: '☀️', img: null },
  dawn:        { icon: '🌅', img: null },
  dead:        { icon: '💀', img: null },
  ghostVote:   { icon: '👻', img: null },
  nominate:    { icon: '👉', img: null },
  vote:        { icon: '✋', img: null },
  execute:     { icon: '⚖️', img: null },
  tokenBack:   { icon: '❓', img: null },      // 未翻開的角色牌背
  banner:      { icon: '🕰️', img: null },      // 大廳橫幅
  tableBg:     { icon: null, img: null },      // 圓桌背景
  storyteller: { icon: '📜', img: null },
  grimoire:    { icon: '📕', img: null },
  roleSheet:   { icon: '🎭', img: null },
  whisper:     { icon: '💬', img: null },
  chat:        { icon: '🗨️', img: null },
  left:        { icon: '🚪', img: null },
  bot:         { icon: '🤖', img: null },
  voice:       { icon: '🎧', img: null },
  link:        { icon: '🔗', img: null },
  seat:        { icon: '🪑', img: null },
  dice:        { icon: '🎲', img: null },
  timer:       { icon: '⏳', img: null },
  pause:       { icon: '⏸️', img: null },
  info:        { icon: '📨', img: null },
  warn:        { icon: '⚠️', img: null },
  trophy:      { icon: '🏆', img: null },
  log:         { icon: '📋', img: null },
  host:        { icon: '👑', img: null },
  offline:     { icon: '📴', img: null },
  // Phase 2：說書人輔助 / 回放 / 統計
  truth:       { icon: '✅', img: null },      // 與魔典相符
  lie:         { icon: '🎭', img: null },      // 給假資訊
  balance:     { icon: '📊', img: null },      // 平衡指標
  stats:       { icon: '📈', img: null },      // 私聊統計
  replay:      { icon: '🎞️', img: null },
  play:        { icon: '▶️', img: null },
  stepBack:    { icon: '⏮️', img: null },
  stepForward: { icon: '⏭️', img: null },
  first:       { icon: '⏪', img: null },
  last:        { icon: '⏩', img: null },
  heatLow:     { icon: '🧊', img: null },      // 惡魔幾乎沒被懷疑
  heatMedium:  { icon: '🌡️', img: null },
  heatHigh:    { icon: '🔥', img: null },      // 惡魔被高度懷疑
}

// 唯一的路徑解析函式：img === true → 依慣例組路徑；字串 → 直接用；其他 → null
export function resolveImg(category, id, entry) {
  if (!entry?.img) return null
  if (entry.img !== true) return entry.img
  const file = category === 'reminders' ? id.replace(':', '-') : id
  return `${BASE}${category}/${file}.webp`
}
