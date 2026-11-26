'use strict';

// ================================================================
//  甜點守衛戰 — 平衡模擬。調整 config.js 後重跑，不是正式數據。
//  用法：node gem-td/balanceSim.js [每組局數]
//  機器人照藍圖圍住中央再蓋蛇形迷宮、合特殊塔，金幣先升滿品質再買研究。
// ================================================================

const path = require('path');

// 指定目錄可比較不同版本的數值：GEM_TD_DIR=../舊版 node gem-td/balanceSim.js
const dir = process.env.GEM_TD_DIR ? path.resolve(process.env.GEM_TD_DIR) : __dirname;
const L = require(path.join(dir, 'gameLogic.js'));
const C = require(path.join(dir, 'config.js'));

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 迷宮藍圖：先沿中線蓋隧道把 3 號點圍住，第 2、4、5 段都要進出這裡；再一排排蓋蛇形牆，缺口左右交錯
const TUNNEL_ROWS = [11, 13];
const TUNNEL_REACH = 8;
const MAZE_ROWS = [9, 15, 7, 17, 5, 19];
const GAP_LEFT_ROWS = [5, 9, 15, 19];

function mazeBlueprint(width) {
  const center = Math.floor(width / 2);
  const tunnel = Array.from({ length: TUNNEL_REACH }, (_, i) => i + 1).flatMap(d => (
    TUNNEL_ROWS.flatMap(y => [{ x: center - d, y }, { x: center + d, y }])
  ));
  const rows = MAZE_ROWS.flatMap(y => Array.from({ length: width - 1 }, (_, i) => (
    { x: GAP_LEFT_ROWS.includes(y) ? width - 1 - i : i, y }
  )));
  return [...TUNNEL_ROWS.map(y => ({ x: center, y })), ...tunnel, ...rows];
}

function placeSmart(game, id) {
  const p = game.players[id];
  const cells = mazeBlueprint(game.board.width);
  while (p.pending.length) {
    const { slot } = p.pending[0];
    const spot = cells.find((c) => {
      if (p.grid.has(`${c.x},${c.y}`)) return false;
      try {
        L.placeGem(game, id, slot, c.x, c.y);
        return true;
      } catch (err) {
        if (err instanceof L.GameError) return false;
        throw err;
      }
    });
    if (!spot) return; // 交給 autoResolve 隨機放
  }
}

const specialTier = kind => C.SPECIALS[kind]?.tier ?? 0;

function resolveRound(game, id, rng) {
  const p = game.players[id];
  // 只用場上材料的配方不佔回合，能合就先合
  for (let i = 0; i < 6; i++) {
    const usable = L.availableRecipes(game, id)
      .sort((a, b) => specialTier(b.id) - specialTier(a.id))[0];
    if (!usable) break;
    L.combine(game, id, usable.id);
    if (p.resolved) return;
  }
  L.autoResolve(game, id, rng);
}

function spendGold(game, id) {
  const p = game.players[id];
  const shop = () => {
    const options = [];
    if (p.quality < C.QUALITY_RATES.length && p.gold >= C.QUALITY_COSTS[p.quality - 1]) options.push(() => L.upgradeQuality(game, id));
    if (L.upgradeResearch) {
      for (const track of Object.keys(C.RESEARCH)) {
        const cost = C.RESEARCH_COSTS[p.research[track]];
        if (cost !== undefined && p.gold >= cost) options.push(() => L.upgradeResearch(game, id, track));
      }
    }
    return options;
  };
  for (let options = shop(); options.length; options = shop()) {
    options[0]();
  }
}

function playGame({ players, waves, livesMode, seed, difficulty = 'easy' }) {
  const rng = seededRng(seed);
  const game = L.createGame();
  game.options = { ...game.options, waves, livesMode, buildSeconds: 0, damageTest: true, difficulty };
  const ids = Array.from({ length: players }, (_, i) => `p${i}`);
  L.startGame(game, ids, { now: 0, rng });

  while (game.phase !== 'finished') {
    for (const id of ids) {
      if (game.players[id].out) continue;
      spendGold(game, id);
      placeSmart(game, id);
      resolveRound(game, id, rng);
    }
    L.startWave(game, { rng });
    let guard = 0;
    while (!L.tick(game, 0.1, rng).done && guard++ < 20000);
    L.finishWave(game, { now: 0, rng });
  }
  return game.result;
}

function run(rounds) {
  console.log('人數  模式  波數  勝率   平均到達波數  傷害測試(擊殺率 / 平均造成血量比例)');
  for (const waves of C.WAVE_CHOICES) {
    for (const [players, livesMode] of [[1, 'team'], [2, 'team'], [4, 'team'], [2, 'solo'], [4, 'solo']]) {
      let wins = 0; let reached = 0; let tested = 0; let downs = 0; let share = 0;
      for (let seed = 1; seed <= rounds; seed++) {
        const result = playGame({ players, waves, livesMode, seed });
        if (result.win) wins += 1;
        reached += result.wave;
        for (const row of (result.test?.rounds ?? []).flatMap(r => r.rows)) {
          tested += 1;
          if (row.killed) downs += 1;
          share += Math.min(1, row.damage / row.maxHp);
        }
      }
      console.log(`${players}     ${livesMode}  ${waves}    ${String(Math.round((wins / rounds) * 100)).padStart(3)}%   ${(reached / rounds).toFixed(1)}        ${tested ? `${Math.round((downs / tested) * 100)}% / ${Math.round((share / tested) * 100)}%` : '-'}`);
    }
  }
}

// ── 環形接力 ─────────────────────────────────────────────────────
// 每一區都用同一個機器人（蓋迷宮、合塔、升級），血量給到打不死，量的是「漏怪率」：
// 漏怪率 = 從出口離場的蟲 ÷ 出過的蟲（含分裂小蟲）。區域數 1 就是單人基準，其他區域數與它相除。
// 排除首領與傷害測試（首領另列：每場首領波的漏怪次數）
function playRelay({ zones, waves, seed, difficulty = 'easy' }) {
  const rng = seededRng(seed);
  const game = L.createGame();
  game.options = L.resolveOptions({ mode: zones === 1 ? 'single' : 'relay', zones, waves, buildSeconds: 0 });
  L.startGame(game, ['p0'], { now: 1, rng });
  game.lives = 1e9; // 不讓血量歸零，量完整的漏怪率
  const ids = game.playerIds;
  const out = { spawned: 0, leaked: 0, bossLeaks: 0, bossWaves: 0, damage: 0, perWave: [] };

  while (game.phase !== 'finished') {
    for (const id of ids) {
      spendGold(game, id);
      placeSmart(game, id);
      resolveRound(game, id, rng);
    }
    const testWave = game.testAt !== null;
    L.startWave(game, { rng });
    let guard = 0;
    while (!L.tick(game, 0.1, rng).done && guard++ < 40000);
    const sims = ids.map(id => game.players[id].sim);
    const spawned = sims.reduce((n, sm) => n + sm.spawned + sm.splits, 0);
    const leaked = sims.reduce((n, sm) => n + sm.leaked, 0);
    const boss = sims.some(sm => sm.def.groups.some(g => C.MONSTERS[g.type].boss));
    if (!testWave) {
      if (boss) { out.bossWaves += 1; out.bossLeaks += leaked; } else { out.spawned += spawned; out.leaked += leaked; }
      out.perWave.push({ wave: game.wave + 1, spawned, leaked, boss });
    }
    L.finishWave(game, { now: 1, rng });
  }
  return out;
}

// 調係數：RELAY_HP=3 RELAY_STEP=0.25 RELAY_BOSS=0.8 node gem-td/balanceSim.js relay 6 50 easy（只在這次執行有效）
// RELAY_HP＝單區基準倍數（預設 = 走過的區數），RELAY_STEP＝每多一位真人加的比例
function runRelay(rounds, waves, difficulty) {
  const step = process.env.RELAY_STEP ? Number(process.env.RELAY_STEP) : C.RELAY_PLAYER_HP_STEP;
  if (process.env.RELAY_HP || process.env.RELAY_STEP) {
    const hp = Number(process.env.RELAY_HP ?? C.RELAY_GROUP_HP_MULT);
    C.relayGroupHpMult = zones => hp * (C.relayPasses(zones) / C.RELAY_PASSES) * (1 + step * Math.max(0, zones - 1));
  }
  if (process.env.RELAY_BOSS) C.RELAY_BOSS_HP_MULT = Number(process.env.RELAY_BOSS);
  console.log(`環形接力平衡（${waves} 波、${difficulty}、每組 ${rounds} 局，血量不歸零）；漏怪率 = 離場蟲 ÷ 出過的蟲，不含首領`);
  console.log(`群血量 ×${C.RELAY_GROUP_HP_MULT}（每多一人 +${step * 100}%）、首領 ×${C.RELAY_BOSS_HP_MULT}`);
  console.log('區域數  漏怪率   相對單人  前半段  後半段   首領漏出（次/首領波）');
  let base = null;
  for (let zones = 1; zones <= C.MAX_ZONES; zones++) {
    let spawned = 0; let leaked = 0; let bossLeaks = 0; let bossWaves = 0;
    const half = { early: [0, 0], late: [0, 0] };
    for (let seed = 1; seed <= rounds; seed++) {
      const r = playRelay({ zones, waves, seed, difficulty });
      spawned += r.spawned; leaked += r.leaked; bossLeaks += r.bossLeaks; bossWaves += r.bossWaves;
      for (const w of r.perWave.filter(x => !x.boss)) {
        const bucket = w.wave <= waves / 2 ? half.early : half.late;
        bucket[0] += w.spawned; bucket[1] += w.leaked;
      }
    }
    const rate = leaked / spawned;
    if (zones === 1) base = rate;
    const pct = v => `${(v * 100).toFixed(1)}%`;
    const bucketRate = ([n, l]) => (n ? l / n : 0);
    console.log(`${zones}       ${pct(rate).padStart(6)}   ${(base ? rate / base : 1).toFixed(2).padStart(6)}   ${pct(bucketRate(half.early)).padStart(6)}  ${pct(bucketRate(half.late)).padStart(6)}   ${bossWaves ? (bossLeaks / bossWaves).toFixed(2) : '-'}`);
  }
}

// ── 合作迷宮 ─────────────────────────────────────────────────────
// 機器人用 instant 放置（建造者走路與施工時間不影響數值），兩種打法：
//   corridor：沿著現有路線兩側蓋塔，不堵路（baseline）
//   turtle  ：先用餅乾牆把整排堵死（要靠 breach 才打得通），再把塔蓋在突破點附近
// 看的是通關率、平均到達波數、牆被打破的次數；多人共用一張圖，所以總火力隨人數成長，血量加成 hpPerPlayer 要把它抵消掉
const TURTLE_ROW_OFFSET = 1; // 第 1 組路徑點列與第 2 組之間的那一排

function coopCandidates(game, strategy) {
  const { board } = game;
  const waypoints = new Set([board.start, board.end, ...board.checkpoints].map(c => `${c.x},${c.y}`));
  const inBoard = (x, y) => x >= 0 && y >= 0 && x < board.width && y < board.height;
  const route = game.shared.path;
  const onPath = new Set(route.map(c => `${c.x},${c.y}`));
  let focus = null; // turtle：塔往突破點靠
  const rows = [];
  if (strategy === 'turtle') {
    const ys = [board.start, ...board.checkpoints, board.end].map(c => c.y);
    const wallY = Math.round((ys[TURTLE_ROW_OFFSET] + ys[TURTLE_ROW_OFFSET + 1]) / 2);
    for (let x = 0; x < board.width; x++) rows.push({ x, y: wallY });
    const breach = game.shared.route?.breaches?.[0];
    focus = breach ?? { x: Math.floor(board.width / 2), y: wallY };
  }
  const seen = new Set();
  const cells = [];
  const add = (x, y) => {
    const key = `${x},${y}`;
    if (!inBoard(x, y) || seen.has(key) || waypoints.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };
  for (const c of rows) add(c.x, c.y);
  const near = [];
  route.forEach((c, i) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      if (inBoard(x, y) && !onPath.has(`${x},${y}`)) near.push({ x, y, i });
    }
  });
  const ranked = strategy === 'turtle'
    ? near.sort((a, b) => Math.hypot(a.x - focus.x, a.y - focus.y) - Math.hypot(b.x - focus.x, b.y - focus.y))
    : near.sort((a, b) => a.i - b.i);
  for (const c of ranked) add(c.x, c.y);
  return cells;
}

function placeCoop(game, id, strategy) {
  const p = game.players[id];
  const cells = coopCandidates(game, strategy);
  for (const c of cells) {
    if (!p.pending.length) return;
    if (game.shared.grid.has(`${c.x},${c.y}`)) continue;
    try { L.placeGem(game, id, p.pending[0].slot, c.x, c.y); } catch (err) { if (!(err instanceof L.GameError)) throw err; }
  }
}

function playCoop({ players, waves, difficulty, strategy, seed }) {
  const rng = seededRng(seed);
  const game = L.createGame();
  game.options = L.resolveOptions({ mode: 'coop', waves, difficulty, buildSeconds: 0, buildMode: 'instant' });
  const ids = Array.from({ length: players }, (_, i) => `p${i}`);
  L.startGame(game, ids, { now: 0, rng });
  let breaks = 0;
  while (game.phase !== 'finished') {
    for (const id of ids) {
      spendGold(game, id);
      placeCoop(game, id, strategy);
      resolveRound(game, id, rng);
    }
    L.startWave(game, { rng });
    let guard = 0;
    for (let r = L.tick(game, 0.1, rng); !r.done && guard++ < 60000; r = L.tick(game, 0.1, rng)) if (r.changed) breaks += 1;
    L.finishWave(game, { now: 0, rng });
  }
  return { ...game.result, breaks };
}

// 調參：COOP_HP=0.8 COOP_WALL_HP=150 COOP_WALL_WAVE=40 COOP_TOWER_MULT=5 COOP_DPS=8 node gem-td/balanceSim.js coop 4 15 easy
function runCoop(rounds, waves, difficulty) {
  const env = { hpPerPlayer: 'COOP_HP', wallHpBase: 'COOP_WALL_HP', wallHpPerWave: 'COOP_WALL_WAVE', towerHpMult: 'COOP_TOWER_MULT', breachDps: 'COOP_DPS' };
  for (const [key, name] of Object.entries(env)) if (process.env[name]) C.COOP[key] = Number(process.env[name]);
  if (process.env.COOP_MULT2) C.COOP.hpMults[2] = Number(process.env.COOP_MULT2); // 直接指定 2 人／3 人的血量倍數
  if (process.env.COOP_MULT3) C.COOP.hpMults[3] = Number(process.env.COOP_MULT3);
  console.log(`合作迷宮平衡（${waves} 波、${difficulty}、每組 ${rounds} 局）`);
  console.log(`血量倍數 2 人 ×${C.coopHpMult(2).toFixed(2)}、3 人 ×${C.coopHpMult(3).toFixed(2)}；牆血量 ${C.COOP.wallHpBase}+${C.COOP.wallHpPerWave}×波、塔 ×${C.COOP.towerHpMult}、每蟲每秒 ${C.COOP.breachDps}`);
  console.log('人數  打法      通關率  平均到達波數  平均剩餘血量  每局牆被打破次數');
  for (const players of [2, 3]) {
    for (const strategy of ['corridor', 'turtle']) {
      let wins = 0; let reached = 0; let lives = 0; let breaks = 0;
      for (let seed = 1; seed <= rounds; seed++) {
        const r = playCoop({ players, waves, difficulty, strategy, seed });
        if (r.win) wins += 1;
        reached += r.wave;
        lives += r.lives ?? 0;
        breaks += r.breaks;
      }
      console.log(`${players}     ${strategy.padEnd(8)}  ${String(Math.round((wins / rounds) * 100)).padStart(3)}%    ${(reached / rounds).toFixed(1).padStart(6)}        ${(lives / rounds).toFixed(1).padStart(6)}        ${(breaks / rounds).toFixed(1)}`);
    }
  }
}

// 單人基準（現有模式、同一個機器人）：合作迷宮要跟它比。node gem-td/balanceSim.js base 4 30 easy
function runBase(rounds, waves, difficulty) {
  console.log(`單人基準（${waves} 波、${difficulty}、每組 ${rounds} 局，25×25 經典圖）`);
  console.log('人數  通關率  平均到達波數  平均剩餘血量');
  for (const players of [1, 2]) {
    let wins = 0; let reached = 0; let lives = 0;
    for (let seed = 1; seed <= rounds; seed++) {
      const r = playGame({ players, waves, livesMode: 'team', seed, difficulty });
      if (r.win) wins += 1;
      reached += r.wave;
      lives += r.lives ?? 0;
    }
    console.log(`${players}     ${String(Math.round((wins / rounds) * 100)).padStart(3)}%    ${(reached / rounds).toFixed(1).padStart(6)}        ${(lives / rounds).toFixed(1).padStart(6)}`);
  }
}

if (process.argv[2] === 'base') runBase(Number(process.argv[3]) || 3, Number(process.argv[4]) || 30, process.argv[5] || 'easy');
else if (process.argv[2] === 'coop') runCoop(Number(process.argv[3]) || 3, Number(process.argv[4]) || 15, process.argv[5] || 'easy');
else if (process.argv[2] === 'relay') runRelay(Number(process.argv[3]) || 3, Number(process.argv[4]) || 30, process.argv[5] || 'easy');
else run(Number(process.argv[2]) || 5);
