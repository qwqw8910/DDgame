// 甜點守衛戰 — 外觀資料。名稱、數值、配方由伺服器的 gt:catalog 下發，這裡只放畫面用的東西。
export const APP_ID = 'gem-td'
export const MIN_PLAYERS = 1
export const MAX_PLAYERS = 6

export const WAVE_CHOICES = [
  { value: 15, label: '15 波（短局）' },
  { value: 30, label: '30 波（標準）' },
  { value: 50, label: '50 波（硬核）' },
  { value: 0, label: '無盡（打到全員出局）' },
]
export const BUILD_CHOICES = [
  { value: 45, label: '45 秒' },
  { value: 60, label: '60 秒' },
  { value: 90, label: '90 秒' },
  { value: 0, label: '不限時' },
]

// 等待大廳的快速設定：三個旋鈕（波數、難度、建造時間）一次設好；預設值（30 波、簡單、60 秒）是「標準」
export const PRESETS = [
  { id: 'casual', label: '休閒', hint: '15 波・簡單・90 秒', options: { waves: 15, difficulty: 'easy', buildSeconds: 90 } },
  { id: 'standard', label: '標準', hint: '30 波・簡單・60 秒', options: { waves: 30, difficulty: 'easy', buildSeconds: 60 } },
  { id: 'challenge', label: '挑戰', hint: '50 波・普通・45 秒', options: { waves: 50, difficulty: 'normal', buildSeconds: 45 } },
]

export const DIFFICULTY_CHOICES = [
  { value: 'easy', label: '簡單（適合新手）' },
  { value: 'normal', label: '普通（怪物較硬）' },
  { value: 'hard', label: '困難（怪物非常硬，適合迷宮高手）' },
]

// 遊戲模式：環形接力的區域數不等於真人數（單一真人時其餘區域由電腦控制）
export const MODE_CHOICES = [
  { value: 'single', label: '一般（每人一張地圖）' },
  { value: 'relay', label: '環形接力（多區域排成一圈，蟲群主防後傳給下一區）' },
  { value: 'coop', label: '合作迷宮（2～3 人共用一張大地圖，一起蓋同一條迷宮）' },
]
// 合作迷宮的人數限制（伺服器的 catalog.coop 為準，這裡是沒收到型錄時的備用）
export const COOP_LIMITS = { minPlayers: 2, maxPlayers: 3 }
export const ZONE_CHOICES = [1, 2, 3, 4, 5, 6].map(n => ({ value: n, label: n === 1 ? '1 區（等同單人）' : `${n} 區` }))
// 環形接力每區的代表色（伺服器的 catalog.relay.colors 為準，這裡是沒收到型錄時的備用）
export const ZONE_COLORS = ['#D6305A', '#2F7FD1', '#2E9E5B', '#D9A21F', '#7C4DCC', '#E8741E']

export const SPEEDS = [1, 2, 4]
export const nextSpeed = cur => SPEEDS[(SPEEDS.indexOf(cur) + 1) % SPEEDS.length]

export const LIVES_CHOICES = [
  { value: 'team', label: '共用血量（全隊一條命）' },
  { value: 'solo', label: '獨立血量（各自比存活）' },
]

// 攻擊目標的說明：全站共用（長條圖、圖鑑、提示、選中的塔都用同一套字）
export const HITS = { all: '地面與空中', ground: '只打地面', air: '只打空中' }
export const HITS_SHORT = { all: '地＋空', ground: '地面', air: '空中' }

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

  godsweet: { color: '#FF5FA8' },
}

export const isSpecial = kind => kind in GEM_LOOK && !GEM_ORDER.includes(kind)

const assetUrl = path => `${import.meta.env.BASE_URL}gem-td/${path}`
export const towerImage = kind => assetUrl(`towers/${kind}.webp`)
export const monsterImage = type => assetUrl(`monsters/${type}.webp`)
export const NEST_IMAGE = assetUrl('map/nest.webp')
export const CHECKPOINT_IMAGE = assetUrl('map/checkpoint.webp')
export const RESULT_WIN_IMAGE = assetUrl('map/result-win.webp')
export const RESULT_LOSE_IMAGE = assetUrl('map/result-lose.webp')
export const CAKE_IMAGE = assetUrl('map/cake.webp')
export const HERO_IMAGE = assetUrl('hero.webp')
// 建造者：5 款小烘焙師（概念稿 docs/assets/gem-td-art/builder-concept.jpg 切出，各拿不同工具）。
// 依玩家順序分配（第 i 位用第 i % 5 款），帽帶與圍裙的「主色」（hue ± tol、亮度 ≥ vMin）由程式換成該玩家色，
// refS／refV 是這款主色的平均飽和度與亮度（換色時依目標色按比例縮放，保留明暗）。所以即使兩位玩家拿到同一款，也分得出來。順序刻意對應 PLAYER_MARKS 的紅、藍、綠、金，前三位幾乎不用換色。
export const BUILDER_SKINS = [
    { id: 'spoon', image: assetUrl('builder/chef-spoon.webp'), hue: 352, tol: 28, vMin: 0.45, refS: 0.72, refV: 0.85 }, // 大湯匙，紅
    { id: 'bag', image: assetUrl('builder/chef-bag.webp'), hue: 203, tol: 25, vMin: 0.45, refS: 0.72, refV: 0.81 }, // 擠花袋，藍
    { id: 'pin', image: assetUrl('builder/chef-pin.webp'), hue: 115, tol: 25, vMin: 0.4, refS: 0.56, refV: 0.7 }, // 擀麵棍，綠
    { id: 'whisk', image: assetUrl('builder/chef-whisk.webp'), hue: 46, tol: 12, vMin: 0.6, refS: 0.73, refV: 0.95 }, // 打蛋器，黃
    { id: 'spatula', image: assetUrl('builder/chef-spatula.webp'), hue: 18, tol: 12, vMin: 0.7, refS: 0.78, refV: 0.94 }, // 鍋鏟，橘（亮度門檻避開深褐色的握把）
]

// 等級越高顆粒越大
export const gemScale = level => 0.56 + Math.min(level, 7) * 0.065

export const MONSTER_LOOK = {
  normal: { color: '#8A4B2A', size: 0.42 },
  fast: { color: '#C9A520', size: 0.36 },
  swarm: { color: '#7D8596', size: 0.3 },
  armored: { color: '#2F3F6B', size: 0.46 },
  air: { color: '#6A4FB5', size: 0.42 },
  boss: { color: '#C4202E', size: 0.85 },
  titan: { color: '#7A2E8C', size: 1.25 },
}

export const PLAYER_MARKS = ['#D6305A', '#2F7FD1', '#2E9E5B', '#B8860B', '#7C4DCC', '#D9731F']

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

// 每種怪的打法提示：怪物圖鑑與波次預告共用；數值本身來自伺服器，不在這裡重複
export const MONSTER_TIPS = {
  normal: '最常見，沒有特別能力，拿來練迷宮。',
  fast: '血少但跑得快，緩速塔與長迷宮最有效。',
  swarm: '一次出 2 隻、血很少，濺射或多目標的塔一次清掉。',
  armored: '護甲高，攻擊太低會被大幅減傷，用高傷害或破甲。',
  air: '飛行，無視迷宮直線飛向終點，只有能打空中的塔打得到。',
  boss: '血量很厚，漏掉會一次扣很多血；只吃一半緩速。',
  titan: '傷害測試專用，走到終點不扣血，只比誰打得多。',
}

// 這種甜點打不打得到空中（方糖只打地面）
export const canHitAir = (kind, catalog) => {
  const st = catalog.specials[kind]?.stats ?? catalog.gems[kind]?.levels[0]
  return !!st && st.hits !== 'ground'
}

// 環形接力每區的短標籤：玩家取暱稱前兩個字，電腦區是「電1」「電2」；兩區撞名時改成「首字＋區號」
export function zoneLabels(view) {
    const zones = view?.relay?.zones ?? []
    const raw = zones.map((z, i) => {
        const name = view.names?.[z.id]
        return name ? Array.from(name).slice(0, 2).join('') : `電${i + 1}`
    })
    return raw.map((label, i) => (raw.indexOf(label) === raw.lastIndexOf(label) ? label : `${Array.from(label)[0]}${i + 1}`))
}
