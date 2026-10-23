// 玩家頭像牌與符號牌的配色

// 12 種色相明顯不同的顏色，順序刻意讓相鄰座位色差最大
export const AVATAR_COLORS = [
    '#EF4444', '#06B6D4', '#EAB308', '#8B5CF6', '#10B981', '#EC4899',
    '#3B82F6', '#F97316', '#84CC16', '#D946EF', '#92400E', '#6366F1',
]

// 符號 → 顏色對應
export const SYMBOL_COLORS = {
    '●': '#06B6D4', '▲': '#F59E0B', '■': '#A855F7', '◆': '#EC4899',
    '★': '#22C55E', '✖': '#EF4444', '✚': '#F97316', '⬢': '#6366F1',
    '♥': '#E11D48', '♠': '#475569', '☀': '#EAB308', '☾': '#0EA5E9',
    '✿': '#D946EF', '⬟': '#84CC16', '✦': '#14B8A6', '▼': '#B45309',
}

// 依座位順序取色，同房間內不會撞色；找不到座位時退回雜湊
export function playerColor(players, id) {
    const idx = players.findIndex(p => p.id === id)
    if (idx >= 0) return AVATAR_COLORS[idx % AVATAR_COLORS.length]
    let h = 0
    for (const ch of String(id ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function avatarChar(name) {
    return ([...(name ?? '').trim()][0] ?? '?').toUpperCase()
}
