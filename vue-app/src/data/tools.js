/**
 * 甜甜的小秘密 — 工具清單
 *
 * 新增工具只需在此陣列加入一個物件，UI 會自動渲染。
 *
 * @typedef {Object} Tool
 * @property {string}  id          - URL-safe 唯一 slug
 * @property {string}  name        - 顯示用名稱
 * @property {string}  tagline     - 卡片副標題（15字以內）
 * @property {string}  description - 卡片說明文字（30字以內）
 * @property {string}  emoji       - 工具主圖示
 * @property {'purple'|'rose'|'blue'|'cyan'|'orange'} color - 卡片主題色
 * @property {string|null}  route       - vue-router 內部路由（優先使用）
 * @property {string|null}  externalUrl - 外部連結（null = 使用 route）
 * @property {'live'|'coming-soon'|'beta'} status - 卡片狀態
 * @property {string[]} tags       - 類型標籤（供未來篩選使用）
 */
export const tools = [
  {
    id: 'know-me',
    name: '懂我再說',
    tagline: '多人互動猜測遊戲',
    description: '選擇 · 猜測 · 揭曉\n看看朋友有多了解你！',
    emoji: '🎭',
    color: 'purple',
    route: '/game',
    externalUrl: null,
    status: 'live',
    tags: ['多人', '遊戲'],
  },
  {
    id: 'dinner-picker',
    name: '今晚吃什麼',
    tagline: '今晚吃什麼，讓命運說了算',
    description: '定位 · 拉霸 · 抽籤\n附近餐廳隨機命運決定！',
    emoji: '🎰',
    color: 'orange',
    route: '/dinner-picker',
    externalUrl: null,
    status: 'live',
    tags: ['單人', '美食', '定位'],
  },
  // ── 未來新增工具範例 ──────────────────────────────────────────
  // {
  //   id: 'my-new-tool',
  //   name: '新工具名稱',
  //   tagline: '一句話說明',
  //   description: '詳細描述，30字以內',
  //   emoji: '🎯',
  //   color: 'blue',
  //   route: '/my-new-tool',       // 或填 null
  //   externalUrl: null,           // 或填外部 URL，例如 'https://...'
  //   status: 'coming-soon',       // 上線前先設 coming-soon
  //   tags: ['標籤'],
  // },
]
