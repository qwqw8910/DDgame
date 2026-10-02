'use strict';

// ================================================================
//  山中別館殺人事件 — 純遊戲邏輯（不碰 socket / DB，方便單元測試）
//
//  規則來源：docs/design/game-background.md
//  Open Questions 的暫定值（改規則只需改這裡的常數）：
//    - 殺人魔 / 共犯開局互不相識
//    - 每人 1 票，可投自己的地點；客房、鍋爐室不可投
//    - 平票：所有同票最高的地點，其角色牌一併進鍋爐室
//    - Level 配置見 LEVEL_ROLES（必備角色以外全是客人）
//    - Level 3 / 5 至少 4 人（見 LEVEL_MIN_PLAYERS）
//    - 開票階段（Level 3+）：律師公開 → 作廢指定玩家的票；富商公開 → 自己的票算 2 票。
//      兩者皆為自願公開，不公開則沒有能力。律師不能選自己。
//    - 勝負：炸彈客在鍋爐室 → 炸彈客單獨獲勝（優先），否則看殺人魔
// ================================================================

// 單人試玩模式：true 時 1 人即可開局（所有 Level 皆不限最少人數）。
// TODO: 正式上線改回 false（需與 vue-app/src/apps/mountain-lodge/data/constants.js 的 SOLO_TEST 同步）
const SOLO_TEST = true;
const MIN_PLAYERS = SOLO_TEST ? 1 : 3;
const MAX_PLAYERS = 6;
const LEVELS = [1, 2, 3, 4, 5];
// 各 Level 的必備角色（其餘補客人）；角色牌總數 = 玩家數 + 1
const LEVEL_ROLES = {
  1: ['killer'],
  2: ['killer', 'accomplice'],
  3: ['killer', 'accomplice', 'lawyer'],
  4: ['killer', 'bomber'],
  5: ['killer', 'bomber', 'merchant'],
};
const LEVEL_MIN_PLAYERS = SOLO_TEST ? {} : { 3: 4, 5: 4 };
const REVEAL_SECONDS = 20; // 開票階段固定時長（不提前結束，避免從時間差推測誰有能力）
const REVEAL_ROLES = ['lawyer', 'merchant'];
const KILLER_TEAM = ['killer', 'accomplice'];
const DISCUSSION_CHOICES = [60, 120, 180, 240, 300];
const DEFAULT_DISCUSSION_SECONDS = 180;

// 玩家可分配的地點（客房、鍋爐室固定在中央，不在此列）
const PLAYER_LOCATIONS = ['lounge', 'gallery', 'billiards', 'study', 'entrance', 'dining'];

// 客人顏色：黃×2、藍×1、紅×1（原規則），人數 5、6 時補綠、紫
const GUEST_COLORS = ['yellow', 'yellow', 'blue', 'red', 'green', 'purple'];

const PHASES = ['lobby', 'passing', 'discussion', 'voting', 'reveal', 'result'];

const minPlayersForLevel = level => LEVEL_MIN_PLAYERS[level] ?? MIN_PLAYERS;

function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── 設定 ────────────────────────────────────────────────────────
function normalizeSettings({ level, discussionSeconds } = {}) {
  const lv = Number(level);
  const secs = Number(discussionSeconds);
  return {
    level: LEVELS.includes(lv) ? lv : 1,
    discussionSeconds: DISCUSSION_CHOICES.includes(secs) ? secs : DEFAULT_DISCUSSION_SECONDS,
  };
}

function createLobby(settings = {}) {
  return {
    phase: 'lobby',
    ...normalizeSettings(settings),
    gameNo: 0,
    // 以下欄位於 startGame 後才有意義
    order: [],
    locations: {},
    deck: [],
    kept: {},
    lodgeRoomCard: null,
    actorId: null,
    hand: [],
    remaining: [],
    history: [],
    publicLog: [],
    endsAt: null,
    votes: {},
    reveals: [],
    result: null,
  };
}

// ── 牌組 ────────────────────────────────────────────────────────
// 角色牌數量 = 玩家數 + 1（多出的 1 張最後進客房）
function buildDeck(level, playerCount, rng = Math.random) {
  const total = playerCount + 1;
  const cards = (LEVEL_ROLES[level] ?? LEVEL_ROLES[1]).map(kind => ({ kind }));
  const guestCount = total - cards.length;
  for (let i = 0; i < guestCount; i++) {
    cards.push({ kind: 'guest', color: GUEST_COLORS[i % GUEST_COLORS.length] });
  }
  return shuffle(cards, rng).map((c, i) => ({ id: `c${i}`, ...c }));
}

// ── 開局 ────────────────────────────────────────────────────────
function startGame(game, playerIds, rng = Math.random) {
  if (game.phase !== 'lobby') throw new GameError('GAME_IN_PROGRESS', '遊戲已經開始');
  const n = playerIds.length;
  if (n < MIN_PLAYERS) throw new GameError('NOT_ENOUGH', `至少需要 ${MIN_PLAYERS} 位玩家！`);
  if (n > MAX_PLAYERS) throw new GameError('TOO_MANY', `最多 ${MAX_PLAYERS} 位玩家！`);
  const need = minPlayersForLevel(game.level);
  if (n < need) throw new GameError('NOT_ENOUGH', `Level ${game.level} 至少需要 ${need} 位玩家！`);

  const order = shuffle(playerIds, rng);
  const locs = shuffle(PLAYER_LOCATIONS, rng).slice(0, n);
  const locations = {};
  playerIds.forEach((pid, i) => { locations[pid] = locs[i]; });

  const deck = buildDeck(game.level, n, rng);

  game.gameNo += 1;
  game.phase = 'passing';
  game.order = order;
  game.locations = locations;
  game.deck = deck;
  game.kept = {};
  game.lodgeRoomCard = null;
  game.history = [];
  game.publicLog = [];
  game.votes = {};
  game.reveals = [];
  game.result = null;
  game.endsAt = null;
  game.remaining = [...order];

  // 第一位玩家：從牌堆抽 2 張
  game.actorId = order[0];
  game.hand = [
    { card: game.deck.shift(), from: 'deck' },
    { card: game.deck.shift(), from: 'deck' },
  ];
  return game;
}

// ── 傳牌 ────────────────────────────────────────────────────────
// actor 留下 keepCardId；另一張傳給 passTo（尚無角色者），最後一位則放進客房。
function keepCard(game, playerId, keepCardId, passTo) {
  if (game.phase !== 'passing') throw new GameError('BAD_PHASE', '現在不是傳牌階段');
  if (playerId !== game.actorId) throw new GameError('NOT_YOUR_TURN', '還沒輪到你！');

  const keptEntry = game.hand.find(h => h.card.id === keepCardId);
  if (!keptEntry) throw new GameError('BAD_CARD', '選的牌不在你手上');
  const otherEntry = game.hand.find(h => h.card.id !== keepCardId);

  const isLast = game.remaining.length === 1;
  const candidates = game.remaining.filter(id => id !== playerId);
  if (!isLast) {
    if (!passTo || !candidates.includes(passTo)) {
      throw new GameError('BAD_TARGET', '只能傳給還沒有角色的玩家');
    }
  }

  const step = game.history.length + 1;
  game.kept[playerId] = keptEntry.card;
  game.remaining = game.remaining.filter(id => id !== playerId);

  const record = {
    step,
    playerId,
    hand: game.hand.map(h => ({ card: h.card, from: h.from })),
    kept: keptEntry.card,
    passed: otherEntry.card,
    passedTo: isLast ? 'lodge-room' : passTo,
  };
  game.history.push(record);
  game.publicLog.push({ step, from: playerId, to: record.passedTo });

  if (isLast) {
    game.lodgeRoomCard = otherEntry.card;
    game.actorId = null;
    game.hand = [];
    return { done: true };
  }

  game.actorId = passTo;
  game.hand = [
    { card: otherEntry.card, from: 'passed' },
    { card: game.deck.shift(), from: 'deck' },
  ];
  return { done: false };
}

// 玩家離線時由房主代為決定：隨機留一張、隨機傳給候選人
function autoPlay(game, rng = Math.random) {
  if (game.phase !== 'passing' || !game.actorId) throw new GameError('BAD_PHASE', '現在不是傳牌階段');
  const keep = game.hand[Math.floor(rng() * game.hand.length)].card.id;
  const candidates = game.remaining.filter(id => id !== game.actorId);
  const target = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : null;
  return keepCard(game, game.actorId, keep, target);
}

// ── 階段切換 ────────────────────────────────────────────────────
function beginDiscussion(game, now = Date.now()) {
  game.phase = 'discussion';
  game.endsAt = now + game.discussionSeconds * 1000;
}

function beginVoting(game) {
  game.phase = 'voting';
  game.endsAt = null;
  game.votes = {};
}

// targetId = 被投地點的主人（地點由玩家持有，投票對象仍是「地點」）
function castVote(game, voterId, targetId) {
  if (game.phase !== 'voting') throw new GameError('BAD_PHASE', '現在不是投票階段');
  if (!game.order.includes(voterId)) throw new GameError('FORBIDDEN', '觀戰者不能投票');
  if (!game.order.includes(targetId)) throw new GameError('BAD_TARGET', '只能投給玩家所在的地點');
  game.votes[voterId] = targetId;
}

// ── 開票階段（Level 3+）─────────────────────────────────────────
// 票已全數公開；持有律師 / 富商的玩家可在期限內自願公開身份並發動能力（一次、不可撤回）。
function beginReveal(game, now = Date.now()) {
  game.phase = 'reveal';
  game.endsAt = now + REVEAL_SECONDS * 1000;
  game.reveals = [];
}

function revealAbility(game, playerId, targetId = null) {
  if (game.phase !== 'reveal') throw new GameError('BAD_PHASE', '現在不是開票階段');
  const kind = game.kept[playerId]?.kind;
  if (!REVEAL_ROLES.includes(kind)) throw new GameError('FORBIDDEN', '你沒有可公開的能力');
  if (game.reveals.some(r => r.playerId === playerId)) {
    throw new GameError('ALREADY_REVEALED', '你已經公開過身份了');
  }
  if (kind === 'lawyer') {
    if (targetId === playerId) throw new GameError('BAD_TARGET', '律師不能選擇自己');
    if (!game.order.includes(targetId) || !(targetId in game.votes)) {
      throw new GameError('BAD_TARGET', '請選擇一位已投票的玩家');
    }
    game.reveals.push({ playerId, kind, targetId });
  } else {
    game.reveals.push({ playerId, kind });
  }
}

// ── 結算 ────────────────────────────────────────────────────────
// 順序：律師作廢 → 富商加權 → 計票 → 炸彈客優先判定 → 殺人魔判定
function resolveGame(game) {
  const voidedVoterIds = game.reveals.filter(r => r.kind === 'lawyer').map(r => r.targetId);
  const weights = {};
  for (const r of game.reveals) if (r.kind === 'merchant') weights[r.playerId] = 2;

  const voteCounts = {};
  for (const id of game.order) voteCounts[id] = 0;
  for (const [voter, target] of Object.entries(game.votes)) {
    if (voidedVoterIds.includes(voter)) continue;
    voteCounts[target] += weights[voter] ?? 1;
  }

  const max = Math.max(0, ...Object.values(voteCounts));
  const boilerIds = max === 0 ? [] : game.order.filter(id => voteCounts[id] === max);
  const boilerCards = boilerIds.map(id => game.kept[id]);
  const bomberInBoiler = boilerCards.some(c => c.kind === 'bomber');
  const killerInBoiler = boilerCards.some(c => c.kind === 'killer');
  const winner = bomberInBoiler ? 'bomber' : killerInBoiler ? 'good' : 'killer';

  const winnerIds = game.order.filter(id => {
    const kind = game.kept[id].kind;
    if (winner === 'bomber') return kind === 'bomber';
    if (kind === 'bomber') return false;
    const isKillerTeam = KILLER_TEAM.includes(kind);
    return winner === 'killer' ? isKillerTeam : !isKillerTeam;
  });

  game.phase = 'result';
  game.endsAt = null;
  game.result = {
    voteCounts,
    votes: { ...game.votes },
    reveals: game.reveals.map(r => ({ ...r })),
    voidedVoterIds,
    boilerIds,
    winner,
    winnerIds,
    killerInLodgeRoom: game.lodgeRoomCard?.kind === 'killer',
  };
  return game.result;
}

// 回到大廳（保留設定與局數）
function resetToLobby(game) {
  const { level, discussionSeconds, gameNo } = game;
  Object.assign(game, createLobby({ level, discussionSeconds }), { gameNo });
}

// ── 依觀看者過濾 ────────────────────────────────────────────────
// 核心保證：他人角色牌（含客房）在 result 之前永遠不會出現在回傳值內。
function cardView(c) {
  return c.kind === 'guest' ? { id: c.id, kind: 'guest', color: c.color } : { id: c.id, kind: c.kind };
}

function buildView(game, viewerId = null) {
  const inGame = game.phase !== 'lobby';
  const isPlayer = inGame && game.order.includes(viewerId);

  const view = {
    phase: game.phase,
    level: game.level,
    discussionSeconds: game.discussionSeconds,
    gameNo: game.gameNo,
    order: inGame ? [...game.order] : [],
    locations: inGame ? { ...game.locations } : {},
    actorId: game.actorId,
    keptIds: Object.keys(game.kept),
    lodgeRoomFilled: !!game.lodgeRoomCard,
    publicLog: [...game.publicLog],
    endsAt: game.endsAt,
    serverNow: Date.now(), // 讓前端校正與伺服器的時鐘差
    votedIds: game.phase === 'voting' ? Object.keys(game.votes) : [],
    // 開票階段：票與已公開的能力為全員可見
    votes: game.phase === 'reveal' ? { ...game.votes } : {},
    reveals: game.phase === 'reveal' ? game.reveals.map(r => ({ ...r })) : [],
    levelRoles: inGame ? [...(LEVEL_ROLES[game.level] ?? LEVEL_ROLES[1]), 'guest'] : [],
    deckLeft: game.deck.length,
    me: null,
    result: null,
  };

  if (isPlayer) {
    const me = { isPlayer: true, card: null, hand: [], passTargets: [], myVote: null, canReveal: false };
    if (game.kept[viewerId]) me.card = cardView(game.kept[viewerId]);
    if (game.phase === 'passing' && game.actorId === viewerId) {
      me.hand = game.hand.map(h => ({ ...cardView(h.card), from: h.from }));
      if (game.remaining.length > 1) me.passTargets = game.remaining.filter(id => id !== viewerId);
    }
    if (game.phase === 'voting') me.myVote = game.votes[viewerId] ?? null;
    if (game.phase === 'reveal') {
      me.myVote = game.votes[viewerId] ?? null;
      me.canReveal = REVEAL_ROLES.includes(game.kept[viewerId]?.kind)
        && !game.reveals.some(r => r.playerId === viewerId);
    }
    view.me = me;
  }

  if (game.phase === 'result' && game.result) {
    const cards = {};
    for (const id of game.order) cards[id] = cardView(game.kept[id]);
    view.result = {
      ...game.result,
      cards,
      lodgeRoomCard: game.lodgeRoomCard ? cardView(game.lodgeRoomCard) : null,
      // 真相回放：每次傳牌「看到什麼、留了什麼、傳給誰」
      replay: game.history.map(h => ({
        step: h.step,
        playerId: h.playerId,
        hand: h.hand.map(x => ({ ...cardView(x.card), from: x.from })),
        keptId: h.kept.id,
        passedId: h.passed.id,
        passedTo: h.passedTo,
      })),
    };
  }
  return view;
}

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = {
  SOLO_TEST, MIN_PLAYERS, MAX_PLAYERS, LEVELS, LEVEL_ROLES, LEVEL_MIN_PLAYERS, REVEAL_SECONDS, minPlayersForLevel,
  DISCUSSION_CHOICES, DEFAULT_DISCUSSION_SECONDS,
  PLAYER_LOCATIONS, GUEST_COLORS, PHASES,
  GameError, shuffle, normalizeSettings,
  createLobby, buildDeck, startGame, keepCard, autoPlay,
  beginDiscussion, beginVoting, castVote, beginReveal, revealAbility, resolveGame, resetToLobby, buildView,
};
