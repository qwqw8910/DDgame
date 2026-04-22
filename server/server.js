// ================================================================
//  懂我再說 — Socket.io 遊戲後端伺服器
//  架構：Express + Socket.io + Supabase (service_role)
// ================================================================

'use strict';

require('dotenv').config();

const express   = require('express');
const http      = require('http');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');

// ── 環境變數檢查 ──────────────────────────────────────────────
const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  CORS_ORIGIN = 'http://localhost:5500',
  PORT        = 3000,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('[ERROR] 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY，請設定 .env');
  process.exit(1);
}

// ── Supabase 客戶端（service_role，繞過 RLS）─────────────────
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── Express + Socket.io 初始化 ────────────────────────────────
const app    = express();
const server = http.createServer(app);

const allowedOrigins = CORS_ORIGIN.split(',').map(o => o.trim());

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      // 允許無 origin（curl、Postman）與設定中的來源
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    methods: ['GET', 'POST'],
  },
  // 連線 30 秒沒有 ping 就標記為斷線
  pingTimeout:  30000,
  pingInterval: 10000,
});

app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── 記憶體快取（加速讀取，DB 為最終資料來源）────────────────
// roomCache[roomId] = { room, players, currentRound, guesses, topicsLoaded }
const roomCache = {};

// ================================================================
//  DB 工具函式（伺服器端，使用 service_role）
// ================================================================

const DB = {

  async getRoom(roomId) {
    const { data, error } = await db.from('rooms').select('*').eq('id', roomId).single();
    if (error) throw error;
    return data;
  },

  async updateRoom(roomId, updates) {
    const { data, error } = await db.from('rooms')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', roomId).select().single();
    if (error) throw error;
    return data;
  },

  async getPlayers(roomId) {
    const { data, error } = await db.from('players')
      .select('*').eq('room_id', roomId).order('join_order');
    if (error) throw error;
    return data ?? [];
  },

  async updatePlayer(playerId, updates) {
    const { data, error } = await db.from('players')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', playerId).select().single();
    if (error) throw error;
    return data;
  },

  async removePlayer(playerId) {
    // guesses 沒有 ON DELETE CASCADE，需先手動刪除
    await db.from('guesses').delete().eq('player_id', playerId);
    const { error } = await db.from('players').delete().eq('id', playerId);
    if (error) throw error;
  },

  async createRound(roomId, roundNumber, subjectPlayerId) {
    const { data, error } = await db.from('rounds')
      .insert({ room_id: roomId, round_number: roundNumber,
                subject_player_id: subjectPlayerId, status: 'selecting_topic' })
      .select().single();
    if (error) throw error;
    return data;
  },

  async updateRound(roundId, updates) {
    const { data, error } = await db.from('rounds')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', roundId).select().single();
    if (error) throw error;
    return data;
  },

  async getUsedQuestionIds(roomId) {
    const { data, error } = await db.from('rounds')
      .select('question_id').eq('room_id', roomId).not('question_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map(r => r.question_id);
  },

  async getRandomQuestion(topicId, usedIds = []) {
    let countQ = db.from('questions').select('id', { count: 'exact', head: true }).eq('topic_id', topicId);
    if (usedIds.length) countQ = countQ.not('id', 'in', `(${usedIds.join(',')})`);
    const { count, error: cErr } = await countQ;
    if (cErr) throw cErr;
    if (!count) return null;

    const offset = Math.floor(Math.random() * count);
    let q = db.from('questions').select('*').eq('topic_id', topicId);
    if (usedIds.length) q = q.not('id', 'in', `(${usedIds.join(',')})`);
    const { data, error } = await q.range(offset, offset);
    if (error) throw error;
    return data?.[0] ?? null;
  },

  async getQuestionById(questionId) {
    const { data, error } = await db.from('questions').select('*').eq('id', questionId).maybeSingle();
    if (error) throw error;
    return data;
  },

  async getTopics() {
    const { data, error } = await db.from('topics').select('*').order('id');
    if (error) throw error;
    return data ?? [];
  },

  async submitGuess(roundId, playerId, guess) {
    const { data, error } = await db.from('guesses')
      .upsert({ round_id: roundId, player_id: playerId, guess },
               { onConflict: 'round_id,player_id' })
      .select().single();
    if (error) throw error;
    return data;
  },

  async getGuesses(roundId) {
    const { data, error } = await db.from('guesses').select('*').eq('round_id', roundId);
    if (error) throw error;
    return data ?? [];
  },

  async markGuessesCorrect(roundId, correctAnswer, guesses) {
    if (!guesses) guesses = await this.getGuesses(roundId);
    if (!guesses.length) return guesses;

    const correctIds   = guesses.filter(g => g.guess === correctAnswer).map(g => g.id);
    const incorrectIds = guesses.filter(g => g.guess !== correctAnswer).map(g => g.id);
    const ops = [];
    if (correctIds.length)   ops.push(db.from('guesses').update({ is_correct: true  }).in('id', correctIds));
    if (incorrectIds.length) ops.push(db.from('guesses').update({ is_correct: false }).in('id', incorrectIds));
    const results = await Promise.all(ops);
    const failed  = results.find(r => r.error);
    if (failed?.error) throw failed.error;
    return guesses.map(g => ({ ...g, is_correct: g.guess === correctAnswer }));
  },

  async applyRoundScores(roundId, correctAnswer, guesses, subjectPlayerId, eligibleGuessers) {
    if (!guesses) guesses = await this.getGuesses(roundId);
    const now = new Date().toISOString();
    const ops = [];

    // Correct guessers get +1
    const winners = guesses.filter(g => g.guess === correctAnswer);
    const losers  = guesses.filter(g => g.guess !== correctAnswer);

    if (winners.length) {
      const { data: winPlayers } = await db.from('players').select('id,score').in('id', winners.map(g => g.player_id));
      if (winPlayers) {
        ops.push(...winPlayers.map(p =>
          db.from('players').update({ score: (p.score ?? 0) + 1, updated_at: now }).eq('id', p.id)
        ));
      }
    }

    // All correct → subject +1; All wrong → subject -1
    const totalEligible = eligibleGuessers ? eligibleGuessers.length : guesses.length;
    if (subjectPlayerId && totalEligible > 0) {
      const { data: subj } = await db.from('players').select('id,score').eq('id', subjectPlayerId).single();
      if (subj) {
        let subjectDelta = 0;
        if (winners.length === totalEligible) subjectDelta = 1;   // 全對
        else if (losers.length === totalEligible) subjectDelta = -1; // 全錯
        if (subjectDelta !== 0) {
          ops.push(db.from('players').update({ score: Math.max(0, (subj.score ?? 0) + subjectDelta), updated_at: now }).eq('id', subj.id));
        }
      }
    }

    if (ops.length) await Promise.all(ops);
  },
};

// ================================================================
//  快取工具
// ================================================================

/** 取得或初始化房間快取 */
function getCache(roomId) {
  if (!roomCache[roomId]) {
    roomCache[roomId] = { room: null, players: [], currentRound: null, guesses: [], round_pool: [] };
  }
  return roomCache[roomId];
}

/** 計算本回合有資格猜測的玩家（非被猜者、回合開始前已在房間） */
function getEligibleGuessers(players, round) {
  if (!round) return [];
  const roundStart = round.created_at ? new Date(round.created_at).getTime() : null;
  return players.filter(p => {
    if (p.id === round.subject_player_id) return false;
    if (!roundStart || !p.created_at) return true;
    return new Date(p.created_at).getTime() <= roundStart;
  });
}

/**
 * 建構要廣播的回合物件。
 * subject_answer 在 revealing 前一律遮蔽（改為 null）。
 */
function buildRoundPayload(round, forReveal = false) {
  if (!round) return null;
  return {
    ...round,
    subject_answer: forReveal ? round.subject_answer : null,
  };
}

/**
 * 將 topic_name 注入 round 物件（不修改原始 DB 資料）。
 * 用於所有 cache.currentRound 寫入點，確保前端能顯示主題名稱。
 */
function enrichRoundWithTopic(round, topics = []) {
  if (!round || !round.topic_id) return round;
  const topic = topics.find(t => t.id === round.topic_id);
  return topic ? { ...round, topic_name: topic.name } : round;
}

// ================================================================
//  Socket.io 事件處理
// ================================================================

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── 加入房間 ────────────────────────────────────────────────
  /**
   * 事件：join_room
   * 資料：{ roomId, playerId, nickname }
   * 回應：room_state（給自己）、players_updated（廣播給房間）
   *       join_error（加入失敗時只給自己）
   */
  socket.on('join_room', async ({ roomId, playerId, nickname }) => {
    if (!roomId || !playerId) return;
    console.log(`[join_room] roomId=${roomId} playerId=${playerId} nickname=${nickname}`);

    socket.data.roomId   = roomId;
    socket.data.playerId = playerId;

    try {
      const cache = getCache(roomId);

      // ── 1. 載入房間 ────────────────────────────────────────
      let room;
      try {
        room = await DB.getRoom(roomId);
      } catch {
        socket.emit('join_error', { message: '找不到房間，可能已關閉或不存在' });
        return;
      }
      cache.room = room;

      // ── 2. 載入現有玩家 ────────────────────────────────────
      let players = await DB.getPlayers(roomId);
      cache.players = players;

      // ── 3. 判斷是重連還是新加入 ────────────────────────────
      const existingInRoom = players.find(p => p.id === playerId);

      if (existingInRoom) {
        // 重連：更新上線狀態（保留分數與暱稱）
        const { data: updated } = await db.from('players')
          .update({
            is_online:  true,
            nickname:   nickname || existingInRoom.nickname,
            updated_at: new Date().toISOString(),
          })
          .eq('id', playerId).select().single();
        const idx = cache.players.findIndex(p => p.id === playerId);
        if (idx >= 0 && updated) cache.players[idx] = updated;

      } else if (nickname) {
        // 新加入：驗證房間狀態
        if (!['waiting', 'playing'].includes(room.status)) {
          socket.emit('join_error', { message: '此房間目前不可加入！' });
          return;
        }
        if (players.length >= room.max_players) {
          socket.emit('join_error', { message: `房間已滿（最多 ${room.max_players} 人）` });
          return;
        }
        if (players.some(p => p.nickname === nickname)) {
          socket.emit('join_error', { message: '此暱稱已被使用，請換一個！' });
          return;
        }

        // upsert：全新玩家 → INSERT；已存在其他房間 → UPDATE 移轉
        const { data: upserted, error: upsertErr } = await db.from('players')
          .upsert({
            id:         playerId,
            room_id:    roomId,
            nickname,
            is_ready:   false,
            is_online:  true,
            join_order: players.length,
            score:      0,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' })
          .select().single();
        if (upsertErr) throw upsertErr;
        cache.players.push(upserted);

        // 重新排序確保 join_order 正確
        players = await DB.getPlayers(roomId);
        cache.players = players;
      }
      // nickname 為空且不在房間 → 靜默忽略（不可能正常發生）

      socket.join(roomId);

      // ── 4. 載入回合狀態 ────────────────────────────────────
      let currentRound    = null;
      let currentQuestion = null;
      let guesses         = [];

      if (room.current_round_id) {
        const { data: rd } = await db.from('rounds')
          .select('*').eq('id', room.current_round_id).single();
        if (rd) {
          currentRound       = rd;
          cache.currentRound = rd;
          if (['guessing', 'revealing'].includes(rd.status)) {
            guesses           = await DB.getGuesses(rd.id);
            cache.guesses     = guesses;
          }
          if (rd.question_id) {
            currentQuestion = await DB.getQuestionById(rd.question_id);
          }
        }
      }

      // ── 5. 載入主題（快取，只取一次）────────────────────────
      if (!cache.topics) {
        cache.topics = await DB.getTopics();
      }

      // 補注 topic_name（DB 裡沒有此欄位，需在 cache 層補）
      if (currentRound) {
        currentRound       = enrichRoundWithTopic(currentRound, cache.topics);
        cache.currentRound = currentRound;
      }

      // ── 6. 回傳完整房間狀態給剛加入的玩家 ─────────────────
      const isRevealing = currentRound?.status === 'revealing';
      const isPreviewingQuestion = currentRound?.status === 'previewing_question';
      // 在 previewing_question 階段，不在 room_state 裡暴露題目（由 preview_question 事件單獨傳給被猜者）
      const questionForState = (isPreviewingQuestion || !currentQuestion)
        ? null
        : { id: currentQuestion.id, a: currentQuestion.option_a, b: currentQuestion.option_b };

      socket.emit('room_state', {
        room,
        players:         cache.players,
        topics:          cache.topics,
        currentRound:    buildRoundPayload(currentRound, isRevealing),
        currentQuestion: questionForState,
        // 揭曉前只傳自己看得見的資訊（player_id + guess），揭曉後傳完整資料
        guesses: isRevealing
          ? guesses
          : guesses.map(g => ({ id: g.id, round_id: g.round_id, player_id: g.player_id, guess: g.guess })),
        myPlayerId: playerId,
      });

      // 重連時，若在 previewing_question 階段且是被猜者，重新傳送 preview_question
      if (isPreviewingQuestion && playerId === currentRound.subject_player_id && currentQuestion) {
        const swapCount = cache.currentRound?.swap_count ?? 0;
        socket.emit('preview_question', {
          question: { id: currentQuestion.id, a: currentQuestion.option_a, b: currentQuestion.option_b },
          swapCount,
          swapLimit: 3,
        });
      }

      // ── 7. 廣播玩家列表更新給房間所有人 ─────────────────────
      io.to(roomId).emit('players_updated', { players: cache.players });

    } catch (err) {
      console.error('[join_room]', err.message);
      socket.emit('join_error', { message: err.message });
    }
  });

  // ── 切換準備狀態 ─────────────────────────────────────────────
  /**
   * 事件：toggle_ready
   */
  socket.on('toggle_ready', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const cache  = getCache(roomId);
      const me     = cache.players.find(p => p.id === playerId);
      if (!me) return;
      const updated = await DB.updatePlayer(playerId, { is_ready: !me.is_ready });
      const idx = cache.players.findIndex(p => p.id === playerId);
      if (idx >= 0) cache.players[idx] = updated;
      io.to(roomId).emit('players_updated', { players: cache.players });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 開始遊戲（房主）──────────────────────────────────────────
  /**
   * 事件：start_game
   */
  socket.on('start_game', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const cache = getCache(roomId);
      if (cache.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以開始遊戲' });
      }
      if (cache.players.length < 2) {
        return socket.emit('error', { message: '至少需要 2 位玩家才能開始！' });
      }

      // Shuffle all players, pick first as subject
      const shuffled = [...cache.players].sort(() => Math.random() - 0.5);
      cache.round_pool = shuffled.slice(1).map(p => p.id);
      const firstSubject = shuffled[0];
      const round = await DB.createRound(roomId, 1, firstSubject.id);
      const room  = await DB.updateRoom(roomId, { status: 'playing', current_round_id: round.id });

      cache.room         = room;
      cache.currentRound = round;
      cache.guesses      = [];

      io.to(roomId).emit('game_started', {
        room,
        currentRound: buildRoundPayload(round),
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 選主題（被猜者）─────────────────────────────────────────
  /**
   * 事件：select_topic
   * 資料：{ topicId }
   */
  socket.on('select_topic', async ({ topicId }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId || !topicId) return;
    try {
      const cache = getCache(roomId);
      const round = cache.currentRound;

      if (!round || round.subject_player_id !== playerId) {
        return socket.emit('error', { message: '只有被猜者可以選主題' });
      }
      if (round.status !== 'selecting_topic') {
        return socket.emit('error', { message: '目前不是選主題階段' });
      }

      const usedIds = await DB.getUsedQuestionIds(roomId);
      const q       = await DB.getRandomQuestion(topicId, usedIds);
      if (!q) {
        return socket.emit('error', { message: '此主題題目已全部用完，請選其他主題！' });
      }

      const updatedRound = await DB.updateRound(round.id, {
        question_id: q.id,
        topic_id:    topicId,
        status:      'previewing_question',
      });
      cache.currentRound = enrichRoundWithTopic({ ...updatedRound, swap_count: 0 }, cache.topics);
      cache._previewUsedIds = [...usedIds, q.id];
      cache._previewTopicId = topicId;

      const question = { id: q.id, a: q.option_a, b: q.option_b };

      // Broadcast status change to all (but NOT the question)
      io.to(roomId).emit('round_updated', {
        currentRound:    buildRoundPayload(cache.currentRound),
        currentQuestion: null,
      });

      // Only send question to subject player
      socket.emit('preview_question', {
        question,
        swapCount: 0,
        swapLimit: 3,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 提交答案（被猜者，私下）─────────────────────────────────
  /**
   * 事件：submit_answer
   * 資料：{ answer }  ('A' | 'B')
   */
  socket.on('submit_answer', async ({ answer }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    if (!['A', 'B'].includes(answer)) return;
    try {
      const cache = getCache(roomId);
      const round = cache.currentRound;

      if (!round || round.subject_player_id !== playerId) {
        return socket.emit('error', { message: '只有被猜者可以提交答案' });
      }
      if (round.status !== 'selecting_answer') {
        return socket.emit('error', { message: '目前不是選答案階段' });
      }

      const updatedRound = await DB.updateRound(round.id, {
        subject_answer: answer,
        status:         'guessing',
      });
      cache.currentRound = enrichRoundWithTopic(updatedRound, cache.topics);
      cache.guesses      = [];

      // ⚠️ 廣播時不含 subject_answer（伺服器保護）
      io.to(roomId).emit('round_updated', {
        currentRound: buildRoundPayload(cache.currentRound, false), // answer 遮蔽
      });

      // 只告訴被猜者本人答案已收到
      socket.emit('answer_accepted', { answer });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 提交猜測（其他玩家）─────────────────────────────────────
  /**
   * 事件：submit_guess
   * 資料：{ guess }  ('A' | 'B')
   */
  socket.on('submit_guess', async ({ guess }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    if (!['A', 'B'].includes(guess)) return;
    try {
      const cache = getCache(roomId);
      const round = cache.currentRound;

      if (!round || round.status !== 'guessing') {
        return socket.emit('error', { message: '目前不是猜測階段' });
      }
      if (round.subject_player_id === playerId) {
        return socket.emit('error', { message: '被猜者不能猜測' });
      }

      await DB.submitGuess(round.id, playerId, guess);

      // 更新快取中的 guesses
      const existing = cache.guesses.findIndex(g => g.player_id === playerId);
      const newGuess = { round_id: round.id, player_id: playerId, guess };
      if (existing >= 0) cache.guesses[existing] = { ...cache.guesses[existing], ...newGuess };
      else cache.guesses.push(newGuess);

      // 計算進度
      const eligible  = getEligibleGuessers(cache.players, round);
      const submitted = new Set(cache.guesses.map(g => g.player_id)).size;
      const total     = eligible.length;

      // 廣播進度給所有人
      const submittedIds = cache.guesses.map(g => g.player_id);
      io.to(roomId).emit('guess_progress', { submitted, total, submittedIds });

      // 全員提交 → 自動揭曉
      if (submitted >= total && total > 0) {
        setTimeout(() => revealRound(roomId, socket), 800);
      }
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 下一回合（房主）─────────────────────────────────────────
  /**
   * 事件：next_round
   */
  socket.on('next_round', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const cache = getCache(roomId);
      if (cache.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以進行下一回合' });
      }

      const round   = cache.currentRound;
      await DB.updateRound(round.id, { status: 'finished' });

      // 從 pool 隨機選下一位被猜者，pool 空了就重新洗牌（排除此輪 subject）
      let pool = cache.round_pool || [];
      if (!pool.length) {
        pool = cache.players
          .filter(p => p.id !== round.subject_player_id)
          .sort(() => Math.random() - 0.5)
          .map(p => p.id);
        if (!pool.length) pool = cache.players.map(p => p.id).sort(() => Math.random() - 0.5);
      }
      const nextSubjectId = pool[0];
      cache.round_pool = pool.slice(1);
      const newRound  = await DB.createRound(roomId, round.round_number + 1, nextSubjectId);
      const room = await DB.updateRoom(roomId, { current_round_id: newRound.id });

      cache.room         = room;
      cache.currentRound = newRound;
      cache.guesses      = [];

      io.to(roomId).emit('round_updated', {
        currentRound:    buildRoundPayload(newRound),
        currentQuestion: null,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 結束遊戲（房主）─────────────────────────────────────────
  /**
   * 事件：end_game
   */
  socket.on('end_game', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const cache = getCache(roomId);
      if (cache.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以結束遊戲' });
      }
      if (cache.currentRound) {
        await DB.updateRound(cache.currentRound.id, { status: 'finished' });
      }
      const room = await DB.updateRoom(roomId, { status: 'finished' });
      cache.room = room;

      // 取最新分數
      const players = await DB.getPlayers(roomId);
      cache.players = players;

      io.to(roomId).emit('game_finished', { room, players });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 重新開始（房主）─────────────────────────────────────────
  /**
   * 事件：restart_game
   */
  socket.on('restart_game', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const cache = getCache(roomId);
      if (cache.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以重新開始' });
      }
      await Promise.all(cache.players.map(p =>
        DB.updatePlayer(p.id, { is_ready: false, score: 0 })
      ));
      const room    = await DB.updateRoom(roomId, { status: 'waiting', current_round_id: null });
      const players = await DB.getPlayers(roomId);
      cache.room         = room;
      cache.players      = players;
      cache.currentRound = null;
      cache.guesses      = [];

      io.to(roomId).emit('game_restarted', { room, players });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 踢出玩家（房主）─────────────────────────────────────────
  /**
   * 事件：kick_player
   * 資料：{ targetPlayerId }
   */
  socket.on('kick_player', async ({ targetPlayerId }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId || !targetPlayerId) return;
    try {
      const cache = getCache(roomId);
      if (cache.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以踢人' });
      }
      await DB.removePlayer(targetPlayerId);
      cache.players = cache.players.filter(p => p.id !== targetPlayerId);

      // 通知被踢玩家（透過 playerId 找到對應 socket）
      for (const [sid, s] of io.of('/').sockets) {
        if (s.data.playerId === targetPlayerId && s.data.roomId === roomId) {
          s.emit('you_were_kicked');
          s.leave(roomId);
        }
      }
      io.to(roomId).emit('players_updated', { players: cache.players });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 更新上線狀態 ─────────────────────────────────────────────
  /**
   * 事件：set_online
   * 資料：{ isOnline }
   */
  socket.on('set_online', async ({ isOnline }) => {
    const { roomId, playerId } = socket.data;
    if (!playerId) return;
    try {
      await DB.updatePlayer(playerId, { is_online: isOnline });
      // 同步更新 cache，確保 getEligibleGuessers 使用最新上線狀態
      if (roomId) {
        const cache = getCache(roomId);
        const idx = cache.players.findIndex(p => p.id === playerId);
        if (idx >= 0) cache.players[idx] = { ...cache.players[idx], is_online: isOnline };
      }
    } catch {}
  });

  // ── 換題（被猜者，最多2次）──────────────────────────────────
  socket.on('swap_question', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const cache = getCache(roomId);
      const round = cache.currentRound;
      if (!round || round.subject_player_id !== playerId) return;
      if (round.status !== 'previewing_question') return;
      if ((round.swap_count ?? 0) >= 3) {
        return socket.emit('error', { message: '換題次數已用完' });
      }

      const topicId = cache._previewTopicId || round.topic_id;
      const usedIds = cache._previewUsedIds || [];
      const q = await DB.getRandomQuestion(topicId, usedIds);
      if (!q) {
        return socket.emit('error', { message: '此主題已無更多題目可換' });
      }

      const newSwapCount = (round.swap_count ?? 0) + 1;
      const updatedRound = await DB.updateRound(round.id, { question_id: q.id });
      cache.currentRound = enrichRoundWithTopic({ ...updatedRound, swap_count: newSwapCount }, cache.topics);
      cache._previewUsedIds = [...usedIds, q.id];

      socket.emit('preview_question', {
        question: { id: q.id, a: q.option_a, b: q.option_b },
        swapCount: newSwapCount,
        swapLimit: 3,
      });
    } catch (err) {
      console.error('[swap_question]', err.message);
      socket.emit('error', { message: err.message });
    }
  });

  // ── 確認題目（被猜者確認後廣播給全員）──────────────────────
  socket.on('confirm_question', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const cache = getCache(roomId);
      const round = cache.currentRound;
      if (!round || round.subject_player_id !== playerId) return;
      if (round.status !== 'previewing_question') return;

      const updatedRound = await DB.updateRound(round.id, { status: 'selecting_answer' });
      cache.currentRound = enrichRoundWithTopic({ ...updatedRound, swap_count: round.swap_count ?? 0 }, cache.topics);

      const q = await DB.getQuestionById(updatedRound.question_id);
      const question = { id: q.id, a: q.option_a, b: q.option_b };

      io.to(roomId).emit('round_updated', {
        currentRound:    buildRoundPayload(cache.currentRound),
        currentQuestion: question,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── Emoji 反應 ────────────────────────────────────────────────
  socket.on('send_reaction', ({ emoji }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const validEmojis = ['🎉', '😱', '😅', '🔥'];
    if (!validEmojis.includes(emoji)) return;
    const cache = getCache(roomId);
    const player = cache.players.find(p => p.id === playerId);
    io.to(roomId).emit('reaction_broadcast', {
      emoji,
      nickname: player?.nickname ?? '???',
    });
  });

  // ── 斷線處理 ─────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    const { roomId, playerId } = socket.data ?? {};
    console.log(`[disconnect] ${socket.id} playerId=${playerId}`);
    if (!playerId) return;
    try {
      await DB.updatePlayer(playerId, { is_online: false });
      if (roomId) {
        const cache = getCache(roomId);
        const idx   = cache.players.findIndex(p => p.id === playerId);
        if (idx >= 0) {
          cache.players[idx] = { ...cache.players[idx], is_online: false };
        }
        io.to(roomId).emit('players_updated', { players: cache.players });
      }
    } catch {}
  });
});

// ================================================================
//  揭曉回合（內部函式，可由全員提交或房主手動觸發）
// ================================================================

async function revealRound(roomId, triggerSocket) {
  const cache = getCache(roomId);
  const round = cache.currentRound;
  if (!round || round.status !== 'guessing') return;

  // 加鎖，防止重複觸發
  if (cache._revealing) return;
  cache._revealing = true;

  try {
    const guesses = await DB.getGuesses(round.id);
    // ⚠️ 必須接住 markGuessesCorrect 的回傳值（含 is_correct 欄位），
    //    否則廣播的 guesses 裡 is_correct 永遠是 DB 的 null 初始值。
    const eligible = getEligibleGuessers(cache.players, round);
    const [markedGuesses] = await Promise.all([
      DB.markGuessesCorrect(round.id, round.subject_answer, guesses),
      DB.applyRoundScores(round.id, round.subject_answer, guesses, round.subject_player_id, eligible),
    ]);
    const updatedRound = await DB.updateRound(round.id, { status: 'revealing' });
    const players      = await DB.getPlayers(roomId);

    cache.currentRound = enrichRoundWithTopic(updatedRound, cache.topics);
    cache.guesses      = markedGuesses;
    cache.players      = players;

    // 揭曉時才廣播完整資訊（含 subject_answer + is_correct）
    io.to(roomId).emit('round_revealed', {
      currentRound: buildRoundPayload(cache.currentRound, true), // 含答案
      guesses:      markedGuesses,
      players,
    });
  } catch (err) {
    console.error('[revealRound]', err.message);
    if (triggerSocket) triggerSocket.emit('error', { message: err.message });
  } finally {
    cache._revealing = false;
  }
}

// 讓前端也可以主動觸發揭曉（房主手動，以防自動揭曉未觸發）
io.on('connection', (socket) => {
  socket.on('reveal_round', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const cache = getCache(roomId);
    if (cache.room?.host_player_id !== playerId) return;
    await revealRound(roomId, socket);
  });
});

// ================================================================
//  啟動伺服器
// ================================================================

server.listen(PORT, () => {
  console.log(`✅ 懂我再說 伺服器運行中：http://localhost:${PORT}`);
  console.log(`   CORS 允許來源：${allowedOrigins.join(', ')}`);
});
