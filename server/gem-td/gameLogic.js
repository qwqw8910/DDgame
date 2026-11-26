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
const { findFullPath, findFullRoute } = require('./pathing');
const { createWave, stepWave, buildSimFrame, castSkill: simCastSkill, skillCooldowns } = require('./waveSim');
const { ringLayout } = require('./ringLayout');
const B = require('./builder');
const R = require('./relay');

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
    startCount: 0, // 開局人數（環形接力是區域數）；獨立血量多人局剩一人時判定勝負
    humanIds: [], // 開局的真人（環形接力的其餘區域由假人控制）
    shared: null, // 合作迷宮：全隊共用的棋盤 { grid, path, sim, skillCd, leaked }；其他模式是 null
    ring: null, // 環形接力（區域數 ≥ 2）：{ layout, events, hub }；單人模式與區域數 1 是 null
    devBoss: false, // 開發測試：下一波改成繞全圈的首領，不推進波數
    tainted: false, // 用過開發測試功能：不列入排行榜
    pendingWinners: null, // 打完所有波次時的勝負；最後的傷害測試結束後才結算
    testAt: null, // 正在進行（或準備進行）的傷害測試，是打完第幾波之後的加賽；沒有就是 null
    buildEndsAt: null,
    speed: 1,
    paused: false, // 單人遊戲可暫停
    pausedLeft: null, // 暫停時建造階段剩下的毫秒數
    startedAt: null, // 開局時間（毫秒），算通關時間用
    pausedMs: 0, // 累計暫停的毫秒數，不計入通關時間
    pausedSince: null,
    aborted: false, // 房主提早結束：不列入排行榜
    finishedAt: null,
    records: null,
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
  const mode = C.MODES.includes(raw.mode) ? raw.mode : C.DEFAULT_OPTIONS.mode;
  return {
    mode,
    zones: Number.isInteger(raw.zones) && raw.zones >= C.MIN_ZONES && raw.zones <= C.MAX_ZONES ? raw.zones : C.DEFAULT_OPTIONS.zones,
    waves: C.WAVE_CHOICES.includes(raw.waves) ? raw.waves : C.DEFAULT_OPTIONS.waves,
    buildSeconds: C.BUILD_SECOND_CHOICES.includes(raw.buildSeconds) ? raw.buildSeconds : C.DEFAULT_OPTIONS.buildSeconds,
    // 環形接力與合作迷宮強制共用血量
    livesMode: mode === 'relay' || mode === 'coop' ? 'team' : C.LIVES_MODES.includes(raw.livesMode) ? raw.livesMode : C.DEFAULT_OPTIONS.livesMode,
    difficulty: C.DIFFICULTY_IDS.includes(raw.difficulty) ? raw.difficulty : C.DEFAULT_OPTIONS.difficulty,
    // 合作迷宮先不做傷害測試（成績不列入排行榜）
    damageTest: mode === 'coop' ? false : typeof raw.damageTest === 'boolean' ? raw.damageTest : C.DEFAULT_OPTIONS.damageTest,
    // 地圖：0~MAP_COUNT-1 指定一張，'random' 每局隨機（環形接力開局時固定用 0 號）
    // 合作迷宮的建造方式：builder = 建造者走到現場施工；instant = 點了立刻蓋好
    ...(mode === 'coop' ? { buildMode: C.COOP.buildModes.includes(raw.buildMode) ? raw.buildMode : C.COOP.buildMode } : {}),
    map: raw.map === 'random' || (Number.isInteger(raw.map) && raw.map >= 0 && raw.map < C.MAP_COUNT) ? raw.map : C.DEFAULT_OPTIONS.map,
  };
}

function makeBoard(mapId = 0) {
  const map = C.MAP_LAYOUTS[mapId] ?? C.MAP_LAYOUTS[0];
  const size = C.BOARD_SIZE;
  const toCell = ([rx, ry]) => ({ x: Math.round(rx * (size - 1)), y: Math.round(ry * (size - 1)) });
  return {
    width: size,
    height: size,
    mapId: map.id,
    mapName: map.name,
    start: toCell(map.start),
    checkpoints: map.checkpoints.map(toCell),
    end: toCell(map.end),
  };
}

// 合作迷宮的大地圖：尺寸與路徑點數依人數而定
function makeCoopBoard(playerCount) {
  const size = C.COOP.sizes[playerCount] ?? C.COOP.sizes[2];
  const layout = C.coopLayout(playerCount);
  const toCell = ([rx, ry]) => ({ x: Math.round(rx * (size - 1)), y: Math.round(ry * (size - 1)) });
  return {
    width: size,
    height: size,
    mapId: layout.id,
    mapName: layout.name,
    start: toCell(layout.start),
    checkpoints: layout.checkpoints.map(toCell),
    end: toCell(layout.end),
  };
}

function isWaypoint(board, x, y) {
  return [board.start, board.end, ...board.checkpoints].some(p => p.x === x && p.y === y);
}

const rollLevel = (quality, rng, boost = 0) => rollLevelWith(C.QUALITY_RATES[Math.min(quality + boost, C.QUALITY_RATES.length) - 1], rng);

function rollLevelWith(weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i + 1;
  }
  return weights.findLastIndex(w => w > 0) + 1;
}

function rollGems(quality, rng, wish = null) {
  const kinds = Object.keys(C.GEMS);
  const favored = wish ? C.GEM_CATEGORIES[wish.category]?.kinds : null;
  const pick = () => kinds[Math.floor(rng() * kinds.length)];
  const pickFrom = list => list[Math.floor(rng() * list.length)];
  const gems = Array.from({ length: C.GEMS_PER_ROUND }, (_, slot) => ({
    slot,
    // 許願只影響第 0 格（格子本來就是隨機的），其餘格照原本抽
    kind: favored && slot === 0 && rng() < C.WISH_STACK_RATES[wish.stacks - 1] ? pickFrom(favored) : pick(),
    level: rollLevel(quality, rng, favored && slot === 0 && wish.stacks >= C.WISH_LEVEL_STACK ? 1 : 0),
  }));
  return gems;
}

// 棋盤狀態（grid 佔格、path 路線、sim 這一波的模擬）的歸屬。
// 現有模式每人一張地圖，所以就是玩家自己；合作迷宮會改回傳全隊共用的那一份。
// 塔的清單（p.towers）仍是「這位玩家擁有的塔」，不在這裡。
const boardOf = (game, p) => game.shared ?? p;
const isCoop = game => !!game.shared;
// 全隊所有的塔（合作迷宮開波與畫面用）；p.towers 仍只是自己擁有的
const allTowers = game => game.playerIds.flatMap(id => game.players[id].towers);

// 堵死策略：合作迷宮預設 breach（允許堵死，怪物拆牆）；'validate' 與其他模式放置時不能封路
const isBreach = game => isCoop(game) && C.COOP.blockPolicy === 'breach';
// 加權尋路的成本：空地 1，餅乾牆與塔（含施工中的格子）遠高於繞路，所以有通路一定走通路
const breachCost = grid => (x, y) => {
  const v = grid.get(keyOf(x, y));
  if (!v) return 1;
  return v !== true && v.kind === 'stone' ? C.COOP.wallCost : C.COOP.towerCost;
};
// 這張地圖目前的路線 { path, legStarts, breaches }；validate 下走不通回傳 null
function routeOfBoard(game, b) {
  if (isBreach(game)) return findFullRoute(game.board, breachCost(b.grid));
  const path = findFullPath(game.board, (x, y) => b.grid.has(keyOf(x, y)));
  return path && { path, legStarts: null, breaches: [] };
}

function refreshPath(game, p) {
  const b = p ? boardOf(game, p) : game.shared;
  const route = routeOfBoard(game, b);
  if (route) { b.path = route.path; b.route = route; }
}

const isTeam = game => game.options.livesMode === 'team';
const isRelay = game => !!game.ring;
// 環形接力裡還在場的真人（離開的人，他的區停止建造）
const humansLeft = game => game.humanIds.filter(id => !game.players[id].left).length;
// 只有一位真人：可暫停，也能切到任何一區操作（開發與測試用）
const soloRelay = game => isRelay(game) && humansLeft(game) === 1;
// 玩家動作實際作用的區：單人接力時是正在看的那區，否則就是自己的區
const actorOf = (game, playerId, watchId) => (
  soloRelay(game) && game.humanIds.includes(playerId) && game.playerIds.includes(watchId) ? watchId : playerId
);
// 每張地圖都會漏怪，共用血量跟著人數加，每張地圖分到的血量才跟單人一樣
const maxLives = game => (isTeam(game) ? C.START_LIVES * Math.max(1, game.startCount) : C.START_LIVES);
const livesPool = (game, p) => (isTeam(game) ? game : p);
const activeIds = game => game.playerIds.filter(id => !game.players[id].out);
// 正式波次都打完之後多出來的那一波：傷害測試
const isTestWave = game => game.testAt !== null;
const isEndless = game => game.options.waves === C.ENDLESS;
const isLastWave = game => !isEndless(game) && game.wave >= game.options.waves;

const pickOne = (list, rng) => list[Math.floor(rng() * list.length)];

function enterBuild(game, { now, rng }) {
  game.phase = 'build';
  game.paused = false;
  game.pausedLeft = null;
  game.buildEndsAt = game.options.buildSeconds ? now + game.options.buildSeconds * 1000 : null;
  for (const id of game.playerIds) boardOf(game, game.players[id]).sim = null;
  if (isCoop(game)) cancelAllJobs(game);
  for (const id of activeIds(game)) {
    const p = game.players[id];
    if (p.left) {
      // 離開的人：他的區停止建造，塔繼續攻擊
      Object.assign(p, { pending: [], resolved: true, ready: true, undo: [], rerolls: 0, livesBought: 0 });
      continue;
    }
    p.pending = rollGems(p.quality, rng, p.wish);
    p.wish = null; // 許願只管這一回合
    p.rerolls = 0;
    p.livesBought = 0;
    p.resolved = false;
    p.ready = false;
    p.undo = [];
  }
}

function startGame(game, ids, { now, rng = Math.random }) {
  if (game.phase !== 'waiting') throw new GameError('BAD_PHASE', '遊戲已經開始了');
  if (ids.length < C.MIN_PLAYERS || ids.length > C.MAX_PLAYERS) {
    throw new GameError('BAD_PLAYER_COUNT', `需要 ${C.MIN_PLAYERS}～${C.MAX_PLAYERS} 位玩家`);
  }
  const options = game.options;
  const coop = options.mode === 'coop';
  if (coop && (ids.length < C.COOP.minPlayers || ids.length > C.COOP.maxPlayers)) {
    throw new GameError('BAD_PLAYER_COUNT', `合作迷宮需要 ${C.COOP.minPlayers}～${C.COOP.maxPlayers} 位玩家`);
  }
  Object.assign(game, blankRun());
  // 環形接力：區域數 = 玩家數（多人）；單一真人時由設定決定，其餘區域由假人控制
  const relay = options.mode === 'relay';
  const zoneCount = relay ? (ids.length > 1 ? ids.length : options.zones) : ids.length;
  const zoneIds = [...ids, ...Array.from({ length: zoneCount - ids.length }, (_, i) => `bot-${i + 1}`)];
  game.playerIds = zoneIds;
  game.humanIds = [...ids];
  game.startCount = zoneIds.length;
  game.startedAt = now;
  game.lives = maxLives(game);
  const mapOpt = game.options.map ?? C.DEFAULT_OPTIONS.map;
  game.board = coop ? makeCoopBoard(ids.length) : makeBoard(relay ? 0 : mapOpt === 'random' ? Math.floor(rng() * C.MAP_COUNT) : mapOpt);
  if (coop) {
    game.shared = { grid: new Map(), path: [], sim: null, leaked: 0, skillCd: Object.fromEntries(C.SKILL_IDS.map(sid => [sid, 0])) };
    // 每位玩家一個建造者，從起點出發
    game.shared.builders = Object.fromEntries(zoneIds.map(id => [id, B.createBuilder(game.board.start.x + 0.5, game.board.start.y + 0.5)]));
  }
  if (relay && zoneIds.length > 1) game.ring = { layout: ringLayout(zoneIds.length, game.board), events: [], hub: null, eventsFor: null };
  for (const id of zoneIds) {
    const p = {
      bot: !ids.includes(id), left: false, rstats: R.blankStats(),
      gold: C.START_GOLD, quality: 1, research: { damage: 0, speed: 0, range: 0 }, pending: [], rerolls: 0, resolved: false, ready: false,
      lives: C.START_LIVES, out: false, outWave: 0,
      stats: { leaked: 0, peakGold: 0, lifeBought: 0, tests: [] },
      towers: [],
      skillCd: game.shared ? game.shared.skillCd : Object.fromEntries(C.SKILL_IDS.map(sid => [sid, 0])), // 技能冷卻（波數）；合作迷宮全隊共用同一份
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

// ── 還原（回合內復原）───────────────────────────────────────────
// 每次成功的建造動作前存一份玩家狀態；還原時整份放回去（含金幣）。
// 重骰會清空堆疊（不能靠還原重骰刷運氣）；按準備、進入下一回合後也不能還原。
function takeSnapshot(game, p) {
  return {
    gold: p.gold, quality: p.quality, rerolls: p.rerolls, resolved: p.resolved, livesBought: p.livesBought,
    research: { ...p.research }, wish: p.wish ? { ...p.wish } : null,
    pending: p.pending.map(g => ({ ...g })),
    stats: structuredClone(p.stats),
    towers: p.towers.map(t => ({ ...t })),
    path: boardOf(game, p).path,
    nextTowerId: game.nextTowerId,
    gameLives: game.lives, playerLives: p.lives,
  };
}

function restoreSnapshot(game, p, s) {
  Object.assign(p, {
    gold: s.gold, quality: s.quality, rerolls: s.rerolls, resolved: s.resolved, livesBought: s.livesBought,
    research: s.research, wish: s.wish, pending: s.pending, stats: s.stats, towers: s.towers,
    lives: s.playerLives,
  });
  boardOf(game, p).path = s.path;
  game.nextTowerId = s.nextTowerId;
  game.lives = s.gameLives;
  boardOf(game, p).grid = new Map(p.towers.map(t => [keyOf(t.x, t.y), t]));
}

// 包住會改動玩家狀態的建造動作：成功才記一筆快照，失敗（丟錯）不留痕跡
function undoable(fn) {
  return function wrapped(game, playerId, ...args) {
    const p = game.phase === 'build' && !isCoop(game) ? game.players[playerId] : null;
    const snap = p && !p.out && !p.ready ? takeSnapshot(game, p) : null;
    const result = fn(game, playerId, ...args);
    if (snap) (p.undo ??= []).push(snap);
    return result;
  };
}

function undo(game, playerId) {
  requireBuild(game);
  if (isCoop(game)) throw new GameError('NO_UNDO', '合作迷宮不能還原');
  const p = playerOf(game, playerId);
  if (p.ready) throw new GameError('ALREADY_READY', '已經按下準備，不能還原');
  const snap = p.undo?.pop();
  if (!snap) throw new GameError('NOTHING_TO_UNDO', '沒有可以還原的操作');
  restoreSnapshot(game, p, snap);
}

// ── 買命 ────────────────────────────────────────────────────────
function buyLife(game, playerId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (isTestWave(game)) throw new GameError('BAD_PHASE', '傷害測試不會扣血，不用買命');
  const pool = livesPool(game, p);
  if (pool.lives >= maxLives(game)) throw new GameError('MAX_LIVES', '血量已經是滿的');
  spend(p, C.lifeCost(game.wave));
  p.livesBought = (p.livesBought ?? 0) + 1;
  pool.lives += 1;
  p.stats.lifeBought += 1;
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
  const b = boardOf(game, p);
  if (b.grid.has(key)) {
    // 合作迷宮：同格先到先得，後到者收到 CELL_TAKEN（現有模式維持 BAD_CELL）
    throw new GameError(isCoop(game) ? 'CELL_TAKEN' : 'BAD_CELL', '這格已經有東西了');
  }

  b.grid.set(key, true);
  const route = routeOfBoard(game, b);
  if (!route) {
    b.grid.delete(key);
    throw new GameError('PATH_BLOCKED', '不能封死怪物的路線');
  }

  const { kind, level } = p.pending[index];
  // slot：本回合從第幾格放下的（前端在原位置顯示「已放」）；選完後 fresh 變 false 就不再下發
  const tower = { id: game.nextTowerId++, x, y, kind, level, owner: playerId, fresh: true, slot, kills: 0, damage: 0 };
  p.towers.push(tower);
  b.grid.set(key, tower);
  b.path = route.path;
  b.route = route;
  p.pending.splice(index, 1);
  return tower;
}

// ── 合作迷宮：建造者與工作 ──────────────────────────────────────
const isBuilderMode = game => isCoop(game) && game.options.buildMode === 'builder';

// 放棄一件工作：施工中的格子釋放（寶石一直在手牌，不需要退回）
function releaseJob(game, job) {
  if (job?.started && job.type === 'build') {
    game.shared.grid.delete(keyOf(job.x, job.y));
    refreshPath(game, null);
  }
}

function cancelJobOf(game, playerId) {
  const b = game.shared.builders[playerId];
  if (b) releaseJob(game, B.cancelJob(b));
}

function cancelAllJobs(game) {
  for (const id of Object.keys(game.shared.builders)) cancelJobOf(game, id);
}

function requireBuilder(game, playerId) {
  requireBuild(game);
  if (!isBuilderMode(game)) throw new GameError('BAD_MODE', '這個模式沒有建造者');
  const p = playerOf(game, playerId);
  if (p.left) throw new GameError('NOT_PLAYER', '你已經離開了');
  return game.shared.builders[playerId];
}

const inBoard = (game, x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < game.board.width && y < game.board.height;

// 建造者走到指定位置（座標是格，可有小數）；會取消目前的工作
function moveBuilder(game, playerId, x, y) {
  const b = requireBuilder(game, playerId);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new GameError('BAD_CELL', '位置不正確');
  const { width, height } = game.board;
  releaseJob(game, B.moveTo(b, Math.min(width - 0.5, Math.max(0.5, x)), Math.min(height - 0.5, Math.max(0.5, y))));
}

// 指派建造者去某格蓋手牌第 slot 顆；已經在做別的就取消那件（沒有損失）
function buildAt(game, playerId, slot, x, y) {
  const b = requireBuilder(game, playerId);
  const p = game.players[playerId];
  if (!p.pending.some(g => g.slot === slot)) throw new GameError('BAD_SLOT', '這個甜點已經放下了');
  if (!inBoard(game, x, y)) throw new GameError('BAD_CELL', '超出地圖範圍');
  if (isWaypoint(game.board, x, y)) throw new GameError('BAD_CELL', '路徑點不能擺放');
  if (game.shared.grid.has(keyOf(x, y))) throw new GameError('CELL_TAKEN', '這格已經有東西了');
  releaseJob(game, B.assignJob(b, { type: 'build', slot, x, y, duration: C.COOP.buildSeconds }));
}

// 指派建造者去拆自己的餅乾牆（要時間，不收金幣）
function demolishAt(game, playerId, towerId) {
  const b = requireBuilder(game, playerId);
  // 建造階段任何人都能免費拆餅乾牆（防止有人惡意堵路）；塔不能被別人拆
  const t = allTowers(game).find(o => o.id === towerId);
  if (!t || t.kind !== 'stone') throw new GameError('BAD_TOWER', '只能拆除餅乾牆');
  releaseJob(game, B.assignJob(b, { type: 'demolish', towerId, owner: t.owner, x: t.x, y: t.y, duration: C.COOP.demolishSeconds }));
}

function cancelJobCommand(game, playerId) {
  requireBuilder(game, playerId);
  cancelJobOf(game, playerId);
}

// 到場、開始施工那一刻：蓋的格子立刻算障礙物（路線預覽馬上更新）；不行就作廢
function startJob(game, playerId, job) {
  const p = game.players[playerId];
  const grid = game.shared.grid;
  if (job.type === 'demolish') return towerById(game.players[job.owner], job.towerId)?.kind === 'stone';
  const key = keyOf(job.x, job.y);
  if (!p.pending.some(g => g.slot === job.slot) || grid.has(key)) return false;
  grid.set(key, { reserved: true, owner: playerId });
  const route = routeOfBoard(game, game.shared);
  if (!route) {
    grid.delete(key);
    return false;
  }
  game.shared.path = route.path;
  game.shared.route = route;
  return true;
}

function finishJob(game, playerId, job) {
  if (job.type === 'build') {
    game.shared.grid.delete(keyOf(job.x, job.y)); // 保留的格子換成正式的塔
    placeGem(game, playerId, job.slot, job.x, job.y);
  } else {
    removeStone(game, job.owner, job.towerId); // 牆屬於放下的人，金幣照舊不收
  }
}

// 建造階段的步進（index.js 每 100ms 呼叫）。回傳 { changed, errors }：
// changed = 有工作開始、作廢或完成（要推送 gt:state）；errors = 作廢的原因，個別通知那位玩家
function stepBuilders(game, dt) {
  const out = { changed: false, errors: [] };
  if (game.phase !== 'build' || !isBuilderMode(game)) return out;
  for (const id of game.playerIds) {
    const p = game.players[id];
    const b = game.shared.builders[id];
    if (!b || p.out || p.left) continue;
    const events = B.stepBuilder(b, dt, { speed: C.COOP.builderSpeed, range: C.COOP.buildRange, onStart: job => startJob(game, id, job) });
    for (const ev of events) {
      out.changed = true;
      if (ev.type === 'reject') {
        const taken = game.shared.grid.has(keyOf(ev.job.x, ev.job.y));
        out.errors.push({ playerId: id, code: taken ? 'CELL_TAKEN' : 'PATH_BLOCKED', message: taken ? '這格已經有東西了' : '不能封死怪物的路線' });
      } else if (ev.type === 'done') {
        try {
          finishJob(game, id, ev.job);
        } catch (err) {
          if (!(err instanceof GameError)) throw err;
          out.errors.push({ playerId: id, code: err.code, message: err.message });
        }
      }
    }
  }
  return out;
}

// 建造者位置與工作進度（約 10Hz 的 volatile 快照；工作的起訖變動走 gt:state）
function builderFrame(game) {
  if (!isCoop(game) || !game.shared.builders) return null;
  return {
    builders: game.playerIds.map((id) => {
      const b = game.shared.builders[id];
      const job = b.job;
      return { id, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, p: job?.started ? Math.min(1, job.progress / job.duration) : 0 };
    }),
  };
}

const builderView = game => (!isBuilderMode(game) ? null : game.playerIds.map((id) => {
  const b = game.shared.builders[id];
  const j = b.job;
  return {
    id, x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100,
    job: j ? { type: j.type, x: j.x, y: j.y, slot: j.slot ?? null, towerId: j.towerId ?? null, started: j.started, p: j.started ? Math.min(1, j.progress / j.duration) : 0 } : null,
  };
}));

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

  // 擊殺數與總傷由所有材料繼承，熟練度不會因為合成歸零
  base.kills = used.reduce((n, t) => n + t.kills, 0);
  base.damage = used.reduce((n, t) => n + t.damage, 0);
  for (const t of used) if (t !== base) toStone(t);
  base.kind = recipe.result;
  base.level = C.SPECIALS[recipe.result].tier;
  base.fresh = false;

  if (usedFresh) finishRound(p);
  return base;
}

// 合成公告：第二階以上才公告，避免洗版
function combineNotice(game, playerId, tower) {
  const def = C.SPECIALS[tower.kind];
  if (!def || def.tier < 2) return null;
  const name = game.names?.[playerId] ?? '玩家';
  if (def.tier >= 4) return `${name} 合成了隱藏塔「${def.name}」！`;
  return `${name} 合成了${def.tier >= 3 ? '最高階的' : ''}${def.name}`;
}

// 傷害測試首領倒下的公告；每張 sim 只公告一次
function bossDownNotices(game) {
  if (!isTestWave(game)) return [];
  const out = [];
  for (const id of game.playerIds) {
    const sim = boardOf(game, game.players[id]).sim;
    if (!sim || sim.bossDownAt === null || sim.bossAnnounced) continue;
    sim.bossAnnounced = true;
    out.push(`${game.names?.[id] ?? '玩家'} 打倒了${C.MONSTERS?.titan?.name ?? '甜點巨獸'}，用了 ${Math.round(sim.bossDownAt * 10) / 10} 秒`);
  }
  return out;
}

// ── 商店 ────────────────────────────────────────────────────────
function upgradeQuality(game, playerId) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (p.quality >= C.QUALITY_RATES.length) throw new GameError('MAX_QUALITY', '品質已達上限');
  spend(p, C.QUALITY_COSTS[p.quality - 1]);
  p.quality += 1;
}

// 重骰：五個甜點都還在手上時才能骰，一次把五格全部換新（拿來賭湊出合成），只收一次錢
function rerollGems(game, playerId, { rng = Math.random } = {}) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (p.pending.length !== C.GEMS_PER_ROUND) throw new GameError('ALREADY_PLACED', '已經放下甜點，這回合不能再骰');
  spend(p, C.rerollCost(p.quality, p.rerolls ?? 0));
  p.rerolls = (p.rerolls ?? 0) + 1;
  p.undo = []; // 重骰是不可逆的隨機結果
  // 全部重抽，slot 沿用原本的
  const fresh = rollGems(p.quality, rng);
  p.pending = p.pending.map((g, i) => ({ slot: g.slot, kind: fresh[i].kind, level: fresh[i].level }));
}

// 許願池：預訂下一回合的抽卡風向。下一次 enterBuild 抽牌時套用並清掉
// stacks：要許到第幾層（1～3），一次付清中間每一層的錢；沒給就是再許一層
function makeWish(game, playerId, { category, stacks } = {}) {
  requireBuild(game);
  const p = playerOf(game, playerId);
  if (!Object.hasOwn(C.GEM_CATEGORIES, category)) throw new GameError('BAD_ARG', '沒有這種甜點');
  const w = p.wish;
  if (w && w.category !== category) throw new GameError('WISHED', '這回合已經許了別種甜點，只能繼續許同一種的願');
  const from = w?.stacks ?? 0;
  if (from >= C.WISH_MAX_STACKS) throw new GameError('WISH_MAX', '這回合許願次數已達上限');
  const to = stacks === undefined ? from + 1 : Number(stacks);
  if (!Number.isInteger(to) || to <= from || to > C.WISH_MAX_STACKS) throw new GameError('BAD_ARG', '許願層數不對');
  let cost = 0;
  for (let s = from; s < to; s++) cost += C.wishCost(game.wave, s);
  spend(p, cost);
  p.wish = { category, stacks: to };
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
  boardOf(game, p).grid.delete(keyOf(t.x, t.y));
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
  const b = boardOf(game, p);
  b.grid.set(keyOf(t.x, t.y), t);
  b.grid.set(keyOf(stone.x, stone.y), stone);
}

// ── 準備 / 開波 ─────────────────────────────────────────────────
function setReady(game, playerId) {
  requireBuild(game);
  if (game.paused) throw new GameError('PAUSED', '遊戲暫停中');
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
  if (isCoop(game)) cancelJobOf(game, playerId); // 還在施工的先放棄，剩下的寶石由下面隨機放
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
  if (isCoop(game)) cancelAllJobs(game);
  for (const id of activeIds(game)) autoResolve(game, id, rng);
  game.phase = 'wave';
  game.buildEndsAt = null;
  if (isRelay(game)) game.ring.hub = R.createHub(game.ring);
  if (isCoop(game)) {
    const b = game.shared;
    refreshPath(game, null);
    b.sim = createWave({
      route: b.route,
      breach: isBreach(game) ? {
        grid: b.grid,
        costOf: breachCost(b.grid),
        // 牆的血量隨波數成長；塔遠高於餅乾牆
        hpOf: (v, wave) => (C.COOP.wallHpBase + C.COOP.wallHpPerWave * wave) * (v.kind === 'stone' ? 1 : C.COOP.towerHpMult),
        onBroken: (tower) => { // 被打破的牆／塔直接消失（擁有者損失）
          const owner = game.players[tower.owner];
          if (owner) owner.towers = owner.towers.filter(t => t !== tower);
        },
        onRepath: (route) => { b.path = route.path; b.route = route; },
      } : null,
      coop: { n: game.startCount },
      devBoss: game.devBoss,
      board: game.board,
      towers: allTowers(game),
      path: b.path,
      wave: game.wave + 1,
      totalWaves: game.options.waves,
      testAt: game.testAt,
      difficulty: game.options.difficulty,
      pool: game, // 合作迷宮固定共用血量
      research: t => game.players[t.owner].research, // 每座塔套自己擁有者的研究
      skillCd: b.skillCd,
    });
    return;
  }
  for (const id of activeIds(game)) {
    const p = game.players[id];
    const b = boardOf(game, p);
    b.sim = createWave({
      relay: isRelay(game) ? { zone: game.playerIds.indexOf(id), n: game.playerIds.length, hub: game.ring.hub } : null,
      devBoss: game.devBoss,
      board: game.board,
      towers: p.towers,
      path: b.path,
      wave: game.wave + 1,
      totalWaves: game.options.waves,
      testAt: game.testAt,
      difficulty: game.options.difficulty,
      pool: isTestWave(game) ? { lives: 1 } : livesPool(game, p), // 傷害測試的怪不會扣血
      research: p.research,
      skillCd: p.skillCd,
    });
  }
}

// 波次中施放主動技能（只作用在自己的地圖）
function castSkill(game, playerId, skill) {
  if (game.phase !== 'wave') throw new GameError('BAD_PHASE', '只有出怪時可以使用技能');
  if (game.paused) throw new GameError('PAUSED', '遊戲暫停中');
  if (isRelay(game)) throw new GameError('NO_SKILL', '環形接力不能使用技能');
  const p = playerOf(game, playerId);
  const { sim } = boardOf(game, p);
  if (!sim) throw new GameError('NO_SKILL', '這一波不能使用技能');
  try {
    simCastSkill(sim, skill);
  } catch (err) {
    throw new GameError('NO_SKILL', err.message);
  }
}

function setSpeed(game, speed) {
  if (!C.SPEED_CHOICES.includes(speed)) throw new GameError('BAD_ARG', '不支援的速度');
  game.speed = speed;
}

// 暫停只開放單人遊戲；建造階段會凍結倒數，恢復時從剩下的時間繼續
function setPaused(game, paused, { now }) {
  const solo = isRelay(game) ? humansLeft(game) === 1 : game.startCount === 1;
  if (!solo) throw new GameError('FORBIDDEN', isRelay(game) ? '只有一位真人時可以暫停' : '只有單人遊戲可以暫停');
  if (game.phase !== 'build' && game.phase !== 'wave') throw new GameError('BAD_PHASE', '現在不能暫停');
  paused = !!paused;
  if (paused === game.paused) return;
  game.paused = paused;
  if (paused) game.pausedSince = now;
  else if (game.pausedSince !== null) { game.pausedMs += now - game.pausedSince; game.pausedSince = null; }
  if (game.phase !== 'build') return;
  if (paused) {
    game.pausedLeft = game.buildEndsAt === null ? null : Math.max(0, game.buildEndsAt - now);
    game.buildEndsAt = null;
  } else {
    game.buildEndsAt = game.pausedLeft === null ? null : now + game.pausedLeft;
    game.pausedLeft = null;
  }
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
  const { sim } = boardOf(game, p);
  sim.monsters = [];
  sim.done = true;
}

// 前進 dt 秒。done：所有地圖都打完或勝負已定（結算由 finishWave 處理）；out：這一步出局的玩家
function tick(game, dt, rng = Math.random) {
  if (game.phase !== 'wave') return { done: false, out: [] };
  if (isRelay(game)) return tickRelay(game, dt, rng);
  if (isCoop(game)) {
    const { sim } = game.shared;
    if (!sim.done) sim.done = stepWave(sim, dt, rng);
    const changed = sim.changed;
    sim.changed = false;
    return { done: decidedWinners(game) !== null || sim.done, out: [], changed };
  }
  const out = [];
  for (const id of activeIds(game)) {
    const p = game.players[id];
    const { sim } = boardOf(game, p);
    if (!sim.done) sim.done = stepWave(sim, dt, rng);
    if (!isTeam(game) && p.lives <= 0) {
      eliminate(game, id);
      out.push(id);
    }
  }
  const done = decidedWinners(game) !== null || activeIds(game).every(id => boardOf(game, game.players[id]).sim.done);
  return { done, out };
}

// 環形接力：每區都照常推進（區裡的蟲走完就交給輸送帶），直到整圈的蟲都出完、打完、走完
function tickRelay(game, dt, rng) {
  const sims = game.playerIds.map(id => boardOf(game, game.players[id]).sim);
  for (const sim of sims) stepWave(sim, dt, rng);
  R.stepTransit(game.ring.hub, sims, dt);
  const done = game.lives <= 0 || R.waveClear(game.ring.hub, sims);
  if (done) for (const sim of sims) sim.done = true;
  return { done, out: [] };
}

// 每個獎項取數值最大的玩家；全部都是 0 就沒有人得獎
function awardOf(scores, pick) {
  let best = null;
  for (const s of scores) {
    const value = pick(s);
    if (value > 0 && (!best || value > best.value)) best = { id: s.id, value };
  }
  return best;
}

// 每場傷害測試一份排行，多場時再加一份總傷害榜
function buildTestResult(game) {
  const ats = [...new Set(game.playerIds.flatMap(id => game.players[id].stats.tests.map(t => t.at)))].sort((x, y) => x - y);
  if (!ats.length) return null;
  const rounds = ats.map((at) => {
    const rows = game.playerIds
      .map(id => ({ id, ...game.players[id].stats.tests.find(t => t.at === at) }))
      .filter(r => r.at === at)
      .sort((x, y) => y.damage - x.damage);
    // 環形接力：一隻巨獸繞完整圈，各區傷害加總才是隊伍成績
    const team = isRelay(game)
      ? { damage: rows.reduce((n, r) => n + r.damage, 0), killed: rows.some(r => r.killed), seconds: rows.find(r => r.killed)?.seconds ?? null }
      : null;
    return { at, maxHp: rows[0].maxHp, rows, ...(team ? { team } : {}) };
  });
  const totals = rounds.length > 1
    ? game.playerIds
      .map(id => ({ id, damage: game.players[id].stats.tests.reduce((n, t) => n + t.damage, 0), kills: game.players[id].stats.tests.filter(t => t.killed).length }))
      .sort((x, y) => y.damage - x.damage)
    : null;
  return { rounds, totals };
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
      leaked: isCoop(game) ? game.shared.leaked : p.stats.leaked,
      gold: p.gold,
      peakGold: p.stats.peakGold,
      lifeBought: p.stats.lifeBought,
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
    awards: {
      saver: awardOf(scores, s => s.peakGold),
      leaker: awardOf(scores, s => s.leaked),
      killer: awardOf(scores, s => s.kills),
      dealer: awardOf(scores, s => s.damage),
      lifeBuyer: awardOf(scores, s => s.lifeBought),
      perfectIds: game.wave > 0 ? scores.filter(s => s.leaked === 0).map(s => s.id) : [],
    },
    test: buildTestResult(game),
    ...(isRelay(game) ? { relay: { zones: relayZoneRows(game) } } : {}),
  };
}

// 分區統計表：每區一列（累計到目前這一波）
function relayZoneRows(game) {
  return game.playerIds.map((id, index) => {
    const p = game.players[id];
    return { id, index, bot: p.bot, left: p.left, pathLength: Math.max(0, boardOf(game, p).path.length - 1), ...R.liveStats(p) };
  });
}

// 把這一波的成績記到玩家身上；同一張 sim 只記一次
function bankWave(game) {
  const testWave = isTestWave(game);
  for (const id of game.playerIds) {
    const p = game.players[id];
    const { sim } = boardOf(game, p);
    if (!sim || sim.banked) continue;
    sim.banked = true;
    for (const sid of C.SKILL_IDS) p.skillCd[sid] = Math.max(0, p.skillCd[sid] - 1);
    if (testWave) {
      // 環形接力：巨獸血量與是否擊倒都是整隊的，每區只記自己打出的傷害
      const sims = isRelay(game) ? game.playerIds.map(pid => boardOf(game, game.players[pid]).sim) : [sim];
      const downAt = sims.map(s => s.bossDownAt).filter(t => t !== null);
      p.stats.tests.push({
        at: game.testAt,
        damage: Math.round(sim.damage),
        maxHp: isRelay(game) ? sims[0].def.hp : sim.def.hp,
        killed: downAt.length > 0,
        seconds: downAt.length ? Math.round(Math.min(...downAt) * 10) / 10 : null,
        escaped: sim.leaked > 0,
      });
    } else {
      if (isCoop(game)) game.shared.leaked += sim.leaked;
      else p.stats.leaked += sim.leaked;
      if (isRelay(game)) R.bankStats(p, sim);
    }
  }
}

// 環形接力：一波打完，把各區的傳遞與補救寫進事件紀錄（每一波只寫一次）
function recordRelayEvents(game) {
  if (!isRelay(game)) return;
  const sims = game.playerIds.map(id => boardOf(game, game.players[id]).sim);
  if (sims.some(s => !s)) return;
  const test = isTestWave(game);
  const label = test ? game.testAt : game.wave + 1;
  const key = `${label}/${test}/${game.devBoss}/${game.wave}`;
  if (game.ring.eventsFor === key) return;
  game.ring.eventsFor = key;
  R.recordWaveEvents(game.ring, sims, label, { test });
}

function finishGame(game, winnerIds) {
  bankWave(game);
  game.phase = 'finished';
  game.buildEndsAt = null;
  for (const id of game.playerIds) boardOf(game, game.players[id]).sim = null;
  game.finishedAt = Date.now();
  game.result = buildResult(game, winnerIds);
  game.records = buildRecords(game, winnerIds); // 給排行榜用，不送給前端
}

// 排行榜紀錄：每位玩家一筆。到達波數 = 實際打到（或倒下）的那一波；通關 = 撐過最後一波且沒出局（無盡沒有通關）
// 傷害取這局所有傷害測試中「傷害 ÷ 巨獸血量」最高的一場（最多 100%），finalDamage 是那一場的傷害
function buildRecords(game, winnerIds) {
  if (game.aborted || game.tainted || !game.startedAt || isCoop(game)) return [];
  const { waves, difficulty, livesMode } = game.options;
  const endless = isEndless(game);
  const lastCleared = isLastWave(game);
  const seconds = Math.max(0, Math.round((game.finishedAt - game.startedAt - game.pausedMs) / 1000));
  if (game.options.mode === 'relay') return buildRelayRecords(game, winnerIds, { waves, difficulty, endless, lastCleared, seconds });
  return game.playerIds.map((id) => {
    const p = game.players[id];
    const cleared = lastCleared && !p.out && (isTeam(game) ? winnerIds.length > 0 : true);
    const reached = p.out ? p.outWave : game.wave + 1;
    const best = p.stats.tests.reduce((a, t) => {
      const ratio = t.maxHp > 0 ? Math.min(1, t.damage / t.maxHp) : 0;
      return !a || ratio > a.ratio ? { ratio, test: t } : a;
    }, null);
    return {
      playerId: id,
      waves,
      difficulty,
      livesMode,
      playerCount: game.startCount,
      reachedWave: cleared ? waves : endless ? reached : Math.min(waves, reached),
      cleared,
      clearSeconds: cleared ? seconds : null,
      finalDamage: best ? best.test.damage : null,
      finalKilled: best ? best.test.killed : null,
      damageRatio: best ? Math.round(best.ratio * 10000) / 10000 : null,
    };
  });
}

// 環形接力的成績是整隊的：每位在場的真人一筆，內容相同；1～6 區合成一個榜（zones 欄位標示幾區）
function buildRelayRecords(game, winnerIds, { waves, difficulty, endless, lastCleared, seconds }) {
  const cleared = lastCleared && winnerIds.length > 0;
  const reached = game.wave + 1;
  const best = (buildTestResult(game)?.rounds ?? []).reduce((a, r) => {
    const ratio = r.maxHp > 0 ? Math.min(1, r.team.damage / r.maxHp) : 0;
    return !a || ratio > a.ratio ? { ratio, round: r } : a;
  }, null);
  const zones = game.playerIds.length;
  return game.humanIds.filter(id => !game.players[id].left).map(id => ({
    playerId: id,
    mode: 'relay',
    zones,
    waves,
    difficulty,
    livesMode: 'team',
    playerCount: game.humanIds.length,
    reachedWave: cleared ? waves : endless ? reached : Math.min(waves, reached),
    cleared,
    clearSeconds: cleared ? seconds : null,
    finalDamage: best ? best.round.team.damage : null,
    finalKilled: best ? best.round.team.killed : null,
    damageRatio: best ? Math.round(best.ratio * 10000) / 10000 : null,
  }));
}

// 打完最後一波：共用血量全隊贏；獨立血量比剩餘血量，同分並列
function lastWaveWinners(game) {
  const alive = activeIds(game);
  if (isTeam(game)) return alive;
  const best = Math.max(...alive.map(id => game.players[id].lives));
  return alive.filter(id => game.players[id].lives === best);
}

// 中途的傷害測試依傷害比例發金幣，在進入下一波建造前入帳
function rewardTest(game) {
  // 環形接力：依隊伍總傷害發獎，每區拿到一樣的額度
  const teamDamage = isRelay(game)
    ? game.playerIds.reduce((n, id) => n + (game.players[id].stats.tests.find(t => t.at === game.testAt)?.damage ?? 0), 0)
    : null;
  for (const id of activeIds(game)) {
    const p = game.players[id];
    const entry = p.stats.tests.find(t => t.at === game.testAt);
    if (!entry) continue;
    entry.reward = C.testReward(entry.at, teamDamage ?? entry.damage, entry.maxHp);
    p.gold += entry.reward;
    p.stats.peakGold = Math.max(p.stats.peakGold, p.gold);
  }
}

function finishWave(game, { now, rng = Math.random }) {
  if (game.phase !== 'wave') return { finished: game.phase === 'finished' };

  recordRelayEvents(game);
  bankWave(game);
  const winners = decidedWinners(game);
  if (winners) {
    finishGame(game, winners);
    return { finished: true };
  }

  // 開發測試的首領波：不推進波數、不發獎勵，打完回到建造；這局不列入排行榜
  if (game.devBoss) {
    game.devBoss = false;
    game.tainted = true;
    enterBuild(game, { now, rng });
    return { finished: false };
  }

  // 傷害測試打完：中途的測試接著回到建造；最後一場用打完正式波次時就定下來的勝負結算
  if (isTestWave(game)) {
    const last = isLastWave(game);
    if (!last) rewardTest(game);
    game.testAt = null;
    if (last) {
      finishGame(game, game.pendingWinners ?? []);
      return { finished: true };
    }
    enterBuild(game, { now, rng });
    return { finished: false };
  }

  game.wave += 1;
  const bonus = Math.round(C.waveClearBonus(game.wave) * (isRelay(game) ? C.RELAY_CLEAR_BONUS_SHARE : 1));
  for (const id of activeIds(game)) {
    const p = game.players[id];
    const { sim } = boardOf(game, p);
    const bornShare = sim.relay?.hub.credit?.[sim.relay.zone] ?? 0; // 別區補救我漏出去的蟲，我分到的擊殺金
    const earned = sim.coop ? (sim.earnedBy[id] ?? 0) : sim.earned; // 合作迷宮：只拿自己的塔打出的擊殺金
    p.gold += earned + bornShare + bonus + C.interestOn(p.gold);
    p.stats.peakGold = Math.max(p.stats.peakGold, p.gold);
  }

  const last = isLastWave(game);
  if (last && !game.options.damageTest) {
    finishGame(game, lastWaveWinners(game));
    return { finished: true };
  }
  if (last) game.pendingWinners = lastWaveWinners(game);
  // 每 15 波與最後一波之後，多一個傷害測試
  if (game.options.damageTest && C.testAfterWave(game.wave, game.options.waves)) game.testAt = game.wave;
  enterBuild(game, { now, rng });
  return { finished: false };
}

function finishNow(game) {
  if (game.phase !== 'build' && game.phase !== 'wave') throw new GameError('BAD_PHASE', '目前沒有進行中的遊戲');
  game.aborted = true;
  finishGame(game, []);
}

// 開發／測試：直接放出繞全圈的首領（只在環形接力的建造階段）。呼叫端接著開波
function startBossWave(game) {
  requireBuild(game);
  if (!isRelay(game)) throw new GameError('BAD_PHASE', '只有環形接力可以測試首領波');
  if (isTestWave(game)) throw new GameError('BAD_PHASE', '傷害測試前不能插入首領波');
  game.devBoss = true;
}

// 玩家離開：他的地圖跟著收掉；回傳剩餘人數。波次中的勝負由下一次 tick 判定
// 環形接力：環不收，他的區停止建造（塔繼續攻擊）；剩餘人數指還在場的真人
function leavePlayer(game, playerId) {
  if (isRelay(game) || isCoop(game)) {
    if (!game.humanIds.includes(playerId) || game.players[playerId].left) return { changed: false, remaining: humansLeft(game), finished: false };
    const p = game.players[playerId];
    if (game.phase === 'build') autoResolve(game, playerId); // 手上的甜點先收尾，不留半成品
    Object.assign(p, { left: true, bot: true, pending: [], resolved: true, ready: true, undo: [] });
    return { changed: true, remaining: humansLeft(game), finished: false };
  }
  if (!game.playerIds.includes(playerId)) return { changed: false, remaining: game.playerIds.length, finished: false };
  game.playerIds = game.playerIds.filter(id => id !== playerId);
  const winners = game.phase === 'build' && game.playerIds.length ? decidedWinners(game) : null;
  if (winners) finishGame(game, winners);
  return { changed: true, remaining: game.playerIds.length, finished: !!winners };
}

// ── 視圖 ────────────────────────────────────────────────────────
function towerView(t) {
  return {
    id: t.id, x: t.x, y: t.y, kind: t.kind, level: t.level, owner: t.owner, fresh: t.fresh, kills: t.kills, damage: Math.round(t.damage),
    ...(t.fresh ? { slot: t.slot } : {}),
  };
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
    wish: p.wish ?? null,
    rerolls: p.rerolls ?? 0,
    livesBought: p.livesBought ?? 0,
    lifeCost: C.lifeCost(game.wave),
    wishCost: C.wishCost(game.wave, Math.min(p.wish?.stacks ?? 0, C.WISH_MAX_STACKS - 1)),
    wishCosts: Array.from({ length: C.WISH_MAX_STACKS }, (_, s) => C.wishCost(game.wave, s)), // 第 1／2／3 層各自的價格
    canUndo: game.phase === 'build' && !p.out && !p.ready && !!p.undo?.length,
    rerollCost: C.rerollCost(p.quality, p.rerolls ?? 0),
    canReroll: game.phase === 'build' && !p.out && p.pending.length === C.GEMS_PER_ROUND,
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
  // 合作迷宮只有一張圖：不管指定看誰，玩家看到的都是自己的視角（塔與手牌歸自己）
  if (isCoop(game)) return game.playerIds.includes(viewerId) ? viewerId : game.playerIds[0] ?? null;
  if (game.playerIds.includes(watchId)) return watchId;
  if (game.playerIds.includes(viewerId)) return viewerId;
  return game.playerIds[0] ?? null;
}

function buildView(game, viewerId, watchId) {
  const nextWave = game.phase === 'finished' || !game.board ? null : (() => {
    const test = isTestWave(game);
    const number = test ? game.testAt : game.wave + 1;
    const def = test ? C.testWaveDef(game.testAt, game.options.difficulty, game.options.waves) : C.waveDef(number, game.options.waves, game.options.difficulty);
    // 環形接力：每組的數量同單人，血量與護甲依走過的區數與人數換算；首領每區各一隻，傷害測試的巨獸只有一隻
    const n = game.ring ? game.playerIds.length : 1;
    const hpMult = (g) => {
      if (!game.ring) return 1;
      if (C.MONSTERS[g.type].boss) return test ? C.relayTestHpMult(n) :C.RELAY_BOSS_HP_MULT;
      return C.relayGroupHpMult(n);
    };
    const armorMult = g => (!game.ring ? 1 : test && C.MONSTERS[g.type].boss ? C.RELAY_TEST_ARMOR_MULT : C.MONSTERS[g.type].boss ? 1 : C.RELAY_ARMOR_MULT);
    const groups = def.groups.map(g => ({ type: g.type, count: g.count, hp: Math.max(1, Math.round(g.hp * hpMult(g))), armor: Math.round(g.armor * armorMult(g)), trait: g.trait, leak: g.leak }));
    return { number, type: def.type, count: def.count, hp: groups[0].hp, armor: groups[0].armor, groups, test: !!def.test, perZone: !!game.ring && !test };
  })();
  const watching = resolveWatch(game, viewerId, watchId);
  const field = game.players[watching];
  // 單一真人的環形接力：操作的是正在看的那一區
  const actor = actorOf(game, viewerId, watching);

  return {
    phase: game.phase,
    options: game.options,
    wave: game.wave,
    lives: game.lives,
    maxLives: maxLives(game),
    board: game.board,
    watching,
    towers: isCoop(game) ? allTowers(game).map(towerView) : field ? field.towers.map(towerView) : [],
    path: field ? boardOf(game, field).path : [],
    buildEndsAt: game.buildEndsAt,
    serverNow: null, // index.js 填入
    speed: game.speed,
    paused: game.paused,
    nextWave,
    result: game.result,
    testLog: buildTestResult(game), // 已打完的傷害測試紀錄（中途也看得到）
    playerIds: game.playerIds,
    players: Object.fromEntries(game.playerIds.map((id) => {
      const p = game.players[id];
      return [id, {
        quality: p.quality, resolved: p.resolved, ready: p.ready,
        placed: C.GEMS_PER_ROUND - p.pending.length,
        lives: livesPool(game, p).lives, out: p.out, gold: p.gold,
      }];
    })),
    me: viewerId ? relayMe(game, viewerId, actor) : null,
    builders: builderView(game),
    // 合作迷宮 breach：路線上必須打破的牆（建造階段紅色標出預計的突破點）；其他模式與 validate 是 null
    breaches: isBreach(game) ? (game.shared.route?.breaches ?? []).map(({ x, y }) => ({ x, y, tower: game.shared.grid.get(keyOf(x, y))?.kind !== 'stone' })) : null,
    relay: game.ring ? relayView(game, viewerId, watching) : null,
  };
}

// 單一真人操作別區時，「準備」仍是自己那區的狀態（只有自己的區會擋開波）
function relayMe(game, viewerId, actor) {
  const me = meView(game, actor);
  if (me && actor !== viewerId && game.players[viewerId]) me.ready = game.players[viewerId].ready;
  return me && { ...me, zoneId: actor };
}

const flatPath = path => path.flatMap(c => [c.x, c.y]);
// 環形接力的整圈資訊：排版、各區的塔（精簡成陣列）、路線、統計、事件。塔與路線全部都送，前端才畫得出整圈
function relayView(game, viewerId, watching) {
  const { layout, events } = game.ring;
  const zones = game.playerIds.map((id, index) => {
    const p = game.players[id];
    return {
      id, index, bot: p.bot, left: p.left, pathLength: Math.max(0, boardOf(game, p).path.length - 1),
      path: flatPath(boardOf(game, p).path),
      towers: p.towers.map(t => [t.id, t.x, t.y, t.kind, t.level, t.fresh ? 1 : 0, t.kills]),
      stats: R.liveStats(p),
    };
  });
  return {
    n: layout.n,
    layout: {
      size: layout.size, pitch: layout.pitch, bounds: layout.bounds,
      zones: layout.zones.map(z => ({ cx: z.cx, cy: z.cy, origin: z.origin })),
      conveyors: layout.conveyors.map(c => ({ from: c.from, to: c.to, points: c.points, length: c.length, arcFrom: c.arcFrom, arcTo: c.arcTo })),
    },
    zones,
    events: events.slice(-C.RELAY_EVENT_SHOW),
    operateAny: soloRelay(game) && game.humanIds.includes(viewerId), // 單一真人：可以切到任何一區操作
    myZone: game.playerIds.indexOf(game.humanIds.includes(viewerId) ? viewerId : ''),
    watchZone: game.playerIds.indexOf(watching),
    canBossWave: game.phase === 'build' && !isTestWave(game),
  };
}

// 波次快照：每張地圖一份；players 是所有人的摘要，讓看別人地圖時也知道自己的進度
// watched 給定時只組這些玩家的地圖（沒人看的地圖只清掉累積的射擊事件）
function buildFrames(game, watched = null) {
  // 環形接力：整圈只有一份快照，所有人收到同一份
  if (isRelay(game) && game.ring.hub && game.playerIds.every(id => boardOf(game, game.players[id]).sim)) return { ring: R.buildRingFrame(game) };
  if (isCoop(game)) return buildCoopFrames(game, watched);
  const ids = game.playerIds.filter(id => boardOf(game, game.players[id]).sim);
  const players = Object.fromEntries(ids.map((id) => {
    const p = game.players[id];
    const { earned, killed, leaked, done, damage } = boardOf(game, p).sim;
    return [id, { lives: livesPool(game, p).lives, earned, killed, leaked, done, damage: Math.round(damage) }];
  }));
  const frames = {};
  for (const id of ids) {
    const { sim } = boardOf(game, game.players[id]);
    if (watched && !watched.has(id)) {
      sim.shots = [];
      continue;
    }
    frames[id] = { owner: id, wave: sim.wave, total: sim.def.count + sim.splits, players, sk: sim.noSkills ? null : skillCooldowns(sim), ...buildSimFrame(sim) };
  }
  return frames;
}

// 合作迷宮：全隊一份快照，每位玩家收到同一份（沒人在看時只清掉累積的射擊事件）
function buildCoopFrames(game, watched) {
  const { sim } = game.shared;
  if (!sim) return {};
  const ids = game.playerIds;
  if (watched && !ids.some(id => watched.has(id))) {
    sim.shots = [];
    return {};
  }
  const players = Object.fromEntries(ids.map(id => [id, {
    lives: game.lives, earned: sim.earnedBy[id] ?? 0, killed: sim.killed, leaked: sim.leaked, done: sim.done, damage: Math.round(sim.damage),
  }]));
  const frame = { owner: ids[0], wave: sim.wave, total: sim.def.count + sim.splits, players, sk: sim.noSkills ? null : skillCooldowns(sim), ...buildSimFrame(sim) };
  return Object.fromEntries(ids.map(id => [id, frame]));
}

module.exports = {
  GameError,
  MIN_PLAYERS: C.MIN_PLAYERS,
  MAX_PLAYERS: C.MAX_PLAYERS,
  catalog: C.catalog,
  createGame, resetGame, resolveOptions, startGame, castSkill,
  placeGem: undoable(placeGem), keepGem: undoable(keepGem), mergeGem: undoable(mergeGem), combine: undoable(combine),
  combineNotice, bossDownNotices, availableRecipes, undo,
  boardOf, isBuilderMode, moveBuilder, buildAt, demolishAt, cancelJobCommand, stepBuilders, builderFrame,
  requestPlace: (game, playerId, ...args) => {
    if (isBuilderMode(game)) throw new GameError('USE_BUILDER', '請用建造者走過去蓋');
    return undoable(placeGem)(game, playerId, ...args);
  },
  boardOf, buildRecords, upgradeQuality: undoable(upgradeQuality), rerollGems, rollGems, makeWish: undoable(makeWish),
  upgradeResearch: undoable(upgradeResearch), removeStone: undoable(removeStone), swapWithStone: undoable(swapWithStone),
  buyLife: undoable(buyLife),
  setReady, allReady, autoResolve, startWave, setSpeed, setPaused, tick, finishWave, finishNow, startBossWave,
  leavePlayer, resolveWatch, actorOf, buildView, buildFrames,
};
