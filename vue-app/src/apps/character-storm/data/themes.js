import { SERVER_URL } from '@/shared/api/config.js'

// themePreference 特殊值（與後端 server/character-storm/index.js 一致）
export const THEME_RANDOM = -1 // 每局隨機挑一個主題
export const THEME_ALL = -2    // 全部主題混成一個大題庫

// 後端無法連線時的備用主題名稱（主題名稱正式來源為後端 character_storm_themes）
const FALLBACK_NAMES = {
  0: '原始題庫',
  1: '綜合主題包',
  2: '好友精選包',
  3: '深海底撈',
  4: '百鬼夜行',
}

const fallbackThemes = () =>
  Object.entries(FALLBACK_NAMES).map(([id, name]) => ({ id: Number(id), name }))

/** 取得可用主題清單；後端無法連線時回退為靜態清單 */
export async function fetchThemes() {
  try {
    const res = await fetch(`${SERVER_URL}/api/cs/themes`)
    const { themes } = await res.json()
    if (!themes?.length) return fallbackThemes()
    return themes.map(t => ({ id: t.id, name: t.name }))
  } catch {
    return fallbackThemes()
  }
}

// ── 題庫管理 API（需管理密碼）──────────────────────────────────
async function adminRequest(password, method, path, body) {
  const res = await fetch(`${SERVER_URL}/api/cs/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': password,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data.error ?? `請求失敗（${res.status}）`)
    err.status = res.status
    throw err
  }
  return data
}

export const bankAdmin = {
  login: (pw) => adminRequest(pw, 'POST', '/login'),
  listThemes: (pw) => adminRequest(pw, 'GET', '/themes').then(d => d.themes),
  createTheme: (pw, name) => adminRequest(pw, 'POST', '/themes', { name }).then(d => d.theme),
  renameTheme: (pw, id, name) => adminRequest(pw, 'PATCH', `/themes/${id}`, { name }).then(d => d.theme),
  deleteTheme: (pw, id) => adminRequest(pw, 'DELETE', `/themes/${id}`),
  listWords: (pw, themeId) => adminRequest(pw, 'GET', `/themes/${themeId}/words`).then(d => d.words),
  addWords: (pw, themeId, words) => adminRequest(pw, 'POST', `/themes/${themeId}/words`, { words }),
  updateWord: (pw, wordId, fields) => adminRequest(pw, 'PATCH', `/words/${wordId}`, fields).then(d => d.word),
  deleteWord: (pw, wordId) => adminRequest(pw, 'DELETE', `/words/${wordId}`),
}
