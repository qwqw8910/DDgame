import { ref } from 'vue'
import { isSupportedImage } from '../utils/collect.js'

// PWA 以「開啟檔案」（File Handling API）啟動時，把檔案交給圖片壓縮頁。
// 獨立成小模組：main.js 會在啟動時 import，不能把壓縮用的重型依賴帶進主 bundle。
export const incoming = ref([])

export function registerFileHandler(router) {
  if (typeof window === 'undefined' || !('launchQueue' in window)) return
  window.launchQueue.setConsumer(async ({ files }) => {
    if (!files?.length) return
    const opened = await Promise.all(files.map((handle) => handle.getFile()))
    const images = opened.filter(isSupportedImage).map((file) => ({ file, relPath: file.name }))
    if (!images.length) return
    incoming.value = [...incoming.value, ...images]
    router.push('/webp-compress')
  })
}
