// ================================================================
//  懂我再說 — Socket.io 遊戲後端伺服器
//  架構：Express + Socket.io + Supabase (service_role) + 統一房間模組
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
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS blocked: ${origin}`));
    },
    methods: ['GET', 'POST'],
  },
  pingTimeout:  30000,
  pingInterval: 10000,
});

app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }));

// ── 默契傳聲筒 namespace ──────────────────────────────────────
const { registerNamespace: registerCS } = require('./character-storm');
registerCS(io, db);

// ── 遊戲狀態快取（房間/玩家改由統一房間模組管理）────────────
// gameCache[roomId] = { currentRound, currentQuestion, guesses, topics, round_pool, _previewUsedIds, _previewTopicId }
const gameCache = {};

function getGameCache(roomId) {
  if (!gameCache[roomId]) {
    gameCache[roomId] = {
      currentRound:    null,
      currentQuestion: null,
      guesses:         [],
      topics:          null,
      round_pool:      [],
      _previewUsedIds: [],
      _previewTopicId: null,
    };
  }
  return gameCache[roomId];
}

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

    const totalEligible = eligibleGuessers ? eligibleGuessers.length : guesses.length;
    if (subjectPlayerId && totalEligible > 0) {
      const { data: subj } = await db.from('players').select('id,score').eq('id', subjectPlayerId).single();
      if (subj) {
        let subjectDelta = 0;
        if (winners.length === totalEligible) subjectDelta = 1;
        else if (losers.length === totalEligible) subjectDelta = -1;
        if (subjectDelta !== 0) {
          ops.push(db.from('players').update({ score: Math.max(0, (subj.score ?? 0) + subjectDelta), updated_at: now }).eq('id', subj.id));
        }
      }
    }

    if (ops.length) await Promise.all(ops);
  },
};

// ================================================================
//  遊戲工具函式
// ================================================================

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

/** 建構要廣播的回合物件，揭曉前遮蔽 subject_answer */
function buildRoundPayload(round, forReveal = false) {
  if (!round) return null;
  return {
    ...round,
    subject_answer: forReveal ? round.subject_answer : null,
  };
}

/** 注入 topic_name 到 round 物件 */
function enrichRoundWithTopic(round, topics = []) {
  if (!round || !round.topic_id) return round;
  const topic = topics.find(t => t.id === round.topic_id);
  return topic ? { ...round, topic_name: topic.name } : round;
}

// ================================================================
//  統一房間模組（懂我再說主 namespace）
// ================================================================

const { registerRoomHandlers } = require('./room');

const { roomCache } = registerRoomHandlers(io, db, {

  minPlayers: 2,

  // 懂我再說允許遊戲進行中隨時加入
  canJoinAsPlayer(_roomId) {
    return true;
  },

  // 提供給 room:join-ack 的遊戲狀態
  buildGameState(roomId) {
    const gc = gameCache[roomId];
    if (!gc) return null;
    const round = gc.currentRound;
    const isRevealing           = round?.status === 'revealing';
    const isPreviewingQuestion  = round?.status === 'previewing_question';
    return {
      currentRound:    buildRoundPayload(round, isRevealing),
      topics:          gc.topics || [],
      currentQuestion: isPreviewingQuestion ? null : (gc.currentQuestion ?? null),
      guesses: isRevealing
        ? gc.guesses || []
        : (gc.guesses || []).map(g => ({
            id:        g.id,
            round_id:  g.round_id,
            player_id: g.player_id,
            guess:     g.guess,
          })),
    };
  },

  // 玩家加入或重連
  async onPlayerJoined(socket, roomId, playerId, isReconnect) {
    if (!isReconnect) return;
    const gc = getGameCache(roomId);
    // 補載主題清單
    if (!gc.topics) gc.topics = await DB.getTopics();
    // 被猜者在 previewing_question 重連 → 重傳 preview_question
    const round = gc.currentRound;
    if (round?.status === 'previewing_question' && playerId === round.subject_player_id) {
      let q = gc.currentQuestion;
      if (!q && round.question_id) q = await DB.getQuestionById(round.question_id);
      if (q) {
        socket.emit('preview_question', {
          question: { id: q.id, a: q.option_a, b: q.option_b, title: q.title || null, author: q.author || null },
          swapCount: round.swap_count ?? 0,
          swapLimit: 3,
        });
      }
    }
  },

  // 玩家離開（踢出 / 斷線 / 主動）
  async onPlayerLeft(roomId, playerId) {
    const gc = getGameCache(roomId);
    const round = gc.currentRound;
    if (!round) return;

    const isSubject = round.subject_player_id === playerId;

    if (isSubject && ['selecting_topic', 'previewing_question', 'selecting_answer'].includes(round.status)) {
      // 被猜者離場 → 自動跳下一回合
      try {
        await DB.updateRound(round.id, { status: 'finished' });
        const players = roomCache.getPlayers(roomId);
        let pool = (gc.round_pool || []).filter(id => id !== playerId);
        if (!pool.length) {
          pool = players
            .filter(p => p.id !== playerId)
            .sort(() => Math.random() - 0.5)
            .map(p => p.id);
        }
        if (!pool.length) return;
        const nextSubjectId = pool[0];
        gc.round_pool      = pool.slice(1);
        const newRound     = await DB.createRound(roomId, round.round_number + 1, nextSubjectId);
        await DB.updateRoom(roomId, { current_round_id: newRound.id });
        gc.currentRound    = newRound;
        gc.currentQuestion = null;
        gc.guesses         = [];
        io.to(roomId).emit('round_updated', {
          currentRound:    buildRoundPayload(newRound),
          currentQuestion: null,
        });
      } catch (err) {
        console.error('[KM:onPlayerLeft] 跳關', err.message);
      }

    } else if (round.status === 'guessing') {
      // 猜測中 → 重新計算是否全員已提交（只算在線玩家）
      const allPlayers = roomCache.getPlayers(roomId);
      const eligible   = getEligibleGuessers(allPlayers, round).filter(p => p.is_online);
      const submitted  = new Set(gc.guesses.map(g => g.player_id)).size;
      if (eligible.length > 0 && submitted >= eligible.length) {
        setTimeout(() => revealRound(roomId, null), 800);
      }
    }
  },
});

// ================================================================
//  Socket.io 遊戲事件（房間管理由 registerRoomHandlers 負責）
// ================================================================

io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── 開始遊戲（房主）──────────────────────────────────────────
  socket.on('start_game', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const gc      = getGameCache(roomId);
      const entry   = roomCache.getEntry(roomId);
      const room    = entry?.room;
      const players = roomCache.getPlayers(roomId);

      if (room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以開始遊戲' });
      }
      if (players.length < 2) {
        return socket.emit('error', { message: '至少需要 2 位玩家才能開始！' });
      }

      const shuffled = [...players].sort(() => Math.random() - 0.5);
      gc.round_pool = shuffled.slice(1).map(p => p.id);
      const firstSubject = shuffled[0];
      const round = await DB.createRound(roomId, 1, firstSubject.id);
      const updatedRoom = await DB.updateRoom(roomId, { status: 'playing', current_round_id: round.id });
      roomCache.updateRoom(roomId, { status: 'playing', current_round_id: round.id });

      gc.currentRound    = round;
      gc.currentQuestion = null;
      gc.guesses         = [];

      io.to(roomId).emit('game_started', {
        room:         updatedRoom,
        currentRound: buildRoundPayload(round),
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 選主題（被猜者）─────────────────────────────────────────
  socket.on('select_topic', async ({ topicId }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId || !topicId) return;
    try {
      const gc    = getGameCache(roomId);
      const round = gc.currentRound;

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
      gc.currentRound     = enrichRoundWithTopic({ ...updatedRound, swap_count: 0 }, gc.topics);
      gc.currentQuestion  = q;
      gc._previewUsedIds  = [...usedIds, q.id];
      gc._previewTopicId  = topicId;

      const question = { id: q.id, a: q.option_a, b: q.option_b, title: q.title || null, author: q.author || null };

      io.to(roomId).emit('round_updated', {
        currentRound:    buildRoundPayload(gc.currentRound),
        currentQuestion: null,
      });

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
  socket.on('submit_answer', async ({ answer }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    if (!['A', 'B'].includes(answer)) return;
    try {
      const gc    = getGameCache(roomId);
      const round = gc.currentRound;

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
      gc.currentRound = enrichRoundWithTopic(updatedRound, gc.topics);
      gc.guesses      = [];

      io.to(roomId).emit('round_updated', {
        currentRound: buildRoundPayload(gc.currentRound, false),
      });
      socket.emit('answer_accepted', { answer });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 提交猜測（其他玩家）─────────────────────────────────────
  socket.on('submit_guess', async ({ guess }) => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    if (!['A', 'B'].includes(guess)) return;
    try {
      const gc    = getGameCache(roomId);
      const round = gc.currentRound;

      if (!round || round.status !== 'guessing') {
        return socket.emit('error', { message: '目前不是猜測階段' });
      }
      if (round.subject_player_id === playerId) {
        return socket.emit('error', { message: '被猜者不能猜測' });
      }

      await DB.submitGuess(round.id, playerId, guess);

      const existing = gc.guesses.findIndex(g => g.player_id === playerId);
      const newGuess = { round_id: round.id, player_id: playerId, guess };
      if (existing >= 0) gc.guesses[existing] = { ...gc.guesses[existing], ...newGuess };
      else gc.guesses.push(newGuess);

      const players  = roomCache.getPlayers(roomId);
      const eligible = getEligibleGuessers(players, round);
      const submitted = new Set(gc.guesses.map(g => g.player_id)).size;
      const total     = eligible.length;

      io.to(roomId).emit('guess_progress', {
        submitted,
        total,
        submittedIds: gc.guesses.map(g => g.player_id),
      });

      if (submitted >= total && total > 0) {
        setTimeout(() => revealRound(roomId, socket), 800);
      }
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 下一回合（房主）─────────────────────────────────────────
  socket.on('next_round', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const gc    = getGameCache(roomId);
      const entry = roomCache.getEntry(roomId);
      if (entry?.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以進行下一回合' });
      }

      const round = gc.currentRound;
      await DB.updateRound(round.id, { status: 'finished' });

      let pool = gc.round_pool || [];
      if (!pool.length) {
        pool = roomCache.getPlayers(roomId)
          .filter(p => p.id !== round.subject_player_id)
          .sort(() => Math.random() - 0.5)
          .map(p => p.id);
        if (!pool.length) pool = roomCache.getPlayers(roomId).map(p => p.id).sort(() => Math.random() - 0.5);
      }
      const nextSubjectId = pool[0];
      gc.round_pool = pool.slice(1);
      const newRound = await DB.createRound(roomId, round.round_number + 1, nextSubjectId);
      const updatedRoom = await DB.updateRoom(roomId, { current_round_id: newRound.id });
      roomCache.updateRoom(roomId, { current_round_id: newRound.id });

      gc.currentRound    = newRound;
      gc.currentQuestion = null;
      gc.guesses         = [];

      io.to(roomId).emit('round_updated', {
        currentRound:    buildRoundPayload(newRound),
        currentQuestion: null,
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 結束遊戲（房主）─────────────────────────────────────────
  socket.on('end_game', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const gc    = getGameCache(roomId);
      const entry = roomCache.getEntry(roomId);
      if (entry?.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以結束遊戲' });
      }
      if (gc.currentRound) {
        await DB.updateRound(gc.currentRound.id, { status: 'finished' });
      }
      const updatedRoom = await DB.updateRoom(roomId, { status: 'finished' });
      roomCache.updateRoom(roomId, { status: 'finished' });
      gc.currentRound = null;

      const players = await DB.getPlayers(roomId);
      // 同步分數到 roomCache
      players.forEach(p => roomCache.updatePlayer(roomId, p.id, { score: p.score }));

      io.to(roomId).emit('game_finished', { room: updatedRoom, players });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 重新開始（房主）─────────────────────────────────────────
  socket.on('restart_game', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const gc     = getGameCache(roomId);
      const entry  = roomCache.getEntry(roomId);
      if (entry?.room?.host_player_id !== playerId) {
        return socket.emit('error', { message: '只有房主可以重新開始' });
      }
      const players = roomCache.getPlayers(roomId);
      await Promise.all(players.map(p =>
        DB.updatePlayer(p.id, { is_ready: false, score: 0 })
      ));
      const updatedRoom = await DB.updateRoom(roomId, { status: 'waiting', current_round_id: null });
      roomCache.updateRoom(roomId, { status: 'waiting', current_round_id: null });
      players.forEach(p => roomCache.updatePlayer(roomId, p.id, { is_ready: false, score: 0 }));

      gc.currentRound    = null;
      gc.currentQuestion = null;
      gc.guesses         = [];
      gc.round_pool      = [];

      const freshPlayers = await DB.getPlayers(roomId);
      io.to(roomId).emit('game_restarted', { room: updatedRoom, players: freshPlayers });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // ── 換題（被猜者，最多3次）──────────────────────────────────
  socket.on('swap_question', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    try {
      const gc    = getGameCache(roomId);
      const round = gc.currentRound;
      if (!round || round.subject_player_id !== playerId) return;
      if (round.status !== 'previewing_question') return;
      if ((round.swap_count ?? 0) >= 3) {
        return socket.emit('error', { message: '換題次數已用完' });
      }

      const topicId = gc._previewTopicId || round.topic_id;
      const usedIds = gc._previewUsedIds || [];
      const q = await DB.getRandomQuestion(topicId, usedIds);
      if (!q) {
        return socket.emit('error', { message: '此主題已無更多題目可換' });
      }

      const newSwapCount = (round.swap_count ?? 0) + 1;
      const updatedRound = await DB.updateRound(round.id, { question_id: q.id });
      gc.currentRound     = enrichRoundWithTopic({ ...updatedRound, swap_count: newSwapCount }, gc.topics);
      gc.currentQuestion  = q;
      gc._previewUsedIds  = [...usedIds, q.id];

      socket.emit('preview_question', {
        question: { id: q.id, a: q.option_a, b: q.option_b, title: q.title || null, author: q.author || null },
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
      const gc    = getGameCache(roomId);
      const round = gc.currentRound;
      if (!round || round.subject_player_id !== playerId) return;
      if (round.status !== 'previewing_question') return;

      const updatedRound = await DB.updateRound(round.id, { status: 'selecting_answer' });
      gc.currentRound = enrichRoundWithTopic({ ...updatedRound, swap_count: round.swap_count ?? 0 }, gc.topics);

      const q = gc.currentQuestion || (round.question_id ? await DB.getQuestionById(round.question_id) : null);
      const question = q
        ? { id: q.id, a: q.option_a, b: q.option_b, title: q.title || null, author: q.author || null }
        : null;

      io.to(roomId).emit('round_updated', {
        currentRound:    buildRoundPayload(gc.currentRound),
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
    const player = roomCache.getPlayers(roomId).find(p => p.id === playerId);
    io.to(roomId).emit('reaction_broadcast', {
      emoji,
      nickname: player?.nickname ?? '???',
    });
  });
});

// ── 房主手動觸發揭曉（以防自動揭曉未觸發）──────────────────
io.on('connection', (socket) => {
  socket.on('reveal_round', async () => {
    const { roomId, playerId } = socket.data;
    if (!roomId || !playerId) return;
    const entry = roomCache.getEntry(roomId);
    if (entry?.room?.host_player_id !== playerId) return;
    await revealRound(roomId, socket);
  });
});

// ================================================================
//  揭曉回合（內部函式）
// ================================================================

async function revealRound(roomId, triggerSocket) {
  const gc    = getGameCache(roomId);
  const round = gc.currentRound;
  if (!round || round.status !== 'guessing') return;

  if (gc._revealing) return;
  gc._revealing = true;

  try {
    const guesses  = await DB.getGuesses(round.id);
    const players  = roomCache.getPlayers(roomId);
    const eligible = getEligibleGuessers(players, round);
    const [markedGuesses] = await Promise.all([
      DB.markGuessesCorrect(round.id, round.subject_answer, guesses),
      DB.applyRoundScores(round.id, round.subject_answer, guesses, round.subject_player_id, eligible),
    ]);
    const updatedRound = await DB.updateRound(round.id, { status: 'revealing' });
    const freshPlayers = await DB.getPlayers(roomId);

    gc.currentRound = enrichRoundWithTopic(updatedRound, gc.topics);
    gc.guesses      = markedGuesses;
    // 同步分數到 roomCache
    freshPlayers.forEach(p => roomCache.updatePlayer(roomId, p.id, { score: p.score }));

    io.to(roomId).emit('round_revealed', {
      currentRound: buildRoundPayload(gc.currentRound, true),
      guesses:      markedGuesses,
      players:      freshPlayers,
    });
  } catch (err) {
    console.error('[revealRound]', err.message);
    if (triggerSocket) triggerSocket.emit('error', { message: err.message });
  } finally {
    gc._revealing = false;
  }
}

// ================================================================
//  啟動伺服器
// ================================================================

server.listen(PORT, () => {
  console.log(`✅ 懂我再說 伺服器運行中：http://localhost:${PORT}`);
  console.log(`   CORS 允許來源：${allowedOrigins.join(', ')}`);
});
