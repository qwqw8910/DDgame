// ================================================================
//  Supabase 資料庫操作
// ================================================================

let _supabase = null;

function initSupabase() {
  if (!IS_CONFIGURED) return false;
  _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

const DB = {

  // ── Rooms ────────────────────────────────────────────────────

  async createRoom(roomId, hostPlayerId, maxPlayers) {
    const { data, error } = await _supabase.from('rooms')
      .insert({ id: roomId, host_player_id: hostPlayerId,
                max_players: maxPlayers, status: 'waiting' })
      .select().single();
    if (error) throw error;
    return data;
  },

  async getRoom(roomId) {
    const { data, error } = await _supabase.from('rooms')
      .select('*').eq('id', roomId).single();
    if (error) throw error;
    return data;
  },

  async updateRoom(roomId, updates) {
    const { data, error } = await _supabase.from('rooms')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', roomId).select().single();
    if (error) throw error;
    return data;
  },

  // ── Players ──────────────────────────────────────────────────

  async joinRoom(roomId, playerId, nickname) {
    // ── 1. 平行查詢：目前玩家紀錄 + 目標房間 ────────────────
    const [{ data: existingPlayer }, room] = await Promise.all([
      _supabase.from('players').select('*').eq('id', playerId).maybeSingle(),
      this.getRoom(roomId),
    ]);

    // ── 2. 重連同一房間：只更新上線狀態，保留分數與暱稱 ─────
    if (existingPlayer?.room_id === roomId) {
      const { data, error } = await _supabase.from('players')
        .update({ is_online: true, nickname, updated_at: new Date().toISOString() })
        .eq('id', playerId).select().single();
      if (error) throw error;
      return data;
    }

    // ── 3. 先驗證目標房間是否可加入 ─────────────────────────
    const players = await this.getPlayers(roomId);

    if (!['waiting', 'playing'].includes(room.status)) throw new Error('此房間目前不可加入！');
    if (players.length >= room.max_players)            throw new Error('房間已滿！');
    if (players.some(p => p.nickname === nickname))    throw new Error('此暱稱已被使用，請換一個！');

    // ── 4. 玩家存在其他房間 → UPDATE 移轉（避免 guesses FK 衝突）
    //      絕對不刪除舊 player row，讓歷史 guesses 紀錄繼續完整。
    if (existingPlayer) {
      const { data, error } = await _supabase.from('players')
        .update({
          room_id:    roomId,
          nickname,
          is_ready:   false,
          is_online:  true,
          join_order: players.length,
          score:      0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', playerId).select().single();
      if (error) throw error;
      return data;
    }

    // ── 5. 全新玩家 → INSERT ─────────────────────────────────
    const { data, error } = await _supabase.from('players')
      .insert({ id: playerId, room_id: roomId, nickname,
                is_ready: false, is_online: true,
                join_order: players.length, score: 0 })
      .select().single();
    if (error) throw error;
    return data;
  },

  async getPlayers(roomId) {
    const { data, error } = await _supabase.from('players')
      .select('*').eq('room_id', roomId).order('join_order');
    if (error) throw error;
    return data ?? [];
  },

  async updatePlayer(playerId, updates) {
    const { data, error } = await _supabase.from('players')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', playerId).select().single();
    if (error) throw error;
    return data;
  },

  async removePlayer(playerId) {
    // 先刪 guesses（player_id 沒有 ON DELETE CASCADE），再刪 player
    await _supabase.from('guesses').delete().eq('player_id', playerId);
    const { error } = await _supabase.from('players').delete().eq('id', playerId);
    if (error) throw error;
  },

  // ── Rounds ───────────────────────────────────────────────────

  async createRound(roomId, roundNumber, subjectPlayerId) {
    const { data, error } = await _supabase.from('rounds')
      .insert({ room_id: roomId, round_number: roundNumber,
                subject_player_id: subjectPlayerId, status: 'selecting_topic' })
      .select().single();
    if (error) throw error;
    return data;
  },

  async getRoundById(roundId) {
    const { data, error } = await _supabase.from('rounds')
      .select('*').eq('id', roundId).single();
    if (error) throw error;
    return data;
  },

  async getCurrentRound(roomId) {
    const { data, error } = await _supabase.from('rounds')
      .select('*').eq('room_id', roomId)
      .order('round_number', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async updateRound(roundId, updates) {
    const { data, error } = await _supabase.from('rounds')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', roundId).select().single();
    if (error) throw error;
    return data;
  },

  async getUsedQuestionIds(roomId) {
    const { data, error } = await _supabase.from('rounds')
      .select('question_id').eq('room_id', roomId).not('question_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map(r => r.question_id);
  },

  async getRandomQuestion(topicId, usedIds = []) {
    // 先取得可用題數，再用 offset 隨機選一題，避免傳回整張表
    let countQuery = _supabase.from('questions').select('id', { count: 'exact', head: true }).eq('topic_id', topicId);
    if (usedIds.length > 0) {
      countQuery = countQuery.not('id', 'in', `(${usedIds.join(',')})`);
    }
    const { count, error: cErr } = await countQuery;
    if (cErr) throw cErr;
    if (!count) return null;

    const offset = Math.floor(Math.random() * count);
    let query = _supabase.from('questions').select('*').eq('topic_id', topicId);
    if (usedIds.length > 0) {
      query = query.not('id', 'in', `(${usedIds.join(',')})`);
    }
    const { data, error } = await query.range(offset, offset);
    if (error) throw error;
    return data?.[0] ?? null;
  },

  async getQuestionById(questionId) {
    const { data, error } = await _supabase.from('questions')
      .select('*').eq('id', questionId).maybeSingle();
    if (error) throw error;
    return data;
  },

  async getTopics() {
    const { data, error } = await _supabase.from('topics')
      .select('*').order('id');
    if (error) throw error;
    return data ?? [];
  },

  // ── Guesses ──────────────────────────────────────────────────

  async submitGuess(roundId, playerId, guess) {
    const { data, error } = await _supabase.from('guesses')
      .upsert({ round_id: roundId, player_id: playerId, guess },
               { onConflict: 'round_id,player_id' })
      .select().single();
    if (error) throw error;
    return data;
  },

  async getGuesses(roundId) {
    const { data, error } = await _supabase.from('guesses')
      .select('*').eq('round_id', roundId);
    if (error) throw error;
    return data ?? [];
  },

  async markGuessesCorrect(roundId, correctAnswer, guesses) {
    // 允許外部傳入已有 guesses，避免重複查詢
    if (!guesses) guesses = await this.getGuesses(roundId);
    if (!guesses.length) return guesses;

    // 批次更新：原本 N 個獨立 PATCH → 最多 2 個 PATCH（correct / incorrect 各一批）
    const correctIds   = guesses.filter(g => g.guess === correctAnswer).map(g => g.id);
    const incorrectIds = guesses.filter(g => g.guess !== correctAnswer).map(g => g.id);

    const ops = [];
    if (correctIds.length)   ops.push(_supabase.from('guesses').update({ is_correct: true  }).in('id', correctIds));
    if (incorrectIds.length) ops.push(_supabase.from('guesses').update({ is_correct: false }).in('id', incorrectIds));

    const results = await Promise.all(ops);
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;

    return guesses.map(g => ({ ...g, is_correct: g.guess === correctAnswer }));
  },

  async applyRoundScores(roundId, correctAnswer, guesses) {
    // 允許外部傳入已有 guesses，避免重複查詢
    if (!guesses) guesses = await this.getGuesses(roundId);
    const winnerIds = guesses.filter(g => g.guess === correctAnswer).map(g => g.player_id);
    if (!winnerIds.length) return;

    // 一次撈出所有贏家，避免 N+1 查詢
    const { data: winners, error: getErr } = await _supabase.from('players')
      .select('id,score').in('id', winnerIds);
    if (getErr) throw getErr;

    const now = new Date().toISOString();
    await Promise.all(winners.map(p => {
      return _supabase.from('players')
        .update({ score: (p.score ?? 0) + 1, updated_at: now })
        .eq('id', p.id);
    }));
  },
};
