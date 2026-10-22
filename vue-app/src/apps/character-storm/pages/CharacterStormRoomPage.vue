<template>
    <div class="page-wrapper page-wrapper--scrollable cs-room-page cs-scope cs-bg">
        <a href="#cs-main-content" class="skip-link">跳到主要內容</a>

        <!-- Header -->
        <header class="sticky-header app-header--room">
            <div class="header-inner header-inner--room">
                <div class="flex items-center gap-1 min-w-0 flex-1 sm:flex-none">
                    <button class="header-back-btn" @click="goHome" title="返回首頁" aria-label="返回首頁">
                        ←<span class="hidden sm:inline"> 返回</span>
                    </button>
                    <span class="logo-sm">默契字囊團 🔡</span>
                </div>
                <div class="header-info order-last w-full justify-center sm:order-none sm:w-auto">
                    <span class="header-room-id">{{ roomState.roomId }}</span>
                    <span style="font-size:12px;color:var(--body)">{{ playersWithRoles.length }}/{{
                        roomState.room?.maxPlayers ?? '?' }} 人</span>
                </div>
                <div class="flex gap-1 sm:gap-1.5 items-center shrink-0">
                    <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                        :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost" @kick="handleKick"
                        @transfer-host="handleTransferHost" />
                    <button class="header-icon-btn" title="玩法說明" aria-label="玩法說明" @click="showGuide = true">❓</button>
                    <button class="header-icon-btn" title="切換主題" aria-label="切換主題" @click="toggleTheme">{{ isDark ? '🌙'
                        : '☀️' }}</button>
                    <CsVolumePanel />
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
            <div v-if="state.status === 'waiting'" class="game-card cs-waiting animate-slide-up">
                <div class="section-header" style="margin-bottom:4px">
                    <h2 class="neon-heading" style="font-size:22px">等待玩家加入</h2>
                    <p class="section-subtitle">需要 {{ minPlayersRequired }} ～ {{ roomState.room.maxPlayers }} 人才能開始</p>
                </div>

                <!-- 房間碼（點擊複製邀請連結） -->
                <div class="cs-room-code" role="button" tabindex="0" title="複製邀請連結" aria-label="複製邀請連結"
                    @click="handleCopyLink" @keydown.enter="handleCopyLink">
                    <span v-for="(c, i) in roomState.roomId" :key="i" class="cs-tile cs-tile--md cs-tile--drop"
                        :style="{ '--i': i }">{{ c }}</span>
                </div>
                <p class="cs-room-code-hint">點房間碼即可複製邀請連結 🔗</p>

                <!-- 座位 -->
                <TransitionGroup name="cs-seat" tag="div" class="cs-seat-grid">
                    <div v-for="p in playersWithRoles" :key="p.id" class="cs-seat" :class="{
                        'cs-seat--me': p.id === roomState.myPlayerId,
                        'cs-seat--offline': !(p.is_online ?? p.connected),
                    }">
                        <span v-if="p.id === roomState.room.host_player_id" class="cs-seat__crown" title="房主">👑</span>
                        <span v-if="p.id === roomState.myPlayerId" class="cs-seat__me">我</span>
                        <span class="cs-tile cs-avatar" :style="{ '--tok': playerColor(p.id) }">{{ avatarChar(p.nickname)
                            }}</span>
                        <span class="cs-seat__name">{{ p.nickname }}</span>
                    </div>
                    <div v-for="n in emptySeats" :key="`empty-${n}`" class="cs-seat cs-seat--empty">
                        <span class="cs-seat__dots"><i></i><i></i><i></i></span>
                        <span style="font-size:11px">等待加入</span>
                    </div>
                </TransitionGroup>

                <!-- 開始按鈕（僅房主） -->
                <template v-if="roomState.isHost">
                    <button class="btn-primary cs-cta" style="width:100%"
                        :disabled="playersWithRoles.length < minPlayersRequired" @click="handleStartGame">
                        開始遊戲 🚀
                    </button>
                    <p v-if="playersWithRoles.length < minPlayersRequired"
                        style="text-align:center;font-size:12px;color:var(--label);margin-top:10px">
                        還需要 {{ minPlayersRequired - playersWithRoles.length }} 人才能開始
                    </p>
                </template>
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
                                <span class="cs-tile cs-avatar" :style="{
                                    '--tok': playerColor(p.id),
                                    opacity: (p.is_online ?? p.connected) ? 1 : 0.35,
                                }">{{ avatarChar(p.nickname) }}</span>
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
                            <div class="cs-question-meta">
                                <p class="cs-card-label" style="margin:0">
                                    {{ state.isGuesser && state.status !== 'revealing' ? '猜猜看' : '題目' }}
                                </p>
                                <span v-if="state.currentWord?.author && !state.isGuesser"
                                    style="font-size:13px;color:var(--label)">✍️ {{ state.currentWord.author }}</span>
                                <span v-if="state.currentWord?.category && !state.isGuesser"
                                    style="font-size:12px;color:var(--label)">· {{ state.currentWord.category }}</span>
                            </div>
                            <!-- 猜題者：揭曉前只看到空格牌 -->
                            <template v-if="state.isGuesser && state.status !== 'revealing'">
                                <div :key="`blank-${state.wordLength}`" class="cs-question-tiles">
                                    <span v-for="n in (state.wordLength || 1)" :key="n"
                                        class="cs-tile cs-tile--lg cs-tile--blank cs-tile--drop" :style="{ '--i': n }">?</span>
                                </div>
                                <p v-if="state.wordLength" class="cs-question-sub">共 {{ state.wordLength }} 個字</p>
                            </template>
                            <!-- 提示者 / 揭曉：字牌依序翻開 -->
                            <div v-else :key="`word-${state.currentWord?.word ?? ''}`" class="cs-question-tiles">
                                <template v-if="state.currentWord?.word">
                                    <!-- 猜題者：「？」牌依序翻面揭曉 -->
                                    <template v-if="state.isGuesser">
                                        <button v-for="(c, i) in [...state.currentWord.word]" :key="i" type="button"
                                            class="cs-tile cs-tile--lg cs-flipcard"
                                            :class="{ 'is-flipped': flippedTiles.includes(i) }"
                                            :aria-label="flippedTiles.includes(i) ? c : '點擊翻牌'"
                                            @click="flipTile(i)">
                                            <span class="cs-flipcard__back">?</span>
                                            <span class="cs-flipcard__front">{{ c }}</span>
                                        </button>
                                    </template>
                                    <template v-else>
                                        <span v-for="(c, i) in [...state.currentWord.word]" :key="i"
                                            class="cs-tile cs-tile--lg cs-tile--flip" :style="{ '--i': i }">{{ c }}</span>
                                    </template>
                                </template>
                                <span v-else class="cs-tile cs-tile--lg cs-tile--back">?</span>
                            </div>
                            <p v-if="state.isGuesser && state.status === 'revealing' && state.currentWord?.word && flippedTiles.length < [...state.currentWord.word].length"
                                class="cs-question-sub">👆 點擊字牌翻開答案</p>
                        </div>

                        <!-- 右上：倒數計時環 -->
                        <div class="cs-timer-badge">
                            <div class="cs-timer" :class="timerStateClass" role="timer"
                                :aria-label="activeTimer !== '' ? `剩餘 ${activeTimer} 秒` : '未計時'">
                                <svg viewBox="0 0 80 80" aria-hidden="true">
                                    <circle class="cs-timer__track" cx="40" cy="40" r="34" />
                                    <circle class="cs-timer__bar" cx="40" cy="40" r="34" :stroke-dasharray="TIMER_CIRC"
                                        :stroke-dashoffset="timerDashOffset" />
                                </svg>
                                <span class="cs-timer__num">{{ activeTimer !== '' ? activeTimer : '--' }}<span
                                        v-if="activeTimer !== ''" class="cs-timer__unit">s</span></span>
                            </div>
                        </div>
                    </div>

                    <div class="cs-players-grid"
                        :class="{ 'cs-players-grid--dense': playersWithRoles.length > 6 }"
                        :style="{ '--cs-rows': Math.ceil(playersWithRoles.length / 3) }">
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
                            <div class="cs-card-head">
                                <span class="cs-tile cs-avatar" :style="{ '--tok': playerColor(p.id) }">{{
                                    avatarChar(p.nickname) }}</span>
                                <span class="cs-card-head__name">{{ p.nickname }}</span>
                                <span v-if="p.id === roomState.myPlayerId" class="cs-chip cs-chip--me">我</span>
                                <span class="cs-card-head__end">
                                    <span class="cs-chip" :class="isPlayerGuesser(p) ? 'cs-chip--guesser' : 'cs-chip--clue'">
                                        {{ roleBadgeText(p) }}
                                    </span>
                                </span>
                            </div>
                            <div v-if="isPlayerGuesser(p)" class="cs-guesser-hero">
                                <p class="cs-guesser-hero__title">
                                    🎯 {{ p.id === roomState.myPlayerId ? '你是猜題者' : '猜題者' }}
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
                                <p v-if="isHintPhase" class="cs-hint-placeholder">
                                    等待隊友出牌 <span class="cs-seat__dots"><i></i><i></i><i></i></span>
                                </p>
                            </div>
                            <!-- 提示者：兩輪字牌 -->
                            <template v-else>
                                <div v-for="r in visibleHintRounds" :key="r.round" class="cs-hint-block">
                                    <p class="cs-round-label">ROUND {{ r.round }}</p>
                                    <TransitionGroup v-if="r.get(p.id).length" appear name="hint-char" tag="div"
                                        class="hint-chars-wrap">
                                        <span v-for="(c, i) in r.get(p.id)" :key="i" :class="hintTileClass(c)"
                                            :style="{ '--i': i, '--tok': c.tok }" :data-symbol="c.symbol">{{ c.char }}</span>
                                    </TransitionGroup>
                                    <div v-else class="cs-hint-placeholder">
                                        <template v-if="state.status === r.hintStatus">
                                            <template v-if="state.submittedPlayerIds.includes(p.id)">
                                                <span class="cs-tile cs-tile--sm cs-tile--back cs-tile--pop">✓</span>
                                                <span class="cs-chip cs-chip--done">已出牌</span>
                                            </template>
                                            <template v-else>
                                                <span class="cs-seat__dots"><i></i><i></i><i></i></span> 思考中
                                            </template>
                                        </template>
                                        <template v-else>—</template>
                                    </div>
                                </div>
                            </template>
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
                            <div class="cs-compose">
                                <div v-if="state.wordLength" class="cs-compose__slots" aria-hidden="true">
                                    <span v-for="(t, i) in guessPreviewTiles" :key="`${i}-${t.char}`"
                                        :class="previewTileClass(t)">{{ t.char }}</span>
                                </div>
                                <div class="cs-compose__row">
                                    <span class="cs-time-pill"
                                        :class="{ 'cs-time-pill--danger': guessTimerRemaining <= 10 }">
                                        {{ guessTimerRemaining }}s
                                    </span>
                                    <input v-model="guessInput" type="text" class="game-input" style="flex:1"
                                        ref="guessInputRef"
                                        :placeholder="state.status === 'round1-result' ? '根據第一輪線索猜…' : '根據兩輪線索猜…'"
                                        aria-label="猜題答案" autocomplete="off" autocorrect="off" autocapitalize="off"
                                        spellcheck="false" @keydown.enter="onEnterSubmit($event, handleSubmitGuess)" />
                                    <button type="button" class="btn-primary cs-cta cs-send-btn" :disabled="guessSubmitted"
                                        @click="handleSubmitGuess">送出</button>
                                </div>
                            </div>
                        </div>
                        <div v-else class="cs-hint-bar" style="justify-content:center">
                            <p class="cs-sent-msg">✓ 已送出「{{ guessInput || '（空白）' }}」，等待揭曉…</p>
                        </div>
                    </template>
                    <!-- ── 底部提示輸入欄（提示者）── -->
                    <template v-if="!state.isGuesser && (state.status === 'round1' || state.status === 'round2')">
                        <div v-if="!hintSubmitted" class="cs-hint-bar">
                            <div class="cs-compose">
                                <div class="cs-compose__slots" aria-hidden="true">
                                    <span v-for="(t, i) in hintPreviewTiles" :key="`${i}-${t.char}`"
                                        :class="previewTileClass(t)">{{ t.char }}</span>
                                </div>
                                <div class="cs-compose__row">
                                    <span class="cs-time-pill"
                                        :class="{ 'cs-time-pill--danger': state.timerRemaining <= 10 }">
                                        {{ state.timerRemaining }}s
                                    </span>
                                    <input v-model="hintInput" type="text" class="game-input" style="flex:1"
                                        ref="hintInputRef" :placeholder="`輸入中文提示（1 ～ ${maxHintChars} 字）`"
                                        :maxlength="12" aria-label="提示輸入" autocomplete="off" autocorrect="off"
                                        autocapitalize="off" spellcheck="false" @input="onHintInput"
                                        @keydown.enter="onEnterSubmit($event, handleSubmitHint)" />
                                    <button type="button" class="btn-primary cs-cta cs-send-btn"
                                        :disabled="hintCharCount === 0 || !!hintError || hintSubmitted"
                                        @click="handleSubmitHint">出牌</button>
                                </div>
                                <p v-if="hintError" class="cs-compose__error">{{ hintError }}</p>
                            </div>
                        </div>
                        <div v-else class="cs-hint-bar" style="justify-content:center">
                            <p class="cs-sent-msg">✓ 已出牌，等待其他提示者…</p>
                        </div>
                    </template>

                    <!-- ── 底部揭曉 CTA（揭曉階段）── -->
                    <template v-if="state.status === 'revealing'">
                        <div class="cs-hint-bar cs-reveal-bar">
                            <div class="cs-reveal-cta">
                                <span style="font-size:26px">{{ state.guessResult?.correct ? '🎉' : '😅' }}</span>
                                <span class="cs-reveal-cta__verdict"
                                    :class="state.guessResult?.correct ? 'cs-reveal-cta__verdict--win' : 'cs-reveal-cta__verdict--lose'">
                                    {{ state.guessResult?.correct ? `${currentGuesserName} 答對了！` : '可惜！下次加油' }}
                                </span>
                                <button v-if="roomState.isHost" type="button" class="btn-primary cs-cta cs-send-btn"
                                    style="margin-left:auto" @click="handleNextTurn">
                                    下一位 →
                                </button>
                                <span v-else style="font-size:12px;color:var(--label);margin-left:auto">等待房主…</span>
                            </div>
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
            <div v-else-if="state.status === 'finished'" class="game-card cs-finish animate-slide-up">
                <div class="cs-finish__mascot">
                    <CsMascot mood="trophy" />
                </div>
                <h2 class="neon-heading gradient-text" style="font-size:28px;margin-bottom:4px">一局結束！</h2>
                <div v-if="turnHistory.length" class="cs-finish__score">
                    <strong>{{ correctTurnCount }}</strong><span>/ {{ turnHistory.length }} 題答對</span>
                </div>
                <p v-else style="color:var(--body);font-size:15px;margin-bottom:24px">所有人都猜過一圈了</p>

                <!-- 本局回顧 -->
                <ul v-if="turnHistory.length" class="cs-recap">
                    <li v-for="(t, i) in turnHistory" :key="t.id" :style="{ '--i': i }">
                        <span class="cs-tile cs-avatar" style="--size:26px;font-size:13px"
                            :style="{ '--tok': playerColor(t.guesserId) }">{{ avatarChar(t.guesser) }}</span>
                        <span class="cs-recap__name">{{ t.guesser }}</span>
                        <span class="cs-recap__word">
                            <span v-for="(c, j) in [...t.word]" :key="j" class="cs-tile cs-tile--xs">{{ c }}</span>
                        </span>
                        <span class="cs-recap__result"
                            :class="t.correct ? (t.round === 1 ? 'cs-recap__result--r1' : 'cs-recap__result--r2') : 'cs-recap__result--miss'">
                            {{ t.correct ? (t.round === 1 ? '一輪命中' : '二輪命中') : '未猜中' }}
                        </span>
                    </li>
                </ul>

                <div v-if="roomState.isHost" style="display:flex;flex-direction:column;gap:10px">
                    <!-- 主題選擇（換局前） -->
                    <div style="display:flex;align-items:center;gap:10px;
                               padding:10px 14px;border-radius:10px;
                               background:var(--bg-subtle);border:1px solid var(--border)">
                        <span style="font-size:13px;color:var(--label);white-space:nowrap">🎲 下一局主題</span>
                        <select v-model="selectedTheme" class="game-input"
                            style="flex:1;padding:6px 10px;font-size:13px;cursor:pointer" @change="handleSetTheme">
                            <option :value="THEME_ALL">全部（所有主題混在一起）</option>
                            <option :value="THEME_RANDOM">隨機主題（每局不同）</option>
                            <option v-for="t in themeList" :key="t.id" :value="t.id">{{ t.name }}</option>
                        </select>
                    </div>
                    <button class="btn-primary cs-cta" @click="handleContinue">
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

        <!-- 回合轉場橫幅 -->
        <Transition name="cs-banner">
            <div v-if="phaseFlash.show" class="cs-banner" :class="`cs-banner--${phaseFlash.variant}`"
                aria-live="assertive">
                <div class="cs-banner__stripe">
                    <p class="cs-banner__kicker" aria-hidden="true">{{ phaseFlash.kicker }}</p>
                    <p class="cs-banner__title">{{ phaseFlash.title }}</p>
                    <p class="cs-banner__desc">{{ phaseFlash.desc }}</p>
                </div>
            </div>
        </Transition>

        <!-- 結果 overlay：鼓聲倒數 3-2-1 → 揭曉 -->
        <Transition name="result-card">
            <div v-if="resultCard.show" class="result-card-overlay" aria-live="assertive">
                <div class="result-card-box"
                    :class="resultCard.phase === 'reveal' ? (resultCard.correct ? 'result-card-box--correct' : 'result-card-box--wrong') : ''">
                    <!-- 倒數 -->
                    <template v-if="resultCard.phase === 'countdown'">
                        <div :key="resultCard.countdownNum" class="result-card-countdown">
                            {{ resultCard.countdownNum }}
                        </div>
                        <p style="margin:0;font-size:12px;letter-spacing:0.4em;color:#A5F3FC">判定中</p>
                    </template>
                    <!-- 揭曉 -->
                    <template v-else>
                        <div v-if="resultCard.correct" class="cs-result-rays" aria-hidden="true"></div>
                        <CsMascot :mood="resultCard.correct ? 'happy' : 'sad'" style="--mascot-size:104px" />
                        <p class="result-card-verdict">
                            {{ resultCard.correct
                                ? '答對了！'
                                : (resultCard.isFinal ? '答錯了' : '答錯，進入第二輪') }}
                        </p>
                        <div v-if="resultCard.answer" class="cs-result-guess">
                            <div class="cs-tile-row cs-tile-row--tight">
                                <span v-for="(c, i) in [...resultCard.answer]" :key="i"
                                    class="cs-tile cs-tile--sm cs-tile--flip" :style="{ '--i': i }">{{ c }}</span>
                            </div>
                            <div v-if="!resultCard.correct && resultCard.a !== null" class="cs-result-ab">
                                <span class="a">{{ resultCard.a }}A</span>
                                <span class="b">{{ resultCard.b ?? 0 }}B</span>
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </Transition>

        <!-- 答錯紅暈 / 答對彩帶 / 結算彩帶 -->
        <div v-if="vignetteKey" :key="vignetteKey" class="cs-vignette" aria-hidden="true"></div>
        <CsConfetti v-if="confettiKey" :key="confettiKey" />
        <CsConfetti v-if="state.status === 'finished'" key="finished" :count="110" />

        <CharacterStormGuideModal v-model="showGuide" />

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
import CsVolumePanel from '../components/CsVolumePanel.vue'
import { useCharacterStormSfx } from '../composables/useCharacterStormSfx.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import CharacterStormGuideModal from '../components/CharacterStormGuideModal.vue'
import CsMascot from '../components/CsMascot.vue'
import CsConfetti from '../components/CsConfetti.vue'
import '../styles/character-storm.css'
import { useGameGuide } from '@/shared/composables/useGameGuide.js'
import { fetchThemes, THEME_ALL, THEME_RANDOM } from '../data/themes.js'

const route = useRoute()
const router = useRouter()
const MIN_PLAYERS_REQUIRED = 2
const GUESS_TIMER_SECONDS = 90

// ── 主題清單（動態從後端載入）────────────────────────────────────
const themeList = ref([])
const selectedTheme = ref(THEME_RANDOM)

async function loadThemes() {
    themeList.value = await fetchThemes()
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

// 下一局主題選單跟隨房間目前設定（建房時選的主題 / 房主切換）
watch(() => state.themePreference, (pref) => { selectedTheme.value = pref }, { immediate: true })

const {
    startSfx,
    stopSfx,
    playSfx,
    haptic,
} = useCharacterStormSfx()

// ── 玩法說明（第一次進房自動彈出）────────────────────────────────
const { show: showGuide, autoOpen: autoOpenGuide } = useGameGuide('cs-guide-seen')

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
const phaseFlash = ref({ show: false, title: '', desc: '', kicker: '', variant: '' })
let _phaseFlashTimer = null

// ── 結果揭曉卡片 ──────────────────────────────────────────────────
const resultCard = ref({ show: false, phase: 'countdown', countdownNum: 3, correct: false, answer: '', a: null, b: null, isFinal: false })
let _resultCardTimer = null
const confettiKey = ref(0)
const vignetteKey = ref(0)
let _fxTimer = null

function showResultCard({ correct, answer, a, b, isFinal }) {
    // 鼓聲倒數（3→2→1 各 450ms）營造期待感 → 揭曉（答對 2s / 答錯 1.6s）→ 收起
    clearTimeout(_resultCardTimer)
    resultCard.value = {
        show: true, phase: 'countdown', countdownNum: 3,
        correct, answer, a, b: b ?? null, isFinal: isFinal ?? false
    }
    playSfx('drum')
    const tick = () => {
        if (resultCard.value.countdownNum > 1) {
            resultCard.value.countdownNum--
            playSfx('drum')
            _resultCardTimer = setTimeout(tick, 450)
        } else {
            resultCard.value.phase = 'reveal'
            playResultFx(correct)
            _resultCardTimer = setTimeout(() => { resultCard.value.show = false }, correct ? 2000 : 1600)
        }
    }
    _resultCardTimer = setTimeout(tick, 450)
}

function playResultFx(correct) {
    clearTimeout(_fxTimer)
    if (correct) {
        playSfx('correct')
        haptic([30, 40, 60])
        confettiKey.value = Date.now()
        _fxTimer = setTimeout(() => { confettiKey.value = 0 }, 3600)
    } else {
        playSfx('wrong')
        haptic([80, 50, 80])
        vignetteKey.value = Date.now()
        _fxTimer = setTimeout(() => { vignetteKey.value = 0 }, 1000)
    }
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

// 猜題者揭曉時手動翻牌
const flippedTiles = ref([])
function flipTile(i) {
    if (!flippedTiles.value.includes(i)) flippedTiles.value.push(i)
}
watch(() => state.status, (s) => { if (s !== 'revealing') flippedTiles.value = [] })

watch(() => state.status, (nextStatus, prevStatus) => {
    if (!prevStatus || prevStatus === nextStatus) return

    triggerPhaseCue(nextStatus)

    const allowFlash = ['round1', 'round2', 'finished']
    if (!allowFlash.includes(nextStatus)) return

    phaseFlash.value = {
        show: true,
        title: phaseTitleByStatus(nextStatus),
        desc: phaseBannerDesc(nextStatus),
        kicker: { round1: 'ROUND 1', round2: 'ROUND 2', finished: 'GAME SET' }[nextStatus],
        variant: nextStatus,
    }

    clearTimeout(_phaseFlashTimer)
    _phaseFlashTimer = setTimeout(() => {
        phaseFlash.value.show = false
    }, 1700)
})

// 轉場橫幅的說明依自己的角色客製
function phaseBannerDesc(status) {
    if (status === 'round1' || status === 'round2') {
        return state.isGuesser
            ? '你是猜題者！等隊友出牌'
            : `猜題者是「${currentGuesserName.value}」・你最多 ${maxHintChars.value} 字`
    }
    if (status === 'finished') return turnHistory.value.length
        ? `本局答對 ${correctTurnCount.value} / ${turnHistory.value.length} 題`
        : phaseDescByStatus(status)
    return phaseDescByStatus(status)
}

// ── 本局回顧（前端自行記錄，結算畫面顯示）──────────────────────────
const turnHistory = ref([])
const correctTurnCount = computed(() => turnHistory.value.filter(t => t.correct).length)

watch(() => state.status, (next, prev) => {
    if (next === 'round1' && (prev === 'finished' || prev === 'waiting')) turnHistory.value = []
    if (next !== 'revealing' || !state.currentWord?.word) return
    const guesser = playersWithRoles.value.find(p => isPlayerGuesser(p))
    turnHistory.value.push({
        id: Date.now(),
        guesserId: guesser?.id ?? '',
        guesser: guesser?.nickname ?? currentGuesserName.value,
        word: state.currentWord.word,
        correct: !!state.guessResult?.correct,
        round: state.round1GuessResult?.correct ? 1 : 2,
    })
})

// ── 音效觸發 ──────────────────────────────────────────────────────
// 其他提示者出牌
watch(() => [...state.submittedPlayerIds], (ids, prev = []) => {
    if (!isHintPhase.value) return
    const added = ids.filter(id => !prev.includes(id))
    if (added.length && !added.includes(roomState.myPlayerId)) playSfx('pop')
})

// 等待室有人加入
watch(() => playersWithRoles.value.length, (n, old) => {
    if (state.status === 'waiting' && old && n > old) playSfx('join')
})

// 打字 / 輸入錯誤
watch(hintCharCount, (n, old) => { if (n > old) playSfx('type') })
watch(() => guessInput.value.length, (n, old) => { if (n > old) playSfx('type') })
watch(hintError, (err, old) => { if (err && !old) playSfx('error') })

// 丟火 / 丟蛋（伺服器會廣播回所有人，含發送者）
let _seenReactionIds = new Set()
watch(() => Object.values(state.reactions).flat().map(r => r.id).join(','), () => {
    const all = Object.values(state.reactions).flat()
    for (const r of all) {
        if (!_seenReactionIds.has(r.id)) playSfx(r.emoji === '🥚' ? 'egg' : 'fire')
    }
    _seenReactionIds = new Set(all.map(r => r.id))
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
// 計時環（伺服器提示與猜題皆為 90 秒）
const TIMER_TOTAL = 90
const TIMER_CIRC = 2 * Math.PI * 34
const timerDashOffset = computed(() => {
    const v = activeTimer.value
    if (v === '') return 0
    return TIMER_CIRC * (1 - Math.min(Math.max(v / TIMER_TOTAL, 0), 1))
})
const timerStateClass = computed(() => {
    const v = activeTimer.value
    if (v === '') return ''
    if (v <= 10) return 'cs-timer--danger'
    if (v <= 30) return 'cs-timer--warn'
    return ''
})

// 最後 10 秒滴答，最後 3 秒加心跳
watch(activeTimer, (v, old) => {
    if (v === '' || v === old || v <= 0 || v > 10) return
    playSfx(v <= 3 ? 'tickUrgent' : 'tick')
})

// ── 玩家頭像牌 ────────────────────────────────────────────────────
const AVATAR_COLORS = ['#06B6D4', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#14B8A6', '#F97316', '#6366F1']
function playerColor(id) {
    let h = 0
    for (const ch of String(id ?? '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function avatarChar(name) {
    return ([...(name ?? '').trim()][0] ?? '?').toUpperCase()
}

// 等待室空位
const emptySeats = computed(() => {
    const max = roomState.room?.maxPlayers ?? 0
    return Math.max(0, max - playersWithRoles.value.length)
})

// 符號 → 顏色對應
const SYMBOL_COLORS = {
    '●': '#06B6D4', '▲': '#F59E0B', '■': '#A855F7', '◆': '#EC4899',
    '★': '#22C55E', '✖': '#EF4444', '✚': '#F97316', '⬢': '#6366F1',
}
// 取得某玩家提示的 chars 陣列（含符號顏色 tok）
function getPlayerHintChars(hints, hintsProvider, pid) {
    if (state.isGuesser) {
        const text = hints.find(h => h.playerId === pid)?.maskedText ?? ''
        return [...text].map(c => ({
            char: c,
            tok: SYMBOL_COLORS[c],
            isSymbol: !!SYMBOL_COLORS[c],
        }))
    }
    const h = hintsProvider.find(h => h.playerId === pid)
    if (!h) return []
    return h.chars.map(c => {
        const symbol = c.isConflict ? state.symbolMap?.[c.char] : undefined
        return {
            char: c.char,
            tok: c.isConflict ? (SYMBOL_COLORS[symbol] ?? '#F43F5E') : undefined,
            symbol,
            isConflict: c.isConflict,
            isSymbol: false,
        }
    })
}
function getPlayerR1Hint(pid) { return getPlayerHintChars(state.round1Hints, state.round1HintsProvider, pid) }
function getPlayerR2Hint(pid) { return getPlayerHintChars(state.round2Hints, state.round2HintsProvider, pid) }

const visibleHintRounds = computed(() => {
    const rounds = [{ round: 1, hintStatus: 'round1', get: getPlayerR1Hint }]
    if (['round2', 'round2-result', 'revealing'].includes(state.status)) {
        rounds.push({ round: 2, hintStatus: 'round2', get: getPlayerR2Hint })
    }
    return rounds
})

function hintTileClass(c) {
    return ['cs-tile', 'cs-tile--md', { 'cs-tile--symbol': c.isSymbol, 'cs-tile--conflict': c.isConflict }]
}

// ── 輸入預覽字牌 ──────────────────────────────────────────────────
const isHanChar = c => /[一-鿿㐀-䶿]/.test(c)

// 提示：依字數上限顯示空位；超量、非中文、含題目字都標紅
const hintPreviewTiles = computed(() => {
    const chars = [...hintInput.value.replace(/\s/g, '')]
    const wordChars = new Set([...(state.currentWord?.word ?? '')])
    const len = Math.max(maxHintChars.value, chars.length)
    return Array.from({ length: len }, (_, i) => {
        const char = chars[i] ?? ''
        const bad = !!char && (i >= maxHintChars.value || !isHanChar(char) || wordChars.has(char))
        return { char, bad }
    })
})

// 猜題：依題目字數顯示空位
const guessPreviewTiles = computed(() => {
    const chars = [...guessInput.value.replace(/\s/g, '')]
    const total = state.wordLength || 0
    const len = Math.max(total, chars.length)
    return Array.from({ length: len }, (_, i) => ({ char: chars[i] ?? '', bad: i >= total }))
})

function previewTileClass(t) {
    if (!t.char) return ['cs-tile', 'cs-tile--sm', 'cs-tile--slot']
    return ['cs-tile', 'cs-tile--sm', t.bad ? 'cs-tile--bad' : 'cs-tile--pop']
}

function isPlayerGuesser(player) {
    if (state.currentGuesserPlayerId) return player.id === state.currentGuesserPlayerId
    return player.role === 'guesser'
}

function roleBadgeText(player) {
    if (isPlayerGuesser(player)) return '猜題者'
    return player.quota ? `提示 ${player.quota} 字` : '提示者'
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
function handleStartGame() {
    playSfx('click')
    startGame()
}

// 注音／拼音等輸入法選字時的 Enter 只是確認組字，不可當成送出（Mac Safari 的 keyCode 為 229）
function onEnterSubmit(e, submit) {
    if (e.isComposing || e.keyCode === 229) return
    e.preventDefault()
    submit()
}

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
    playSfx('submit')
    haptic(20)
    hintInput.value = ''
    hintError.value = ''
}

function handleSubmitGuess() {
    if (guessSubmitted.value) return
    // 以 input 實際內容為準，避免輸入法組字期間 v-model 尚未同步
    if (guessInputRef.value) guessInput.value = guessInputRef.value.value
    const ans = guessInput.value.trim()
    submitGuess(ans)   // 允許空白（時間到自動交卷）
    guessSubmitted.value = true
    playSfx('submit')
    haptic(20)
}

function handleNextTurn() {
    playSfx('click')
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
    autoOpenGuide()

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
    clearTimeout(_fxTimer)
    stopSfx()
    // 不強制斷線（讓重連機制生效），頁面 push 回大廳時才斷
})
</script>
