'use strict';

// ================================================================
//  默契字囊團 — 遊戲邏輯（/character-storm namespace）
//
//  房間管理（建立/加入/踢人/重連/觀戰）已委託給 server/room/index.js
//  本檔案只處理：遊戲開始、提示輸入、猜題、輪轉、結算
// ================================================================

const { registerRoomHandlers } = require('../room');
const { processHints, validateHint } = require('./filterLogic');
const { assignRoles }                = require('./roleAssign');
const { listThemes }                 = require('./themeStore');

const ROUND2_QUOTA  = 4;
const TIMER_SECONDS = 90;
let AVAILABLE_THEMES = [0, 1, 2, 3]; // 啟動時由 DB 動態覆寫，題庫管理異動後刷新

// themePreference 特殊值：-1 = 每局隨機挑一個主題；-2 = 全部主題混成一個題庫
const THEME_RANDOM = -1;
const THEME_ALL    = -2;

let hasLoggedThemeColumnMissing = false;

function pickRandomTheme() {
  return AVAILABLE_THEMES[Math.floor(Math.random() * AVAILABLE_THEMES.length)];
}

// A/B 判定（Bulls & Cows）
function calculateAB(word, guess) {
  const wChars = [...word];
  const gChars = [...guess];
  if (!gChars.length) return { a: 0, b: 0 };
  let a = 0;
  const wRem = [], gRem = [];
  for (let i = 0; i < wChars.length; i++) {
    if (i < gChars.length && wChars[i] === gChars[i]) { a++; }
    else { wRem.push(wChars[i]); if (i < gChars.length) gRem.push(gChars[i]); }
  }
  let b = 0;
  for (const gc of gRem) {
    const idx = wRem.indexOf(gc);
    if (idx !== -1) { b++; wRem.splice(idx, 1); }
  }
  return { a, b };
}

// ────────────────────────────────────────────────────────────────
//  遊戲快取（只存遊戲狀態；房間/玩家清單與在線狀態由 RoomModule 的 roomCache 管理）
//
//  csCache[roomId] = {
//    maxPlayers, status, players (id/nickname/socketId/role/quota),
//    currentGuesserIndex, roundNumber, guesserHistory,
//    currentWord, usedWordIds, usedWords, themePreference, themeId,
//    roundPhase, round1Hints, round2Hints, symbolMap,
//    cachedRound1Result, cachedRound2Result,
//    timerRemaining, _timerHandle
//  }
// ────────────────────────────────────────────────────────────────
const csCache = {};
const MAX_SEEN_WORD_IDS = 500;  // 避免 drawWord 的 not-in 查詢過長

function initGame(roomId, maxPlayers, themePreference = THEME_ALL) {
  csCache[roomId] = {
    maxPlayers,
    status:              'waiting',
    players:             [],
    currentGuesserIndex: 0,
    roundNumber:         0,
    guesserHistory:      [],
    currentWord:         null,
    usedWordIds:         [],
    usedWords:           [],
    themePreference,
    themeId:             null,
    roundPhase:          null,
    round1Hints:         {},
    round2Hints:         {},
    symbolMap:           {},
    cachedRound1Result:  null,
    cachedRound2Result:  null,
    timerRemaining:      TIMER_SECONDS,
    _timerHandle:        null,
  };
  return csCache[roomId];
}

function getGame(roomId) { return csCache[roomId] || null; }

// 在線/房主判斷一律走 roomCache，避免雙寫 desync
function isOnline(roomCache, roomId, playerId) {
  return roomCache?.getEntry(roomId)?.players.find(p => p.id === playerId)?.is_online ?? false;
}

function isHost(roomCache, roomId, playerId) {
  return roomCache?.getEntry(roomId)?.room?.host_player_id === playerId;
}

// ── DB 工具（只有遊戲相關，房間/玩家 DB 操作已移至 RoomModule）──
function makeDB(db) {
  return {
    async upsertSessionRole(roomId, playerId, role, quota) {
      try {
        await db.from('character_storm_sessions').upsert(
          { room_id: roomId, player_id: playerId, role, quota: quota ?? null,
            updated_at: new Date().toISOString() },
          { onConflict: 'room_id,player_id' }
        );
      } catch (err) {
        if (err?.code !== '42P01') console.error('[CS] upsertSessionRole:', err.message);
      }
    },

    async getSessionRoles(roomId) {
      try {
        const { data } = await db.from('character_storm_sessions')
          .select('player_id, role, quota').eq('room_id', roomId);
        return data ?? [];
      } catch { return []; }
    },

    async drawWord(usedIds = [], themeId = 0) {
      const usedFilter = `(${usedIds.length ? usedIds.join(',') : 0})`;

      async function drawWithoutThemeFilter() {
        const { count, error: cE } = await db.from('character_storm_words')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true).not('id', 'in', usedFilter);
        if (cE) throw cE;
        if (!count) return null;
        const offset = Math.floor(Math.random() * count);
        const { data, error } = await db.from('character_storm_words')
          .select('id, word, category, author').eq('is_active', true)
          .not('id', 'in', usedFilter).range(offset, offset);
        if (error) throw error;
        return data?.[0] ?? null;
      }

      async function drawByTheme(id) {
        const { count, error: cE } = await db.from('character_storm_words')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true).eq('weekday_bank', id).not('id', 'in', usedFilter);
        if (cE) throw cE;
        if (!count) return null;
        const offset = Math.floor(Math.random() * count);
        const { data, error } = await db.from('character_storm_words')
          .select('id, word, category, author').eq('is_active', true)
          .eq('weekday_bank', id).not('id', 'in', usedFilter).range(offset, offset);
        if (error) throw error;
        return data?.[0] ?? null;
      }

      try {
        if (themeId === THEME_ALL) return await drawWithoutThemeFilter();
        const word = await drawByTheme(themeId);
        if (!word) return await drawWithoutThemeFilter();
        return word;
      } catch (error) {
        if (error?.code === '42703') {
          if (!hasLoggedThemeColumnMissing) {
            hasLoggedThemeColumnMissing = true;
            console.warn('[CS] weekday_bank 欄位不存在，已回退為舊題庫模式');
          }
          return await drawWithoutThemeFilter();
        }
        throw error;
      }
    },

    async getAvailableThemes() {
      try {
        const ids = (await listThemes(db)).map(t => t.id);
        return ids.length ? ids : null;
      } catch {
        return null; // 欄位不存在或查詢失敗，維持預設值
      }
    },
  };
}

// ── 計時器工具 ──────────────────────────────────────────────────
function clearTimer(game) {
  if (game._timerHandle) { clearInterval(game._timerHandle); game._timerHandle = null; }
}

function startTimer(ns, roomId, game, onExpire) {
  clearTimer(game);
  game.timerRemaining = TIMER_SECONDS;
  game._timerHandle = setInterval(async () => {
    game.timerRemaining -= 1;
    ns.to(roomId).emit('cs:timer-tick', { remaining: game.timerRemaining });
    if (game.timerRemaining <= 0) {
      clearTimer(game);
      await onExpire().catch(err => console.error('[CS timer]', err.message));
    }
  }, 1000);
}

// ── 廣播工具 ─────────────────────────────────────────────────────
function buildPlayerList(game, roomCache, roomId) {
  return game.players.map(p => ({
    id: p.id, nickname: p.nickname, role: p.role, quota: p.quota,
    connected: isOnline(roomCache, roomId, p.id),
  }));
}

function getCurrentGuesser(game) { return game.players[game.currentGuesserIndex] ?? null; }

function pickRandomConnectedGuesserIndex(game, roomCache, roomId) {
  const candidates = game.players.map((p, i) => ({ p, i }))
    .filter(({ p }) => isOnline(roomCache, roomId, p?.id));
  if (!candidates.length) return 0;
  return candidates[Math.floor(Math.random() * candidates.length)].i;
}

function findNextGuesserIndex(game, roomCache, roomId) {
  const total = game.players.length;
  for (let i = 1; i <= total; i++) {
    const idx    = (game.currentGuesserIndex + i) % total;
    const player = game.players[idx];
    if (!player || !isOnline(roomCache, roomId, player.id)) continue;
    if (!game.guesserHistory.includes(player.id)) return idx;
  }
  return -1;
}

// ── 核心：處理一輪提示 ────────────────────────────────────────────
async function processRoundHints(ns, roomId, game, isRound2, roomCache) {
  clearTimer(game);
  const hintRecord = isRound2 ? game.round2Hints : game.round1Hints;
  const providers  = game.players.filter(p => p.role !== 'guesser');
  const hints = providers
    .filter(p => hintRecord[p.id])
    .map(p => ({ id: p.id, text: hintRecord[p.id] }));

  const inheritedMap = isRound2 ? game.symbolMap : {};
  const { forProvider, forGuesser, symbolMap } = processHints(hints, inheritedMap);

  game.symbolMap  = symbolMap;
  game.roundPhase = isRound2 ? 'round2-result' : 'round1-result';

  const _wordLen = [...(game.currentWord?.word ?? '')].length;
  const _cache = {
    guesser:  { hints: forGuesser, symbolMap, isRound2, wordLength: _wordLen },
    provider: { hints: forGuesser, hintsProvider: forProvider, symbolMap, isRound2, wordLength: _wordLen },
  };
  if (isRound2) game.cachedRound2Result = _cache;
  else          game.cachedRound1Result = _cache;

  const eventName = isRound2 ? 'cs:round2-result' : 'cs:round1-result';

  for (const player of game.players) {
    const sock = ns.sockets.get(player.socketId);
    if (!sock) continue;
    const wordLength = _wordLen;
    if (player.role === 'guesser') {
      sock.emit(eventName, { hints: forGuesser, symbolMap, isRound2, wordLength });
    } else {
      sock.emit(eventName, { hints: forGuesser, hintsProvider: forProvider, symbolMap, isRound2, wordLength });
    }
  }

  // 作答也有伺服器端倒數（前端 90 秒 + 3 秒寬限）；猜題者斷線或卡住時代交空白，避免全房卡死
  const expectedPhase = game.roundPhase;
  game.timerRemaining = TIMER_SECONDS;
  game._timerHandle = setTimeout(() => {
    game._timerHandle = null;
    if (game.roundPhase === expectedPhase) resolveGuess(ns, roomCache, roomId, game, '');
  }, (TIMER_SECONDS + 3) * 1000);
}

// ── 核心：結算一次猜題（猜題者送出，或伺服器端逾時代交空白）──────
function resolveGuess(ns, roomCache, roomId, game, answer) {
  // 只有作答階段才接受答案，避免提示階段提早猜或重複結算
  if (!['round1-result', 'round2-result'].includes(game.roundPhase)) return;

  const isRound2 = game.roundPhase === 'round2-result';
  const trimmed  = (answer ?? '').trim();
  const correct  = trimmed === game.currentWord?.word;
  const ab       = calculateAB(game.currentWord?.word ?? '', trimmed);

  game.roundPhase = 'revealing';
  clearTimer(game);

  const shouldRevealWord = correct || isRound2;
  ns.to(roomId).emit('cs:guess-result', {
    correct, answer: trimmed,
    word:      shouldRevealWord ? game.currentWord?.word  : null,
    author:    shouldRevealWord ? game.currentWord?.author : null,
    wasRound2: isRound2, a: ab.a, b: ab.b,
  });

  if (!correct && !isRound2) setTimeout(() => startRound2(ns, roomCache, roomId, game), 2000);
}

// ── 核心：開始新一輪（新猜題者）─────────────────────────────────
async function startNewGuesserRound(ns, DB, roomCache, roomId, game) {
  game.round1Hints = {};
  game.round2Hints = {};
  game.symbolMap   = {};
  game.roundPhase  = 'round1';

  const assignments = assignRoles(game.players, game.currentGuesserIndex);
  for (const { id, role, quota } of assignments) {
    const p = game.players.find(p => p.id === id);
    if (p) { p.role = role; p.quota = quota; }
  }

  // 持久化角色分配（server 重啟後可還原）
  for (const { id, role, quota } of assignments) {
    await DB.upsertSessionRole(roomId, id, role, quota).catch(() => {});
  }

  ns.to(roomId).emit('cs:round1-start', {
    roundNumber:         game.roundNumber,
    currentGuesserIndex: game.currentGuesserIndex,
    players:             buildPlayerList(game, roomCache, roomId),
  });

  for (const player of game.players) {
    const sock = ns.sockets.get(player.socketId);
    if (!sock) continue;
    sock.emit('cs:role-assigned', { role: player.role, quota: player.quota });
  }

  // 不同主題可能有同一個詞（「全部主題」模式），抽到本局用過的詞就排除該筆重抽
  const drawUnused = async () => {
    let w = await DB.drawWord(game.usedWordIds, game.themeId ?? 0).catch(() => null);
    for (let retry = 0; w && game.usedWords.includes(w.word) && retry < 20; retry++) {
      game.usedWordIds.push(w.id);
      w = await DB.drawWord(game.usedWordIds, game.themeId ?? 0).catch(() => null);
    }
    return w;
  };
  let word = await drawUnused();
  // used 清單跨局累積；整個題庫抽完（或只剩重複詞）時重置一次再抽
  if (!word && game.usedWordIds.length > 0) {
    game.usedWordIds = [];
    game.usedWords   = [];
    word = await drawUnused();
  }
  if (!word) {
    clearTimer(game);
    game.status = 'finished'; game.roundPhase = null;
    ns.to(roomId).emit('cs:error', { code: 'NO_WORD_LEFT', message: '本局題庫已用完，直接結束本局。' });
    ns.to(roomId).emit('cs:finished', { players: buildPlayerList(game, roomCache, roomId) });
    return;
  }

  game.currentWord = word;
  game.usedWordIds.push(word.id);
  game.usedWords.push(word.word);
  // 只送題目 id（不含內容，猜題者不會因此得知答案），讓各端 localStorage 記錄
  ns.to(roomId).emit('cs:word-used', { id: word.id });

  for (const player of game.players.filter(p => p.role !== 'guesser')) {
    const sock = ns.sockets.get(player.socketId);
    sock?.emit('cs:word-revealed', { word: word.word, category: word.category, author: word.author ?? null });
  }

  startTimer(ns, roomId, game, async () => {
    await processRoundHints(ns, roomId, game, false, roomCache);
  });
}

// ── 核心：啟動第二輪 ─────────────────────────────────────────────
async function startRound2(ns, roomCache, roomId, game) {
  game.round2Hints = {};
  game.roundPhase  = 'round2';

  for (const p of game.players) {
    if (p.role !== 'guesser') p.quota = ROUND2_QUOTA;
  }

  ns.to(roomId).emit('cs:round2-start', { players: buildPlayerList(game, roomCache, roomId) });

  for (const player of game.players) {
    const sock = ns.sockets.get(player.socketId);
    if (!sock) continue;
    sock.emit('cs:role-assigned', { role: player.role, quota: player.quota });
  }

  for (const player of game.players.filter(p => p.role !== 'guesser')) {
    const sock = ns.sockets.get(player.socketId);
    sock?.emit('cs:word-revealed', {
      word: game.currentWord?.word,
      category: game.currentWord?.category,
      author: game.currentWord?.author,
    });
  }

  startTimer(ns, roomId, game, async () => {
    await processRoundHints(ns, roomId, game, true, roomCache);
  });
}

// ================================================================
//  主入口：registerNamespace
// ================================================================
function registerNamespace(io, db) {
  const DB = makeDB(db);
  const ns = io.of('/character-storm');

  // ── 房間 Hooks（接橋 RoomModule ↔ 遊戲邏輯）────────────────
  // 用來讓 hooks 存取 roomCache（onPlayerJoined 初始化 csCache 時需要）
  let _roomCache = null;

  const hooks = {
    appId:      'character-storm',
    minPlayers: 2,

    canJoinAsPlayer(roomId) {
      const game = getGame(roomId);
      if (!game || game.status === 'waiting' || game.status === 'finished') return true;
      if (game.roundPhase === 'revealing') return true;
      return false;
    },

    spectatorCanUpgrade(roomId) {
      const game = getGame(roomId);
      if (!game || game.status === 'waiting' || game.status === 'finished') return true;
      if (game.roundPhase === 'revealing') return true;
      return false;
    },

    buildGameState(roomId) {
      const game = getGame(roomId);
      if (!game) return null;
      return {
        status:              game.status,
        roundPhase:          game.roundPhase,
        roundNumber:         game.roundNumber,
        currentGuesserIndex: game.currentGuesserIndex,
        themePreference:     game.themePreference,
        timerRemaining:      game.timerRemaining,
        players:             buildPlayerList(game, _roomCache, roomId),
      };
    },

    async onPlayerJoined(socket, roomId, playerId, isReconnect) {
      let game = getGame(roomId);
      if (!game) {
        // csCache 尚未建立 → 從 roomCache 同步初始化
        const entry = _roomCache?.getEntry(roomId);
        if (!entry) return;
        const pref = entry.room.options?.themePreference ?? THEME_ALL;
        game = initGame(roomId, entry.room.max_players, pref);
        for (const p of entry.players) {
          // 優先用當前 socket，其次從 namespace 查找已連線的 socket
          let socketId = null;
          if (p.id === playerId) {
            socketId = socket.id;
          } else {
            for (const [sid, s] of ns.sockets) {
              if (s.data?.playerId === p.id) { socketId = sid; break; }
            }
          }
          game.players.push({
            id: p.id, nickname: p.nickname,
            socketId,
            role: null, quota: null,
          });
        }
        console.log(`[CS] initGame from roomCache: ${roomId} (${game.players.length} players)`);
        return; // 新人不需補發遊戲狀態
      }

      // 同步 socketId
      const p = game.players.find(p => p.id === playerId);
      if (p) {
        p.socketId = socket.id;
      } else {
        // 新玩家後加入（觀戰升玩家等）
        const entry = _roomCache?.getEntry(roomId);
        const rp = entry?.players.find(ep => ep.id === playerId);
        game.players.push({
          id: playerId, nickname: rp?.nickname ?? '', socketId: socket.id,
          role: null, quota: null,
        });
      }

      if (!isReconnect) return;

      // 重連：補發遊戲狀態
      if (p?.role) socket.emit('cs:role-assigned', { role: p.role, quota: p.quota });

      const phase = game.roundPhase;
      if (['round1', 'round2'].includes(phase) && p?.role !== 'guesser' && game.currentWord) {
        socket.emit('cs:word-revealed', {
          word: game.currentWord.word, category: game.currentWord.category,
          author: game.currentWord.author ?? null,
        });
      }
      if (phase === 'round1-result' && game.cachedRound1Result) {
        socket.emit('cs:round1-result', p?.role === 'guesser'
          ? game.cachedRound1Result.guesser : game.cachedRound1Result.provider);
      }
      if (phase === 'round2-result') {
        if (game.cachedRound1Result) socket.emit('cs:round1-result', p?.role === 'guesser'
          ? game.cachedRound1Result.guesser : game.cachedRound1Result.provider);
        if (game.cachedRound2Result) socket.emit('cs:round2-result', p?.role === 'guesser'
          ? game.cachedRound2Result.guesser : game.cachedRound2Result.provider);
      }
      if (game.timerRemaining > 0) {
        socket.emit('cs:timer-tick', { remaining: game.timerRemaining });
      }
      const hintRecord = phase === 'round2' ? game.round2Hints : game.round1Hints;
      if (['round1', 'round2'].includes(phase)) {
        socket.emit('cs:hint-progress', { submittedIds: Object.keys(hintRecord) });
      }
    },

    onPlayerLeft(roomId, playerId, reason) {
      const game = getGame(roomId);
      if (!game) return;

      const p = game.players.find(p => p.id === playerId);
      if (!p) return;

      if (reason === 'disconnect') {
        p.socketId = null;
      } else {
        const leftIndex = game.players.findIndex(pp => pp.id === playerId);
        game.players = game.players.filter(p => p.id !== playerId);
        // players 陣列縮短後，currentGuesserIndex 必須跟著位移，否則猜題者會變成別人
        if (leftIndex !== -1 && leftIndex <= game.currentGuesserIndex) {
          game.currentGuesserIndex -= 1;
        }
        if (leftIndex !== -1 && leftIndex === game.currentGuesserIndex + 1
            && ['round1', 'round1-result', 'round2', 'round2-result'].includes(game.roundPhase)
            && p.role === 'guesser') {
          // 猜題者本人離開 → 本題作廢，交給房主按「下一位」
          clearTimer(game);
          game.guesserLeft = true;
          game.roundPhase  = 'revealing';
          ns.to(roomId).emit('cs:guess-result', {
            correct: false, answer: '', word: game.currentWord?.word ?? null,
            author: game.currentWord?.author ?? null, wasRound2: true, a: 0, b: 0,
          });
          return;
        }
      }

      // 房主轉移由統一房間模組處理

      // 若在提示輸入中且剩餘在線提示者全已送出 → 提前結束倒數
      if (['round1', 'round2'].includes(game.roundPhase)) {
        const isRound2 = game.roundPhase === 'round2';
        const hintRecord = isRound2 ? game.round2Hints : game.round1Hints;
        const activeProviders = game.players.filter(pp =>
          pp.role !== 'guesser' && isOnline(_roomCache, roomId, pp.id));
        if (activeProviders.length > 0 && activeProviders.every(pp => hintRecord[pp.id])) {
          processRoundHints(ns, roomId, game, isRound2, _roomCache).catch(console.error);
        }
      }
    },

    onSpectatorUpgraded(socket, roomId, playerId) {
      const game = getGame(roomId);
      if (!game) return;
      if (!game.players.find(p => p.id === playerId)) {
        game.players.push({
          id: playerId, nickname: '', socketId: socket.id,
          role: null, quota: null,
        });
      }
    },
  };

  // 掛載房間模組
  const { roomCache } = registerRoomHandlers(ns, db, hooks);
  _roomCache = roomCache; // 讓 hooks 的函數存取 roomCache

  // ── 動態載入可用 themes（題庫管理新增 / 刪除後會再次呼叫）────
  function refreshThemes() {
    return DB.getAvailableThemes().then(ids => {
      if (ids) {
        AVAILABLE_THEMES = ids;
        console.log('[CS] 可用題庫主題（weekday_bank）:', ids.join(', '));
      } else {
        console.log('[CS] 使用預設題庫主題:', AVAILABLE_THEMES.join(', '));
      }
    });
  }
  refreshThemes();

  // ── 遊戲 Handlers ───────────────────────────────────────────
  ns.on('connection', (socket) => {
    console.log(`[CS] connect: ${socket.id}`);

    // ── 開始遊戲（房主）──────────────────────────────────
    socket.on('cs:start', async ({ roomId, themePreference, seenWordIds }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const game = getGame(roomId);
        if (!game) return socket.emit('cs:error', { code: 'ROOM_NOT_FOUND', message: '房間不存在' });
        if (!isHost(_roomCache, roomId, playerId))
          return socket.emit('cs:error', { code: 'FORBIDDEN', message: '只有房主可以開始遊戲' });
        if (game.players.length < hooks.minPlayers)
          return socket.emit('cs:error', { code: 'NOT_ENOUGH', message: `至少需要 ${hooks.minPlayers} 位玩家！` });
        if (game.status !== 'waiting') return;

        if (themePreference !== undefined) game.themePreference = Number(themePreference);
        game.status              = 'playing';
        game.currentGuesserIndex = pickRandomConnectedGuesserIndex(game, _roomCache, roomId);
        game.themeId             = game.themePreference === THEME_RANDOM ? pickRandomTheme() : game.themePreference;
        game.roundNumber         = 1;
        game.guesserHistory      = [];
        // usedWordIds / usedWords 跨局保留（同房間連玩不重複），題庫耗盡時才在 startNewGuesserRound 重置
        // 房主瀏覽器 localStorage 記錄的歷史題目 id，併入本房已用清單（跨房間不重複）
        if (Array.isArray(seenWordIds)) {
          for (const id of seenWordIds.slice(-MAX_SEEN_WORD_IDS)) {
            if (Number.isInteger(id) && id > 0 && !game.usedWordIds.includes(id)) game.usedWordIds.push(id);
          }
        }

        await startNewGuesserRound(ns, DB, _roomCache, roomId, game);
      } catch (err) {
        console.error('[CS cs:start]', err.message);
        socket.emit('cs:error', { code: 'START_FAILED', message: err.message });
      }
    });

    // ── 送出提示（提示者）────────────────────────────────
    socket.on('cs:submit-hint', async ({ roomId, text }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const game   = getGame(roomId);
        if (!game) return;
        const player = game.players.find(p => p.id === playerId);
        if (!player || player.role === 'guesser') return;

        const isRound2 = game.roundPhase === 'round2';
        const quota    = isRound2 ? ROUND2_QUOTA : player.quota;
        const stripped = (text || '').replace(/\s/g, '');

        const wordChars = game.currentWord ? new Set([...game.currentWord.word]) : null;
        const { valid, reason } = validateHint(stripped, quota, wordChars);
        if (!valid) { socket.emit('cs:error', { code: 'INVALID_HINT', message: reason }); return; }

        if (isRound2) game.round2Hints[playerId] = stripped;
        else          game.round1Hints[playerId]  = stripped;

        const hintRecord   = isRound2 ? game.round2Hints : game.round1Hints;
        const submittedIds = Object.keys(hintRecord);
        ns.to(roomId).emit('cs:hint-progress', { submittedIds });

        // 離線（含斷線房主殘影）的提示者不列入等待名單
        const providers = game.players.filter(p =>
          p.role !== 'guesser' && isOnline(_roomCache, roomId, p.id));
        if (providers.every(p => hintRecord[p.id])) {
          await processRoundHints(ns, roomId, game, isRound2, _roomCache);
        }
      } catch (err) {
        console.error('[CS cs:submit-hint]', err.message);
        socket.emit('cs:error', { code: 'HINT_FAILED', message: err.message });
      }
    });

    // ── 送出答案（猜題者）────────────────────────────────
    socket.on('cs:submit-guess', async ({ roomId, answer }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const game    = getGame(roomId);
        if (!game) return;
        const guesser = getCurrentGuesser(game);
        if (!guesser || guesser.id !== playerId) return;
        resolveGuess(ns, _roomCache, roomId, game, answer);
      } catch (err) {
        console.error('[CS cs:submit-guess]', err.message);
      }
    });

    // ── 下一位猜題者（房主）──────────────────────────────
    socket.on('cs:next-round', async ({ roomId }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const game = getGame(roomId);
        if (!game || !isHost(_roomCache, roomId, playerId)) return;
        if (game.roundPhase !== 'revealing') return;

        const prevGuesser = game.guesserLeft ? null : getCurrentGuesser(game);
        game.guesserLeft = false;
        if (prevGuesser) game.guesserHistory.push(prevGuesser.id);

        const nextIndex = findNextGuesserIndex(game, _roomCache, roomId);
        if (nextIndex === -1) {
          game.status = 'finished'; game.roundPhase = null;
          clearTimer(game);
          ns.to(roomId).emit('cs:finished', { players: buildPlayerList(game, _roomCache, roomId) });
        } else {
          game.currentGuesserIndex = nextIndex;
          game.roundNumber        += 1;
          await startNewGuesserRound(ns, DB, _roomCache, roomId, game);
        }
      } catch (err) { console.error('[CS cs:next-round]', err.message); }
    });

    // ── 繼續下一局（房主）────────────────────────────────
    socket.on('cs:continue', async ({ roomId }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const game = getGame(roomId);
        if (!game || !isHost(_roomCache, roomId, playerId)) return;

        game.status = 'playing';
        game.currentGuesserIndex = pickRandomConnectedGuesserIndex(game, _roomCache, roomId);
        game.themeId  = game.themePreference === THEME_RANDOM ? pickRandomTheme() : game.themePreference;
        game.roundNumber = 1; game.guesserHistory = [];
        game.symbolMap = {}; game.round1Hints = {}; game.round2Hints = {};
        game.roundPhase = null; game.cachedRound1Result = null; game.cachedRound2Result = null;

        await startNewGuesserRound(ns, DB, _roomCache, roomId, game);
      } catch (err) { console.error('[CS cs:continue]', err.message); }
    });

    // ── 結束遊戲（房主）──────────────────────────────────
    socket.on('cs:end-game', ({ roomId }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      const game = getGame(roomId);
      if (!game || !isHost(_roomCache, roomId, playerId)) return;
      clearTimer(game);
      game.status = 'finished'; game.roundPhase = null;
      ns.to(roomId).emit('cs:finished', { players: buildPlayerList(game, _roomCache, roomId) });
    });

    // ── 更改主題（房主）──────────────────────────────────
    socket.on('cs:set-theme', ({ roomId, themePreference }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      const game = getGame(roomId);
      if (!game || !isHost(_roomCache, roomId, playerId)) return;
      const pref = Number(themePreference);
      if (!Number.isInteger(pref) || (pref < 0 && pref !== THEME_RANDOM && pref !== THEME_ALL)) return;
      game.themePreference = pref;
      ns.to(roomId).emit('cs:theme-changed', { themePreference: pref });
    });

    // ── 丟火/丟雞蛋互動（任何玩家都可對其他人發動）────────
    socket.on('cs:react', ({ roomId, toPlayerId, emoji }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId || !toPlayerId || !emoji) return;
      if (playerId === toPlayerId) return; // 不能對自己
      // 只允許合法 emoji
      const ALLOWED = ['🔥', '🥚', '💯', '👏', '💀'];
      if (!ALLOWED.includes(emoji)) return;
      ns.to(roomId).emit('cs:react', { fromPlayerId: playerId, toPlayerId, emoji });
    });
  });

  console.log('[CS] /character-storm namespace registered (RoomModule enabled)');
  return { refreshThemes };
}

module.exports = { registerNamespace };
