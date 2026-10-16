// 血染鐘樓 — 終局時間軸回放：從日誌逐筆重建圓桌狀態（誰死亡、角色變更、誰參與了這個事件）
// 只在終局使用（終局視圖包含完整日誌與所有角色）。

// 回放時略過的瑣碎事件（「只看重要事件」開啟時）
const MINOR = new Set(['wake', 'reminder-add', 'reminder-remove', 'hand-for', 'day-phase', 'nomination-cancel', 'winner-deferred'])

export function phaseLabel(e) {
  if (e.phase === 'result' || e.type === 'winner') return '終局'
  if (e.phase === 'night') return `第 ${e.dayNumber + 1} 夜`
  if (e.phase === 'day') return `第 ${e.dayNumber} 天`
  return ''
}

// 回傳 frames：[{ entry, seats, badges: { 座位號: 文字 }, highlight: [座位號] }]
export function buildReplay(log, finalSeats, { importantOnly = true } = {}) {
  const startIdx = log.findIndex(e => e.type === 'start')
  const start = startIdx >= 0 ? log[startIdx] : null
  const seats = (start?.seats ?? finalSeats).map((x, i) => ({
    index: i, playerId: x.playerId, roleId: x.roleId, shownRoleId: x.shownRoleId ?? x.roleId,
    drunkAs: x.roleId === 'drunk' ? x.shownRoleId : null,
    isDead: false, hasLeft: false, ghostVoteUsed: false,
  }))
  const seatOf = id => seats.findIndex(s => s.playerId === id)
  const frames = []

  for (const e of log.slice(Math.max(0, startIdx))) {
    const badges = {}
    const mark = (i, text) => { if (Number.isInteger(i) && i >= 0 && i < seats.length) badges[i] = badges[i] ? `${badges[i]}・${text}` : text }

    switch (e.type) {
      case 'death': seats[e.seat].isDead = true; mark(e.seat, '死亡'); break
      case 'revive': Object.assign(seats[e.seat], { isDead: false, ghostVoteUsed: false }); mark(e.seat, '復活'); break
      case 'execute': if (e.seat !== null) { seats[e.seat].isDead = true; mark(e.seat, '處決') } break
      case 'left': Object.assign(seats[e.seat], { hasLeft: true, isDead: true, ghostVoteUsed: true }); mark(e.seat, '離開'); break
      case 'role-change':
        seats[e.seat].roleId = e.to
        if (e.to !== 'drunk') { seats[e.seat].shownRoleId = e.to; seats[e.seat].drunkAs = null }
        mark(e.seat, '換角色')
        break
      case 'dawn': e.deaths.forEach(i => mark(i, '昨晚死亡')); break
      case 'wake': mark(e.seat, '喚醒'); break
      case 'prompt-reply':
      case 'act-for': mark(e.seat, '行動'); e.targets.forEach(t => mark(t, '目標')); break
      case 'info':
        if (e.target) (e.recipients ?? []).forEach(id => mark(seatOf(id), '邪惡互認'))
        else mark(e.seat, e.isTrue === false ? '得知（假）' : '得知資訊')
        break
      case 'reminder-add':
      case 'reminder-remove': mark(e.seat, '提醒標記'); break
      case 'nominate': mark(e.nominator, '提名者'); mark(e.nominee, '被提名'); break
      case 'vote':
        mark(e.nominee, `${e.votes} 票`)
        for (const v of e.voters) { if (seats[v].isDead) seats[v].ghostVoteUsed = true; if (v !== e.nominee) mark(v, '舉手') }
        break
      case 'hand-for': mark(e.seat, e.up ? '代舉手' : '代放下'); break
      case 'whisper': e.participants.forEach(id => mark(seatOf(id), '私聊')); break
    }
    if (importantOnly && MINOR.has(e.type)) continue
    frames.push({ entry: e, seats: seats.map(s => ({ ...s })), badges, highlight: Object.keys(badges).map(Number) })
  }
  return frames
}
