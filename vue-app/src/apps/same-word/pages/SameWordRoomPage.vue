<template>
    <div class="sw-scope relative flex h-[100dvh] w-full flex-col overflow-hidden bg-dark pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <SwAmbient :mood="mood" />
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />
        <!-- Header -->
        <header class="relative z-40 shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-header backdrop-blur-md">
            <div class="flex items-center gap-1 min-w-0">
                <button class="header-back-btn" aria-label="離開房間" @click="goHome">←<span class="hidden sm:inline"> 離開</span></button>
                <span class="font-bold text-heading truncate">同詞相遇</span>
                <span v-if="view && view.round" class="badge hidden sm:inline-flex">第 {{ view.round }} 輪</span>
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
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label class="flex flex-col gap-1 text-sm text-label">思考時間
                        <select class="game-input cursor-pointer" :disabled="!roomState.isHost" :value="opts.timerSeconds"
                            @change="e => setOptions({ timerSeconds: +e.target.value })">
                            <option v-for="s in timerChoices" :key="s" :value="s">{{ s }} 秒</option>
                        </select>
                    </label>
                    <label class="flex flex-col gap-1 text-sm text-label">回合上限
                        <select class="game-input cursor-pointer" :disabled="!roomState.isHost" :value="opts.maxRounds"
                            @change="e => setOptions({ maxRounds: +e.target.value })">
                            <option v-for="r in ROUND_PRESETS" :key="r" :value="r">{{ r === 0 ? '不限' : `${r} 輪` }}</option>
                        </select>
                    </label>
                    <label class="flex flex-col gap-1 text-sm text-label">開局線索
                        <select class="game-input cursor-pointer" :disabled="!roomState.isHost" :value="opts.starterMode"
                            @change="e => setOptions({ starterMode: e.target.value })">
                            <option value="free">自由開始</option>
                            <option value="seed">隨機給兩個詞當線索</option>
                        </select>
                    </label>
                    <label class="flex items-center justify-between gap-2 self-end rounded-lg border border-border px-3 py-2.5 text-sm text-label">
                        離譜票
                        <input type="checkbox" class="h-5 w-5" :checked="opts.outlierVote" :disabled="!roomState.isHost"
                            @change="e => setOptions({ outlierVote: e.target.checked })" />
                    </label>
                </div>

                <button v-if="roomState.isHost" class="btn-primary btn-full" :disabled="roomState.players.length < MIN_PLAYERS" @click="start">
                    {{ roomState.players.length < MIN_PLAYERS ? `至少 ${MIN_PLAYERS} 人才能開始` : '開始遊戲' }}
                </button>
                <p v-else class="m-0 text-center text-sm text-body">等房主開始遊戲…</p>
                <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="btn-secondary btn-full" @click="upgradeFromSpectator">加入房間</button>
            </section>

            <!-- ═════════ 書寫 ═════════ -->
            <template v-else-if="phase === 'writing'">
                <SwPrompt :round="prevRound" :seed="view.seed" :names="names" :my-id="myId" />
                <div class="game-card !p-4">
                    <SwWriteBox :seconds="secondsLeft" :total="opts.timerSeconds" :my-word="view.myWord"
                        :can-write="canWrite" :round="view.round" @submit="submit" />
                </div>
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
                    <h2 class="m-0 mb-3 text-center text-lg text-heading">第 {{ view.round }} 輪揭曉</h2>
                    <SwRevealBoard :round="lastRound" :ids="participants" :names="names" :my-id="myId"
                        :my-vote="view.myOutlierVote" :vote-seconds="voteSeconds" :can-vote="canVote" @vote="onVote" />
                </div>
                <div class="flex flex-wrap items-center justify-center gap-2">
                    <template v-if="roomState.isHost">
                        <button class="btn-primary !w-auto !px-5" @click="nextRound">
                            {{ view.endsAfterThis ? '看結算' : '下一輪' }}
                        </button>
                        <button v-if="!view.endsAfterThis" class="btn-ghost-sm" @click="confirmFinish">提前結算</button>
                    </template>
                    <p v-else class="m-0 text-sm text-body">
                        {{ view.endsAfterThis ? '等房主公布結算…' : '等房主開始下一輪…' }}
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

        <SwFxLayer />

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
import SwResultBoard from '../components/SwResultBoard.vue'
import SwFxLayer from '../components/SwFxLayer.vue'
import SwAmbient from '../components/SwAmbient.vue'
import { spawnTier, spawnFx } from '../composables/useSwFx.js'
import { MIN_PLAYERS, ROUND_PRESETS, TIMER_PRESETS } from '../data/constants.js'

const route = useRoute()
const router = useRouter()

const {
    state, roomState, connect,
    setOptions, start, submit, voteOutlier, nextRound, finishNow, restart,
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
const opts = computed(() => view.value?.options ?? { timerSeconds: 45, maxRounds: 8, starterMode: 'free', outlierVote: true })
const isParticipant = computed(() => view.value?.activeIds?.includes(myId.value) && !view.value.leftIds.includes(myId.value))
const participants = computed(() => (view.value?.activeIds ?? []).filter(id => !view.value.leftIds.includes(id)))
const canWrite = computed(() => !!isParticipant.value)
const lastRound = computed(() => view.value.rounds[view.value.rounds.length - 1])
// 書寫階段的線索：上一輪（已揭曉）雙方／全員寫的詞，更早的不顯示
const prevRound = computed(() => {
    const r = view.value.rounds[view.value.rounds.length - 1]
    return r ? { number: view.value.rounds.length, words: r.words } : null
})

// 氛圍色調：揭曉偏暖，結算偏派對，其餘平靜
const mood = computed(() => ({ revealed: 'warm', finished: 'party' })[phase.value] ?? 'calm')

// 計時選項：預設值之外若房主設過自訂值也要列出
const timerChoices = computed(() => [...new Set([...TIMER_PRESETS, opts.value.timerSeconds])].sort((a, b) => a - b))

// ── 時間 ──────────────────────────────────────────────────────────
const now = ref(Date.now())
let _tick = null
const secondsLeft = computed(() => (view.value?.roundEndsAt ? (view.value.roundEndsAt - now.value) / 1000 : 0))
const voteSeconds = computed(() => {
    const end = lastRound.value?.outlierEndsAt
    return end ? Math.max(0, Math.ceil((end - now.value) / 1000)) : 0
})
const canVote = computed(() => phase.value === 'revealed' && opts.value.outlierVote && !!isParticipant.value && voteSeconds.value > 0)

// ── 特效：揭曉時依新配對的最高等級放特效；結算時放慶祝 ───────────
// 輪次 + 階段變化才觸發一次（重連補發同一份視圖不會重放）
const TIER_ORDER = ['soulmates', 'telepathy', 'in-sync', 'compatible', 'slow-burn', 'needs-work', 'barely', 'near-miss']
let _fxKey = ''
watch(() => [phase.value, view.value?.round], ([p, r]) => {
    const key = `${p}:${r}`
    if (key === _fxKey) return
    _fxKey = key
    if (p === 'revealed' && lastRound.value?.newPairs.length) {
        const best = TIER_ORDER.find(t => lastRound.value.newPairs.some(np => np.tierId === t))
        spawnTier(best, 0.5, 0.35)
    } else if (p === 'finished' && view.value.result) {
        const r2 = view.value.result
        if (r2.unique) { spawnFx('confetti', 0.5, 0.45); spawnFx('sunburst', 0.5, 0.3) }
        else if (r2.bestPairs.length) { spawnFx('confetti', 0.3, 0.5); spawnFx('confetti', 0.7, 0.5) }
    }
})

function onVote(id) {
    voteOutlier(view.value.myOutlierVote === id ? null : id)
}

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

<style scoped>
/* 卡片半透明＋毛玻璃，讓背後的色光與粒子透出來 */
.sw-scope :deep(.game-card) {
    background: color-mix(in srgb, var(--color-card-solid) 55%, transparent);
    backdrop-filter: blur(14px) saturate(140%);
    box-shadow: 0 8px 32px var(--color-shadow-ambient), inset 0 1px 0 rgba(255, 255, 255, .06);
}
</style>
