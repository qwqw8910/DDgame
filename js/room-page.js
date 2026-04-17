// ================================================================
//  room.html 遊戲主控制器
//  normalizeQuestion 定義於 questions.js，請勿在此重複宣告
// ================================================================

const GameApp = {

  // ── State ─────────────────────────────────────────────────────
  myPlayerId:             '',
  myNickname:             '',
  roomId:                 '',
  room:                   null,
  players:                [],
  topics:                 [],   // 從 DB 載入的主題清單
  currentRound:           null,
  currentQuestion:        null,
  guesses:                [],
  isSubject:              false,
  isHost:                 false,
  hasSubmittedAnswer:     false,
  hasSubmittedGuess:      false,
  _pollInterval:          null,
  _playersDebounceTimer:  null,  // 防抖：避免多人同時變更觸發大量重繪
  _renderTimer:           null,   // 防抖：合併短時間內的多次 render 呼叫

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
    // topics 變動頻率極低，只在第一次或為空時載入
    const needTopics = !this.topics.length;
    const [room, players, ...rest] = await Promise.all([
      DB.getRoom(this.roomId),
      DB.getPlayers(this.roomId),
      ...(needTopics ? [DB.getTopics()] : []),
    ]);
    this.room    = room;
    this.players = players;
    if (needTopics) this.topics = rest[0];
    this.isHost  = room.host_player_id === this.myPlayerId;

    // 使用 room.current_round_id 作為授權來源，避免抓到舊回合
    let round = null;
    if (room.current_round_id) {
      round = await DB.getRoundById(room.current_round_id);
    }

    if (round) {
      this.currentRound = round;
      this.isSubject    = round.subject_player_id === this.myPlayerId;
      if (round.question_id) {
        const q = await DB.getQuestionById(round.question_id);
        this.currentQuestion = normalizeQuestion(q);
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
    clearTimeout(this._renderTimer);
    this._renderTimer = setTimeout(() => this._doRender(), 50);
  },

  _doRender() {
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

    const allReady = this.players.length >= 1 &&
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
    renderTopics(this.isSubject, this.topics);
  },

  _renderSelectingAnswer() {
    showSection('section-answer');
    const subject = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const titleEl = document.getElementById('answer-title');

    if (this.isSubject) {
      document.getElementById('answer-waiting')?.classList.add('hidden');
      document.getElementById('answer-choices')?.classList.remove('hidden');
      if (!this.hasSubmittedAnswer) {
        renderChoices(this.currentQuestion, 'answer', null, 'answer-choice-container', '題目：關主會選哪一個？');
      }
    } else {
      document.getElementById('answer-waiting')?.classList.add('hidden');
      document.getElementById('answer-choices')?.classList.remove('hidden');
      renderChoices(this.currentQuestion, 'view', null, 'answer-choice-container', '題目：先看題目，關主會選哪一個？，等關主選完才能猜測');
    }
  },

  _renderGuessing() {
    showSection('section-guess');
    const subject      = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const nonSubjectCt = this._getEligibleGuesserCount();

    const nameEl = document.getElementById('guess-subject-name');
    if (nameEl) nameEl.textContent = subject?.nickname ?? '??';
    updateGuessProgress(this._getEligibleGuessSubmittedCount(), nonSubjectCt);

    if (this.isSubject) {
      document.getElementById('guess-choices')?.classList.add('hidden');
      document.getElementById('guess-subject-waiting')?.classList.remove('hidden');
    } else {
      document.getElementById('guess-subject-waiting')?.classList.add('hidden');
      document.getElementById('guess-choices')?.classList.remove('hidden');

      const myGuess  = this.guesses.find(g => g.player_id === this.myPlayerId)?.guess ?? null;
      const statusEl = document.getElementById('guess-status-text');
      if (statusEl) {
        statusEl.textContent = this.hasSubmittedGuess
          ? '✓ 已提交，可在揭曉前改選'
          : '點選你的答案（揭曉前可改選）';
      }

      renderChoices(this.currentQuestion, 'guess', myGuess, 'guess-choice-container', '題目：你覺得對方最可能會選哪一個？');
    }
  },

  _renderRevealing() {
    showSection('section-reveal');
    const subject    = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const nonSubject = this.players.filter(p => p.id !== this.currentRound.subject_player_id);

    const nameEl = document.getElementById('reveal-subject-name');
    if (nameEl) nameEl.textContent = subject?.nickname ?? '??';

    renderReveal(this.currentQuestion, this.currentRound.subject_answer, this.guesses, nonSubject);
    renderScoreboard(this.players);

    // Confetti for correct guessers
    const myGuess = this.guesses.find(g => g.player_id === this.myPlayerId);
    if (myGuess && myGuess.guess === this.currentRound.subject_answer && !this.isSubject) this._confetti();

    const nextBtn = document.getElementById('reveal-next-btn');
    if (nextBtn) nextBtn.style.display = this.isHost ? '' : 'none';

    const endBtn = document.getElementById('reveal-end-btn');
    if (endBtn) endBtn.style.display = this.isHost ? '' : 'none';

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
    if (this.players.length < 1) { showToast('至少需要1位玩家！', 'error'); return; }
    const round = await DB.createRound(this.roomId, 1, this.players[0].id);
    const room  = await DB.updateRoom(this.roomId, { status: 'playing', current_round_id: round.id });
    // 立即更新本地狀態，不等 Realtime，避免因事件次序造成畫面閃回大廳
    this.room             = room;
    this.currentRound     = round;
    this.isSubject        = round.subject_player_id === this.myPlayerId;
    this.currentQuestion  = null;
    this.hasSubmittedAnswer = false;
    this.hasSubmittedGuess  = false;
    this.guesses          = [];
    this.stopLobbyPolling();
    this.render();
  },

  async selectTopic(topicId) {
    if (!this.isSubject) return;
    const usedIds = await DB.getUsedQuestionIds(this.roomId);
    const q       = await DB.getRandomQuestion(topicId, usedIds);
    if (!q) { showToast('此主題題目已全部用完，請選其他主題！', 'error'); return; }
    this.currentQuestion = normalizeQuestion(q);
    await DB.updateRound(this.currentRound.id, {
      question_id: q.id, topic_id: topicId, status: 'selecting_answer',
    });
  },

  handleChoiceClick(letter) {
    if (!this.currentRound) return;
    const status = this.currentRound.status;
    if (status === 'selecting_answer') {
      if (this.isSubject) this.submitAnswer(letter);
    } else if (status === 'guessing') {
      this.submitGuess(letter);
    }
  },

  async submitAnswer(answer) {
    if (!this.isSubject || this.hasSubmittedAnswer) return;
    this.hasSubmittedAnswer = true;
    // Temporarily show selected state
    renderChoices(this.currentQuestion, 'answer', answer, 'answer-choice-container');
    await DB.updateRound(this.currentRound.id, { subject_answer: answer, status: 'guessing' });
  },

  async submitGuess(guess) {
    if (this.isSubject) return;
    const prevGuess = this.guesses.find(g => g.player_id === this.myPlayerId)?.guess ?? null;
    renderChoices(this.currentQuestion, 'guess', guess, 'guess-choice-container');
    renderChoices(this.currentQuestion, 'guess', guess, 'answer-choice-container');
    await DB.submitGuess(this.currentRound.id, this.myPlayerId, guess);
    this.hasSubmittedGuess = true;
    showToast(prevGuess ? '已更新你的猜測！' : '已提交猜測！', 'success');
    const statusEl = document.getElementById('guess-status-text');
    if (statusEl) statusEl.textContent = '✓ 已提交，可在揭曉前改選';
    const answerStatusEl = document.getElementById('answer-guess-status');
    if (answerStatusEl) answerStatusEl.textContent = '✓ 你的猜測已送出，揭曉前可改選。';
  },

  async revealRound() {
    if (!this.isHost) return;
    // 加鎖：防止 _onNewGuess 重複觸發（markGuessesCorrect 的 UPDATE 事件也會觸發 Realtime）
    if (this._revealing) return;
    this._revealing = true;
    try {
      const answer  = this.currentRound.subject_answer;
      // 只查一次 guesses，傳給兩個函式共用
      const guesses = await DB.getGuesses(this.currentRound.id);
      await Promise.all([
        DB.markGuessesCorrect(this.currentRound.id, answer, guesses),
        DB.applyRoundScores(this.currentRound.id, answer, guesses),
      ]);
      await DB.updateRound(this.currentRound.id, { status: 'revealing' });
    } finally {
      this._revealing = false;
    }
  },

  async nextRound() {
    if (!this.isHost) return;
    await DB.updateRound(this.currentRound.id, { status: 'finished' });

    const curIdx = this.players.findIndex(p => p.id === this.currentRound.subject_player_id);
    // 循環：所有人都當完被猜者後繞回第一位，不強制結束遊戲
    const nextIdx = (curIdx + 1) % this.players.length;
    const nextPlayer = this.players[nextIdx];
    const round = await DB.createRound(
      this.roomId, this.currentRound.round_number + 1, nextPlayer.id
    );
    await DB.updateRoom(this.roomId, { current_round_id: round.id });
  },

  async endGame() {
    if (!this.isHost) return;
    if (!confirm('確定要結束遊戲嗎？')) return;
    await DB.updateRound(this.currentRound.id, { status: 'finished' });
    await DB.updateRoom(this.roomId, { status: 'finished' });
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

      onDisconnected: () => {
        showToast('⚠️ 網路連線中斷，嘗試重連中…', 'error', 8000);
      },

      onReconnected: async () => {
        showToast('✓ 已重新連線', 'success', 2500);
        try { await this.loadState(); } catch {}
      },

      onRoomUpdate: async room => {
        this.room   = room;
        this.isHost = room.host_player_id === this.myPlayerId;

        if (room.status !== 'waiting') this.stopLobbyPolling();

        if (room.current_round_id && room.current_round_id !== this.currentRound?.id) {
          const newRound = await DB.getRoundById(room.current_round_id);
          // 修正 B：await 期間若 onRoundChange 已處理同一 round，跳過覆蓋，避免 stale 資料蓋掉已正確設好的題目
          if (this.currentRound?.id === room.current_round_id) {
            this.render();
            return;
          }
          this.currentRound       = newRound;
          this.isSubject          = newRound.subject_player_id === this.myPlayerId;
          this.hasSubmittedAnswer = false;
          this.hasSubmittedGuess  = false;
          this.guesses            = [];
          if (newRound.question_id) {
            const q = await DB.getQuestionById(newRound.question_id);
            this.currentQuestion = normalizeQuestion(q);
          } else {
            this.currentQuestion = null;
          }
        }
        this.render();
      },

      onPlayersChange: async () => {
        // debounce 250ms：多人同時加入/修改時，合併成一次查詢
        clearTimeout(this._playersDebounceTimer);
        this._playersDebounceTimer = setTimeout(async () => {
          this.players = await DB.getPlayers(this.roomId);
          this.isHost  = this.room?.host_player_id === this.myPlayerId;
          this.render();
        }, 250);
      },

      onRoundChange: async payload => {
        const updated = payload.new;
        if (!updated || updated.room_id !== this.roomId) return;

        // 跳過 'finished' 狀態事件：回合切換由 onRoomUpdate 統一處理。
        // 防止 Realtime 事件亂序（舊 round 的 finished 事件晚於新 round 事件抵達）
        // 導致 currentRound / currentQuestion 被覆蓋回上一輪資料。
        if (updated.status === 'finished') return;

        // 若是新回合 INSERT，先重置 per-round 旗標
        // （避免 onRoomUpdate 尚未到達前舊旗標殘留）
        if (payload.eventType === 'INSERT') {
          this.hasSubmittedAnswer = false;
          this.hasSubmittedGuess  = false;
          this.guesses            = [];
        }

        const prevStatus     = this.currentRound?.status;
        const prevRoundId    = this.currentRound?.id;
        const prevQuestionId = this.currentRound?.question_id;
        this.currentRound    = updated;
        this.isSubject       = updated.subject_player_id === this.myPlayerId;

        if (updated.question_id) {
          // 同一題目不重複 fetch，減少不必要的 DB 讀取
          if (updated.question_id !== prevQuestionId || !this.currentQuestion) {
            const q = await DB.getQuestionById(updated.question_id);
            this.currentQuestion = normalizeQuestion(q);
          }
        } else if (payload.eventType === 'INSERT') {
          // INSERT 事件 question_id 為 null 是正常（題目尚未選）
          // 若 round id 與先前相同，代表同一 round 的 UPDATE 已先到並設好題目，INSERT 晚抵達，不清空
          if (updated.id !== prevRoundId) {
            this.currentQuestion = null;
          }
        } else {
          // UPDATE 但 question_id 為 null：若同一 round 且已有題目，保留不清空
          if (updated.id !== prevRoundId || !this.currentQuestion) {
            this.currentQuestion = null;
          }
        }

        if (updated.status === 'guessing' && prevStatus !== 'guessing') {
          this.guesses           = await DB.getGuesses(updated.id);
          this.hasSubmittedGuess = this.guesses.some(g => g.player_id === this.myPlayerId);
          RT.subscribeGuesses(updated.id, g => this._onNewGuess(g));
        }
        if (updated.status === 'revealing' && prevStatus !== 'revealing') {
          // 同時刷新分數，確保排名顯示正確
          const [guesses, players] = await Promise.all([
            DB.getGuesses(updated.id),
            DB.getPlayers(this.roomId),
          ]);
          this.guesses = guesses;
          this.players = players;
        }
        this.render();
      },
    });

    // ── 離線 / 上線標記 ──────────────────────────────────────────
    const patchOnlineStatus = (isOnline) => {
      if (!this.myPlayerId || !SUPABASE_URL || !SUPABASE_ANON_KEY) return;
      fetch(
        `${SUPABASE_URL}/rest/v1/players?id=eq.${encodeURIComponent(this.myPlayerId)}`,
        {
          method:    'PATCH',
          keepalive: true,
          headers: {
            'Content-Type':  'application/json',
            'apikey':        SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer':        'return=minimal',
          },
          body: JSON.stringify({ is_online: isOnline }),
        }
      ).catch(() => {});
    };

    // visibilitychange：切分頁 / 最小化時只標記離線，不移除訂閱
    // 回來時重新標記上線並 re-render，讓畫面與最新狀態同步
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') {
        patchOnlineStatus(false);
      } else {
        patchOnlineStatus(true);
        // 回來後從 DB 重新載入狀態，確保不遺漏期間的變化
        try { await this.loadState(); } catch {}
      }
    });
    // beforeunload：真正關閉分頁才移除訂閱
    window.addEventListener('beforeunload', () => {
      RT.unsubscribeAll();
      patchOnlineStatus(false);
    });
  },

  _onNewGuess(payload) {
    const guess = payload?.new;
    if (!guess) return;

    const idx = this.guesses.findIndex(g => g.id === guess.id);
    if (idx >= 0) this.guesses[idx] = guess;
    else this.guesses.push(guess);

    this.hasSubmittedGuess = this.guesses.some(g => g.player_id === this.myPlayerId);

    const total = this._getEligibleGuesserCount();
    const submitted = this._getEligibleGuessSubmittedCount();
    updateGuessProgress(submitted, total);

    // Auto-reveal when all players have submitted
    // 只在 guessing 階段觸發，避免 markGuessesCorrect 的 UPDATE 事件重複觸發
    if (this.isHost && submitted >= total && this.currentRound?.status === 'guessing') {
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

  _getEligibleGuesserCount() {
    if (!this.currentRound) return 0;

    const roundStart = this.currentRound.created_at ? new Date(this.currentRound.created_at).getTime() : null;

    return this.players.filter(p => {
      if (p.id === this.currentRound.subject_player_id) return false;
      if (!roundStart || !p.created_at) return true;
      return new Date(p.created_at).getTime() <= roundStart;
    }).length;
  },

  _getEligibleGuessSubmittedCount() {
    if (!this.currentRound) return 0;

    const roundStart = this.currentRound.created_at ? new Date(this.currentRound.created_at).getTime() : null;
    const eligibleIds = new Set(this.players.filter(p => {
      if (p.id === this.currentRound.subject_player_id) return false;
      if (!roundStart || !p.created_at) return true;
      return new Date(p.created_at).getTime() <= roundStart;
    }).map(p => p.id));

    return new Set(
      this.guesses
        .filter(g => eligibleIds.has(g.player_id))
        .map(g => g.player_id)
    ).size;
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
