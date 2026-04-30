import { createRouter, createWebHashHistory } from 'vue-router'
import PortalPage          from '../pages/PortalPage.vue'
import IndexPage           from '../pages/IndexPage.vue'
import RoomPage            from '../pages/RoomPage.vue'
import DinnerPickerPage    from '../pages/DinnerPickerPage.vue'
import TopicGeneratorPage  from '../apps/topic-generator/pages/TopicGeneratorPage.vue'

const routes = [
  { path: '/',                name: 'portal',          component: PortalPage         },  // 工具入口首頁
  { path: '/game',            name: 'home',            component: IndexPage          },  // 懂我再說
  { path: '/room',            name: 'room',            component: RoomPage           },  // 遊戲房間
  { path: '/dinner-picker',   name: 'dinner-picker',   component: DinnerPickerPage   },  // 今晚吃什麼
  { path: '/topic-generator', name: 'topic-generator', component: TopicGeneratorPage },  // 話題產生器
]

export default createRouter({
  // Hash mode：GitHub Pages 不需要 server 端設定，直接可用
  history: createWebHashHistory(),
  routes,
})
