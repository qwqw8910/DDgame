'use strict';

// ================================================================
//  同詞相遇（same-word）— 純遊戲邏輯（不碰 socket / DB / 計時器，方便單元測試）
//
//  規格：docs/same-word-spec.md（v3）
//  - 每輪所有人同時寫一個詞、同時揭曉；詞必須「正規化後完全相同」才算同詞
//  - 兩人「第一次寫出相同詞」的輪次決定默契稱號（CHEMISTRY_TIERS），只記一次
//  - 揭曉後未配對者 ≤ 1 人，或達回合上限 → 結束；剩 1 人頒「與眾不同」
//  - rng 與 now 由呼叫端注入；計時到 0 的切階段由 index.js 負責（本檔只檢查 now）
//  - 函式直接修改傳入的 game 物件；違規丟 GameError
//  - buildView(game, viewerId) 只回傳該觀看者有權看到的內容（書寫階段絕不下發別人的詞）
// ================================================================

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 12;

const WORD_MAX_LEN = 12;
// 中日韓統一表意文字（U+4E00–U+9FFF）+ 英文字母；不偵測簡體，「蘋果」「苹果」是不同的詞
const WORD_PATTERN = /^[一-鿿A-Za-z]+$/;

const TIMER_MIN_SECONDS = 15;
const TIMER_MAX_SECONDS = 180;
const OUTLIER_VOTE_MS = 8000;
const TOP_PAIRS = 3; // 最佳拍檔 / 頭號死對頭 最多列幾組

const DEFAULT_OPTIONS = { timerSeconds: 45, maxRounds: 8, starterMode: 'free', outlierVote: true };
const STARTER_MODES = ['free', 'seed'];

// 默契稱號：依「第幾輪首次相同」，index = 輪次 - 1，超過表長一律用最後一格
const CHEMISTRY_TIERS = [
  { id: 'soulmates', emoji: '💘', title: '天生一對', value: 100 },
  { id: 'telepathy', emoji: '✨', title: '心有靈犀', value: 85 },
  { id: 'in-sync', emoji: '🤝', title: '默契十足', value: 70 },
  { id: 'compatible', emoji: '😊', title: '還算合拍', value: 55 },
  { id: 'slow-burn', emoji: '🌱', title: '慢熟型', value: 40 },
  { id: 'needs-work', emoji: '🔧', title: '需要磨合', value: 30 },
  { id: 'barely', emoji: '😅', title: '勉強同頻', value: 20 },
  { id: 'near-miss', emoji: '🩹', title: '差點錯過', value: 10 }, // 第 8 輪以後
];
const NO_MATCH_TIER = { id: 'rivals', emoji: '💔', title: '死對頭', value: 0 };

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── 小工具 ──────────────────────────────────────────────────────
const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];

// FNV-1a：固定雜湊，讓並列排序可重現
function stableHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function requireNow(now) {
  if (!Number.isFinite(now)) throw new GameError('BAD_ARG', '缺少時間參數 now');
}

function tierForRound(round) {
  if (!Number.isFinite(round)) return NO_MATCH_TIER;
  return CHEMISTRY_TIERS[Math.min(round, CHEMISTRY_TIERS.length) - 1];
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// ── 詞的正規化 ──────────────────────────────────────────────────
// 回傳可顯示的詞（去頭尾空白、全形英文轉半形，保留大小寫）；不合規回傳 null
function normalizeWord(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/[Ａ-Ｚａ-ｚ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  if (s.length < 1 || s.length > WORD_MAX_LEN || !WORD_PATTERN.test(s)) return null;
  return s;
}

// 比對用的 key：英文不分大小寫
const wordKey = display => display.toLowerCase();

// ── 設定 ────────────────────────────────────────────────────────
function resolveOptions(input = {}) {
  const o = { ...DEFAULT_OPTIONS };
  for (const k of Object.keys(DEFAULT_OPTIONS)) if (input[k] !== undefined) o[k] = input[k];
  if (!Number.isInteger(o.timerSeconds) || o.timerSeconds < TIMER_MIN_SECONDS || o.timerSeconds > TIMER_MAX_SECONDS) {
    throw new GameError('BAD_OPTIONS', `思考時間需為 ${TIMER_MIN_SECONDS}–${TIMER_MAX_SECONDS} 秒`);
  }
  if (!Number.isInteger(o.maxRounds) || o.maxRounds < 0) throw new GameError('BAD_OPTIONS', '回合上限需為 0（不限）或正整數');
  if (!STARTER_MODES.includes(o.starterMode)) throw new GameError('BAD_OPTIONS', '開局模式不正確');
  if (typeof o.outlierVote !== 'boolean') throw new GameError('BAD_OPTIONS', '離譜票設定不正確');
  return o;
}

function createGame(options = {}) {
  return {
    phase: 'waiting',
    options: resolveOptions(options),
    round: 0,
    roundEndsAt: null,
    seed: null,
    rounds: [],        // 已揭曉的輪次：{ words, groups, newPairs, outlierVotes, outlierEndsAt }
    pending: {},       // 本輪已送出內容（只存在伺服器）
    activeIds: [],     // 本局參與者（開始時鎖定）
    leftIds: [],       // 中途離開者（仍留在 activeIds，已成立的配對保留）
    pairs: {},         // pairKey → 首次相同的輪次
    result: null,
  };
}

// 回到大廳重玩：保留設定
function resetGame(game) {
  Object.assign(game, createGame(game.options));
  return game;
}

// ── 查詢 ────────────────────────────────────────────────────────
const participantsOf = game => game.activeIds.filter(id => !game.leftIds.includes(id));
const isPaired = (game, id) => Object.keys(game.pairs).some(k => k.split('|').includes(id));
const unpairedOf = game => participantsOf(game).filter(id => !isPaired(game, id));
const allSubmitted = game => participantsOf(game).every(id => id in game.pending);

function assertPhase(game, ...phases) {
  if (!phases.includes(game.phase)) throw new GameError('BAD_PHASE', '現在不能這樣做');
}
function assertParticipant(game, playerId) {
  if (!participantsOf(game).includes(playerId)) throw new GameError('FORBIDDEN', '你不在這一局中');
}

// 每一對玩家的首次相同輪次（從未相同為 Infinity）；預設不含已離場者
function pairStats(game, { includeLeft = false } = {}) {
  const ids = includeLeft ? game.activeIds : participantsOf(game);
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i], ids[j]);
      const firstMatch = game.pairs[key] ?? Infinity;
      const tier = tierForRound(firstMatch);
      out.push({ a: ids[i], b: ids[j], key, firstMatch, tierId: tier.id, value: tier.value });
    }
  }
  return out;
}

// 揭曉後的結束判定：'allPaired'（未配對者 ≤ 1）／'maxRounds'／null
function checkEnd(game) {
  if (unpairedOf(game).length <= 1) return 'allPaired';
  if (game.options.maxRounds > 0 && game.round >= game.options.maxRounds) return 'maxRounds';
  return null;
}

// ── 流程 ────────────────────────────────────────────────────────
function startGame(game, playerIds, { now, rng = Math.random, seedPairs = null } = {}) {
  assertPhase(game, 'waiting');
  requireNow(now);
  if (!Array.isArray(playerIds) || new Set(playerIds).size !== playerIds.length) throw new GameError('BAD_PLAYERS', '玩家名單不正確');
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new GameError('BAD_PLAYERS', `需要 ${MIN_PLAYERS}–${MAX_PLAYERS} 位玩家`);
  }
  if (game.options.starterMode === 'seed') {
    if (!Array.isArray(seedPairs) || !seedPairs.length) throw new GameError('NO_SEED', '沒有可用的種子詞');
    game.seed = [...pick(seedPairs, rng)];
  }
  game.activeIds = [...playerIds];
  game.leftIds = [];
  game.round = 1;
  game.phase = 'writing';
  game.roundEndsAt = now + game.options.timerSeconds * 1000;
  return game;
}

// 送出（可覆蓋，直到揭曉）。回傳是否全員已送出，由 index.js 決定何時 settleRound
function submitWord(game, playerId, rawWord, { now } = {}) {
  assertPhase(game, 'writing');
  requireNow(now);
  assertParticipant(game, playerId);
  if (now > game.roundEndsAt) throw new GameError('TIME_UP', '時間到了');
  const word = normalizeWord(rawWord);
  if (!word) throw new GameError('BAD_WORD', '請輸入中文或英文（1–12 字）');
  game.pending[playerId] = word;
  return { allSubmitted: allSubmitted(game) };
}

// 揭曉本輪：全員已送出或時間已到才可呼叫。未送出者視為空白，空白不與任何詞相同
function settleRound(game, { now } = {}) {
  assertPhase(game, 'writing');
  requireNow(now);
  if (now < game.roundEndsAt && !allSubmitted(game)) throw new GameError('TOO_EARLY', '還有人在寫');

  const ids = participantsOf(game);
  const words = {};
  const byKey = new Map();
  for (const id of ids) {
    words[id] = game.pending[id] ?? '';
    if (!words[id]) continue;
    const k = wordKey(words[id]);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(id);
  }
  const groups = [...byKey.values()];

  const newPairs = [];
  for (const members of groups) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const key = pairKey(members[i], members[j]);
        if (key in game.pairs) continue; // 已配對過：不重複宣告、不改默契值
        game.pairs[key] = game.round;
        newPairs.push({ a: members[i], b: members[j], tierId: tierForRound(game.round).id });
      }
    }
  }

  const record = {
    words,
    groups,
    newPairs,
    outlierVotes: {},
    outlierEndsAt: game.options.outlierVote ? now + OUTLIER_VOTE_MS : null,
  };
  game.rounds.push(record);
  game.pending = {};
  game.phase = 'revealed';
  return record;
}

// 離譜票：只能投別人本輪的（非空白）詞，targetId 為 null 代表收回
function voteOutlier(game, voterId, targetId, { now } = {}) {
  assertPhase(game, 'revealed');
  requireNow(now);
  if (!game.options.outlierVote) throw new GameError('DISABLED', '本局沒有離譜票');
  assertParticipant(game, voterId);
  const round = game.rounds[game.rounds.length - 1];
  if (now > round.outlierEndsAt) throw new GameError('VOTE_CLOSED', '投票時間已過');
  if (!round.words[voterId]) throw new GameError('NO_WORD', '你這輪沒有送出詞');
  if (targetId == null) {
    delete round.outlierVotes[voterId];
    return round;
  }
  if (targetId === voterId) throw new GameError('BAD_TARGET', '不能投自己');
  if (game.leftIds.includes(targetId) || !round.words[targetId]) throw new GameError('BAD_TARGET', '不能投這個人');
  round.outlierVotes[voterId] = targetId;
  return round;
}

// 揭曉後前進：該結束就產生結算，否則開下一輪。結束判定以此刻狀態重算（揭曉期間有人離開也會反映）
function nextRound(game, { now } = {}) {
  assertPhase(game, 'revealed');
  requireNow(now);
  const reason = checkEnd(game);
  if (reason) {
    finishGame(game, reason);
    return { finished: true, endReason: reason };
  }
  game.round += 1;
  game.pending = {};
  game.phase = 'writing';
  game.roundEndsAt = now + game.options.timerSeconds * 1000;
  return { finished: false };
}

// 房主提前結算：書寫中的本輪作廢
function finishNow(game) {
  assertPhase(game, 'writing', 'revealed');
  finishGame(game, 'host');
  return game.result;
}

function finishGame(game, endReason) {
  game.pending = {};
  game.roundEndsAt = null;
  game.phase = 'finished';
  game.result = buildResult(game, endReason);
}

// 玩家中途離開：之後的輪次從所有配對中排除，已成立的配對保留
function leavePlayer(game, playerId) {
  if (!['writing', 'revealed'].includes(game.phase)) return { changed: false };
  if (!game.activeIds.includes(playerId) || game.leftIds.includes(playerId)) return { changed: false };
  game.leftIds.push(playerId);
  delete game.pending[playerId];
  const remaining = participantsOf(game).length;
  return { changed: true, remaining, allSubmitted: game.phase === 'writing' && remaining > 0 && allSubmitted(game) };
}

// ── 結算 ────────────────────────────────────────────────────────
function tally(items) {
  const m = {};
  for (const id of items) m[id] = (m[id] ?? 0) + 1;
  return m;
}

// 次數最多者（可並列）；最多為 0 回傳 null
function topCount(counts, ids) {
  const max = Math.max(0, ...ids.map(id => counts[id] ?? 0));
  if (max === 0) return null;
  return { playerIds: ids.filter(id => (counts[id] ?? 0) === max), count: max };
}

function buildResult(game, endReason) {
  const ids = participantsOf(game);
  const stats = pairStats(game);
  const hashOf = p => stableHash(p.key);

  const unpaired = unpairedOf(game);
  const unique = unpaired.length === 1 ? unpaired[0] : null;
  const loners = unpaired.length >= 2 ? unpaired : [];

  // 💘 最佳拍檔：默契值最高者（可並列），最多列 TOP_PAIRS 組
  const matched = stats.filter(p => Number.isFinite(p.firstMatch));
  const bestValue = Math.max(0, ...matched.map(p => p.value));
  const bestPairs = matched
    .filter(p => p.value === bestValue)
    .sort((x, y) => hashOf(x) - hashOf(y))
    .slice(0, TOP_PAIRS);

  // 💔 頭號死對頭：從未相同者，依 ①互投離譜票 ②雙方總配對數（少者較糟）③固定雜湊；2 人局不列
  const pairVotes = {};
  const matchCount = {};
  for (const id of ids) matchCount[id] = 0;
  for (const p of matched) { matchCount[p.a] += 1; matchCount[p.b] += 1; }
  const outlierTargets = [];
  for (const r of game.rounds) {
    for (const [voter, target] of Object.entries(r.outlierVotes)) {
      const k = pairKey(voter, target);
      pairVotes[k] = (pairVotes[k] ?? 0) + 1;
      outlierTargets.push(target);
    }
  }
  const worstPairs = game.activeIds.length <= 2 ? [] : stats
    .filter(p => !Number.isFinite(p.firstMatch))
    .sort((x, y) =>
      ((pairVotes[y.key] ?? 0) - (pairVotes[x.key] ?? 0))
      || ((matchCount[x.a] + matchCount[x.b]) - (matchCount[y.a] + matchCount[y.b]))
      || (hashOf(x) - hashOf(y)))
    .slice(0, TOP_PAIRS);

  // 🧲 磁鐵：本輪的詞，被其他人「下一輪」寫出的累計次數
  const magnetCounts = {};
  for (let i = 0; i + 1 < game.rounds.length; i++) {
    const cur = game.rounds[i].words;
    const next = game.rounds[i + 1].words;
    for (const id of ids) {
      if (!cur[id]) continue;
      const k = wordKey(cur[id]);
      for (const other of Object.keys(next)) {
        if (other !== id && next[other] && wordKey(next[other]) === k) magnetCounts[id] = (magnetCounts[id] ?? 0) + 1;
      }
    }
  }

  // 📊 個人默契指數：與所有他人的默契值平均（死對頭 0%）
  const chemistry = {};
  for (const id of ids) {
    const mine = stats.filter(p => p.a === id || p.b === id);
    chemistry[id] = mine.length ? Math.round(mine.reduce((s, p) => s + p.value, 0) / mine.length) : 0;
  }

  return {
    endReason,
    unique,
    loners,
    bestPairs: bestPairs.map(p => ({ a: p.a, b: p.b, firstMatch: p.firstMatch, tierId: p.tierId, value: p.value })),
    worstPairs: worstPairs.map(p => ({ a: p.a, b: p.b, votes: pairVotes[p.key] ?? 0 })),
    magnet: topCount(magnetCounts, ids),
    outlier: topCount(tally(outlierTargets), ids),
    chemistry,
    matrix: stats.map(p => ({ a: p.a, b: p.b, firstMatch: Number.isFinite(p.firstMatch) ? p.firstMatch : null, tierId: p.tierId, value: p.value })),
    leftIds: [...game.leftIds],
  };
}

// ── 每人專屬視圖 ─────────────────────────────────────────────────
function buildView(game, viewerId) {
  const view = {
    phase: game.phase,
    options: game.options,
    round: game.round,
    roundEndsAt: game.roundEndsAt,
    seed: game.seed,
    activeIds: game.activeIds,
    leftIds: game.leftIds,
    // 已揭曉的輪次才有詞；離譜票在結算前不公開
    rounds: game.rounds.map(r => ({ words: r.words, groups: r.groups, newPairs: r.newPairs, outlierEndsAt: r.outlierEndsAt })),
    pairs: Object.entries(game.pairs).map(([key, firstMatch]) => {
      const [a, b] = key.split('|');
      return { a, b, firstMatch, tierId: tierForRound(firstMatch).id };
    }),
    result: game.result,
  };
  if (game.phase === 'writing') {
    // 只下發「誰已送出」與自己的詞；不下發送出時間
    view.submitted = Object.fromEntries(participantsOf(game).map(id => [id, id in game.pending]));
    view.myWord = game.pending[viewerId] ?? null;
  }
  if (game.phase === 'revealed') {
    view.endsAfterThis = checkEnd(game);
    view.myOutlierVote = game.rounds[game.rounds.length - 1].outlierVotes[viewerId] ?? null;
  }
  return view;
}

module.exports = {
  GameError,
  MIN_PLAYERS, MAX_PLAYERS, WORD_MAX_LEN, OUTLIER_VOTE_MS, TOP_PAIRS,
  DEFAULT_OPTIONS, CHEMISTRY_TIERS, NO_MATCH_TIER,
  normalizeWord, wordKey, tierForRound, resolveOptions,
  createGame, resetGame, startGame, submitWord, settleRound, voteOutlier, nextRound, finishNow, leavePlayer,
  participantsOf, unpairedOf, pairStats, checkEnd, buildResult, buildView,
};
