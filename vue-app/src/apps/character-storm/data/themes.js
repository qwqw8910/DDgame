import { SERVER_URL } from '@/shared/api/config.js'

// 主題名稱對照表（新增主題時只需在此加名稱，欄位由後端動態抓）
export const THEME_NAMES = {
  0: '原始題庫',
  1: '綜合主題包',
  2: '好友精選包',
  3: '深海底撈',
  4: '百鬼夜行',
}

const fallbackThemes = () =>
  Object.entries(THEME_NAMES).map(([id, name]) => ({ id: Number(id), name }))

/** 取得可用主題清單；後端無法連線時回退為靜態清單 */
export async function fetchThemes() {
  try {
    const res = await fetch(`${SERVER_URL}/api/cs/themes`)
    const { themes } = await res.json()
    return themes.map(id => ({ id, name: THEME_NAMES[id] ?? `主題 ${id}` }))
  } catch {
    return fallbackThemes()
  }
}
