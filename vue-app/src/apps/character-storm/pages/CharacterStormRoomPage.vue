<template>
    <div class="page-wrapper page-wrapper--scrollable cs-room-page cs-scope cs-bg" :class="{ 'cs-banner-active': phaseFlash.show }">
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
                        maxPlayers || '?' }} 人</span>
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

        <!-- 被踢出：可回大廳改暱稱後重新加入 -->
        <div v-else-if="state.kicked" class="overlay">
            <div class="overlay-card text-center">
                <div class="section-header" style="margin-bottom:12px">
                    <div class="section-icon">🚪</div>
                    <h2 class="neon-heading" style="font-size:20px">你已離開房間</h2>
                    <p class="section-subtitle">{{ state.kicked }}</p>
                </div>
                <button class="btn-primary" @click="goLobby">回到入口</button>
            </div>
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
            <CsWaitingPanel v-if="state.status === 'waiting'" :room-id="roomState.roomId" :players="playersWithRoles"
                :my-player-id="roomState.myPlayerId" :host-id="roomState.room.host_player_id"
                :is-host="roomState.isHost" :min-players="MIN_PLAYERS_REQUIRED"
                :max-players="maxPlayers" @copy-link="handleCopyLink" @start="handleStartGame" />

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
                                    '--tok': playerColor(playersWithRoles, p.id),
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
                                    <span v-for="(c, i) in [...state.currentWord.word]" :key="i"
                                        class="cs-tile cs-tile--lg cs-tile--flip" :style="{ '--i': i }">{{ c }}</span>
                                </template>
                                <span v-else class="cs-tile cs-tile--lg cs-tile--back">?</span>
                            </div>
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
                        :class="{ 'cs-players-grid--dense': playersWithRoles.length > 6, 'cs-players-grid--quad': playersWithRoles.length <= 4 }"
                        :style="{ '--cs-rows': Math.ceil(playersWithRoles.length / 3) }">
                        <CsPlayerCard v-for="p in playersWithRoles" :key="p.id" :player="p"
                            :players="playersWithRoles" :state="state" :my-player-id="roomState.myPlayerId"
                            :is-guesser="isPlayerGuesser(p)" :is-hint-phase="isHintPhase"
                            :hint-rounds="visibleHintRounds" :flipped="flippedHints" @react="sendReaction"
                            @flip="flipHint" />
                    </div>

                    <!-- ── 底部輸入欄 ── -->
                    <CsGuessBar v-if="state.isGuesser && isAnswerPhase" ref="guessBarRef" v-model="guessInput"
                        :word-length="state.wordLength || 0" :is-first-round="state.status === 'round1-result'"
                        :timer="guessTimerRemaining" :submitted="guessSubmitted" @submit="handleSubmitGuess" />
                    <CsHintBar v-if="!state.isGuesser && isHintPhase" ref="hintBarRef" v-model="hintInput"
                        :max-chars="maxHintChars" :word="state.currentWord?.word ?? ''" :timer="state.timerRemaining"
                        :error="hintError" :submitted="hintSubmitted" :can-submit="canSubmitHint"
                        @input="onHintInput" @submit="handleSubmitHint" />
                    <CsRevealBar v-if="state.status === 'revealing'" :correct="!!state.guessResult?.correct"
                        :guesser-name="currentGuesserName" :is-host="roomState.isHost" @next="handleNextTurn" />
                </div>
            </div>

            <!-- ── 退出房間確認框 ── -->
            <div v-if="showExitConfirm" class="overlay" @click.self="showExitConfirm = false">
                <div class="overlay-card" style="max-width:340px">
                    <div class="section-header" style="margin-bottom:12px">
                        <div class="section-icon">🚪</div>
                        <h2 class="neon-heading" style="font-size:20px">離開房間？</h2>
                        <p class="section-subtitle">離開後將回到入口，你的座位與進度會清除，再進來會是全新的玩家。</p>
                    </div>
                    <div style="display:flex;gap:10px;margin-top:8px">
                        <button class="btn-secondary" style="flex:1" @click="showExitConfirm = false">取消</button>
                        <button class="btn-primary" style="flex:1" @click="confirmExit">確定離開</button>
                    </div>
                </div>
            </div>

            <!-- ── 結算 ── -->
            <CsFinishPanel v-if="state.status === 'finished'" :turn-history="turnHistory"
                :correct-count="correctTurnCount" :players="playersWithRoles" :is-host="roomState.isHost"
                :theme="selectedTheme" :theme-list="themeList" @set-theme="handleSetTheme" @continue="handleContinue"
                @end="handleEndGame" />

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

        <CsPhaseBanner :flash="phaseFlash" />
        <CsResultOverlay :card="resultCard" />

        <!-- 答錯紅暈 / 答對彩帶 / 結算彩帶 -->
        <div v-if="vignetteKey" :key="vignetteKey" class="cs-vignette" aria-hidden="true"></div>
        <CsConfetti v-if="confettiKey" :key="confettiKey" />
        <CsConfetti v-if="state.status === 'finished'" key="finished" :count="110" />

        <CharacterStormGuideModal v-model="showGuide" />

        <p class="sr-live" aria-live="polite">{{ liveStatusText }}</p>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCharacterStorm } from '../composables/useCharacterStorm.js'
import CsVolumePanel from '../components/CsVolumePanel.vue'
import { useCharacterStormSfx } from '../composables/useCharacterStormSfx.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import CharacterStormGuideModal from '../components/CharacterStormGuideModal.vue'
import CsWaitingPanel from '../components/CsWaitingPanel.vue'
import CsPlayerCard from '../components/CsPlayerCard.vue'
import CsHintBar from '../components/CsHintBar.vue'
import CsGuessBar from '../components/CsGuessBar.vue'
import CsRevealBar from '../components/CsRevealBar.vue'
import CsFinishPanel from '../components/CsFinishPanel.vue'
import CsPhaseBanner from '../components/CsPhaseBanner.vue'
import CsResultOverlay from '../components/CsResultOverlay.vue'
import CsConfetti from '../components/CsConfetti.vue'
import '../styles/character-storm.css'
import { useGameGuide } from '@/shared/composables/useGameGuide.js'
import { fetchThemes, THEME_ALL } from '../data/themes.js'
import { avatarChar, playerColor, SYMBOL_COLORS } from '../data/playerLook.js'
import {
    GAME_PHASES, PHASE_KICKER, phaseLabel as phaseLabelOf, phaseHintText as phaseHintTextOf,
    phaseTitle, phaseDesc, phaseCueKey,
} from '../data/phases.js'

const route = useRoute()
const router = useRouter()

function goHome() {
    router.push({ path: '/' })
}
const MIN_PLAYERS_REQUIRED = 2
const GUESS_TIMER_SECONDS = 90

// ── 主題清單（動態從後端載入）────────────────────────────────────
const themeList = ref([])
const selectedTheme = ref(THEME_ALL)

async function loadThemes() {
    themeList.value = await fetchThemes()
}

function handleSetTheme(id) {
    selectedTheme.value = id
    setTheme(id)
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

const canSubmitHint = computed(() => hintCharCount.value > 0 && !hintError.value && !hintSubmitted.value)

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
const guessBarRef = ref(null)
const hintBarRef = ref(null)
const phaseFlash = ref({ show: false, title: '', desc: '', kicker: '', variant: '' })
let _phaseFlashTimer = null
let _phaseFlashRaf = 0

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
        nextTick(() => guessBarRef.value?.focus())
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
        nextTick(() => hintBarRef.value?.focus())
    }
})

// 猜題者揭曉時翻開的提示字牌（key = playerId:round:index）
const flippedHints = ref([])
function flipHint(pid, round, i) {
    const k = `${pid}:${round}:${i}`
    if (!flippedHints.value.includes(k)) flippedHints.value.push(k)
}
watch(() => state.status, (s) => { if (s !== 'revealing') flippedHints.value = [] })

watch(() => state.status, (nextStatus, prevStatus) => {
    if (!prevStatus || prevStatus === nextStatus) return

    triggerPhaseCue(nextStatus)

    const allowFlash = ['round1', 'round2', 'finished']
    if (!allowFlash.includes(nextStatus)) return

    // 判定卡（鼓聲倒數＋答對/答錯）還在畫面上時，橫幅先排隊，避免兩個動畫疊在一起
    if (resultCard.value.show) { pendingFlash = nextStatus; return }
    showPhaseFlash(nextStatus)
})

let pendingFlash = null
const FLASH_GAP_MS = 250

function showPhaseFlash(status) {
    clearTimeout(_phaseFlashTimer)
    cancelAnimationFrame(_phaseFlashRaf)
    // 等階段切換的重新渲染／聚焦先畫完（兩個 frame），橫幅動畫才開始，避免第一幀就卡住
    _phaseFlashRaf = requestAnimationFrame(() => {
        _phaseFlashRaf = requestAnimationFrame(() => {
            phaseFlash.value = {
                show: true,
                title: phaseTitle(status),
                desc: phaseBannerDesc(status),
                kicker: PHASE_KICKER[status],
                variant: status,
            }
            _phaseFlashTimer = setTimeout(() => {
                phaseFlash.value.show = false
            }, 1700)
        })
    })
}

// 判定卡收起後，補播排隊中的橫幅（若已不在該階段就略過）
watch(() => resultCard.value.show, (shown) => {
    if (shown || !pendingFlash) return
    const status = pendingFlash
    pendingFlash = null
    setTimeout(() => { if (state.status === status) showPhaseFlash(status) }, FLASH_GAP_MS)
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
        : phaseDesc(status)
    return phaseDesc(status)
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
        if (!_seenReactionIds.has(r.id)) playSfx(r.emoji === '🥚' ? 'egg' : r.emoji === '💯' ? 'score' : 'fire')
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
// 後端房間欄位為 max_players（snake_case）
const maxPlayers = computed(() => roomState.room?.max_players ?? roomState.room?.maxPlayers ?? 0)
const isGamePhase = computed(() => GAME_PHASES.includes(state.status))
// 左上階段標籤（格式：第一輪：作答中 / 提示中）
const phaseLabel = computed(() => phaseLabelOf(state.status))
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
const phaseHintText = computed(() => phaseHintTextOf(state.status, state.isGuesser))
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

// 取得某玩家提示的 chars 陣列（含符號顏色 tok）
function getPlayerHintChars(hints, hintsProvider, pid) {
    if (state.isGuesser) {
        const text = hints.find(h => h.playerId === pid)?.maskedText ?? ''
        const realBySymbol = Object.fromEntries(Object.entries(state.symbolMap ?? {}).map(([ch, s]) => [s, ch]))
        return [...text].map(c => ({
            char: c,
            real: realBySymbol[c],
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

function isPlayerGuesser(player) {
    if (state.currentGuesserPlayerId) return player.id === state.currentGuesserPlayerId
    return player.role === 'guesser'
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

// 所有階段切換都會發出事件，音效管理器可監聽 character-storm:phase-cue
function triggerPhaseCue(status) {
    const cue = phaseCueKey(status)
    if (!cue || typeof window === 'undefined') return

    window.dispatchEvent(new CustomEvent('character-storm:phase-cue', {
        detail: { cue, status, roomId: roomState.roomId, at: Date.now() },
    }))
}

// ── 操作 ──────────────────────────────────────────────────────────
function handleStartGame() {
    playSfx('click')
    startGame()
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

function handleSubmitGuess(domValue) {
    if (guessSubmitted.value) return
    // 子元件傳來 input 實際內容，避免輸入法組字期間 v-model 尚未同步
    if (typeof domValue === 'string') guessInput.value = domValue
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

function goLobby() {
    disconnect()
    router.push({ name: 'character-storm' })
}

async function confirmExit() {
    showExitConfirm.value = false
    try { await leaveRoom?.() } catch (_) { /* ignore */ }
    goLobby()
}

// ── 暱稱遮罩 ──────────────────────────────────────────────────────
function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { nicknameError.value = '請輸入暱稱'; return }
    saveNickname(nickname)
    showNicknameOverlay.value = false
    const isCreating = route.query.create === '1'
    const maxPlayers = parseInt(route.query.max) || 12
const themePreference = parseInt(route.query.theme ?? String(THEME_ALL))
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
    const maxPlayers = parseInt(route.query.max) || 12
const themePreference = parseInt(route.query.theme ?? String(THEME_ALL))

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
    cancelAnimationFrame(_phaseFlashRaf)
    clearInterval(_guessTimerInterval)
    clearTimeout(_phaseFlashTimer)
    clearTimeout(_resultCardTimer)
    clearTimeout(_fxTimer)
    pendingFlash = null
    stopSfx()
    // 不強制斷線（讓重連機制生效），頁面 push 回大廳時才斷
})
</script>
