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
    // 檢查此玩家是否已在「這個房間」
    const { data: existingInRoom } = await _supabase.from('players')
      .select('*').eq('id', playerId).eq('room_id', roomId).maybeSingle();

    if (existingInRoom) {
      const { data, error } = await _supabase.from('players')
        .update({ is_online: true, updated_at: new Date().toISOString() })
        .eq('id', playerId).eq('room_id', roomId).select().single();
      if (error) throw error;
      return data;
    }

    // 檢查此玩家是否存在於「其他房間」（舊資料），若有則刪除
    const { data: existingElsewhere } = await _supabase.from('players')
      .select('id').eq('id', playerId).maybeSingle();

    if (existingElsewhere) {
      const { error: deleteError } = await _supabase.from('players').delete().eq('id', playerId);
      if (deleteError) throw deleteError;
    }

    const [players, room] = await Promise.all([
      this.getPlayers(roomId),
      this.getRoom(roomId),
    ]);

    if (room.status !== 'waiting')                     throw new Error('遊戲已開始，無法加入！');
    if (players.length >= room.max_players)            throw new Error('房間已滿！');
    if (players.some(p => p.nickname === nickname))    throw new Error('此暱稱已被使用，請換一個！');

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

  async getUsedQuestionKeys(roomId) {
    const { data, error } = await _supabase.from('rounds')
      .select('question_id').eq('room_id', roomId).not('question_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map(r => r.question_id);
  },

  async getUsedQuestionIds(roomId) {
    const { data, error } = await _supabase.from('rounds')
      .select('question_id').eq('room_id', roomId).not('question_id', 'is', null);
    if (error) throw error;
    return (data ?? []).map(r => r.question_id);
  },

  async getRandomQuestion(topicId, usedIds = []) {
    const { data, error } = await _supabase.from('questions')
      .select('*').eq('topic_id', topicId);
    if (error) throw error;
    
    const available = (data ?? []).filter(q => !usedIds.includes(q.id));
    if (!available.length) return null;
    
    return available[Math.floor(Math.random() * available.length)];
  },

  async getQuestionById(questionId) {
    const { data, error } = await _supabase.from('questions')
      .select('*').eq('id', questionId).maybeSingle();
    if (error) throw error;
    return data;
  },

  async getTopics() {
    console.log('🔍 DB.getTopics() called');
    console.log('🔌 Supabase URL:', _supabase?.supabaseUrl ?? 'N/A');
    const { data, error } = await _supabase.from('topics')
      .select('*').order('id');
    console.log('🔍 DB.getTopics() result - data:', data, 'error:', error);
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

  async markGuessesCorrect(roundId, correctAnswer) {
    const guesses = await this.getGuesses(roundId);
    await Promise.all(guesses.map(g =>
      _supabase.from('guesses')
        .update({ is_correct: g.guess === correctAnswer })
        .eq('id', g.id)
    ));
    return guesses.map(g => ({ ...g, is_correct: g.guess === correctAnswer }));
  },
};
