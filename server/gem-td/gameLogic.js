'use strict';

// ================================================================
//  甜點守衛戰（gem-td）— 純遊戲邏輯（不碰 socket / DB / 計時器，方便單元測試）
//
//  規格：docs/gem-td-spec.md
//  - 回合循環：建造（放 5 顆 → 保留 / 合成）→ 全員準備 → 出怪 → 下一回合
//  - 每人一張地圖：塔、路線、波次、金幣、品質、手上的寶石都獨立
//  - 血量模式：team 全隊共用；solo 各自計算，歸零的人出局，其他人繼續
//  - 放下的寶石就是障礙物，不能封死「起點 → 路徑點 1~5 → 終點」
//  - rng 與 now 由呼叫端注入；函式直接修改傳入的 game；違規丟 GameError
// ================================================================

const C = require('./config');
const { findFullPath } = require('./pathing');
const { createWave, stepWave, buildSimFrame } = require('./waveSim');

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const keyOf = (x, y) => `${x},${y}`;

// ── 建立 / 重置 ─────────────────────────────────────────────────
function blankRun() {
  return {
    wave: 0, // 已打完的波數
    lives: C.START_LIVES,
    board: null,
    nextTowerId: 1,
    players: {},
    playerIds: [],
    startCount: 0, // 開局人數；獨立血量多人局剩一人時判定勝負
    buildEndsAt: null,
    speed: 1,
    result: null,
  };
}

function createGame() {
  return { phase: 'waiting', options: { ...C.DEFAULT_OPTIONS }, ...blankRun() };
}

function resetGame(game) {
  Object.assign(game, { phase: 'waiting', ...blankRun() });
}

function resolveOptions(raw = {}) {
  return {
    waves: C.WAVE_CHOICES.includes(raw.waves) ? raw.waves : C.DEFAULT_OPTIONS.waves,
    buildSeconds: C.BUILD_SECOND_CHOICES.includes(raw.buildSeconds) ? raw.buildSeconds : C.DEFAULT_OPTIONS.buildSeconds,
    livesMode: C.LIVES_MODES.includes(raw.livesMode) ? raw.livesMode : C.DEFAULT_OPTIONS.livesMode,
  };
}

function makeBoard() {
  const size = C.BOARD_SIZE;
  const toCell = ([rx, ry]) => ({ x: Math.round(rx * (size - 1)), y: Math.round(ry * (size - 1)) });
  return {
    width: size,
    height: size,
    start: toCell(C.WAYPOINTS.start),
    checkpoints: C.WAYPOINTS.checkpoints.map(toCell),
    end: toCell(C.WAYPOINTS.end),
  };
}

function isWaypoint(board, x, y) {
  return [board.start, board.end, ...board.checkpoints].some(p => p.x === x && p.y === y);
}

function rollLevel(quality, rng) {
  const weights = C.QUALITY_RATES[quality - 1];
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i + 1;
  }
  return weights.findLastIndex(w => w > 0) + 1;
}

function rollGems(quality, rng) {
  const kinds = Object.keys(C.GEMS);
  return Array.from({ length: C.GEMS_PER_ROUND }, (_, slot) => ({
    slot,
    kind: kinds[Math.floor(rng() * kinds.length)],
    level: rollLevel(quality, rng),
  }));
}

function refreshPath(game, p) {
  p.path = findFullPath(game.board, (x, y) => p.grid.has(keyOf(x, y))) ?? p.path;
}

const isTeam = game => game.options.livesMode === 'team';
// 每張地圖都會漏怪，共用血量跟著人數加，每張地圖分到的血量才跟單人一樣
const maxLives = game => (isTeam(game) ? C.START_LIVES * Math.max(1, game.startCount) : C.START_LIVES);
const livesPool = (game, p) => (isTeam(game) ? game : p);
const activeIds = game => game.playerIds.filter(id => !game.players[id].out);

function enterBuild(game, { now, rng }) {
  game.phase = 'build';
  game.buildEndsAt = game.options.buildSeconds ? now + game.options.buildSeconds * 1000 : null;
  for (const id of game.playerIds) game.players[id].sim = null;
  for (const id of activeIds(game)) {
    const p = game.players[id];
    p.pending = rollGems(p.quality, rng);
    p.resolved = false;
    p.ready = false;
  }
}

function startGame(game, ids, { now, rng = Math.random }) {
  if (game.phase !== 'waiting') throw new GameError('BAD_PHASE', '遊戲已經開始了');
  if (ids.length < C.MIN_PLAYERS || ids.length > C.MAX_PLAYERS) {
    throw new GameError('BAD_PLAYER_COUNT', `需要 ${C.MIN_PLAYERS}～${C.MAX_PLAYERS} 位玩家`);
  }
  Object.assign(game, blankRun());
  game.playerIds = [...ids];
  game.startCount = ids.length;
  game.lives = maxLives(game);
  game.board = makeBoard();
  for (const id of ids) {
    const p = {
      gold: C.START_GOLD, quality: 1, research: { damage: 0, speed: 0, range: 0 }, pending: [], resolved: false, ready: false,
      lives: C.START_LIVES, out: false, outWave: 0,
      towers: [],
      grid: new Map(), // "x,y" → tower
      path: [],
      sim: null,
    };
    game.players[id] = p;
    refreshPath(game, p);
  }
  enterBuild(game, { now, rng });
}

// ── 檢查工具 ────────────────────────────────────────────────────
function playerOf(game, playerId) {
  const p = game.players[playerId];
  if (!p || !game.playerIds.includes(playerId)) throw new GameError('NOT_PLAYER', '你不在這場遊戲中');
  if (p.out) throw new GameError('PLAYER_OUT', '你已經出局了');
  return p;
}

function requireBuild(game) {
  if (game.phase !== 'build') throw new GameError('BAD_PHASE', '只有建造階段可以這樣做');
}

function towerById(p, id) {
  return p.towers.find(t => t.id === id) ?? null;
}

const freshOf = p => p.towers.filter(t => t.fresh);
const isGem = t => t.kind !== 'stone';

function toStone(t) {
  t.kind = 'stone';
  t.level = 0;
  t.fresh = false;
}

function spend(p, cost) {
  if (p.gold < cost) throw new GameError('NO_GOLD', `金幣不足，需要 ${cost}`);
  p.gold -= cost;
}

// ── 放置 ────────────────────────────────────────────────────────
function placeGem(game, playerId, slot, x, y) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  const index = p.pending.findIndex(g => g.slot === slot);
  if (index < 0) throw new GameError('BAD_SLOT', '這個甜點已經放下了');
  const { board } = game;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= board.width || y >= board.height) {
    throw new GameError('BAD_CELL', '超出地圖範圍');
  }
  if (isWaypoint(board, x, y)) throw new GameError('BAD_CELL', '路徑點不能擺放');
  const key = keyOf(x, y);
  if (p.grid.has(key)) throw new GameError('BAD_CELL', '這格已經有東西了');

  p.grid.set(key, true);
  const path = findFullPath(board, (cx, cy) => p.grid.has(keyOf(cx, cy)));
  if (!path) {
    p.grid.delete(key);
    throw new GameError('PATH_BLOCKED', '不能封死怪物的路線');
  }

  const { kind, level } = p.pending[index];
  const tower = { id: game.nextTowerId++, x, y, kind, level, owner: playerId, fresh: true, kills: 0, damage: 0 };
  p.towers.push(tower);
  p.grid.set(key, tower);
  p.path = path;
  p.pending.splice(index, 1);
  return tower;
}

// ── 保留 / 同級合成 ─────────────────────────────────────────────
function requireChoosing(game, playerId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (p.resolved) throw new GameError('ALREADY_RESOLVED', '這回合已經選好了');
  if (p.pending.length) throw new GameError('NOT_PLACED', '請先放完所有甜點');
  return p;
}

function freshTower(p, towerId) {
  const t = towerById(p, towerId);
  if (!t || !t.fresh) throw new GameError('BAD_TOWER', '只能選擇本回合放下的甜點');
  return t;
}

function finishRound(p) {
  for (const t of freshOf(p)) toStone(t);
  p.resolved = true;
}

function keepGem(game, playerId, towerId) {
  const p = requireChoosing(game, playerId);
  const t = freshTower(p, towerId);
  t.fresh = false;
  finishRound(p);
}

// 本回合有幾顆同種同級 → 可升幾級（2 顆 +1、4 顆 +2）
function mergeGain(p, t) {
  const same = freshOf(p).filter(o => o.kind === t.kind && o.level === t.level).length;
  const gain = same >= 4 ? 2 : same >= 2 ? 1 : 0;
  return Math.min(gain, C.MAX_LEVEL - t.level);
}

function mergeGem(game, playerId, towerId) {
  const p = requireChoosing(game, playerId);
  const t = freshTower(p, towerId);
  const gain = mergeGain(p, t);
  if (gain <= 0) throw new GameError('CANNOT_MERGE', '需要 2 個同種同級的甜點才能合成');
  t.level += gain;
  t.fresh = false;
  finishRound(p);
}

// ── 特殊塔配方 ──────────────────────────────────────────────────
// 材料 = 自己場上保留的寶石 + 已放完的本回合寶石。
// 門檻高的材料先配，且優先用本回合的（反正會變石頭）與低等的，保住高等塔。
function matchRecipe(p, recipe) {
  const pool = p.towers.filter(t => isGem(t) && (!t.fresh || !p.pending.length));
  const score = t => (t.fresh ? 0 : 100) + t.level;
  pool.sort((a, b) => score(a) - score(b));

  const used = [];
  const strictFirst = [...recipe.ingredients].sort((a, b) => (b.minLevel ?? 0) - (a.minLevel ?? 0));
  for (const need of strictFirst) {
    const found = pool.find(t => !used.includes(t) && t.kind === need.kind && t.level >= (need.minLevel ?? 0));
    if (!found) return null;
    used.push(found);
  }
  return used;
}

function availableRecipes(game, playerId) {
  const p = game.players[playerId];
  return C.RECIPES.flatMap((recipe) => {
    const used = matchRecipe(p, recipe);
    return used ? [{ id: recipe.id, towerIds: used.map(t => t.id) }] : [];
  });
}

function combine(game, playerId, recipeId, atTowerId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  const recipe = C.RECIPES.find(r => r.id === recipeId);
  if (!recipe) throw new GameError('BAD_RECIPE', '沒有這個配方');
  const used = matchRecipe(p, recipe);
  if (!used) throw new GameError('MISSING_INGREDIENTS', '材料不足');

  // 特殊塔出現在指定的材料位置；升級時留在原本的特殊塔上
  const base = used.find(t => t.id === atTowerId)
    ?? used.find(t => C.SPECIALS[t.kind])
    ?? used[0];
  const usedFresh = used.some(t => t.fresh);

  for (const t of used) if (t !== base) toStone(t);
  base.kind = recipe.result;
  base.level = C.SPECIALS[recipe.result].tier;
  base.fresh = false;

  if (usedFresh) finishRound(p);
  return base;
}

// ── 商店 ────────────────────────────────────────────────────────
function upgradeQuality(game, playerId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (p.quality >= C.QUALITY_RATES.length) throw new GameError('MAX_QUALITY', '品質已達上限');
  spend(p, C.QUALITY_COSTS[p.quality - 1]);
  p.quality += 1;
}

function upgradeResearch(game, playerId, track) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (!Object.hasOwn(C.RESEARCH, track)) throw new GameError('BAD_ARG', '沒有這項研究');
  const level = p.research[track];
  if (level >= C.RESEARCH_COSTS.length) throw new GameError('MAX_RESEARCH', '這項研究已達上限');
  spend(p, C.RESEARCH_COSTS[level]);
  p.research[track] = level + 1;
}

function removeStone(game, playerId, towerId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  const t = towerById(p, towerId);
  if (!t || t.kind !== 'stone') throw new GameError('BAD_TOWER', '只能拆除自己地圖上的餅乾牆');
  spend(p, C.REMOVE_STONE_COST);
  p.towers = p.towers.filter(o => o !== t);
  p.grid.delete(keyOf(t.x, t.y));
  refreshPath(game, p);
}

// 把自己的塔跟一顆石頭對調位置（路線不受影響：兩格都還是障礙物）
function swapWithStone(game, playerId, towerId, stoneId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  const t = towerById(p, towerId);
  const stone = towerById(p, stoneId);
  if (!t || !isGem(t) || t.fresh) throw new GameError('BAD_TOWER', '只能移動自己保留的塔');
  if (!stone || stone.kind !== 'stone') throw new GameError('BAD_TOWER', '只能跟餅乾牆交換位置');
  spend(p, C.SWAP_COST);
  [t.x, stone.x] = [stone.x, t.x];
  [t.y, stone.y] = [stone.y, t.y];
  p.grid.set(keyOf(t.x, t.y), t);
  p.grid.set(keyOf(stone.x, stone.y), stone);
}

// ── 準備 / 開波 ─────────────────────────────────────────────────
function setReady(game, playerId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (!p.resolved) throw new GameError('NOT_RESOLVED', '請先決定要保留哪個甜點');
  p.ready = true;
}

function allReady(game, onlineIds) {
  const online = activeIds(game).filter(id => onlineIds.includes(id));
  return online.length > 0 && online.every(id => game.players[id].ready);
}

// 時間到還沒選完：剩下的寶石隨機放，保留等級最高的（能合成就合成）
function autoResolve(game, playerId, rng = Math.random) {
  const p = game.players[playerId];
  if (p.resolved) return;
  const { width, height } = game.board;

  while (p.pending.length) {
    const { slot } = p.pending[0];
    let placed = false;
    for (let attempt = 0; attempt < 80 && !placed; attempt++) {
      try {
        placeGem(game, playerId, slot, Math.floor(rng() * width), Math.floor(rng() * height));
        placed = true;
      } catch (err) {
        if (!(err instanceof GameError)) throw err;
      }
    }
    if (!placed) p.pending.shift(); // 地圖滿了：這顆作廢
  }

  const fresh = freshOf(p);
  if (!fresh.length) { p.resolved = true; return; }
  const best = fresh.reduce((a, b) => (
    b.level + mergeGain(p, b) > a.level + mergeGain(p, a) ? b : a
  ));
  if (mergeGain(p, best) > 0) mergeGem(game, playerId, best.id);
  else keepGem(game, playerId, best.id);
}

function startWave(game, { rng = Math.random } = {}) {
  requireBuild(game);
  for (const id of activeIds(game)) autoResolve(game, id, rng);
  game.phase = 'wave';
  game.buildEndsAt = null;
  for (const id of activeIds(game)) {
    const p = game.players[id];
    p.sim = createWave({
      board: game.board,
      towers: p.towers,
      path: p.path,
      wave: game.wave + 1,
      totalWaves: game.options.waves,
      pool: livesPool(game, p),
      research: p.research,
    });
  }
}

function setSpeed(game, speed) {
  if (speed !== 1 && speed !== 2) throw new GameError('BAD_ARG', '不支援的速度');
  game.speed = speed;
}

// 勝負是否已定：回傳贏家名單，還沒分出來回傳 null
function decidedWinners(game) {
  if (isTeam(game)) return game.lives <= 0 ? [] : null;
  const alive = activeIds(game);
  if (!alive.length) return [];
  return game.startCount > 1 && alive.length === 1 ? alive : null;
}

function eliminate(game, id) {
  const p = game.players[id];
  p.out = true;
  p.outWave = game.wave + 1;
  p.ready = false;
  p.sim.monsters = [];
  p.sim.done = true;
}

// 前進 dt 秒。done：所有地圖都打完或勝負已定（結算由 finishWave 處理）；out：這一步出局的玩家
function tick(game, dt, rng = Math.random) {
  if (game.phase !== 'wave') return { done: false, out: [] };
  const out = [];
  for (const id of activeIds(game)) {
    const p = game.players[id];
    if (!p.sim.done) p.sim.done = stepWave(p.sim, dt, rng);
    if (!isTeam(game) && p.lives <= 0) {
      eliminate(game, id);
      out.push(id);
    }
  }
  const done = decidedWinners(game) !== null || activeIds(game).every(id => game.players[id].sim.done);
  return { done, out };
}

function buildResult(game, winnerIds) {
  const scores = game.playerIds.map((id) => {
    const p = game.players[id];
    return {
      id,
      lives: p.lives,
      out: p.out,
      outWave: p.outWave,
      kills: p.towers.reduce((n, t) => n + t.kills, 0),
      damage: Math.round(p.towers.reduce((n, t) => n + t.damage, 0)),
    };
  }).sort((a, b) => (isTeam(game) ? 0 : b.lives - a.lives || b.outWave - a.outWave) || b.damage - a.damage);
  const top = game.playerIds
    .flatMap(id => game.players[id].towers)
    .reduce((a, t) => (!a || t.damage > a.damage ? t : a), null);
  return {
    win: winnerIds.length > 0,
    winnerIds,
    versus: !isTeam(game) && game.startCount > 1,
    wave: game.wave,
    lives: isTeam(game) ? game.lives : Math.max(0, ...game.playerIds.map(id => game.players[id].lives)),
    scores,
    topTower: top && top.damage > 0
      ? { kind: top.kind, level: top.level, owner: top.owner, kills: top.kills, damage: Math.round(top.damage) }
      : null,
  };
}

function finishGame(game, winnerIds) {
  game.phase = 'finished';
  game.buildEndsAt = null;
  for (const id of game.playerIds) game.players[id].sim = null;
  game.result = buildResult(game, winnerIds);
}

// 打完最後一波：共用血量全隊贏；獨立血量比剩餘血量，同分並列
function lastWaveWinners(game) {
  const alive = activeIds(game);
  if (isTeam(game)) return alive;
  const best = Math.max(...alive.map(id => game.players[id].lives));
  return alive.filter(id => game.players[id].lives === best);
}

function finishWave(game, { now, rng = Math.random }) {
  if (game.phase !== 'wave') return { finished: game.phase === 'finished' };

  const winners = decidedWinners(game);
  if (winners) {
    finishGame(game, winners);
    return { finished: true };
  }

  game.wave += 1;
  const bonus = C.waveClearBonus(game.wave);
  for (const id of activeIds(game)) {
    const p = game.players[id];
    p.gold += p.sim.earned + bonus + C.interestOn(p.gold);
  }

  if (game.wave >= game.options.waves) {
    finishGame(game, lastWaveWinners(game));
    return { finished: true };
  }
  enterBuild(game, { now, rng });
  return { finished: false };
}

function finishNow(game) {
  if (game.phase !== 'build' && game.phase !== 'wave') throw new GameError('BAD_PHASE', '目前沒有進行中的遊戲');
  finishGame(game, []);
}

// 玩家離開：他的地圖跟著收掉；回傳剩餘人數。波次中的勝負由下一次 tick 判定
function leavePlayer(game, playerId) {
  if (!game.playerIds.includes(playerId)) return { changed: false, remaining: game.playerIds.length, finished: false };
  game.playerIds = game.playerIds.filter(id => id !== playerId);
  const winners = game.phase === 'build' && game.playerIds.length ? decidedWinners(game) : null;
  if (winners) finishGame(game, winners);
  return { changed: true, remaining: game.playerIds.length, finished: !!winners };
}

// ── 視圖 ────────────────────────────────────────────────────────
function towerView(t) {
  return { id: t.id, x: t.x, y: t.y, kind: t.kind, level: t.level, owner: t.owner, fresh: t.fresh, kills: t.kills, damage: Math.round(t.damage) };
}

function meView(game, playerId) {
  if (!game.playerIds.includes(playerId)) return null;
  const p = game.players[playerId];
  const fresh = freshOf(p);
  const choosing = !p.out && !p.resolved && !p.pending.length && game.phase === 'build';
  return {
    gold: p.gold,
    quality: p.quality,
    research: p.research,
    out: p.out,
    pending: p.pending,
    resolved: p.resolved,
    ready: p.ready,
    choosing,
    towers: p.towers.map(towerView), // 看別人的地圖時，面板與合成表仍以自己的塔為準
    fresh: fresh.map(t => ({
      id: t.id,
      mergeGain: choosing ? mergeGain(p, t) : 0,
    })),
    recipes: game.phase === 'build' && !p.out ? availableRecipes(game, playerId) : [],
  };
}

// 這位觀看者要看哪張地圖：指定的玩家 > 自己 > 第一位玩家
function resolveWatch(game, viewerId, watchId) {
  if (game.playerIds.includes(watchId)) return watchId;
  if (game.playerIds.includes(viewerId)) return viewerId;
  return game.playerIds[0] ?? null;
}

function buildView(game, viewerId, watchId) {
  const nextWave = game.phase === 'finished' || !game.board ? null : (() => {
    const number = game.wave + 1;
    const def = C.waveDef(number, game.options.waves);
    const groups = def.groups.map(g => ({ type: g.type, count: g.count, hp: g.hp, armor: Math.round(g.armor), trait: g.trait }));
    return { number, type: def.type, count: def.count, hp: def.hp, armor: Math.round(def.armor), groups };
  })();
  const watching = resolveWatch(game, viewerId, watchId);
  const field = game.players[watching];

  return {
    phase: game.phase,
    options: game.options,
    wave: game.wave,
    lives: game.lives,
    maxLives: maxLives(game),
    board: game.board,
    watching,
    towers: field ? field.towers.map(towerView) : [],
    path: field ? field.path : [],
    buildEndsAt: game.buildEndsAt,
    serverNow: null, // index.js 填入
    speed: game.speed,
    nextWave,
    result: game.result,
    playerIds: game.playerIds,
    players: Object.fromEntries(game.playerIds.map((id) => {
      const p = game.players[id];
      return [id, {
        quality: p.quality, resolved: p.resolved, ready: p.ready,
        placed: C.GEMS_PER_ROUND - p.pending.length,
        lives: livesPool(game, p).lives, out: p.out,
      }];
    })),
    me: viewerId ? meView(game, viewerId) : null,
  };
}

// 波次快照：每張地圖一份；players 是所有人的摘要，讓看別人地圖時也知道自己的進度
function buildFrames(game) {
  const ids = game.playerIds.filter(id => game.players[id].sim);
  const players = Object.fromEntries(ids.map((id) => {
    const p = game.players[id];
    const { earned, killed, leaked, done } = p.sim;
    return [id, { lives: livesPool(game, p).lives, earned, killed, leaked, done }];
  }));
  return Object.fromEntries(ids.map((id) => {
    const { sim } = game.players[id];
    return [id, { owner: id, wave: sim.wave, total: sim.def.count + sim.splits, players, ...buildSimFrame(sim) }];
  }));
}

module.exports = {
  GameError,
  MIN_PLAYERS: C.MIN_PLAYERS,
  MAX_PLAYERS: C.MAX_PLAYERS,
  catalog: C.catalog,
  createGame, resetGame, resolveOptions, startGame,
  placeGem, keepGem, mergeGem, combine, availableRecipes,
  upgradeQuality, upgradeResearch, removeStone, swapWithStone,
  setReady, allReady, autoResolve, startWave, setSpeed, tick, finishWave, finishNow,
  leavePlayer, resolveWatch, buildView, buildFrames,
};
