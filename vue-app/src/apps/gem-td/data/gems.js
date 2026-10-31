// 甜點守衛戰 — 外觀資料。名稱、數值、配方由伺服器的 gt:catalog 下發，這裡只放畫面用的東西。
export const APP_ID = 'gem-td'
export const MIN_PLAYERS = 1
export const MAX_PLAYERS = 4

export const WAVE_CHOICES = [
  { value: 15, label: '15 波（短局）' },
  { value: 30, label: '30 波（標準）' },
  { value: 50, label: '50 波（硬核）' },
]
export const BUILD_CHOICES = [
  { value: 45, label: '45 秒' },
  { value: 60, label: '60 秒' },
  { value: 90, label: '90 秒' },
  { value: 0, label: '不限時' },
]

export const LIVES_CHOICES = [
  { value: 'team', label: '共用血量（全隊一條命）' },
  { value: 'solo', label: '獨立血量（各自比存活）' },
]

export const GEM_ORDER = ['B', 'D', 'E', 'G', 'O', 'Q', 'R', 'P']

// 塔的主色：射擊線與擺放預覽用；圖片在 public/gem-td/towers/<kind>.webp
export const GEM_LOOK = {
  B: { color: '#3B6FD8' }, D: { color: '#8FA6C4' }, E: { color: '#6FA84A' }, G: { color: '#3CC2B4' },
  O: { color: '#EE8FB6' }, Q: { color: '#E5B400' }, R: { color: '#E23B3B' }, P: { color: '#9B4FD8' },

  silver: { color: '#8C96A3' }, malachite: { color: '#7FA63A' }, bloodstone: { color: '#A81F38' },
  gold: { color: '#C99A1A' }, paraiba: { color: '#12A7B5' }, mintchoc: { color: '#2FB89A' }, rainbow: { color: '#E86FA8' },

  starsilver: { color: '#8C96A3' }, peacock: { color: '#7FA63A' }, crimson: { color: '#C9234A' },
  royalgold: { color: '#C99A1A' }, paraibaheart: { color: '#12A7B5' }, mintking: { color: '#2FB89A' }, prism: { color: '#E86FA8' },

  galaxy: { color: '#5A5FD8' }, opera: { color: '#2E9E5B' }, souffle: { color: '#E8541E' },
  emperor: { color: '#E0A800' }, aurora: { color: '#38C7E0' },
}

export const isSpecial = kind => kind in GEM_LOOK && !GEM_ORDER.includes(kind)

const assetUrl = path => `${import.meta.env.BASE_URL}gem-td/${path}`
export const towerImage = kind => assetUrl(`towers/${kind}.webp`)
export const monsterImage = type => assetUrl(`monsters/${type}.webp`)
export const HERO_IMAGE = assetUrl('hero.webp')

// 等級越高顆粒越大
export const gemScale = level => 0.56 + Math.min(level, 6) * 0.065

export const MONSTER_LOOK = {
  normal: { color: '#8A4B2A', size: 0.42 },
  fast: { color: '#C9A520', size: 0.36 },
  swarm: { color: '#7D8596', size: 0.3 },
  armored: { color: '#2F3F6B', size: 0.46 },
  air: { color: '#6A4FB5', size: 0.42 },
  boss: { color: '#C4202E', size: 0.85 },
}

export const PLAYER_MARKS = ['#D6305A', '#2F7FD1', '#2E9E5B', '#B8860B']

// 配方材料的顯示文字，例如「葡萄棒棒糖 Lv5+」「銀糖珠」
export function ingredientLabel(need, catalog) {
  const entry = catalog.gems[need.kind] ?? catalog.specials[need.kind]
  return need.minLevel > 1 ? `${entry.name} Lv${need.minLevel}+` : entry.name
}

// 配方每項材料的持有狀況，依 recipe.ingredients 的順序回傳。挑選順序同伺服器 matchRecipe，嚴格的材料先挑。
// ready：現在能用；placing：本回合的甜點，全部放完才能用；missing：缺少
export function recipeProgress(recipe, me) {
  const placing = me.pending.length > 0
  const pool = [
    ...me.towers.map(t => ({ ...t, status: t.fresh && placing ? 'placing' : 'ready' })),
    ...me.pending.map(g => ({ ...g, status: 'placing' })),
  ]
  const score = t => (t.status === 'ready' ? 0 : 100) + t.level
  pool.sort((a, b) => score(a) - score(b))

  const strictFirst = recipe.ingredients
    .map((need, index) => ({ need, index }))
    .sort((a, b) => (b.need.minLevel ?? 0) - (a.need.minLevel ?? 0))
  const statuses = []
  for (const { need, index } of strictFirst) {
    const at = pool.findIndex(t => t.kind === need.kind && t.level >= (need.minLevel ?? 0))
    statuses[index] = at < 0 ? 'missing' : pool.splice(at, 1)[0].status
  }
  return statuses
}

// 本回合可以同級合成的甜點：2 個升 1 級、4 個升 2 級，上限同伺服器 mergeGain
export function mergeOptions(me, maxLevel) {
  const placing = me.pending.length > 0
  const groups = new Map()
  for (const g of [...me.pending, ...me.towers.filter(t => t.fresh)]) {
    const key = `${g.kind}:${g.level}`
    groups.set(key, { kind: g.kind, level: g.level, count: (groups.get(key)?.count ?? 0) + 1 })
  }
  return [...groups.values()].flatMap((g) => {
    const gain = Math.min(g.count >= 4 ? 2 : g.count >= 2 ? 1 : 0, maxLevel - g.level)
    return gain > 0 ? [{ ...g, gain, status: placing ? 'placing' : 'ready' }] : []
  })
}
