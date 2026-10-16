// 血染鐘樓 — 說書人輔助：系統算出的「真實答案」（伺服器 computeTruth 產生，放在 grimoire.nightQueue[].truth）
// 這裡只做前端顯示與即時比對；日誌裡的真假以伺服器判定為準（gameLogic.judgeInfo）。

// 答案是否完整到可以「照實送出」
export function truthReady(truth) {
  if (!truth) return false
  switch (truth.type) {
    case 'info-number': return Number.isInteger(truth.number)
    case 'info-yes-no': return typeof truth.yes === 'boolean'
    case 'info-players-role': return Array.isArray(truth.players)
    case 'info-role': return !!truth.showRole
    default: return false
  }
}

// 真實答案 → ct:send-info 的 info 欄位
export function truthToInfo(truth, forRole) {
  const info = { type: truth.type, forRole }
  if (truth.type === 'info-number') info.number = truth.number
  if (truth.type === 'info-yes-no') info.yes = truth.yes
  if (truth.type === 'info-players-role') { info.players = [...truth.players]; info.showRole = truth.showRole }
  if (truth.type === 'info-role') { info.showRole = truth.showRole; if (Number.isInteger(truth.player)) info.player = truth.player }
  return info
}

// 一句話描述答案。ctx = { seatName(i), roleName(id) }
export function describeTruth(truth, ctx) {
  if (!truth) return ''
  switch (truth.type) {
    case 'info-number': return Number.isInteger(truth.number) ? `${truth.number}` : '—'
    case 'info-yes-no': return truth.yes === null ? '（等待選擇）' : truth.yes ? '是' : '否'
    case 'info-players-role':
      return truth.showRole ? `${truth.players.map(ctx.seatName).join('、')} 之中有一位是 ${ctx.roleName(truth.showRole)}` : '0（場上沒有）'
    case 'info-role':
      if (!truth.showRole) return '（無）'
      return `${Number.isInteger(truth.player) ? `${ctx.seatName(truth.player)} 是 ` : ''}${ctx.roleName(truth.showRole)}`
    default: return ''
  }
}

// 說書人正在編輯的資訊是否與魔典相符：true / false / null（無法判斷）
// draft = { type, number, yes, players, showRole }；seats = 說書人視圖的座位（含 roleId）；teamOf(roleId)
export function judgeDraft(truth, draft, { seat, seats, teamOf }) {
  if (!truth || truth.type !== draft.type) return null
  switch (draft.type) {
    case 'info-number': return Number.isInteger(truth.number) ? draft.number === truth.number : null
    case 'info-yes-no': return typeof truth.yes === 'boolean' && typeof draft.yes === 'boolean' ? draft.yes === truth.yes : null
    case 'info-players-role':
      if (!draft.showRole) return truth.showRole === null
      if (teamOf(draft.showRole) !== truth.team) return false
      return draft.players.some(p => p !== seat && seats[p]?.roleId === draft.showRole)
    case 'info-role':
      if (!draft.showRole) return null
      if (draft.players.length) return seats[draft.players[0]]?.roleId === draft.showRole
      return truth.showRole ? draft.showRole === truth.showRole : null
    default: return null
  }
}
