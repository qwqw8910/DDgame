import { createRouter, createWebHashHistory } from 'vue-router'
import PortalPage                from '../apps/portal/pages/PortalPage.vue'
import IndexPage                 from '../apps/know-me/pages/IndexPage.vue'
import RoomPage                  from '../apps/know-me/pages/RoomPage.vue'
import DinnerPickerPage          from '../apps/dinner-picker/pages/DinnerPickerPage.vue'
import DinnerInvitePage          from '../apps/dinner-invite/pages/DinnerInvitePage.vue'
import TopicGeneratorPage        from '../apps/topic-generator/pages/TopicGeneratorPage.vue'
import CharacterStormLobbyPage   from '../apps/character-storm/pages/CharacterStormLobbyPage.vue'
import CharacterStormRoomPage    from '../apps/character-storm/pages/CharacterStormRoomPage.vue'
import GenderScorePage           from '../apps/gender-score/pages/GenderScorePage.vue'
import StoryCanvasPage           from '../apps/story-canvas/pages/StoryCanvasPage.vue'

const routes = [
  // 知道網址才能到，不登記進 tools.js／Portal 首頁；獨立打包避免拖累主要頁面的下載大小
  { path: '/admin', name: 'admin', component: () => import('../apps/know-me/pages/AdminPage.vue') },
  { path: '/',                      name: 'portal',               component: PortalPage              },  // 工具入口首頁
  { path: '/game',                  name: 'home',                 component: IndexPage               },  // 懂我再說
  { path: '/room',                  name: 'room',                 component: RoomPage                },  // 遊戲房間
  { path: '/dinner-picker',         name: 'dinner-picker',        component: DinnerPickerPage        },  // 今晚吃什麼
  { path: '/dinner-invite',         name: 'dinner-invite',        component: DinnerInvitePage        },  // 晚餐邀請選擇器
  { path: '/topic-generator',       name: 'topic-generator',      component: TopicGeneratorPage      },  // 話題產生器
  { path: '/character-storm',       name: 'character-storm',      component: CharacterStormLobbyPage },  // 默契傳聲筒 入口
  { path: '/character-storm/room',  name: 'character-storm-room', component: CharacterStormRoomPage  },  // 默契傳聲筒 房間
  { path: '/gender-score',          name: 'gender-score',         component: GenderScorePage         },  // 十分男女
  { path: '/story-canvas',          name: 'story-canvas',         component: StoryCanvasPage         },  // 故事關係圖
]

export default createRouter({
  // Hash mode：GitHub Pages 不需要 server 端設定，直接可用
  history: createWebHashHistory(),
  routes,
})
