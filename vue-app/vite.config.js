import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages repo: https://github.com/qwqw8910/DDgame
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new version waits instead of reloading a running game; PwaPrompt.vue applies it silently on load.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '甜甜的小秘密',
        short_name: '甜甜小秘密',
        description: '多人互動推理小遊戲與派對工具',
        lang: 'zh-TW',
        start_url: '/DDgame/',
        scope: '/DDgame/',
        display: 'standalone',
        background_color: '#0a0a1a',
        theme_color: '#0a0a1a',
        // 讓 PWA 出現在圖片的「開啟檔案」清單，並可把圖片拖到桌面捷徑上（Chromium only）。
        // 檔案由 registerFileHandler（main.js）接手並導向 /webp-compress；action 必須在 scope 內。
        file_handlers: [
          {
            action: '/DDgame/',
            name: 'WebP 圖片壓縮',
            accept: {
              'image/png': ['.png'],
              'image/jpeg': ['.jpg', '.jpeg'],
              'image/webp': ['.webp'],
              'image/avif': ['.avif'],
              'image/bmp': ['.bmp'],
            },
          },
        ],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Large game assets (audio/bg/cards/...) are cached at runtime instead of precached.
        // wasm = WebP 壓縮器（@jsquash/webp），預先快取才能離線使用圖片壓縮。
        globPatterns: ['**/*.{js,css,html,svg,woff2,wasm}', '*.png'],
        globIgnores: ['mountain-lodge/**'],
        navigateFallbackDenylist: [/^\/socket\.io\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: { cacheName: 'pages', networkTimeoutSeconds: 3 },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Same-origin lodge assets only; Socket.io / Supabase / API calls are never cached.
            urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.includes('/mountain-lodge/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'mountain-lodge-assets',
              expiration: { maxEntries: 150, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  base: '/DDgame/',
  // WebP 壓縮器是 WASM + 動態 import，Worker 必須用 ES 格式（預設 iife 不支援 code splitting）
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@jsquash/webp'] },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@/apps': fileURLToPath(new URL('./src/apps', import.meta.url)),
      '@/shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
})
