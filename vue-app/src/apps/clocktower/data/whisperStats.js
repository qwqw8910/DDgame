// 血染鐘樓 — 私聊統計（誰跟誰聊過幾次、累計多久）
// 資料來源：view.whisperLog[*].memberLog（伺服器公開成員與加入 / 離開時間，不含內容）。
// 兩人「加入～離開」時間有重疊才算一次私聊，重疊長度就是時長。

// day：null = 全部；數字 = 只算第 N 天。now：還沒離開的人以此為結束時間
export function whisperPairs(whisperLog, { day = null, now = Date.now() } = {}) {
  const pairs = {}
  for (const g of whisperLog ?? []) {
    if (day !== null && g.dayNumber !== day) continue
    const log = g.memberLog ?? []
    for (let i = 0; i < log.length; i++) {
      for (let j = i + 1; j < log.length; j++) {
        const x = log[i]
        const y = log[j]
        if (x.playerId === y.playerId) continue
        const start = Math.max(x.joinAt, y.joinAt)
        const end = Math.min(x.leaveAt ?? now, y.leaveAt ?? now)
        if (end <= start) continue
        const [a, b] = [x.playerId, y.playerId].sort()
        const key = `${a}|${b}`
        const p = (pairs[key] ??= { a, b, count: 0, totalMs: 0, sessions: [] })
        p.count += 1
        p.totalMs += end - start
        p.sessions.push({ groupId: g.id, color: g.color, dayNumber: g.dayNumber, start, end, ongoing: x.leaveAt === null || y.leaveAt === null })
      }
    }
  }
  for (const p of Object.values(pairs)) p.sessions.sort((s, t) => s.start - t.start)
  return pairs
}

export const pairKey = (a, b) => [a, b].sort().join('|')

// 有私聊紀錄的天數（篩選用）
export const whisperDays = whisperLog => [...new Set((whisperLog ?? []).map(g => g.dayNumber))].sort((a, b) => a - b)

export function formatDuration(ms) {
  const m = Math.floor(ms / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return m ? `${m}分${s ? `${s}秒` : ''}` : `${s}秒`
}
