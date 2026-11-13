'use strict';

// ================================================================
//  點格棋（dots-boxes）— 純遊戲邏輯（不碰 socket / DB / 計時器，方便單元測試）
//
//  規格：docs/dots-boxes-spec.md
//  - 盤面 size×size 格（4 或 5），共 (size+1)² 個點
//  - 兩人輪流畫一條線；畫完讓某格四邊封閉就拿下該格並「再走一步」，沒封閉則換人
//  - classic：一格 1 分；advanced：每格有 1–5 的分值（180° 點對稱隨機，兩邊公平）
//  - 全部格子被拿下即結束；分高者勝，同分平手
//  - 函式直接修改傳入的 game；違規丟 GameError；rng 由呼叫端注入
//
//  線段編號（前後端共用）：
//    橫線 h(r,c) = r*size + c            r∈[0,size]、c∈[0,size-1]
//    直線 v(r,c) = H + r*(size+1) + c    r∈[0,size-1]、c∈[0,size]，H = (size+1)*size
//  格子 (r,c) 編號 = r*size + c，四邊 = 上 h(r,c)、下 h(r+1,c)、左 v(r,c)、右 v(r,c+1)
// ================================================================

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 2;

const SIZES = [4, 5];
const MODES = ['classic', 'advanced'];
const DEFAULT_OPTIONS = { size: 4, mode: 'classic' };

// 進階模式分值抽樣池：小分較多、5 分稀有
const VALUE_POOL = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function resolveOptions(raw = {}) {
  const size = Number(raw.size);
  const o = {
    size: SIZES.includes(size) ? size : DEFAULT_OPTIONS.size,
    mode: MODES.includes(raw.mode) ? raw.mode : DEFAULT_OPTIONS.mode,
  };
  return o;
}

// ── 幾何 ─────────────────────────────────────────────────────
const hCount = n => (n + 1) * n;
const lineCount = n => 2 * hCount(n);
const hEdge = (n, r, c) => r * n + c;
const vEdge = (n, r, c) => hCount(n) + r * (n + 1) + c;

function boxEdges(n, boxIdx) {
  const r = Math.floor(boxIdx / n);
  const c = boxIdx % n;
  return [hEdge(n, r, c), hEdge(n, r + 1, c), vEdge(n, r, c), vEdge(n, r, c + 1)];
}

// 線段相鄰的格子（1 或 2 個）
function boxesOfEdge(n, edge) {
  const H = hCount(n);
  const out = [];
  if (edge < H) {
    const r = Math.floor(edge / n);
    const c = edge % n;
    if (r > 0) out.push((r - 1) * n + c);
    if (r < n) out.push(r * n + c);
  } else {
    const k = edge - H;
    const r = Math.floor(k / (n + 1));
    const c = k % (n + 1);
    if (c > 0) out.push(r * n + (c - 1));
    if (c < n) out.push(r * n + c);
  }
  return out;
}

// 進階模式分值：格子 i 與 (n²-1-i) 同分（180° 點對稱），先手後手拿到的盤面完全對等
function makeValues(n, mode, rng = Math.random) {
  const total = n * n;
  if (mode !== 'advanced') return Array(total).fill(1);
  const values = Array(total).fill(1);
  for (let i = 0; i < Math.ceil(total / 2); i++) {
    const v = VALUE_POOL[Math.floor(rng() * VALUE_POOL.length)];
    values[i] = v;
    values[total - 1 - i] = v;
  }
  return values;
}

// ── 狀態 ─────────────────────────────────────────────────────
function createGame() {
  return {
    phase: 'waiting', // waiting | playing | finished
    options: { ...DEFAULT_OPTIONS },
    players: [],      // 座位順序：[座位0 的 playerId, 座位1 的 playerId]
    turn: 0,          // 輪到哪個座位
    lines: [],        // 每條線畫的人（座位 0/1），未畫為 -1
    boxes: [],        // 每格被誰拿下（座位），未拿為 -1
    values: [],       // 每格分值
    scores: [0, 0],
    counts: [0, 0],   // 各拿幾格
    moveCount: 0,
    last: null,       // { edge, seat, claimed: [boxIdx] }
    winner: null,     // 0 | 1 | 'draw'
    endReason: null,  // 'complete' | 'resign' | 'leave'
    nextFirst: 0,     // 下一局先手座位（重賽時交換）
    startSeq: 0,      // 第幾局，前端用來重置動畫
  };
}

function resetGame(game) {
  const { options, nextFirst, startSeq } = game;
  Object.assign(game, createGame(), { options, nextFirst, startSeq });
}

function startGame(game, playerIds, { rng = Math.random } = {}) {
  if (game.phase === 'playing') throw new GameError('BAD_PHASE', '遊戲已經開始了');
  if (playerIds.length !== 2) throw new GameError('NEED_TWO', '需要剛好 2 位玩家才能開始');
  const { size, mode } = game.options;
  const first = game.nextFirst ?? 0;
  game.players = first === 0 ? [...playerIds] : [playerIds[1], playerIds[0]];
  game.phase = 'playing';
  game.turn = 0;
  game.lines = Array(lineCount(size)).fill(-1);
  game.boxes = Array(size * size).fill(-1);
  game.values = makeValues(size, mode, rng);
  game.scores = [0, 0];
  game.counts = [0, 0];
  game.moveCount = 0;
  game.last = null;
  game.winner = null;
  game.endReason = null;
  game.startSeq += 1;
  game.nextFirst = 1 - first;
}

const seatOf = (game, playerId) => game.players.indexOf(playerId);

function finish(game, winner, reason) {
  game.phase = 'finished';
  game.winner = winner;
  game.endReason = reason;
}

function drawLine(game, playerId, edge) {
  if (game.phase !== 'playing') throw new GameError('BAD_PHASE', '遊戲尚未開始或已結束');
  const seat = seatOf(game, playerId);
  if (seat < 0) throw new GameError('NOT_PLAYER', '你不是這局的玩家');
  if (seat !== game.turn) throw new GameError('NOT_YOUR_TURN', '還沒輪到你');
  if (!Number.isInteger(edge) || edge < 0 || edge >= game.lines.length) {
    throw new GameError('BAD_EDGE', '無效的線段');
  }
  if (game.lines[edge] !== -1) throw new GameError('EDGE_TAKEN', '這條線已經畫過了');

  const n = game.options.size;
  game.lines[edge] = seat;
  game.moveCount += 1;

  const claimed = [];
  for (const b of boxesOfEdge(n, edge)) {
    if (game.boxes[b] === -1 && boxEdges(n, b).every(e => game.lines[e] !== -1)) {
      game.boxes[b] = seat;
      game.scores[seat] += game.values[b];
      game.counts[seat] += 1;
      claimed.push(b);
    }
  }
  game.last = { edge, seat, claimed };

  if (game.boxes.every(o => o !== -1)) {
    const [a, b] = game.scores;
    finish(game, a === b ? 'draw' : a > b ? 0 : 1, 'complete');
  } else if (claimed.length === 0) {
    game.turn = 1 - game.turn; // 拿到格子可以再走一步
  }
  return { claimed, finished: game.phase === 'finished' };
}

// 投降或中途離開：對手獲勝
function forfeit(game, playerId, reason = 'resign') {
  if (game.phase !== 'playing') return false;
  const seat = seatOf(game, playerId);
  if (seat < 0) return false;
  finish(game, 1 - seat, reason);
  return true;
}

// 目前總分與剩餘分，供前端顯示「已無法追上」之類的提示
const totalValue = game => game.values.reduce((s, v) => s + v, 0);

function buildView(game, viewerId) {
  return {
    phase: game.phase,
    options: game.options,
    players: game.players,
    mySeat: viewerId ? seatOf(game, viewerId) : -1,
    turn: game.turn,
    lines: game.lines,
    boxes: game.boxes,
    values: game.values,
    scores: game.scores,
    counts: game.counts,
    total: game.values.length ? totalValue(game) : 0,
    moveCount: game.moveCount,
    last: game.last,
    winner: game.winner,
    endReason: game.endReason,
    startSeq: game.startSeq,
  };
}

module.exports = {
  GameError, MIN_PLAYERS, MAX_PLAYERS, SIZES, MODES, DEFAULT_OPTIONS, VALUE_POOL,
  resolveOptions, hCount, lineCount, hEdge, vEdge, boxEdges, boxesOfEdge, makeValues,
  createGame, resetGame, startGame, drawLine, forfeit, buildView,
};
