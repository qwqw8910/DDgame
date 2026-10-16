// 血染鐘樓 — 純文字標籤與日誌敘述（不含任何圖示；圖示一律在 assets.js）

export const TEAM_NAMES = {
  townsfolk: '鎮民', outsider: '外來者', minion: '爪牙', demon: '惡魔', good: '善良陣營', evil: '邪惡陣營',
}

export const PHASE_LABELS = {
  lobby: '大廳', setup: '開局設定', night: '夜晚', day: '白天', result: '終局', paused: '暫停中',
}

// 把一筆日誌轉成一句話。ctx = { seatName(i), name(playerId), roleName(id) }
export function describeLog(e, ctx) {
  const s = i => (i === null || i === undefined ? '（無）' : ctx.seatName(i))
  const r = id => (id ? ctx.roleName(id) : '（無）')
  switch (e.type) {
    case 'start': return `開局：${e.seats.map((x, i) => `${i + 1}號 ${ctx.name(x.playerId)} = ${r(x.roleId)}${x.roleId !== x.shownRoleId ? `（以為是 ${r(x.shownRoleId)}）` : ''}`).join('、')}；惡魔偽裝：${e.bluffs.map(r).join('、')}`
    case 'setup-random': return `系統隨機分配角色：${e.roles.map((id, i) => `${i + 1}號 ${r(id)}`).join('、')}`
    case 'setup-set': return `說書人把 ${s(e.seat)} 的角色從 ${r(e.from)} 改成 ${r(e.to)}`
    case 'setup-swap': return `說書人互換了 ${s(e.a)} 與 ${s(e.b)} 的角色`
    case 'setup-drunk': return `酒鬼以為自己是 ${r(e.roleId)}`
    case 'setup-bluffs': return `惡魔偽裝改為 ${e.bluffs.map(r).join('、')}`
    case 'setup-forced': return `說書人略過配置檢查強制開始：${e.errors.join('；')}`
    case 'night': return `第 ${e.dayNumber + 1} 夜開始`
    case 'dawn': return e.deaths.length ? `天亮：昨晚死亡 ${e.deaths.map(s).join('、')}` : '天亮：平安夜'
    case 'day-phase': return { free: '進入自由時間', nomination: '集合提名', dawn: '天亮' }[e.to] ?? e.to
    case 'wake': return `喚醒 ${s(e.seat)}（${r(e.roleId)}），選 ${e.count} 人`
    case 'prompt-reply': return `${s(e.seat)}（${r(e.roleId)}）選擇了 ${e.targets.map(s).join('、')}${e.reminders?.length ? '（系統自動放提醒標記）' : ''}`
    case 'act-for': return `說書人代 ${s(e.seat)}（${r(e.roleId)}）選擇了 ${e.targets.map(s).join('、')}`
    case 'info': return e.target ? `首夜邪惡互認（${e.target === 'minioninfo' ? '爪牙' : '惡魔'}）已送出` : `給 ${s(e.seat)} 資訊：${describeMessage(e.message, ctx)}`
    case 'reminder-add': return `說書人在 ${s(e.seat)} 放了提醒標記「${e.reminderId}」`
    case 'reminder-remove': return `說書人移除 ${s(e.seat)} 的${e.auto ? '自動' : ''}提醒標記「${e.reminderId}」`
    case 'death': return `${s(e.seat)} 死亡`
    case 'revive': return `${s(e.seat)} 復活`
    case 'role-change': return `${s(e.seat)} 的角色從 ${r(e.from)} 變成 ${r(e.to)}`
    case 'nominate': return `${s(e.nominator)} 提名 ${s(e.nominee)}`
    case 'nomination-cancel': return `說書人取消了 ${s(e.nominator)} 對 ${s(e.nominee)} 的提名`
    case 'vote': return `投票：${s(e.nominee)} 得 ${e.votes} 票（門檻 ${e.threshold}）${e.voters.length ? `，舉手：${e.voters.map(s).join('、')}` : ''}`
    case 'hand-for': return `說書人代 ${s(e.seat)} ${e.up ? '舉手' : '放下'}`
    case 'execute': return e.seat === null ? '今天沒有人被處決' : `${s(e.seat)} 被處決（${e.votes} 票）`
    case 'whisper': return `私聊 ${formatRange(e.startAt, e.endAt)}：${e.participants.map(ctx.name).join(' ↔ ')}`
    case 'left': return `${s(e.seat)} 離開了遊戲`
    case 'storyteller-transfer': return `說書人交接：${ctx.name(e.from)} → ${ctx.name(e.to)}`
    case 'winner-deferred': return `說書人暫緩系統的勝負判定（${TEAM_NAMES[e.team]}）`
    case 'winner': return `${TEAM_NAMES[e.team]}獲勝：${e.reason}`
    default: return e.type
  }
}

// 送出資訊的真假標記（伺服器依魔典判定）：'' = 相符或無法判斷
export function infoVerdict(e) {
  if (e.type !== 'info' || e.target || e.isTrue !== false) return ''
  return e.impaired ? '假資訊（對象中毒 / 醉酒）' : '假資訊（與魔典不符）'
}

export function describeMessage(m, ctx) {
  if (!m) return ''
  const s = i => ctx.seatName(i)
  const r = id => ctx.roleName(id)
  const extra = m.text && m.type !== 'custom' ? `（${m.text}）` : ''
  switch (m.type) {
    case 'info-number': return `數字 ${m.number}${extra}`
    case 'info-players-role': return `${(m.players ?? []).map(s).join('、') || '（無人）'} 之中有一位是 ${m.showRole ? r(m.showRole) : '（無）'}${extra}`
    case 'info-yes-no': return `${m.yes ? '是' : '否'}${extra}`
    case 'info-role': return `${Number.isInteger(m.player) ? `${s(m.player)} 的角色是 ` : ''}${r(m.showRole)}${extra}`
    case 'info-grimoire': return '魔典快照'
    case 'custom': return `${m.text ?? ''}${m.showRole ? `（${r(m.showRole)}）` : ''}`
    case 'evil-info': return [
      m.demons?.length ? `惡魔：${m.demons.map(s).join('、')}` : '',
      m.minions?.length ? `爪牙：${m.minions.map(s).join('、')}` : '',
      m.bluffs?.length ? `偽裝：${m.bluffs.map(r).join('、')}` : '',
    ].filter(Boolean).join('；')
    default: return m.type
  }
}

const hm = ts => {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export const formatRange = (a, b) => `${hm(a)}–${hm(b)}`
