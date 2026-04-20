// ================================================================
//  UI 工具函式
// ================================================================

// ── Toast ────────────────────────────────────────────────────────
let _toastTimer;

function showToast(msg, type = '', duration = 3000) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast'; el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = 'toast'; }, duration);
}

// ── Section switch ───────────────────────────────────────────────
let _currentSectionId = null;

function showSection(id) {
  if (_currentSectionId === id) return;
  if (_currentSectionId) {
    document.getElementById(_currentSectionId)?.classList.add('hidden');
  }
  _currentSectionId = id;
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    el.classList.add('animate-slide-up');
    setTimeout(() => el.classList.remove('animate-slide-up'), 600);
  }
}

// ── Copy ─────────────────────────────────────────────────────────
async function copyToClipboard(text, msg = '已複製！✓') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(msg, 'success');
  } catch {
    showToast('請手動複製連結', 'error');
  }
}

// ── HTML escape ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/[&<>"']/g,
    s => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[s]));
}

// ── Player list ──────────────────────────────────────────────────
function renderPlayerList(players, myId, hostId, subjectId, isHost) {
  const el = document.getElementById('player-list');
  if (!el) return;

  el.innerHTML = players.map(p => {
    const emoji    = getPlayerEmoji(p.join_order);
    const color    = getPlayerColor(p.join_order);
    const isMe     = p.id === myId;
    const isHostP  = p.id === hostId;
    const isSub    = subjectId && p.id === subjectId;

    return `
    <div class="player-row ${isMe ? 'is-me' : ''}">
      <div class="player-avatar ${p.is_online ? 'online' : 'offline'}"
           style="background:${color}">${emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-weight:800;font-size:14px;color:#374151">${escHtml(p.nickname)}</span>
          ${isMe    ? '<span class="badge badge-me">我</span>' : ''}
          ${isHostP ? '<span class="badge badge-host">👑 房主</span>' : ''}
          ${isSub   ? '<span class="badge badge-subject">🎯 被猜者</span>' : ''}
        </div>
        <div style="font-size:12px;font-weight:600;color:${p.is_online ? '#10B981' : '#9CA3AF'}">
          ${p.is_online ? '● 在線' : '○ 離線'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <span class="badge ${p.is_ready || isHostP ? 'badge-ready' : 'badge-waiting'}">
          ${p.is_ready || isHostP ? '✓ 準備' : '等待中'}
        </span>
        ${isHost && !isMe && !isHostP
          ? `<button class="btn-danger-sm"
               data-id="${escHtml(p.id)}"
               data-nick="${escHtml(p.nickname)}"
               onclick="GameApp.kickPlayer(this.dataset.id,this.dataset.nick)">踢</button>`
          : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Topic grid ───────────────────────────────────────────────────
/**
 * @param {boolean} isSubject - 是否為被猜者
 * @param {Array}   topics    - 從 DB 取得的主題陣列 [{ id, name }]
 */
function renderTopics(isSubject, topics = []) {
  const el = document.getElementById('topic-grid');
  if (!el) return;

  if (!isSubject) {
    el.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:48px 0">
        <div class="loading-dots" style="margin-bottom:14px">
          <span></span><span></span><span></span>
        </div>
        <p style="color:#A78BFA;font-weight:700;font-size:16px">等待選擇主題中…</p>
      </div>`;
    return;
  }

  if (!topics.length) {
    el.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#9CA3AF;padding:32px">載入主題中…</div>`;
    return;
  }

  el.innerHTML = topics.map((t, i) => {
    const ui = getTopicUi(t.name);
    return `
    <div class="topic-card animate-pop-in"
         style="background:${ui.gradient};animation-delay:${i * 0.07}s"
         onclick="GameApp.selectTopic('${t.id}')">
      <div style="font-size:38px;margin-bottom:8px">${ui.emoji}</div>
      <div style="color:white;font-weight:900;font-size:17px;
                  text-shadow:0 2px 8px rgba(0,0,0,.25)">${escHtml(t.name)}</div>
    </div>`;
  }).join('');
}

// ── Choice cards ─────────────────────────────────────────────────
function renderChoices(question, mode, selectedAnswer, containerId = 'choice-container', promptText = '') {
  const el = document.getElementById(containerId);
  if (!el || !question) return;

  const promptMap = {
    answer: '題目：你最喜歡哪一個？',
    guess: '題目：你覺得對方會選哪一個？',
  };

  const promptElIdMap = {
    'answer-choice-container': 'answer-question-prompt',
    'guess-choice-container': 'guess-question-prompt',
  };

  const promptEl = document.getElementById(promptElIdMap[containerId]);
  if (promptEl) promptEl.textContent = promptText || promptMap[mode] || '';

  const clickable = (mode === 'answer' || mode === 'guess');

  function card(letter, text) {
    const bg = letter === 'A'
      ? 'linear-gradient(135deg,#EDE9FE,#F3E8FF)'
      : 'linear-gradient(135deg,#FCE7F3,#FDF2F8)';
    const emoji = letter === 'A' ? '🅰️' : '🅱️';
    const sel   = selectedAnswer === letter;
    const cls   = `choice-card${clickable ? ' clickable' : ''}${sel ? ' selected' : ''}`;
    const click = clickable && !selectedAnswer
      ? `onclick="GameApp.handleChoiceClick('${letter}')"` : '';
    return `
      <div class="${cls}" style="background:${bg}" ${click}>
        <div style="font-size:40px;margin-bottom:12px">${emoji}</div>
        <div style="font-weight:800;font-size:20px;color:#374151;line-height:1.5">
          ${escHtml(text)}
        </div>
      </div>`;
  }

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      ${card('A', question.a)}
      ${card('B', question.b)}
    </div>`;
}

// ── Reveal results ───────────────────────────────────────────────
function renderReveal(question, correctAnswer, guesses, nonSubjectPlayers) {
  const el = document.getElementById('reveal-body');
  if (!el) return;

  const answerText  = correctAnswer === 'A' ? question.a : question.b;
  const answerEmoji = correctAnswer === 'A' ? '🅰️' : '🅱️';
  // 同樣直接用 guess 比對，避免依賴非同步寫入的 is_correct 欄位
  const correctCount = guesses.filter(g => g.guess === correctAnswer).length;

  const rows = nonSubjectPlayers.map((p, i) => {
    const g       = guesses.find(x => x.player_id === p.id);
    // 直接比對 guess 與 correctAnswer，不依賴 DB 的 is_correct 欄位
    const correct = g ? g.guess === correctAnswer : false;
    const guessed = g?.guess === 'A' ? 'A' : (g?.guess === 'B' ? 'B' : 'none');
    const guessedLabel = g?.guess === 'A' ? 'A 選項' : (g?.guess === 'B' ? 'B 選項' : '未作答');
    return `
      <div class="player-row ${correct ? 'is-correct' : 'is-wrong'} animate-slide-up"
           style="animation-delay:${i * 0.08}s">
        <div class="player-avatar" style="background:${getPlayerColor(p.join_order)}">
          ${getPlayerEmoji(p.join_order)}
        </div>
        <div style="flex:1">
          <div style="font-weight:800;font-size:14px">${escHtml(p.nickname)}</div>
          <div style="font-size:12px;color:#9CA3AF">
            猜測：<span class="guess-chip ${guessed}">${guessedLabel}</span>
          </div>
        </div>
        <div style="font-size:26px">${correct ? '✅' : '❌'}</div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="text-align:center;margin-bottom:20px" class="animate-bounce-in">
      <div style="font-size:60px;margin-bottom:8px">${answerEmoji}</div>
      <div style="font-weight:900;font-size:20px;color:#374151;line-height:1.45">
        ${escHtml(answerText)}
      </div>
      <div style="margin-top:10px;background:linear-gradient(135deg,#EDE9FE,#FCE7F3);
                  border-radius:999px;display:inline-block;
                  padding:4px 16px;font-size:13px;font-weight:800;color:#7C3AED">
        🎉 ${correctCount} / ${nonSubjectPlayers.length} 人猜對！
      </div>
    </div>
    ${rows}`;
}

// ── Scoreboard ──────────────────────────────────────────────────
function renderScoreboard(players) {
  const el = document.getElementById('reveal-scoreboard');
  if (!el) return;
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const medals = ['🥇', '🥈', '🥉'];
  el.innerHTML = sorted.map((p, i) => `
    <div class="player-row animate-slide-up" style="animation-delay:${i * 0.06}s">
      <div style="font-size:20px;width:28px;text-align:center;flex-shrink:0">
        ${medals[i] ?? `${i + 1}.`}
      </div>
      <div class="player-avatar" style="background:${getPlayerColor(p.join_order)}">
        ${getPlayerEmoji(p.join_order)}
      </div>
      <div style="flex:1;font-weight:800;font-size:14px">${escHtml(p.nickname)}</div>
      <div style="font-weight:900;color:#7C3AED;font-size:16px">${p.score} 分</div>
    </div>`).join('');
}

// ── Guess progress ───────────────────────────────────────────────
function updateGuessProgress(submitted, total) {
  const fill = document.getElementById('guess-progress-fill');
  const text = document.getElementById('guess-progress-text');
  if (fill) fill.style.width = `${total > 0 ? (submitted / total) * 100 : 0}%`;
  if (text) text.textContent = `${submitted} / ${total} 人已提交`;
}
