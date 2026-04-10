// ================================================================
//  Supabase Realtime 訂閱管理
// ================================================================

const RT = {
  channels: [],
  _roomId:          null,
  _callbacks:       null,
  _reconnectTimer:  null,
  _isConnected:     true,

  subscribe(roomId, callbacks) {
    this.unsubscribeAll();
    this._roomId    = roomId;
    this._callbacks = callbacks;
    this._createChannels(roomId, callbacks);
  },

  _createChannels(roomId, callbacks) {
    // 監聽 channel 狀態：斷線自動重連
    const onStatus = (status) => {
      if (status === 'SUBSCRIBED') {
        if (!this._isConnected) {
          this._isConnected = true;
          callbacks.onReconnected?.();
        }
      } else if (['TIMED_OUT', 'CHANNEL_ERROR', 'CLOSED'].includes(status)) {
        if (this._isConnected) {
          this._isConnected = false;
          callbacks.onDisconnected?.();
        }
        // 4 秒後嘗試重建所有 channels
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => {
          if (this._roomId && this._callbacks) {
            // 只重建主 channels，guesses channel 由 loadState 恢復
            this._createChannels(this._roomId, this._callbacks);
          }
        }, 4000);
      }
    };

    const roomCh = _supabase.channel(`room:${roomId}`)
      .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          p => callbacks.onRoomUpdate?.(p.new))
      .subscribe(onStatus);

    const playersCh = _supabase.channel(`players:${roomId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
          p => callbacks.onPlayersChange?.(p))
      .subscribe(onStatus);

    const roundsCh = _supabase.channel(`rounds:${roomId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${roomId}` },
          p => callbacks.onRoundChange?.(p))
      .subscribe(onStatus);

    // 保留舊的 guesses channel（若有），只替換主三個
    this.channels = [
      ...this.channels.filter(ch => ch.topic?.startsWith('guesses:')),
      roomCh, playersCh, roundsCh,
    ];
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
          { event: '*', schema: 'public', table: 'guesses', filter: `round_id=eq.${roundId}` },
          p => callback?.(p))
      .subscribe();

    this.channels.push(guessCh);
  },

  unsubscribeAll() {
    this.channels.forEach(ch => _supabase?.removeChannel(ch));
    this.channels = [];
  },
};
