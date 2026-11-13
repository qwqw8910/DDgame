<template>
    <div class="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-canvas font-text text-ink pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />

        <RoomHeader title="點格棋" :room-id="roomState.roomId" :progress="headerProgress"
            @leave="goHome" @invite="handleCopyLink">
            <template #actions="{ btnClass }">
                <DbSoundButton :btn-class="btnClass" />
            </template>
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
        <RoomNicknameGate v-else-if="showNicknameOverlay || nicknameTaken" :server-error="nicknameTaken ? state.error : ''"
            title="點格棋" :room-id="(route.query.id || '').toUpperCase()" @submit="joinWithNickname" />

        <main v-else-if="roomState.room && view" class="relative z-10 mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-3">
            <RoomSpectatorBar v-if="!isPlayer && phase !== 'waiting'"
                :can-join="roomState.isSpectator && roomState.spectatorCanJoin" @join="upgradeFromSpectator" />

            <!-- ═════════ 大廳 ═════════ -->
            <RoomLobby v-if="phase === 'waiting'" class="flex-1" :room-id="roomState.roomId" :players="roomState.players"
                :my-id="myId" :host-id="view.hostId" :is-host="roomState.isHost"
                :min-players="MIN_PLAYERS" :max-players="MAX_PLAYERS"
                :can-join="roomState.isSpectator && roomState.spectatorCanJoin"
                @invite="handleCopyLink" @start="start" @join="upgradeFromSpectator">
                <template #settings>
                    <p :id="sizeLabelId" class="m-0 mb-2 text-base text-ink-muted">盤面大小</p>
                    <ToggleGroupRoot type="single" :model-value="String(opts.size)" :disabled="!roomState.isHost" :loop="false"
                        :aria-labelledby="sizeLabelId" class="grid grid-cols-2 gap-2 max-sm:grid-cols-1"
                        @update:model-value="v => { if (v) setOptions({ size: Number(v) }) }">
                        <ToggleGroupItem v-for="s in SIZE_CHOICES" :key="s.value" :value="String(s.value)" :class="choiceClass">
                            <span class="text-lg text-ink">{{ s.title }}</span>
                            <span class="text-base leading-snug text-ink-muted">{{ s.desc }}</span>
                        </ToggleGroupItem>
                    </ToggleGroupRoot>

                    <p :id="modeLabelId" class="m-0 mt-4 mb-2 text-base text-ink-muted">計分模式</p>
                    <ToggleGroupRoot type="single" :model-value="opts.mode" :disabled="!roomState.isHost" :loop="false"
                        :aria-labelledby="modeLabelId" class="grid grid-cols-2 gap-2 max-sm:grid-cols-1"
                        @update:model-value="v => { if (v) setOptions({ mode: v }) }">
                        <ToggleGroupItem v-for="m in MODE_CHOICES" :key="m.id" :value="m.id" :class="choiceClass">
                            <span class="text-lg text-ink">{{ m.title }}</span>
                            <span class="text-base leading-snug text-ink-muted">{{ m.desc }}</span>
                        </ToggleGroupItem>
                    </ToggleGroupRoot>

                    <p class="m-0 mt-4 text-base leading-relaxed text-ink-muted">
                        <template v-if="opts.mode === 'advanced'">進階模式：每格的分數會顯示在格子中央，上下左右對稱，兩邊機會相同。拿下格子得到格內分數，總分高者勝。</template>
                        <template v-else>普通模式：一格一分，拿最多格的人獲勝。先手每局輪流交換。</template>
                    </p>
                </template>
            </RoomLobby>

            <!-- ═════════ 對局／結算 ═════════ -->
            <template v-else>
                <div class="grid grid-cols-2 gap-3 max-sm:gap-2">
                    <DbScoreCard v-for="seat in [0, 1]" :key="seat" :seat="seat" :name="nameOfSeat(seat)"
                        :score="view.scores[seat]" :count="view.counts[seat]" :show-count="opts.mode === 'advanced'"
                        :active="phase === 'playing' && view.turn === seat" :is-me="view.mySeat === seat"
                        :online="isOnlineSeat(seat)" :outcome="outcomeOfSeat(seat)" />
                </div>

                <p class="m-0 text-center text-lg text-ink" role="status" aria-live="polite">{{ statusText }}</p>

                <DbBoard :key="view.startSeq" :size="opts.size" :mode="opts.mode" :lines="view.lines" :boxes="view.boxes"
                    :values="view.values" :last="view.last" :can-move="canMove" :initials="initials" @move="onMove" />

                <p v-if="opts.mode === 'advanced' && phase === 'playing'" class="m-0 text-center text-base text-ink-faint">
                    還剩 {{ remainingValue }} 分未被拿下（總共 {{ view.total }} 分）
                </p>

                <!-- 結算 -->
                <section v-if="phase === 'finished'" class="rounded-tile bg-raised p-5 text-center shadow-(--shadow-tile)"
                    aria-labelledby="db-result-title">
                    <h2 id="db-result-title" class="m-0 font-display text-3xl font-normal text-ink">{{ resultTitle }}</h2>
                    <p class="m-0 mt-2 text-base text-ink-muted">{{ resultDetail }}</p>
                    <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                        <button v-if="isPlayer" type="button" :class="primaryBtn" @click="restart">回大廳再玩一局</button>
                        <p v-else class="m-0 text-base text-ink-muted">等玩家回大廳…</p>
                    </div>
                </section>

                <!-- 對局中的次要動作 -->
                <div v-else-if="phase === 'playing'" class="flex flex-wrap items-center justify-center gap-2">
                    <button v-if="isPlayer" type="button" :class="secondaryBtn" @click="confirmResign">投降</button>
                    <button v-else-if="roomState.isHost" type="button" :class="secondaryBtn" @click="confirmAbort">中止對局</button>
                </div>
            </template>
        </main>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, useId } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ToggleGroupRoot, ToggleGroupItem } from 'reka-ui'
import { useDotsBoxes } from '../composables/useDotsBoxes.js'
import { useDotsBoxesSfx } from '../composables/useDotsBoxesSfx.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import RoomHeader from '@/shared/components/room/RoomHeader.vue'
import RoomLobby from '@/shared/components/room/RoomLobby.vue'
import RoomNicknameGate from '@/shared/components/room/RoomNicknameGate.vue'
import RoomBlocked from '@/shared/components/room/RoomBlocked.vue'
import RoomSpectatorBar from '@/shared/components/room/RoomSpectatorBar.vue'
import DbBoard from '../components/DbBoard.vue'
import DbScoreCard from '../components/DbScoreCard.vue'
import DbSoundButton from '../components/DbSoundButton.vue'
import { MIN_PLAYERS, MAX_PLAYERS, SIZE_CHOICES, MODE_CHOICES, END_REASON_TEXT } from '../data/constants.js'

const route = useRoute()
const router = useRouter()

const {
    state, roomState, connect,
    setOptions, start, move, resign, restart,
    clearError, clearNotice, disconnect, copyInviteLink,
    kickPlayer, transferHost, leaveRoom, upgradeFromSpectator,
} = useDotsBoxes()

const { playSfx, haptic, startSfx, stopSfx } = useDotsBoxesSfx()

// ── 按鈕樣式（照設計系統的膠囊按鈕寫法）─────────────────────────
const btnBase = 'inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-6 text-base font-medium transition-[background-color,scale,opacity] duration-150 ease-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none'
const primaryBtn = `${btnBase} bg-brand text-on-brand`
const secondaryBtn = `${btnBase} bg-raised text-ink shadow-(--shadow-tile) enabled:hover:bg-fill`
const choiceClass = 'flex min-h-11 flex-col items-start gap-1 rounded-inset border-0 p-3 text-left transition-[background-color,box-shadow] duration-150 ease-soft enabled:cursor-pointer disabled:cursor-default motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand bg-fill shadow-[inset_0_0_0_1px_var(--color-hairline)] enabled:hover:bg-hairline data-[state=on]:bg-brand-soft data-[state=on]:shadow-[inset_0_0_0_2px_var(--color-brand)] data-[state=on]:enabled:hover:bg-brand-soft'

const sizeLabelId = useId()
const modeLabelId = useId()

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
const opts = computed(() => view.value?.options ?? { size: 4, mode: 'classic' })
const isPlayer = computed(() => (view.value?.mySeat ?? -1) >= 0)

const nameOfSeat = seat => names.value[view.value?.players?.[seat]] ?? ''
const isOnlineSeat = seat => view.value?.online?.[view.value?.players?.[seat]] !== false
const initials = computed(() => [0, 1].map(s => Array.from(nameOfSeat(s))[0] ?? ''))

const canMove = computed(() => phase.value === 'playing' && view.value.mySeat === view.value.turn)
const remainingValue = computed(() => {
    const v = view.value
    return v.total - v.scores[0] - v.scores[1]
})

const headerProgress = computed(() => {
    const v = view.value
    if (!v || phase.value === 'waiting') return ''
    const o = opts.value
    return `${o.size}×${o.size} · ${o.mode === 'advanced' ? '進階' : '普通'}`
})

const statusText = computed(() => {
    const v = view.value
    if (phase.value === 'finished') return '對局結束'
    if (v.mySeat >= 0) {
        if (v.turn === v.mySeat) {
            const again = v.last && v.last.seat === v.mySeat && v.last.claimed.length > 0
            return again ? '拿到格子了，再畫一條' : '輪到你了'
        }
        return `等待 ${nameOfSeat(v.turn) || '對手'} 下棋…`
    }
    return `輪到 ${nameOfSeat(v.turn) || '玩家'}`
})

const resultTitle = computed(() => {
    const v = view.value
    if (v.winner === 'draw') return '平手'
    if (v.mySeat >= 0) return v.winner === v.mySeat ? '你贏了' : '你輸了'
    return `${nameOfSeat(v.winner)} 獲勝`
})
const resultDetail = computed(() => {
    const v = view.value
    const score = `${nameOfSeat(0)} ${v.scores[0]} ： ${v.scores[1]} ${nameOfSeat(1)}`
    return v.endReason && v.endReason !== 'complete' ? `${END_REASON_TEXT[v.endReason] ?? ''}（${score}）` : score
})

// 結算後計分卡上的結果字樣
const outcomeOfSeat = seat => {
    const v = view.value
    if (v.phase !== 'finished') return ''
    if (v.winner === 'draw') return '平手'
    return v.winner === seat ? '獲勝' : '落敗'
}

function onMove(edge) {
    if (canMove.value) move(edge)
}

function confirmResign() {
    if (confirm('確定要投降嗎？這局會直接判對手獲勝。')) resign()
}
function confirmAbort() {
    if (confirm('要中止這局嗎？會回到大廳。')) restart()
}

async function handleCopyLink() {
    if (await copyInviteLink()) showToast('邀請連結已複製', 'success')
    else showToast(`無法自動複製，請告訴朋友房號 ${roomState.roomId}`, 'error', 5000)
}

// ── 音效 ──────────────────────────────────────────────────────────
const claimedSomething = v => (v.last?.claimed?.length ?? 0) > 0
// 第一次收到狀態只記錄，不出聲（重新整理、重連時不要突然響一串）
let seen = null
watch(view, (v) => {
    if (!v) { seen = null; return }
    const prev = seen
    seen = { seq: v.startSeq, moves: v.moveCount, phase: v.phase }
    if (!prev) return

    if (v.phase === 'playing' && v.startSeq !== prev.seq) {
        if (v.mySeat === v.turn) playSfx('turn')
        return
    }
    if (v.phase !== 'waiting' && v.moveCount > prev.moves && v.last) {
        const claimed = v.last.claimed
        if (claimed.length) {
            playSfx('claim', { level: Math.max(...claimed.map(b => v.values[b] ?? 1)) })
            if (v.last.seat === v.mySeat) haptic(12)
        } else {
            playSfx('line')
            // 換成我下：稍等一下再提示，避免和落線聲疊在一起
            if (v.phase === 'playing' && v.turn === v.mySeat) setTimeout(() => playSfx('turn'), 160)
        }
    }
    if (v.phase === 'finished' && prev.phase === 'playing') {
        const mine = v.mySeat >= 0
        setTimeout(() => {
            if (v.winner === 'draw') playSfx('draw')
            else if (!mine) playSfx('win')
            else playSfx(v.winner === v.mySeat ? 'win' : 'lose')
        }, claimedSomething(v) ? 320 : 120)
        if (mine && v.winner === v.mySeat) haptic([30, 40, 30])
    }
}, { immediate: true })

// 對手加入大廳
watch(() => roomState.players.length, (n, old) => {
    if (n > old && phase.value === 'waiting' && old > 0) playSfx('join')
})

// ── 離開 ──────────────────────────────────────────────────────────
function goLobby() {
    disconnect()
    router.push({ name: 'dots-boxes' })
}
async function goHome() {
    if (phase.value === 'playing' && isPlayer.value
        && !confirm('對局進行中離開會判對手獲勝。確定要離開嗎？')) return
    await leaveRoom()
    goLobby()
}

// ── 初始化 ────────────────────────────────────────────────────────
onMounted(() => {
    startSfx()

    const roomId = (route.query.id || '').toUpperCase()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    const isCreating = route.query.create === '1'

    if (!roomId) { router.push({ name: 'dots-boxes' }); return }
    if (!nickname) {
        showNicknameOverlay.value = true
        return
    }
    // 建立房間後立刻把 create=1 從網址移除，避免 F5 重整時重建
    if (isCreating) router.replace({ name: 'dots-boxes-room', query: { id: roomId, nickname } })
    connect(roomId, nickname, isCreating)
})

onUnmounted(() => {
    stopSfx()
    clearTimeout(_toastTimer)
    disconnect() // 瀏覽器返回鍵離開頁面時也要斷線，避免留下幽靈在線玩家
})
</script>
