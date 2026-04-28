import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages repo: https://github.com/qwqw8910/DDgame
export default defineConfig({
  plugins: [vue()],
  base: '/DDgame/',
})
