// ================================================================
//  room.html 遊戲主控制器
// ================================================================

const GameApp = {

  // ── State ─────────────────────────────────────────────────────
  myPlayerId:         '',
  myNickname:         '',
  roomId:             '',
  room:               null,
  players:            [],
  currentRound:       null,
  currentQuestion:    null,
  guesses:            [],
  isSubject:          false,
  isHost:             false,
  hasSubmittedAnswer: false,
  hasSubmittedGuess:  false,
  _pollInterval:      null,

  // ── Init ──────────────────────────────────────────────────────
  async init() {
    const params = new URLSearchParams(window.location.search);
    this.roomId  = (params.get('id') || '').toUpperCase();
    if (!this.roomId) { window.location.href = 'index.html'; return; }

    this.myPlayerId = getOrCreatePlayerId();

    if (!IS_CONFIGURED) { this.showConfigError(); return; }
    initSupabase();
    this.showLoading('連線中…');

    try {
      this.room = await DB.getRoom(this.roomId);
    } catch {
      this.showError('找不到房間，可能已關閉或不存在');
      return;
    }

    const urlNickname   = params.get('nickname');
    const savedNickname = getSavedNickname();
    const nickname      = urlNickname || savedNickname;

    if (nickname) {
      await this.joinWithNickname(nickname);
    } else {
      this.hideLoading();
      this.showNicknameOverlay();
    }
  },

  async joinWithNickname(nickname) {
    this.showLoading('加入房間中…');
    try {
      await DB.joinRoom(this.roomId, this.myPlayerId, nickname);
      this.myNickname = nickname;
      saveNickname(nickname);
      await this.loadState();
      this.hideLoading();
      this.subscribeRealtime();
      this.startLobbyPolling();
    } catch (err) {
      this.hideLoading();
      if (err.message.includes('暱稱') || err.message.includes('滿') || err.message.includes('開始')) {
        this.showNicknameOverlay(err.message);
      } else {
        this.showError(err.message);
      }
    }
  },

  async loadState() {
    const [room, players, round] = await Promise.all([
      DB.getRoom(this.roomId),
      DB.getPlayers(this.roomId),
      DB.getCurrentRound(this.roomId),
    ]);
    this.room    = room;
    this.players = players;
    this.isHost  = room.host_player_id === this.myPlayerId;

    if (round) {
      this.currentRound = round;
      this.isSubject    = round.subject_player_id === this.myPlayerId;
      if (round.question_id) {
        this.currentQuestion = getQuestionByKey(round.question_id);
      }
      if (round.status === 'guessing' || round.status === 'revealing') {
        this.guesses           = await DB.getGuesses(round.id);
        this.hasSubmittedGuess = this.guesses.some(g => g.player_id === this.myPlayerId);
        this.hasSubmittedAnswer = true;
      }
      if (round.status === 'selecting_answer' && this.isSubject) {
        this.hasSubmittedAnswer = !!round.subject_answer;
      }
      if (round.status === 'guessing') {
        RT.subscribeGuesses(round.id, g => this._onNewGuess(g));
      }
    }
    this.render();
  },

  // ── Render ────────────────────────────────────────────────────
  render() {
    this._updateHeader();
    const rs  = this.room?.status;
    const rnd = this.currentRound?.status;

    if (rs === 'waiting') {
      this._renderLobby();
    } else if (rs === 'playing') {
      if      (rnd === 'selecting_topic')  this._renderSelectingTopic();
      else if (rnd === 'selecting_answer') this._renderSelectingAnswer();
      else if (rnd === 'guessing')         this._renderGuessing();
      else if (rnd === 'revealing')        this._renderRevealing();
    } else if (rs === 'finished') {
      this._renderFinished();
    }
  },

  _updateHeader() {
    const elId  = document.getElementById('header-room-id');
    const elCnt = document.getElementById('header-player-count');
    const elRnd = document.getElementById('header-round');
    const elRndW = document.getElementById('header-round-wrapper');

    if (elId)  elId.textContent  = this.roomId;
    if (elCnt) elCnt.textContent = `${this.players.length}/${this.room?.max_players ?? '?'}`;

    if (this.currentRound && this.room?.status === 'playing') {
      if (elRnd)  elRnd.textContent = `第 ${this.currentRound.round_number} 回合`;
      if (elRndW) elRndW.style.display = 'flex';
    } else {
      if (elRndW) elRndW.style.display = 'none';
    }
  },

  _renderLobby() {
    showSection('section-lobby');

    // Share URL
    const shareEl = document.getElementById('share-url');
    if (shareEl) shareEl.textContent = `${location.origin}${location.pathname}?id=${this.roomId}`;

    renderPlayerList(this.players, this.myPlayerId, this.room.host_player_id, null, this.isHost);

    const allReady = this.players.length >= 2 &&
      this.players.every(p => p.is_ready || p.id === this.room.host_player_id);
    const me        = this.players.find(p => p.id === this.myPlayerId);
    const readyCount = this.players.filter(p => p.is_ready || p.id === this.room.host_player_id).length;

    const readyBtn = document.getElementById('lobby-ready-btn');
    if (readyBtn) {
      readyBtn.style.display = this.isHost ? 'none' : '';
      if (!this.isHost) {
        const isReady = me?.is_ready;
        readyBtn.className = isReady ? 'btn-success' : 'btn-primary';
        readyBtn.innerHTML = isReady ? '✓ 已準備好！' : '準備好了！🙋';
        readyBtn.onclick   = isReady ? null : () => this.toggleReady();
      }
    }

    const startBtn = document.getElementById('lobby-start-btn');
    if (startBtn) {
      startBtn.style.display = this.isHost ? '' : 'none';
      startBtn.disabled      = !allReady;
      startBtn.innerHTML     = allReady
        ? '🎮 開始遊戲！'
        : `等待所有人準備 (${readyCount}/${this.players.length})`;
    }
  },

  _renderSelectingTopic() {
    showSection('section-topic');
    const subject = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const whoEl   = document.getElementById('topic-who');
    if (whoEl) whoEl.textContent = this.isSubject ? '選擇你最想聊的主題！' : `等待 ${subject?.nickname ?? '??'} 選主題…`;
    renderTopics(this.isSubject);
  },

  _renderSelectingAnswer() {
    showSection('section-answer');
    const subject = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const titleEl = document.getElementById('answer-title');

    if (this.isSubject) {
      if (titleEl) titleEl.textContent = '你的秘密選擇 🤫';
      document.getElementById('answer-waiting')?.classList.add('hidden');
      document.getElementById('answer-choices')?.classList.remove('hidden');
      if (!this.hasSubmittedAnswer) {
        renderChoices(this.currentQuestion, 'answer', null, 'answer-choice-container');
      }
    } else {
      if (titleEl) titleEl.textContent = '等待作答中…';
      document.getElementById('answer-choices')?.classList.add('hidden');
      document.getElementById('answer-waiting')?.classList.remove('hidden');
      const nameEl = document.getElementById('answer-waiting-name');
      if (nameEl) nameEl.textContent = subject?.nickname ?? '??';
    }
  },

  _renderGuessing() {
    showSection('section-guess');
    const subject      = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const nonSubjectCt = this.players.filter(p => p.id !== this.currentRound.subject_player_id).length;

    const nameEl = document.getElementById('guess-subject-name');
    if (nameEl) nameEl.textContent = subject?.nickname ?? '??';
    updateGuessProgress(this.guesses.length, nonSubjectCt);

    if (this.isSubject) {
      document.getElementById('guess-choices')?.classList.add('hidden');
      document.getElementById('guess-subject-waiting')?.classList.remove('hidden');
    } else {
      document.getElementById('guess-subject-waiting')?.classList.add('hidden');
      document.getElementById('guess-choices')?.classList.remove('hidden');

      const myGuess  = this.guesses.find(g => g.player_id === this.myPlayerId)?.guess ?? null;
      const statusEl = document.getElementById('guess-status-text');
      if (statusEl) statusEl.textContent = this.hasSubmittedGuess ? '✓ 已提交，等待其他人…' : '點選你的答案！';

      renderChoices(this.currentQuestion, 'guess', myGuess, 'guess-choice-container');
    }
  },

  _renderRevealing() {
    showSection('section-reveal');
    const subject    = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const nonSubject = this.players.filter(p => p.id !== this.currentRound.subject_player_id);

    const nameEl = document.getElementById('reveal-subject-name');
    if (nameEl) nameEl.textContent = subject?.nickname ?? '??';

    renderReveal(this.currentQuestion, this.currentRound.subject_answer, this.guesses, nonSubject);

    // Confetti for correct guessers
    const myGuess = this.guesses.find(g => g.player_id === this.myPlayerId);
    if (myGuess?.is_correct && !this.isSubject) this._confetti();

    const nextBtn = document.getElementById('reveal-next-btn');
    if (nextBtn) nextBtn.style.display = this.isHost ? '' : 'none';

    const waitEl = document.getElementById('reveal-waiting-next');
    if (waitEl) waitEl.textContent = this.isHost ? '' : '等待房主進入下一回合…';
  },

  _renderFinished() {
    showSection('section-finished');
    this._confetti();

    const sorted  = [...this.players].sort((a, b) => b.score - a.score);
    const medals  = ['🥇', '🥈', '🥉'];
    const scoresEl = document.getElementById('finished-scores');
    if (scoresEl) {
      scoresEl.innerHTML = sorted.map((p, i) => `
        <div class="player-row ${i === 0 ? 'is-correct' : ''} animate-slide-up"
             style="animation-delay:${i * 0.08}s">
          <div style="font-size:26px;width:32px;text-align:center">
            ${medals[i] ?? `${i + 1}.`}
          </div>
          <div class="player-avatar" style="background:${getPlayerColor(p.join_order)}">
            ${getPlayerEmoji(p.join_order)}
          </div>
          <div style="flex:1;font-weight:800;font-size:15px">${escHtml(p.nickname)}</div>
          <div style="font-weight:900;color:#7C3AED;font-size:16px">${p.score} 分</div>
        </div>`).join('');
    }

    const restartBtn = document.getElementById('finished-restart-btn');
    if (restartBtn) restartBtn.style.display = this.isHost ? '' : 'none';
  },

  // ── Actions ───────────────────────────────────────────────────

  async toggleReady() {
    const me = this.players.find(p => p.id === this.myPlayerId);
    await DB.updatePlayer(this.myPlayerId, { is_ready: !me?.is_ready });
  },

  async startGame() {
    if (!this.isHost) return;
    if (this.players.length < 2) { showToast('至少需要2位玩家！', 'error'); return; }
    const round = await DB.createRound(this.roomId, 1, this.players[0].id);
    await DB.updateRoom(this.roomId, { status: 'playing', current_round_id: round.id });
  },

  async selectTopic(topicId) {
    if (!this.isSubject) return;
    const usedKeys = await DB.getUsedQuestionKeys(this.roomId);
    const q        = getRandomQuestion(topicId, usedKeys);
    if (!q) { showToast('此主題題目已全部用完，請選其他主題！', 'error'); return; }
    this.currentQuestion = q;
    await DB.updateRound(this.currentRound.id, {
      question_id: q.key, topic_id: topicId, status: 'selecting_answer',
    });
  },

  handleChoiceClick(letter) {
    if (!this.currentRound) return;
    const status = this.currentRound.status;
    if (status === 'selecting_answer') this.submitAnswer(letter);
    else if (status === 'guessing')    this.submitGuess(letter);
  },

  async submitAnswer(answer) {
    if (!this.isSubject || this.hasSubmittedAnswer) return;
    this.hasSubmittedAnswer = true;
    // Temporarily show selected state
    renderChoices(this.currentQuestion, 'answer', answer, 'answer-choice-container');
    await DB.updateRound(this.currentRound.id, { subject_answer: answer, status: 'guessing' });
  },

  async submitGuess(guess) {
    if (this.isSubject || this.hasSubmittedGuess) return;
    this.hasSubmittedGuess = true;
    renderChoices(this.currentQuestion, 'guess', guess, 'guess-choice-container');
    await DB.submitGuess(this.currentRound.id, this.myPlayerId, guess);
    showToast('已提交猜測！等待其他人… 🤔', 'success');
    const statusEl = document.getElementById('guess-status-text');
    if (statusEl) statusEl.textContent = '✓ 已提交，等待其他人…';
  },

  async revealRound() {
    if (!this.isHost) return;
    await DB.markGuessesCorrect(this.currentRound.id, this.currentRound.subject_answer);
    await DB.updateRound(this.currentRound.id, { status: 'revealing' });
  },

  async nextRound() {
    if (!this.isHost) return;
    await DB.updateRound(this.currentRound.id, { status: 'finished' });

    const curIdx = this.players.findIndex(p => p.id === this.currentRound.subject_player_id);
    const nextIdx = curIdx + 1;

    if (nextIdx >= this.players.length) {
      await DB.updateRoom(this.roomId, { status: 'finished' });
    } else {
      const nextPlayer = this.players[nextIdx];
      const round = await DB.createRound(
        this.roomId, this.currentRound.round_number + 1, nextPlayer.id
      );
      await DB.updateRoom(this.roomId, { current_round_id: round.id });
    }
  },

  async kickPlayer(playerId, nickname) {
    if (!this.isHost) return;
    if (!confirm(`確定要踢出 ${nickname}？`)) return;
    await DB.removePlayer(playerId);
    showToast(`已踢出 ${nickname}`, 'success');
  },

  async restartGame() {
    if (!this.isHost) return;
    await Promise.all(this.players.map(p => DB.updatePlayer(p.id, { is_ready: false, score: 0 })));
    await DB.updateRoom(this.roomId, { status: 'waiting', current_round_id: null });
  },

  copyLink() {
    const url = `${location.origin}${location.pathname}?id=${this.roomId}`;
    copyToClipboard(url, '房間連結已複製 🔗');
  },

  // ── Realtime ──────────────────────────────────────────────────
  subscribeRealtime() {
    RT.subscribe(this.roomId, {

      onRoomUpdate: async room => {
        this.room   = room;
        this.isHost = room.host_player_id === this.myPlayerId;

        if (room.status !== 'waiting') this.stopLobbyPolling();

        if (room.current_round_id && room.current_round_id !== this.currentRound?.id) {
          this.currentRound       = await DB.getRoundById(room.current_round_id);
          this.isSubject          = this.currentRound.subject_player_id === this.myPlayerId;
          this.currentQuestion    = this.currentRound.question_id
            ? getQuestionByKey(this.currentRound.question_id) : null;
          this.hasSubmittedAnswer = false;
          this.hasSubmittedGuess  = false;
          this.guesses            = [];
        }
        this.render();
      },

      onPlayersChange: async () => {
        this.players = await DB.getPlayers(this.roomId);
        this.isHost  = this.room?.host_player_id === this.myPlayerId;
        this.render();
      },

      onRoundChange: async payload => {
        const updated = payload.new;
        if (!updated || updated.room_id !== this.roomId) return;

        const prevStatus   = this.currentRound?.status;
        this.currentRound  = updated;
        this.isSubject     = updated.subject_player_id === this.myPlayerId;
        this.currentQuestion = updated.question_id
          ? getQuestionByKey(updated.question_id) : null;

        if (updated.status === 'guessing' && prevStatus !== 'guessing') {
          this.guesses           = await DB.getGuesses(updated.id);
          this.hasSubmittedGuess = this.guesses.some(g => g.player_id === this.myPlayerId);
          RT.subscribeGuesses(updated.id, g => this._onNewGuess(g));
        }
        if (updated.status === 'revealing' && prevStatus !== 'revealing') {
          this.guesses = await DB.getGuesses(updated.id);
        }
        this.render();
      },
    });

    // Mark player offline on page unload
    window.addEventListener('beforeunload', () => {
      RT.unsubscribeAll();
      // Best-effort offline marker
      const url  = `${SUPABASE_URL}/rest/v1/players?id=eq.${this.myPlayerId}`;
      const body = JSON.stringify({ is_online: false });
      navigator.sendBeacon && navigator.sendBeacon(url,
        new Blob([body], { type: 'application/json' }));
    });
  },

  _onNewGuess(guess) {
    if (!this.guesses.find(g => g.id === guess.id)) this.guesses.push(guess);
    const total = this.players.filter(p => p.id !== this.currentRound?.subject_player_id).length;
    updateGuessProgress(this.guesses.length, total);

    // Auto-reveal when all players have submitted
    if (this.isHost && this.guesses.length >= total) {
      setTimeout(() => this.revealRound(), 800);
    }
  },

  // ── Lobby Polling（Realtime 備援）────────────────────────────
  startLobbyPolling() {
    this.stopLobbyPolling();
    this._pollInterval = setInterval(async () => {
      if (this.room?.status !== 'waiting') {
        this.stopLobbyPolling();
        return;
      }
      try {
        const [room, players] = await Promise.all([
          DB.getRoom(this.roomId),
          DB.getPlayers(this.roomId),
        ]);
        const prevCount = this.players.length;
        this.room    = room;
        this.players = players;
        this.isHost  = room.host_player_id === this.myPlayerId;
        if (players.length !== prevCount) this.render();
      } catch {}
    }, 3000);
  },

  stopLobbyPolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  // ── UI helpers ────────────────────────────────────────────────
  showLoading(msg = '載入中…') {
    const ls = document.getElementById('loading-screen');
    const lt = document.getElementById('loading-text');
    if (ls) ls.style.display = 'flex';
    if (lt) lt.textContent   = msg;
    const gw = document.getElementById('game-wrapper');
    if (gw) gw.style.display = 'none';
  },

  hideLoading() {
    const ls = document.getElementById('loading-screen');
    const gw = document.getElementById('game-wrapper');
    if (ls) ls.style.display = 'none';
    if (gw) gw.style.display = 'block';
  },

  showNicknameOverlay(err = '') {
    document.getElementById('nickname-overlay')?.classList.remove('hidden');
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('game-wrapper').style.display   = 'none';
    if (err) {
      const el = document.getElementById('nickname-error');
      if (el) { el.textContent = err; el.classList.remove('hidden'); }
    }
    const inp = document.getElementById('overlay-nickname');
    if (inp) { inp.value = getSavedNickname(); setTimeout(() => inp.focus(), 100); }
  },

  showError(msg) {
    document.getElementById('loading-screen').style.display = 'none';
    const el  = document.getElementById('error-screen');
    const mel = document.getElementById('error-message');
    if (el)  el.style.display  = 'flex';
    if (mel) mel.textContent   = msg;
  },

  showConfigError() {
    document.getElementById('loading-screen').style.display = 'none';
    const el = document.getElementById('config-error-screen');
    if (el) el.style.display = 'flex';
  },

  _confetti() {
    if (typeof confetti !== 'function') return;
    confetti({
      particleCount: 120, spread: 80, origin: { y: 0.6 },
      colors: ['#8B5CF6', '#EC4899', '#FBBF24', '#34D399', '#60A5FA'],
    });
  },
};

// ── Global entry points (called from HTML) ────────────────────────
async function submitNickname() {
  const inp      = document.getElementById('overlay-nickname');
  const nickname = inp?.value.trim();
  if (!nickname) {
    inp?.classList.add('animate-shake');
    setTimeout(() => inp?.classList.remove('animate-shake'), 500);
    return;
  }
  document.getElementById('nickname-overlay')?.classList.add('hidden');
  await GameApp.joinWithNickname(nickname);
}

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  GameApp.init();
  document.getElementById('overlay-nickname')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') submitNickname(); });
});
