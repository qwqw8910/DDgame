<template>
    <div class="page-wrapper page-wrapper--scrollable cs-room-page">
        <a href="#cs-main-content" class="skip-link">跳到主要內容</a>

        <!-- Header -->
        <header class="sticky-header app-header--room">
            <div class="header-inner header-inner--room">
                <button class="header-back-btn" @click="goHome" title="返回首頁" aria-label="返回首頁">
                    ← 返回
                </button>
                <span class="logo-sm">默契傳聲筒 🔡</span>
                <div class="header-info">
                    <span class="header-room-id">{{ roomState.roomId }}</span>
                    <span style="font-size:12px;color:var(--body)">{{ playersWithRoles.length }}/{{
                        roomState.room?.maxPlayers ?? '?' }} 人</span>
                </div>
                <div style="display:flex;gap:6px;align-items:center">
                    <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                        :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost" @kick="handleKick"
                        @transfer-host="handleTransferHost" />
                    <button class="header-icon-btn" title="切換主題" aria-label="切換主題" @click="toggleTheme">{{ isDark ? '🌙'
                        : '☀️' }}</button>
                    <button class="header-icon-btn" :title="isSfxMuted ? '開啟音效' : '關閉音效'"
                        :aria-label="isSfxMuted ? '開啟音效' : '關閉音效'" @click="toggleSfxMute">
                        {{ isSfxMuted ? '🔇' : '🔊' }}
                    </button>
                    <button class="header-icon-btn" title="複製邀請連結" aria-label="複製邀請連結"
                        @click="handleCopyLink">🔗</button>
                </div>
            </div>
        </header>

        <!-- Loading -->
        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <div class="loading-icon">🔡</div>
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <!-- 暱稱遮罩（無暱稱時顯示） -->
        <div v-else-if="showNicknameOverlay" class="overlay">
            <div class="overlay-card">
                <div class="section-header" style="margin-bottom:16px">
                    <div class="section-icon">👤</div>
                    <h2 class="neon-heading" style="font-size:20px">輸入你的暱稱</h2>
                    <p class="section-subtitle">讓朋友知道你是誰！</p>
                </div>
                <div v-if="nicknameError" class="error-alert">{{ nicknameError }}</div>
                <div class="input-wrapper" style="margin-bottom:12px">
                    <span class="input-icon">✏️</span>
                    <input v-model="overlayNickname" ref="overlayInputRef" class="game-input" type="text"
                        placeholder="你的暱稱…" maxlength="12" aria-label="暱稱" autocomplete="off" autocorrect="off"
                        autocapitalize="off" spellcheck="false" @keydown.enter="joinWithNickname" />
                </div>
                <button class="btn-primary" @click="joinWithNickname">
                    加入房間 🚀
                </button>
            </div>
        </div>

        <!-- 遊戲主畫面 -->
        <main v-else-if="roomState.room" id="cs-main-content" class="main-content main-content--room"
            :class="{ 'main-content--game': isGamePhase, 'main-content--lobby': !isGamePhase }">

            <!-- ── 大廳 ── -->
            <div v-if="state.status === 'waiting'" class="game-card animate-slide-up">
                <div class="section-header">
                    <div class="section-icon">🏠</div>
                    <h2 class="neon-heading" style="font-size:22px">等待玩家加入</h2>
                    <p class="section-subtitle">需要 {{ minPlayersRequired }} ～ {{ roomState.room.maxPlayers }} 人才能開始</p>
                </div>

                <!-- 房間碼 + 分享 -->
                <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:16px 0 24px">
                    <div style="font-size:28px;font-weight:700;letter-spacing:6px;
                                color:var(--neon-cyan);font-family:'Source Code Pro',monospace">
                        {{ roomState.roomId }}
                    </div>
                    <button class="header-icon-btn" style="font-size:18px" title="複製邀請連結" aria-label="複製邀請連結"
                        @click="handleCopyLink">🔗</button>
                </div>

                <!-- 玩家列表 -->
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
                    <div v-for="p in playersWithRoles" :key="p.id" style="display:flex;align-items:center;justify-content:space-between;
                               padding:10px 14px;border-radius:10px;
                               background:var(--bg-subtle);border:1px solid var(--border)">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span>{{ (p.is_online ?? p.connected) ? '🟢' : '🔴' }}</span>
                            <span style="font-weight:500;color:var(--heading)">{{ p.nickname }}</span>
                            <span v-if="p.id === roomState.room.hostId" class="badge" style="font-size:11px;background:rgba(6,182,212,0.15);
                                color:var(--neon-cyan);border:1px solid rgba(6,182,212,0.3)">房主</span>
                            <span v-if="p.id === roomState.myPlayerId" class="badge" style="font-size:11px">我</span>
                        </div>
                    </div>
                </div>

                <!-- 人數不足提示 -->
                <p v-if="playersWithRoles.length < minPlayersRequired"
                    style="text-align:center;font-size:13px;color:var(--body);margin-bottom:16px">
                    還需要 {{ Math.max(minPlayersRequired - playersWithRoles.length, 0) }} 人才能開始
                </p>

                <!-- 開始按鈕（僅房主） -->
                <button v-if="roomState.isHost" class="btn-primary"
                    style="width:100%;background:linear-gradient(135deg,#0891B2,#06B6D4);border-color:rgba(6,182,212,0.4)"
                    :disabled="playersWithRoles.length < minPlayersRequired" @click="handleStartGame">
                    開始遊戲 🚀
                </button>
                <p v-if="roomState.isHost && playersWithRoles.length < minPlayersRequired"
                    style="text-align:center;font-size:12px;color:var(--label);margin-top:8px">
                    目前人數不足，無法開始
                </p>
                <p v-else style="text-align:center;font-size:14px;color:var(--body)">等待房主開始遊戲…</p>
            </div>

            <!-- ── 遊戲進行中（統一左右排版）── -->
            <div v-else-if="isGamePhase" class="cs-game-layout">

                <!-- ── 左側面板：階段+進度 / 玩家列表 / 退出 ── -->
                <div class="cs-left-panel">

                    <!-- 左上：階段 + 進度 -->
                    <div class="game-card cs-phase-card" aria-live="polite">
                        <p class="cs-phase-title">{{ phaseLabel }}</p>
                        <div v-if="phaseTotal > 0" class="cs-progress-track" role="progressbar" :aria-valuemin="0"
                            :aria-valuemax="phaseTotal" :aria-valuenow="phaseSubmitted"
                            :aria-label="`提交進度 ${phaseSubmitted}/${phaseTotal}`">
                            <div class="cs-progress-fill" :style="{ width: `${phaseProgressPct}%` }"></div>
                        </div>
                        <p v-if="phaseTotal > 0" class="cs-phase-progress">
                            已提交 {{ phaseSubmitted }}/{{ phaseTotal }}
                        </p>
                        <p v-else class="cs-phase-progress">{{ phaseHintText }}</p>
                    </div>

                    <!-- 左下：玩家列表 -->
                    <div class="game-card cs-player-list-card">
                        <p class="cs-card-label" style="margin-bottom:8px">玩家列表</p>
                        <ul class="cs-player-list">
                            <li v-for="p in playersWithRoles" :key="p.id" class="cs-player-list-item"
                                :class="{ 'cs-player-list-item--self': p.id === roomState.myPlayerId }">
                                <span class="cs-player-list-dot"
                                    :class="(p.is_online ?? p.connected) ? 'is-online' : 'is-offline'"></span>
                                <span class="cs-player-list-name">{{ p.nickname }}</span>
                                <span v-if="p.id === roomState.myPlayerId" class="cs-player-list-tag">我</span>
                                <span class="cs-player-list-status" :class="getPlayerStatusClass(p)">
                                    {{ getPlayerStatus(p) }}
                                </span>
                            </li>
                        </ul>
                    </div>

                    <div style="flex:1"></div>

                    <!-- 退出房間 -->
                    <button class="btn-secondary cs-exit-btn" type="button" @click="handleExitRoom">
                        退出房間
                    </button>
                </div>

                <!-- ── 右側：題目+秒數 → 玩家卡片 Grid → 底部輸入欄 ── -->
                <div class="cs-right-area">

                    <!-- 中上：題目 + 右上倒數 -->
                    <div class="cs-question-row">
                        <div class="game-card cs-question-card">
                            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
                                <p class="cs-card-label" style="margin:0">題目</p>
                                <span v-if="state.currentWord?.author && !state.isGuesser"
                                    style="font-size:13px;color:var(--label)">✍️ {{ state.currentWord.author }}</span>
                                <span v-if="state.currentWord?.category && !state.isGuesser"
                                    style="font-size:12px;color:var(--label)">· {{ state.currentWord.category }}</span>
                            </div>
                            <!-- 猜題者：始終空格 □□（即使揭曉，下方 result-card 顯示答案） -->
                            <template v-if="state.isGuesser && state.status !== 'revealing'">
                                <div class="cs-question-blanks">
                                    <span v-for="n in (state.wordLength || 0)" :key="n" class="cs-blank">□</span>
                                    <span v-if="!state.wordLength" style="color:var(--body);font-size:28px">?</span>
                                </div>
                                <p v-if="state.wordLength" style="font-size:12px;color:var(--body);margin:2px 0 0">
                                    共 {{ state.wordLength }} 個字
                                </p>
                            </template>
                            <template v-else>
                                <p class="cs-word-display">{{ state.currentWord?.word ?? '…' }}</p>
                            </template>
                        </div>

                        <!-- 右上：倒數秒數 -->
                        <div class="cs-timer-badge" :class="{ 'timer-shake': activeTimer !== '' && activeTimer <= 10 }">
                            <span class="cs-timer-label">倒數</span>
                            <span class="cs-timer-num" :style="{ color: timerColor }">
                                {{ activeTimer !== '' ? activeTimer + 's' : '--' }}
                            </span>
                        </div>
                    </div>

                    <div class="cs-players-grid">
                        <div v-for="p in playersWithRoles" :key="p.id" :class="['game-card', 'cs-player-card', getPlayerCardClass(p.role, p.id),
                            { 'hint-just-submitted': state.submittedPlayerIds.includes(p.id) && isHintPhase }]"
                            style="position:relative;overflow:hidden">
                            <!-- 浮動反應 emoji 覆層 -->
                            <TransitionGroup name="cs-react" tag="div" class="cs-react-overlay" aria-hidden="true">
                                <span v-for="r in (state.reactions[p.id] || [])" :key="r.id"
                                    :class="r.emoji === '🥚' ? 'cs-egg-wrapper' : 'cs-react-fly'"
                                    :style="{ '--x': r.x }">
                                    <template v-if="r.emoji === '🥚'">
                                        <span class="cs-egg-raw">🥚</span>
                                        <span class="cs-egg-fried">💩</span>
                                    </template>
                                    <template v-else>{{ r.emoji }}</template>
                                </span>
                            </TransitionGroup>

                            <!-- 玩家資訊列 -->
                            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;
                                    margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--divider)">
                                <span style="font-weight:600;font-size:15px;color:var(--heading)">{{ p.nickname
                                    }}</span>
                                <span v-if="p.id === roomState.myPlayerId" class="badge" style="font-size:10px">我</span>
                                <span class="badge" :style="{
                                    fontSize: '10px',
                                    background: isPlayerGuesser(p) ? 'rgba(251, 113, 133, 0.15)' : 'rgba(6, 182, 212, 0.14)',
                                    color: isPlayerGuesser(p) ? 'var(--ruby)' : 'var(--neon-cyan)'
                                }">
                                    {{ roleBadgeText(p) }}
                                </span>
                                <span v-if="state.submittedPlayerIds.includes(p.id)
                                    && (state.status === 'round1' || state.status === 'round2') && !isPlayerGuesser(p)"
                                    style="margin-left:auto;color:var(--success-text);font-size:11px">✓</span>
                                <span
                                    v-else-if="(state.status === 'round1' || state.status === 'round2') && !isPlayerGuesser(p)"
                                    style="margin-left:auto;color:var(--label);font-size:11px">待送出</span>
                            </div>
                            <div v-if="isPlayerGuesser(p)" style="text-align:center;padding:4px 0 2px">
                                <p style="font-size:16px;font-weight:700;color:var(--heading);margin:0">
                                    {{ p.id === roomState.myPlayerId ? '你是猜題者' : '猜題者' }}
                                </p>
                                <!-- 兩輪答案 -->
                                <div class="cs-guess-rows">
                                    <!-- R1 -->
                                    <div class="cs-guess-row">
                                        <span class="cs-guess-label">R1</span>
                                        <template v-if="state.round1GuessResult">
                                            <span class="cs-guess-answer">{{ state.round1GuessResult.answer || '（空白）'
                                                }}</span>
                                            <span class="cs-guess-ab cs-guess-ab--a">{{ state.round1GuessResult.a
                                                }}A</span>
                                            <span class="cs-guess-ab cs-guess-ab--b">{{ state.round1GuessResult.b
                                                }}B</span>
                                        </template>
                                        <template
                                            v-else-if="state.status === 'round1-result' && p.id === roomState.myPlayerId">
                                            <span class="cs-guess-pending">作答中…</span>
                                        </template>
                                        <template v-else-if="state.status === 'round1-result'">
                                            <span class="cs-guess-pending">等待作答</span>
                                        </template>
                                        <template v-else>
                                            <span class="cs-guess-empty">—</span>
                                        </template>
                                    </div>
                                    <!-- R2 (進入 round2 後才顯示) -->
                                    <div v-if="['round2', 'round2-result', 'revealing'].includes(state.status)"
                                        class="cs-guess-row">
                                        <span class="cs-guess-label">R2</span>
                                        <template v-if="state.status === 'revealing' && state.guessResult">
                                            <span class="cs-guess-answer"
                                                :style="{ color: state.guessResult.correct ? 'var(--success-text)' : 'var(--heading)' }">
                                                {{ state.guessResult.correct ? '🎉 ' : '' }}{{ state.guessResult.answer
                                                    || '（空白）' }}
                                            </span>
                                            <template v-if="state.guessAB">
                                                <span class="cs-guess-ab cs-guess-ab--a">{{ state.guessAB.a }}A</span>
                                                <span class="cs-guess-ab cs-guess-ab--b">{{ state.guessAB.b }}B</span>
                                            </template>
                                        </template>
                                        <template
                                            v-else-if="state.status === 'round2-result' && p.id === roomState.myPlayerId">
                                            <span class="cs-guess-pending">作答中…</span>
                                        </template>
                                        <template v-else-if="state.status === 'round2-result'">
                                            <span class="cs-guess-pending">等待作答</span>
                                        </template>
                                        <template v-else>
                                            <span class="cs-guess-empty">—</span>
                                        </template>
                                    </div>
                                </div>
                                <p v-if="state.status === 'round1' || state.status === 'round2'"
                                    style="font-size:11px;color:var(--body);margin-top:8px;opacity:0.7">
                                    等待提示線索
                                </p>
                            </div>
                            <!-- 第一輪提示 -->
                            <div v-else style="margin-bottom:6px;text-align:center">
                                <p style="font-size:10px;color:var(--label);margin-bottom:2px">第一輪</p>
                                <TransitionGroup name="hint-char" tag="span" class="hint-chars-wrap">
                                    <span v-for="(c, i) in getPlayerR1Hint(p.id)" :key="i" :style="{
                                        '--i': i,
                                        fontSize: '22px', fontWeight: '700', letterSpacing: '3px', color: c.color,
                                        textDecoration: c.isConflict ? 'underline wavy' : 'none'
                                    }">
                                        {{ c.char }}
                                    </span>
                                </TransitionGroup>
                                <p v-if="!getPlayerR1Hint(p.id).length"
                                    style="font-size:11px;color:var(--body);opacity:0.5">
                                    {{ state.status === 'round1'
                                        ? (state.submittedPlayerIds.includes(p.id) ? '✓' : '…')
                                        : '—' }}
                                </p>
                            </div>
                            <!-- 第二輪提示（round2 以後才顯示）-->
                            <div v-if="['round2', 'round2-result', 'revealing'].includes(state.status) && !isPlayerGuesser(p)"
                                style="text-align:center">
                                <p style="font-size:10px;color:var(--label);margin-bottom:2px">第二輪</p>
                                <TransitionGroup name="hint-char" tag="span" class="hint-chars-wrap">
                                    <span v-for="(c, i) in getPlayerR2Hint(p.id)" :key="i" :style="{
                                        '--i': i,
                                        fontSize: '22px', fontWeight: '700', letterSpacing: '3px', color: c.color,
                                        textDecoration: c.isConflict ? 'underline wavy' : 'none'
                                    }">
                                        {{ c.char }}
                                    </span>
                                </TransitionGroup>
                                <p v-if="!getPlayerR2Hint(p.id).length"
                                    style="font-size:11px;color:var(--body);opacity:0.5">
                                    {{ state.status === 'round2'
                                        ? (state.submittedPlayerIds.includes(p.id) ? '✓' : '…')
                                        : '—' }}
                                </p>
                            </div>
                            <!-- 互動按鈕（常駐底部，僅對其他人） -->
                            <div v-if="p.id !== roomState.myPlayerId" class="cs-react-btns">
                                <span class="cs-react-label">互動</span>
                                <button class="cs-react-btn" title="這很屬🔥"
                                    @click.stop="sendReaction(p.id, '\uD83D\uDD25')">🔥</button>
                                <button class="cs-react-btn" title="丟蛋！🥚"
                                    @click.stop="sendReaction(p.id, '\uD83E\uDD5A')">🥚</button>
                            </div>
                        </div>
                    </div>

                    <!-- ── 底部猜題輸入欄（猜題者，round1-result / round2-result）──  -->
                    <template
                        v-if="state.isGuesser && (state.status === 'round1-result' || state.status === 'round2-result')">
                        <div v-if="!guessSubmitted" class="cs-hint-bar">
                            <div style="flex:1;display:flex;align-items:center;gap:8px">
                                <span style="font-size:13px;font-weight:700;white-space:nowrap"
                                    :class="{ 'timer-shake': guessTimerRemaining <= 10 }"
                                    :style="{ color: guessTimerRemaining <= 10 ? 'var(--ruby)' : 'var(--neon-cyan)' }">
                                    {{ guessTimerRemaining }}s
                                </span>
                                <input v-model="guessInput" type="text" class="game-input" style="flex:1"
                                    ref="guessInputRef"
                                    :placeholder="state.status === 'round1-result' ? '根據第一輪線索猜…' : '根據兩輪線索猜…'"
                                    aria-label="猜題答案" autocomplete="off" autocorrect="off" autocapitalize="off"
                                    spellcheck="false" @keydown.enter.prevent="handleSubmitGuess" />
                                <button type="button" class="btn-primary"
                                    style="white-space:nowrap;padding:8px 16px;width:auto" :disabled="guessSubmitted"
                                    @click="handleSubmitGuess">送出</button>
                            </div>
                        </div>
                        <div v-else class="cs-hint-bar" style="justify-content:center">
                            <p style="color:var(--success-text);font-size:13px;font-weight:600">
                                ✓ 已送出「{{ guessInput || '（空白）' }}」，等待揭曉…
                            </p>
                        </div>
                    </template>
                    <!-- ── 底部提示輸入欄（提示者）── -->
                    <template v-if="!state.isGuesser && (state.status === 'round1' || state.status === 'round2')">
                        <div v-if="!hintSubmitted" class="cs-hint-bar">
                            <div style="flex:1;display:flex;flex-direction:column;gap:6px">
                                <div style="display:flex;align-items:center;gap:8px">
                                    <span style="font-size:13px;font-weight:700;white-space:nowrap"
                                        :style="{ color: state.timerRemaining <= 10 ? 'var(--ruby)' : 'var(--neon-cyan)' }">
                                        {{ state.timerRemaining }}s
                                    </span>
                                    <input v-model="hintInput" type="text" class="game-input" style="flex:1"
                                        ref="hintInputRef" :placeholder="`輸入中文提示（1 ～ ${maxHintChars} 字）`"
                                        :maxlength="12" aria-label="提示輸入" autocomplete="off" autocorrect="off"
                                        autocapitalize="off" spellcheck="false" @input="onHintInput"
                                        @keydown.enter.prevent="handleSubmitHint" />
                                    <button type="button" class="btn-primary"
                                        style="white-space:nowrap;padding:8px 16px;width:auto"
                                        :disabled="hintCharCount === 0 || !!hintError || hintSubmitted"
                                        @click="handleSubmitHint">送出</button>
                                </div>
                                <p v-if="hintError" style="color:var(--color-error-fg);margin:0">{{ hintError
                                }}</p>
                            </div>
                        </div>
                        <div v-else class="cs-hint-bar" style="justify-content:center">
                            <p style="color:var(--success-text);font-size:13px;font-weight:600">✓ 已送出，等待其他提示者…</p>
                        </div>
                    </template>

                    <!-- ── 底部揭曉 CTA（揭曉階段）── -->
                    <template v-if="state.status === 'revealing'">
                        <div class="cs-hint-bar cs-reveal-bar">
                            <span style="font-size:24px">{{ state.guessResult?.correct ? '🎉' : '😅' }}</span>
                            <span class="neon-heading gradient-text" style="font-size:16px;font-weight:800">
                                {{ state.guessResult?.correct ? '答對了！' : '下次加油！' }}
                            </span>
                            <button v-if="roomState.isHost" type="button" class="btn-primary"
                                style="white-space:nowrap;padding:8px 20px;width:auto;margin-left:auto"
                                @click="handleNextTurn">
                                下一位 →
                            </button>
                            <span v-else style="font-size:12px;color:var(--label);margin-left:auto">等待房主…</span>
                        </div>
                    </template>
                </div>
            </div>

            <!-- ── 退出房間確認框 ── -->
            <div v-if="showExitConfirm" class="overlay" @click.self="showExitConfirm = false">
                <div class="overlay-card" style="max-width:340px">
                    <div class="section-header" style="margin-bottom:12px">
                        <div class="section-icon">🚪</div>
                        <h2 class="neon-heading" style="font-size:20px">離開房間？</h2>
                        <p class="section-subtitle">離開後將回到大廳，遊戲進度不會保留。</p>
                    </div>
                    <div style="display:flex;gap:10px;margin-top:8px">
                        <button class="btn-secondary" style="flex:1" @click="showExitConfirm = false">取消</button>
                        <button class="btn-primary" style="flex:1" @click="confirmExit">確定離開</button>
                    </div>
                </div>
            </div>

            <!-- ── 結算 ── -->
            <div v-else-if="state.status === 'finished'" class="game-card animate-slide-up" style="text-align:center">
                <div style="font-size:56px;margin-bottom:12px">🏆</div>
                <h2 class="neon-heading gradient-text" style="font-size:26px;margin-bottom:8px">一局結束！</h2>
                <p style="color:var(--body);font-size:15px;margin-bottom:28px">所有人都猜過一圈了</p>

                <div v-if="roomState.isHost" style="display:flex;flex-direction:column;gap:10px">
                    <!-- 主題選擇（換局前） -->
                    <div style="display:flex;align-items:center;gap:10px;
                               padding:10px 14px;border-radius:10px;
                               background:var(--bg-subtle);border:1px solid var(--border)">
                        <span style="font-size:13px;color:var(--label);white-space:nowrap">🎲 下一局主題</span>
                        <select v-model="selectedTheme" class="game-input"
                            style="flex:1;padding:6px 10px;font-size:13px;cursor:pointer" @change="handleSetTheme">
                            <option :value="-1">隨機主題（每局不同）</option>
                            <option v-for="t in themeList" :key="t.id" :value="t.id">{{ t.name }}</option>
                        </select>
                    </div>
                    <button class="btn-primary"
                        style="background:linear-gradient(135deg,#0891B2,#06B6D4);border-color:rgba(6,182,212,0.4)"
                        @click="handleContinue">
                        繼續下一局 🔁
                    </button>
                    <button class="btn-secondary" @click="handleEndGame">結束遊戲</button>
                </div>
                <p v-else style="color:var(--body);font-size:14px">等待房主決定…</p>
            </div>

        </main>

        <!-- 錯誤提示 -->
        <div v-if="state.error" style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
                   background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);
                   color:#FDA4AF;padding:10px 20px;border-radius:10px;font-size:14px;z-index:100">
            {{ state.error }}
        </div>

        <!-- Toast -->
        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>

        <Transition name="phase-flash">
            <div v-if="phaseFlash.show" class="phase-flash" aria-live="assertive">
                <div class="phase-flash__inner">
                    <div class="phase-flash__glow" aria-hidden="true"></div>
                    <p class="phase-flash__tag">回合切換</p>
                    <p class="phase-flash__title">{{ phaseFlash.title }}</p>
                    <p class="phase-flash__desc">{{ phaseFlash.desc }}</p>
                    <div class="phase-flash__meter" aria-hidden="true"></div>
                </div>
            </div>
        </Transition>

        <!-- 結果 overlay：短倒數(1.2s) → reveal(1.2s)；答案/AB 已在猜題者卡片內，不重複顯示 -->
        <Transition name="result-card">
            <div v-if="resultCard.show" class="result-card-overlay" aria-live="assertive">
                <div class="result-card-box"
                    :class="resultCard.phase === 'reveal' ? (resultCard.correct ? 'result-card-box--correct' : 'result-card-box--wrong') : ''">
                    <!-- 倒數 -->
                    <template v-if="resultCard.phase === 'countdown'">
                        <div :key="resultCard.countdownNum" class="result-card-countdown">
                            {{ resultCard.countdownNum }}
                        </div>
                    </template>
                    <!-- 揭曉 -->
                    <template v-else>
                        <div class="result-card-emoji" :class="resultCard.correct ? 'pop-in' : 'shake'">
                            {{ resultCard.correct ? '🎉' : '😅' }}
                        </div>
                        <p class="result-card-verdict">
                            {{ resultCard.correct
                                ? '答對了！'
                                : (resultCard.isFinal ? '答錯了' : '答錯，進入第二輪') }}
                        </p>
                    </template>
                </div>
            </div>
        </Transition>

        <p class="sr-live" aria-live="polite">{{ liveStatusText }}</p>
    </div>
</template>

<script setup>
// 返回首頁
function goHome() {
    router.push({ path: '/' })
}
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharacterStorm } from '../composables/useCharacterStorm.js'
import { useCharacterStormSfx } from '../composables/useCharacterStormSfx.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'

const route = useRoute()
const router = useRouter()
const MIN_PLAYERS_REQUIRED = 2
const GUESS_TIMER_SECONDS = 90
const SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

// ── 主題清單（動態從後端載入）────────────────────────────────────
const THEME_NAMES = {
    0: '原始題庫',
    1: '綜合主題包',
    2: '好友精選包',
    3: '深海底撈',
    4: '百鬼夜行',
}
const themeList = ref([])
const selectedTheme = ref(-1)

async function loadThemes() {
    try {
        const res = await fetch(`${SERVER_URL}/api/cs/themes`)
        const { themes } = await res.json()
        themeList.value = themes.map(id => ({ id, name: THEME_NAMES[id] ?? `主題 ${id}` }))
    } catch {
        themeList.value = Object.entries(THEME_NAMES).map(([id, name]) => ({ id: Number(id), name }))
    }
}

function handleSetTheme() {
    setTheme(selectedTheme.value)
}

// 主題切換
const isDark = ref(true)
function toggleTheme() {
    const html = document.documentElement
    const isLight = html.getAttribute('data-theme') === 'light'
    const next = isLight ? 'mygame' : 'light'
    html.setAttribute('data-theme', next)
    localStorage.setItem('theme', next === 'light' ? 'light' : 'dark')
    isDark.value = next !== 'light'
}

const {
    state,
    roomState,
    playersWithRoles,
    connect,
    submitHint,
    submitGuess,
    startGame,
    nextTurn,
    continueGame,
    endGame,
    disconnect,
    copyInviteLink,
    onGuessResult,
    sendReaction,
    setTheme,
    kickPlayer,
    transferHost,
    leaveRoom,
} = useCharacterStorm()

const {
    isSfxMuted,
    startSfx,
    stopSfx,
    toggleSfxMute,
} = useCharacterStormSfx()

// ── 暱稱遮罩 ──────────────────────────────────────────────────────
const showNicknameOverlay = ref(false)
const overlayNickname = ref('')
const nicknameError = ref('')
const overlayInputRef = ref(null)

// ── 提示輸入 ──────────────────────────────────────────────────────
const hintInput = ref('')
const hintError = ref('')
const hintSubmitted = computed(() => {
    const isHintPhase = state.status === 'round1' || state.status === 'round2'
    return isHintPhase && state.submittedPlayerIds.includes(roomState.myPlayerId)
})
const maxHintChars = computed(() => state.myQuota || 4)

const hintCharCount = computed(() => {
    const stripped = hintInput.value.replace(/\s/g, '')
    // 黑名單過濾提示
    return [...stripped].filter(c => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)).length
})

function onHintInput() {
    hintError.value = ''
    const stripped = hintInput.value.replace(/\s/g, '')
    const hasInvalid = /[0-9a-zA-Z\u0000-\u007F\p{P}\p{S}\p{Emoji}]/u.test(stripped)
    if (hasInvalid) { hintError.value = '只能輸入中文字，不可含數字、標點或英文'; return }
    const charCount = [...stripped].filter(c => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c)).length
    if (charCount > maxHintChars.value) {
        hintError.value = `請輸入 1 ～ ${maxHintChars.value} 個中文字，目前輸入了 ${charCount} 個`
        return
    }
    // 前端即時檢查題目字
    const wordChars = state.currentWord?.word ? new Set([...state.currentWord.word]) : null
    if (wordChars) {
        const forbidden = [...stripped].filter(c => wordChars.has(c))
        if (forbidden.length) {
            const unique = [...new Set(forbidden)].join('\u3001')
            hintError.value = `提示中不可含有題目的字「${unique}」`
        }
    }
}

// ── 猜題輸入 ──────────────────────────────────────────────────────
const guessInput = ref('')
const guessSubmitted = ref(false)
const guessInputRef = ref(null)
const hintInputRef = ref(null)
const phaseFlash = ref({ show: false, title: '', desc: '' })
let _phaseFlashTimer = null

// ── 結果揭曉卡片 ──────────────────────────────────────────────────
const resultCard = ref({ show: false, phase: 'countdown', countdownNum: 3, correct: false, answer: '', a: null, b: null, isFinal: false })
let _resultCardTimer = null

function showResultCard({ correct, answer, a, b, isFinal }) {
    // 1.2s 倒數（3→2→1 各 400ms）營造期待感 → 1.2s reveal → 收起
    clearTimeout(_resultCardTimer)
    resultCard.value = {
        show: true, phase: 'countdown', countdownNum: 3,
        correct, answer, a, b: b ?? null, isFinal: isFinal ?? false
    }
    const tick = () => {
        if (resultCard.value.countdownNum > 1) {
            resultCard.value.countdownNum--
            _resultCardTimer = setTimeout(tick, 400)
        } else {
            resultCard.value.phase = 'reveal'
            _resultCardTimer = setTimeout(() => { resultCard.value.show = false }, 1200)
        }
    }
    _resultCardTimer = setTimeout(tick, 400)
}

// 綁定 composable 的猜題結果回調
onGuessResult(showResultCard)

// ── 猜題倒數計時 ──────────────────────────────────────────────────
const guessTimerRemaining = ref(GUESS_TIMER_SECONDS)
let _guessTimerInterval = null

function startGuessTimer() {
    clearInterval(_guessTimerInterval)
    guessTimerRemaining.value = GUESS_TIMER_SECONDS
    _guessTimerInterval = setInterval(() => {
        if (guessTimerRemaining.value > 0) guessTimerRemaining.value--
        else clearInterval(_guessTimerInterval)
    }, 1000)
}

watch(() => state.status, (val) => {
    if (val === 'round1-result' || val === 'round2-result') {
        startGuessTimer()
        // 進入新的猜題階段，重置猜題輸入
        guessInput.value = ''
        guessSubmitted.value = false
        nextTick(() => guessInputRef.value?.focus())
    } else {
        clearInterval(_guessTimerInterval)
        guessTimerRemaining.value = GUESS_TIMER_SECONDS
    }
    // 進入第二輪時，重置提示輸入狀態讓提示者可以再輸入
    if (val === 'round2') {
        hintInput.value = ''
        hintError.value = ''
    }

    if ((val === 'round1' || val === 'round2') && !state.isGuesser && !hintSubmitted.value) {
        nextTick(() => hintInputRef.value?.focus())
    }
})

watch(() => state.status, (nextStatus, prevStatus) => {
    if (!prevStatus || prevStatus === nextStatus) return

    const allowFlash = ['round1', 'round2', 'finished']
    if (!allowFlash.includes(nextStatus)) return

    phaseFlash.value = {
        show: true,
        title: phaseTitleByStatus(nextStatus),
        desc: phaseDescByStatus(nextStatus),
    }

    triggerPhaseCue(nextStatus)

    clearTimeout(_phaseFlashTimer)
    _phaseFlashTimer = setTimeout(() => {
        phaseFlash.value.show = false
    }, 1300)
})

// GAME_STARTED → 自動導回大廳（真的是新玩家誤入進行中的房間）
watch(() => state.errorCode, (code) => {
    if (code === 'GAME_STARTED') {
        setTimeout(() => router.replace({ name: 'character-storm' }), 2500)
    }
})

// ── Toast ─────────────────────────────────────────────────────────
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null

function showToast(msg, type = '', duration = 3000) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

// ── 工具 ──────────────────────────────────────────────────────────
function playerName(pid) {
    return playersWithRoles.value.find(p => p.id === pid)?.nickname ?? pid
}

const GAME_PHASES = ['round1', 'round2', 'round1-result', 'round2-result', 'revealing']
const isGamePhase = computed(() => GAME_PHASES.includes(state.status))
const minPlayersRequired = MIN_PLAYERS_REQUIRED
const currentPhaseTitle = computed(() => {
    if (state.status === 'round1') return '第一輪提示中'
    if (state.status === 'round1-result') return '第一輪作答中'
    if (state.status === 'round2') return '第二輪提示中'
    if (state.status === 'round2-result') return '第二輪作答中'
    if (state.status === 'revealing') return '結果揭曉'
    if (state.status === 'finished') return '本局結束'
    return '等待開始'
})
// 左上階段標籤（格式：第一輪：作答中 / 提示中）
const phaseLabel = computed(() => {
    if (state.status === 'round1') return '第一輪：提示中'
    if (state.status === 'round1-result') return '第一輪：作答中'
    if (state.status === 'round2') return '第二輪：提示中'
    if (state.status === 'round2-result') return '第二輪：作答中'
    if (state.status === 'revealing') return '答案揭曉'
    if (state.status === 'finished') return '本局結束'
    return '等待開始'
})
const cluePlayers = computed(() => playersWithRoles.value.filter(p => p.role !== 'guesser'))
const currentGuesserName = computed(() => {
    const guesser = playersWithRoles.value.find(p => p.id === state.currentGuesserPlayerId) ||
        playersWithRoles.value.find(p => p.role === 'guesser')
    return guesser?.nickname || '尚未分配'
})
const isHintPhase = computed(() => state.status === 'round1' || state.status === 'round2')
const submittedHintsCount = computed(() => {
    const clueIds = new Set(cluePlayers.value.map(p => p.id))
    return state.submittedPlayerIds.filter(id => clueIds.has(id)).length
})
const pendingHintsCount = computed(() => Math.max(cluePlayers.value.length - submittedHintsCount.value, 0))
const hintProgressPercent = computed(() => {
    if (!cluePlayers.value.length) return 0
    return Math.min(100, Math.round((submittedHintsCount.value / cluePlayers.value.length) * 100))
})
// 左上階段卡的進度（提示階段=提示者送出進度；作答階段=猜題者本地送出進度；其他=不顯示）
const isAnswerPhase = computed(() => state.status === 'round1-result' || state.status === 'round2-result')
const phaseSubmitted = computed(() => {
    if (isHintPhase.value) return submittedHintsCount.value
    if (isAnswerPhase.value) return guessSubmitted.value ? 1 : 0
    return 0
})
const phaseTotal = computed(() => {
    if (isHintPhase.value) return cluePlayers.value.length
    if (isAnswerPhase.value) return 1
    return 0
})
const phaseProgressPct = computed(() => {
    if (!phaseTotal.value) return 0
    return Math.min(100, Math.round((phaseSubmitted.value / phaseTotal.value) * 100))
})
const phaseHintText = computed(() => {
    if (state.status === 'round1') return state.isGuesser ? '等待提示者完成第一輪線索' : '請輸入第一輪中文提示'
    if (state.status === 'round1-result') return state.isGuesser ? '根據第一輪線索作答' : '等待猜題者作答'
    if (state.status === 'round2') return state.isGuesser ? '等待提示者完成第二輪線索' : '請輸入第二輪中文提示'
    if (state.status === 'round2-result') return state.isGuesser ? '根據兩輪線索完成最終作答' : '等待猜題者最終作答'
    if (state.status === 'revealing') return '查看答案與 A/B 結果'
    if (state.status === 'finished') return '房主可選擇下一局或結束'
    return '等待房主開始遊戲'
})
const liveStatusText = computed(() => {
    if (state.loading) return state.loadingText || '連線中'
    if (!roomState.room) return ''
    if (state.status === 'waiting') return `目前 ${playersWithRoles.value.length} 人，等待遊戲開始`
    if (state.status === 'round1' || state.status === 'round2') return `提示階段，剩餘 ${state.timerRemaining} 秒`
    if (state.status === 'round1-result' || state.status === 'round2-result') return `作答階段，剩餘 ${guessTimerRemaining.value} 秒`
    if (state.status === 'revealing') return state.guessResult?.correct ? '本輪答對' : '本輪未答對'
    if (state.status === 'finished') return '本局結束'
    return ''
})

// 目前顯示的計時器數值
const activeTimer = computed(() => {
    if (['round1', 'round2'].includes(state.status)) return state.timerRemaining
    if (['round1-result', 'round2-result'].includes(state.status)) return guessTimerRemaining.value
    return ''
})
const timerColor = computed(() => {
    const v = activeTimer.value
    if (v === '') return 'var(--neon-cyan)'
    return v <= 10 ? 'var(--ruby)' : 'var(--neon-cyan)'
})

// 符號 → 顏色對應
const SYMBOL_COLORS = {
    '●': '#06B6D4', '▲': '#F59E0B', '■': '#A855F7', '◆': '#EC4899',
    '★': '#22C55E', '✖': '#EF4444', '✚': '#F97316', '⬢': '#6366F1',
}
// 取得某玩家提示的 chars 陣列（含符號顏色）
function getPlayerHintChars(hints, hintsProvider, pid) {
    if (state.isGuesser) {
        const text = hints.find(h => h.playerId === pid)?.maskedText ?? ''
        return [...text].map(c => ({
            char: c,
            color: SYMBOL_COLORS[c] ?? 'var(--heading)',
            isSymbol: !!SYMBOL_COLORS[c],
        }))
    }
    const h = hintsProvider.find(h => h.playerId === pid)
    if (!h) return []
    return h.chars.map(c => ({
        char: c.char,
        color: c.isConflict ? (SYMBOL_COLORS[state.symbolMap?.[c.char]] ?? 'var(--ruby)') : 'var(--heading)',
        isConflict: c.isConflict,
        isSymbol: false,
    }))
}
function getPlayerR1Hint(pid) { return getPlayerHintChars(state.round1Hints, state.round1HintsProvider, pid) }
function getPlayerR2Hint(pid) { return getPlayerHintChars(state.round2Hints, state.round2HintsProvider, pid) }

function isPlayerGuesser(player) {
    if (state.currentGuesserPlayerId) return player.id === state.currentGuesserPlayerId
    return player.role === 'guesser'
}

function roleBadgeText(player) {
    if (isPlayerGuesser(player)) return '猜題者'
    return '提示者'
}

// 左下玩家列表：依當前階段顯示該玩家狀態
function getPlayerStatus(p) {
    if (isPlayerGuesser(p)) {
        if (state.status === 'round1-result') {
            return state.round1GuessResult ? '✓' : '作答中'
        }
        if (state.status === 'round2-result') {
            return state.guessResult ? '✓' : '作答中'
        }
        if (state.status === 'round1' || state.status === 'round2') {
            return '等待提示'
        }
        if (state.status === 'revealing') return '已揭曉'
        return '猜題者'
    }
    // 提示者
    if (state.status === 'round1' || state.status === 'round2') {
        return state.submittedPlayerIds.includes(p.id) ? '✓' : '作答中'
    }
    if (state.status === 'round1-result' || state.status === 'round2-result') {
        return '等待猜題'
    }
    if (state.status === 'revealing') return '—'
    return '提示者'
}

function getPlayerStatusClass(p) {
    const s = getPlayerStatus(p)
    if (s === '✓') return 'cs-status--done'
    if (s === '作答中') return 'cs-status--active'
    return 'cs-status--idle'
}

function getPlayerCardClass(role, playerId) {
    const classes = []

    if (state.currentGuesserPlayerId ? playerId === state.currentGuesserPlayerId : role === 'guesser') {
        classes.push('cs-player-card--guesser')
    }
    else classes.push('cs-player-card--clue')

    if (playerId === roomState.myPlayerId) classes.push('cs-player-card--self')
    return classes
}

function phaseTitleByStatus(status) {
    if (status === 'round1') return '第一輪開始'
    if (status === 'round1-result') return '第一輪作答'
    if (status === 'round2') return '第二輪開始'
    if (status === 'round2-result') return '第二輪作答'
    if (status === 'revealing') return '答案揭曉'
    if (status === 'finished') return '本局結束'
    return '階段切換'
}

function phaseDescByStatus(status) {
    if (status === 'round1') return '提示者請輸入第一輪線索'
    if (status === 'round1-result') return '猜題者請根據第一輪線索作答'
    if (status === 'round2') return '提示者請輸入第二輪線索'
    if (status === 'round2-result') return '猜題者請根據兩輪線索完成最終作答'
    if (status === 'revealing') return '檢視答案與 A/B 判定結果'
    if (status === 'finished') return '房主可選擇繼續或結束遊戲'
    return ''
}

function phaseSoundKeyByStatus(status) {
    if (status === 'round1') return 'phase-round1-start'
    if (status === 'round1-result') return 'phase-round1-answer'
    if (status === 'round2') return 'phase-round2-start'
    if (status === 'round2-result') return 'phase-round2-answer'
    if (status === 'revealing') return 'phase-reveal'
    if (status === 'finished') return 'phase-finished'
    return ''
}

// Audio hook reserved for future SFX manager.
// Example usage: window.addEventListener('character-storm:phase-cue', (e) => playSfx(e.detail.cue))
function triggerPhaseCue(status) {
    const cue = phaseSoundKeyByStatus(status)
    if (!cue || typeof window === 'undefined') return

    window.dispatchEvent(new CustomEvent('character-storm:phase-cue', {
        detail: {
            cue,
            status,
            roomId: roomState.roomId,
            at: Date.now(),
        },
    }))
}

// ── 操作 ──────────────────────────────────────────────────────────
function handleStartGame() { startGame() }

function handleSubmitHint() {
    if (hintSubmitted.value) return
    if (hintCharCount.value === 0 || hintError.value) return
    if (hintCharCount.value > maxHintChars.value) {
        hintError.value = `請輸入 1 ～ ${maxHintChars.value} 個中文字，目前輸入了 ${hintCharCount.value} 個`
        return
    }

    const stripped = hintInput.value.replace(/\s/g, '')
    // 送出前再檢查一次題目字
    const wordChars = state.currentWord?.word ? new Set([...state.currentWord.word]) : null
    if (wordChars) {
        const forbidden = [...stripped].filter(c => wordChars.has(c))
        if (forbidden.length) {
            const unique = [...new Set(forbidden)].join('\u3001')
            hintError.value = `提示中不可含有題目的字「${unique}」`
            return
        }
    }
    submitHint(stripped)
    hintInput.value = ''
    hintError.value = ''
}

function handleSubmitGuess() {
    if (guessSubmitted.value) return
    const ans = guessInput.value.trim()
    submitGuess(ans)   // 允許空白（時間到自動交卷）
    guessSubmitted.value = true
}

function handleNextTurn() {
    hintInput.value = ''
    guessInput.value = ''
    guessSubmitted.value = false
    nextTurn()
}

function handleContinue() {
    hintInput.value = ''
    guessInput.value = ''
    guessSubmitted.value = false
    continueGame()
}

function handleEndGame() { endGame() }

function handleCopyLink() {
    copyInviteLink()
    showToast(`已複製邀請連結！`, 'success')
}

function handleKick(playerId, nickname) {
    kickPlayer(playerId)
    showToast(`已踢出 ${nickname}`, 'info')
}

function handleTransferHost(playerId, nickname) {
    transferHost(playerId)
    showToast(`房主已移交給 ${nickname}`, 'success')
}

// ── 退出房間 ─────────────────────────────────────────────────────
const showExitConfirm = ref(false)

function handleExitRoom() {
    showExitConfirm.value = true
}

function confirmExit() {
    showExitConfirm.value = false
    try { leaveRoom?.() } catch (_) { /* ignore */ }
    disconnect()
    router.push({ name: 'character-storm' })
}

// ── 暱稱遮罩 ──────────────────────────────────────────────────────
function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { nicknameError.value = '請輸入暱稱'; return }
    saveNickname(nickname)
    showNicknameOverlay.value = false
    const isCreating = route.query.create === '1'
    const maxPlayers = parseInt(route.query.max) || 6
    const themePreference = parseInt(route.query.theme ?? '-1')
    connect(roomState.roomId || route.query.id, nickname, isCreating, maxPlayers, themePreference)
}

// ── 初始化 ────────────────────────────────────────────────────────
onMounted(() => {
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'
    startSfx()
    loadThemes()

    const roomId = (route.query.id || '').toUpperCase()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    const isCreating = route.query.create === '1'
    const maxPlayers = parseInt(route.query.max) || 6
    const themePreference = parseInt(route.query.theme ?? '-1')

    if (!roomId) { router.push({ name: 'character-storm' }); return }

    if (!nickname) {
        roomState.roomId = roomId
        showNicknameOverlay.value = true
        nextTick(() => overlayInputRef.value?.focus())
        return
    }

    // 建立房間後立即把 create=1 從 URL 移除，避免 F5 重整時觸發重建
    if (isCreating) {
        router.replace({ name: 'character-storm-room', query: { id: roomId, nickname } })
    }

    connect(roomId, nickname, isCreating, maxPlayers, themePreference)
})

watch(guessTimerRemaining, (val) => {
    const isGuessPhase = state.status === 'round1-result' || state.status === 'round2-result'
    if (val === 0 && state.isGuesser && !guessSubmitted.value && isGuessPhase) {
        handleSubmitGuess()  // 時間到自動送出空白
    }
})

onUnmounted(() => {
    clearInterval(_guessTimerInterval)
    clearTimeout(_phaseFlashTimer)
    clearTimeout(_resultCardTimer)
    stopSfx()
    // 不強制斷線（讓重連機制生效），頁面 push 回大廳時才斷
})
</script>
