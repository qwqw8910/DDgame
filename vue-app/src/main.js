import { createApp } from 'vue'
import App    from './App.vue'
import router from './router/index.js'
import { registerFileHandler } from './apps/webp-compress/composables/useIncomingImages.js'
import './assets/main.css'

createApp(App).use(router).mount('#app')

// 以「開啟檔案」啟動 PWA（右鍵圖片 → 開啟檔案／拖到桌面捷徑）時，導向 WebP 壓縮頁
registerFileHandler(router)
