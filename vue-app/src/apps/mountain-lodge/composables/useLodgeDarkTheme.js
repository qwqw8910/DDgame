import { onMounted, onUnmounted } from 'vue'

// 山中別館固定深色：進頁面時強制 dark 並掛 data-app="lodge"（觸發別館配色覆蓋），離開時還原使用者原本的全站主題（不動 localStorage）
export function useLodgeDarkTheme() {
  let previous = null
  onMounted(() => {
    const html = document.documentElement
    previous = html.getAttribute('data-theme')
    html.setAttribute('data-theme', 'mygame')
    html.setAttribute('data-app', 'lodge')
  })
  onUnmounted(() => {
    document.documentElement.removeAttribute('data-app')
    if (previous) document.documentElement.setAttribute('data-theme', previous)
  })
}
