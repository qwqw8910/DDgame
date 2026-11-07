<template>
    <div class="page-wrapper page-wrapper--scrollable bg-canvas font-text text-ink">
        <ConnectionBanner :connected="state.connected" :active="!!state.room" />

        <RoomHeader class="sticky top-0" title="懂我再說" :room-id="state.roomId" :progress="headerProgress"
            @leave="goHome" @invite="copyLink">
            <template #players="{ btnClass }">
                <RoomPlayerPanel :players="state.players" :my-id="state.myPlayerId"
                    :host-id="state.room?.host_player_id" :is-host="state.isHost" :trigger-class="btnClass"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
            </template>
        </RoomHeader>

        <!-- 載入中 -->
        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <!-- 被踢出 / 無法加入 -->
        <RoomBlocked v-else-if="blocked" :kicked="blocked.kicked" :message="blocked.message" @back="goLobby" />

        <!-- 暱稱遮罩（直接點邀請連結進來、或暱稱被用走了） -->
        <RoomNicknameGate v-else-if="showNicknameOverlay" title="懂我再說" :room-id="pendingRoomId"
            :server-error="nicknameError" @submit="joinWithNickname" />

        <!-- 大廳 -->
        <main v-else-if="state.room?.status === 'waiting'" class="mx-auto flex w-full max-w-3xl flex-1 flex-col p-3">
            <RoomLobby class="flex-1" :room-id="state.roomId" :players="state.players" :my-id="state.myPlayerId"
                :host-id="state.room.host_player_id" :is-host="state.isHost"
                :min-players="MIN_PLAYERS" :max-players="state.room.max_players" ready-mode
                @invite="copyLink" @start="startGame" @ready="setReady" />
        </main>

        <!-- 遊戲主畫面 -->
        <main v-else-if="state.room" class="main-content main-content--room"
            :class="{ 'main-content--game': state.room.status === 'playing' }">
            <template v-if="state.room.status === 'playing'">
                <!-- 伺服器重啟後 gameState 遺失，顯示提示等待房主重新開始 -->
                <div v-if="!state.currentRound" class="game-section text-center py-12 px-4">
                    <div class="text-5xl mb-4">🔌</div>
                    <h2 class="section-title mb-2">伺服器已重啟</h2>
                    <p class="text-body text-[15px] mb-6">遊戲狀態已中斷，請房主點「重新開始」繼續玩！</p>
                    <button v-if="state.isHost" class="btn-primary" @click="restartGame">🔄 重新開始</button>
                    <p v-else class="section-hint mt-2">等待房主重新開始遊戲…</p>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useSocket } from '../composables/useSocket.js'
import { getOrCreatePlayerId, getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import TopicSection from '../components/TopicSection.vue'
import AnswerSection from '../components/AnswerSection.vue'
import GuessSection from '../components/GuessSection.vue'
import RevealSection from '../components/RevealSection.vue'
import FinishedSection from '../components/FinishedSection.vue'
import PreviewSection from '../components/PreviewSection.vue'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import RoomHeader from '@/shared/components/room/RoomHeader.vue'
import RoomLobby from '@/shared/components/room/RoomLobby.vue'
import RoomNicknameGate from '@/shared/components/room/RoomNicknameGate.vue'
import RoomBlocked from '@/shared/components/room/RoomBlocked.vue'

// 伺服器 start_game 的下限
const MIN_PLAYERS = 2

const router = useRouter()
const route = useRoute()

// ── UI 狀態 ───────────────────────────────────────────────────────
const showNicknameOverlay = ref(false)
const nicknameError = ref('')
const pendingRoomId = ref((route.query.id || '').toString().toUpperCase())
// 進不去房間 / 被踢出：{ kicked, message }
const blocked = ref(null)
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
    setReady,
    startGame,
    selectTopic,
    submitAnswer,
    submitGuess,
    nextRound,
    endGame,
    restartGame,
    kickPlayer,
    transferHost,
    sendReaction,
    swapPreview,
    confirmPreview,
    setOnline,
    leaveRoom,
    disconnect,
} = useSocket({
    onRoomState() {
        showNicknameOverlay.value = false
        revealAnimDone.value = false
    },
    onJoinError(msg, code) {
        // 已在房內的錯誤（例如踢人失敗）用 toast；進房時的錯誤才擋畫面
        if (state.room) { showToast(msg, 'error'); return }
        if (code === 'NICKNAME_TAKEN') {
            nicknameError.value = msg
            showNicknameOverlay.value = true
            return
        }
        blocked.value = { kicked: false, message: msg }
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
        showToast('答案已送出', 'success')
    },
    onKicked() {
        blocked.value = { kicked: true, message: '你被房主踢出了房間' }
    },
    onError(msg) {
        showToast(msg, 'error')
    },
    onReconnect() {
        // 首次連線也會觸發 connect，只有已在房內時才算「重新連線」
        if (state.room) showToast('已重新連線', 'success', 2500)
    },
})

// ── Init ─────────────────────────────────────────────────────────
onMounted(() => {
    const roomId = pendingRoomId.value

    if (!roomId) { router.push('/game'); return }

    const playerId = getOrCreatePlayerId()
    const nickname = (route.query.nickname || getSavedNickname() || '').toString()

    if (nickname) {
        connectAndJoin(roomId, playerId, nickname)
    } else {
        showNicknameOverlay.value = true
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
    document.removeEventListener('visibilitychange', handleVisibility)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    clearTimeout(_toastTimer)
    disconnect() // 瀏覽器返回鍵離開頁面時也要斷線，避免留下幽靈在線玩家
})

function handleVisibility() {
    setOnline(document.visibilityState !== 'hidden')
}
function handleBeforeUnload() {
    setOnline(false)
}

// ── 暱稱遮罩 ─────────────────────────────────────────────────────
function joinWithNickname(nickname) {
    saveNickname(nickname)
    nicknameError.value = ''
    showNicknameOverlay.value = false
    connectAndJoin(pendingRoomId.value, getOrCreatePlayerId(), nickname)
}

// ── 頂列進度 ─────────────────────────────────────────────────────
const headerProgress = computed(() => (state.room?.status === 'playing' && state.currentRound
    ? `第 ${state.currentRound.round_number} 回合` : ''))

// ── 離開 ─────────────────────────────────────────────────────────
function goLobby() {
    disconnect()
    router.push('/game')
}
async function goHome() {
    if (state.room?.status === 'playing' && !confirm('遊戲進行中，確定要離開房間嗎？')) return
    await leaveRoom()
    goLobby()
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

async function copyLink() {
    const url = `${location.origin}${location.pathname}#/room?id=${state.roomId}`
    try {
        await navigator.clipboard.writeText(url)
        showToast('邀請連結已複製', 'success')
    } catch {
        showToast(`無法自動複製，請告訴朋友房號 ${state.roomId}`, 'error', 5000)
    }
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
