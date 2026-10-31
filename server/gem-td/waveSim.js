'use strict';

// ================================================================
//  寶石塔防 — 波次模擬（純函式，不碰 socket / 計時器）
//  index.js 以固定步長呼叫 stepWave；測試可以直接快轉整波。
//  座標單位都是「格」，格子中心就是整數座標。
// ================================================================

const C = require('./config');

const typeIndex = Object.fromEntries(C.MONSTER_TYPES.map((t, i) => [t, i]));
const MAX_FRAME_SHOTS = 80;

const FLAG_SLOW = 1;
const FLAG_POISON = 2;
const FLAG_TRAIT_SHIFT = 2; // 特性佔後面的位元，順序同 C.TRAIT_IDS

const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// 塔的戰鬥數值在開波時算好（包含蛋白石光環），波次中不再變動
function prepareTowers(towers, research) {
  const bonus = C.researchBonus(research);
  const armed = towers.filter(t => t.kind !== 'stone');
  const auras = armed
    .map(t => ({ t, aura: C.gemStats(t.kind, t.level).aura }))
    .filter(a => a.aura);

  return armed.map((ref) => {
    const base = C.gemStats(ref.kind, ref.level);
    const stats = { ...base, damage: base.damage * bonus.damage, range: base.range + bonus.range };
    // 同區光環不疊加，取最強的一道
    const haste = auras.reduce((best, { t, aura }) => (
      t !== ref && distance(t.x, t.y, ref.x, ref.y) <= aura.radius ? Math.max(best, aura.haste) : best
    ), 0);
    return { ref, stats, cooldown: stats.cooldown / (1 + haste + bonus.haste), wait: 0 };
  });
}

// pool 是這張地圖漏怪時扣血的對象：共用血量是 game，獨立血量是玩家自己
function createWave({ board, towers: placed, path, wave, totalWaves, pool, research }) {
  const def = C.waveDef(wave, totalWaves);
  const towers = prepareTowers(placed, research);
  const { start, end } = board;
  return {
    wave,
    def,
    board,
    pool,
    time: 0,
    queue: spawnQueue(def),
    spawned: 0,
    splits: 0,
    nextId: 1,
    monsters: [],
    towers,
    armorAuras: towers.filter(t => t.stats.armorAura),
    path,
    airLength: distance(start.x, start.y, end.x, end.y),
    killed: 0,
    leaked: 0,
    earned: 0,
    shots: [],
    done: false,
  };
}

// 各組依比例交錯出場，護衛不會全擠在最後
function spawnQueue(def) {
  return def.groups
    .flatMap(g => Array.from({ length: g.count }, (_, i) => ({ g, order: (i + 0.5) / g.count })))
    .sort((a, b) => a.order - b.order)
    .map(s => s.g);
}

function spawn(sim) {
  const group = sim.queue[sim.spawned];
  const { start } = sim.board;
  const info = C.MONSTERS[group.type];
  sim.monsters.push({
    id: sim.nextId++,
    type: group.type,
    trait: group.trait,
    flying: !!info.flying,
    boss: !!info.boss,
    hp: group.hp,
    maxHp: group.hp,
    armor: group.armor,
    speed: group.speed,
    pos: 0,
    x: start.x,
    y: start.y,
    slowPct: 0, slowUntil: 0,
    poisonDps: 0, poisonUntil: 0, poisonBy: null,
    shredAmount: 0, shredUntil: 0,
    gold: info.gold + Math.floor(sim.wave / 6),
    leak: info.leak,
    dead: false,
  });
  sim.spawned += 1;
}

function pathLength(sim, m) {
  return m.flying ? sim.airLength : sim.path.length - 1;
}

function moveMonster(sim, m, dt) {
  const slowed = sim.time < m.slowUntil ? m.slowPct : 0;
  m.pos += m.speed * (1 - slowed) * dt;

  const length = pathLength(sim, m);
  if (m.pos >= length) {
    m.dead = true;
    sim.leaked += 1;
    sim.pool.lives = Math.max(0, sim.pool.lives - m.leak);
    return;
  }

  if (m.flying) {
    const { start, end } = sim.board;
    const t = m.pos / length;
    m.x = start.x + (end.x - start.x) * t;
    m.y = start.y + (end.y - start.y) * t;
    return;
  }
  const i = Math.floor(m.pos);
  const a = sim.path[i];
  const b = sim.path[i + 1];
  const t = m.pos - i;
  m.x = a.x + (b.x - a.x) * t;
  m.y = a.y + (b.y - a.y) * t;
}

function effectiveArmor(sim, m) {
  let armor = m.armor;
  if (sim.time < m.shredUntil) armor -= m.shredAmount;
  let aura = 0;
  for (const t of sim.armorAuras) {
    const { amount, radius } = t.stats.armorAura;
    if (amount > aura && distance(t.ref.x, t.ref.y, m.x, m.y) <= radius) aura = amount;
  }
  return armor - aura;
}

// 小蟲繼承位置與進度，沒有特性也沒有金幣
function splitMonster(sim, m) {
  const hp = m.maxHp * C.SPLIT_HP_RATIO;
  for (let i = 0; i < C.SPLIT_COUNT; i++) {
    sim.monsters.push({
      ...m, id: sim.nextId++, trait: null, hp, maxHp: hp, gold: 0, leak: 1, dead: false, pos: Math.max(0, m.pos - i * 0.3),
    });
  }
  sim.splits += C.SPLIT_COUNT;
}

function kill(sim, tower, m) {
  m.dead = true;
  sim.killed += 1;
  sim.earned += m.gold;
  tower.ref.kills += 1;
  if (m.trait === 'split') splitMonster(sim, m);
}

function dealDamage(sim, tower, m, raw) {
  if (m.dead) return;
  const reduced = raw * C.armorFactor(effectiveArmor(sim, m));
  const dealt = m.trait === 'shield' ? Math.min(reduced, m.maxHp * C.SHIELD_HIT_CAP) : reduced;
  tower.ref.damage += Math.min(dealt, m.hp);
  m.hp -= dealt;
  if (m.hp <= 0) kill(sim, tower, m);
}

function applyEffects(sim, tower, m) {
  const { slow, poison, shred } = tower.stats;
  const immune = m.trait === 'immune';
  if (slow && !immune) {
    const pct = m.boss ? slow.pct * C.BOSS_SLOW_RESIST : slow.pct;
    if (pct >= m.slowPct || sim.time >= m.slowUntil) {
      m.slowPct = pct;
      m.slowUntil = sim.time + slow.duration;
    }
  }
  if (poison && !immune && (poison.dps >= m.poisonDps || sim.time >= m.poisonUntil)) {
    m.poisonDps = poison.dps;
    m.poisonUntil = sim.time + poison.duration;
    m.poisonBy = tower;
  }
  if (shred && (shred.amount >= m.shredAmount || sim.time >= m.shredUntil)) {
    m.shredAmount = shred.amount;
    m.shredUntil = sim.time + shred.duration;
  }
}

function regenerate(sim, m, dt) {
  if (m.trait !== 'regen' || sim.time < m.poisonUntil) return;
  const rate = m.boss ? C.BOSS_REGEN_RATE : C.REGEN_RATE;
  m.hp = Math.min(m.maxHp, m.hp + m.maxHp * rate * dt);
}

function canHit(stats, m) {
  if (stats.hits === 'air') return m.flying;
  if (stats.hits === 'ground') return !m.flying;
  return true;
}

// 射程內離終點最近的 n 個目標
function pickTargets(sim, tower) {
  const { ref, stats } = tower;
  const count = stats.targets ?? 1;
  const inRange = [];
  for (const m of sim.monsters) {
    if (m.dead || !canHit(stats, m)) continue;
    if (distance(ref.x, ref.y, m.x, m.y) <= stats.range) inRange.push(m);
  }
  if (inRange.length <= 1) return inRange;
  const remaining = m => pathLength(sim, m) - m.pos;
  inRange.sort((a, b) => remaining(a) - remaining(b));
  return inRange.slice(0, count);
}

function fire(sim, tower, rng) {
  const targets = pickTargets(sim, tower);
  if (!targets.length) return;
  tower.wait = tower.cooldown;
  const { stats, ref } = tower;

  for (const target of targets) {
    if (sim.shots.length < MAX_FRAME_SHOTS) sim.shots.push([ref.id, target.id]);
    const raw = stats.crit && rng() < stats.crit.chance ? stats.damage * stats.crit.mult : stats.damage;
    applyEffects(sim, tower, target);
    dealDamage(sim, tower, target, raw);

    if (!stats.splash) continue;
    const { radius, ratio } = stats.splash;
    for (const m of sim.monsters) {
      if (m === target || m.dead || !canHit(stats, m)) continue;
      if (distance(target.x, target.y, m.x, m.y) > radius) continue;
      applyEffects(sim, tower, m);
      dealDamage(sim, tower, m, raw * ratio);
    }
  }
}

// 前進 dt 秒；回傳這張地圖的這一波是否結束（全滅 / 漏光 / 血量歸零）
function stepWave(sim, dt, rng = Math.random) {
  sim.time += dt;

  const { def } = sim;
  while (sim.spawned < def.count && sim.time >= sim.spawned * def.interval) spawn(sim);

  for (const m of sim.monsters) {
    if (sim.time < m.poisonUntil && m.poisonBy) dealDamage(sim, m.poisonBy, m, m.poisonDps * dt);
    if (m.dead) continue;
    regenerate(sim, m, dt);
    moveMonster(sim, m, dt);
  }

  for (const tower of sim.towers) {
    tower.wait -= dt;
    if (tower.wait <= 0) fire(sim, tower, rng);
  }

  if (sim.monsters.some(m => m.dead)) sim.monsters = sim.monsters.filter(m => !m.dead);

  return sim.pool.lives <= 0 || (sim.spawned >= def.count && sim.monsters.length === 0);
}

function traitFlag(m) {
  return m.trait ? 1 << (FLAG_TRAIT_SHIFT + C.TRAIT_IDS.indexOf(m.trait)) : 0;
}

// 一張地圖的快照：座標 ×10 取整省流量；shots 在送出後清空
function buildSimFrame(sim) {
  const frame = {
    m: sim.monsters.map(m => [
      m.id,
      typeIndex[m.type],
      Math.round(m.x * 10),
      Math.round(m.y * 10),
      Math.ceil((m.hp / m.maxHp) * 100),
      (sim.time < m.slowUntil ? FLAG_SLOW : 0) | (sim.time < m.poisonUntil ? FLAG_POISON : 0) | traitFlag(m),
    ]),
    s: sim.shots,
  };
  sim.shots = [];
  return frame;
}

module.exports = { createWave, stepWave, buildSimFrame, prepareTowers };
