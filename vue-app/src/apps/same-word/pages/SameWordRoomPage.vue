<template>
    <div class="sw-scope relative flex h-[100dvh] w-full flex-col overflow-hidden bg-canvas font-text text-ink pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />

        <RoomHeader title="同詞相遇" :room-id="roomState.roomId" :progress="headerProgress"
            @leave="goHome" @invite="handleCopyLink">
            <template #players="{ btnClass }">
                <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                    :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost" :trigger-class="btnClass"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
            </template>
        </RoomHeader>

        <!-- 載入中 -->
        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <!-- 被踢出 / 無法加入 -->
        <RoomBlocked v-else-if="state.kicked || (state.error && !roomState.room && !nicknameTaken)" :kicked="!!state.kicked"
            :message="state.kicked || state.error" @back="goLobby" />

        <!-- 暱稱遮罩 -->
        <RoomNicknameGate v-else-if="showNicknameOverlay || nicknameTaken" :server-error="nicknameTaken ? state.error : ''" title="同詞相遇" :room-id="(route.query.id || '').toUpperCase()"
            @submit="joinWithNickname" />

        <main v-else-if="roomState.room && view" class="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-3">
            <RoomSpectatorBar v-if="!isParticipant && phase !== 'waiting'"
                :can-join="roomState.isSpectator && roomState.spectatorCanJoin" @join="upgradeFromSpectator" />

            <!-- ═════════ 大廳 ═════════ -->
            <RoomLobby v-if="phase === 'waiting'" class="flex-1" :room-id="roomState.roomId" :players="roomState.players"
                :my-id="myId" :host-id="view.hostId" :is-host="roomState.isHost"
                :min-players="MIN_PLAYERS" :max-players="roomState.room.max_players"
                :can-join="roomState.isSpectator && roomState.spectatorCanJoin"
                @invite="handleCopyLink" @start="start" @join="upgradeFromSpectator">
                <template #settings>
                    <div class="grid grid-cols-3 gap-2 max-sm:grid-cols-1" role="radiogroup" aria-label="遊戲模式">
                        <button v-for="m in MODE_CHOICES" :key="m.id" type="button" role="radio" :aria-checked="opts.mode === m.id"
                            :disabled="!roomState.isHost"
                            class="flex min-h-11 flex-col gap-1 rounded-inset border-0 p-3 text-left transition-[background-color,box-shadow] duration-150 ease-soft enabled:cursor-pointer disabled:cursor-default motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                            :class="opts.mode === m.id
                                ? 'bg-brand-soft shadow-[inset_0_0_0_2px_var(--color-brand)]'
                                : 'bg-fill shadow-[inset_0_0_0_1px_var(--color-hairline)] enabled:hover:bg-hairline'"
                            @click="setOptions({ mode: m.id })">
                            <span class="text-lg text-ink">{{ m.title }}</span>
                            <span class="text-base leading-snug text-ink-muted">{{ m.desc }}</span>
                        </button>
                    </div>

                    <div class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <label v-if="opts.mode === 'prompts'" class="flex flex-col gap-2 text-base text-ink-muted">題目數量
                            <select :class="selectClass" :disabled="!roomState.isHost" :value="opts.rounds"
                                @change="e => setOptions({ rounds: +e.target.value })">
                                <option v-for="r in roundChoices" :key="r" :value="r">{{ r }} 題</option>
                            </select>
                        </label>
                        <label v-if="opts.mode !== 'relay'" class="flex flex-col gap-2 text-base text-ink-muted">思考時間
                            <select :class="selectClass" :disabled="!roomState.isHost" :value="opts.timerSeconds"
                                @change="e => setOptions({ timerSeconds: +e.target.value })">
                                <option v-for="s in timerChoices" :key="s" :value="s">{{ s }} 秒</option>
                            </select>
                        </label>
                        <template v-else>
                            <label class="flex flex-col gap-2 text-base text-ink-muted">每棒時間
                                <select :class="selectClass" :disabled="!roomState.isHost" :value="opts.turnSeconds"
                                    @change="e => setOptions({ turnSeconds: +e.target.value })">
                                    <option v-for="s in turnChoices" :key="s" :value="s">{{ s }} 秒{{ s <= 5 ? '（極限）' : '' }}</option>
                                </select>
                            </label>
                            <label class="flex flex-col gap-2 text-base text-ink-muted">每人接幾次
                                <select :class="selectClass" :disabled="!roomState.isHost" :value="opts.laps"
                                    @change="e => setOptions({ laps: +e.target.value })">
                                    <option v-for="n in lapChoices" :key="n" :value="n">{{ n }} 次（共 {{ n * roomState.players.length }} 段）</option>
                                </select>
                            </label>
                        </template>
                        <label v-if="opts.mode === 'prompts'"
                            class="flex min-h-11 items-center justify-between gap-3 rounded-inset bg-fill px-4 py-3 sm:col-span-2"
                            :class="roomState.isHost ? 'cursor-pointer' : 'cursor-default'">
                            <span class="flex flex-col gap-0.5">
                                <span class="text-lg text-ink">終局挑戰</span>
                                <span class="text-base leading-snug text-ink-muted">最後全員合作，一起收斂到同一個詞（最多 3 次）</span>
                            </span>
                            <input type="checkbox" class="size-5 shrink-0 accent-brand" :checked="opts.converge" :disabled="!roomState.isHost"
                                @change="e => setOptions({ converge: e.target.checked })" />
                        </label>
                    </div>

                    <p class="m-0 mt-4 text-base leading-relaxed text-ink-muted">
                        <template v-if="opts.mode === 'relay'">玩法：抽一張主題卡，依隨機順序輪流接「三個字」，每棒只看得到上一個人寫的三個字。全部接完揭曉整段話，給別人的每一段按讚或大便，最後頒發神接手、大便製造機、閃電手、卡關王。約 {{ estimateMinutes }} 分鐘。</template>
                        <template v-else-if="opts.mode === 'chain'">玩法：第 1 輪給題目，之後每輪看上一輪大家的詞，寫一個新詞（用過的不能再寫）。同詞 k 人各得 k−1 分；全員同詞 +3 並提早通關。共 {{ CHAIN_ROUNDS }} 輪，約 {{ estimateMinutes }} 分鐘。</template>
                        <template v-else>玩法：每題同時寫下第一個想到的詞。同詞 k 人，每人得 k−1 分；全員同詞再各 +3。約 {{ estimateMinutes }} 分鐘一局。</template>
                    </p>
                </template>
            </RoomLobby>

            <!-- ═════════ 接句：輪流接三個字 ═════════ -->
            <template v-else-if="phase === 'relay' && view.relay">
                <SwRelayTurn :relay="view.relay" :names="names" :my-id="myId" :can-write="!!isParticipant"
                    :participants="participants" :turn-seconds="opts.turnSeconds" :now="now" @submit="submitSegment" />
                <div v-if="roomState.isHost" class="text-center">
                    <button type="button" :class="secondaryBtn" @click="confirmFinish">提前結束</button>
                </div>
            </template>

            <!-- ═════════ 接句：揭曉整段話＋投票 ═════════ -->
            <SwRelayStory v-else-if="phase === 'voting' && view.relay" :key="view.relay.total" :relay="view.relay" :names="names"
                :my-id="myId" :can-vote="!!isParticipant" :is-host="roomState.isHost" :now="now"
                @vote="vote" @end="endVoting" />

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
                <SwRelayResult v-if="view.result.mode === 'relay'" :result="view.result" :names="names" />
                <SwResultBoard v-else :result="view.result" :names="names" />
                <div class="flex flex-wrap items-center justify-center gap-2 pb-2">
                    <button v-if="roomState.isHost" type="button" :class="primaryBtn" @click="restart">回大廳再玩一局</button>
                    <p v-else class="m-0 text-base text-ink-muted">等房主回大廳…</p>
                </div>
            </template>
        </main>


        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSameWord } from '../composables/useSameWord.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import RoomHeader from '@/shared/components/room/RoomHeader.vue'
import RoomLobby from '@/shared/components/room/RoomLobby.vue'
import RoomNicknameGate from '@/shared/components/room/RoomNicknameGate.vue'
import RoomBlocked from '@/shared/components/room/RoomBlocked.vue'
import RoomSpectatorBar from '@/shared/components/room/RoomSpectatorBar.vue'
import SwWriteBox from '../components/SwWriteBox.vue'
import SwRevealBoard from '../components/SwRevealBoard.vue'
import SwPrompt from '../components/SwPrompt.vue'
import SwScoreboard from '../components/SwScoreboard.vue'
import SwResultBoard from '../components/SwResultBoard.vue'
import SwRelayTurn from '../components/SwRelayTurn.vue'
import SwRelayStory from '../components/SwRelayStory.vue'
import SwRelayResult from '../components/SwRelayResult.vue'
import { preloadBadges, MIN_PLAYERS, ROUND_PRESETS, TIMER_PRESETS, CHAIN_ROUNDS, MODE_CHOICES, TURN_PRESETS, LAP_PRESETS } from '../data/constants.js'
import { primaryBtn, secondaryBtn } from '../data/ui.js'

const route = useRoute()
const router = useRouter()

const {
    state, roomState, connect,
    setOptions, start, submit, react, nextRound, finishNow, restart,
    submitSegment, vote, endVoting,
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
// 進房時暱稱被用走了：留在遮罩上換一個，而不是丟到「無法進入」
const nicknameTaken = computed(() => state.errorCode === 'NICKNAME_TAKEN' && !roomState.room)
function joinWithNickname(nickname) {
    clearError()
    saveNickname(nickname)
    showNicknameOverlay.value = false
    connect((route.query.id || '').toUpperCase(), nickname, false)
}

// ── 視圖衍生資料 ──────────────────────────────────────────────────
const view = computed(() => state.view)
const phase = computed(() => view.value?.phase ?? 'waiting')
const myId = computed(() => roomState.myPlayerId)
const names = computed(() => view.value?.names ?? {})
const opts = computed(() => view.value?.options ?? { mode: 'prompts', rounds: 5, timerSeconds: 30, converge: true, revealSeconds: 10, turnSeconds: 8, laps: 2 })
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
    if (kind === 'converge') return `終局挑戰 第 ${phase.value === 'revealed' ? lastRound.value.attempt : v.attempt} 次`
    if (opts.value.mode === 'chain') return `接龍 第 ${v.promptIndex} / ${v.promptTotal} 輪`
    return `第 ${v.promptIndex} / ${v.promptTotal} 題`
})
// 頂列只在遊戲進行中顯示進度
const headerProgress = computed(() => {
    const r = view.value?.relay
    if (phase.value === 'relay' && r) return `接句 ${Math.min(r.done + 1, r.total)} / ${r.total}`
    if (phase.value === 'voting') return '揭曉投票'
    return view.value?.round && ['writing', 'revealed'].includes(phase.value) ? roundLabel.value : ''
})

const selectClass = 'h-11 w-full rounded-inset border-0 bg-fill px-3 text-base text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)] enabled:cursor-pointer disabled:cursor-default disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

// 計時與題數選項：預設值之外若房主設過自訂值也要列出
const timerChoices = computed(() => [...new Set([...TIMER_PRESETS, opts.value.timerSeconds])].sort((a, b) => a - b))
const roundChoices = computed(() => [...new Set([...ROUND_PRESETS, opts.value.rounds])].sort((a, b) => a - b))
const turnChoices = computed(() => [...new Set([...TURN_PRESETS, opts.value.turnSeconds])].sort((a, b) => a - b))
const lapChoices = computed(() => [...new Set([...LAP_PRESETS, opts.value.laps])].sort((a, b) => a - b))
const estimateMinutes = computed(() => {
    if (opts.value.mode === 'relay') {
        const segs = opts.value.laps * Math.max(MIN_PLAYERS, roomState.players.length)
        return Math.max(2, Math.round((segs * (opts.value.turnSeconds * 0.7 + 1) + 75) / 60))
    }
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
    const msg = phase.value === 'relay' ? '要提前結束嗎？會直接揭曉目前接到的部分。' : '要提前結算這一局嗎？'
    if (confirm(msg)) finishNow()
}

async function handleCopyLink() {
    if (await copyInviteLink()) showToast('邀請連結已複製', 'success')
    else showToast(`無法自動複製，請告訴朋友房號 ${roomState.roomId}`, 'error', 5000)
}

// ── 離開 ──────────────────────────────────────────────────────────
function goLobby() {
    disconnect()
    router.push({ name: 'same-word' })
}
async function goHome() {
    if (['writing', 'revealed', 'relay', 'voting'].includes(phase.value) && isParticipant.value
        && !confirm('遊戲進行中離開，這一局你會被排除。確定要離開嗎？')) return
    await leaveRoom()
    goLobby()
}

// ── 初始化 ────────────────────────────────────────────────────────
onMounted(() => {
    _tick = setInterval(() => { now.value = Date.now() }, 250)
    preloadBadges()

    const roomId = (route.query.id || '').toUpperCase()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    const isCreating = route.query.create === '1'
    const max = parseInt(route.query.max) || 8

    if (!roomId) { router.push({ name: 'same-word' }); return }
    if (!nickname) {
        showNicknameOverlay.value = true
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
