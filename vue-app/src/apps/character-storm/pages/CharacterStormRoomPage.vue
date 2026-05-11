<template>
    <div class="page-wrapper">
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
                    <button class="header-icon-btn" title="切換主題" @click="toggleTheme">{{ isDark ? '🌙' : '☀️' }}</button>
                    <button class="header-icon-btn" title="複製邀請連結" @click="handleCopyLink">🔗</button>
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
                        placeholder="你的暱稱…" maxlength="12" @keydown.enter="joinWithNickname" />
                </div>
                <button class="btn-primary" @click="joinWithNickname">
                    加入房間 🚀
                </button>
            </div>
        </div>

        <!-- 遊戲主畫面 -->
        <main v-else-if="state.room" class="main-content main-content--room"
            :class="{ 'main-content--game': isGamePhase }">

            <!-- ── 大廳 ── -->
            <div v-if="state.status === 'waiting'" class="game-card animate-slide-up">
                <div class="section-header">
                    <div class="section-icon">🏠</div>
                    <h2 class="neon-heading" style="font-size:22px">等待玩家加入</h2>
                    <p class="section-subtitle">需要 4 ～ {{ state.room.maxPlayers }} 人才能開始</p>
                </div>

                <!-- 房間碼 + 分享 -->
                <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin:16px 0 24px">
                    <div style="font-size:28px;font-weight:700;letter-spacing:6px;
                                color:var(--neon-cyan);font-family:'Source Code Pro',monospace">
                        {{ state.roomId }}
                    </div>
                    <button class="header-icon-btn" style="font-size:18px" title="複製邀請連結"
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
                <p v-if="state.players.length < 2"
                    style="text-align:center;font-size:13px;color:var(--body);margin-bottom:16px">
                    還需要 {{ 2 - state.players.length }} 人才能開始
                </p>

                <!-- 開始按鈕（僅房主） -->
                <button v-if="state.isHost" class="btn-primary"
                    style="width:100%;background:linear-gradient(135deg,#0891B2,#06B6D4);border-color:rgba(6,182,212,0.4)"
                    :disabled="state.players.length < 2" @click="handleStartGame">
                    開始遊戲 🚀
                </button>
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
                    <div class="cs-players-grid">
                        <div v-for="p in state.players.filter(p => p.role !== 'guesser')" :key="p.id"
                            class="game-card cs-player-card">
                            <!-- 玩家資訊列 -->
                            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;
                                    margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--divider)">
                                <span style="font-weight:600;font-size:15px;color:var(--heading)">{{ p.nickname }}</span>
                                <span v-if="p.id === state.myPlayerId" class="badge" style="font-size:10px">我</span>
                                <span v-if="state.submittedPlayerIds.includes(p.id)
                                    && (state.status === 'round1' || state.status === 'round2')"
                                    style="margin-left:auto;color:var(--success-text);font-size:11px">✓</span>
                            </div>
                            <!-- 第一輪提示 -->
                            <div style="margin-bottom:6px;text-align:center">
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
                            <div v-if="['round2', 'round2-result', 'revealing'].includes(state.status)" style="text-align:center">
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
                                    :placeholder="state.status === 'round1-result' ? '根據第一輪線索猜…' : '根據兩輪線索猜…'" />
                                <span style="font-size:13px;font-weight:700;white-space:nowrap"
                                    :style="{ color: guessTimerRemaining <= 10 ? 'var(--ruby)' : 'var(--neon-cyan)' }">
                                    {{ guessTimerRemaining }}s
                                </span>
                                <button class="btn-primary" style="white-space:nowrap;padding:8px 16px;width:auto"
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
                                    <span style="font-size:12px;color:var(--label);white-space:nowrap">
                                        {{ state.status === 'round1' ? '第一輪' : '第二輪' }}
                                    </span>
                                    <input v-model="hintInput" type="text" class="game-input" style="flex:1"
                                        placeholder="輸入中文提示（不能含題目的字，最多4字）" maxlength="8" @input="onHintInput" />
                                    <button class="btn-primary" style="white-space:nowrap;padding:8px 16px;width:auto"
                                        :disabled="hintCharCount === 0 || !!hintError"
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
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharacterStorm } from '../composables/useCharacterStorm.js'
import { getSavedNickname, saveNickname } from '../../../data/identity.js'

const route = useRoute()
const router = useRouter()

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

// ── 暱稱遮罩 ──────────────────────────────────────────────────────
const showNicknameOverlay = ref(false)
const overlayNickname = ref('')
const nicknameError = ref('')
const overlayInputRef = ref(null)

// ── 提示輸入 ──────────────────────────────────────────────────────
const hintInput = ref('')
const hintError = ref('')
const hintSubmitted = ref(false)

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
    } else {
        clearInterval(_guessTimerInterval)
        guessTimerRemaining.value = 60
    }
    // 進入第二輪時，重置提示輸入狀態讓提示者可以再輸入
    if (val === 'round2') {
        hintInput.value = ''
        hintError.value = ''
        hintSubmitted.value = false
    }
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

// ── 操作 ──────────────────────────────────────────────────────────
function handleStartGame() { startGame() }

function handleSubmitHint() {
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
    hintSubmitted.value = true
}

function handleSubmitGuess() {
    const ans = guessInput.value.trim()
    submitGuess(ans)   // 允許空白（時間到自動交卷）
    guessSubmitted.value = true
}

function handleNextTurn() {
    hintInput.value = ''
    hintSubmitted.value = false
    guessInput.value = ''
    guessSubmitted.value = false
    nextTurn()
}

function handleContinue() {
    hintInput.value = ''
    hintSubmitted.value = false
    guessInput.value = ''
    guessSubmitted.value = false
    continueGame()
}

function handleEndGame() { endGame() }

function handleCopyLink() {
    const link = copyInviteLink()
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
    // 不強制斷線（讓重連機制生效），頁面 push 回大廳時才斷
})
</script>
