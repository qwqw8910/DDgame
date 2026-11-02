import { createRouter, createWebHashHistory } from 'vue-router'
// 首頁直接打包進主 bundle；其餘頁面依路由拆 chunk，進到該遊戲才下載（含各自的 CSS）
import PortalPage from '../apps/portal/pages/PortalPage.vue'

const routes = [
  // 知道網址才能到，不登記進 tools.js／Portal 首頁
  { path: '/admin',                 name: 'admin',                component: () => import('../apps/know-me/pages/AdminPage.vue') },
  { path: '/',                      name: 'portal',               component: PortalPage },                                                          // 工具入口首頁
  { path: '/game',                  name: 'home',                 component: () => import('../apps/know-me/pages/IndexPage.vue') },                 // 懂我再說
  { path: '/room',                  name: 'room',                 component: () => import('../apps/know-me/pages/RoomPage.vue') },                  // 遊戲房間
  { path: '/dinner-picker',         name: 'dinner-picker',        component: () => import('../apps/dinner-picker/pages/DinnerPickerPage.vue') },    // 今晚吃什麼
  { path: '/dinner-invite',         name: 'dinner-invite',        component: () => import('../apps/dinner-invite/pages/DinnerInvitePage.vue') },    // 晚餐邀請選擇器
  { path: '/topic-generator',       name: 'topic-generator',      component: () => import('../apps/topic-generator/pages/TopicGeneratorPage.vue') },// 話題產生器
  { path: '/character-storm',       name: 'character-storm',      component: () => import('../apps/character-storm/pages/CharacterStormLobbyPage.vue') }, // 默契字囊團 入口
  { path: '/character-storm/room',  name: 'character-storm-room', component: () => import('../apps/character-storm/pages/CharacterStormRoomPage.vue') },  // 默契字囊團 房間
  { path: '/mountain-lodge',        name: 'mountain-lodge',       component: () => import('../apps/mountain-lodge/pages/MountainLodgeLobbyPage.vue') },   // 山中別館殺人事件 入口
  { path: '/mountain-lodge/room',   name: 'mountain-lodge-room',  component: () => import('../apps/mountain-lodge/pages/MountainLodgeRoomPage.vue') },    // 山中別館殺人事件 房間
  { path: '/clocktower',            name: 'clocktower',           component: () => import('../apps/clocktower/pages/ClocktowerLobbyPage.vue') },     // 血染鐘樓 入口
  { path: '/clocktower/room',       name: 'clocktower-room',      component: () => import('../apps/clocktower/pages/ClocktowerRoomPage.vue') },      // 血染鐘樓 房間
  { path: '/gem-td',                name: 'gem-td',               component: () => import('../apps/gem-td/pages/GemTdLobbyPage.vue') },              // 寶石塔防 入口
  { path: '/gem-td/room',           name: 'gem-td-room',          component: () => import('../apps/gem-td/pages/GemTdRoomPage.vue') },               // 寶石塔防 房間
  { path: '/gender-score',          name: 'gender-score',        component: () => import('../apps/gender-score/pages/GenderScorePage.vue') },       // 十分男女
  { path: '/story-canvas',          name: 'story-canvas',         component: () => import('../apps/story-canvas/pages/StoryCanvasPage.vue') },       // 故事關係圖
  { path: '/ladder',                name: 'ladder',               component: () => import('../apps/ladder/pages/LadderPage.vue') },                  // 爬樓梯抽籤
  { path: '/ladder/result',         name: 'ladder-result',        component: () => import('../apps/ladder/pages/LadderResultPage.vue') },            // 爬樓梯抽籤：私人結果連結
  { path: '/ladder/verify',         name: 'ladder-verify',        component: () => import('../apps/ladder/pages/LadderVerifyPage.vue') },            // 爬樓梯抽籤：驗證清單
  { path: '/same-word',             name: 'same-word',           component: () => import('../apps/same-word/pages/SameWordLobbyPage.vue') },      // 同詞相遇 入口
  { path: '/same-word/room',        name: 'same-word-room',      component: () => import('../apps/same-word/pages/SameWordRoomPage.vue') },       // 同詞相遇 房間
  { path: '/split-bill',            name: 'split-bill',           component: () => import('../apps/split-bill/pages/SplitBillLobbyPage.vue') },      // 分帳 入口
  { path: '/split-bill/room',       name: 'split-bill-room',      component: () => import('../apps/split-bill/pages/SplitBillRoomPage.vue') },       // 分帳 房間
]

const router = createRouter({
  // Hash mode：GitHub Pages 不需要 server 端設定，直接可用
  history: createWebHashHistory(),
  routes,
})

// 部署新版後舊 chunk 檔名已不存在：動態 import 失敗時整頁重新載入到目標路由，拿到新版 index
// （只重載一次；離線等重載也救不了的情況不要無限迴圈）
const CHUNK_RELOAD_KEY = 'chunk-reload-at'
router.onError((err, to) => {
  if (!/Failed to fetch dynamically imported module|Importing a module script failed/i.test(err?.message ?? '')) return
  let last = 0
  try { last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY)) || 0 } catch { /* storage unavailable */ }
  if (Date.now() - last < 10000) return
  try { sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now())) } catch { /* storage unavailable */ }
  window.location.hash = to.fullPath
  window.location.reload()
})

export default router
