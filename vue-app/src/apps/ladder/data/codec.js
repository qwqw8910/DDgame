// 抽籤結果的網址編碼：JSON → UTF-8 → URL-safe Base64（僅編碼，非加密）
export function encodePayload(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodePayload(str) {
  try {
    const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(decodeURIComponent(escape(atob(b64))))
  } catch {
    return null
  }
}
