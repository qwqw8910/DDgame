// 深淺色切換（與首頁同一套：<html data-theme="mygame|light">，偏好存 localStorage.theme）
import { ref, onMounted } from 'vue'

export function useTheme() {
  const isDark = ref(true)

  onMounted(() => {
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'
  })

  function toggleTheme() {
    const next = isDark.value ? 'light' : 'mygame'
    document.documentElement.setAttribute('data-theme', next)
    try { localStorage.setItem('theme', next === 'light' ? 'light' : 'dark') } catch { /* 私密模式等情況寫不進去，只影響下次開啟 */ }
    isDark.value = next !== 'light'
  }

  return { isDark, toggleTheme }
}
