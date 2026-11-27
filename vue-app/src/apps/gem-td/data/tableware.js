// 桌面擺設的畫法：碗盤、刀叉、馬克杯、烤模、餅乾。環形接力與一般模式的桌面共用。
// 座標單位由呼叫端的 transform 決定；s 是大小（盤子 = 半徑，其餘依各自比例）。
// cheapShadow：不用 shadowBlur（高斯模糊很貴），改在偏移位置先填兩層半透明深色輪廓模擬柔邊陰影。
//   只畫一次的桌面用真的模糊；會隨鏡頭重畫的環形接力桌面用假陰影。

const DROP_LAYERS = [[4, 1.08, 0.12], [3, 1, 0.2]] // [往下偏移的畫面像素, 放大倍數, 不透明度]

export function drawTableProp(c, dpr, kind, x, y, s, rot = 0, cheapShadow = false) {
    const tableRR = (rx, ry, w, h, r) => { c.beginPath(); c.roundRect(rx, ry, w, h, r) }
    c.save()
    c.translate(x, y)
    // 一個畫面像素等於幾個本地單位（旋轉前量，transform 只有縮放）
    const px = dpr / Math.hypot(c.getTransform().a, c.getTransform().b)
    if (rot) c.rotate(rot)
    // drop(畫輪廓路徑, 是否描邊)：假陰影；真陰影模式下什麼都不做，由 shadowBlur 投影
    let drop = () => {}
    if (cheapShadow) {
        drop = (build, stroke = false) => {
            for (const [off, grow, alpha] of DROP_LAYERS) {
                c.save()
                if (rot) c.rotate(-rot)
                c.translate(0, off * px) // 陰影永遠往畫面下方偏，不跟著旋轉
                if (rot) c.rotate(rot)
                c.scale(grow, grow)
                c.globalAlpha = alpha
                c.fillStyle = '#28140A'
                c.strokeStyle = '#28140A'
                c.beginPath()
                build()
                if (stroke) c.stroke(); else c.fill()
                c.restore()
            }
        }
    } else {
        c.shadowColor = 'rgba(40,20,5,0.4)'
        c.shadowBlur = 8 * dpr
        c.shadowOffsetY = 3 * dpr
    }
    const circle = (cx, cy, r, fill) => { c.fillStyle = fill; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill() }
    const noShadow = () => { c.shadowColor = 'transparent' }
    if (kind === 'plate') {
        drop(() => c.arc(0, 0, s, 0, 7))
        circle(0, 0, s, '#FDFDFB'); noShadow()
        c.strokeStyle = '#C9D3DC'; c.lineWidth = s * 0.05; c.beginPath(); c.arc(0, 0, s * 0.97, 0, 7); c.stroke()
        circle(0, 0, s * 0.7, '#EEF2F6')
        c.strokeStyle = '#7F9BF0'; c.lineWidth = s * 0.06; c.setLineDash([s * 0.14, s * 0.1]); c.beginPath(); c.arc(0, 0, s * 0.84, 0, 7); c.stroke(); c.setLineDash([])
    } else if (kind === 'bowl') {
        drop(() => c.arc(0, 0, s, 0, 7))
        circle(0, 0, s, '#E9EEF2'); noShadow()
        circle(0, 0, s * 0.82, '#CBD3DA'); circle(s * 0.04, s * 0.04, s * 0.6, '#FFF3DC')
        c.strokeStyle = '#9AA4AD'; c.lineWidth = s * 0.02; c.beginPath(); c.arc(0, 0, s, 0, 7); c.stroke()
    } else if (kind === 'jar') {
        drop(() => c.roundRect(-s, -s, s * 2, s * 2, s * 0.2))
        c.fillStyle = 'rgba(210,235,245,0.92)'; tableRR(-s, -s, s * 2, s * 2, s * 0.2); c.fill(); noShadow()
        c.fillStyle = '#FFF'; tableRR(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6, s * 0.15); c.fill()
        circle(0, 0, s * 0.5, '#C8553D')
    } else if (kind === 'mug') {
        c.lineWidth = s * 0.3
        drop(() => c.arc(s * 1.05, 0, s * 0.5, -1.3, 1.3), true)
        drop(() => c.arc(0, 0, s, 0, 7))
        c.strokeStyle = '#7FB6D9'; c.beginPath(); c.arc(s * 1.05, 0, s * 0.5, -1.3, 1.3); c.stroke()
        circle(0, 0, s, '#7FB6D9'); noShadow()
        circle(0, 0, s * 0.82, '#E9F4FB'); circle(0, 0, s * 0.66, '#6B4330')
        c.fillStyle = 'rgba(255,243,220,0.5)'; c.beginPath(); c.ellipse(-s * 0.2, -s * 0.2, s * 0.25, s * 0.12, -0.5, 0, 7); c.fill()
    } else if (kind === 'fork') {
        drop(() => c.roundRect(-0.2 * s, -0.2 * s, 0.4 * s, 2.9 * s, 0.2 * s))
        c.fillStyle = '#CFD5DA'; tableRR(-0.2 * s, -0.2 * s, 0.4 * s, 2.9 * s, 0.2 * s); c.fill(); noShadow()
        tableRR(-0.55 * s, -1.3 * s, 1.1 * s, 1.3 * s, 0.3 * s); c.fill()
        for (const t of [-0.45, -0.15, 0.15, 0.45]) c.fillRect((t - 0.07) * s, -2.8 * s, 0.14 * s, 1.8 * s)
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.05 * s, 0.1 * s, 0.1 * s, 2.3 * s)
    } else if (kind === 'knife') {
        drop(() => c.roundRect(-0.28 * s, -2.8 * s, 0.56 * s, 3.3 * s, 0.28 * s))
        c.fillStyle = '#D5DADE'; tableRR(-0.28 * s, -2.8 * s, 0.56 * s, 3.3 * s, 0.28 * s); c.fill(); noShadow()
        c.fillStyle = '#6A4A30'; tableRR(-0.24 * s, 0.4 * s, 0.48 * s, 2.4 * s, 0.22 * s); c.fill()
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.06 * s, -2.4 * s, 0.1 * s, 2.6 * s)
    } else if (kind === 'spoon') {
        drop(() => c.ellipse(0, -1.8 * s, 0.65 * s, 0.95 * s, 0, 0, 7))
        c.fillStyle = '#CFD5DA'; c.beginPath(); c.ellipse(0, -1.8 * s, 0.65 * s, 0.95 * s, 0, 0, 7); c.fill(); noShadow()
        tableRR(-0.17 * s, -1 * s, 0.34 * s, 3.6 * s, 0.17 * s); c.fill()
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(-0.15 * s, -2 * s, 0.2 * s, 0.5 * s, 0, 0, 7); c.fill()
    } else if (kind === 'tin') {
        drop(() => c.roundRect(-3.3 * s, -2.3 * s, 6.6 * s, 4.6 * s, 0.4 * s))
        c.fillStyle = '#AAB1B8'; tableRR(-3.3 * s, -2.3 * s, 6.6 * s, 4.6 * s, 0.4 * s); c.fill(); noShadow()
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                const cx = (i - 1) * 2.1 * s
                const cy = (j - 0.5) * 2.1 * s
                circle(cx, cy, 0.9 * s, '#8D949B'); circle(cx, cy, 0.66 * s, (i + j) % 2 ? '#F3D9A6' : '#F5B8C8')
            }
        }
    } else if (kind === 'pin') {
        drop(() => c.roundRect(-6 * s, -0.7 * s, 12 * s, 1.4 * s, 0.7 * s))
        c.fillStyle = '#D9A566'; tableRR(-6 * s, -0.7 * s, 12 * s, 1.4 * s, 0.7 * s); c.fill(); noShadow()
        c.fillStyle = '#B9854A'; tableRR(-8.2 * s, -0.3 * s, 2.2 * s, 0.6 * s, 0.3 * s); c.fill(); tableRR(6 * s, -0.3 * s, 2.2 * s, 0.6 * s, 0.3 * s); c.fill()
    } else if (kind === 'whisk') {
        c.lineWidth = 0.12 * s
        drop(() => {
            for (let i = -3; i <= 3; i++) {
                c.moveTo(i * 0.1 * s + 0.7 * s, 1.6 * s) // 每圈各自一段子路徑，避免圈與圈之間連線
                c.ellipse(i * 0.1 * s, 1.6 * s, 0.7 * s, 1.6 * s, 0, 0, 7)
            }
        }, true)
        c.strokeStyle = '#9AA4AD'
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.ellipse(i * 0.1 * s, 1.6 * s, 0.7 * s, 1.6 * s, 0, 0, 7); c.stroke() }
        noShadow(); c.fillStyle = '#6A4A30'; tableRR(-0.3 * s, -2.8 * s, 0.6 * s, 2.4 * s, 0.3 * s); c.fill()
    } else if (kind === 'cookie') {
        drop(() => c.arc(0, 0, s, 0, 7))
        circle(0, 0, s, '#C98B4A'); noShadow()
        c.fillStyle = '#4A2C1A'
        for (const [a, b] of [[0.3, -0.2], [-0.4, 0.3], [0.1, 0.5], [-0.2, -0.5]]) { c.beginPath(); c.arc(a * s, b * s, 0.16 * s, 0, 7); c.fill() }
    }
    c.restore()
}
