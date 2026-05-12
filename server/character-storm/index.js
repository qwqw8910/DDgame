'use strict';

// ================================================================
//  默契傳聲筒 — Socket.io Namespace /character-storm
//  涵蓋：M1 房間建立/加入、M2 抽題、M3 第一輪倒數
//         M4 字元代換、M5 猜題/揭曉、M6 第二輪、M7 輪轉/結算
// ================================================================

const { processHints, validateHint } = require('./filterLogic');
const { assignRoles }                = require('./roleAssign');

// ── 第二輪固定字數 ──────────────────────────────────────────────
const ROUND2_QUOTA = 4;
const TIMER_SECONDS = 90;
// 可用主題包編號（0 = 原始題庫，1 = 綜合主題包，2 = 好友精選包，未來可擴充）
const AVAILABLE_THEMES = [0, 1, 2];

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

// ── in-memory 房間快取 ──────────────────────────────────────────
// cache[roomId] = RoomState（見下方 initRoom 的結構）
const cache = {};

function initRoom(roomId, hostId, maxPlayers) {
  cache[roomId] = {
    id:                  roomId,
    hostId,
    maxPlayers,
    status:              'waiting',   // waiting | playing | finished
    players:             [],          // [{ id, nickname, socketId, role, quota, connected }]
    currentGuesserIndex: 0,
    roundNumber:         0,
    guesserHistory:      [],          // 已猜過的 playerId（本局）
    currentWord:         null,        // { id, word, category }
    usedWordIds:         [],
    themePreference:     -1,           // -1=隨機, 0~6=指定主題包
    themeId:             null,         // 本局使用的主題包編號
    roundPhase:          null,        // round1 | round1-result | round2 | round2-result | revealing
    round1Hints:         {},          // { playerId: text }
    round2Hints:         {},
    symbolMap:           {},          // 跨輪共用
    timerRemaining:      TIMER_SECONDS,
    _timerHandle:        null,
  };
  return cache[roomId];
}

function getRoom(roomId) { return cache[roomId] || null; }

// ── Supabase DB 工具 ────────────────────────────────────────────
function makeDB(db) {
  return {
    async createRoom(roomId, hostId, maxPlayers) {
      const { error } = await db.from('rooms').insert({
        id:             roomId,
        host_player_id: hostId,
        max_players:    maxPlayers,
        status:         'waiting',
      });
      if (error) throw error;
    },

    async getRoom(roomId) {
      const { data, error } = await db.from('rooms').select('*').eq('id', roomId).maybeSingle();
      if (error) throw error;
      return data;
    },

    async upsertPlayer(roomId, playerId, nickname, joinOrder) {
      const { data, error } = await db.from('players').upsert({
        id:         playerId,
        room_id:    roomId,
        nickname,
        is_online:  true,
        is_ready:   false,
        join_order: joinOrder,
        score:      0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }).select().single();
      if (error) throw error;
      return data;
    },

    async updatePlayerOnline(playerId, isOnline) {
      await db.from('players')
        .update({ is_online: isOnline, updated_at: new Date().toISOString() })
        .eq('id', playerId);
    },

    async getPlayers(roomId) {
      const { data, error } = await db.from('players')
        .select('id, nickname, is_online, join_order')
        .eq('room_id', roomId)
        .order('join_order');
      if (error) throw error;
      return data ?? [];
    },

    async drawWord(usedIds = [], themeId = 0) {
      const usedFilter = `(${usedIds.length ? usedIds.join(',') : 0})`;

      async function drawWithoutThemeFilter() {
        const { count, error: countError } = await db.from('character_storm_words')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .not('id', 'in', usedFilter);

        if (countError) throw countError;
        if (!count) return null;

        const offset = Math.floor(Math.random() * count);
        const { data, error } = await db.from('character_storm_words')
          .select('id, word, category, author')
          .eq('is_active', true)
          .not('id', 'in', usedFilter)
          .range(offset, offset);

        if (error) throw error;
        return data?.[0] ?? null;
      }

      async function drawByTheme(id) {
        const { count, error: countError } = await db.from('character_storm_words')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('theme_id', id)
          .not('id', 'in', usedFilter);

        if (countError) throw countError;
        if (!count) return null;

        const offset = Math.floor(Math.random() * count);
        const { data, error } = await db.from('character_storm_words')
          .select('id, word, category, author')
          .eq('is_active', true)
          .eq('theme_id', id)
          .not('id', 'in', usedFilter)
          .range(offset, offset);

        if (error) throw error;
        return data?.[0] ?? null;
      }

      try {
        return await drawByTheme(themeId);
      } catch (error) {
        // 相容舊 schema：尚未執行 theme-migration.sql 時仍可正常抽題
        if (error?.code === '42703') {
          if (!hasLoggedThemeColumnMissing) {
            hasLoggedThemeColumnMissing = true;
            console.warn('[CS] theme_id 欄位不存在，已回退為舊題庫模式。請執行 theme-migration.sql');
          }
          return await drawWithoutThemeFilter();
        }
        throw error;
      }
    },
  };
}

// ── 輔助函式 ────────────────────────────────────────────────────

/** 清除倒數計時器 */
function clearTimer(room) {
  if (room._timerHandle) {
    clearInterval(room._timerHandle);
    room._timerHandle = null;
  }
}

/**
 * 啟動倒數，到期後自動觸發 onExpire
 * @param {object}   ns       - Socket.io namespace
 * @param {object}   room     - 房間 cache 物件
 * @param {Function} onExpire - 到期回調（async）
 */
function startTimer(ns, room, onExpire) {
  clearTimer(room);
  room.timerRemaining = TIMER_SECONDS;
  room._timerHandle = setInterval(async () => {
    room.timerRemaining -= 1;
    ns.to(room.id).emit('cs:timer-tick', { remaining: room.timerRemaining });
    if (room.timerRemaining <= 0) {
      clearTimer(room);
      await onExpire().catch(err => console.error('[CS timer]', err.message));
    }
  }, 1000);
}

/**
 * 建構對外廣播的玩家資訊（只含必要欄位）
 * role 和 quota 存在 cache.players，不在 DB
 */
function buildPlayerList(room) {
  return room.players.map(p => ({
    id:        p.id,
    nickname:  p.nickname,
    role:      p.role,
    quota:     p.quota,
    connected: p.connected,
  }));
}

/**
 * 取得所有有義務送出提示的提示者（排除猜題者、斷線者）
 */
function getActiveProviders(room) {
  return room.players.filter(p => p.role !== 'guesser' && p.connected);
}

/**
 * 取得本局猜題者（依 currentGuesserIndex）
 */
function getCurrentGuesser(room) {
  return room.players[room.currentGuesserIndex] ?? null;
}

// ── 核心遊戲邏輯 ─────────────────────────────────────────────────

/**
 * 處理本輪所有提示（第一輪或第二輪）並廣播結果
 * 倒數到期或全員送出時呼叫
 */
async function processRoundHints(ns, room, isRound2) {
  clearTimer(room);

  const hintRecord = isRound2 ? room.round2Hints : room.round1Hints;

  // 組合提示陣列（未送出的提示者視為空字串，不參與重複判定）
  const providers = room.players.filter(p => p.role !== 'guesser');
  const hints = providers
    .filter(p => hintRecord[p.id])           // 只取有實際送出提示的
    .map(p => ({ id: p.id, text: hintRecord[p.id] }));

  const inheritedMap = isRound2 ? room.symbolMap : {};
  const { forProvider, forGuesser, symbolMap } = processHints(hints, inheritedMap);

  // 永久更新 symbolMap（第二輪也沿用）
  room.symbolMap = symbolMap;
  room.roundPhase = isRound2 ? 'round2-result' : 'round1-result';

  // 快取計算結果，供斷線重連時補發
  const _wordLen = [...(room.currentWord?.word ?? '')].length;
  const _cache = {
    guesser:  { hints: forGuesser, symbolMap, isRound2, wordLength: _wordLen },
    provider: { hints: forGuesser, hintsProvider: forProvider, symbolMap, isRound2, wordLength: _wordLen },
  };
  if (isRound2) room.cachedRound2Result = _cache;
  else          room.cachedRound1Result = _cache;

  const eventName = isRound2 ? 'cs:round2-result' : 'cs:round1-result';

  // 各玩家收到不同內容
  for (const player of room.players) {
    const sock = ns.sockets.get(player.socketId);
    if (!sock) continue;

    const wordLength = _wordLen;
    if (player.role === 'guesser') {
      sock.emit(eventName, {
        hints:    forGuesser,
        symbolMap,
        isRound2,
        wordLength,
      });
    } else {
      // 提示者：自己的原文 + 衝突標記；其他人的符號代換版
      // 同一個廣播，但讓前端自己依 role 決定顯示方式
      sock.emit(eventName, {
        hints:         forGuesser,
        hintsProvider: forProvider,
        symbolMap,
        isRound2,
        wordLength,
      });
    }
  }
}

// ── namespace 建立（主入口）─────────────────────────────────────

function registerNamespace(io, db) {
  const DB = makeDB(db);
  const ns = io.of('/character-storm');

  ns.on('connection', (socket) => {
    console.log(`[CS] connect: ${socket.id}`);

    // ── 建立房間 ──────────────────────────────────────────────
    socket.on('cs:create', async ({ roomId, nickname, playerId, maxPlayers, themePreference }) => {
      if (!roomId || !nickname || !playerId) return;
      try {
        // 寫入 Supabase（service_role）
        await DB.createRoom(roomId, playerId, maxPlayers || 6);
        await DB.upsertPlayer(roomId, playerId, nickname, 0);

        // 初始化 cache
        const room = initRoom(roomId, playerId, maxPlayers || 6);
        const pref = (themePreference !== undefined && themePreference !== null) ? Number(themePreference) : -1;
        room.themePreference = Number.isInteger(pref) ? pref : -1;
        room.players.push({ id: playerId, nickname, socketId: socket.id, role: null, quota: null, connected: true });

        socket.data = { roomId, playerId };
        socket.join(roomId);

        socket.emit('cs:room-state', {
          room:    { id: roomId, hostId: playerId, status: 'waiting', maxPlayers: room.maxPlayers, themePreference: room.themePreference },
          players: buildPlayerList(room),
        });

        console.log(`[CS] create room ${roomId} by ${nickname} themePreference=${room.themePreference}`);
      } catch (err) {
        console.error('[CS cs:create]', err.message);
        // 房間已存在（duplicate key）→ 降級為 join
        if (err.message && err.message.includes('duplicate key')) {
          console.log(`[CS] room ${roomId} exists, fallback to join`);
          await handleJoin(socket, ns, DB, { roomId, nickname, playerId });
          return;
        }
        socket.emit('cs:error', { code: 'CREATE_FAILED', message: '建立房間失敗：' + err.message });
      }
    });

    // ── 加入房間 ──────────────────────────────────────────────
    socket.on('cs:join', async ({ roomId, nickname, playerId }) => {
      if (!roomId || !nickname || !playerId) return;
      await handleJoin(socket, ns, DB, { roomId, nickname, playerId });
    });

    // ── handleJoin 共用函式（對單一 socket 實例）────────────────────
    async function handleJoin(socket, ns, DB, { roomId, nickname, playerId }) {
      try {
        let room = getRoom(roomId);

        // cache miss → 從 DB 還原（server 重啟後重連）
        if (!room) {
          const dbRoom = await DB.getRoom(roomId);
          if (!dbRoom) {
            socket.emit('cs:error', { code: 'ROOM_NOT_FOUND', message: '找不到這個房間！' });
            return;
          }
          room = initRoom(roomId, dbRoom.host_player_id, dbRoom.max_players);
          room.status = dbRoom.status;

          // 從 DB 重建玩家列表
          const dbPlayers = await DB.getPlayers(roomId);
          room.players = dbPlayers.map(p => ({
            id: p.id, nickname: p.nickname,
            socketId: null, role: null, quota: null, connected: false,
          }));
        }

        // 先確認是否為現有玩家（重連判斷）
        const existing = room.players.find(p => p.id === playerId);

        // 非等待階段：只允許現有玩家重連，新玩家不可加入
        if (!['waiting'].includes(room.status) && !existing) {
          socket.emit('cs:error', { code: 'GAME_STARTED', message: '遊戲已開始，無法加入！' });
          return;
        }
        if (!existing && room.players.length >= room.maxPlayers) {
          socket.emit('cs:error', { code: 'ROOM_FULL', message: `房間已滿（最多 ${room.maxPlayers} 人）！` });
          return;
        }

        // 暱稱重複檢查（排除自己重連）
        const nickTaken = room.players.some(p => p.nickname === nickname && p.id !== playerId);
        if (nickTaken) {
          socket.emit('cs:error', { code: 'NICKNAME_TAKEN', message: '此暱稱已被使用，請換一個！' });
          return;
        }

        if (existing) {
          // 重連：更新 socket id
          existing.socketId  = socket.id;
          existing.connected = true;
          await DB.updatePlayerOnline(playerId, true);
        } else {
          // 新加入
          await DB.upsertPlayer(roomId, playerId, nickname, room.players.length);
          room.players.push({ id: playerId, nickname, socketId: socket.id, role: null, quota: null, connected: true });
        }

        socket.data = { roomId, playerId };
        socket.join(roomId);

        // 回傳完整狀態給加入者
        socket.emit('cs:room-state', {
          room:    { id: roomId, hostId: room.hostId, status: room.status, maxPlayers: room.maxPlayers },
          players: buildPlayerList(room),
        });

        // 遊戲中重連：補發遊戲狀態
        if (existing && !['waiting', 'finished'].includes(room.status)) {
          if (existing.role) {
            socket.emit('cs:role-assigned', { role: existing.role, quota: existing.quota });
          }
          // 補發題目（round1/round2 的提示者）
          if (['round1', 'round2'].includes(room.status) && existing.role !== 'guesser' && room.currentWord) {
            socket.emit('cs:word-revealed', { word: room.currentWord.word, category: room.currentWord.category, author: room.currentWord.author });
          }
          // 補發第一輪結果
          if (room.status === 'round1-result' && room.cachedRound1Result) {
            socket.emit('cs:round1-result', existing.role === 'guesser'
              ? room.cachedRound1Result.guesser
              : room.cachedRound1Result.provider);
          }
          // 補發第二輪結果（同時補第一輪資料讓畫面完整）
          if (room.status === 'round2-result') {
            if (room.cachedRound1Result) {
              socket.emit('cs:round1-result', existing.role === 'guesser'
                ? room.cachedRound1Result.guesser
                : room.cachedRound1Result.provider);
            }
            if (room.cachedRound2Result) {
              socket.emit('cs:round2-result', existing.role === 'guesser'
                ? room.cachedRound2Result.guesser
                : room.cachedRound2Result.provider);
            }
          }
        }

        // 廣播新玩家加入（不含加入者自己）
        if (!existing) {
          socket.to(roomId).emit('cs:player-joined', {
            player: { id: playerId, nickname, role: null, quota: null, connected: true },
          });
        } else {
          // 重連：告知其他人上線
          socket.to(roomId).emit('cs:player-joined', {
            player: { id: playerId, nickname, role: existing.role, quota: existing.quota, connected: true },
          });
        }

        console.log(`[CS] join room ${roomId}: ${nickname} (${existing ? 'reconnect' : 'new'})`);
      } catch (err) {
        console.error('[CS cs:join]', err.message);
        socket.emit('cs:error', { code: 'JOIN_FAILED', message: '加入房間失敗：' + err.message });
      }
    }

    // ── 開始遊戲（房主）──────────────────────────────────────
    socket.on('cs:start', async ({ roomId }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const room = getRoom(roomId);
        if (!room) return socket.emit('cs:error', { code: 'ROOM_NOT_FOUND', message: '房間不存在' });
        if (room.hostId !== playerId) return socket.emit('cs:error', { code: 'FORBIDDEN', message: '只有房主可以開始遊戲' });
        if (room.players.length < 2) return socket.emit('cs:error', { code: 'NOT_ENOUGH', message: '至少需要 2 位玩家才能開始！' });
        if (room.status !== 'waiting') return;

        room.status             = 'playing';
        room.currentGuesserIndex = pickRandomConnectedGuesserIndex(room);
        room.themeId            = room.themePreference === -1 ? pickRandomTheme() : room.themePreference;
        room.roundNumber        = 1;
        room.guesserHistory     = [];
        room.usedWordIds        = [];

        await startNewGuesserRound(ns, DB, room);
      } catch (err) {
        console.error('[CS cs:start]', err.message);
        socket.emit('cs:error', { code: 'START_FAILED', message: err.message });
      }
    });

    // ── 送出提示（提示者）────────────────────────────────────
    socket.on('cs:submit-hint', async ({ roomId, text }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const room   = getRoom(roomId);
        if (!room) return;
        const player = room.players.find(p => p.id === playerId);
        if (!player || player.role === 'guesser') return;

        const isRound2 = room.roundPhase === 'round2';
        const quota    = isRound2 ? ROUND2_QUOTA : player.quota;
        const stripped = (text || '').replace(/\s/g, '');

        // 後端再次驗證（含題目字檢查）
        const wordChars = room.currentWord ? new Set([...room.currentWord.word]) : null;
        const { valid, reason } = validateHint(stripped, quota, wordChars);
        if (!valid) {
          socket.emit('cs:error', { code: 'INVALID_HINT', message: reason });
          return;
        }

        if (isRound2) room.round2Hints[playerId] = stripped;
        else           room.round1Hints[playerId] = stripped;

        // 廣播進度（只含 id，不含內容）
        const hintRecord  = isRound2 ? room.round2Hints : room.round1Hints;
        const submittedIds = Object.keys(hintRecord);
        ns.to(roomId).emit('cs:hint-progress', { submittedIds });

        // 全員送出 → 提前結束倒數，直接處理
        const providers = room.players.filter(p => p.role !== 'guesser');
        if (providers.every(p => hintRecord[p.id])) {
          await processRoundHints(ns, room, isRound2);
        }
      } catch (err) {
        console.error('[CS cs:submit-hint]', err.message);
        socket.emit('cs:error', { code: 'HINT_FAILED', message: err.message });
      }
    });

    // ── 送出答案（猜題者）────────────────────────────────────
    socket.on('cs:submit-guess', async ({ roomId, answer }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;   // 允許空白答案
      try {
        const room   = getRoom(roomId);
        if (!room) return;
        const guesser = getCurrentGuesser(room);
        if (!guesser || guesser.id !== playerId) return;

        const isRound2 = room.roundPhase === 'round2-result';
        const trimmed  = (answer ?? '').trim();
        const correct  = trimmed === room.currentWord?.word;
        const ab       = calculateAB(room.currentWord?.word ?? '', trimmed);

        room.roundPhase = 'revealing';
        clearTimer(room);

        const shouldRevealWord = correct || isRound2;

        // 廣播揭曉結果（含 A/B 判定）
        ns.to(roomId).emit('cs:guess-result', {
          correct,
          answer:    trimmed,
          word:      shouldRevealWord ? room.currentWord?.word : null,
          author:    shouldRevealWord ? room.currentWord?.author : null,
          wasRound2: isRound2,
          a:         ab.a,
          b:         ab.b,
        });

        if (!correct && !isRound2) {
          // 第一輪答錯 → 2 秒後進入第二輪
          setTimeout(() => startRound2(ns, DB, room), 2000);
        } else {
          // 答對 or 第二輪結束 → 等房主按「下一位」
          room.roundPhase = 'revealing';
        }
      } catch (err) {
        console.error('[CS cs:submit-guess]', err.message);
      }
    });

    // ── 下一位猜題者（房主）──────────────────────────────────
    socket.on('cs:next-round', async ({ roomId }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const room = getRoom(roomId);
        if (!room || room.hostId !== playerId) return;
        if (room.roundPhase !== 'revealing') return;

        // 記錄已猜過的人
        const prevGuesser = getCurrentGuesser(room);
        if (prevGuesser) room.guesserHistory.push(prevGuesser.id);

        // 找下一位未猜過的人
        const nextIndex = findNextGuesserIndex(room);

        if (nextIndex === -1) {
          // 全員輪完 → 一局結束
          room.status     = 'finished';
          room.roundPhase = null;
          clearTimer(room);
          ns.to(roomId).emit('cs:finished', { players: buildPlayerList(room) });
        } else {
          room.currentGuesserIndex = nextIndex;
          room.roundNumber        += 1;
          await startNewGuesserRound(ns, DB, room);
        }
      } catch (err) {
        console.error('[CS cs:next-round]', err.message);
      }
    });

    // ── 繼續下一局（房主）──────────────────────────────────
    socket.on('cs:continue', async ({ roomId }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      try {
        const room = getRoom(roomId);
        if (!room || room.hostId !== playerId) return;

        // 重置局狀態
        room.status             = 'playing';
        room.currentGuesserIndex = pickRandomConnectedGuesserIndex(room);
        room.themeId            = room.themePreference === -1 ? pickRandomTheme() : room.themePreference;
        room.roundNumber         = 1;
        room.guesserHistory      = [];
        room.usedWordIds         = [];  // 此局題庫重置
        room.symbolMap           = {};
        room.round1Hints         = {};
        room.round2Hints         = {};
        room.roundPhase          = null;

        await startNewGuesserRound(ns, DB, room);
      } catch (err) {
        console.error('[CS cs:continue]', err.message);
      }
    });

    // ── 結束遊戲（房主）──────────────────────────────────────
    socket.on('cs:end-game', ({ roomId }) => {
      const { playerId } = socket.data ?? {};
      if (!roomId || !playerId) return;
      const room = getRoom(roomId);
      if (!room || room.hostId !== playerId) return;
      clearTimer(room);
      room.status     = 'finished';
      room.roundPhase = null;
      ns.to(roomId).emit('cs:finished', { players: buildPlayerList(room) });
    });

    // ── 斷線處理 ──────────────────────────────────────────────
    socket.on('disconnect', async () => {
      const { roomId, playerId } = socket.data ?? {};
      console.log(`[CS] disconnect: ${socket.id} playerId=${playerId}`);
      if (!playerId) return;

      try {
        await DB.updatePlayerOnline(playerId, false);
        if (!roomId) return;

        const room = getRoom(roomId);
        if (!room) return;

        const player = room.players.find(p => p.id === playerId);
        if (player) { player.connected = false; player.socketId = null; }

        ns.to(roomId).emit('cs:player-left', { playerId });

        // 房主斷線 → 轉移房主
        if (room.hostId === playerId) {
          const next = room.players.find(p => p.connected && p.id !== playerId);
          if (next) {
            room.hostId = next.id;
            ns.to(roomId).emit('cs:room-updated', {
              id: room.id, hostId: room.hostId, status: room.status, maxPlayers: room.maxPlayers,
            });
          }
        }

        // 提示輸入中且斷線 → 檢查是否全員已送出
        if (['round1', 'round2'].includes(room.roundPhase)) {
          const isRound2  = room.roundPhase === 'round2';
          const hintRecord = isRound2 ? room.round2Hints : room.round1Hints;
          const providers  = room.players.filter(p => p.role !== 'guesser' && p.connected);
          if (providers.length > 0 && providers.every(p => hintRecord[p.id])) {
            await processRoundHints(ns, room, isRound2);
          }
        }
      } catch (err) {
        console.error('[CS disconnect]', err.message);
      }
    });
  });

  console.log('[CS] /character-storm namespace registered');
}

// ── 內部遊戲流程函式 ────────────────────────────────────────────

/**
 * 開始本局新一輪（新猜題者）
 * 分配角色 → 抽題 → 啟動倒數
 */
async function startNewGuesserRound(ns, DB, room) {
  // 重置本輪狀態
  room.round1Hints = {};
  room.round2Hints = {};
  room.symbolMap   = {};
  room.roundPhase  = 'round1';

  // 分配角色
  const assignments = assignRoles(room.players, room.currentGuesserIndex);
  for (const { id, role, quota } of assignments) {
    const p = room.players.find(p => p.id === id);
    if (p) { p.role = role; p.quota = quota; }
  }

  // 廣播角色分配 + 輪次開始
  ns.to(room.id).emit('cs:round1-start', {
    roundNumber:         room.roundNumber,
    currentGuesserIndex: room.currentGuesserIndex,
    players:             buildPlayerList(room),
  });

  // 各玩家收到個人角色通知
  for (const player of room.players) {
    const sock = ns.sockets.get(player.socketId);
    if (!sock) continue;
    sock.emit('cs:role-assigned', { role: player.role, quota: player.quota });
  }

  // 抽題（題目只推給提示者）
  let word = await DB.drawWord(room.usedWordIds, room.themeId ?? 0).catch(() => null);

  if (!word) {
    clearTimer(room);
    room.status = 'finished';
    room.roundPhase = null;
    ns.to(room.id).emit('cs:error', { code: 'NO_WORD_LEFT', message: '本局題庫已用完，為避免重複題目，已直接結束本局。' });
    ns.to(room.id).emit('cs:finished', { players: buildPlayerList(room) });
    return;
  }

  room.currentWord = word;
  room.usedWordIds.push(word.id);

  // 推送題目（僅提示者）
  for (const player of room.players.filter(p => p.role !== 'guesser')) {
    const sock = ns.sockets.get(player.socketId);
    sock?.emit('cs:word-revealed', { word: word.word, category: word.category, author: word.author ?? null });
  }

  // 啟動倒數
  startTimer(ns, room, async () => {
    // 倒數到期 → 強制處理（未送出的視為空，不參與判定）
    await processRoundHints(ns, room, false);
  });
}

/**
 * 啟動第二輪
 * 重置提示 + 啟動倒數
 */
async function startRound2(ns, DB, room) {
  room.round2Hints = {};
  room.roundPhase  = 'round2';

  // 全員固定 4 字
  for (const p of room.players) {
    if (p.role !== 'guesser') p.quota = ROUND2_QUOTA;
  }

  ns.to(room.id).emit('cs:round2-start', {
    players: buildPlayerList(room),
  });

  // 各自角色仍相同，quota 改為 4
  for (const player of room.players) {
    const sock = ns.sockets.get(player.socketId);
    if (!sock) continue;
    sock.emit('cs:role-assigned', { role: player.role, quota: player.quota });
  }

  // 第二輪也看得到題目（提示者）
  for (const player of room.players.filter(p => p.role !== 'guesser')) {
    const sock = ns.sockets.get(player.socketId);
    sock?.emit('cs:word-revealed', { word: room.currentWord?.word, category: room.currentWord?.category, author: room.currentWord?.author });
  }

  startTimer(ns, room, async () => {
    await processRoundHints(ns, room, true);
  });
}

/**
 * 找下一個尚未當過猜題者的玩家 index
 * @returns {number} index 或 -1（全員輪完）
 */
function findNextGuesserIndex(room) {
  const total = room.players.length;
  for (let i = 1; i <= total; i++) {
    const idx    = (room.currentGuesserIndex + i) % total;
    const player = room.players[idx];
    if (!player?.connected) continue;
    if (!room.guesserHistory.includes(player.id)) return idx;
  }
  return -1; // 全員都猜過
}

function pickRandomConnectedGuesserIndex(room) {
  const candidates = room.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player?.connected);

  if (!candidates.length) return 0;
  const randomPick = candidates[Math.floor(Math.random() * candidates.length)];
  return randomPick.index;
}

module.exports = { registerNamespace };
