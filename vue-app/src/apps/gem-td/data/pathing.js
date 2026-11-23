// 路線預覽用的尋路（四方向 BFS）。邏輯與 server/gem-td/pathing.js 相同；
// 前端只拿來預覽「放這格會不會封路、路線多幾格」，實際是否合法仍由伺服器判斷。
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]

function legLength(width, height, isBlocked, from, to) {
    const dist = new Int32Array(width * height).fill(-1)
    const queue = new Int32Array(width * height)
    let head = 0
    let tail = 0
    const start = from.y * width + from.x
    const goal = to.y * width + to.x
    dist[start] = 0
    queue[tail++] = start
    while (head < tail) {
        const idx = queue[head++]
        if (idx === goal) return dist[idx]
        const x = idx % width
        const y = (idx - x) / width
        for (const [dx, dy] of DIRS) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
            const n = ny * width + nx
            if (dist[n] !== -1 || isBlocked(nx, ny)) continue
            dist[n] = dist[idx] + 1
            queue[tail++] = n
        }
    }
    return -1
}

// 起點 → 各路徑點 → 終點的總步數；走不通回傳 -1
export function fullPathLength(board, isBlocked) {
    const stops = [board.start, ...board.checkpoints, board.end]
    let total = 0
    for (let i = 0; i + 1 < stops.length; i++) {
        const n = legLength(board.width, board.height, isBlocked, stops[i], stops[i + 1])
        if (n < 0) return -1
        total += n
    }
    return total
}
