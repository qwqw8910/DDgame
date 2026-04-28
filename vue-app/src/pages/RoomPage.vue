<template>
    <div class="page-wrapper">
        <!-- Header -->
        <header class="sticky-header app-header--room">
            <div class="header-inner header-inner--room">
                <span class="logo-sm">懂我再說 👀</span>
                <div class="header-info">
                    <span class="header-room-id">{{ state.roomId }}</span>
                    <span style="font-size:12px;color:var(--body)">{{ state.players.length }}/{{ state.room?.max_players
                        ?? '?' }} 人</span>
                    <span v-if="state.currentRound && state.room?.status === 'playing'" class="header-round">
                        第 {{ state.currentRound.round_number }} 回合
                    </span>
                </div>
                <div style="display:flex;gap:6px">
                    <button class="header-icon-btn" title="複製邀請連結" @click="copyLink">🔗</button>
                    <button class="header-icon-btn" title="切換主題" @click="toggleTheme">{{ themeIcon }}</button>
                </div>
            </div>
        </header>

        <!-- Loading -->
        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <div class="loading-icon">🎭</div>
            <span class="loading loading-spinner loading-lg text-primary mb-14"></span>
            <p class="text-body" style="font-size:15px">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <!-- Nickname Overlay（沒有暱稱時顯示） -->
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
        <main v-else-if="state.room" class="main-content main-content--room">
            <!-- 大廳 -->
            <LobbySection v-if="state.room.status === 'waiting'" :players="state.players" :my-id="state.myPlayerId"
                :host-id="state.room.host_player_id" :is-host="state.isHost" :room-id="state.roomId"
                @toggle-ready="toggleReady" @start-game="startGame" @kick="handleKick" @copy-link="copyLink" />

            <template v-else-if="state.room.status === 'playing'">
                <!-- 房主踢人面板（遊戲進行中） -->
                <div v-if="state.isHost && state.players.filter(p => p.id !== state.myPlayerId).length"
                    class="game-card" style="padding:12px 16px;margin-bottom:12px">
                    <div class="progress-label" style="margin-bottom:8px">⚙️ 玩家管理</div>
                    <div v-for="p in state.players.filter(p => p.id !== state.myPlayerId)" :key="p.id"
                        class="guess-status-item" style="justify-content:space-between;padding:4px 0">
                        <div style="display:flex;align-items:center;gap:6px">
                            <span>{{ p.is_online ? '🟢' : '🔴' }}</span>
                            <span>{{ p.nickname }}</span>
                            <span v-if="p.id === state.currentRound?.subject_player_id" class="badge badge-subject"
                                style="font-size:11px">被猜者</span>
                        </div>
                        <button class="btn-danger-sm" @click="handleKick(p.id, p.nickname)">踢</button>
                    </div>
                </div>

                <!-- 選主題 -->
                <TopicSection v-if="state.currentRound?.status === 'selecting_topic'" :topics="state.topics"
                    :is-subject="state.isSubject" :players="state.players"
                    :subject-id="state.currentRound.subject_player_id" @select-topic="selectTopic" />

                <!-- 預覽題目（被猜者換題） -->
                <PreviewSection v-else-if="state.currentRound?.status === 'previewing_question'"
                    :question="state.previewQuestion" :is-subject="state.isSubject" :players="state.players"
                    :subject-id="state.currentRound.subject_player_id" :swap-count="state.previewSwapCount"
                    :swap-limit="state.previewSwapLimit" @swap="swapPreview" @confirm="confirmPreview" />

                <!-- 選答案 -->
                <AnswerSection v-else-if="state.currentRound?.status === 'selecting_answer'"
                    :question="state.currentQuestion" :is-subject="state.isSubject"
                    :has-submitted-answer="state.hasSubmittedAnswer" :submitted-answer="submittedAnswerLocal"
                    :players="state.players" :subject-id="state.currentRound.subject_player_id"
                    :topic-name="state.currentRound.topic_name" @submit-answer="handleSubmitAnswer" />

                <!-- 猜測 -->
                <GuessSection v-else-if="state.currentRound?.status === 'guessing'" :question="state.currentQuestion"
                    :is-subject="state.isSubject" :has-submitted-guess="state.hasSubmittedGuess"
                    :my-guess="state.myCurrentGuess" :players="state.players" :my-id="state.myPlayerId"
                    :subject-id="state.currentRound.subject_player_id" :topic-name="state.currentRound.topic_name"
                    :guess-submitted="state.guessSubmitted" :guess-total="state.guessTotal"
                    :guess-submitted-ids="state.guessSubmittedIds" @submit-guess="handleSubmitGuess" />

                <!-- 揭曉 -->
                <RevealSection v-else-if="state.currentRound?.status === 'revealing'" :question="state.currentQuestion"
                    :correct-answer="state.currentRound.subject_answer" :guesses="state.guesses"
                    :players="state.players" :subject-id="state.currentRound.subject_player_id"
                    :topic-name="state.currentRound.topic_name" :is-host="state.isHost"
                    :already-animated="revealAnimDone" @next-round="nextRound" @end-game="endGame"
                    @animation-done="revealAnimDone = true" />
            </template>

            <!-- 遊戲結束 -->
            <FinishedSection v-else-if="state.room.status === 'finished'" :players="state.players"
                :is-host="state.isHost" @restart="restartGame" />

            <!-- 浮動 Emoji 反應 -->
            <div class="reaction-container" aria-hidden="true">
                <TransitionGroup name="float">
                    <div v-for="r in state.floatingReactions" :key="r.id" class="floating-reaction"
                        :style="{ left: `${10 + Math.random() * 70}%` }">
                        <div>{{ r.emoji }}</div>
                        <div class="reaction-name">{{ r.nickname }}</div>
                    </div>
                </TransitionGroup>
            </div>

            <!-- Emoji 反應按鈕列 -->
            <div v-if="state.room?.status === 'playing'" class="reaction-bar">
                <button v-for="e in ['🎉', '😱', '😅', '🔥']" :key="e" class="reaction-btn" @click="sendReaction(e)">
                    {{ e }}
                </button>
            </div>
        </main>

        <!-- Toast -->
        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSocket } from '../composables/useSocket.js'
import { getOrCreatePlayerId, getSavedNickname, saveNickname } from '../data/identity.js'
import LobbySection from '../components/LobbySection.vue'
import TopicSection from '../components/TopicSection.vue'
import AnswerSection from '../components/AnswerSection.vue'
import GuessSection from '../components/GuessSection.vue'
import RevealSection from '../components/RevealSection.vue'
import FinishedSection from '../components/FinishedSection.vue'
import PreviewSection from '../components/PreviewSection.vue'

const router = useRouter()
const route = useRoute()

// ── 主題切換 ──────────────────────────────────────────────────────
const themeIcon = ref(document.documentElement.getAttribute('data-theme') === 'light' ? '☀️' : '🌙')
function toggleTheme() {
    const html = document.documentElement
    const next = html.getAttribute('data-theme') === 'light' ? 'mygame' : 'light'
    html.setAttribute('data-theme', next)
    localStorage.setItem('theme', next === 'light' ? 'light' : 'dark')
    themeIcon.value = next === 'light' ? '☀️' : '🌙'
}

// ── UI 狀態 ───────────────────────────────────────────────────────
const showNicknameOverlay = ref(false)
const overlayNickname = ref('')
const overlayInputRef = ref(null)
const nicknameError = ref('')
const pendingRoomId = ref('')
const pendingPlayerId = ref('')
const submittedAnswerLocal = ref(null)
const revealAnimDone = ref(false)
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null

function showToast(msg, type = '', duration = 3000) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

// ── Socket ────────────────────────────────────────────────────────
const {
    state,
    connectAndJoin,
    toggleReady,
    startGame,
    selectTopic,
    submitAnswer,
    submitGuess,
    nextRound,
    endGame,
    restartGame,
    kickPlayer,
    sendReaction,
    swapPreview,
    confirmPreview,
    setOnline,
} = useSocket({
    onRoomState() {
        showNicknameOverlay.value = false
        revealAnimDone.value = false
    },
    onJoinError(msg) {
        showNicknameOverlay.value = true
        nicknameError.value = msg
        nextTick(() => overlayInputRef.value?.focus())
    },
    onRoundRevealed({ currentRound }) {
        revealAnimDone.value = false
        submittedAnswerLocal.value = null
        if (currentRound.subject_player_id === state.myPlayerId) return
        const myGuess = state.guesses.find(g => g.player_id === state.myPlayerId)
        if (myGuess?.is_correct) confetti()
    },
    onAnswerAccepted(answer) {
        submittedAnswerLocal.value = answer
        showToast('✓ 答案已送出！', 'success')
    },
    onKicked() {
        showToast('你已被房主踢出房間 😢', 'error', 5000)
        setTimeout(() => router.push('/'), 2500)
    },
    onError(msg) {
        showToast('❌ ' + msg, 'error')
    },
    onReconnect() {
        showToast('✓ 已重新連線', 'success', 2500)
    },
})

// ── Init ─────────────────────────────────────────────────────────
onMounted(() => {
    const roomId = (route.query.id || '').toString().toUpperCase()

    if (!roomId) { router.push('/'); return }

    const playerId = getOrCreatePlayerId()
    const nickname = (route.query.nickname || getSavedNickname() || '').toString()

    if (nickname) {
        connectAndJoin(roomId, playerId, nickname)
    } else {
        showNicknameOverlay.value = true
        // store pending info in local refs (state is readonly)
        pendingRoomId.value = roomId
        pendingPlayerId.value = playerId
        nextTick(() => overlayInputRef.value?.focus())
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('beforeunload', handleBeforeUnload)
})

function handleVisibility() {
    setOnline(document.visibilityState !== 'hidden')
}
function handleBeforeUnload() {
    setOnline(false)
}

// ── 暱稱 Overlay ─────────────────────────────────────────────────
function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { nicknameError.value = '請輸入暱稱'; return }
    const roomId = pendingRoomId.value || (route.query.id || '').toString().toUpperCase()
    const playerId = pendingPlayerId.value || getOrCreatePlayerId()
    saveNickname(nickname)
    connectAndJoin(roomId, playerId, nickname)
    showNicknameOverlay.value = false
}

// ── 動作包裝 ─────────────────────────────────────────────────────
function handleSubmitAnswer(letter) {
    if (state.hasSubmittedAnswer) return
    submittedAnswerLocal.value = letter
    submitAnswer(letter)
}

function handleSubmitGuess(letter) {
    submitGuess(letter)
}

function handleKick(playerId, nickname) {
    if (!confirm(`確定要踢出 ${nickname}？`)) return
    kickPlayer(playerId)
}

function copyLink() {
    const url = `${location.origin}${location.pathname}#/room?id=${state.roomId}`
    navigator.clipboard.writeText(url)
        .then(() => showToast('房間連結已複製 🔗', 'success'))
        .catch(() => showToast('請手動複製連結', 'error'))
}

// ── Confetti 彩帶 ─────────────────────────────────────────────────
function confetti() {
    // 簡易彩帶：建立隨機色粒子
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999'
    document.body.appendChild(container)
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6']
    for (let i = 0; i < 60; i++) {
        const el = document.createElement('div')
        const x = Math.random() * 100
        const delay = Math.random() * 0.5
        el.style.cssText = `
      position:absolute;top:-10px;left:${x}%;
      width:8px;height:8px;border-radius:50%;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      animation:confetti-fall 2s ${delay}s ease-in forwards;
    `
        container.appendChild(el)
    }
    setTimeout(() => container.remove(), 3000)
}
</script>
