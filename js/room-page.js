// ================================================================
//  room.html 遊戲主控制器（Socket.io 版）
//  normalizeQuestion 定義於 questions.js，請勿在此重複宣告
// ================================================================

const GameApp = {

  // ── State ─────────────────────────────────────────────────────
  myPlayerId:           '',
  myNickname:           '',
  roomId:               '',
  room:                 null,
  players:              [],
  topics:               [],
  currentRound:         null,
  currentQuestion:      null,
  guesses:              [],         // 揭曉後才有完整內容
  _myCurrentGuess:      null,       // 本回合自己的猜測（樂觀更新）
  _guessSubmitted:      0,          // 猜測進度（由 guess_progress 事件更新）
  _guessTotal:          0,
  _guessSubmittedIds:   [],         // 已提交猜測的玩家 ID 列表
  _revealAnimDone:      false,      // 揭曉動畫是否已播放
  _previewQuestion:     null,       // 被猜者預覽的題目
  _previewSwapCount:    0,          // 已換題次數
  _previewSwapLimit:    3,          // 換題上限
  isSubject:            false,
  isHost:               false,
  hasSubmittedAnswer:   false,
  hasSubmittedGuess:    false,
  _renderTimer:         null,
  _listenersAttached:   false,

  // ── Init ──────────────────────────────────────────────────────
  async init() {
    const params = new URLSearchParams(window.location.search);
    this.roomId  = (params.get('id') || '').toUpperCase();
    console.log('[GameApp] ===== init START =====');
    console.log('[GameApp] window.location.href:', window.location.href);
    console.log('[GameApp] window.location.search:', window.location.search);
    console.log('[GameApp] init - roomId:', this.roomId);
    if (!this.roomId) {
      console.error('[GameApp] ❌ roomId 是空的，重導向到 index.html');
      window.location.href = 'index.html';
      return;
    }

    this.myPlayerId = getOrCreatePlayerId();
    console.log('[GameApp] playerId:', this.myPlayerId);

    if (!SOCKET_SERVER_URL) { this.showConfigError(); return; }
    console.log('[GameApp] SOCKET_SERVER_URL:', SOCKET_SERVER_URL);

    this.setupSocketListeners();

    const urlNickname   = params.get('nickname');
    const savedNickname = getSavedNickname();
    const nickname      = urlNickname || savedNickname;
    console.log('[GameApp] nickname:', nickname);

    if (nickname) {
      this.connectAndJoin(nickname);
    } else {
      this.hideLoading();
      this.showNicknameOverlay();
    }
  },

  connectAndJoin(nickname) {
    this.showLoading('連線中…');
    this.myNickname = nickname;
    saveNickname(nickname);
    console.log('[Socket] 發送 join_room:', { roomId: this.roomId, playerId: this.myPlayerId, nickname });
    socket.emit('join_room', {
      roomId:   this.roomId,
      playerId: this.myPlayerId,
      nickname,
    });
  },

  // ── Socket 事件監聽 ───────────────────────────────────────────
  setupSocketListeners() {
    if (this._listenersAttached) return;
    this._listenersAttached = true;

    // ── 加入成功：收到完整房間狀態 ──────────────────────────────
    socket.on('room_state', state => {
      console.log('[Socket] ✅ room_state 收到:', state);
      this._onRoomState(state);
    });

    // ── 加入失敗 ────────────────────────────────────────────────
    socket.on('join_error', ({ message }) => {
      console.error('[Socket] ❌ join_error:', message);
      this.hideLoading();
      this.showNicknameOverlay(message);
    });

    // ── 玩家列表變動 ─────────────────────────────────────────────
    socket.on('players_updated', ({ players }) => {
      this.players = players;
      this.isHost  = this.room?.host_player_id === this.myPlayerId;
      this.render();
    });

    // ── 遊戲開始 ─────────────────────────────────────────────────
    socket.on('game_started', ({ room, currentRound }) => {
      this.room             = room;
      this.isHost           = room.host_player_id === this.myPlayerId;
      this.currentRound     = currentRound;
      this.currentQuestion  = null;
      this.isSubject        = currentRound.subject_player_id === this.myPlayerId;
      this.hasSubmittedAnswer = false;
      this.hasSubmittedGuess  = false;
      this._myCurrentGuess  = null;
      this._guessSubmitted  = 0;
      this._guessTotal      = 0;
      this._guessSubmittedIds = [];
      this._revealAnimDone  = false;
      this._previewQuestion = null;
      this._previewSwapCount = 0;
      this.guesses          = [];
      this.render();
    });

    // ── 回合狀態更新（選主題 → 選答案 → 猜測 → 下一回合）────────
    socket.on('round_updated', ({ currentRound, currentQuestion }) => {
      const isNewRound = currentRound.id !== this.currentRound?.id;

      this.currentRound = currentRound;
      this.isSubject    = currentRound.subject_player_id === this.myPlayerId;

      // currentQuestion 可能為 null（新回合）或題目物件
      if (currentQuestion !== undefined) {
        this.currentQuestion = currentQuestion;
      }

      if (isNewRound) {
        this.hasSubmittedAnswer = false;
        this.hasSubmittedGuess  = false;
        this._myCurrentGuess  = null;
        this._guessSubmitted  = 0;
        this._guessTotal      = 0;
        this._guessSubmittedIds = [];
        this._revealAnimDone  = false;
        this._previewQuestion = null;
        this._previewSwapCount = 0;
        this.guesses          = [];
      }

      this.render();
    });

    // ── 猜測進度（即時更新進度條）───────────────────────────────
    socket.on('guess_progress', ({ submitted, total, submittedIds }) => {
      this._guessSubmitted = submitted;
      this._guessTotal     = total;
      this._guessSubmittedIds = submittedIds || [];
      updateGuessProgress(submitted, total);
      this._renderGuessPlayerList();
    });

    // ── 揭曉結果（含完整答案）───────────────────────────────────
    socket.on('round_revealed', ({ currentRound, guesses, players }) => {
      this.currentRound = currentRound;
      this.guesses      = guesses;
      this.players      = players;
      this.render();
      const myGuess = guesses.find(g => g.player_id === this.myPlayerId);
      if (myGuess && myGuess.guess === currentRound.subject_answer && !this.isSubject) {
        this._confetti();
      }
    });

    // ── 遊戲結束 ─────────────────────────────────────────────────
    socket.on('game_finished', ({ room, players }) => {
      this.room    = room;
      this.players = players;
      this.render();
    });

    // ── 重新開始 ─────────────────────────────────────────────────
    socket.on('game_restarted', ({ room, players }) => {
      this.room             = room;
      this.players          = players;
      this.currentRound     = null;
      this.currentQuestion  = null;
      this.guesses          = [];
      this.hasSubmittedAnswer = false;
      this.hasSubmittedGuess  = false;
      this._myCurrentGuess  = null;
      this._guessSubmitted  = 0;
      this._guessTotal      = 0;
      this._guessSubmittedIds = [];
      this._revealAnimDone  = false;
      this._previewQuestion = null;
      this._previewSwapCount = 0;
      this.render();
    });

    // ── 被猜者預覽題目（Task 1）──────────────────────────────────
    socket.on('preview_question', ({ question, swapCount, swapLimit }) => {
      this._previewQuestion  = question;
      this._previewSwapCount = swapCount;
      this._previewSwapLimit = swapLimit;
      this._renderPreviewQuestion();
    });

    // ── Emoji 反應廣播（Task 5）──────────────────────────────────
    socket.on('reaction_broadcast', ({ emoji, nickname }) => {
      this._showFloatingReaction(emoji, nickname);
    });

    // ── 答案被後端接受（只通知被猜者）───────────────────────────
    socket.on('answer_accepted', ({ answer }) => {
      this.hasSubmittedAnswer = true;
      renderChoices(this.currentQuestion, 'answer', answer, 'answer-choice-container');
      showToast('✓ 答案已送出！', 'success');
    });

    // ── 被踢出房間 ───────────────────────────────────────────────
    socket.on('you_were_kicked', () => {
      showToast('你已被房主踢出房間 😢', 'error', 5000);
      setTimeout(() => { window.location.href = 'index.html'; }, 2500);
    });

    // ── 一般錯誤訊息 ─────────────────────────────────────────────
    socket.on('error', ({ message }) => {
      showToast('❌ ' + message, 'error');
    });

    // ── 連線/斷線狀態 ────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.warn('[Socket] 斷線:', reason);
      showToast('⚠️ 連線中斷，嘗試重連中…', 'error', 8000);
    });

    socket.on('connect', () => {
      console.log('[Socket] ✅ 已連線 id:', socket.id);
      // Socket.io 自動重連後，重新加入房間取得最新狀態
      if (this.myNickname && this.roomId) {
        showToast('✓ 已重新連線', 'success', 2500);
        socket.emit('join_room', {
          roomId:   this.roomId,
          playerId: this.myPlayerId,
          nickname: this.myNickname,
        });
      }
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] 連線錯誤:', err.message);
    });

    // ── 頁面可見性 ───────────────────────────────────────────────
    document.addEventListener('visibilitychange', () => {
      socket.emit('set_online', {
        isOnline: document.visibilityState !== 'hidden',
      });
    });

    window.addEventListener('beforeunload', () => {
      socket.emit('set_online', { isOnline: false });
    });
  },

  _onRoomState(state) {
    this.room            = state.room;
    this.players         = state.players;
    this.topics          = state.topics || [];
    this.currentRound    = state.currentRound;
    this.currentQuestion = state.currentQuestion;
    this.guesses         = state.guesses || [];
    this.isHost          = state.room.host_player_id === this.myPlayerId;
    this.isSubject       = state.currentRound?.subject_player_id === this.myPlayerId;

    const rndStatus = state.currentRound?.status;
    if (['guessing', 'revealing'].includes(rndStatus)) {
      this.hasSubmittedGuess = this.guesses.some(g => g.player_id === this.myPlayerId);
      // 從 guesses 恢復本人的猜測選擇
      const mine = this.guesses.find(g => g.player_id === this.myPlayerId);
      if (mine) this._myCurrentGuess = mine.guess;
    }
    if (rndStatus === 'selecting_answer' && this.isSubject) {
      this.hasSubmittedAnswer = !!state.currentRound.subject_answer;
    }

    this.hideLoading();
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
      if      (rnd === 'selecting_topic')    this._renderSelectingTopic();
      else if (rnd === 'previewing_question') this._renderPreviewingQuestion();
      else if (rnd === 'selecting_answer')   this._renderSelectingAnswer();
      else if (rnd === 'guessing')         this._renderGuessing();
      else if (rnd === 'revealing')        this._renderRevealing();
    } else if (rs === 'finished') {
      this._renderFinished();
    }
  },

  _updateHeader() {
    const elId   = document.getElementById('header-room-id');
    const elCnt  = document.getElementById('header-player-count');
    const elRnd  = document.getElementById('header-round');
    const elRndW = document.getElementById('header-round-wrapper');

    if (elId)  elId.textContent  = this.roomId;
    if (elCnt) elCnt.textContent = `${this.players.length}/${this.room?.max_players ?? '?'}`;

    if (this.currentRound && this.room?.status === 'playing') {
      if (elRnd)  elRnd.textContent = `第 ${this.currentRound.round_number} 回合`;
      if (elRndW) elRndW.style.display = 'flex';
    } else {
      if (elRndW) elRndW.style.display = 'none';
    }

    // Update host name in header
    const hostWrapper = document.getElementById('header-host-wrapper');
    const hostNameEl = document.getElementById('header-host-name');
    if (hostWrapper && hostNameEl) {
      const hostPlayer = this.players.find(p => p.id === this.room?.host_player_id);
      if (hostPlayer) {
        hostNameEl.textContent = hostPlayer.nickname;
        hostWrapper.style.display = 'flex';
      }
    }
  },

  _renderLobby() {
    showSection('section-lobby');

    const shareEl = document.getElementById('share-url');
    if (shareEl) shareEl.textContent = `${location.origin}${location.pathname}?id=${this.roomId}`;

    renderPlayerList(this.players, this.myPlayerId, this.room.host_player_id, null, this.isHost);

    const allReady   = this.players.length >= 1 &&
      this.players.every(p => p.is_ready || p.id === this.room.host_player_id);
    const me         = this.players.find(p => p.id === this.myPlayerId);
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
    if (whoEl) whoEl.textContent = this.isSubject
      ? '選擇你最想聊的主題！'
      : `等待 ${subject?.nickname ?? '??'} 選主題…`;
    renderTopics(this.isSubject, this.topics);
  },

  _renderSelectingAnswer() {
    showSection('section-answer');
    const subject   = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const topicName = this.currentRound.topic_name;

    // Update header text based on role
    const headerText = document.getElementById('answer-header-text');
    if (headerText) {
      headerText.textContent = this.isSubject
        ? '選擇你的答案！'
        : `${subject?.nickname ?? '??'} 正在悄悄作答…`;
    }

    const badge = document.getElementById('answer-topic-badge');
    const nameEl = document.getElementById('answer-topic-name');
    if (badge && nameEl && topicName) {
      nameEl.textContent = topicName;
      badge.style.display = '';
    }

    if (this.isSubject) {
      document.getElementById('answer-waiting')?.classList.add('hidden');
      document.getElementById('answer-choices')?.classList.remove('hidden');
      if (!this.hasSubmittedAnswer) {
        renderChoices(this.currentQuestion, 'answer', null, 'answer-choice-container');
      }
    } else {
      // 非被猜者：若題目已載入則顯示題目（唯讀），否則顯示等待畫面
      if (this.currentQuestion) {
        document.getElementById('answer-waiting')?.classList.add('hidden');
        document.getElementById('answer-choices')?.classList.remove('hidden');
        renderChoices(
          this.currentQuestion, 'view', null, 'answer-choice-container',
          `等待 ${subject?.nickname ?? '??'} 悄悄作答，先看看題目吧！`
        );
      } else {
        document.getElementById('answer-choices')?.classList.add('hidden');
        document.getElementById('answer-waiting')?.classList.remove('hidden');
        const waitName = document.getElementById('answer-waiting-name');
        if (waitName) waitName.textContent = subject?.nickname ?? '??';
      }
    }
  },

  _renderGuessing() {
    showSection('section-guess');
    const subject   = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const topicName = this.currentRound.topic_name;

    const nameEl = document.getElementById('guess-subject-name');
    if (nameEl) nameEl.textContent = subject?.nickname ?? '??';

    const badge    = document.getElementById('guess-topic-badge');
    const topicEl  = document.getElementById('guess-topic-name');
    if (badge && topicEl && topicName) {
      topicEl.textContent = topicName;
      badge.style.display = '';
    }

    // 進度由 guess_progress 事件即時更新，這裡用快取值做初始渲染
    updateGuessProgress(this._guessSubmitted, this._guessTotal);

    if (this.isSubject) {
      document.getElementById('guess-choices')?.classList.add('hidden');
      document.getElementById('guess-subject-waiting')?.classList.remove('hidden');
    } else {
      document.getElementById('guess-subject-waiting')?.classList.add('hidden');
      document.getElementById('guess-choices')?.classList.remove('hidden');

      const statusEl = document.getElementById('guess-status-text');
      if (statusEl) {
        statusEl.textContent = this.hasSubmittedGuess
          ? '✓ 已提交，可在揭曉前改選'
          : '點選你的答案（揭曉前可改選）';
      }

      renderChoices(
        this.currentQuestion, 'guess', this._myCurrentGuess,
        'guess-choice-container'
      );
      this._renderGuessPlayerList();
    }
  },

  _renderRevealing() {
    showSection('section-reveal');
    const subject    = this.players.find(p => p.id === this.currentRound.subject_player_id);
    const nonSubject = this.players.filter(p => p.id !== this.currentRound.subject_player_id);
    const topicName  = this.currentRound.topic_name;

    const nameEl = document.getElementById('reveal-subject-name');
    if (nameEl) nameEl.textContent = subject?.nickname ?? '??';

    const badge   = document.getElementById('reveal-topic-badge');
    const topicEl = document.getElementById('reveal-topic-name');
    if (badge && topicEl && topicName) {
      topicEl.textContent = topicName;
      badge.style.display = '';
    }

    const nextBtn = document.getElementById('reveal-next-btn');
    if (nextBtn) nextBtn.style.display = 'none';
    const endBtn = document.getElementById('reveal-end-btn');
    if (endBtn) endBtn.style.display = 'none';

    const bodyEl  = document.getElementById('reveal-body');
    const scoreEl = document.getElementById('reveal-scoreboard');
    if (bodyEl)  bodyEl.innerHTML  = '';
    if (scoreEl) scoreEl.innerHTML = '';

    // Skip countdown if already revealed (re-render after round_revealed)
    if (this._revealAnimDone) {
      this._showRevealFinal(nonSubject);
      return;
    }

    this._revealAnimDone = true;
    let count = 3;
    const tick = () => {
      if (bodyEl) {
        bodyEl.innerHTML = `
          <div class="text-center" style="padding:40px 0">
            <div class="reveal-countdown">${count}</div>
            <div class="text-body" style="font-size:15px;margin-top:8px">答案即將揭曉…</div>
          </div>`;
      }
      count--;
      if (count >= 0) {
        setTimeout(tick, 1000);
      } else {
        // Phase 2: show count stats
        const correct = this.guesses.filter(g => g.guess === this.currentRound.subject_answer).length;
        const wrong   = nonSubject.length - correct;
        if (bodyEl) {
          bodyEl.innerHTML = `
            <div class="text-center animate-bounce-in" style="padding:32px 16px">
              <div style="font-size:52px;margin-bottom:12px">📊</div>
              <div class="reveal-stat-row">
                <div class="reveal-stat-box reveal-stat-box--success">
                  <div class="reveal-stat-number" style="color:var(--success-fg)">${correct}</div>
                  <div class="reveal-stat-label" style="color:var(--success-fg)">猜對 ✅</div>
                </div>
                <div class="reveal-stat-box reveal-stat-box--error">
                  <div class="reveal-stat-number" style="color:var(--error-fg)">${wrong}</div>
                  <div class="reveal-stat-label" style="color:var(--error-fg)">猜錯 ❌</div>
                </div>
              </div>
            </div>`;
        }
        // Phase 3: show full results after 1.5s
        setTimeout(() => this._showRevealFinal(nonSubject), 1500);
      }
    };
    setTimeout(tick, 100);
  },

  _showRevealFinal(nonSubject) {
    renderReveal(this.currentQuestion, this.currentRound.subject_answer, this.guesses, nonSubject);
    renderScoreboard(this.players);
    const nextBtn = document.getElementById('reveal-next-btn');
    if (nextBtn) nextBtn.style.display = this.isHost ? '' : 'none';
    const endBtn = document.getElementById('reveal-end-btn');
    if (endBtn) endBtn.style.display = this.isHost ? '' : 'none';
    const waitEl = document.getElementById('reveal-waiting-next');
    if (waitEl) waitEl.textContent = this.isHost ? '' : '等待房主進入下一回合…';
  },

  _renderPreviewingQuestion() {
    showSection('section-preview');
    const subject = this.players.find(p => p.id === this.currentRound.subject_player_id);

    if (this.isSubject) {
      document.getElementById('preview-waiting-view')?.classList.add('hidden');
      document.getElementById('preview-subject-view')?.classList.remove('hidden');
      this._renderPreviewQuestion();
    } else {
      document.getElementById('preview-subject-view')?.classList.add('hidden');
      document.getElementById('preview-waiting-view')?.classList.remove('hidden');
      const nameEl = document.getElementById('preview-waiting-name');
      if (nameEl) nameEl.textContent = subject?.nickname ?? '??';
    }
  },

  _renderPreviewQuestion() {
    if (!this._previewQuestion) return;
    const swapLeft = (this._previewSwapLimit ?? 2) - (this._previewSwapCount ?? 0);
    const swapBtn  = document.getElementById('preview-swap-btn');
    const leftEl   = document.getElementById('preview-swap-left');
    if (leftEl) leftEl.textContent = swapLeft;
    if (swapBtn) swapBtn.disabled = swapLeft <= 0;

    renderChoices(this._previewQuestion, 'view', null, 'preview-choice-container');
  },

  _renderGuessPlayerList() {
    const el = document.getElementById('guess-player-list');
    if (!el) return;
    const nonSubject = this.players.filter(p => p.id !== this.currentRound?.subject_player_id);
    el.innerHTML = nonSubject.map(p => {
      const submitted = this._guessSubmittedIds.includes(p.id);
      const isMe = p.id === this.myPlayerId;
      return `<div class="guess-status-item">
        <span class="guess-status-icon">${submitted ? '✅' : '⏳'}</span>
        <span class="${submitted ? 'guess-status-name--done' : 'guess-status-name--pending'}">${escHtml(p.nickname)}${isMe ? ' (我)' : ''}</span>
      </div>`;
    }).join('');
  },

  _renderFinished() {
    showSection('section-finished');
    this._confetti();

    const sorted   = [...this.players].sort((a, b) => b.score - a.score);
    const medals   = ['🥇', '🥈', '🥉'];
    const scoresEl = document.getElementById('finished-scores');
    if (scoresEl) {
      scoresEl.innerHTML = sorted.map((p, i) => `
        <div class="player-row ${i === 0 ? 'is-correct' : ''} animate-slide-up"
             style="animation-delay:${i * 0.08}s">
          <div class="medal-col medal-col--lg">
            ${medals[i] ?? `${i + 1}.`}
          </div>
          <div class="player-avatar" style="background:${getPlayerColor(p.join_order)}">
            ${getPlayerEmoji(p.join_order)}
          </div>
          <div class="player-name player-name--lg" style="flex:1">${escHtml(p.nickname)}</div>
          <div class="player-score">${p.score} 分</div>
        </div>`).join('');
    }

    const restartBtn = document.getElementById('finished-restart-btn');
    if (restartBtn) restartBtn.style.display = this.isHost ? '' : 'none';
  },

  // ── Actions（全部改為 socket.emit）────────────────────────────

  toggleReady() {
    socket.emit('toggle_ready');
  },

  startGame() {
    if (!this.isHost) return;
    if (this.players.length < 1) { showToast('至少需要1位玩家！', 'error'); return; }
    socket.emit('start_game');
  },

  selectTopic(topicId) {
    if (!this.isSubject) return;
    socket.emit('select_topic', { topicId });
  },

  handleChoiceClick(letter) {
    if (!this.currentRound) return;
    const status = this.currentRound.status;
    if (status === 'selecting_answer' && this.isSubject && !this.hasSubmittedAnswer) {
      socket.emit('submit_answer', { answer: letter });
    } else if (status === 'guessing' && !this.isSubject) {
      this._submitGuessOptimistic(letter);
    }
  },

  _submitGuessOptimistic(guess) {
    // 樂觀更新 UI，不等伺服器回應
    this._myCurrentGuess  = guess;
    this.hasSubmittedGuess = true;
    renderChoices(this.currentQuestion, 'guess', guess, 'guess-choice-container');
    const statusEl = document.getElementById('guess-status-text');
    if (statusEl) statusEl.textContent = '✓ 已提交，可在揭曉前改選';
    showToast('已提交猜測！', 'success');
    socket.emit('submit_guess', { guess });
  },

  nextRound() {
    if (!this.isHost) return;
    socket.emit('next_round');
  },

  endGame() {
    if (!this.isHost) return;
    if (!confirm('確定要結束遊戲嗎？')) return;
    socket.emit('end_game');
  },

  kickPlayer(playerId, nickname) {
    if (!this.isHost) return;
    if (!confirm(`確定要踢出 ${nickname}？`)) return;
    socket.emit('kick_player', { targetPlayerId: playerId });
  },

  restartGame() {
    if (!this.isHost) return;
    socket.emit('restart_game');
  },

  copyLink() {
    const url = `${location.origin}${location.pathname}?id=${this.roomId}`;
    copyToClipboard(url, '房間連結已複製 🔗');
  },

  // ── Task 1: Preview question actions ─────────────────────────
  swapQuestion() {
    if (!this.isSubject) return;
    socket.emit('swap_question');
  },

  confirmQuestion() {
    if (!this.isSubject) return;
    socket.emit('confirm_question');
  },

  // ── Task 5: Emoji reactions ───────────────────────────────────
  sendReaction(emoji) {
    socket.emit('send_reaction', { emoji });
  },

  _showFloatingReaction(emoji, nickname) {
    const container = document.getElementById('reaction-container');
    if (!container) return;
    const el = document.createElement('div');
    const x = 10 + Math.random() * 80;
    el.style.cssText = `
      position:absolute;
      bottom:20%;
      left:${x}%;
      font-size:40px;
      animation:float-up 2s ease-out forwards;
      pointer-events:none;
      text-align:center;
      line-height:1;
    `;
    el.innerHTML = `${emoji}<div style="font-size:11px;color:var(--accent);font-weight:400;margin-top:2px">${escHtml(nickname)}</div>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), 2100);
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
      colors: ['#8B5CF6', '#E11D48', '#FBBF24', '#10B981', '#60A5FA'],
    });
  },
};

// ── 頁面啟動 ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => GameApp.init());

// ── 暱稱 Overlay 提交（HTML onclick 呼叫）────────────────────────
function submitNickname() {
  const inp = document.getElementById('overlay-nickname');
  const nickname = inp?.value.trim();
  if (!nickname) {
    inp?.classList.add('animate-shake');
    setTimeout(() => inp?.classList.remove('animate-shake'), 500);
    showToast('請輸入你的暱稱！', 'error');
    return;
  }
  document.getElementById('nickname-overlay')?.classList.add('hidden');
  GameApp.connectAndJoin(nickname);
}
