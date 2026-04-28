import { createRouter, createWebHashHistory } from 'vue-router'
import IndexPage from '../pages/IndexPage.vue'
import RoomPage  from '../pages/RoomPage.vue'

const routes = [
  { path: '/',         name: 'home', component: IndexPage },
  { path: '/room',     name: 'room', component: RoomPage  },
]

export default createRouter({
  // Hash mode：GitHub Pages 不需要 server 端設定，直接可用
  history: createWebHashHistory(),
  routes,
})
