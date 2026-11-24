// 桌面擺設的畫法：碗盤、刀叉、馬克杯、烤模、餅乾。環形接力與一般模式的桌面共用。
// 座標單位由呼叫端的 transform 決定；s 是大小（盤子 = 半徑，其餘依各自比例）。

export function drawTableProp(c, dpr, kind, x, y, s, rot = 0) {
    const tableRR = (rx, ry, w, h, r) => { c.beginPath(); c.roundRect(rx, ry, w, h, r) }
    c.save()
    c.translate(x, y)
    if (rot) c.rotate(rot)
    c.shadowColor = 'rgba(40,20,5,0.4)'
    c.shadowBlur = 8 * dpr
    c.shadowOffsetY = 3 * dpr
    const circle = (cx, cy, r, fill) => { c.fillStyle = fill; c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fill() }
    const noShadow = () => { c.shadowColor = 'transparent' }
    if (kind === 'plate') {
        circle(0, 0, s, '#FDFDFB'); noShadow()
        c.strokeStyle = '#C9D3DC'; c.lineWidth = s * 0.05; c.beginPath(); c.arc(0, 0, s * 0.97, 0, 7); c.stroke()
        circle(0, 0, s * 0.7, '#EEF2F6')
        c.strokeStyle = '#7F9BF0'; c.lineWidth = s * 0.06; c.setLineDash([s * 0.14, s * 0.1]); c.beginPath(); c.arc(0, 0, s * 0.84, 0, 7); c.stroke(); c.setLineDash([])
    } else if (kind === 'bowl') {
        circle(0, 0, s, '#E9EEF2'); noShadow()
        circle(0, 0, s * 0.82, '#CBD3DA'); circle(s * 0.04, s * 0.04, s * 0.6, '#FFF3DC')
        c.strokeStyle = '#9AA4AD'; c.lineWidth = s * 0.02; c.beginPath(); c.arc(0, 0, s, 0, 7); c.stroke()
    } else if (kind === 'jar') {
        c.fillStyle = 'rgba(210,235,245,0.92)'; tableRR(-s, -s, s * 2, s * 2, s * 0.2); c.fill(); noShadow()
        c.fillStyle = '#FFF'; tableRR(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6, s * 0.15); c.fill()
        circle(0, 0, s * 0.5, '#C8553D')
    } else if (kind === 'mug') {
        c.strokeStyle = '#7FB6D9'; c.lineWidth = s * 0.3; c.beginPath(); c.arc(s * 1.05, 0, s * 0.5, -1.3, 1.3); c.stroke()
        circle(0, 0, s, '#7FB6D9'); noShadow()
        circle(0, 0, s * 0.82, '#E9F4FB'); circle(0, 0, s * 0.66, '#6B4330')
        c.fillStyle = 'rgba(255,243,220,0.5)'; c.beginPath(); c.ellipse(-s * 0.2, -s * 0.2, s * 0.25, s * 0.12, -0.5, 0, 7); c.fill()
    } else if (kind === 'fork') {
        c.fillStyle = '#CFD5DA'; tableRR(-0.2 * s, -0.2 * s, 0.4 * s, 2.9 * s, 0.2 * s); c.fill(); noShadow()
        tableRR(-0.55 * s, -1.3 * s, 1.1 * s, 1.3 * s, 0.3 * s); c.fill()
        for (const t of [-0.45, -0.15, 0.15, 0.45]) c.fillRect((t - 0.07) * s, -2.8 * s, 0.14 * s, 1.8 * s)
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.05 * s, 0.1 * s, 0.1 * s, 2.3 * s)
    } else if (kind === 'knife') {
        c.fillStyle = '#D5DADE'; tableRR(-0.28 * s, -2.8 * s, 0.56 * s, 3.3 * s, 0.28 * s); c.fill(); noShadow()
        c.fillStyle = '#6A4A30'; tableRR(-0.24 * s, 0.4 * s, 0.48 * s, 2.4 * s, 0.22 * s); c.fill()
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(-0.06 * s, -2.4 * s, 0.1 * s, 2.6 * s)
    } else if (kind === 'spoon') {
        c.fillStyle = '#CFD5DA'; c.beginPath(); c.ellipse(0, -1.8 * s, 0.65 * s, 0.95 * s, 0, 0, 7); c.fill(); noShadow()
        tableRR(-0.17 * s, -1 * s, 0.34 * s, 3.6 * s, 0.17 * s); c.fill()
        c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(-0.15 * s, -2 * s, 0.2 * s, 0.5 * s, 0, 0, 7); c.fill()
    } else if (kind === 'tin') {
        c.fillStyle = '#AAB1B8'; tableRR(-3.3 * s, -2.3 * s, 6.6 * s, 4.6 * s, 0.4 * s); c.fill(); noShadow()
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 2; j++) {
                const cx = (i - 1) * 2.1 * s
                const cy = (j - 0.5) * 2.1 * s
                circle(cx, cy, 0.9 * s, '#8D949B'); circle(cx, cy, 0.66 * s, (i + j) % 2 ? '#F3D9A6' : '#F5B8C8')
            }
        }
    } else if (kind === 'pin') {
        c.fillStyle = '#D9A566'; tableRR(-6 * s, -0.7 * s, 12 * s, 1.4 * s, 0.7 * s); c.fill(); noShadow()
        c.fillStyle = '#B9854A'; tableRR(-8.2 * s, -0.3 * s, 2.2 * s, 0.6 * s, 0.3 * s); c.fill(); tableRR(6 * s, -0.3 * s, 2.2 * s, 0.6 * s, 0.3 * s); c.fill()
    } else if (kind === 'whisk') {
        c.strokeStyle = '#9AA4AD'; c.lineWidth = 0.12 * s
        for (let i = -3; i <= 3; i++) { c.beginPath(); c.ellipse(i * 0.1 * s, 1.6 * s, 0.7 * s, 1.6 * s, 0, 0, 7); c.stroke() }
        noShadow(); c.fillStyle = '#6A4A30'; tableRR(-0.3 * s, -2.8 * s, 0.6 * s, 2.4 * s, 0.3 * s); c.fill()
    } else if (kind === 'cookie') {
        circle(0, 0, s, '#C98B4A'); noShadow()
        c.fillStyle = '#4A2C1A'
        for (const [a, b] of [[0.3, -0.2], [-0.4, 0.3], [0.1, 0.5], [-0.2, -0.5]]) { c.beginPath(); c.arc(a * s, b * s, 0.16 * s, 0, 7); c.fill() }
    }
    c.restore()
}
