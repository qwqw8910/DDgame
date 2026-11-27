// ================================================================
//  合作迷宮：自己的建造者前端預測
//
//  伺服器每 100ms 才送一次位置，加上網路延遲，點了地圖之後建造者要過一下才動，看起來「黏」。
//  這裡讓自己的建造者在送出指令的同一幀就開始走，走法與伺服器的 builder.js（walk）完全一樣：
//  朝目標走，離目標 stopAt 格以內就停下。全部是純函式，不碰 DOM 與 Vue。
//
//  預測只負責「送出指令到伺服器接手」這一段，伺服器永遠是正確的；出現下列任何一種情況就放棄預測，
//  畫面改回平滑地靠向伺服器位置：
//    · 已經走到目標（之後位置以伺服器為準）
//    · 伺服器那邊開始施工了（job.started）
//    · 指令送出超過 REJECT_MS 伺服器位置仍沒動（指令被拒絕，例如格子被搶）
//    · 預測位置離伺服器太遠（網路卡住或伺服器重設），超過 MAX_LEAD 格
// ================================================================

const REJECT_MS = 900
const MAX_LEAD = 6 // 預測最多比伺服器領先幾格（每秒 4 格、延遲再大也不該超過）
const SERVER_MOVED = 0.05 // 伺服器位置離下指令時差多少格，才算「伺服器動了」

export const createPrediction = () => ({ active: false, x: 0, y: 0, tx: 0, ty: 0, stopAt: 0, job: null, since: 0, serverX: 0, serverY: 0, serverMoved: false })

function begin(pred, from, now, server) {
    pred.active = true
    pred.x = from.x
    pred.y = from.y
    pred.since = now
    pred.serverX = server?.x ?? from.x
    pred.serverY = server?.y ?? from.y
    pred.serverMoved = false
}

/** 右鍵移動：from 是目前畫面上建造者的位置，(x, y) 是目標（格座標，可有小數） */
export function predictMove(pred, from, x, y, now, server) {
    begin(pred, from, now, server)
    pred.tx = x
    pred.ty = y
    pred.stopAt = 0
    pred.job = null
}

/** 指派施工：走到目標格 range 格以內就停（之後由伺服器開始施工） */
export function predictJob(pred, from, cell, range, type, now, server) {
    begin(pred, from, now, server)
    pred.tx = cell.x + 0.5
    pred.ty = cell.y + 0.5
    pred.stopAt = range
    pred.job = { type, x: cell.x, y: cell.y }
}

/** 取消：停在原地，之後位置以伺服器為準 */
export function stopPrediction(pred) {
    pred.active = false
    pred.job = null
}

/** 往前走 dt 秒（與 builder.js 的 walk 相同）；到了就把 active 關掉，job 標記留給畫面直到伺服器接手 */
export function stepPrediction(pred, dt, speed) {
    if (!pred.active) return false
    const dx = pred.tx - pred.x
    const dy = pred.ty - pred.y
    const d = Math.hypot(dx, dy)
    if (d <= pred.stopAt + 1e-9) {
        pred.active = false
        return false
    }
    const move = Math.min(speed * dt, d - pred.stopAt)
    pred.x += (dx / d) * move
    pred.y += (dy / d) * move
    if (d - move <= pred.stopAt + 1e-9) pred.active = false
    return true
}

/**
 * 對照伺服器的最新狀態，必要時放棄預測。server = { x, y, job }（job.started 代表已開始施工）。
 * 回傳 true 表示這次放棄了預測。
 */
export function reconcilePrediction(pred, server, now) {
    if (!pred.active) {
        // 預測的施工目標：伺服器接手（有了工作）後就不用再補畫；指令被拒絕、工作一直沒出現就超時清掉
        if (pred.job && (server?.job || now - pred.since > REJECT_MS * 2)) pred.job = null
        return false
    }
    if (!server) return false
    if (Math.hypot(server.x - pred.serverX, server.y - pred.serverY) > SERVER_MOVED) pred.serverMoved = true
    const giveUp = server.job?.started
        || (now - pred.since > REJECT_MS && !pred.serverMoved)
        || Math.hypot(server.x - pred.x, server.y - pred.y) > MAX_LEAD
    if (giveUp) {
        pred.active = false
        pred.job = null
        return true
    }
    return false
}
