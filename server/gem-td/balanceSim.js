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

function playGame({ players, waves, livesMode, seed }) {
  const rng = seededRng(seed);
  const game = L.createGame();
  game.options = { ...game.options, waves, livesMode, buildSeconds: 0 };
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
  console.log('人數  模式  波數  勝率   平均到達波數');
  for (const waves of C.WAVE_CHOICES) {
    for (const [players, livesMode] of [[1, 'team'], [2, 'team'], [4, 'team'], [2, 'solo'], [4, 'solo']]) {
      let wins = 0; let reached = 0;
      for (let seed = 1; seed <= rounds; seed++) {
        const result = playGame({ players, waves, livesMode, seed });
        if (result.win) wins += 1;
        reached += result.wave;
      }
      console.log(`${players}     ${livesMode}  ${waves}    ${String(Math.round((wins / rounds) * 100)).padStart(3)}%   ${(reached / rounds).toFixed(1)}`);
    }
  }
}

run(Number(process.argv[2]) || 5);
