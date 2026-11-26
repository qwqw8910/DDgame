'use strict';

// ================================================================
//  寶石塔防 — 波次模擬（純函式，不碰 socket / 計時器）
//  index.js 以固定步長呼叫 stepWave；測試可以直接快轉整波。
//  座標單位都是「格」，格子中心就是整數座標。
// ================================================================

const C = require('./config');
const { findFullRoute } = require('./pathing');

const typeIndex = Object.fromEntries(C.MONSTER_TYPES.map((t, i) => [t, i]));
const MAX_FRAME_SHOTS = 80;

const FLAG_SLOW = 1;
const FLAG_POISON = 2;
const FLAG_STUN = 4;
const FLAG_TRAIT_SHIFT = 3; // 特性佔後面的位元，順序同 C.TRAIT_IDS

const distance = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// 塔的戰鬥數值在開波時算好（包含蛋白石光環），波次中不再變動
// research 可以是一份研究（每座塔套同一份），或函式 tower → 研究（合作迷宮：各依擁有者）
function prepareTowers(towers, research) {
  const bonusFor = typeof research === 'function'
    ? (() => {
      const cache = new Map();
      return (t) => {
        const r = research(t);
        if (!cache.has(r)) cache.set(r, C.researchBonus(r));
        return cache.get(r);
      };
    })()
    : (() => { const fixed = C.researchBonus(research); return () => fixed; })();
  const armed = towers.filter(t => t.kind !== 'stone');
  const auras = armed
    .map(t => ({ t, aura: C.gemStats(t.kind, t.level).aura }))
    .filter(a => a.aura);

  return armed.map((ref) => {
    const bonus = bonusFor(ref);
    const base = C.gemStats(ref.kind, ref.level);
    const rank = C.masteryRank(ref.kills);
    const stats = { ...base, damage: base.damage * (bonus.damage + rank * C.MASTERY_DAMAGE), range: base.range + bonus.range };
    // 同區光環不疊加，取最強的一道
    const haste = auras.reduce((best, { t, aura }) => (
      t !== ref && distance(t.x, t.y, ref.x, ref.y) <= aura.radius ? Math.max(best, aura.haste) : best
    ), 0);
    return { ref, stats, cooldown: stats.cooldown / (1 + haste + bonus.haste + rank * C.MASTERY_HASTE), wait: 0 };
  });
}

// 環形接力：這一區要出的蟲。每區出一組、血量與護甲依走過的區數與人數加成；
// 首領每區各出一隻、整隻繞完整圈；傷害測試的巨獸仍只從區 1 出發（才量得到整圈的總傷害）
function applyRelayDef(def, { zone, n }) {
  const boss = def.groups.some(g => C.MONSTERS[g.type].boss);
  const test = def.groups.some(g => C.MONSTERS[g.type].test);
  if (test && zone !== 0) {
    def.count = 0;
    def.groups = def.groups.map(g => ({ ...g, count: 0 }));
    return;
  }
  const hpMult = boss ? (test ? C.relayTestHpMult(n) :C.RELAY_BOSS_HP_MULT) : C.relayGroupHpMult(n);
  const armorMult = test ? C.RELAY_TEST_ARMOR_MULT : boss ? 1 : C.RELAY_ARMOR_MULT;
  def.groups = def.groups.map(g => ({ ...g, hp: Math.max(1, Math.round(g.hp * hpMult)), armor: Math.round(g.armor * armorMult) }));
  def.hp = def.groups[0].hp;
  def.armor = Math.round(def.armor * armorMult);
}

// 合作迷宮：全隊一張圖，怪物血量依人數加成
function applyCoopDef(def, { n }) {
  const mult = C.coopHpMult(n);
  def.groups = def.groups.map(g => ({ ...g, hp: Math.max(1, Math.round(g.hp * mult)) }));
  def.hp = def.groups[0].hp;
}

// 蟲的編號：環形接力整圈共用同一組編號，前端才不會把不同區的蟲混在一起
const newId = sim => (sim.relay ? sim.relay.hub.nextId++ : sim.nextId++);

// pool 是這張地圖漏怪時扣血的對象：共用血量是 game，獨立血量是玩家自己
// relay：環形接力時為 { zone, n, hub }；devBoss：開發測試的首領波
function createWave({ board, towers: placed, path, wave, totalWaves, testAt = null, difficulty = 'easy', pool, research, relay = null, coop = null, devBoss = false, skillCd = null, route = null, breach = null }) {
  // waveDef 有快取；這一波會改動 def 與各組（測試也會），所以複製一份
  const cached = devBoss ? C.bossWaveDef(wave, totalWaves, difficulty)
    : testAt === null ? C.waveDef(wave, totalWaves, difficulty) : C.testWaveDef(testAt, difficulty, totalWaves);
  const def = { ...cached, groups: cached.groups.map(g => ({ ...g })) };
  if (relay) applyRelayDef(def, relay);
  if (coop) applyCoopDef(def, coop);
  const towers = prepareTowers(placed, research);
  const air = airRoute(board);
  const sim = {
    wave,
    def,
    board,
    pool,
    relay, // 環形接力：{ zone, n, hub }；單人模式是 null
    coop: !!coop, // 合作迷宮：全隊共用一張圖；擊殺金記在 earnedBy（依塔的擁有者）
    earnedBy: {},
    rs: { kills: 0, handoff: 0, relief: 0, leaks: 0 }, // 分區統計（只在環形接力有意義）
    time: 0,
    queue: spawnQueue(def),
    spawned: 0,
    splits: 0,
    nextId: 1,
    monsters: [],
    towers,
    armorAuras: towers.filter(t => t.stats.armorAura),
    path,
    air,
    airLength: air.length,
    killed: 0,
    leaked: 0,
    damage: 0, // 這張地圖這一波打出的總傷害（傷害測試用）
    bossDownAt: null,
    earned: 0,
    shots: [],
    skillCd: skillCd ?? Object.fromEntries(C.SKILL_IDS.map(id => [id, 0])), // 各技能還要等幾波（跨波保留，由玩家持有）
    noSkills: testAt !== null || !!relay,
    done: false,
    // 合作迷宮 breach：{ grid, costOf, hpOf(cellValue, wave), onBroken(tower), onRepath(route) }；其他模式是 null
    breach,
    walls: new Map(), // "x,y" → { x, y, hp, maxHp }：被怪物攻擊過的牆
    legStarts: route?.legStarts ?? null,
    wallIdx: (route?.breaches ?? []).map(b => b.index),
    changed: false, // 有牆被打破（呼叫端要推送新狀態）
  };
  return sim;
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
  const hp = group.hp;
  const baseGold = info.gold + Math.floor(sim.wave / 6);
  sim.monsters.push({
    id: newId(sim),
    type: group.type,
    trait: group.trait,
    flying: !!info.flying,
    boss: !!info.boss,
    hp,
    maxHp: hp,
    armor: group.armor,
    speed: group.speed,
    pos: 0,
    x: start.x,
    y: start.y,
    slowPct: 0, slowUntil: 0, stunUntil: 0,
    poisonDps: 0, poisonUntil: 0, poisonBy: null,
    shredAmount: 0, shredUntil: 0,
    gold: baseGold,
    leak: group.leak ?? info.leak,
    dead: false,
    // 環形接力：出生區、已走完幾區、總共要走幾區（一般蟲 2 區：主防＋後援；首領與巨獸繞完整圈）
    ...(sim.relay ? { born: sim.relay.zone, hop: 0, hops: info.boss ? sim.relay.n : C.relayPasses(sim.relay.n) } : {}),
  });
  sim.spawned += 1;
}

// 飛行怪不受石頭阻擋，但一樣依序飛過 1→5 號路徑點：每段走直線
function airRoute(board) {
  const stops = [board.start, ...board.checkpoints, board.end];
  const cum = [0];
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    cum.push(cum[i - 1] + distance(a.x, a.y, b.x, b.y));
  }
  return { stops, cum, length: cum[cum.length - 1] };
}

function pathLength(sim, m) {
  return m.flying ? sim.airLength : sim.path.length - 1;
}

// ── 堵死拆牆（合作迷宮 breach）────────────────────────────────────
// 路線上的牆在 path 裡的索引是 sim.wallIdx；地面蟲走到牆前半格停下，攻擊那面牆，牆破了就重新尋路
const cellKey = (c) => `${c.x},${c.y}`;

function wallAhead(sim, pos) {
  for (const k of sim.wallIdx) if (k - 0.5 >= pos - 1e-9) return k;
  return -1;
}

function attackWall(sim, m, k, dt) {
  const cell = sim.path[k];
  const key = cellKey(cell);
  const target = sim.breach.grid.get(key);
  if (!target) return; // 這面牆剛被別隻蟲打破，下一次重新尋路
  let wall = sim.walls.get(key);
  if (!wall) {
    const hp = sim.breach.hpOf(target, sim.wave);
    wall = { x: cell.x, y: cell.y, hp, maxHp: hp };
    sim.walls.set(key, wall);
  }
  wall.hp -= C.COOP.breachDps * (m.boss ? 4 : 1) * dt;
  if (wall.hp <= 0) breakWall(sim, key, target);
}

function legOf(legStarts, pos) {
  let leg = 0;
  while (leg + 1 < legStarts.length && legStarts[leg + 1] <= Math.floor(pos)) leg++;
  return leg;
}

function breakWall(sim, key, target) {
  const { breach } = sim;
  breach.grid.delete(key);
  sim.walls.delete(key);
  sim.towers = sim.towers.filter(t => t.ref !== target);
  sim.armorAuras = sim.armorAuras.filter(t => t.ref !== target);
  breach.onBroken(target);
  // 舊路線上每隻地面蟲在第幾段，新路線上就找那一段裡離它最近的格子
  const oldStarts = sim.legStarts;
  const legs = new Map(sim.monsters.filter(m => !m.flying && !m.dead).map(m => [m, legOf(oldStarts, m.pos)]));
  const route = findFullRoute(sim.board, breach.costOf);
  sim.path = route.path;
  sim.legStarts = route.legStarts;
  sim.wallIdx = route.breaches.map(b => b.index);
  for (const [m, leg] of legs) {
    const from = route.legStarts[leg];
    const to = route.legStarts[leg + 1] ?? route.path.length - 1;
    let best = from;
    let bestD = Infinity;
    for (let i = from; i <= to; i++) {
      const d = distance(route.path[i].x, route.path[i].y, m.x, m.y);
      if (d < bestD - 1e-9) { bestD = d; best = i; }
    }
    m.pos = best;
  }
  breach.onRepath(route);
  sim.changed = true;
}

function moveMonster(sim, m, dt) {
  if (sim.time < m.stunUntil) return;
  const slowed = sim.time < m.slowUntil ? m.slowPct : 0;
  if (sim.breach && !m.flying) {
    const k = wallAhead(sim, m.pos);
    if (k >= 0) {
      const next = m.pos + m.speed * (1 - slowed) * dt;
      if (next >= k - 0.5 - 1e-9) {
        m.pos = k - 0.5;
        attackWall(sim, m, k, dt);
        return placeOnPath(sim, m);
      }
    }
  }
  m.pos += m.speed * (1 - slowed) * dt;

  const length = pathLength(sim, m);
  if (m.pos >= length) {
    m.dead = true;
    if (sim.relay) return sim.relay.hub.onExit(sim, m); // 離開這一區：傳給下一區，或離場扣血
    sim.leaked += 1;
    sim.pool.lives = Math.max(0, sim.pool.lives - m.leak);
    return;
  }

  if (m.flying) {
    const { stops, cum } = sim.air;
    let i = 0;
    while (i < cum.length - 2 && m.pos >= cum[i + 1]) i++;
    const a = stops[i];
    const b = stops[i + 1];
    const seg = cum[i + 1] - cum[i];
    const t = seg > 0 ? (m.pos - cum[i]) / seg : 1;
    m.x = a.x + (b.x - a.x) * t;
    m.y = a.y + (b.y - a.y) * t;
    return;
  }
  placeOnPath(sim, m);
}

function placeOnPath(sim, m) {
  const i = Math.floor(m.pos);
  const a = sim.path[i];
  const b = sim.path[i + 1] ?? a;
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
      ...m, id: newId(sim), trait: null, hp, maxHp: hp, gold: 0, leak: 1, dead: false, pos: Math.max(0, m.pos - i * 0.3),
    });
  }
  sim.splits += C.SPLIT_COUNT;
}

function kill(sim, tower, m) {
  m.dead = true;
  sim.killed += 1;
  if (sim.relay) {
    sim.rs.kills += 1;
    if (m.hop >= 1) sim.rs.relief += 1; // 在自己的區打死別區傳來的蟲
  }
  // 環形接力：擊殺金一半給擊殺區、一半給蟲的出生區（自己打死自己漏的 = 100%）
  if (sim.relay && m.born !== undefined && m.born !== sim.relay.zone) {
    const born = Math.floor(m.gold * C.RELAY_KILL_GOLD_BORN_SHARE);
    sim.earned += m.gold - born;
    const credit = (sim.relay.hub.credit ??= {});
    credit[m.born] = (credit[m.born] ?? 0) + born;
  } else {
    sim.earned += m.gold;
    if (sim.coop) sim.earnedBy[tower.ref.owner] = (sim.earnedBy[tower.ref.owner] ?? 0) + m.gold;
  }
  tower.ref.kills += 1;
  if (m.boss) sim.bossDownAt = sim.time;
  if (m.trait === 'split') splitMonster(sim, m);
}

// 回傳實際扣掉的血量（套過護甲與護盾上限），給前端顯示傷害數字
function dealDamage(sim, tower, m, raw, dot = false) {
  if (m.dead) return 0;
  const reduced = raw * C.armorFactor(effectiveArmor(sim, m));
  const dealt = m.trait === 'shield' ? Math.min(reduced, m.maxHp * C.SHIELD_HIT_CAP) : reduced;
  const applied = Math.min(dealt, m.hp);
  tower.ref.damage += applied;
  sim.damage += applied;
  m.hp -= dealt;
  if (m.hp <= 0) kill(sim, tower, m);
  return dealt;
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
    const crit = !!stats.crit && rng() < stats.crit.chance;
    const raw = crit ? stats.damage * stats.crit.mult : stats.damage;
    applyEffects(sim, tower, target);
    const dealt = dealDamage(sim, tower, target, raw);
    // [塔, 目標, 是否暴擊, 實際傷害]：前端用來閃白、跳傷害數字、震動
    if (sim.shots.length < MAX_FRAME_SHOTS) sim.shots.push([ref.id, target.id, crit ? 1 : 0, Math.round(dealt)]);

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
    if (sim.time < m.poisonUntil && m.poisonBy) dealDamage(sim, m.poisonBy, m, m.poisonDps * dt, true);
    if (m.dead) continue;
    moveMonster(sim, m, dt);
  }

  for (const tower of sim.towers) {
    tower.wait -= dt;
    if (tower.wait <= 0) fire(sim, tower, rng);
  }

  if (sim.monsters.some(m => m.dead)) sim.monsters = sim.monsters.filter(m => !m.dead);

  return sim.pool.lives <= 0 || (sim.spawned >= def.count && sim.monsters.length === 0);
}

// 蟲的狀態旗標（緩速、中毒、特性），單人與環形接力的快照共用
function monsterFlags(sim, m) {
  return (sim.time < m.slowUntil ? FLAG_SLOW : 0) | (sim.time < m.poisonUntil ? FLAG_POISON : 0) | (sim.time < m.stunUntil ? FLAG_STUN : 0) | traitFlag(m);
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
      monsterFlags(sim, m),
    ]),
    s: sim.shots,
    // 被攻擊中的牆 [x, y, 剩餘血量%]（合作迷宮 breach）
    ...(sim.walls.size ? { w: [...sim.walls.values()].map(w => [w.x, w.y, Math.max(1, Math.ceil((w.hp / w.maxHp) * 100))]) } : {}),
  };
  sim.shots = [];
  return frame;
}

// 主動技能：成功回傳 true；不能用丟 Error('原因')
function castSkill(sim, id) {
  const skill = C.SKILLS[id];
  if (!skill) throw new Error('沒有這個技能');
  if (sim.noSkills) throw new Error('這一波不能使用技能');
  if (sim.done) throw new Error('這一波已經結束');
  if (sim.skillCd[id] > 0) throw new Error('技能冷卻中');
  sim.skillCd[id] = skill.cooldownWaves;
  for (const m of sim.monsters) {
    if (m.dead || m.trait === 'immune') continue;
    if (id === 'freeze') {
      const pct = m.boss ? skill.slow * C.BOSS_SLOW_RESIST : skill.slow;
      if (pct >= m.slowPct || sim.time >= m.slowUntil) { m.slowPct = pct; m.slowUntil = sim.time + skill.duration; }
    } else {
      m.stunUntil = Math.max(m.stunUntil, sim.time + skill.duration * (m.boss ? C.BOSS_STUN_RESIST : 1));
    }
  }
  return true;
}

// 各技能還要等幾波（0 = 可用），給前端顯示
const skillCooldowns = sim => C.SKILL_IDS.map(id => sim.skillCd[id]);

module.exports = { castSkill, skillCooldowns, createWave, stepWave, buildSimFrame, prepareTowers, monsterFlags, typeIndex };
