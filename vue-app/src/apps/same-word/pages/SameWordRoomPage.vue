<template>
    <div class="sw-scope relative flex h-[100dvh] w-full flex-col overflow-hidden bg-dark pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />
        <!-- Header -->
        <header class="relative z-40 shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-header backdrop-blur-md">
            <div class="flex items-center gap-1 min-w-0">
                <button class="header-back-btn" aria-label="離開房間" @click="goHome">←<span class="hidden sm:inline"> 離開</span></button>
                <span class="font-bold text-heading truncate">同詞相遇</span>
                <span v-if="view && view.round && phase !== 'finished'" class="badge hidden sm:inline-flex">{{ roundLabel }}</span>
            </div>
            <span class="font-mono font-semibold tracking-[3px] text-neon-purple-light">{{ roomState.roomId }}</span>
            <div class="flex items-center gap-1 shrink-0">
                <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                    :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
                <button class="header-icon-btn" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink">🔗</button>
            </div>
        </header>

        <!-- 載入中 -->
        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <!-- 被踢出 / 無法加入 -->
        <div v-else-if="state.kicked || (state.error && !roomState.room)" class="overlay">
            <div class="overlay-card text-center">
                <p class="text-heading text-lg font-semibold mb-1">{{ state.kicked ? '你已離開房間' : '無法進入房間' }}</p>
                <p class="text-body mb-4">{{ state.kicked || state.error }}</p>
                <button class="btn-primary" @click="goLobby">回到入口</button>
            </div>
        </div>

        <!-- 暱稱遮罩 -->
        <div v-else-if="showNicknameOverlay" class="overlay">
            <div class="overlay-card">
                <div class="section-header mb-4"><h2 class="neon-heading text-xl">輸入你的暱稱</h2></div>
                <div class="input-wrapper mb-3">
                    <input v-model="overlayNickname" ref="overlayInputRef" class="game-input" type="text"
                        placeholder="你的暱稱…" maxlength="12" aria-label="暱稱" autocomplete="off" @keydown.enter="joinWithNickname" />
                </div>
                <button class="btn-primary" @click="joinWithNickname">加入房間</button>
            </div>
        </div>

        <main v-else-if="roomState.room && view" class="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-3">
            <!-- 觀戰提示 -->
            <div v-if="!isParticipant && phase !== 'waiting'" class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm" role="status">
                <span class="text-label">你正在觀戰，這局結束後可加入。</span>
                <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="btn-primary !w-auto !px-3 !py-1.5 text-sm" @click="upgradeFromSpectator">加入房間</button>
            </div>

            <!-- ═════════ 大廳 ═════════ -->
            <section v-if="phase === 'waiting'" class="game-card flex flex-col gap-4 !p-4">
                <div class="flex items-center justify-between gap-2">
                    <h2 class="m-0 text-lg text-heading">等待玩家（{{ roomState.players.length }}／{{ roomState.room.max_players }}）</h2>
                    <button class="btn-ghost-sm" @click="handleCopyLink">🔗 複製邀請</button>
                </div>
                <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                    <li v-for="p in roomState.players" :key="p.id" class="badge" :class="p.id === myId ? 'badge-me' : ''">
                        {{ p.nickname }}<span v-if="p.id === view.hostId"> 👑</span>
                    </li>
                </ul>

                <!-- 設定：房主可改，其他人只看 -->
                <div class="grid grid-cols-2 gap-2" role="radiogroup" aria-label="遊戲模式">
                    <button v-for="m in MODE_CHOICES" :key="m.id" type="button" role="radio" :aria-checked="opts.mode === m.id"
                        :disabled="!roomState.isHost"
                        class="flex flex-col gap-0.5 rounded-xl border-2 p-3 text-left transition-colors disabled:cursor-default"
                        :class="opts.mode === m.id ? 'border-border-glow bg-card text-heading' : 'border-border text-body'"
                        @click="setOptions({ mode: m.id })">
                        <b>{{ m.emoji }} {{ m.title }}</b>
                        <span class="text-xs text-label">{{ m.desc }}</span>
                    </button>
                </div>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label v-if="opts.mode === 'prompts'" class="flex flex-col gap-1 text-sm text-label">題目數量
                        <select class="game-input cursor-pointer" :disabled="!roomState.isHost" :value="opts.rounds"
                            @change="e => setOptions({ rounds: +e.target.value })">
                            <option v-for="r in roundChoices" :key="r" :value="r">{{ r }} 題</option>
                        </select>
                    </label>
                    <label class="flex flex-col gap-1 text-sm text-label">思考時間
                        <select class="game-input cursor-pointer" :disabled="!roomState.isHost" :value="opts.timerSeconds"
                            @change="e => setOptions({ timerSeconds: +e.target.value })">
                            <option v-for="s in timerChoices" :key="s" :value="s">{{ s }} 秒</option>
                        </select>
                    </label>
                    <label v-if="opts.mode === 'prompts'" class="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2.5 text-sm text-label sm:col-span-2">
                        <span>🎯 終局挑戰<span class="block text-xs">最後全員合作，一起收斂到同一個詞（最多 3 次）</span></span>
                        <input type="checkbox" class="h-5 w-5 shrink-0" :checked="opts.converge" :disabled="!roomState.isHost"
                            @change="e => setOptions({ converge: e.target.checked })" />
                    </label>
                </div>
                <p class="m-0 text-xs text-label">
                    <template v-if="opts.mode === 'chain'">玩法：第 1 輪給題目，之後每輪看上一輪大家的詞，寫一個新詞（用過的不能再寫）。同詞 k 人各得 k−1 分；全員同詞 +3 並提早通關。共 {{ CHAIN_ROUNDS }} 輪，約 {{ estimateMinutes }} 分鐘。</template>
                    <template v-else>玩法：每題同時寫下第一個想到的詞。同詞 k 人，每人得 k−1 分；全員同詞再各 +3。約 {{ estimateMinutes }} 分鐘一局。</template>
                </p>

                <button v-if="roomState.isHost" class="btn-primary btn-full" :disabled="roomState.players.length < MIN_PLAYERS" @click="start">
                    {{ roomState.players.length < MIN_PLAYERS ? `至少 ${MIN_PLAYERS} 人才能開始` : '開始遊戲' }}
                </button>
                <p v-else class="m-0 text-center text-sm text-body">等房主開始遊戲…</p>
                <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="btn-secondary btn-full" @click="upgradeFromSpectator">加入房間</button>
            </section>

            <!-- ═════════ 書寫 ═════════ -->
            <template v-else-if="phase === 'writing'">
                <SwPrompt :kind="view.kind" :prompt="view.prompt" :prompt-index="view.promptIndex" :prompt-total="view.promptTotal"
                    :attempt="view.attempt" :chain-start="opts.mode === 'chain' && view.kind === 'prompt'" :used-words="usedWords"
                    :prev-words="prevWords" :names="names" :my-id="myId" />
                <div class="game-card !p-4">
                    <SwWriteBox :seconds="secondsLeft" :total="opts.timerSeconds" :my-word="view.myWord"
                        :can-write="canWrite" :round="view.round" @submit="submit" />
                </div>
                <SwScoreboard :ids="participants" :scores="view.scores" :names="names" :my-id="myId" />
                <ul class="m-0 flex list-none flex-wrap justify-center gap-2 p-0" aria-label="送出狀態">
                    <li v-for="id in participants" :key="id" class="badge transition-opacity"
                        :class="view.submitted?.[id] ? 'badge-me' : 'opacity-60'">
                        {{ view.submitted?.[id] ? '✅' : '✍️' }} {{ names[id] ?? '?' }}
                    </li>
                </ul>
                <div v-if="roomState.isHost" class="text-center">
                    <button class="btn-ghost-sm" @click="confirmFinish">提前結算</button>
                </div>
            </template>

            <!-- ═════════ 揭曉 ═════════ -->
            <template v-else-if="phase === 'revealed'">
                <div class="game-card !p-4">
                    <p class="m-0 mb-1 text-center text-xs text-label">{{ roundLabel }}</p>
                    <h2 class="m-0 mb-3 text-center text-lg text-heading">{{ lastRound.prompt ?? (lastRound.kind === 'chain' ? '接龍' : '終局挑戰') }}</h2>
                    <SwRevealBoard :round="lastRound" :round-key="view.round" :ids="participants" :names="names" :my-id="myId"
                        :my-reactions="view.myReactions" :can-react="!!isParticipant" @react="react" />
                </div>
                <SwScoreboard :ids="participants" :scores="view.scores" :deltas="lastRound.points" :names="names" :my-id="myId" />
                <div class="flex flex-wrap items-center justify-center gap-2">
                    <template v-if="roomState.isHost">
                        <button class="btn-primary !w-auto !px-5" @click="nextRound">
                            {{ view.nextStep ? '下一輪' : '看結算' }}<span v-if="autoSeconds > 0" class="tabular-nums">（{{ autoSeconds }}）</span>
                        </button>
                        <button v-if="view.nextStep" class="btn-ghost-sm" @click="confirmFinish">提前結算</button>
                    </template>
                    <p v-else class="m-0 text-sm text-body">
                        <span class="tabular-nums">{{ autoSeconds }}</span> 秒後{{ view.nextStep ? '進入下一輪' : '公布結算' }}
                    </p>
                </div>
            </template>

            <!-- ═════════ 結算 ═════════ -->
            <template v-else-if="phase === 'finished' && view.result">
                <SwResultBoard :result="view.result" :names="names" />
                <div class="flex flex-wrap items-center justify-center gap-2 pb-2">
                    <button v-if="roomState.isHost" class="btn-primary !w-auto !px-5" @click="restart">回大廳再玩一局</button>
                    <p v-else class="m-0 text-sm text-body">等房主回大廳…</p>
                </div>
            </template>
        </main>


        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSameWord } from '../composables/useSameWord.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import SwWriteBox from '../components/SwWriteBox.vue'
import SwRevealBoard from '../components/SwRevealBoard.vue'
import SwPrompt from '../components/SwPrompt.vue'
import SwScoreboard from '../components/SwScoreboard.vue'
import SwResultBoard from '../components/SwResultBoard.vue'
import { MIN_PLAYERS, ROUND_PRESETS, TIMER_PRESETS, CHAIN_ROUNDS, MODE_CHOICES } from '../data/constants.js'

const route = useRoute()
const router = useRouter()

const {
    state, roomState, connect,
    setOptions, start, submit, react, nextRound, finishNow, restart,
    clearError, clearNotice, disconnect, copyInviteLink,
    kickPlayer, transferHost, leaveRoom, upgradeFromSpectator,
} = useSameWord()

// ── Toast ─────────────────────────────────────────────────────────
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '', duration = 3000) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}
watch(() => state.error, (m) => { if (m && roomState.room) { showToast(m, 'error'); clearError() } })
watch(() => state.notice, (m) => { if (m) { showToast(m, 'info'); clearNotice() } })

// ── 暱稱遮罩 ──────────────────────────────────────────────────────
const showNicknameOverlay = ref(false)
const overlayNickname = ref('')
const overlayInputRef = ref(null)
function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { showToast('請輸入暱稱！', 'error'); return }
    saveNickname(nickname)
    showNicknameOverlay.value = false
    connect((route.query.id || '').toUpperCase(), nickname, false)
}

// ── 視圖衍生資料 ──────────────────────────────────────────────────
const view = computed(() => state.view)
const phase = computed(() => view.value?.phase ?? 'waiting')
const myId = computed(() => roomState.myPlayerId)
const names = computed(() => view.value?.names ?? {})
const opts = computed(() => view.value?.options ?? { mode: 'prompts', rounds: 5, timerSeconds: 30, converge: true, revealSeconds: 10 })
const isParticipant = computed(() => view.value?.activeIds?.includes(myId.value) && !view.value.leftIds.includes(myId.value))
const participants = computed(() => (view.value?.activeIds ?? []).filter(id => !view.value.leftIds.includes(id)))
const canWrite = computed(() => !!isParticipant.value)
const lastRound = computed(() => view.value.rounds[view.value.rounds.length - 1])
// 接龍：前面各輪出現過的詞（不能再寫），不分大小寫去重
const usedWords = computed(() => {
    if (opts.value.mode !== 'chain') return []
    const m = new Map()
    view.value.rounds.forEach(r => Object.values(r.words).forEach(w => { if (w && !m.has(w.toLowerCase())) m.set(w.toLowerCase(), w) }))
    return [...m.values()]
})
// 終局的線索：上一輪（已揭曉）每人寫的詞，更早的不顯示
const prevWords = computed(() => view.value.rounds[view.value.rounds.length - 1]?.words ?? {})
const roundLabel = computed(() => {
    const v = view.value
    if (!v) return ''
    const kind = phase.value === 'revealed' ? lastRound.value.kind : v.kind
    if (kind === 'converge') return `🎯 終局挑戰 第 ${phase.value === 'revealed' ? lastRound.value.attempt : v.attempt} 次`
    if (opts.value.mode === 'chain') return `🔗 接龍 第 ${v.promptIndex} / ${v.promptTotal} 輪`
    return `第 ${v.promptIndex} / ${v.promptTotal} 題`
})

// 計時與題數選項：預設值之外若房主設過自訂值也要列出
const timerChoices = computed(() => [...new Set([...TIMER_PRESETS, opts.value.timerSeconds])].sort((a, b) => a - b))
const roundChoices = computed(() => [...new Set([...ROUND_PRESETS, opts.value.rounds])].sort((a, b) => a - b))
const estimateMinutes = computed(() => {
    const perRound = opts.value.timerSeconds * 0.7 + opts.value.revealSeconds + 5
    const rounds = opts.value.mode === 'chain' ? CHAIN_ROUNDS : opts.value.rounds + (opts.value.converge ? 1.5 : 0)
    return Math.max(3, Math.round((perRound * rounds) / 60))
})

// ── 時間 ──────────────────────────────────────────────────────────
const now = ref(Date.now())
let _tick = null
const secondsLeft = computed(() => (view.value?.roundEndsAt ? (view.value.roundEndsAt - now.value) / 1000 : 0))
const autoSeconds = computed(() => (view.value?.autoNextAt ? Math.max(0, Math.ceil((view.value.autoNextAt - now.value) / 1000)) : 0))

function confirmFinish() {
    if (confirm('要提前結算這一局嗎？')) finishNow()
}

function handleCopyLink() {
    copyInviteLink()
    showToast('邀請連結已複製', 'success')
}

// ── 離開 ──────────────────────────────────────────────────────────
function goLobby() {
    disconnect()
    router.push({ name: 'same-word' })
}
async function goHome() {
    if (['writing', 'revealed'].includes(phase.value) && isParticipant.value
        && !confirm('遊戲進行中離開，這一局你會被排除。確定要離開嗎？')) return
    await leaveRoom()
    goLobby()
}

// ── 初始化 ────────────────────────────────────────────────────────
onMounted(() => {
    _tick = setInterval(() => { now.value = Date.now() }, 250)

    const roomId = (route.query.id || '').toUpperCase()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    const isCreating = route.query.create === '1'
    const max = parseInt(route.query.max) || 8

    if (!roomId) { router.push({ name: 'same-word' }); return }
    if (!nickname) {
        showNicknameOverlay.value = true
        nextTick(() => overlayInputRef.value?.focus())
        return
    }
    // 建立房間後立刻把 create=1 從網址移除，避免 F5 重整時重建
    if (isCreating) router.replace({ name: 'same-word-room', query: { id: roomId, nickname } })
    connect(roomId, nickname, isCreating, max)
})

onUnmounted(() => {
    clearInterval(_tick)
    clearTimeout(_toastTimer)
    disconnect() // 瀏覽器返回鍵離開頁面時也要斷線，避免留下幽靈在線玩家
})
</script>
