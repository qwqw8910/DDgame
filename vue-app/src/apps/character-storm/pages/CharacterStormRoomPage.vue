<template>
    <div class="page-wrapper">
        <a href="#cs-main-content" class="skip-link">跳到主要內容</a>

        <!-- Header -->
        <header class="sticky-header app-header--room">
            <div class="header-inner header-inner--room">
                <span class="logo-sm">默契傳聲筒 🔡</span>
                <div class="header-info">
                    <span class="header-room-id">{{ state.roomId }}</span>
                    <span style="font-size:12px;color:var(--body)">{{ state.players.length }}/{{ state.room?.maxPlayers
                        ?? '?' }} 人</span>
                </div>
                <div style="display:flex;gap:6px">
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
            <span class="loading loading-spinner loading-lg text-primary mb-14"></span>
            <p class="text-body" style="font-size:15px">{{ state.loadingText || '連線中…' }}</p>
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
                        placeholder="你的暱稱…" maxlength="12" aria-label="暱稱" @keydown.enter="joinWithNickname" />
                </div>
                <button class="btn-primary" @click="joinWithNickname">
                    加入房間 🚀
                </button>
            </div>
        </div>

        <!-- 遊戲主畫面 -->
        <main v-else-if="state.room" id="cs-main-content" class="main-content main-content--room"
            :class="{ 'main-content--game': isGamePhase }">

            <!-- ── 大廳 ── -->
            <div v-if="state.status === 'waiting'" class="game-card animate-slide-up">
                <div class="section-header">
                    <div class="section-icon">🏠</div>
                    <h2 class="neon-heading" style="font-size:22px">等待玩家加入</h2>
                    <p class="section-subtitle">需要 {{ minPlayersRequired }} ～ {{ state.room.maxPlayers }} 人才能開始</p>
                </div>

                <!-- 房間碼 + 分享 -->
                <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:16px 0 24px">
                    <div style="font-size:28px;font-weight:700;letter-spacing:6px;
                                color:var(--neon-cyan);font-family:'Source Code Pro',monospace">
                        {{ state.roomId }}
                    </div>
                    <button class="header-icon-btn" style="font-size:18px" title="複製邀請連結" aria-label="複製邀請連結"
                        @click="handleCopyLink">🔗</button>
                </div>

                <!-- 玩家列表 -->
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">
                    <div v-for="p in state.players" :key="p.id" style="display:flex;align-items:center;justify-content:space-between;
                               padding:10px 14px;border-radius:10px;
                               background:var(--bg-subtle);border:1px solid var(--border)">
                        <div style="display:flex;align-items:center;gap:8px">
                            <span>{{ p.connected ? '🟢' : '🔴' }}</span>
                            <span style="font-weight:500;color:var(--heading)">{{ p.nickname }}</span>
                            <span v-if="p.id === state.room.hostId" class="badge" style="font-size:11px;background:rgba(6,182,212,0.15);
                                color:var(--neon-cyan);border:1px solid rgba(6,182,212,0.3)">房主</span>
                            <span v-if="p.id === state.myPlayerId" class="badge" style="font-size:11px">我</span>
                        </div>
                    </div>
                </div>

                <!-- 人數不足提示 -->
                <p v-if="state.players.length < minPlayersRequired"
                    style="text-align:center;font-size:13px;color:var(--body);margin-bottom:16px">
                    還需要 {{ Math.max(minPlayersRequired - state.players.length, 0) }} 人才能開始
                </p>

                <!-- 開始按鈕（僅房主） -->
                <button v-if="state.isHost" class="btn-primary"
                    style="width:100%;background:linear-gradient(135deg,#0891B2,#06B6D4);border-color:rgba(6,182,212,0.4)"
                    :disabled="state.players.length < minPlayersRequired" @click="handleStartGame">
                    開始遊戲 🚀
                </button>
                <p v-if="state.isHost && state.players.length < minPlayersRequired"
                    style="text-align:center;font-size:12px;color:var(--label);margin-top:8px">
                    目前人數不足，無法開始
                </p>
                <p v-else style="text-align:center;font-size:14px;color:var(--body)">等待房主開始遊戲…</p>
            </div>

            <!-- ── 遊戲進行中（統一左右排版）── -->
            <div v-else-if="isGamePhase" class="cs-game-layout">

                <!-- ── 左側面板 ── -->
                <div class="cs-left-panel">

                    <!-- 計時器列 -->
                    <div class="game-card" style="padding:10px 14px">
                        <div style="display:flex;align-items:center;justify-content:space-between">
                            <span class="badge" style="background:rgba(6,182,212,0.15);color:var(--neon-cyan);
                                  border:1px solid rgba(6,182,212,0.3);font-size:12px">
                                <template v-if="state.status === 'round1'">第一輪 · 殘章</template>
                                <template v-else-if="state.status === 'round2'">第二輪 · 長敘</template>
                                <template v-else-if="state.status === 'round1-result'">第一輪線索</template>
                                <template v-else-if="state.status === 'round2-result'">第二輪線索</template>
                                <template v-else>揭曉</template>
                            </span>
                            <span style="font-size:20px;font-weight:700;font-family:'Source Code Pro',monospace"
                                :style="{ color: timerColor }">
                                {{ activeTimer !== '' ? activeTimer + 's' : '' }}
                            </span>
                        </div>
                    </div>

                    <div class="game-card" aria-live="polite">
                        <p class="cs-card-label">目前階段</p>
                        <p class="cs-word-display" style="font-size:20px">{{ currentPhaseTitle }}</p>
                        <p class="cs-word-category">{{ phaseHintText }}</p>
                    </div>

                    <!-- 題目 -->
                    <div class="game-card">
                        <p class="cs-card-label">題目</p>
                        <!-- 猜題者：顯示字數格子 -->
                        <template v-if="state.isGuesser && state.status !== 'revealing'">
                            <div style="display:flex;gap:6px;flex-wrap:wrap;margin:4px 0">
                                <span v-for="n in (state.wordLength || 0)" :key="n" class="cs-blank">□</span>
                                <span v-if="!state.wordLength" style="color:var(--body);font-size:24px">?</span>
                            </div>
                            <p v-if="state.wordLength" style="font-size:12px;color:var(--body);margin-top:4px">
                                共 {{ state.wordLength }} 個字
                            </p>
                        </template>
                        <!-- 提示者 / 揭曉：顯示题目 -->
                        <template v-else>
                            <p class="cs-word-display">{{ state.currentWord?.word ?? '…' }}</p>
                            <p class="cs-word-category">{{ state.currentWord?.category }}</p>
                        </template>
                    </div>

                    <!-- 已送出狀態（左側顯示） -->
                    <div v-if="!state.isGuesser && hintSubmitted && (state.status === 'round1' || state.status === 'round2')"
                        class="game-card" style="text-align:center;padding:12px">
                        <p style="color:var(--success-text);font-size:13px;font-weight:600">✓ 已送出，等待其他提示者…</p>
                    </div>

                    <!-- 猜題者等待提示 -->
                    <div v-if="state.isGuesser && (state.status === 'round1' || state.status === 'round2')"
                        class="game-card" style="text-align:center;padding:20px 12px">
                        <div style="font-size:36px;margin-bottom:8px;opacity:0.6">🤔</div>
                        <p style="color:var(--label);font-size:13px">
                            {{ state.status === 'round1' ? '提示者輸入線索中…' : '提示者輸入第二輪線索中…' }}
                        </p>
                    </div>

                    <!-- 第一輪答案 -->
                    <div class="game-card">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                            <p class="cs-card-label" style="margin:0">第一輪答案</p>
                            <span v-if="state.isGuesser && state.status === 'round1-result'"
                                style="font-size:15px;font-weight:700;font-family:monospace"
                                :style="{ color: guessTimerRemaining <= 10 ? 'var(--ruby)' : 'var(--neon-cyan)' }">
                                {{ guessTimerRemaining }}s
                            </span>
                        </div>
                        <!-- 猜題者在 round1-result：等待輸入（輸入在右下角）-->
                        <template v-if="state.isGuesser && state.status === 'round1-result'">
                            <p v-if="!guessSubmitted" style="color:var(--body);font-size:13px">輸入答案在右下角 ↘</p>
                            <p v-else style="color:var(--success-text);font-size:13px;font-weight:600">
                                ✓ 已送出「{{ guessInput || '（空白）' }}」
                            </p>
                        </template>
                        <!-- 提示者在 round1-result 等待 -->
                        <template v-else-if="!state.isGuesser && state.status === 'round1-result'">
                            <p style="color:var(--body);font-size:13px">等待猜題者答題…</p>
                        </template>
                        <!-- 有第一輪結果（round2 / round2-result / revealing）-->
                        <template v-else-if="state.round1GuessResult">
                            <p style="font-size:15px;font-weight:600;color:var(--heading)">
                                {{ state.round1GuessResult.answer || '（空白）' }}
                            </p>
                            <div style="display:flex;gap:12px;margin-top:4px">
                                <span style="font-weight:700;color:var(--neon-cyan)">{{ state.round1GuessResult.a
                                }}A</span>
                                <span style="font-weight:700;color:#F59E0B">{{ state.round1GuessResult.b }}B</span>
                            </div>
                        </template>
                        <template v-else>
                            <p style="color:var(--body);font-size:13px;opacity:0.4">—</p>
                        </template>
                    </div>

                    <!-- 第二輪答案 -->
                    <div class="game-card">
                        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                            <p class="cs-card-label" style="margin:0">第二輪答案</p>
                            <span v-if="state.isGuesser && state.status === 'round2-result'"
                                style="font-size:15px;font-weight:700;font-family:monospace"
                                :style="{ color: guessTimerRemaining <= 10 ? 'var(--ruby)' : 'var(--neon-cyan)' }">
                                {{ guessTimerRemaining }}s
                            </span>
                        </div>
                        <!-- 猜題者在 round2-result：等待輸入（輸入在右下角）-->
                        <template v-if="state.isGuesser && state.status === 'round2-result'">
                            <p v-if="!guessSubmitted" style="color:var(--body);font-size:13px">輸入答案在右下角 ↘</p>
                            <p v-else style="color:var(--success-text);font-size:13px;font-weight:600">
                                ✓ 已送出「{{ guessInput || '（空白）' }}」
                            </p>
                        </template>
                        <!-- 揭曉：最終答案 + A/B -->
                        <template v-else-if="state.status === 'revealing' && state.guessResult">
                            <p style="font-size:15px;font-weight:600"
                                :style="{ color: state.guessResult.correct ? 'var(--success-text)' : 'var(--heading)' }">
                                {{ state.guessResult.correct ? '🎉 ' : '' }}{{ state.guessResult.answer || '（空白）' }}
                            </p>
                            <div v-if="state.guessAB" style="display:flex;gap:12px;margin-top:4px">
                                <span style="font-weight:700;color:var(--neon-cyan)">{{ state.guessAB.a }}A</span>
                                <span style="font-weight:700;color:#F59E0B">{{ state.guessAB.b }}B</span>
                            </div>
                        </template>
                        <template v-else>
                            <p style="color:var(--body);font-size:13px;opacity:0.4">—</p>
                        </template>
                    </div>

                    <!-- 揭曉結果 + 下一位按鈕 -->
                    <div v-if="state.status === 'revealing'" class="game-card" style="text-align:center">
                        <div style="font-size:44px;margin-bottom:6px">
                            {{ state.guessResult?.correct ? '🎉' : '😅' }}
                        </div>
                        <p class="neon-heading gradient-text" style="font-size:20px;margin-bottom:8px">
                            {{ state.guessResult?.correct ? '答對了！' : '下次加油！' }}
                        </p>
                        <button v-if="state.isHost" class="btn-primary"
                            style="width:100%;background:linear-gradient(135deg,#0891B2,#06B6D4);border-color:rgba(6,182,212,0.4)"
                            @click="handleNextTurn">
                            下一位 →
                        </button>
                        <p v-else style="color:var(--body);font-size:13px;margin-top:8px">等待房主進入下一位…</p>
                    </div>
                </div>

                <!-- ── 右側：玩家卡片 Grid + 底部輸入欄 ── -->
                <div class="cs-right-area">
                    <div class="game-card cs-room-insight" aria-live="polite">
                        <div class="cs-room-insight__header">
                            <p class="cs-card-label" style="margin:0">房間進度</p>
                            <span class="badge" style="font-size:11px">
                                猜題者：{{ currentGuesserName }}
                            </span>
                        </div>
                        <div class="cs-room-insight__meta">
                            <span>提示者 {{ cluePlayers.length }} 人</span>
                            <span v-if="isHintPhase">已送出 {{ submittedHintsCount }}/{{ cluePlayers.length }}</span>
                            <span v-else>等待下一階段同步</span>
                        </div>
                        <div v-if="isHintPhase" class="cs-progress-track" role="progressbar" :aria-valuemin="0"
                            :aria-valuemax="cluePlayers.length" :aria-valuenow="submittedHintsCount"
                            :aria-label="`提示進度 ${submittedHintsCount}/${cluePlayers.length}`">
                            <div class="cs-progress-fill" :style="{ width: `${hintProgressPercent}%` }"></div>
                        </div>
                        <p v-if="isHintPhase" class="cs-room-insight__hint">
                            {{ pendingHintsCount > 0 ? `還有 ${pendingHintsCount} 位提示者未送出` : '所有提示者都已送出，等待進入下一步' }}
                        </p>
                    </div>

                    <div class="cs-players-grid">
                        <div v-for="p in state.players" :key="p.id"
                            :class="['game-card', 'cs-player-card', getPlayerCardClass(p.role, p.id)]">
                            <!-- 玩家資訊列 -->
                            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;
                                    margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--divider)">
                                <span style="font-weight:600;font-size:15px;color:var(--heading)">{{ p.nickname
                                    }}</span>
                                <span v-if="p.id === state.myPlayerId" class="badge" style="font-size:10px">我</span>
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
                            <div v-if="isPlayerGuesser(p)" style="text-align:center;padding:8px 0 2px">
                                <p style="font-size:12px;color:var(--label);margin-bottom:6px">本輪角色</p>
                                <p style="font-size:18px;font-weight:700;color:var(--heading);margin:0">
                                    {{ p.id === state.myPlayerId ? '你是猜題者' : '猜題者' }}
                                </p>
                                <p style="font-size:12px;color:var(--body);margin-top:6px">
                                    {{ state.status === 'round1' || state.status === 'round2'
                                        ? '等待提示線索'
                                        : (state.status === 'round1-result' || state.status === 'round2-result' ? '正在作答中' :
                                    '等待下一階段') }}
                                </p>
                            </div>
                            <!-- 第一輪提示 -->
                            <div v-else style="margin-bottom:6px;text-align:center">
                                <p style="font-size:10px;color:var(--label);margin-bottom:2px">第一輪</p>
                                <template v-if="getPlayerR1Hint(p.id).length">
                                    <span v-for="(c, i) in getPlayerR1Hint(p.id)" :key="i" :style="{
                                        fontSize: '22px', fontWeight: '700', letterSpacing: '3px', color: c.color,
                                        textDecoration: c.isConflict ? 'underline wavy' : 'none'
                                    }">
                                        {{ c.char }}
                                    </span>
                                </template>
                                <p v-else style="font-size:11px;color:var(--body);opacity:0.5">
                                    {{ state.status === 'round1'
                                        ? (state.submittedPlayerIds.includes(p.id) ? '✓' : '…')
                                        : '—' }}
                                </p>
                            </div>
                            <!-- 第二輪提示（round2 以後才顯示）-->
                            <div v-if="['round2', 'round2-result', 'revealing'].includes(state.status) && !isPlayerGuesser(p)"
                                style="text-align:center">
                                <p style="font-size:10px;color:var(--label);margin-bottom:2px">第二輪</p>
                                <template v-if="getPlayerR2Hint(p.id).length">
                                    <span v-for="(c, i) in getPlayerR2Hint(p.id)" :key="i" :style="{
                                        fontSize: '22px', fontWeight: '700', letterSpacing: '3px', color: c.color,
                                        textDecoration: c.isConflict ? 'underline wavy' : 'none'
                                    }">
                                        {{ c.char }}
                                    </span>
                                </template>
                                <p v-else style="font-size:11px;color:var(--body);opacity:0.5">
                                    {{ state.status === 'round2'
                                        ? (state.submittedPlayerIds.includes(p.id) ? '✓' : '…')
                                        : '—' }}
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- ── 底部猜題輸入欄（猜題者，round1-result / round2-result）──  -->
                    <template
                        v-if="state.isGuesser && (state.status === 'round1-result' || state.status === 'round2-result')">
                        <div v-if="!guessSubmitted" class="cs-hint-bar">
                            <div style="flex:1;display:flex;align-items:center;gap:8px">
                                <span style="font-size:12px;color:var(--label);white-space:nowrap">
                                    {{ state.status === 'round1-result' ? '第一輪' : '第二輪' }}答案
                                </span>
                                <input v-model="guessInput" type="text" class="game-input" style="flex:1"
                                    ref="guessInputRef"
                                    :placeholder="state.status === 'round1-result' ? '根據第一輪線索猜…' : '根據兩輪線索猜…'"
                                    aria-label="猜題答案" @keydown.enter.prevent="handleSubmitGuess" />
                                <span style="font-size:13px;font-weight:700;white-space:nowrap"
                                    :style="{ color: guessTimerRemaining <= 10 ? 'var(--ruby)' : 'var(--neon-cyan)' }">
                                    {{ guessTimerRemaining }}s
                                </span>
                                <button class="btn-primary" style="white-space:nowrap;padding:8px 16px;width:auto"
                                    :disabled="guessSubmitted" @click="handleSubmitGuess">送出</button>
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
                                    <span style="font-size:12px;color:var(--label);white-space:nowrap">
                                        {{ state.status === 'round1' ? '第一輪' : '第二輪' }}
                                    </span>
                                    <input v-model="hintInput" type="text" class="game-input" style="flex:1"
                                        ref="hintInputRef" :placeholder="`輸入中文提示（1 ～ ${maxHintChars} 字）`"
                                        :maxlength="12" aria-label="提示輸入" @input="onHintInput"
                                        @keydown.enter.prevent="handleSubmitHint" />
                                    <button class="btn-primary" style="white-space:nowrap;padding:8px 16px;width:auto"
                                        :disabled="hintCharCount === 0 || !!hintError || hintSubmitted"
                                        @click="handleSubmitHint">送出</button>
                                </div>
                                <p v-if="hintError" style="font-size:11px;color:var(--error-fg);margin:0">{{ hintError
                                }}</p>
                            </div>
                        </div>
                        <div v-else class="cs-hint-bar" style="justify-content:center">
                            <p style="color:var(--success-text);font-size:13px;font-weight:600">✓ 已送出，等待其他提示者…</p>
                        </div>
                    </template>
                </div>
            </div>

            <!-- ── 結算 ── -->
            <div v-else-if="state.status === 'finished'" class="game-card animate-slide-up" style="text-align:center">
                <div style="font-size:56px;margin-bottom:12px">🏆</div>
                <h2 class="neon-heading gradient-text" style="font-size:26px;margin-bottom:8px">一局結束！</h2>
                <p style="color:var(--body);font-size:15px;margin-bottom:28px">所有人都猜過一圈了</p>

                <div v-if="state.isHost" style="display:flex;flex-direction:column;gap:10px">
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

        <p class="sr-live" aria-live="polite">{{ liveStatusText }}</p>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharacterStorm } from '../composables/useCharacterStorm.js'
import { useCharacterStormSfx } from '../composables/useCharacterStormSfx.js'
import { getSavedNickname, saveNickname } from '../../../data/identity.js'

const route = useRoute()
const router = useRouter()
const MIN_PLAYERS_REQUIRED = 2

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
    connect,
    submitHint,
    submitGuess,
    startGame,
    nextTurn,
    continueGame,
    endGame,
    disconnect,
    copyInviteLink,
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
    return isHintPhase && state.submittedPlayerIds.includes(state.myPlayerId)
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

// ── 猜題倒數計時 ──────────────────────────────────────────────────
const guessTimerRemaining = ref(60)
let _guessTimerInterval = null

function startGuessTimer() {
    clearInterval(_guessTimerInterval)
    guessTimerRemaining.value = 60
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
        guessTimerRemaining.value = 60
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

    const allowFlash = ['round1', 'round1-result', 'round2', 'round2-result', 'revealing', 'finished']
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
    return state.players.find(p => p.id === pid)?.nickname ?? pid
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
const cluePlayers = computed(() => state.players.filter(p => p.role !== 'guesser'))
const currentGuesserName = computed(() => {
    const guesser = state.players.find(p => p.id === state.currentGuesserPlayerId) ||
        state.players.find(p => p.role === 'guesser')
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
    if (!state.room) return ''
    if (state.status === 'waiting') return `目前 ${state.players.length} 人，等待遊戲開始`
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

function getPlayerCardClass(role, playerId) {
    const classes = []

    if (state.currentGuesserPlayerId ? playerId === state.currentGuesserPlayerId : role === 'guesser') {
        classes.push('cs-player-card--guesser')
    }
    else classes.push('cs-player-card--clue')

    if (playerId === state.myPlayerId) classes.push('cs-player-card--self')
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
            roomId: state.roomId,
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

// ── 暱稱遮罩 ──────────────────────────────────────────────────────
function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { nicknameError.value = '請輸入暱稱'; return }
    saveNickname(nickname)
    showNicknameOverlay.value = false
    const isCreating = route.query.create === '1'
    const maxPlayers = parseInt(route.query.max) || 6
    connect(state.roomId || route.query.id, nickname, isCreating, maxPlayers)
}

// ── 初始化 ────────────────────────────────────────────────────────
onMounted(() => {
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'
    startSfx()

    const roomId = (route.query.id || '').toUpperCase()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    const isCreating = route.query.create === '1'
    const maxPlayers = parseInt(route.query.max) || 6

    if (!roomId) { router.push({ name: 'character-storm' }); return }

    if (!nickname) {
        state.roomId = roomId
        showNicknameOverlay.value = true
        nextTick(() => overlayInputRef.value?.focus())
        return
    }

    // 建立房間後立即把 create=1 從 URL 移除，避免 F5 重整時觸發重建
    if (isCreating) {
        router.replace({ name: 'character-storm-room', query: { id: roomId, nickname } })
    }

    connect(roomId, nickname, isCreating, maxPlayers)
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
    stopSfx()
    // 不強制斷線（讓重連機制生效），頁面 push 回大廳時才斷
})
</script>

<style scoped>
.skip-link {
    position: absolute;
    left: 12px;
    top: -48px;
    background: var(--bg-card, #0f172a);
    color: var(--heading, #e2e8f0);
    border: 1px solid var(--border, #334155);
    border-radius: 8px;
    padding: 8px 12px;
    z-index: 120;
    text-decoration: none;
}

.skip-link:focus {
    top: 12px;
}

.page-wrapper :is(button, input, a):focus-visible {
    outline: 2px solid var(--neon-cyan);
    outline-offset: 2px;
}

.sr-live {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

.cs-room-insight {
    margin-bottom: 10px;
}

.cs-room-insight__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
}

.cs-room-insight__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--label);
    gap: 8px;
    margin-bottom: 8px;
}

.cs-progress-track {
    width: 100%;
    height: 7px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg-subtle) 88%, #000 12%);
    overflow: hidden;
    margin-bottom: 6px;
}

.cs-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #0ea5b9, #06b6d4);
    transition: width 240ms ease;
}

.cs-room-insight__hint {
    margin: 0;
    font-size: 12px;
    color: var(--body);
}

.cs-player-card {
    border-width: 1px;
    border-style: solid;
    transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.cs-player-card--clue {
    background: linear-gradient(160deg, rgba(8, 145, 178, 0.12), rgba(15, 23, 42, 0.9));
    border-color: rgba(8, 145, 178, 0.36);
}

.cs-player-card--guesser {
    background: linear-gradient(160deg, rgba(244, 63, 94, 0.14), rgba(15, 23, 42, 0.9));
    border-color: rgba(251, 113, 133, 0.45);
}

.cs-player-card--self {
    box-shadow: 0 0 0 1px rgba(45, 212, 191, 0.45), 0 12px 22px rgba(6, 182, 212, 0.12);
    transform: translateY(-1px);
}

.phase-flash {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(2, 8, 23, 0.42);
    backdrop-filter: blur(3px);
    pointer-events: none;
    z-index: 130;
}

.phase-flash__inner {
    position: relative;
    min-width: min(86vw, 460px);
    padding: 18px 22px;
    border-radius: 14px;
    border: 1px solid rgba(6, 182, 212, 0.45);
    background:
        radial-gradient(circle at 15% 20%, rgba(6, 182, 212, 0.2), transparent 45%),
        linear-gradient(160deg, rgba(15, 23, 42, 0.95), rgba(8, 47, 73, 0.88));
    box-shadow: 0 18px 48px rgba(2, 8, 23, 0.42);
    text-align: center;
    overflow: hidden;
}

.phase-flash__glow {
    position: absolute;
    inset: -36% auto auto -8%;
    width: 56%;
    aspect-ratio: 1;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(6, 182, 212, 0.36), rgba(6, 182, 212, 0));
    animation: phaseGlow 1.1s ease-out forwards;
}

.phase-flash__tag {
    margin: 0 0 4px;
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--neon-cyan);
}

.phase-flash__title {
    margin: 0;
    font-size: 28px;
    font-weight: 800;
    color: #d7fbff;
}

.phase-flash__desc {
    margin: 5px 0 0;
    font-size: 13px;
    color: #a7f3d0;
}

.phase-flash__meter {
    margin: 10px auto 0;
    height: 4px;
    width: min(65%, 220px);
    border-radius: 999px;
    background: linear-gradient(90deg, rgba(45, 212, 191, 0.15), rgba(45, 212, 191, 0.65));
    transform-origin: left;
    animation: phaseMeter 1.2s linear forwards;
}

.phase-flash-enter-active,
.phase-flash-leave-active {
    transition: opacity 240ms ease;
}

.phase-flash-enter-active .phase-flash__inner,
.phase-flash-leave-active .phase-flash__inner {
    transition: transform 240ms ease, opacity 240ms ease;
}

.phase-flash-enter-from,
.phase-flash-leave-to {
    opacity: 0;
}

.phase-flash-enter-from .phase-flash__inner,
.phase-flash-leave-to .phase-flash__inner {
    transform: translateY(14px) scale(0.98);
    opacity: 0;
}

@keyframes phaseGlow {
    0% {
        transform: scale(0.7);
        opacity: 0;
    }

    30% {
        transform: scale(1.05);
        opacity: 1;
    }

    100% {
        transform: scale(1.35);
        opacity: 0.18;
    }
}

@keyframes phaseMeter {
    0% {
        transform: scaleX(0);
        opacity: 0.35;
    }

    85% {
        transform: scaleX(1);
        opacity: 1;
    }

    100% {
        transform: scaleX(1);
        opacity: 0.65;
    }
}

@media (prefers-reduced-motion: reduce) {

    .cs-progress-fill,
    .phase-flash-enter-active,
    .phase-flash-leave-active,
    .phase-flash-enter-active .phase-flash__inner,
    .phase-flash-leave-active .phase-flash__inner,
    .phase-flash__glow,
    .phase-flash__meter {
        transition: none;
        animation: none;
    }
}
</style>
