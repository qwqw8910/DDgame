// ================================================================
//  Supabase Realtime 訂閱管理
// ================================================================

const RT = {
  channels: [],

  subscribe(roomId, callbacks) {
    this.unsubscribeAll();

    const roomCh = _supabase.channel(`room:${roomId}`)
      .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          p => callbacks.onRoomUpdate?.(p.new))
      .subscribe();

    const playersCh = _supabase.channel(`players:${roomId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
          p => callbacks.onPlayersChange?.(p))
      .subscribe();

    const roundsCh = _supabase.channel(`rounds:${roomId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` },
          p => callbacks.onRoundChange?.(p))
      .subscribe();

    this.channels = [roomCh, playersCh, roundsCh];
  },

  subscribeGuesses(roundId, callback) {
    // Remove previous guess channel if any
    this.channels = this.channels.filter(ch => {
      if (ch.topic && ch.topic.startsWith('guesses:')) {
        _supabase.removeChannel(ch);
        return false;
      }
      return true;
    });

    const guessCh = _supabase.channel(`guesses:${roundId}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'guesses', filter: `round_id=eq.${roundId}` },
          p => callback?.(p.new))
      .subscribe();

    this.channels.push(guessCh);
  },

  unsubscribeAll() {
    this.channels.forEach(ch => _supabase?.removeChannel(ch));
    this.channels = [];
  },
};
