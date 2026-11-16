'use strict';

// ================================================================
//  甜點守衛戰（gem-td）— 數值表
//  所有平衡用數字都集中在這裡；前端的名稱與數值由 catalog() 下發，不重複維護。
// ================================================================

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 6;

const GEMS_PER_ROUND = 5;
const START_LIVES = 100;
const START_GOLD = 0;

const WAVE_CHOICES = [15, 30, 50];
const BUILD_SECOND_CHOICES = [0, 45, 60, 90]; // 0 = 不限時（等全員按準備）
const LIVES_MODES = ['team', 'solo']; // team = 全隊共用血量；solo = 每人各自的血量
// 難度：簡單 = 原本的數值，血量 ×1.2，給還不會蓋塔與迷宮的人；普通、困難給會迷宮的老手。倍率套在怪物血量與護甲上
const DIFFICULTIES = {
  easy: { name: '簡單', hp: 1.2, armor: 1, desc: '怪物血量稍高於基準，適合還不熟悉蓋塔與迷宮的人' },
  normal: { name: '普通', hp: 1.6, armor: 1.3, desc: '怪物明顯更硬，需要像樣的迷宮與合成' },
  hard: { name: '困難', hp: 2.5, armor: 1.7, desc: '怪物非常硬，需要完整的迷宮與合成規劃' },
};
const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
const SPEED_CHOICES = [1, 2, 4];
const DEFAULT_OPTIONS = { waves: 30, buildSeconds: 60, livesMode: 'team', damageTest: true, difficulty: 'easy' };

// 用金幣換血量：建造階段每次換 1 點，最多補到開局血量
// 底價隨波次上漲（後期收入高，固定價會變成無限補血）；同一回合每多買 1 點再貴 50%，下回合恢復
const LIFE_BASE = 10;
const LIFE_PER_WAVE = 2;
const LIFE_STEP = 0.5;
const lifeCost = (wave, bought) => Math.round((LIFE_BASE + wave * LIFE_PER_WAVE) * (1 + bought * LIFE_STEP));

// 每位玩家各一張地圖，大小固定
const BOARD_SIZE = 25;

// 路徑點（相對座標）：起點 → 1~5 → 終點，同原版的 5 個檢查點。第 2、4、5 段都穿過地圖中央，把 3 號點圍進迷宮就能讓怪物反覆進出
const WAYPOINTS = {
  start: [0.08, 0.08],
  checkpoints: [[0.92, 0.08], [0.08, 0.92], [0.5, 0.5], [0.92, 0.5], [0.08, 0.5]],
  end: [0.92, 0.92],
};

// 至尊（Lv7）不會直接抽到，只能由兩顆巨型合成而來；8 種基礎甜點各一顆至尊可合成隱藏塔
const LEVEL_NAMES = ['碎屑', '迷你', '小份', '標準', '精緻', '巨型', '至尊'];
const MAX_LEVEL = LEVEL_NAMES.length;
const LEVEL_DAMAGE = [1, 2.3, 5.5, 13, 30, 72, 170];

// 基礎寶石：hits 省略時對空對地都可攻擊
const GEMS = {
  B: { name: '藍莓果凍', trait: '緩速單體', damage: 7, cooldown: 1.0, range: 5,
    perLevel: l => ({ slow: { pct: 0.25 + 0.06 * l, duration: 2 } }) },
  D: { name: '方糖', trait: '高傷爆擊，只打地面', damage: 14, cooldown: 1.0, range: 5.5, hits: 'ground',
    perLevel: l => ({ crit: { chance: 0.15 + 0.03 * l, mult: 2.5 } }) },
  E: { name: '抹茶馬卡龍', trait: '持續毒傷', damage: 5, cooldown: 1.0, range: 5.5,
    perLevel: (l, dmg) => ({ poison: { dps: dmg * 1.2, duration: 4 } }) },
  G: { name: '薄荷糖', trait: '超快攻速、短射程', damage: 4, cooldown: 0.35, range: 3.5 },
  O: { name: '棉花糖', trait: '提升周圍塔的攻速', damage: 3, cooldown: 1.0, range: 4,
    perLevel: l => ({ aura: { haste: 0.08 + 0.06 * l, radius: 3.5 + 0.25 * l } }) },
  Q: { name: '檸檬軟糖', trait: '一次攻擊多個目標', damage: 5, cooldown: 1.0, range: 5,
    perLevel: l => ({ targets: 2 + Math.floor(l / 2) }) },
  R: { name: '草莓塔', trait: '範圍濺射', damage: 7, cooldown: 1.1, range: 4.5,
    perLevel: l => ({ splash: { radius: 1.1 + 0.15 * l, ratio: 0.6 } }) },
  P: { name: '葡萄棒棒糖', trait: '高傷害，只打空中', damage: 30, cooldown: 1.0, range: 7.5, hits: 'air' },
};

// 特殊塔：tier 2 由 tier 1 升級而來、tier 3 由 tier 2 升級而來，數值各約 3 倍
const SPECIALS = {
  silver: { name: '銀糖珠', tier: 1, trait: '濺射加緩速', damage: 40, cooldown: 0.9, range: 6,
    splash: { radius: 1.6, ratio: 0.7 }, slow: { pct: 0.3, duration: 2 } },
  malachite: { name: '開心果泡芙', tier: 1, trait: '同時射擊 5 個目標', damage: 38, cooldown: 0.5, range: 6, targets: 5 },
  bloodstone: { name: '紅絲絨杯子蛋糕', tier: 1, trait: '範圍灼燒', damage: 70, cooldown: 1.0, range: 5,
    splash: { radius: 2.2, ratio: 0.8 }, poison: { dps: 40, duration: 3 } },
  gold: { name: '金箔松露巧克力', tier: 1, trait: '爆擊，並削弱範圍內敵人護甲', damage: 198, cooldown: 1.0, range: 6,
    crit: { chance: 0.25, mult: 3 }, armorAura: { amount: 6, radius: 5 } },
  paraiba: { name: '汽水冰棒', tier: 1, trait: '範圍破甲加冰凍', damage: 260, cooldown: 1.2, range: 6,
    splash: { radius: 2, ratio: 0.7 }, slow: { pct: 0.4, duration: 2 }, shred: { amount: 8, duration: 3 } },
  mintchoc: { name: '薄荷巧克力餅', tier: 1, trait: '極速連射，克制護盾', damage: 45, cooldown: 0.18, range: 5 },
  rainbow: { name: '彩虹馬卡龍塔', tier: 1, trait: '大幅提升周圍塔的攻速', damage: 30, cooldown: 1.0, range: 5,
    aura: { haste: 0.35, radius: 4.5 } },

  starsilver: { name: '星星銀蛋糕', tier: 2, trait: '大範圍濺射加強緩速', damage: 150, cooldown: 0.8, range: 7,
    splash: { radius: 2.4, ratio: 0.8 }, slow: { pct: 0.45, duration: 2.5 } },
  peacock: { name: '開心果千層', tier: 2, trait: '同時射擊 8 個目標', damage: 120, cooldown: 0.45, range: 7, targets: 8 },
  crimson: { name: '雙層紅絲絨', tier: 2, trait: '灼燒整片區域', damage: 220, cooldown: 1.0, range: 6,
    splash: { radius: 3, ratio: 0.9 }, poison: { dps: 160, duration: 3 } },
  royalgold: { name: '皇家巧克力塔', tier: 2, trait: '必殺爆擊，大幅削甲', damage: 630, cooldown: 0.9, range: 7,
    crit: { chance: 0.35, mult: 3.5 }, armorAura: { amount: 12, radius: 6 } },
  paraibaheart: { name: '汽水聖代', tier: 2, trait: '全面破甲與極寒冰凍', damage: 850, cooldown: 1.1, range: 7,
    splash: { radius: 2.8, ratio: 0.8 }, slow: { pct: 0.55, duration: 2.5 }, shred: { amount: 14, duration: 3 } },
  mintking: { name: '薄荷巧克力聖代', tier: 2, trait: '暴雨連射，克制護盾', damage: 170, cooldown: 0.15, range: 5.5 },
  prism: { name: '彩虹千層酥', tier: 2, trait: '整片區域攻速大增', damage: 120, cooldown: 1.0, range: 6,
    aura: { haste: 0.6, radius: 5.5 } },

  galaxy: { name: '銀河慕斯', tier: 3, trait: '滿場濺射，蟲群寸步難行', damage: 450, cooldown: 0.7, range: 8,
    splash: { radius: 3, ratio: 0.85 }, slow: { pct: 0.6, duration: 3 } },
  opera: { name: '翡翠歌劇院蛋糕', tier: 3, trait: '同時射擊 12 個目標', damage: 360, cooldown: 0.4, range: 8, targets: 12 },
  souffle: { name: '火焰舒芙蕾', tier: 3, trait: '焚燒大片區域', damage: 650, cooldown: 1.0, range: 9,
    splash: { radius: 4.5, ratio: 0.9 }, poison: { dps: 520, duration: 3 } },
  emperor: { name: '帝王金箔蛋糕', tier: 3, trait: '一擊必殺級爆擊，瓦解護甲', damage: 1890, cooldown: 0.8, range: 8,
    crit: { chance: 0.45, mult: 4 }, armorAura: { amount: 18, radius: 7 } },
  aurora: { name: '極光芭菲', tier: 3, trait: '極寒破甲席捲全場', damage: 2600, cooldown: 1.0, range: 8,
    splash: { radius: 3.2, ratio: 0.85 }, slow: { pct: 0.65, duration: 3 }, shred: { amount: 20, duration: 3 } },

  // 隱藏塔：集 8 種基礎甜點的特性於一身，合成表平常不顯示，湊齊材料才會出現
  godsweet: { name: '甜點之神', tier: 4, trait: '集八種甜點之力：十二目標連射、濺射、灼燒、爆擊、極寒破甲，並大幅加速周圍的塔',
    damage: 4500, cooldown: 0.5, range: 10, targets: 12,
    splash: { radius: 3.5, ratio: 0.9 }, slow: { pct: 0.7, duration: 3 }, poison: { dps: 1500, duration: 3 },
    crit: { chance: 0.5, mult: 4 }, shred: { amount: 20, duration: 3 }, armorAura: { amount: 20, radius: 8 },
    aura: { haste: 0.6, radius: 6 } },
};

// 配方：minLevel 是「至少幾級」；同種寶石要兩顆時會分別配對
const RECIPES = [
  { id: 'silver', result: 'silver', ingredients: [{ kind: 'B', minLevel: 2 }, { kind: 'Q', minLevel: 2 }, { kind: 'D', minLevel: 2 }] },
  { id: 'malachite', result: 'malachite', ingredients: [{ kind: 'E', minLevel: 2 }, { kind: 'G', minLevel: 2 }, { kind: 'O', minLevel: 2 }] },
  { id: 'bloodstone', result: 'bloodstone', ingredients: [{ kind: 'P', minLevel: 2 }, { kind: 'G', minLevel: 2 }, { kind: 'R', minLevel: 2 }] },
  { id: 'gold', result: 'gold', ingredients: [{ kind: 'P', minLevel: 5 }, { kind: 'P', minLevel: 3 }, { kind: 'D', minLevel: 3 }] },
  { id: 'paraiba', result: 'paraiba', ingredients: [{ kind: 'Q', minLevel: 5 }, { kind: 'B', minLevel: 3 }, { kind: 'O', minLevel: 3 }] },
  { id: 'mintchoc', result: 'mintchoc', ingredients: [{ kind: 'G', minLevel: 3 }, { kind: 'Q', minLevel: 3 }, { kind: 'E', minLevel: 2 }] },
  { id: 'rainbow', result: 'rainbow', ingredients: [{ kind: 'O', minLevel: 4 }, { kind: 'R', minLevel: 3 }, { kind: 'B', minLevel: 3 }] },

  { id: 'starsilver', result: 'starsilver', ingredients: [{ kind: 'silver' }, { kind: 'D', minLevel: 4 }, { kind: 'B', minLevel: 4 }] },
  { id: 'peacock', result: 'peacock', ingredients: [{ kind: 'malachite' }, { kind: 'E', minLevel: 4 }, { kind: 'G', minLevel: 4 }] },
  { id: 'crimson', result: 'crimson', ingredients: [{ kind: 'bloodstone' }, { kind: 'R', minLevel: 5 }, { kind: 'P', minLevel: 4 }] },
  { id: 'royalgold', result: 'royalgold', ingredients: [{ kind: 'gold' }, { kind: 'D', minLevel: 5 }, { kind: 'P', minLevel: 5 }] },
  { id: 'paraibaheart', result: 'paraibaheart', ingredients: [{ kind: 'paraiba' }, { kind: 'Q', minLevel: 5 }, { kind: 'O', minLevel: 5 }] },
  { id: 'mintking', result: 'mintking', ingredients: [{ kind: 'mintchoc' }, { kind: 'G', minLevel: 5 }, { kind: 'E', minLevel: 4 }] },
  { id: 'prism', result: 'prism', ingredients: [{ kind: 'rainbow' }, { kind: 'O', minLevel: 5 }, { kind: 'R', minLevel: 5 }] },

  { id: 'galaxy', result: 'galaxy', ingredients: [{ kind: 'starsilver' }, { kind: 'D', minLevel: 6 }, { kind: 'B', minLevel: 5 }] },
  { id: 'opera', result: 'opera', ingredients: [{ kind: 'peacock' }, { kind: 'E', minLevel: 6 }, { kind: 'G', minLevel: 5 }] },
  { id: 'souffle', result: 'souffle', ingredients: [{ kind: 'crimson' }, { kind: 'R', minLevel: 6 }, { kind: 'P', minLevel: 5 }] },
  { id: 'emperor', result: 'emperor', ingredients: [{ kind: 'royalgold' }, { kind: 'D', minLevel: 6 }, { kind: 'P', minLevel: 6 }] },
  { id: 'aurora', result: 'aurora', ingredients: [{ kind: 'paraibaheart' }, { kind: 'Q', minLevel: 6 }, { kind: 'O', minLevel: 6 }] },

  // 隱藏配方：8 種基礎甜點各一顆至尊（Lv7）
  { id: 'godsweet', result: 'godsweet', hidden: true,
    ingredients: ['B', 'D', 'E', 'G', 'O', 'Q', 'R', 'P'].map(kind => ({ kind, minLevel: 7 })) },
];

// 寶石品質：抽到 L1~L6 的權重（第 n 列 = 品質 n）
const QUALITY_RATES = [
  [60, 30, 10, 0, 0, 0],
  [30, 40, 20, 10, 0, 0],
  [15, 35, 30, 15, 5, 0],
  [5, 25, 35, 25, 10, 0],
  [0, 15, 30, 35, 18, 2],
  [0, 5, 25, 35, 30, 5],
  [0, 0, 15, 35, 40, 10],
  [0, 0, 5, 30, 45, 20],
];
const QUALITY_COSTS = [30, 70, 130, 220, 350, 520, 750]; // 升到品質 2、3…8 的花費
// 甜點許願池：建造階段花金幣預訂「下一回合」的 5 選 1 風向，每回合只能許一次，不直接給成品
// 許願直接指定一種基礎甜點（key 就是甜點代號，如 'B'），不再分大類，玩家不用猜分類代表哪幾種
const GEM_CATEGORIES = Object.fromEntries(Object.entries(GEMS).map(([kind, g]) => [kind, { name: g.name, kinds: [kind] }]));
// 許願底價隨波數上漲（前期也許得起），封頂 20；同回合疊第 1/2/3 次為底價 ×1/×2/×3，所以單次最貴 60 金
const WISH_BASE_MIN = 5;
const WISH_BASE_MAX = 20;
const WISH_BASE_PER_WAVE = 0.5;
// 許願：只影響下一回合 5 格中的 1 格（不用選哪格），同一回合可連續許最多 3 次：機率逐次提高、價格逐次加貴，許滿第 3 次連等級也提高
const WISH_STACK_RATES = [0.6, 0.8, 1]; // 許願只影響 1 格，許越多次該格抽中指定分類的機率越高
const WISH_LEVEL_STACK = 3; // 許滿這麼多次，該格的等級也改用高一級品質的機率表
const WISH_STACK_COST_MULT = [1, 2, 3];
const WISH_MAX_STACKS = WISH_STACK_RATES.length;
const wishBase = wave => Math.min(WISH_BASE_MAX, Math.max(WISH_BASE_MIN, Math.round(WISH_BASE_MIN + wave * WISH_BASE_PER_WAVE)));
const wishCost = (wave, stacks = 0) => wishBase(wave) * WISH_STACK_COST_MULT[stacks];
// 隨機突變：從第 10 波起每 5 波換一張全局詞綴，持續到下一次抽取。傷害測試不受影響
// 每張都是取捨（pro 好處、con 代價），沒有純祝福或純詛咒，投票時比的是「哪種風險適合我的塔」
// 共用血量由全隊投票三選一，獨立血量全場隨機一張
const MUTATION_FIRST_WAVE = 10;
const MUTATION_EVERY = 5;
const MUTATION_OFFERS = 3;
const MUTATIONS = {
  frenzy: { name: '甜食狂熱', pro: '擊殺金幣 +50%', con: '怪物血量低於 30% 時移速翻倍', goldMult: 1.5, frenzy: { hp: 0.3, speed: 2 } },
  glass: { name: '玻璃大炮', pro: '塔傷害 +40%', con: '怪物血量 +40%', damage: 0.4, hpMult: 1.4 },
  sniper: { name: '狙擊手', pro: '射程 6 以上的塔傷害 +50%', con: '射程 4 以下的塔傷害 −30%', long: { min: 6, damage: 0.5 }, short: { max: 4, damage: -0.3 } },
  fog: { name: '濃霧', pro: '塔傷害 +25%', con: '所有塔射程 −1 格，要把塔換到更貼近路線的位置', damage: 0.25, range: -1 },
  shell: { name: '厚重甲殼', pro: '擊殺金幣 +50%', con: '每隻怪物免疫前 3 次受到的攻擊，快攻速與多目標的塔更有效', goldMult: 1.5, shellHits: 3 },
  swift: { name: '疾風', pro: '塔攻速 +25%', con: '怪物移速 +25%', haste: 0.25, monsterSpeed: 1.25 },
  glaze: { name: '糖衣護甲', pro: '擊殺數以 2 倍計入熟練度', con: '怪物護甲 +4，高單發傷害的塔更有效', killMult: 2, armorAdd: 4 },
  syrup: { name: '糖漿滋補', pro: '擊殺金幣 +50%', con: '怪物血量 +30%', goldMult: 1.5, hpMult: 1.3 },
  honey: { name: '蜜糖地面', pro: '怪物移速 −20%', con: '擊殺金幣 −40%', monsterSpeed: 0.8, goldMult: 0.6 },
  bullet: { name: '糖衣砲彈', pro: '塔傷害 +60%', con: '塔攻速 −25%，射程 −1 格', damage: 0.6, haste: -0.25, range: -1 },
  harvest: { name: '豐收季', pro: '擊殺金幣 +80%', con: '塔傷害 −20%', goldMult: 1.8, damage: -0.2 },
};
const MUTATION_IDS = Object.keys(MUTATIONS);
const isMutationWave = wave => wave >= MUTATION_FIRST_WAVE && (wave - MUTATION_FIRST_WAVE) % MUTATION_EVERY === 0;
const SWAP_COST = 25;
// 重骰手上「一格」甜點（賭合成用）：品質越高底價越貴，同一回合每骰一次再加價，下回合歸零
const REROLL_BASE = 5;
const REROLL_PER_QUALITY = 3;
const REROLL_STEP = 5;
const rerollCost = (quality, rerolls) => REROLL_BASE + (quality - 1) * REROLL_PER_QUALITY + rerolls * REROLL_STEP;
const REMOVE_STONE_COST = 0; // 拆餅乾牆免費

// 熟練度：塔累積擊殺數達門檻就升一階，每階加傷害與攻速；合成特殊塔時擊殺數會繼承
const MASTERY_KILLS = [15, 40, 80, 140];
const MASTERY_DAMAGE = 0.1;
const MASTERY_HASTE = 0.05;
const masteryRank = kills => MASTERY_KILLS.filter(n => kills >= n).length;

// 甜點研究：每個項目 5 級，對自己所有的塔生效，跟品質搶同一筆金幣
// 前 5 級是正式研究；之後是「匠心加給」，每級成本遞增、加成平緩，給後期金幣一個出口
const RESEARCH_BASE_LEVELS = 5;
const MASTERY_BONUS_LEVELS = 20;
const RESEARCH_COSTS = [
  60, 120, 200, 300, 450,
  ...Array.from({ length: MASTERY_BONUS_LEVELS }, (_, i) => 500 + i * 25),
];
const RESEARCH = {
  damage: { name: '濃縮風味', desc: '所有塔傷害 +8%（匠心加給每級 +1%）', perLevel: 0.08, bonusPerLevel: 0.01 },
  speed: { name: '快速出爐', desc: '所有塔攻速 +6%（匠心加給每級 +0.5%）', perLevel: 0.06, bonusPerLevel: 0.005 },
  range: { name: '香氣飄散', desc: '所有塔射程 +0.2 格（匠心加給每級 +0.05）', perLevel: 0.2, bonusPerLevel: 0.05 },
};
// 研究等級換算成加成：前 5 級走 perLevel，超出的走 bonusPerLevel
const researchValue = (track, level = 0) => {
  const r = RESEARCH[track];
  return Math.min(level, RESEARCH_BASE_LEVELS) * r.perLevel + Math.max(0, level - RESEARCH_BASE_LEVELS) * r.bonusPerLevel;
};

// 利息：過關時依結算前的存款發放，留錢也是一種選擇
const INTEREST_RATE = 0.05;
const INTEREST_CAP = 40;
const interestOn = gold => Math.min(INTEREST_CAP, Math.floor(gold * INTEREST_RATE));

// 怪物：hp 是相對於該波基準血量的倍率；leak 是漏怪時扣的血量
const MONSTERS = {
  normal: { name: '工蟻', hp: 1, speed: 3.4, armor: 0, count: 1, leak: 2, gold: 1 },
  fast: { name: '疾行甲蟲', hp: 0.6, speed: 5.2, armor: 0, count: 1, leak: 2, gold: 1 },
  swarm: { name: '碎屑蟲', hp: 0.35, speed: 3.8, armor: 0, count: 2, leak: 1, gold: 1 },
  armored: { name: '犀牛甲蟲', hp: 1.1, speed: 2.9, armor: 8, count: 1, leak: 3, gold: 2 },
  air: { name: '胡蜂', hp: 1.4, speed: 2.6, armor: 0, count: 1, leak: 2, gold: 1, flying: true },
  boss: { name: '女王蟻', hp: 16, speed: 2.4, armor: 4, count: 0, leak: 25, gold: 30, boss: true },
  // 傷害測試關卡的首領：血量是一般首領的 4 倍、走得更慢，走到終點也不扣血，只記錄每個人打了多少
  titan: { name: '甜點巨獸', hp: 64, speed: 1.6, armor: 4, count: 0, leak: 0, gold: 0, boss: true, test: true },
};
const MONSTER_TYPES = Object.keys(MONSTERS);

// 怪物特性：第 MIX_FROM_WAVE 波起掛在主力怪身上，每種都有對應的解法
// 不做「每秒回血 %」：迷宮越長回越多，等於懲罰蓋迷宮的人
const TRAITS = {
  split: { name: '分裂', desc: '死亡時分裂成 2 隻小蟲', tip: '濺射或多目標的塔能一起清掉', color: '#E08A1E' },
  immune: { name: '免控', desc: '不受緩速與毒傷影響', tip: '靠直接傷害，迷宮也要繞長一點', color: '#9B4FD8' },
  shield: { name: '護盾', desc: '單次受傷上限為最大血量的 20%', tip: '攻速快或多目標的塔比高傷單發有效', color: '#2F7FD1' },
};
const TRAIT_IDS = Object.keys(TRAITS);
const SPLIT_COUNT = 2;
const SPLIT_HP_RATIO = 0.3;
const SHIELD_HIT_CAP = 0.2;

const WAVE_ROTATION = ['normal', 'normal', 'fast', 'swarm', 'air', 'armored', 'normal', 'fast', 'air', 'boss'];
const ESCORT_ROTATION = ['air', 'swarm', 'armored', 'fast'];
const TRAIT_ROTATION = ['split', 'immune', 'shield', null];
const BOSS_TRAITS = [null, 'shield', 'immune']; // 每 10 波的首領輪流，短局的最後首領沒有特性
const MIX_FROM_WAVE = 6; // 前幾波單一怪種，讓新手先學會擺塔
const ESCORT_RATIO = 0.3;
const WAVE_BASE_COUNT = 12;
const WAVE_BASE_HP = 52;
const WAVE_HP_GROWTH = 1.24;
const WAVE_ARMOR_GROWTH = 0.15; // 每波額外護甲
const SPAWN_INTERVAL = 0.6;
const BOSS_SLOW_RESIST = 0.5;

const waveClearBonus = wave => 8 + 2 * wave;

// 護甲：每點減傷 6%（遞減）；被破甲到負值時改為增傷
const ARMOR_FLOOR = -10;
const armorFactor = armor => 1 / (1 + 0.06 * Math.max(armor, ARMOR_FLOOR));

function gemStats(kind, level) {
  const special = SPECIALS[kind];
  if (special) {
    const { name, trait, tier, ...stats } = special;
    return stats;
  }
  const gem = GEMS[kind];
  const damage = gem.damage * LEVEL_DAMAGE[level - 1];
  return {
    damage,
    cooldown: gem.cooldown,
    range: gem.range + (level - 1) * 0.2,
    ...(gem.hits ? { hits: gem.hits } : {}),
    ...(gem.perLevel ? gem.perLevel(level, damage) : {}),
  };
}

const researchBonus = (research = {}) => ({
  damage: 1 + researchValue('damage', research.damage ?? 0),
  haste: researchValue('speed', research.speed ?? 0),
  range: researchValue('range', research.range ?? 0),
});

function monsterGroup(type, count, wave, trait = null, difficulty = 'easy') {
  const def = MONSTERS[type];
  const diff = DIFFICULTIES[difficulty] ?? DIFFICULTIES.easy;
  // 前幾波場上只有一兩顆寶石，血量給緩坡
  const earlyRamp = Math.min(1, 0.4 + 0.2 * (wave - 1));
  return {
    type,
    count,
    trait,
    hp: Math.max(1, Math.round(WAVE_BASE_HP * Math.pow(WAVE_HP_GROWTH, wave - 1) * earlyRamp * def.hp * diff.hp)),
    armor: (def.armor + wave * WAVE_ARMOR_GROWTH) * diff.armor,
    speed: def.speed,
  };
}

function escortType(wave, main) {
  const type = ESCORT_ROTATION[wave % ESCORT_ROTATION.length];
  return type === main ? ESCORT_ROTATION[(wave + 1) % ESCORT_ROTATION.length] : type;
}

// 主力加護衛，總隻數不變；蟲群會把護衛再乘上 count
function waveGroups(type, wave, difficulty) {
  const size = Math.min(5 + 2 * wave, WAVE_BASE_COUNT + Math.floor(wave / 4));
  if (MONSTERS[type].boss) {
    return [monsterGroup(type, 1, wave, BOSS_TRAITS[(Math.floor(wave / 10) + BOSS_TRAITS.length - 1) % BOSS_TRAITS.length], difficulty)];
  }
  if (wave < MIX_FROM_WAVE) return [monsterGroup(type, MONSTERS[type].count * size, wave, null, difficulty)];
  const escort = escortType(wave, type);
  const escorts = Math.ceil(size * ESCORT_RATIO);
  return [
    monsterGroup(type, MONSTERS[type].count * (size - escorts), wave, TRAIT_ROTATION[(wave - MIX_FROM_WAVE) % TRAIT_ROTATION.length], difficulty),
    monsterGroup(escort, MONSTERS[escort].count * escorts, wave, null, difficulty),
  ];
}

// 每張地圖各打一份完整的波次，血量不隨人數變動
const waveDefCache = new Map();

// 波次內容只由 (wave, totalWaves) 決定，每次推送狀態都會問一次，所以記起來
function waveDef(wave, totalWaves, difficulty = 'easy') {
  const key = `${wave}/${totalWaves}/${difficulty}`;
  if (!waveDefCache.has(key)) waveDefCache.set(key, buildWaveDef(wave, totalWaves, difficulty));
  return waveDefCache.get(key);
}

// 傷害測試：打完第 at 波後加賽，巨獸血量以該波為基準（公式不設上限，能活到那裡的隊伍本來就扛得住那樣的血量）
function testWaveDef(at, difficulty = 'easy') {
  const key = `test/${at}/${difficulty}`;
  if (!waveDefCache.has(key)) {
    const group = monsterGroup('titan', 1, at, null, difficulty);
    waveDefCache.set(key, { ...group, count: 1, interval: SPAWN_INTERVAL, groups: [group], test: true, at });
  }
  return waveDefCache.get(key);
}

// 每打完 15 的倍數波、以及最後一波，都加賽一次傷害測試
const TEST_EVERY_WAVES = 15;
// 中途測試的金幣獎勵：傷害佔巨獸血量的比例（最多 100%）× 倍數 × 該波的過關獎勵；最後一場遊戲已結束，不發
const TEST_REWARD_MULT = 5;
const testReward = (at, damage, maxHp) => Math.round(Math.min(1, damage / maxHp) * TEST_REWARD_MULT * waveClearBonus(at));
const testAfterWave = (wave, totalWaves) => wave === totalWaves || wave % TEST_EVERY_WAVES === 0;

// 女王蟻漏掉扣的血依「在整局的進度」計算：前面的王扣得少，最後一隻扣最多。
// 跟總波數掛鉤，所以 15／30／50 波的局，最後一隻王都扣一樣多，短局也不會因為王比較少就太輕鬆
const BOSS_LEAK_MIN = 15;
const BOSS_LEAK_MAX = 40;
const bossLeak = (wave, totalWaves) => Math.round(BOSS_LEAK_MIN + (BOSS_LEAK_MAX - BOSS_LEAK_MIN) * Math.min(1, wave / totalWaves));

function buildWaveDef(wave, totalWaves, difficulty) {
  const type = wave === totalWaves ? 'boss' : WAVE_ROTATION[(wave - 1) % WAVE_ROTATION.length];
  const groups = waveGroups(type, wave, difficulty)
    .map(g => (MONSTERS[g.type].boss ? { ...g, leak: bossLeak(wave, totalWaves) } : g));
  const [main] = groups;
  return {
    ...main,
    count: groups.reduce((n, g) => n + g.count, 0),
    interval: SPAWN_INTERVAL * (main.speed < 3 ? 1.2 : 1),
    groups,
  };
}

// 下發給前端的唯讀資料（名稱、效果、配方），每次連線送一次
function catalog() {
  const statsOf = (kind, level) => {
    const s = gemStats(kind, level);
    return { damage: Math.round(s.damage), cooldown: s.cooldown, range: s.range, hits: s.hits ?? 'all' };
  };
  return {
    levelNames: LEVEL_NAMES,
    gems: Object.fromEntries(Object.entries(GEMS).map(([k, g]) => [k, {
      name: g.name, trait: g.trait,
      levels: LEVEL_NAMES.map((_, i) => statsOf(k, i + 1)),
    }])),
    specials: Object.fromEntries(Object.entries(SPECIALS).map(([k, s]) => [k, {
      name: s.name, trait: s.trait, tier: s.tier, stats: statsOf(k, 1),
    }])),
    recipes: RECIPES,
    monsters: MONSTER_TYPES.map(id => ({ id, name: MONSTERS[id].name, flying: !!MONSTERS[id].flying, boss: !!MONSTERS[id].boss, test: !!MONSTERS[id].test })),
    qualityRates: QUALITY_RATES,
    qualityCosts: QUALITY_COSTS,
    swapCost: SWAP_COST,
    rerollBase: REROLL_BASE,
    rerollPerQuality: REROLL_PER_QUALITY,
    rerollStep: REROLL_STEP,
    removeStoneCost: REMOVE_STONE_COST,
    mastery: { kills: MASTERY_KILLS, damage: MASTERY_DAMAGE, haste: MASTERY_HASTE },
    research: RESEARCH,
    researchCosts: RESEARCH_COSTS,
    researchBaseLevels: RESEARCH_BASE_LEVELS,
    mutations: Object.fromEntries(MUTATION_IDS.map(id => [id, { name: MUTATIONS[id].name, pro: MUTATIONS[id].pro, con: MUTATIONS[id].con }])),
    mutationFirstWave: MUTATION_FIRST_WAVE,
    mutationEvery: MUTATION_EVERY,
    wish: {
      categories: GEM_CATEGORIES,
      maxStacks: WISH_MAX_STACKS,
      stackRates: WISH_STACK_RATES,
      levelStack: WISH_LEVEL_STACK,
      stackCostMult: WISH_STACK_COST_MULT,
    },
    interest: { rate: INTEREST_RATE, cap: INTEREST_CAP },
    traits: TRAITS,
    traitIds: TRAIT_IDS,
    gemsPerRound: GEMS_PER_ROUND,
    lifeStep: LIFE_STEP,
    difficulties: DIFFICULTIES,
    speedChoices: SPEED_CHOICES,
  };
}

module.exports = {
  MIN_PLAYERS, MAX_PLAYERS, GEMS_PER_ROUND, START_LIVES, START_GOLD, lifeCost,
  WAVE_CHOICES, BUILD_SECOND_CHOICES, DIFFICULTIES, DIFFICULTY_IDS, SPEED_CHOICES, LIVES_MODES, DEFAULT_OPTIONS, BOARD_SIZE, WAYPOINTS,
  MAX_LEVEL, GEMS, SPECIALS, RECIPES, QUALITY_RATES, QUALITY_COSTS,
  MUTATIONS, MUTATION_IDS, MUTATION_OFFERS, isMutationWave,
  SWAP_COST, GEM_CATEGORIES, WISH_STACK_RATES, WISH_LEVEL_STACK, WISH_MAX_STACKS, wishCost, rerollCost, REMOVE_STONE_COST, MASTERY_KILLS, MASTERY_DAMAGE, MASTERY_HASTE, masteryRank, RESEARCH, RESEARCH_COSTS, RESEARCH_BASE_LEVELS, researchValue, MONSTERS, MONSTER_TYPES, SPAWN_INTERVAL, BOSS_SLOW_RESIST,
  TRAIT_IDS, SPLIT_COUNT, SPLIT_HP_RATIO, SHIELD_HIT_CAP,
  waveClearBonus, bossLeak, interestOn, armorFactor, gemStats, researchBonus, waveDef, testWaveDef, testAfterWave, testReward, catalog,
};
