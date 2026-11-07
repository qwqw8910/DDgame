'use strict';

// ================================================================
//  同詞相遇（same-word）— 純遊戲邏輯（不碰 socket / DB / 計時器，方便單元測試）
//
//  規格：docs/same-word-spec.md（v4：題目驅動 + 終局收斂；另有接龍模式）
//  - 前 N 輪（prompt）：每輪一個題目，所有人同時寫一個詞、同時揭曉；
//    詞「正規化後完全相同」才算同詞。同詞組有 k 人，組內每人得 k-1 分；全員同詞再各加 3 分
//  - 終局（converge，可關）：全員合作，看上一輪的詞往中間靠攏，最多 3 次；
//    第幾次全員同詞，全場各得 6／4／2 分，失敗不扣分
//  - 接龍模式（mode='chain'）：固定 6 輪，只有第 1 輪給題目，之後以上一輪大家的詞為線索，
//    前面出現過的詞不能再寫；每輪計分同上，全員同詞即加分並提早結束
//  - 接句模式（mode='relay'）：依順序輪流接「三個字」，寫的人只看得到上一段；接完揭曉整段話，
//    大家對別人的每一段按讚或大便，最後頒獎（不計分、不算默契）
//  - 兩兩默契 = 計分輪中兩人寫出相同詞的比例（終局不計）
//  - rng 與 now 由呼叫端注入；自動前進的計時由 index.js 負責（本檔只存 autoNextAt）
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
const ROUNDS_MIN = 3;
const ROUNDS_MAX = 10;
const REVEAL_MIN_SECONDS = 5;
const REVEAL_MAX_SECONDS = 60;
const TOP_PAIRS = 3; // 最佳拍檔 / 頭號死對頭 最多列幾組

const ALL_SAME_BONUS = 3;                 // 全員同詞：全場各加
const CONVERGE_POINTS = [6, 4, 2];        // 終局第 1／2／3 次成功的全場得分
const CONVERGE_MAX = CONVERGE_POINTS.length;
const REACTIONS = ['🤣', '🤔', '👏'];

const MODES = ['prompts', 'chain', 'relay'];
const CHAIN_ROUNDS = 6;

// 接句模式
const SEGMENT_LEN = 3;                   // 每段剛好 3 個字（標點不算）
const SEGMENT_PUNCT = '，。！？、…～';    // 可以夾在字裡的標點，讓整段話有節奏
const TURN_MIN_SECONDS = 5;
const TURN_MAX_SECONDS = 30;
const LAPS_MIN = 1;
const LAPS_MAX = 5;
const TURN_GRACE_MS = 600;               // 網路延遲寬限：倒數歸零後這段時間內送達仍算數
const VOTE_SECONDS = 60;                 // 投票時間（另加每段 0.6 秒給揭曉動畫）
const VOTES = ['up', 'poop'];

const DEFAULT_OPTIONS = { mode: 'prompts', rounds: 5, timerSeconds: 30, converge: true, revealSeconds: 10, turnSeconds: 8, laps: 2 };

// 默契稱號：依兩人同詞比例（value 0–100）。tierForValue 取第一個 min <= value 者
const CHEMISTRY_TIERS = [
  { id: 'soulmates', emoji: '💘', title: '天生一對', min: 90 },
  { id: 'telepathy', emoji: '✨', title: '心有靈犀', min: 75 },
  { id: 'in-sync', emoji: '🤝', title: '默契十足', min: 60 },
  { id: 'compatible', emoji: '😊', title: '還算合拍', min: 45 },
  { id: 'slow-burn', emoji: '🌱', title: '慢熟型', min: 30 },
  { id: 'needs-work', emoji: '🔧', title: '需要磨合', min: 20 },
  { id: 'barely', emoji: '😅', title: '勉強同頻', min: 10 },
  { id: 'near-miss', emoji: '🩹', title: '差點錯過', min: 1 },
  { id: 'rivals', emoji: '💔', title: '死對頭', min: 0 },
];

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── 小工具 ──────────────────────────────────────────────────────
// FNV-1a：固定雜湊，讓並列排序可重現
function stableHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function requireNow(now) {
  if (!Number.isFinite(now)) throw new GameError('BAD_ARG', '缺少時間參數 now');
}

function tierForValue(value) {
  return CHEMISTRY_TIERS.find(t => value >= t.min) ?? CHEMISTRY_TIERS[CHEMISTRY_TIERS.length - 1];
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Fisher–Yates 抽 n 題，不重複；題庫不足時循環補足
function drawPrompts(bank, n, rng = Math.random) {
  const pool = [...bank];
  const out = [];
  while (out.length < n) {
    if (!pool.length) pool.push(...bank);
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

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
  if (!MODES.includes(o.mode)) throw new GameError('BAD_OPTIONS', '模式不正確');
  if (!Number.isInteger(o.timerSeconds) || o.timerSeconds < TIMER_MIN_SECONDS || o.timerSeconds > TIMER_MAX_SECONDS) {
    throw new GameError('BAD_OPTIONS', `思考時間需為 ${TIMER_MIN_SECONDS}–${TIMER_MAX_SECONDS} 秒`);
  }
  if (!Number.isInteger(o.rounds) || o.rounds < ROUNDS_MIN || o.rounds > ROUNDS_MAX) {
    throw new GameError('BAD_OPTIONS', `題目輪數需為 ${ROUNDS_MIN}–${ROUNDS_MAX}`);
  }
  if (typeof o.converge !== 'boolean') throw new GameError('BAD_OPTIONS', '終局挑戰設定不正確');
  if (!Number.isInteger(o.revealSeconds) || o.revealSeconds < REVEAL_MIN_SECONDS || o.revealSeconds > REVEAL_MAX_SECONDS) {
    throw new GameError('BAD_OPTIONS', `揭曉停留需為 ${REVEAL_MIN_SECONDS}–${REVEAL_MAX_SECONDS} 秒`);
  }
  if (!Number.isInteger(o.turnSeconds) || o.turnSeconds < TURN_MIN_SECONDS || o.turnSeconds > TURN_MAX_SECONDS) {
    throw new GameError('BAD_OPTIONS', `接句時間需為 ${TURN_MIN_SECONDS}–${TURN_MAX_SECONDS} 秒`);
  }
  if (!Number.isInteger(o.laps) || o.laps < LAPS_MIN || o.laps > LAPS_MAX) {
    throw new GameError('BAD_OPTIONS', `每人接句次數需為 ${LAPS_MIN}–${LAPS_MAX}`);
  }
  return o;
}

function createGame(options = {}) {
  return {
    phase: 'waiting',
    options: resolveOptions(options),
    round: 0,          // 總輪次（含終局的每一次）
    promptIndex: 0,    // 目前是第幾個題目輪（終局時維持最後值）
    kind: null,        // 'prompt' | 'chain'（接龍第 2 輪起）| 'converge'
    prompt: null,      // 目前題目（接龍第 2 輪起與終局為 null）
    attempt: 0,        // 終局第幾次
    roundEndsAt: null,
    autoNextAt: null,  // 揭曉後自動前進的時間（index.js 排程）
    prompts: [],       // 本局題目（只存在伺服器，不下發未來的題目）
    rounds: [],        // 已揭曉的輪次
    pending: {},       // 本輪已送出內容（只存在伺服器）
    activeIds: [],     // 本局參與者（開始時鎖定）
    leftIds: [],       // 中途離開者（仍留在 activeIds，已得分數與配對保留）
    scores: {},        // playerId → 分數
    lones: {},         // playerId → 全場唯一次數
    matches: {},       // pairKey → 題目輪中同詞次數
    promptsDone: 0,    // 已揭曉的計分輪數（題目輪或接龍輪）
    allSameAt: null,   // 接龍：第幾輪全員同詞（提前結束）
    converge: null,    // null | { success, attempt }
    relay: null,       // 接句模式狀態，見 startRelay
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
const isChain = game => game.options.mode === 'chain';
const isRelay = game => game.options.mode === 'relay';
const totalScoredRounds = game => (isChain(game) ? CHAIN_ROUNDS : game.options.rounds);
const allSubmitted = game => participantsOf(game).every(id => id in game.pending);

function assertPhase(game, ...phases) {
  if (!phases.includes(game.phase)) throw new GameError('BAD_PHASE', '現在不能這樣做');
}
function assertParticipant(game, playerId) {
  if (!participantsOf(game).includes(playerId)) throw new GameError('FORBIDDEN', '你不在這一局中');
}

// 每一對玩家的同詞次數與比例；預設不含已離場者
function pairStats(game, { includeLeft = false } = {}) {
  const ids = includeLeft ? game.activeIds : participantsOf(game);
  const total = game.promptsDone;
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const key = pairKey(ids[i], ids[j]);
      const count = game.matches[key] ?? 0;
      const value = total ? Math.round((count / total) * 100) : 0;
      out.push({ a: ids[i], b: ids[j], key, count, total, value, tierId: tierForValue(value).id });
    }
  }
  return out;
}

// 揭曉後下一步：'prompt'（下一個題目）／'chain'（接龍下一輪）／'converge'（開始或繼續終局）／null（結束）
function nextStep(game) {
  if (isChain(game)) {
    if (game.allSameAt || participantsOf(game).length < MIN_PLAYERS) return null;
    return game.promptIndex < CHAIN_ROUNDS ? 'chain' : null;
  }
  if (game.kind === 'prompt') {
    if (game.promptIndex < game.options.rounds) return 'prompt';
    return game.options.converge && participantsOf(game).length >= MIN_PLAYERS ? 'converge' : null;
  }
  if (game.converge?.success) return null;
  return game.attempt < CONVERGE_MAX ? 'converge' : null;
}

// ── 流程 ────────────────────────────────────────────────────────
function startGame(game, playerIds, { now, rng = Math.random, prompts = null, themes = null } = {}) {
  assertPhase(game, 'waiting');
  requireNow(now);
  if (!Array.isArray(playerIds) || new Set(playerIds).size !== playerIds.length) throw new GameError('BAD_PLAYERS', '玩家名單不正確');
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    throw new GameError('BAD_PLAYERS', `需要 ${MIN_PLAYERS}–${MAX_PLAYERS} 位玩家`);
  }
  if (isRelay(game)) return startRelay(game, playerIds, { now, rng, themes });
  if (!Array.isArray(prompts) || !prompts.length) throw new GameError('NO_PROMPTS', '沒有可用的題目');
  game.prompts = drawPrompts(prompts, isChain(game) ? 1 : game.options.rounds, rng);
  game.activeIds = [...playerIds];
  game.leftIds = [];
  game.scores = Object.fromEntries(playerIds.map(id => [id, 0]));
  game.lones = Object.fromEntries(playerIds.map(id => [id, 0]));
  beginRound(game, 'prompt', now);
  return game;
}

function beginRound(game, kind, now) {
  game.round += 1;
  game.kind = kind;
  if (kind === 'prompt' || kind === 'chain') {
    game.promptIndex += 1;
    game.prompt = kind === 'prompt' ? game.prompts[game.promptIndex - 1] : null;
  } else {
    game.attempt += 1;
    game.prompt = null;
  }
  game.pending = {};
  game.autoNextAt = null;
  game.phase = 'writing';
  game.roundEndsAt = now + game.options.timerSeconds * 1000;
}

// 接龍：前面各輪出現過的詞 key，本輪不可再寫
function usedKeys(game) {
  const keys = new Set();
  for (const r of game.rounds) for (const w of Object.values(r.words)) if (w) keys.add(wordKey(w));
  return keys;
}

// 送出（可覆蓋，直到揭曉）。回傳是否全員已送出，由 index.js 決定何時 settleRound
function submitWord(game, playerId, rawWord, { now } = {}) {
  assertPhase(game, 'writing');
  requireNow(now);
  assertParticipant(game, playerId);
  if (now > game.roundEndsAt) throw new GameError('TIME_UP', '時間到了');
  const word = normalizeWord(rawWord);
  if (!word) throw new GameError('BAD_WORD', '請輸入中文或英文（1–12 字）');
  if (game.kind === 'chain' && usedKeys(game).has(wordKey(word))) throw new GameError('WORD_USED', '這個詞前面用過了，換一個吧');
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
  const allSame = ids.length >= MIN_PLAYERS && groups.length === 1 && groups[0].length === ids.length;

  const points = Object.fromEntries(ids.map(id => [id, 0]));
  let lone = [];

  if (game.kind === 'prompt' || game.kind === 'chain') {
    for (const members of groups) {
      for (const id of members) points[id] += members.length - 1;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          const key = pairKey(members[i], members[j]);
          game.matches[key] = (game.matches[key] ?? 0) + 1;
        }
      }
    }
    if (allSame) {
      for (const id of ids) points[id] += ALL_SAME_BONUS;
      if (game.kind === 'chain') game.allSameAt = game.promptIndex;
    }
    // 兩人局只有「配不配」，不頒唯一徽章
    if (ids.length >= 3) lone = groups.filter(g => g.length === 1).map(g => g[0]);
    for (const id of lone) game.lones[id] = (game.lones[id] ?? 0) + 1;
    game.promptsDone += 1;
  } else if (allSame) {
    const bonus = CONVERGE_POINTS[game.attempt - 1] ?? 0;
    for (const id of ids) points[id] += bonus;
    game.converge = { success: true, attempt: game.attempt };
  } else if (game.attempt >= CONVERGE_MAX) {
    game.converge = { success: false, attempt: game.attempt };
  }

  for (const id of ids) game.scores[id] = (game.scores[id] ?? 0) + points[id];

  const record = {
    kind: game.kind,
    prompt: game.prompt,
    attempt: game.kind === 'converge' ? game.attempt : 0,
    words,
    groups,
    allSame,
    points,
    lone,
    reactions: {},   // voterId → { targetId → emoji }
  };
  game.rounds.push(record);
  game.pending = {};
  game.phase = 'revealed';
  game.autoNextAt = now + game.options.revealSeconds * 1000;
  return record;
}

// 揭曉時的表情反應：對別人的詞貼一個 emoji，emoji 為 null 代表收回
function react(game, voterId, targetId, emoji) {
  assertPhase(game, 'revealed');
  assertParticipant(game, voterId);
  const round = game.rounds[game.rounds.length - 1];
  if (!round.words[voterId]) throw new GameError('NO_WORD', '你這輪沒有送出詞');
  if (targetId === voterId) throw new GameError('BAD_TARGET', '不能對自己的詞反應');
  if (game.leftIds.includes(targetId) || !round.words[targetId]) throw new GameError('BAD_TARGET', '不能對這個人反應');
  if (emoji !== null && !REACTIONS.includes(emoji)) throw new GameError('BAD_REACTION', '不支援這個表情');
  const mine = (round.reactions[voterId] ??= {});
  if (emoji === null) delete mine[targetId];
  else mine[targetId] = emoji;
  return round;
}

// 揭曉後前進：該結束就產生結算，否則開下一輪。結束判定以此刻狀態重算（揭曉期間有人離開也會反映）
function nextRound(game, { now } = {}) {
  assertPhase(game, 'revealed');
  requireNow(now);
  const step = nextStep(game);
  if (!step) {
    finishGame(game, 'complete');
    return { finished: true };
  }
  beginRound(game, step, now);
  return { finished: false, kind: step };
}

// 房主提前結算：書寫中的本輪作廢
function finishNow(game) {
  assertPhase(game, 'writing', 'revealed', 'relay', 'voting');
  finishGame(game, 'host');
  return game.result;
}

function finishGame(game, endReason) {
  game.pending = {};
  game.roundEndsAt = null;
  game.autoNextAt = null;
  if (game.relay) { game.relay.turnEndsAt = null; game.relay.voteEndsAt = null; }
  game.phase = 'finished';
  game.result = isRelay(game) ? buildRelayResult(game, endReason) : buildResult(game, endReason);
}

// 玩家中途離開：之後的輪次從所有計算中排除，已得分數保留
function leavePlayer(game, playerId, { now = Date.now() } = {}) {
  if (!['writing', 'revealed', 'relay', 'voting'].includes(game.phase)) return { changed: false };
  if (!game.activeIds.includes(playerId) || game.leftIds.includes(playerId)) return { changed: false };
  if (game.phase === 'relay') {
    const wasWriter = relayWriter(game) === playerId;
    game.leftIds.push(playerId);
    // 輪到的人離開：同一個位置換下一位接，重新計時
    if (wasWriter) {
      game.relay.turnStartedAt = now;
      game.relay.turnEndsAt = now + game.options.turnSeconds * 1000;
    }
    return { changed: true, remaining: participantsOf(game).length, allSubmitted: false, writerChanged: wasWriter };
  }
  game.leftIds.push(playerId);
  delete game.pending[playerId];
  const remaining = participantsOf(game).length;
  return { changed: true, remaining, allSubmitted: game.phase === 'writing' && remaining > 0 && allSubmitted(game) };
}

// ── 結算 ────────────────────────────────────────────────────────
function reactionCounts(rounds, emoji) {
  const m = {};
  for (const r of rounds) {
    for (const mine of Object.values(r.reactions)) {
      for (const [target, e] of Object.entries(mine)) if (e === emoji) m[target] = (m[target] ?? 0) + 1;
    }
  }
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

  // 🏆 排行：分數高者在前；同分依固定雜湊，排序可重現。winners 為並列第一
  const ranking = [...ids].sort((x, y) => (game.scores[y] - game.scores[x]) || (stableHash(x) - stableHash(y)));
  const topScore = ranking.length ? game.scores[ranking[0]] : 0;
  const winners = topScore > 0 ? ranking.filter(id => game.scores[id] === topScore) : [];

  // 💘 最佳拍檔：同詞比例最高者（須 > 0，可並列），最多列 TOP_PAIRS 組
  const bestValue = Math.max(0, ...stats.map(p => p.value));
  const bestPairs = bestValue > 0
    ? stats.filter(p => p.value === bestValue).sort((x, y) => hashOf(x) - hashOf(y)).slice(0, TOP_PAIRS)
    : [];

  // 💔 頭號死對頭：比例最低者，依雙方總同詞數（少者較糟）再固定雜湊；2 人局或沒有高低差時不列
  const matchTotal = {};
  for (const id of ids) matchTotal[id] = 0;
  for (const p of stats) { matchTotal[p.a] += p.count; matchTotal[p.b] += p.count; }
  const worstPairs = ids.length <= 2 ? [] : stats
    .filter(p => p.value < bestValue)
    .sort((x, y) => (x.value - y.value) || ((matchTotal[x.a] + matchTotal[x.b]) - (matchTotal[y.a] + matchTotal[y.b])) || (hashOf(x) - hashOf(y)))
    .slice(0, TOP_PAIRS);

  // 📊 個人默契指數：與所有他人同詞比例的平均
  const chemistry = {};
  for (const id of ids) {
    const mine = stats.filter(p => p.a === id || p.b === id);
    chemistry[id] = mine.length ? Math.round(mine.reduce((s, p) => s + p.value, 0) / mine.length) : 0;
  }

  const pairOut = p => ({ a: p.a, b: p.b, count: p.count, total: p.total, value: p.value, tierId: p.tierId });
  return {
    endReason,
    scores: Object.fromEntries(ids.map(id => [id, game.scores[id] ?? 0])),
    ranking,
    winners,
    converge: game.converge,
    unique: topCount(game.lones, ids),
    laugh: topCount(reactionCounts(game.rounds, '🤣'), ids),
    bestPairs: bestPairs.map(pairOut),
    worstPairs: worstPairs.map(pairOut),
    chemistry,
    matrix: stats.map(pairOut),
    promptsDone: game.promptsDone,
    mode: game.options.mode,
    allSameAt: game.allSameAt,
    leftIds: [...game.leftIds],
  };
}

// ── 接句模式 ────────────────────────────────────────────────────
// 依順序輪流，每人一次接 3 個字；寫的人只看得到上一段（盲接）。全部接完進入 voting，
// 揭曉整段話，參與者對別人的每一段按讚或大便；房主公布（或時間到）後 finished。

// 回傳可顯示的一段（去空白、全形英數轉半形、半形標點轉全形）；不合規回傳 null
function normalizeSegment(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/,/g, '，').replace(/\?/g, '？').replace(/!/g, '！').replace(/~/g, '～');
  const chars = [...s];
  const body = chars.filter(c => !SEGMENT_PUNCT.includes(c));
  if (body.length !== SEGMENT_LEN || chars.length > SEGMENT_LEN * 2) return null;
  if (!body.every(c => /^[一-鿿A-Za-z0-9]$/.test(c))) return null;
  return s;
}

function startRelay(game, playerIds, { now, rng, themes }) {
  if (!Array.isArray(themes) || !themes.length) throw new GameError('NO_PROMPTS', '沒有可用的主題');
  // 順序打亂，不讓房主永遠第一個
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  game.activeIds = [...playerIds];
  game.leftIds = [];
  game.scores = Object.fromEntries(playerIds.map(id => [id, 0]));
  game.lones = {};
  game.relay = {
    theme: themes[Math.floor(rng() * themes.length)],
    order,
    total: playerIds.length * game.options.laps,
    segments: [],      // { by, text, ms, timeout }
    votes: {},         // voterId → { segmentIndex → 'up' | 'poop' }
    turnStartedAt: now,
    turnEndsAt: now + game.options.turnSeconds * 1000,
    voteEndsAt: null,
  };
  game.phase = 'relay';
  return game;
}

// 目前輪到誰：依原本順序跳過已離開的人
function relayWriter(game) {
  const r = game.relay;
  if (!r || game.phase !== 'relay') return null;
  const order = r.order.filter(id => !game.leftIds.includes(id));
  return order.length ? order[r.segments.length % order.length] : null;
}

function pushSegment(game, seg, now) {
  const r = game.relay;
  r.segments.push(seg);
  if (r.segments.length >= r.total) {
    game.phase = 'voting';
    r.turnEndsAt = null;
    r.voteEndsAt = now + (VOTE_SECONDS + Math.ceil(r.total * 0.6)) * 1000;
    return { done: true };
  }
  r.turnStartedAt = now;
  r.turnEndsAt = now + game.options.turnSeconds * 1000;
  return { done: false };
}

function submitSegment(game, playerId, raw, { now } = {}) {
  assertPhase(game, 'relay');
  requireNow(now);
  assertParticipant(game, playerId);
  if (relayWriter(game) !== playerId) throw new GameError('NOT_YOUR_TURN', '還沒輪到你');
  if (now > game.relay.turnEndsAt + TURN_GRACE_MS) throw new GameError('TIME_UP', '時間到了');
  const text = normalizeSegment(raw);
  if (!text) throw new GameError('BAD_SEGMENT', `請剛好寫 ${SEGMENT_LEN} 個字（標點不算）`);
  return pushSegment(game, { by: playerId, text, ms: Math.max(0, now - game.relay.turnStartedAt), timeout: false }, now);
}

// 時間到沒寫：記成「卡住」，換下一位
function timeoutTurn(game, { now } = {}) {
  assertPhase(game, 'relay');
  requireNow(now);
  if (now < game.relay.turnEndsAt + TURN_GRACE_MS) throw new GameError('TOO_EARLY', '還在倒數');
  return pushSegment(game, { by: relayWriter(game), text: '', ms: null, timeout: true }, now);
}

// 對別人的某一段投「讚」或「大便」，value 為 null 代表收回
function voteSegment(game, voterId, index, value) {
  assertPhase(game, 'voting');
  assertParticipant(game, voterId);
  const seg = Number.isInteger(index) ? game.relay.segments[index] : null;
  if (!seg) throw new GameError('BAD_TARGET', '沒有這一段');
  if (seg.timeout) throw new GameError('BAD_TARGET', '卡住的段落不能投');
  if (seg.by === voterId) throw new GameError('BAD_TARGET', '不能投自己寫的');
  if (value !== null && !VOTES.includes(value)) throw new GameError('BAD_VOTE', '只能按讚或大便');
  const mine = (game.relay.votes[voterId] ??= {});
  if (value === null) delete mine[index];
  else mine[index] = value;
}

function endVoting(game) {
  assertPhase(game, 'voting');
  finishGame(game, 'complete');
  return game.result;
}

// 整段話（卡住的段落跳過）
const relayStory = segments => segments.filter(s => !s.timeout).map(s => s.text).join('');

function relayView(game, viewerId) {
  const r = game.relay;
  const writerId = relayWriter(game);
  const v = {
    theme: r.theme,
    order: r.order,
    total: r.total,
    done: r.segments.length,
    writerId,
    turnEndsAt: r.turnEndsAt,
    voteEndsAt: r.voteEndsAt,
    // 每一段是誰、有沒有卡住：接句中也公開（看得到進度），但不公開內容
    turns: r.segments.map(s => ({ by: s.by, timeout: s.timeout })),
  };
  if (game.phase === 'relay') {
    // 只有輪到的人看得到上一段；往回找最近一段沒卡住的
    const prev = [...r.segments].reverse().find(s => !s.timeout);
    v.prev = writerId === viewerId ? (prev?.text ?? null) : null;
    v.mySegments = r.segments.filter(s => s.by === viewerId && !s.timeout).map(s => s.text);
  } else {
    v.segments = r.segments.map(s => ({ by: s.by, text: s.text, timeout: s.timeout }));
    v.story = relayStory(r.segments);
    v.myVotes = r.votes[viewerId] ?? {};
    // 投票中不公開票數（避免跟風），只公開投過票的人數
    v.voters = Object.values(r.votes).filter(m => Object.keys(m).length).length;
  }
  return v;
}

function buildRelayResult(game, endReason) {
  const r = game.relay;
  const ids = participantsOf(game);
  const segments = r.segments.map(s => ({ by: s.by, text: s.text, timeout: s.timeout, ms: s.ms, up: 0, poop: 0 }));
  for (const mine of Object.values(r.votes)) {
    for (const [i, v] of Object.entries(mine)) if (segments[i]) segments[i][v] += 1;
  }

  const sum = key => {
    const m = {};
    for (const s of segments) if (!s.timeout) m[s.by] = (m[s.by] ?? 0) + s[key];
    return m;
  };
  const stuck = {};
  for (const s of segments) if (s.timeout) stuck[s.by] = (stuck[s.by] ?? 0) + 1;

  // ⚡ 閃電手：平均反應時間最短（至少接成一段）
  const times = {};
  for (const s of segments) if (!s.timeout) (times[s.by] ??= []).push(s.ms);
  let fastest = null;
  for (const id of ids) {
    if (!times[id]) continue;
    const ms = Math.round(times[id].reduce((a, b) => a + b, 0) / times[id].length);
    if (!fastest || ms < fastest.ms) fastest = { playerIds: [id], ms };
    else if (ms === fastest.ms) fastest.playerIds.push(id);
  }

  // 單段票數最多的段落（須 > 0，可並列）
  const topSegments = key => {
    const max = Math.max(0, ...segments.map(s => s[key]));
    return max ? segments.flatMap((s, i) => (s[key] === max ? [i] : [])) : [];
  };

  // 全員並列就不頒（等於沒有分出高下）
  const award = top => (top && ids.length > 1 && top.playerIds.length === ids.length ? null : top);

  return {
    mode: 'relay',
    endReason,
    theme: r.theme,
    story: relayStory(r.segments),
    segments,
    total: r.total,
    best: award(topCount(sum('up'), ids)),
    poop: award(topCount(sum('poop'), ids)),
    stuck: award(topCount(stuck, ids)),
    fastest: award(fastest),
    bestSegments: topSegments('up'),
    poopSegments: topSegments('poop'),
    leftIds: [...game.leftIds],
  };
}

// ── 每人專屬視圖 ─────────────────────────────────────────────────
function buildView(game, viewerId) {
  const view = {
    phase: game.phase,
    options: game.options,
    round: game.round,
    kind: game.kind,
    prompt: game.prompt,
    promptIndex: game.promptIndex,
    promptTotal: totalScoredRounds(game),
    attempt: game.attempt,
    convergeMax: CONVERGE_MAX,
    roundEndsAt: game.roundEndsAt,
    autoNextAt: game.autoNextAt,
    activeIds: game.activeIds,
    leftIds: game.leftIds,
    scores: game.scores,
    converge: game.converge,
    // 已揭曉的輪次才有詞；反應只下發每個詞收到的個數，不公開是誰貼的
    rounds: game.rounds.map(r => ({
      kind: r.kind, prompt: r.prompt, attempt: r.attempt,
      words: r.words, groups: r.groups, allSame: r.allSame, points: r.points, lone: r.lone,
      reactions: reactionTotals(r),
    })),
    pairs: pairStats(game).map(p => ({ a: p.a, b: p.b, count: p.count, value: p.value, tierId: p.tierId })),
    result: game.result,
  };
  if (game.relay) view.relay = relayView(game, viewerId);
  if (game.phase === 'writing') {
    // 只下發「誰已送出」與自己的詞；不下發送出時間
    view.submitted = Object.fromEntries(participantsOf(game).map(id => [id, id in game.pending]));
    view.myWord = game.pending[viewerId] ?? null;
  }
  if (game.phase === 'revealed') {
    view.nextStep = nextStep(game);
    view.myReactions = game.rounds[game.rounds.length - 1].reactions[viewerId] ?? {};
  }
  return view;
}

// { targetId: { '🤣': 2, ... } }
function reactionTotals(round) {
  const m = {};
  for (const mine of Object.values(round.reactions)) {
    for (const [target, e] of Object.entries(mine)) {
      m[target] ??= {};
      m[target][e] = (m[target][e] ?? 0) + 1;
    }
  }
  return m;
}

module.exports = {
  GameError,
  MIN_PLAYERS, MAX_PLAYERS, WORD_MAX_LEN, TOP_PAIRS, ALL_SAME_BONUS, CONVERGE_POINTS, CONVERGE_MAX, REACTIONS,
  DEFAULT_OPTIONS, CHEMISTRY_TIERS, MODES, CHAIN_ROUNDS, SEGMENT_LEN, TURN_GRACE_MS, VOTE_SECONDS,
  normalizeSegment, relayWriter, submitSegment, timeoutTurn, voteSegment, endVoting,
  normalizeWord, wordKey, tierForValue, resolveOptions, drawPrompts,
  createGame, resetGame, startGame, submitWord, settleRound, react, nextRound, finishNow, leavePlayer,
  participantsOf, pairStats, nextStep, buildResult, buildView,
};
