'use strict';

// ================================================================
//  血染鐘樓 — 純遊戲邏輯（不碰 socket / DB，方便單元測試）
//
//  規格：docs/clocktower-spec.md（Phase 1 範圍）
//  - 每局都有一位真人說書人（storytellerId，與 room.host_player_id 無關）
//  - 硬規則（投票門檻、提名限制、幽靈票、勝負條件）由系統強制
//  - 規則內裁量（給什麼資訊、誰死亡）由說書人決定，所有決定寫進 log，終局公開
//  - buildView(game, viewerId) 只回傳該觀看者有權看到的內容
// ================================================================

const ROLE_LIST = require('./scripts/roles.json');
const SCRIPTS = {
  'trouble-brewing': require('./scripts/trouble-brewing.json'),
};

// 開發模式：可「填入測試機器人」讓一個人扮演說書人跑完整局。
// TODO: 正式上線改回 false（需與 vue-app/src/apps/clocktower/data/constants.js 的 DEV_BOTS 同步）
const DEV_BOTS = true;
const BOT_PREFIX = 'bot-';

const MIN_SEATS = 5;
const MAX_SEATS = 15;
const DEFAULT_SCRIPT = 'trouble-brewing';

// 人數 → [鎮民, 外來者, 爪牙, 惡魔]
const COMPOSITION = {
  5: [3, 0, 1, 1], 6: [3, 1, 1, 1], 7: [5, 0, 1, 1], 8: [5, 1, 1, 1], 9: [5, 2, 1, 1],
  10: [7, 0, 2, 1], 11: [7, 1, 2, 1], 12: [7, 2, 2, 1],
  13: [9, 0, 3, 1], 14: [9, 1, 3, 1], 15: [9, 2, 3, 1],
};
const TEAMS = ['townsfolk', 'outsider', 'minion', 'demon'];
const GOOD_TEAMS = ['townsfolk', 'outsider'];
const EVIL_INFO_MIN_SEATS = 7; // 7 人以上首夜爪牙 / 惡魔互認

const FREE_SECONDS = 8 * 60;
const EXTEND_SECONDS = 60;
const BLUFF_COUNT = 3;

const CHAT_MAX_LEN = 300;
const CHAT_INTERVAL_MS = 1500;
const PUBLIC_CHAT_CAP = 1000;
const WHISPER_CAP = 500;
const INVITE_TTL_MS = 30 * 1000;
const WHISPER_COLORS = ['#3B82F6', '#F97316', '#10B981', '#EC4899', '#EAB308', '#8B5CF6', '#06B6D4', '#EF4444'];

const DEFAULT_HAND_SPEED_MS = 1000;
const MIN_HAND_SPEED_MS = 300;
const MAX_HAND_SPEED_MS = 5000;

// 使能力可能失效的提醒標記（中毒 / 醉酒）
const IMPAIRING_REMINDERS = ['poisoner:poisoned', 'drunk:drunk'];

// 夜晚 prompt / 資訊在伺服器端隨機延遲 0～1.5 秒才讓玩家看到（避免從時間差推理角色）
const NIGHT_DELAY_MAX_MS = 1500;

// 「兩名玩家之一是某類角色」的資訊角色 → 要找的陣營
const PLAYERS_ROLE_TEAM = { washerwoman: 'townsfolk', librarian: 'outsider', investigator: 'minion' };

// 首夜的固定項目（不屬於任何角色）
const EVIL_INFO_ENTRIES = [
  { roleId: 'minioninfo', order: 5, reminder: '爪牙互認：喚醒所有爪牙，告訴他們惡魔是誰。' },
  { roleId: 'demoninfo', order: 8, reminder: '惡魔得知爪牙是誰，以及 3 個不在場的善良角色（偽裝）。' },
];

const ROLES = Object.fromEntries(ROLE_LIST.map(r => [r.id, r]));

const INFO_TYPES = ['info-number', 'info-players-role', 'info-yes-no', 'info-role', 'info-grimoire', 'custom'];

class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── 小工具 ──────────────────────────────────────────────────────
function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
const randomDelay = (rng = Math.random) => Math.floor(rng() * (NIGHT_DELAY_MAX_MS + 1));

// 以字串為種子的亂數（mulberry32）：同一夜同一座位的預填答案每次重推都一樣，不會跳動
function seededRng(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clone = v => JSON.parse(JSON.stringify(v));
const isBotId = id => typeof id === 'string' && id.startsWith(BOT_PREFIX);
const teamOf = roleId => ROLES[roleId]?.team ?? null;
const isGoodRole = roleId => GOOD_TEAMS.includes(teamOf(roleId));

function scriptRoleIds(scriptId = DEFAULT_SCRIPT) {
  return (SCRIPTS[scriptId] ?? SCRIPTS[DEFAULT_SCRIPT]).filter(x => typeof x === 'string');
}
function scriptInfo(scriptId = DEFAULT_SCRIPT) {
  const list = SCRIPTS[scriptId] ?? SCRIPTS[DEFAULT_SCRIPT];
  const meta = list.find(x => typeof x === 'object' && x.id === '_meta') ?? {};
  return { id: scriptId, name: meta.name ?? scriptId, author: meta.author ?? '', roles: scriptRoleIds(scriptId).map(id => ROLES[id]) };
}

function nextId(game, prefix) {
  game.seq = (game.seq ?? 0) + 1;
  return `${prefix}${game.seq}`;
}

function addLog(game, type, data = {}, isPublic = false, now = Date.now()) {
  const entry = { id: nextId(game, 'l'), at: now, dayNumber: game.dayNumber, phase: game.phase, type, public: !!isPublic, ...data };
  game.log.push(entry);
  return entry;
}

// ── 狀態 ────────────────────────────────────────────────────────
function emptyChat() {
  return { public: [], whispers: {}, invites: [], storyteller: {} };
}
function emptyNominations() {
  return { nominators: [], nominees: [], current: null, results: [], onTheBlock: null, highestVotes: 0, executed: null, executionDone: false };
}

function createLobby({ seatCount = MIN_SEATS } = {}) {
  const n = Math.min(MAX_SEATS, Math.max(MIN_SEATS, Number(seatCount) || MIN_SEATS));
  return {
    phase: 'lobby',
    pausedFrom: null,
    gameNo: 0,
    seq: 0,
    seatCount: n,
    lobbySeats: Array(n).fill(null),   // 大廳座位（playerId | null）
    names: {},                          // playerId → 暱稱（由 socket 層同步；離開的人也保留）
    storytellerId: null,
    scriptId: DEFAULT_SCRIPT,
    settings: { whisperMax: 0 },        // 0 = 私聊人數不限
    ...freshGameFields(),
  };
}

function freshGameFields() {
  return {
    timer: null,
    dayNumber: 0,
    seats: [],
    setupRoles: [],
    bluffs: [],
    reminders: [],
    nightQueue: [],
    prompts: {},           // playerId → 待回覆的 prompt
    messages: {},          // playerId → 說書人送出的夜晚資訊
    daySubPhase: null,
    chat: emptyChat(),
    chatRate: {},
    nominations: emptyNominations(),
    voting: null,
    log: [],
    pendingWinner: null,
    winner: null,
  };
}

// ── 身份 ────────────────────────────────────────────────────────
function seatIndexOf(game, playerId) {
  return game.seats.findIndex(s => s.playerId === playerId);
}
// 仍在遊戲中的座位（離開的人不能再操作）
function activeSeatOf(game, playerId) {
  const i = seatIndexOf(game, playerId);
  return i >= 0 && !game.seats[i].hasLeft ? i : -1;
}
function identityOf(game, playerId) {
  if (!playerId) return 'spectator';
  if (playerId === game.storytellerId) return 'storyteller';
  if (game.phase === 'lobby') return game.lobbySeats.includes(playerId) ? 'player' : 'spectator';
  return activeSeatOf(game, playerId) >= 0 ? 'player' : 'spectator';
}

function assertStoryteller(game, playerId) {
  if (!game.storytellerId || playerId !== game.storytellerId) {
    throw new GameError('FORBIDDEN', '只有說書人可以這樣做');
  }
}
function assertPhase(game, ...phases) {
  if (game.phase === 'paused') throw new GameError('PAUSED', '遊戲暫停中，等待說書人重新連線');
  if (!phases.includes(game.phase)) throw new GameError('BAD_PHASE', '現在不能這樣做');
}
function assertSeat(game, seat) {
  if (!Number.isInteger(seat) || seat < 0 || seat >= game.seats.length) {
    throw new GameError('BAD_SEAT', '座位不存在');
  }
  return game.seats[seat];
}
function assertScriptRole(game, roleId) {
  if (!scriptRoleIds(game.scriptId).includes(roleId)) throw new GameError('BAD_ROLE', '角色不在本劇本中');
}

// ════════════════════════════════════════════════════════════════
//  大廳：說書人、座位
// ════════════════════════════════════════════════════════════════
function setStoryteller(game, playerId) {
  assertPhase(game, 'lobby');
  if (!playerId) throw new GameError('BAD_TARGET', '請選擇說書人');
  game.lobbySeats = game.lobbySeats.map(id => (id === playerId ? null : id));
  game.storytellerId = playerId;
}

function pickRandomStoryteller(game, candidateIds, rng = Math.random) {
  if (!candidateIds.length) throw new GameError('BAD_TARGET', '房內沒有人可以當說書人');
  const id = pick(candidateIds, rng);
  setStoryteller(game, id);
  return id;
}

function claimSeat(game, playerId, seat) {
  assertPhase(game, 'lobby');
  if (playerId === game.storytellerId) throw new GameError('FORBIDDEN', '說書人不入座');
  if (seat === null || seat === undefined) {
    game.lobbySeats = game.lobbySeats.map(id => (id === playerId ? null : id));
    return;
  }
  if (!Number.isInteger(seat) || seat < 0 || seat >= game.lobbySeats.length) throw new GameError('BAD_SEAT', '座位不存在');
  if (game.lobbySeats[seat] && game.lobbySeats[seat] !== playerId) throw new GameError('SEAT_TAKEN', '這個座位已經有人了');
  game.lobbySeats = game.lobbySeats.map(id => (id === playerId ? null : id));
  game.lobbySeats[seat] = playerId;
}

// 說書人調整座位：大廳交換兩個座位（含空位）；setup 階段交換兩位玩家（角色留在原座位）
function swapSeats(game, a, b) {
  assertPhase(game, 'lobby', 'setup');
  if (game.phase === 'lobby') {
    const n = game.lobbySeats.length;
    if (![a, b].every(x => Number.isInteger(x) && x >= 0 && x < n)) throw new GameError('BAD_SEAT', '座位不存在');
    [game.lobbySeats[a], game.lobbySeats[b]] = [game.lobbySeats[b], game.lobbySeats[a]];
    return;
  }
  const sa = assertSeat(game, a);
  const sb = assertSeat(game, b);
  [sa.playerId, sb.playerId] = [sb.playerId, sa.playerId];
}

function addBots(game, count = Infinity) {
  if (!DEV_BOTS) throw new GameError('FORBIDDEN', '測試機器人未啟用');
  assertPhase(game, 'lobby');
  let added = 0;
  for (let i = 0; i < game.lobbySeats.length && added < count; i++) {
    if (game.lobbySeats[i]) continue;
    let k = 1;
    while (game.lobbySeats.includes(`${BOT_PREFIX}${k}`)) k++;
    const id = `${BOT_PREFIX}${k}`;
    game.lobbySeats[i] = id;
    game.names[id] = `機器人${k}`;
    added++;
  }
  return added;
}

function removeBots(game) {
  assertPhase(game, 'lobby');
  game.lobbySeats = game.lobbySeats.map(id => (isBotId(id) ? null : id));
}

function updateSettings(game, { whisperMax } = {}) {
  if (whisperMax !== undefined) {
    const n = Number(whisperMax);
    game.settings.whisperMax = Number.isInteger(n) && n >= 2 && n <= MAX_SEATS ? n : 0;
  }
}

// ════════════════════════════════════════════════════════════════
//  開局設定
// ════════════════════════════════════════════════════════════════
function baseComposition(n) {
  const row = COMPOSITION[n];
  if (!row) return null;
  return Object.fromEntries(TEAMS.map((t, i) => [t, row[i]]));
}

// 依實際在場角色計算應有配置（男爵：外來者 +2、鎮民 −2）
function expectedComposition(n, roleIds = []) {
  const base = baseComposition(n);
  if (!base) return null;
  if (roleIds.includes('baron')) {
    base.outsider += 2;
    base.townsfolk -= 2;
  }
  return base;
}

function countTeams(roleIds) {
  const c = { townsfolk: 0, outsider: 0, minion: 0, demon: 0 };
  for (const id of roleIds) if (c[teamOf(id)] !== undefined) c[teamOf(id)]++;
  return c;
}

// 回傳錯誤訊息陣列（空陣列 = 合法）
function checkSetup(game) {
  const n = game.seats.length;
  const errors = [];
  const roleIds = game.seats.map(s => s.roleId);
  if (roleIds.some(r => !r)) errors.push('尚有座位沒有分配角色');
  const assigned = roleIds.filter(Boolean);
  const scriptIds = scriptRoleIds(game.scriptId);
  if (assigned.some(r => !scriptIds.includes(r))) errors.push('有角色不在本劇本中');
  if (new Set(assigned).size !== assigned.length) errors.push('同一個角色不能重複出現');

  const expected = expectedComposition(n, assigned);
  if (!expected) {
    errors.push(`座位數 ${n} 不在 ${MIN_SEATS}～${MAX_SEATS} 人範圍內`);
  } else if (!roleIds.some(r => !r)) {
    const actual = countTeams(assigned);
    const names = { townsfolk: '鎮民', outsider: '外來者', minion: '爪牙', demon: '惡魔' };
    for (const t of TEAMS) {
      if (actual[t] !== expected[t]) errors.push(`${names[t]}應為 ${expected[t]} 人，目前 ${actual[t]} 人`);
    }
  }

  const drunkSeat = game.seats.find(s => s.roleId === 'drunk');
  if (drunkSeat) {
    const shown = drunkSeat.drunkAs;
    if (!shown) errors.push('請指定酒鬼「以為自己是」哪個鎮民');
    else if (teamOf(shown) !== 'townsfolk') errors.push('酒鬼以為的角色必須是鎮民');
    else if (assigned.includes(shown)) errors.push('酒鬼以為的角色不能在場');
  }
  return errors;
}

function beginSetup(game) {
  assertPhase(game, 'lobby');
  if (!game.storytellerId) throw new GameError('NO_STORYTELLER', '請先指定說書人');
  const seated = game.lobbySeats.filter(Boolean);
  if (seated.length < MIN_SEATS) throw new GameError('NOT_ENOUGH', `至少需要 ${MIN_SEATS} 位玩家入座`);
  Object.assign(game, freshGameFields());
  game.phase = 'setup';
  game.seats = seated.map(playerId => ({
    playerId, roleId: null, drunkAs: null, shownRoleId: null,
    isDead: false, deathPending: false, ghostVoteUsed: false, hasLeft: false, isTraveler: false,
  }));
}

function backToLobbyFromSetup(game) {
  assertPhase(game, 'setup');
  resetToLobby(game);
}

function selectRoles(game, roleIds) {
  assertPhase(game, 'setup');
  if (!Array.isArray(roleIds)) throw new GameError('BAD_ROLE', '角色清單格式錯誤');
  roleIds.forEach(id => assertScriptRole(game, id));
  if (new Set(roleIds).size !== roleIds.length) throw new GameError('BAD_ROLE', '同一個角色不能重複選');
  if (roleIds.length > game.seats.length) throw new GameError('BAD_ROLE', '選的角色比座位多');
  game.setupRoles = [...roleIds];
}

// 一鍵產生合法配置（只決定「放哪些角色」，不分配座位）
function randomRoles(game, rng = Math.random) {
  assertPhase(game, 'setup');
  const n = game.seats.length;
  const base = baseComposition(n);
  if (!base) throw new GameError('BAD_SEATS', '座位數不在範圍內');
  const byTeam = t => scriptRoleIds(game.scriptId).filter(id => teamOf(id) === t);
  const demons = shuffle(byTeam('demon'), rng).slice(0, base.demon);
  const minions = shuffle(byTeam('minion'), rng).slice(0, base.minion);
  const comp = expectedComposition(n, minions);
  const outsiders = shuffle(byTeam('outsider'), rng).slice(0, comp.outsider);
  const townsfolk = shuffle(byTeam('townsfolk'), rng).slice(0, comp.townsfolk);
  game.setupRoles = [...townsfolk, ...outsiders, ...minions, ...demons];
  return game.setupRoles;
}

function goodRolesNotInPlay(game, exclude = []) {
  const inPlay = game.seats.map(s => s.roleId).filter(Boolean);
  return scriptRoleIds(game.scriptId)
    .filter(id => isGoodRole(id) && !inPlay.includes(id) && !exclude.includes(id));
}

function randomDrunkAs(game, rng = Math.random) {
  const seat = game.seats.find(s => s.roleId === 'drunk');
  if (!seat) return;
  const options = goodRolesNotInPlay(game).filter(id => teamOf(id) === 'townsfolk');
  seat.drunkAs = options.length ? pick(options, rng) : null;
}

function randomBluffs(game, rng = Math.random) {
  assertPhase(game, 'setup');
  const drunkAs = game.seats.find(s => s.roleId === 'drunk')?.drunkAs;
  game.bluffs = shuffle(goodRolesNotInPlay(game, drunkAs ? [drunkAs] : []), rng).slice(0, BLUFF_COUNT);
  return game.bluffs;
}

// 系統把選好的角色隨機發到各座位（只有說書人看得到）
function randomAssign(game, rng = Math.random, now = Date.now()) {
  assertPhase(game, 'setup');
  // 洗牌來源：勾選的清單剛好等於座位數就用它；否則（已分配過、又手動改了角色）以目前座位上的角色重新洗牌
  const seated = game.seats.map(s => s.roleId);
  let pool = game.setupRoles;
  if (pool.length !== game.seats.length) {
    if (seated.some(r => !r)) throw new GameError('BAD_ROLE', `需要選 ${game.seats.length} 個角色（目前 ${pool.length} 個）`);
    pool = seated;
  }
  game.setupRoles = [...pool];
  const roles = shuffle(pool, rng);
  game.seats.forEach((s, i) => { s.roleId = roles[i]; s.drunkAs = null; });
  randomDrunkAs(game, rng);
  randomBluffs(game, rng);
  addLog(game, 'setup-random', {
    roles: game.seats.map(s => s.roleId), drunkAs: game.seats.find(s => s.drunkAs)?.drunkAs ?? null, bluffs: [...game.bluffs],
  }, false, now);
}

// 一鍵全自動：選角色 → 分配座位 → 酒鬼 / 偽裝，說書人只需確認（進入 setup 時自動執行，也可整組重抽）
function autoSetup(game, rng = Math.random, now = Date.now()) {
  randomRoles(game, rng);
  randomAssign(game, rng, now);
}

function setSeatRole(game, seat, roleId, now = Date.now()) {
  assertPhase(game, 'setup');
  const s = assertSeat(game, seat);
  if (roleId) assertScriptRole(game, roleId);
  const from = s.roleId;
  s.roleId = roleId || null;
  if (s.roleId !== 'drunk') s.drunkAs = null;
  syncSetupRoles(game);
  addLog(game, 'setup-set', { seat, from, to: s.roleId }, false, now);
}

// 全部座位都有角色時，勾選清單 = 目前座位上的角色（讓「① 選角色」顯示的與實際一致）
function syncSetupRoles(game) {
  const seated = game.seats.map(s => s.roleId);
  if (seated.every(Boolean) && new Set(seated).size === seated.length) game.setupRoles = seated;
}

function swapSeatRoles(game, a, b, now = Date.now()) {
  assertPhase(game, 'setup');
  const sa = assertSeat(game, a);
  const sb = assertSeat(game, b);
  [sa.roleId, sb.roleId] = [sb.roleId, sa.roleId];
  [sa.drunkAs, sb.drunkAs] = [sb.drunkAs, sa.drunkAs];
  addLog(game, 'setup-swap', { a, b }, false, now);
}

function setDrunkAs(game, roleId, now = Date.now()) {
  assertPhase(game, 'setup');
  const seat = game.seats.find(s => s.roleId === 'drunk');
  if (!seat) throw new GameError('NO_DRUNK', '本局沒有酒鬼');
  assertScriptRole(game, roleId);
  if (teamOf(roleId) !== 'townsfolk') throw new GameError('BAD_ROLE', '酒鬼以為的角色必須是鎮民');
  if (game.seats.some(s => s.roleId === roleId)) throw new GameError('BAD_ROLE', '酒鬼以為的角色不能在場');
  seat.drunkAs = roleId;
  addLog(game, 'setup-drunk', { roleId }, false, now);
}

function setBluffs(game, roleIds, now = Date.now()) {
  assertPhase(game, 'setup');
  if (!Array.isArray(roleIds) || roleIds.length !== BLUFF_COUNT) throw new GameError('BAD_ROLE', `偽裝需要 ${BLUFF_COUNT} 個角色`);
  roleIds.forEach(id => assertScriptRole(game, id));
  if (new Set(roleIds).size !== roleIds.length) throw new GameError('BAD_ROLE', '偽裝角色不能重複');
  if (!roleIds.every(isGoodRole)) throw new GameError('BAD_ROLE', '偽裝必須是善良角色');
  if (roleIds.some(id => game.seats.some(s => s.roleId === id))) throw new GameError('BAD_ROLE', '偽裝不能是在場角色');
  game.bluffs = [...roleIds];
  addLog(game, 'setup-bluffs', { bluffs: [...roleIds] }, false, now);
}

function startGame(game, { force = false } = {}, rng = Math.random, now = Date.now()) {
  assertPhase(game, 'setup');
  if (game.seats.some(s => !s.roleId)) throw new GameError('INVALID_SETUP', '尚有座位沒有分配角色');
  const errors = checkSetup(game);
  if (errors.length && !force) throw new GameError('INVALID_SETUP', errors.join('；'));
  if (game.bluffs.length < BLUFF_COUNT) {
    const drunkAs = game.seats.find(s => s.roleId === 'drunk')?.drunkAs;
    const extra = shuffle(goodRolesNotInPlay(game, [...game.bluffs, ...(drunkAs ? [drunkAs] : [])]), rng);
    game.bluffs = [...game.bluffs, ...extra].slice(0, BLUFF_COUNT);
  }
  // 酒鬼本人永遠看不到自己是酒鬼：強制開始時若沒指定（或指定不合法），系統隨機補一個不在場的鎮民
  const drunk = game.seats.find(s => s.roleId === 'drunk');
  if (drunk && (teamOf(drunk.drunkAs) !== 'townsfolk' || game.seats.some(s => s.roleId === drunk.drunkAs))) {
    randomDrunkAs(game, rng);
    if (!drunk.drunkAs) throw new GameError('INVALID_SETUP', '沒有不在場的鎮民可以給酒鬼');
  }
  for (const s of game.seats) {
    s.shownRoleId = s.roleId === 'drunk' ? s.drunkAs : s.roleId;
  }
  game.gameNo += 1;
  game.phase = 'night';
  game.dayNumber = 0;
  if (errors.length) addLog(game, 'setup-forced', { errors }, false, now);
  addLog(game, 'start', {
    seats: game.seats.map(s => ({ playerId: s.playerId, roleId: s.roleId, shownRoleId: s.shownRoleId })),
    bluffs: [...game.bluffs],
  }, false, now);
  addLog(game, 'night', {}, true, now);
  game.nightQueue = buildNightQueue(game);
}

// ════════════════════════════════════════════════════════════════
//  夜晚
// ════════════════════════════════════════════════════════════════
// 夜晚行動以「玩家以為的角色」為準（酒鬼以為自己是僧侶 → 在僧侶的順序被喚醒）
const effectiveRole = s => (s.roleId === 'drunk' ? s.shownRoleId ?? s.roleId : s.roleId);

function isImpaired(game, seat) {
  const s = game.seats[seat];
  if (!s) return false;
  if (s.roleId === 'drunk') return true;
  return game.reminders.some(r => r.seat === seat && IMPAIRING_REMINDERS.includes(r.reminderId));
}

function buildNightQueue(game) {
  const first = game.dayNumber === 0;
  const prev = Object.fromEntries((game.nightQueue ?? []).map(e => [e.key, e]));
  const entries = [];
  if (first && game.seats.length >= EVIL_INFO_MIN_SEATS) {
    for (const e of EVIL_INFO_ENTRIES) entries.push({ key: e.roleId, roleId: e.roleId, seat: null, order: e.order, reminder: e.reminder });
  }
  game.seats.forEach((s, i) => {
    if (s.hasLeft) return;
    const roleId = effectiveRole(s);
    const def = ROLES[roleId];
    if (!def) return;
    const order = first ? def.firstNight : def.otherNight;
    if (!order) return;
    // 死亡玩家不再被喚醒；守鴉人例外（他正是在夜晚死亡時被喚醒）
    if (s.isDead && !s.deathPending && roleId !== 'ravenkeeper') return;
    entries.push({
      key: `${roleId}:${i}`, roleId, seat: i, order,
      reminder: first ? def.firstNightReminder : def.otherNightReminder,
    });
  });
  entries.sort((a, b) => a.order - b.order || (a.seat ?? -1) - (b.seat ?? -1));
  return entries.map(e => ({ ...e, done: prev[e.key]?.done ?? false, reply: prev[e.key]?.reply ?? null }));
}

function setQueueDone(game, key, done = true) {
  assertPhase(game, 'night');
  const e = game.nightQueue.find(x => x.key === key);
  if (!e) throw new GameError('BAD_TARGET', '夜晚順序中沒有這一項');
  e.done = !!done;
}

// 喚醒：對某座位送出 choose-player prompt（info-* 類由 sendInfo 直接送）
// delayMs：玩家要等多久才看得到（夜晚隨機延遲，見 randomDelay）
function wake(game, seat, { roleId, count, notSelf, text, delayMs = 0 } = {}, now = Date.now()) {
  assertPhase(game, 'night');
  const s = assertSeat(game, seat);
  if (s.hasLeft) throw new GameError('BAD_TARGET', '該玩家已離開');
  const role = roleId && ROLES[roleId] ? roleId : effectiveRole(s);
  const def = ROLES[role]?.prompt;
  const n = Number(count ?? def?.count ?? 1);
  if (!Number.isInteger(n) || n < 1 || n > 3) throw new GameError('BAD_PROMPT', '選擇人數需為 1～3');
  const prompt = {
    id: nextId(game, 'p'), seat, roleId: role, type: 'choose-player', count: n,
    notSelf: notSelf ?? !!def?.notSelf, text: String(text ?? '').slice(0, CHAT_MAX_LEN), at: now,
    visibleAt: now + Math.max(0, Number(delayMs) || 0),
  };
  game.prompts[s.playerId] = prompt;
  addLog(game, 'wake', { seat, roleId: role, count: n }, false, now);
  return prompt;
}

function cancelPrompt(game, seat) {
  const s = assertSeat(game, seat);
  delete game.prompts[s.playerId];
}

function applyAutoReminder(game, roleId, actorSeat, targets) {
  const auto = ROLES[roleId]?.autoReminder;
  if (!auto || auto.on !== 'choose') return [];
  if (auto.clear === 'nextOwnAction') {
    game.reminders = game.reminders.filter(r => !(r.reminderId === auto.reminder && r.source === actorSeat));
  }
  const doubtful = isImpaired(game, actorSeat);
  const added = targets.map(t => ({
    id: nextId(game, 'r'), seat: t, reminderId: auto.reminder, source: actorSeat, auto: true, doubtful,
    clear: auto.clear, dayNumber: game.dayNumber,
  }));
  game.reminders.push(...added);
  return added;
}

function replyPrompt(game, playerId, promptId, targets, { by = 'player', now = Date.now() } = {}) {
  assertPhase(game, 'night');
  const prompt = game.prompts[playerId];
  if (!prompt || (promptId && prompt.id !== promptId)) throw new GameError('NO_PROMPT', '目前沒有需要回覆的選擇');
  if (!Array.isArray(targets) || targets.length !== prompt.count) throw new GameError('BAD_TARGET', `請選擇 ${prompt.count} 位玩家`);
  if (new Set(targets).size !== targets.length) throw new GameError('BAD_TARGET', '不能重複選同一位玩家');
  for (const t of targets) {
    const s = assertSeat(game, t);
    if (s.hasLeft) throw new GameError('BAD_TARGET', '不能選擇已離開的玩家');
    if (prompt.notSelf && t === prompt.seat) throw new GameError('BAD_TARGET', '不能選擇自己');
  }
  delete game.prompts[playerId];
  const added = applyAutoReminder(game, prompt.roleId, prompt.seat, targets);
  const entry = game.nightQueue.find(e => e.key === `${prompt.roleId}:${prompt.seat}`);
  if (entry) {
    entry.reply = [...targets];
    // 只需選人、不必回資訊的角色（僧侶／投毒者／小惡魔…）選完即完成
    if (!ROLES[prompt.roleId]?.prompt?.then) entry.done = true;
  }
  addLog(game, by === 'storyteller' ? 'act-for' : 'prompt-reply',
    { seat: prompt.seat, roleId: prompt.roleId, targets: [...targets], reminders: added.map(r => r.reminderId) }, false, now);
  return { prompt, targets, reminders: added };
}

// 說書人代斷線玩家回覆
function actFor(game, seat, targets, now = Date.now()) {
  const s = assertSeat(game, seat);
  return replyPrompt(game, s.playerId, null, targets, { by: 'storyteller', now });
}

function evilSeats(game, team) {
  return game.seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.hasLeft && teamOf(s.roleId) === team).map(({ i }) => i);
}

function grimoireSnapshot(game) {
  return {
    seats: game.seats.map((s, i) => ({
      index: i, roleId: s.roleId, isDead: s.isDead, reminders: game.reminders.filter(r => r.seat === i).map(r => r.reminderId),
    })),
    bluffs: [...game.bluffs],
  };
}

function pushMessage(game, playerId, msg) {
  if (!game.messages[playerId]) game.messages[playerId] = [];
  game.messages[playerId].push(msg);
}

// ════════════════════════════════════════════════════════════════
//  說書人輔助：真實答案預填、資訊真假判定
// ════════════════════════════════════════════════════════════════
const isEvilRole = roleId => ['minion', 'demon'].includes(teamOf(roleId));

// 能力是哪一種資訊（choose-player 類以 then 為準）
function infoTypeOf(roleId) {
  const p = ROLES[roleId]?.prompt;
  if (!p) return null;
  const t = p.type === 'choose-player' ? p.then : p.type;
  return INFO_TYPES.includes(t) ? t : null;
}

// 左右兩側最近的存活鄰居（跳過死亡 / 已離開；只剩一人時不重複）
function aliveNeighbors(game, seat) {
  const n = game.seats.length;
  const alive = i => !game.seats[i].isDead && !game.seats[i].hasLeft;
  const walk = step => {
    for (let k = 1; k < n; k++) {
      const i = (seat + step * k + n) % n;
      if (alive(i)) return i;
    }
    return null;
  };
  return [...new Set([walk(-1), walk(1)].filter(i => i !== null && i !== seat))];
}

// 隱士 / 間諜可能「被當作」別的陣營：真實答案只是其中一種合法答案
function misregisterNotes(game, seats) {
  const out = [];
  for (const i of seats) {
    const r = game.seats[i]?.roleId;
    if (r === 'recluse') out.push(`${i + 1}號是隱士：可能被當作邪惡 / 爪牙 / 惡魔`);
    if (r === 'spy') out.push(`${i + 1}號是間諜：可能被當作善良 / 鎮民 / 外來者`);
  }
  return out;
}

// 依魔典算出某座位此刻應得的真實資訊；reply = 該角色今晚選的玩家
// 回傳 null（此角色沒有可計算的資訊），或 { type, ...欄位, notes[], impaired }
function computeTruth(game, seat, roleId, reply = null) {
  const type = infoTypeOf(roleId);
  if (!type || type === 'info-grimoire' || type === 'custom') return null;
  const seats = game.seats;
  const n = seats.length;
  const rng = seededRng(`${game.gameNo}:${game.dayNumber}:${roleId}:${seat}`);
  const others = seats.map((_, i) => i).filter(i => i !== seat && !seats[i].hasLeft);
  const truth = { type, notes: [], impaired: isImpaired(game, seat) };

  if (PLAYERS_ROLE_TEAM[roleId]) {
    const team = PLAYERS_ROLE_TEAM[roleId];
    truth.team = team;
    const candidates = others.filter(i => teamOf(seats[i].roleId) === team);
    if (!candidates.length) {
      truth.players = [];
      truth.showRole = null;
      truth.notes.push(team === 'outsider' ? '場上沒有外來者：告訴他「0」' : `場上沒有${{ townsfolk: '鎮民', minion: '爪牙' }[team]}`);
    } else {
      const t = pick(candidates, rng);
      const decoy = pick(others.filter(i => i !== t), rng);
      truth.players = shuffle(decoy === undefined ? [t] : [t, decoy], rng);
      truth.showRole = seats[t].roleId;
    }
    truth.notes.push(...misregisterNotes(game, others.filter(i => ['recluse', 'spy'].includes(seats[i].roleId))));
    return truth;
  }

  switch (roleId) {
    case 'chef': {
      let pairs = 0;
      const evil = i => !seats[i].hasLeft && isEvilRole(seats[i].roleId);
      for (let i = 0; i < n; i++) if (evil(i) && evil((i + 1) % n)) pairs++;
      truth.number = pairs;
      truth.notes.push(...misregisterNotes(game, seats.map((_, i) => i)));
      return truth;
    }
    case 'empath': {
      const nb = aliveNeighbors(game, seat);
      truth.number = nb.filter(i => isEvilRole(seats[i].roleId)).length;
      truth.neighbors = nb;
      truth.notes.push(...misregisterNotes(game, nb));
      return truth;
    }
    case 'fortuneteller': {
      if (!Array.isArray(reply) || reply.length < 2) {
        truth.yes = null;
        truth.notes.push('等待占卜師選擇兩名玩家');
        return truth;
      }
      const herring = i => game.reminders.some(r => r.seat === i && r.reminderId === 'fortuneteller:redherring');
      truth.yes = reply.some(i => teamOf(seats[i]?.roleId) === 'demon' || herring(i));
      if (!game.reminders.some(r => r.reminderId === 'fortuneteller:redherring')) truth.notes.push('尚未放「紅鯡魚」提醒標記');
      if (reply.some(herring)) truth.notes.push('選中了紅鯡魚：視為惡魔');
      truth.notes.push(...misregisterNotes(game, reply.filter(i => seats[i]?.roleId === 'recluse')));
      return truth;
    }
    case 'undertaker': {
      const ex = game.nominations.executed;
      if (ex === null || ex === undefined) {
        truth.showRole = null;
        truth.notes.push('今天沒有人被處決：不用喚醒送葬者');
        return truth;
      }
      truth.player = ex;
      truth.showRole = seats[ex].roleId;
      truth.notes.push(...misregisterNotes(game, [ex]));
      return truth;
    }
    case 'ravenkeeper': {
      if (!Array.isArray(reply) || !reply.length) {
        truth.showRole = null;
        truth.notes.push('等待守鴉人選擇一名玩家');
        return truth;
      }
      truth.player = reply[0];
      truth.showRole = seats[reply[0]]?.roleId ?? null;
      truth.notes.push(...misregisterNotes(game, [reply[0]]));
      return truth;
    }
    default:
      return null;
  }
}

// 判斷送出的資訊是否與魔典相符：true / false；無法判斷（自訂文字、類型不同、沒有答案）→ null
function judgeInfo(game, seat, roleId, message, reply = null) {
  const truth = computeTruth(game, seat, roleId, reply);
  if (!truth || truth.type !== message.type) return null;
  const seats = game.seats;
  switch (message.type) {
    case 'info-number':
      return message.number === truth.number;
    case 'info-yes-no':
      return truth.yes === null ? null : message.yes === truth.yes;
    case 'info-players-role': {
      if (!message.showRole) return truth.showRole === null;
      if (teamOf(message.showRole) !== truth.team) return false;
      return message.players.some(p => p !== seat && seats[p]?.roleId === message.showRole);
    }
    case 'info-role': {
      if (Number.isInteger(message.player)) return seats[message.player]?.roleId === message.showRole;
      return truth.showRole === null ? null : message.showRole === truth.showRole;
    }
    default:
      return null;
  }
}

// 說書人送資訊給玩家；target = 座位號，或 'minioninfo' / 'demoninfo'（首夜邪惡互認）
// delayMs：玩家要等多久才看得到（夜晚隨機延遲）；邪惡互認可傳函式，每位收件人各自一個延遲
// 回傳 [{ playerId, message }]
function sendInfo(game, target, info = {}, now = Date.now(), delayMs = 0) {
  assertPhase(game, 'night', 'day');
  const base = { at: now, dayNumber: game.dayNumber, phase: game.phase };
  const visibleAt = () => now + Math.max(0, Number(typeof delayMs === 'function' ? delayMs() : delayMs) || 0);

  if (target === 'minioninfo' || target === 'demoninfo') {
    if (game.phase !== 'night') throw new GameError('BAD_PHASE', '邪惡互認只在夜晚');
    const minions = evilSeats(game, 'minion');
    const demons = evilSeats(game, 'demon');
    const out = [];
    if (target === 'minioninfo') {
      for (const m of minions) {
        const message = { id: nextId(game, 'm'), ...base, visibleAt: visibleAt(), type: 'evil-info', demons, minions: minions.filter(x => x !== m) };
        pushMessage(game, game.seats[m].playerId, message);
        out.push({ playerId: game.seats[m].playerId, message });
      }
    } else {
      for (const d of demons) {
        const message = { id: nextId(game, 'm'), ...base, visibleAt: visibleAt(), type: 'evil-info', demons: demons.filter(x => x !== d), minions, bluffs: [...game.bluffs] };
        pushMessage(game, game.seats[d].playerId, message);
        out.push({ playerId: game.seats[d].playerId, message });
      }
    }
    const entry = game.nightQueue.find(e => e.key === target);
    if (entry) entry.done = true;
    addLog(game, 'info', { target, recipients: out.map(o => o.playerId) }, false, now);
    return out;
  }

  const s = assertSeat(game, target);
  if (s.hasLeft) throw new GameError('BAD_TARGET', '該玩家已離開');
  const type = INFO_TYPES.includes(info.type) ? info.type : null;
  if (!type) throw new GameError('BAD_INFO', '資訊類型錯誤');
  const message = { id: nextId(game, 'm'), ...base, visibleAt: visibleAt(), type, roleId: info.forRole && ROLES[info.forRole] ? info.forRole : null };
  switch (type) {
    case 'info-number': {
      const v = Number(info.number);
      if (!Number.isInteger(v) || v < 0 || v > 20) throw new GameError('BAD_INFO', '請填入數字');
      message.number = v;
      break;
    }
    case 'info-players-role': {
      const players = Array.isArray(info.players) ? info.players : [];
      players.forEach(p => assertSeat(game, p));
      if (info.showRole) assertScriptRole(game, info.showRole);
      if (!players.length && !info.showRole) throw new GameError('BAD_INFO', '請選擇玩家與角色');
      message.players = [...players];
      message.showRole = info.showRole ?? null;
      break;
    }
    case 'info-yes-no':
      if (typeof info.yes !== 'boolean') throw new GameError('BAD_INFO', '請選擇是或否');
      message.yes = info.yes;
      break;
    case 'info-role':
      if (info.showRole) assertScriptRole(game, info.showRole);
      if (!info.showRole) throw new GameError('BAD_INFO', '請選擇角色');
      message.showRole = info.showRole;
      if (Number.isInteger(info.player)) { assertSeat(game, info.player); message.player = info.player; }
      break;
    case 'info-grimoire':
      message.grimoire = grimoireSnapshot(game);
      break;
    case 'custom': {
      const text = String(info.text ?? '').trim().slice(0, CHAT_MAX_LEN);
      if (!text && !info.showRole) throw new GameError('BAD_INFO', '請輸入內容');
      message.text = text;
      if (info.showRole) { assertScriptRole(game, info.showRole); message.showRole = info.showRole; }
      break;
    }
  }
  if (info.text && type !== 'custom') message.text = String(info.text).trim().slice(0, CHAT_MAX_LEN);
  pushMessage(game, s.playerId, message);
  // 送出某角色的夜晚資訊即視為該項完成
  const queued = message.roleId && game.phase === 'night' ? game.nightQueue.find(e => e.key === `${message.roleId}:${target}`) : null;
  if (queued) queued.done = true;
  // 真假由系統依魔典判定（說書人無法自稱「真」）；無法判定時才採用說書人的標記
  const reply = message.roleId ? game.nightQueue.find(e => e.key === `${message.roleId}:${target}`)?.reply ?? null : null;
  const judged = message.roleId ? judgeInfo(game, target, message.roleId, message, reply) : null;
  const isTrue = judged ?? (typeof info.isTrue === 'boolean' ? info.isTrue : null);
  const { visibleAt: _v, ...logged } = message;
  addLog(game, 'info', { seat: target, message: clone(logged), isTrue, judged: judged !== null, impaired: isImpaired(game, target) }, false, now);
  return [{ playerId: s.playerId, message }];
}

// ── 提醒標記 / 死亡 / 角色變更（說書人）──────────────────────────
function addReminder(game, seat, reminderId, now = Date.now()) {
  assertPhase(game, 'setup', 'night', 'day');
  assertSeat(game, seat);
  if (typeof reminderId !== 'string' || !reminderId.includes(':')) throw new GameError('BAD_REMINDER', '提醒標記格式錯誤');
  const r = { id: nextId(game, 'r'), seat, reminderId: reminderId.slice(0, 60), source: null, auto: false, doubtful: false, clear: null, dayNumber: game.dayNumber };
  game.reminders.push(r);
  addLog(game, 'reminder-add', { seat, reminderId: r.reminderId }, false, now);
  return r;
}

function removeReminder(game, id, now = Date.now()) {
  assertPhase(game, 'setup', 'night', 'day');
  const r = game.reminders.find(x => x.id === id);
  if (!r) throw new GameError('BAD_REMINDER', '找不到這個提醒標記');
  game.reminders = game.reminders.filter(x => x.id !== id);
  addLog(game, 'reminder-remove', { seat: r.seat, reminderId: r.reminderId, auto: r.auto }, false, now);
}

// 夜晚標記的死亡要到天亮才公布（deathPending）；白天立即公開
function setDead(game, seat, dead, now = Date.now()) {
  assertPhase(game, 'night', 'day');
  const s = assertSeat(game, seat);
  if (s.hasLeft) throw new GameError('BAD_TARGET', '該玩家已離開');
  if (dead) {
    if (s.isDead) return;
    s.isDead = true;
    s.deathPending = game.phase === 'night';
  } else {
    s.isDead = false;
    s.deathPending = false;
    s.ghostVoteUsed = false;
  }
  addLog(game, dead ? 'death' : 'revive', { seat }, game.phase === 'day', now);
  if (game.phase === 'night') game.nightQueue = buildNightQueue(game);
  else if (dead) checkWinner(game);
}

function changeRole(game, seat, roleId, now = Date.now()) {
  assertPhase(game, 'night', 'day');
  const s = assertSeat(game, seat);
  assertScriptRole(game, roleId);
  const from = s.roleId;
  s.roleId = roleId;
  if (roleId !== 'drunk') s.shownRoleId = roleId;
  addLog(game, 'role-change', { seat, from, to: roleId }, false, now);
  if (game.phase === 'night') game.nightQueue = buildNightQueue(game);
}

// ════════════════════════════════════════════════════════════════
//  天亮 / 白天
// ════════════════════════════════════════════════════════════════
function systemChat(game, text, now) {
  pushCapped(game.chat.public, { id: nextId(game, 'c'), from: null, system: true, text, at: now }, PUBLIC_CHAT_CAP);
}

function toDawn(game, now = Date.now()) {
  assertPhase(game, 'night');
  game.reminders = game.reminders.filter(r => r.clear !== 'dawn');
  const deaths = [];
  game.seats.forEach((s, i) => { if (s.deathPending) { s.deathPending = false; deaths.push(i); } });
  game.dayNumber += 1;
  game.phase = 'day';
  game.daySubPhase = 'dawn';
  game.timer = null;
  game.prompts = {};
  game.nominations = emptyNominations();
  game.voting = null;
  addLog(game, 'dawn', { deaths }, true, now);
  const names = deaths.map(i => seatName(game, i));
  systemChat(game, deaths.length ? `第 ${game.dayNumber} 天：昨晚死亡的是 ${names.join('、')}` : `第 ${game.dayNumber} 天：昨晚是平安夜`, now);
  if (deaths.length) checkWinner(game);
  return deaths;
}

function seatName(game, i) {
  const s = game.seats[i];
  return s ? (game.names[s.playerId] ?? `座位 ${i + 1}`) : '?';
}

// dawn → free ⇄ nomination；extend：延長 1 分鐘
function setDayPhase(game, to, now = Date.now()) {
  assertPhase(game, 'day');
  if (to === 'extend') {
    if (!game.timer) throw new GameError('NO_TIMER', '目前沒有倒數');
    game.timer.endsAt += EXTEND_SECONDS * 1000;
    game.timer.durationSec += EXTEND_SECONDS;
    return;
  }
  const from = game.daySubPhase;
  const allowed = { dawn: ['free', 'nomination'], free: ['nomination'], nomination: ['free'] };
  if (!allowed[from]?.includes(to)) throw new GameError('BAD_PHASE', '無法切換到這個階段');
  if (to === 'nomination' && game.voting) throw new GameError('BAD_PHASE', '投票進行中');
  if (from === 'free') dissolveWhispers(game, now);
  game.daySubPhase = to;
  game.timer = to === 'free' ? { endsAt: now + FREE_SECONDS * 1000, durationSec: FREE_SECONDS } : null;
  addLog(game, 'day-phase', { to }, true, now);
}

const aliveCount = game => game.seats.filter(s => !s.isDead && !s.hasLeft).length;
const voteThreshold = game => Math.ceil(aliveCount(game) / 2);

function nominate(game, playerId, nominee, now = Date.now()) {
  assertPhase(game, 'day');
  if (game.daySubPhase !== 'nomination') throw new GameError('BAD_PHASE', '說書人還沒開放提名');
  const nominator = activeSeatOf(game, playerId);
  if (nominator < 0) throw new GameError('FORBIDDEN', '只有在座的玩家可以提名');
  const ns = game.seats[nominator];
  if (ns.isDead) throw new GameError('FORBIDDEN', '死亡玩家不能提名');
  const target = assertSeat(game, nominee);
  if (target.hasLeft) throw new GameError('BAD_TARGET', '不能提名已離開的玩家');
  const nom = game.nominations;
  if (nom.current && nom.current.stage !== 'done') throw new GameError('BUSY', '目前的提名還沒結束');
  if (nom.nominators.includes(nominator)) throw new GameError('ALREADY_NOMINATED', '你今天已經提名過了');
  if (nom.nominees.includes(nominee)) throw new GameError('ALREADY_NOMINATED', '這位玩家今天已經被提名過了');
  nom.nominators.push(nominator);
  nom.nominees.push(nominee);
  nom.current = { nominator, nominee, stage: 'speech' };
  addLog(game, 'nominate', { nominator, nominee }, true, now);
  return nom.current;
}

function cancelNomination(game, now = Date.now()) {
  assertPhase(game, 'day');
  const cur = game.nominations.current;
  if (!cur || cur.stage === 'done') throw new GameError('BAD_PHASE', '目前沒有提名');
  game.voting = null;
  cur.stage = 'done';
  addLog(game, 'nomination-cancel', { nominator: cur.nominator, nominee: cur.nominee }, true, now);
}

function startVote(game, { handSpeedMs } = {}, now = Date.now()) {
  assertPhase(game, 'day');
  const cur = game.nominations.current;
  if (!cur || cur.stage !== 'speech') throw new GameError('BAD_PHASE', '目前沒有等待投票的提名');
  const n = game.seats.length;
  const order = Array.from({ length: n }, (_, k) => (cur.nominee + 1 + k) % n); // 最後一位是被提名者本人
  cur.stage = 'voting';
  game.voting = {
    order, handIndex: 0, handSpeedMs: clampSpeed(handSpeedMs ?? DEFAULT_HAND_SPEED_MS),
    paused: false, hands: {}, voters: [], threshold: voteThreshold(game), startedAt: now,
  };
  return game.voting;
}

const clampSpeed = ms => Math.min(MAX_HAND_SPEED_MS, Math.max(MIN_HAND_SPEED_MS, Number(ms) || DEFAULT_HAND_SPEED_MS));

function canRaise(s) {
  return !s.hasLeft && (!s.isDead || !s.ghostVoteUsed);
}

// 舉手 / 放下：指針經過後鎖定
function setHand(game, seat, up, { by = 'player' } = {}, now = Date.now()) {
  assertPhase(game, 'day');
  const v = game.voting;
  if (!v) throw new GameError('BAD_PHASE', '現在不是投票時間');
  const s = assertSeat(game, seat);
  const pos = v.order.indexOf(seat);
  if (pos < v.handIndex) throw new GameError('LOCKED', '指針已經經過，無法更改');
  if (up && !canRaise(s)) throw new GameError('FORBIDDEN', s.hasLeft ? '已離開的玩家不能投票' : '你的幽靈票已經用過了');
  if (up) v.hands[seat] = true;
  else delete v.hands[seat];
  if (by === 'storyteller') addLog(game, 'hand-for', { seat, up: !!up }, false, now);
}

// 指針前進一位；回傳 { done, result }
function voteTick(game, now = Date.now()) {
  const v = game.voting;
  if (!v || v.paused) return { done: false };
  const seat = v.order[v.handIndex];
  const s = game.seats[seat];
  if (v.hands[seat] && canRaise(s)) {
    if (s.isDead) s.ghostVoteUsed = true;
    v.voters.push(seat);
  }
  v.handIndex += 1;
  if (v.handIndex < v.order.length) return { done: false };
  return { done: true, result: finishVote(game, now) };
}

function finishVote(game, now = Date.now()) {
  const v = game.voting;
  const nom = game.nominations;
  const cur = nom.current;
  const votes = v.voters.length;
  const result = { nominator: cur.nominator, nominee: cur.nominee, votes, voters: [...v.voters], threshold: v.threshold };
  nom.results.push(result);
  if (votes >= v.threshold) {
    if (votes > nom.highestVotes) { nom.onTheBlock = cur.nominee; nom.highestVotes = votes; }
    else if (votes === nom.highestVotes) nom.onTheBlock = null; // 同票 → 雙方都不處決
  }
  cur.stage = 'done';
  game.voting = null;
  addLog(game, 'vote', { ...result, onTheBlock: nom.onTheBlock }, true, now);
  return result;
}

function voteControl(game, { action, handSpeedMs } = {}, now = Date.now()) {
  assertPhase(game, 'day');
  if (action === 'cancel') return cancelNomination(game, now);
  const v = game.voting;
  if (!v) throw new GameError('BAD_PHASE', '現在不是投票時間');
  if (action === 'pause') v.paused = true;
  else if (action === 'resume') v.paused = false;
  else if (action === 'speed') v.handSpeedMs = clampSpeed(handSpeedMs);
  else throw new GameError('BAD_ACTION', '未知的操作');
}

// 結束白天：處決 onTheBlock → 檢查勝負；有勝負待確認時停在白天
function endDay(game, now = Date.now()) {
  assertPhase(game, 'day');
  if (game.voting) throw new GameError('BAD_PHASE', '投票進行中');
  const nom = game.nominations;
  if (!nom.executionDone) {
    nom.executionDone = true;
    const seat = nom.onTheBlock;
    if (seat !== null && seat !== undefined) {
      const s = game.seats[seat];
      nom.executed = seat;
      if (!s.isDead) s.isDead = true;
      addLog(game, 'execute', { seat, votes: nom.highestVotes }, true, now);
      systemChat(game, `${seatName(game, seat)} 被處決了`, now);
      if (checkWinner(game)) return { waiting: true, executed: seat };
    } else {
      addLog(game, 'execute', { seat: null }, true, now);
    }
  }
  if (game.pendingWinner) return { waiting: true, executed: nom.executed };
  toNight(game, now);
  return { waiting: false, executed: nom.executed };
}

function toNight(game, now = Date.now()) {
  dissolveWhispers(game, now);
  game.chat.invites = [];
  game.phase = 'night';
  game.daySubPhase = null;
  game.timer = null;
  game.voting = null;
  game.prompts = {};
  game.nightQueue = [];
  game.nightQueue = buildNightQueue(game);
  addLog(game, 'night', {}, true, now);
}

// ════════════════════════════════════════════════════════════════
//  勝負
// ════════════════════════════════════════════════════════════════
// 只判斷硬條件；結果放 pendingWinner，等說書人確認
function checkWinner(game) {
  if (!['night', 'day'].includes(game.phase)) return null;
  const alive = game.seats.filter(s => !s.isDead && !s.hasLeft);
  const demonAlive = alive.some(s => teamOf(s.roleId) === 'demon');
  let w = null;
  if (!demonAlive) {
    const sw = alive.some(s => s.roleId === 'scarletwoman') && alive.length >= 4;
    w = { team: 'good', reason: '惡魔已死亡', note: sw ? '紅唇女郎仍存活，可能接手成為惡魔' : null };
  } else if (alive.length <= 2) {
    w = { team: 'evil', reason: '只剩 2 名玩家存活，且惡魔仍存活', note: null };
  }
  game.pendingWinner = w;
  return w;
}

function confirmWinner(game, confirm, now = Date.now()) {
  assertPhase(game, 'night', 'day');
  const w = game.pendingWinner;
  if (!w) throw new GameError('NO_WINNER', '目前沒有待確認的勝負');
  game.pendingWinner = null;
  if (!confirm) { addLog(game, 'winner-deferred', { team: w.team }, false, now); return null; }
  return endGame(game, w.team, w.reason, now);
}

function declareWinner(game, team, reason, now = Date.now()) {
  assertPhase(game, 'night', 'day');
  if (!['good', 'evil'].includes(team)) throw new GameError('BAD_TEAM', '請選擇善良或邪惡');
  game.pendingWinner = null;
  return endGame(game, team, String(reason ?? '說書人宣告').slice(0, 100) || '說書人宣告', now);
}

function endGame(game, team, reason, now = Date.now()) {
  dissolveWhispers(game, now);
  game.chat.invites = [];
  const winnerIds = game.seats
    .filter(s => (team === 'good') === isGoodRole(s.roleId))
    .map(s => s.playerId);
  game.phase = 'result';
  game.timer = null;
  game.voting = null;
  game.prompts = {};
  game.winner = { team, reason, winnerIds };
  addLog(game, 'winner', { team, reason }, true, now);
  return game.winner;
}

// ════════════════════════════════════════════════════════════════
//  暫停 / 離開 / 交接 / 重來
// ════════════════════════════════════════════════════════════════
function pause(game) {
  if (game.phase === 'paused' || game.phase === 'lobby' || game.phase === 'result') return false;
  game.pausedFrom = game.phase;
  game.phase = 'paused';
  if (game.voting) game.voting.paused = true;
  return true;
}

function resume(game) {
  if (game.phase !== 'paused') return false;
  game.phase = game.pausedFrom ?? 'lobby';
  game.pausedFrom = null;
  return true;
}

// 玩家主動離開 / 被踢：遊戲中座位保留並標示「已離開」（視同死亡、沒有幽靈票）
// 回傳 'abort' 表示說書人離開、本局需中止
function playerLeft(game, playerId, now = Date.now()) {
  if (playerId === game.storytellerId) {
    if (game.phase === 'lobby') { game.storytellerId = null; return 'lobby'; }
    return 'abort';
  }
  if (game.phase === 'lobby') {
    game.lobbySeats = game.lobbySeats.map(id => (id === playerId ? null : id));
    return 'lobby';
  }
  const i = seatIndexOf(game, playerId);
  if (i < 0) return 'none';
  if (game.phase === 'setup') return 'setup';
  const s = game.seats[i];
  if (s.hasLeft) return 'none';
  s.hasLeft = true;
  s.isDead = true;
  s.deathPending = false;
  s.ghostVoteUsed = true;
  delete game.prompts[playerId];
  if (game.voting) delete game.voting.hands[i];
  leaveWhisperGroup(game, playerId, now);
  game.chat.invites = game.chat.invites.filter(inv => inv.from !== playerId && inv.to !== playerId);
  const real = game.phase === 'paused' ? game.pausedFrom : game.phase;
  addLog(game, 'left', { seat: i }, true, now);
  if (real === 'night') game.nightQueue = buildNightQueue(game);
  return 'seat';
}

function transferStoryteller(game, fromId, toId, now = Date.now()) {
  assertStoryteller(game, fromId);
  if (!toId || toId === fromId) throw new GameError('BAD_TARGET', '請選擇觀戰者');
  if (game.phase !== 'lobby' && seatIndexOf(game, toId) >= 0) throw new GameError('BAD_TARGET', '只能交給觀戰者（不能交給已入座玩家）');
  if (game.phase === 'lobby') game.lobbySeats = game.lobbySeats.map(id => (id === toId ? null : id));
  game.storytellerId = toId;
  if (game.phase !== 'lobby') addLog(game, 'storyteller-transfer', { from: fromId, to: toId }, true, now);
}

// 回到大廳：保留座位順序（離開的人除外）與說書人
function resetToLobby(game, keepIds = null) {
  const prevSeats = game.phase === 'lobby' ? game.lobbySeats : game.seats.filter(s => !s.hasLeft).map(s => s.playerId);
  const keep = id => id && (keepIds ? keepIds.includes(id) || isBotId(id) : true);
  const lobbySeats = Array(game.seatCount).fill(null);
  prevSeats.filter(keep).slice(0, game.seatCount).forEach((id, i) => { lobbySeats[i] = id; });
  const storytellerId = keepIds && game.storytellerId && !keepIds.includes(game.storytellerId) ? null : game.storytellerId;
  Object.assign(game, freshGameFields(), { phase: 'lobby', pausedFrom: null, lobbySeats, storytellerId });
}

// ════════════════════════════════════════════════════════════════
//  聊天
// ════════════════════════════════════════════════════════════════
function pushCapped(list, item, cap) {
  list.push(item);
  if (list.length > cap) list.splice(0, list.length - cap);
}

function cleanText(text) {
  const t = String(text ?? '').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();
  if (!t) throw new GameError('EMPTY', '訊息不能是空的');
  if (t.length > CHAT_MAX_LEN) throw new GameError('TOO_LONG', `每則最多 ${CHAT_MAX_LEN} 字`);
  return t;
}

function assertRate(game, playerId, now) {
  const last = game.chatRate[playerId];
  if (last !== undefined && now - last < CHAT_INTERVAL_MS) throw new GameError('TOO_FAST', '訊息送太快了，請稍等');
  game.chatRate[playerId] = now;
}

function chatPublic(game, playerId, text, now = Date.now()) {
  assertPhase(game, 'day');
  const who = identityOf(game, playerId);
  if (who === 'spectator') throw new GameError('FORBIDDEN', '觀戰者不能發言');
  if (!['free', 'nomination'].includes(game.daySubPhase)) throw new GameError('BAD_PHASE', '天亮公告中，稍後才能發言');
  const t = cleanText(text);
  assertRate(game, playerId, now);
  const message = { id: nextId(game, 'c'), from: playerId, text: t, at: now };
  pushCapped(game.chat.public, message, PUBLIC_CHAT_CAP);
  return message;
}

function groupOf(game, playerId) {
  return Object.values(game.chat.whispers).find(g => !g.endedAt && g.members.includes(playerId)) ?? null;
}

function pruneInvites(game, now = Date.now()) {
  game.chat.invites = game.chat.invites.filter(inv => inv.expiresAt > now);
}

function assertWhisperOpen(game) {
  assertPhase(game, 'day');
  if (game.daySubPhase !== 'free') throw new GameError('BAD_PHASE', '只有自由時間可以私聊');
}

// 邀請私聊：不在群組時開新群組（第一位接受者加入時才成立）；在群組內則邀請更多人
function whisperInvite(game, fromId, toIds, now = Date.now()) {
  assertWhisperOpen(game);
  if (identityOf(game, fromId) !== 'player') throw new GameError('FORBIDDEN', '只有玩家可以私聊');
  pruneInvites(game, now);
  const targets = [...new Set(Array.isArray(toIds) ? toIds : [toIds])];
  if (!targets.length) throw new GameError('BAD_TARGET', '請選擇要私聊的玩家');
  const current = groupOf(game, fromId);
  const groupId = current ? current.id : nextId(game, 'w');
  const created = [];
  for (const to of targets) {
    if (to === fromId) throw new GameError('BAD_TARGET', '不能邀請自己');
    if (identityOf(game, to) !== 'player') throw new GameError('BAD_TARGET', '只能邀請在座的玩家');
    if (current?.members.includes(to)) continue;
    if (game.chat.invites.some(inv => inv.groupId === groupId && inv.to === to)) continue;
    const inv = { id: nextId(game, 'i'), groupId, from: fromId, to, expiresAt: now + INVITE_TTL_MS };
    game.chat.invites.push(inv);
    created.push(inv);
  }
  return created;
}

function whisperRespond(game, playerId, inviteId, accept, now = Date.now()) {
  const inv = game.chat.invites.find(x => x.id === inviteId && x.to === playerId);
  if (!inv) throw new GameError('NO_INVITE', '邀請已失效');
  game.chat.invites = game.chat.invites.filter(x => x.id !== inviteId);
  if (inv.expiresAt <= now) throw new GameError('EXPIRED', '邀請已過期');
  if (!accept) return { declined: true, invite: inv };
  assertWhisperOpen(game);

  let group = game.chat.whispers[inv.groupId];
  if (group?.endedAt) throw new GameError('NO_INVITE', '這個私聊已經結束');
  if (group && !group.members.includes(inv.from)) throw new GameError('NO_INVITE', '邀請你的人已經離開私聊');
  if (!group) {
    const inviterGroup = groupOf(game, inv.from);
    if (inviterGroup) throw new GameError('NO_INVITE', '邀請你的人已經在其他私聊中');
  }
  const max = game.settings.whisperMax;
  const size = group ? group.members.length : 1;
  if (max && size + 1 > max) throw new GameError('FULL', `私聊人數上限 ${max} 人`);

  // 每人同時只能在一個群組：先離開原群組
  const prev = groupOf(game, playerId);
  const leftGroupId = prev && prev.id !== inv.groupId ? prev.id : null;
  if (leftGroupId) leaveWhisperGroup(game, playerId, now);

  if (!group) {
    const used = Object.values(game.chat.whispers).filter(g => !g.endedAt).map(g => g.color);
    const color = WHISPER_COLORS.find(c => !used.includes(c)) ?? WHISPER_COLORS[Object.keys(game.chat.whispers).length % WHISPER_COLORS.length];
    group = {
      id: inv.groupId, dayNumber: game.dayNumber, color, members: [inv.from],
      memberLog: [{ playerId: inv.from, joinAt: now, leaveAt: null }], history: [], createdAt: now, endedAt: null,
    };
    game.chat.whispers[group.id] = group;
  }
  group.members.push(playerId);
  group.memberLog.push({ playerId, joinAt: now, leaveAt: null });
  return { group, leftGroupId };
}

function endGroup(game, group, now) {
  group.endedAt = now;
  for (const m of group.memberLog) if (m.leaveAt === null) m.leaveAt = now;
  group.members = [];
  game.chat.invites = game.chat.invites.filter(inv => inv.groupId !== group.id);
  const participants = [...new Set(group.memberLog.map(m => m.playerId))];
  addLog(game, 'whisper', { groupId: group.id, participants, startAt: group.createdAt, endAt: now }, true, now);
}

function leaveWhisperGroup(game, playerId, now = Date.now()) {
  const group = groupOf(game, playerId);
  if (!group) return null;
  group.members = group.members.filter(id => id !== playerId);
  const entry = [...group.memberLog].reverse().find(m => m.playerId === playerId && m.leaveAt === null);
  if (entry) entry.leaveAt = now;
  game.chat.invites = game.chat.invites.filter(inv => !(inv.groupId === group.id && inv.from === playerId));
  if (group.members.length < 2) endGroup(game, group, now); // 剩 1 人自動結束
  return group;
}

function whisperLeave(game, playerId, now = Date.now()) {
  const g = leaveWhisperGroup(game, playerId, now);
  if (!g) throw new GameError('NOT_IN_GROUP', '你目前不在私聊中');
  return g;
}

function dissolveWhispers(game, now = Date.now()) {
  for (const g of Object.values(game.chat.whispers)) if (!g.endedAt) endGroup(game, g, now);
  game.chat.invites = [];
}

function whisperSend(game, playerId, text, now = Date.now()) {
  assertWhisperOpen(game);
  const group = groupOf(game, playerId);
  if (!group) throw new GameError('NOT_IN_GROUP', '你目前不在私聊中');
  const t = cleanText(text);
  assertRate(game, playerId, now);
  const message = { id: nextId(game, 'c'), from: playerId, text: t, at: now };
  pushCapped(group.history, message, WHISPER_CAP);
  return { group, message };
}

// 私訊說書人：玩家只能傳給說書人；說書人要帶 toPlayerId。回傳 { playerId（對話串）, message }
function chatStoryteller(game, fromId, text, toPlayerId = null, now = Date.now()) {
  if (game.phase === 'lobby') throw new GameError('BAD_PHASE', '遊戲開始後才能私訊說書人');
  if (!game.storytellerId) throw new GameError('NO_STORYTELLER', '目前沒有說書人');
  let thread;
  if (fromId === game.storytellerId) {
    if (!toPlayerId || seatIndexOf(game, toPlayerId) < 0) throw new GameError('BAD_TARGET', '請選擇玩家');
    thread = toPlayerId;
  } else {
    if (identityOf(game, fromId) !== 'player') throw new GameError('FORBIDDEN', '觀戰者不能私訊說書人');
    thread = fromId;
  }
  const t = cleanText(text);
  assertRate(game, fromId, now);
  const message = { id: nextId(game, 'c'), from: fromId, text: t, at: now };
  if (!game.chat.storyteller[thread]) game.chat.storyteller[thread] = [];
  pushCapped(game.chat.storyteller[thread], message, PUBLIC_CHAT_CAP);
  return { playerId: thread, message };
}

// ════════════════════════════════════════════════════════════════
//  說書人平衡指標（非強制，只是提醒：讓兩邊都有機會贏）
// ════════════════════════════════════════════════════════════════
function balanceStats(game) {
  const alive = game.seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.isDead && !s.hasLeft);
  const good = alive.filter(({ s }) => isGoodRole(s.roleId)).length;
  const evil = alive.length - good;
  const demonSeats = game.seats.map((s, i) => ({ s, i })).filter(({ s }) => !s.hasLeft && teamOf(s.roleId) === 'demon').map(({ i }) => i);
  const demonAlive = demonSeats.filter(i => !game.seats[i].isDead);

  // 惡魔被懷疑的程度：被提名次數、得票相對門檻的最高比例
  const votes = game.log.filter(e => e.type === 'vote' && demonSeats.includes(e.nominee));
  const demonNominated = votes.length;
  const demonMaxRatio = votes.reduce((m, e) => Math.max(m, e.threshold ? e.votes / e.threshold : 0), 0);
  const heat = demonMaxRatio >= 1 || demonNominated >= 2 ? 'high' : demonNominated >= 1 || demonMaxRatio >= 0.5 ? 'medium' : 'low';

  const infos = game.log.filter(e => e.type === 'info' && !e.target);
  const info = {
    total: infos.length,
    false: infos.filter(e => e.isTrue === false).length,
    falseHealthy: infos.filter(e => e.isTrue === false && !e.impaired).length, // 給「沒中毒 / 醉酒」的人假資訊（只有隱士 / 間諜等情況才合理）
  };

  // 粗估：每個白天 + 夜晚通常少 2 人（處決 + 夜殺），剩 2 人時邪惡獲勝
  const daysLeft = demonAlive.length ? Math.max(0, Math.ceil((alive.length - 2) / 2)) : 0;

  const hints = [];
  if (demonAlive.length && evil >= good) hints.push('邪惡存活人數已追平善良：善良很危險，可考慮讓善良的資訊更準確');
  if (demonAlive.length && alive.length <= 4) hints.push(`決勝階段：只剩 ${alive.length} 人存活`);
  if (demonAlive.length && heat === 'high' && alive.length >= 6) hints.push('惡魔已被高度懷疑且遊戲還早：可考慮給邪惡一些喘息空間（例如隱士 / 間諜的誤判、選擇性的平安夜）');
  if (demonAlive.length && heat === 'low' && alive.length <= 5) hints.push('惡魔幾乎沒被懷疑且人數不多：可考慮給善良更有力的資訊');
  if (info.falseHealthy) hints.push(`已有 ${info.falseHealthy} 則給「沒中毒 / 醉酒」玩家的資訊與魔典不符，終局會公開`);

  return {
    alive: { total: alive.length, good, evil },
    demonAlive: demonAlive.length > 0,
    heat, demonNominated, demonMaxRatio: Math.round(demonMaxRatio * 100) / 100,
    info, daysLeft, hints,
  };
}

// ════════════════════════════════════════════════════════════════
//  視圖：只回傳觀看者有權看到的內容
// ════════════════════════════════════════════════════════════════
function buildView(game, viewerId = null, now = Date.now()) {
  const who = identityOf(game, viewerId);
  const isST = who === 'storyteller';
  const reveal = game.phase === 'result';
  const full = isST || reveal;
  const mySeat = who === 'player' && game.phase !== 'lobby' ? seatIndexOf(game, viewerId) : -1;

  const view = {
    phase: game.phase,
    pausedFrom: game.pausedFrom,
    gameNo: game.gameNo,
    scriptId: game.scriptId,
    storytellerId: game.storytellerId,
    seatCount: game.seatCount,
    settings: { ...game.settings },
    names: { ...game.names },
    serverNow: now,
    viewer: { role: who, playerId: viewerId, seat: mySeat },
    lobbySeats: game.phase === 'lobby' ? [...game.lobbySeats] : [],
    dayNumber: game.dayNumber,
    daySubPhase: game.daySubPhase,
    timer: game.timer ? { ...game.timer } : null,
    seats: game.seats.map((s, i) => {
      const pub = {
        index: i, playerId: s.playerId, isBot: isBotId(s.playerId),
        isDead: s.isDead && (full || !s.deathPending), ghostVoteUsed: s.ghostVoteUsed, hasLeft: s.hasLeft,
      };
      if (full) Object.assign(pub, { roleId: s.roleId, shownRoleId: s.shownRoleId, drunkAs: s.drunkAs, deathPending: s.deathPending });
      return pub;
    }),
    nominations: {
      nominators: [...game.nominations.nominators],
      nominees: [...game.nominations.nominees],
      current: game.nominations.current ? { ...game.nominations.current } : null,
      results: clone(game.nominations.results),
      onTheBlock: game.nominations.onTheBlock,
      highestVotes: game.nominations.highestVotes,
      executed: game.nominations.executed,
      executionDone: game.nominations.executionDone,
    },
    voting: game.voting ? clone(game.voting) : null,
    voteThreshold: game.seats.length ? voteThreshold(game) : 0,
    aliveCount: game.seats.length ? aliveCount(game) : 0,
    whisperGroups: Object.values(game.chat.whispers).filter(g => !g.endedAt).map(g => ({
      id: g.id, color: g.color, members: [...g.members], createdAt: g.createdAt, dayNumber: g.dayNumber,
    })),
    // 誰跟誰私聊過、加入 / 離開時間（不含內容；圓桌連線本來就公開）→ 私聊統計表
    whisperLog: Object.values(game.chat.whispers).map(g => ({
      id: g.id, color: g.color, dayNumber: g.dayNumber, memberLog: clone(g.memberLog),
    })),
    chat: { public: clone(game.chat.public), whispers: {}, storyteller: {} },
    log: game.log.filter(e => full || e.public).map(e => clone(e)),
    winner: game.winner ? clone(game.winner) : null,
    me: null,
    grimoire: null,
  };

  // 私聊內容：成員本人（含曾經加入過的群組）；終局全部公開；說書人在終局前看不到
  for (const g of Object.values(game.chat.whispers)) {
    const wasMember = g.memberLog.some(m => m.playerId === viewerId);
    if (reveal || (who === 'player' && wasMember)) {
      view.chat.whispers[g.id] = { id: g.id, color: g.color, dayNumber: g.dayNumber, createdAt: g.createdAt, endedAt: g.endedAt,
        participants: [...new Set(g.memberLog.map(m => m.playerId))], history: clone(g.history) };
    }
  }
  // 私訊說書人：永遠只有本人與說書人
  if (isST) view.chat.storyteller = clone(game.chat.storyteller);
  else if (who === 'player' && game.chat.storyteller[viewerId]) view.chat.storyteller = { [viewerId]: clone(game.chat.storyteller[viewerId]) };

  if (who === 'player' && mySeat >= 0) {
    const s = game.seats[mySeat];
    const visible = x => (x.visibleAt ?? 0) <= now; // 夜晚隨機延遲：時間到才看得到
    const prompt = game.prompts[viewerId];
    view.me = {
      seat: mySeat,
      roleId: s.shownRoleId,      // 酒鬼看到的是假的鎮民
      messages: clone((game.messages[viewerId] ?? []).filter(visible)),
      prompt: prompt && visible(prompt) ? clone(prompt) : null,
      invites: game.chat.invites.filter(inv => inv.to === viewerId && inv.expiresAt > now).map(inv => ({ ...inv })),
      sentInvites: game.chat.invites.filter(inv => inv.from === viewerId && inv.expiresAt > now).map(inv => ({ ...inv })),
      whisperGroupId: groupOf(game, viewerId)?.id ?? null,
    };
  }

  if (full && game.phase !== 'lobby') {
    view.grimoire = {
      bluffs: [...game.bluffs],
      reminders: clone(game.reminders),
      messages: clone(game.messages),
    };
  }

  if (isST && view.grimoire) {
    Object.assign(view.grimoire, {
      setupRoles: [...game.setupRoles],
      setupErrors: game.phase === 'setup' ? checkSetup(game) : [],
      expected: game.seats.length ? expectedComposition(game.seats.length, game.seats.map(s => s.roleId).filter(Boolean).concat(game.phase === 'setup' ? game.setupRoles : [])) : null,
      // 每一項附上系統算出的真實答案（預填用）
      nightQueue: game.nightQueue.map(e => ({
        ...clone(e), truth: e.seat === null ? null : computeTruth(game, e.seat, e.roleId, e.reply),
      })),
      balance: ['night', 'day'].includes(game.phase === 'paused' ? game.pausedFrom : game.phase) ? balanceStats(game) : null,
      prompts: clone(game.prompts),
      impaired: game.seats.map((_, i) => isImpaired(game, i)),
      pendingWinner: game.pendingWinner ? { ...game.pendingWinner } : null,
      invites: game.chat.invites.filter(inv => inv.expiresAt > now).map(inv => ({ ...inv })),
      whisperMemberLog: Object.fromEntries(Object.values(game.chat.whispers).map(g => [g.id, clone(g.memberLog)])),
    });
  }
  return view;
}

module.exports = {
  DEV_BOTS, BOT_PREFIX, MIN_SEATS, MAX_SEATS, COMPOSITION, TEAMS, FREE_SECONDS, EXTEND_SECONDS, BLUFF_COUNT,
  CHAT_MAX_LEN, CHAT_INTERVAL_MS, PUBLIC_CHAT_CAP, WHISPER_CAP, INVITE_TTL_MS, DEFAULT_HAND_SPEED_MS, EVIL_INFO_MIN_SEATS,
  NIGHT_DELAY_MAX_MS,
  ROLES, GameError, shuffle, isBotId, teamOf, isGoodRole, scriptInfo, scriptRoleIds, randomDelay, seededRng,
  computeTruth, judgeInfo, balanceStats, aliveNeighbors,
  createLobby, identityOf, seatIndexOf, activeSeatOf, assertStoryteller,
  setStoryteller, pickRandomStoryteller, claimSeat, swapSeats, addBots, removeBots, updateSettings,
  baseComposition, expectedComposition, checkSetup, beginSetup, backToLobbyFromSetup, selectRoles, randomRoles,
  randomAssign, autoSetup, setSeatRole, swapSeatRoles, setDrunkAs, setBluffs, randomBluffs, startGame,
  buildNightQueue, setQueueDone, isImpaired, wake, cancelPrompt, replyPrompt, actFor, sendInfo,
  addReminder, removeReminder, setDead, changeRole,
  toDawn, setDayPhase, nominate, cancelNomination, startVote, setHand, voteTick, voteControl, endDay, toNight,
  voteThreshold, aliveCount, checkWinner, confirmWinner, declareWinner,
  pause, resume, playerLeft, transferStoryteller, resetToLobby,
  chatPublic, whisperInvite, whisperRespond, whisperLeave, whisperSend, chatStoryteller, pruneInvites, groupOf,
  buildView,
};
