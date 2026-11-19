// 甜點最愛：存在這台裝置的 localStorage，合成表會把最愛的塔排在最上面
import { ref } from 'vue'

const KEY = 'gem-td-favs'

function load() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(list) ? list.filter(x => typeof x === 'string') : []
  } catch { return [] }
}

// 模組層級共用：圖鑑與合成表看到同一份
const favs = ref(load())

export function useGemFavs() {
  const isFav = kind => favs.value.includes(kind)
  const toggleFav = (kind) => {
    favs.value = isFav(kind) ? favs.value.filter(k => k !== kind) : [...favs.value, kind]
    try { localStorage.setItem(KEY, JSON.stringify(favs.value)) } catch { /* 無痕模式等情況存不了，只在本次有效 */ }
  }
  // 最愛的塔裡，材料已齊、現在就能合成的有幾種（給「圖鑑」入口顯示小圓點）
  const readyFavCount = (view, catalog) => {
    const ready = view?.me?.recipes ?? []
    return ready.filter(r => isFav(catalog?.recipes.find(c => c.id === r.id)?.result)).length
  }
  return { favs, isFav, toggleFav, readyFavCount }
}
