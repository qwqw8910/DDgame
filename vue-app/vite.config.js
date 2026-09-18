import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages repo: https://github.com/qwqw8910/DDgame
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  base: '/DDgame/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@/apps': fileURLToPath(new URL('./src/apps', import.meta.url)),
      '@/shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
    },
  },
})
