<template>
    <!--
      等待室（所有遊戲同一套結構）：邀請卡 → 玩家 → #settings（遊戲設定）→ 底部開始按鈕。
      遊戲只需要提供設定內容與人數規則，其餘文案、狀態、按鈕行為都在這裡統一。

      選配擴充（不需要就不用傳）：
        ready-mode       玩家要按「準備好了」，房主等全員準備才能開始（共用 room:ready）
        #players         整個換掉玩家區內容（例如血染鐘樓的入座圓桌）；標題與人數仍由這裡顯示
        is-starter       誰看得到開始按鈕，預設 = 房主
        start-label      開始按鈕文字
        start-blocker    遊戲自己的不能開始原因（例如入座人數不足），有值就停用按鈕並顯示
        waiting-text     看不到開始按鈕的人看到的等待文字
    -->
    <section class="flex flex-col gap-3 sm:gap-4" aria-labelledby="room-lobby-title">
        <h2 id="room-lobby-title" class="sr-only">等待室</h2>

        <!-- 邀請 -->
        <!-- 手機：房號與按鈕同一列（省高度）；sm 以上：置中大字 -->
        <div class="flex items-center justify-between gap-3 rounded-tile bg-raised px-5 py-4 shadow-(--shadow-tile) sm:flex-col sm:justify-center sm:py-6 sm:text-center">
            <div class="min-w-0">
                <p class="m-0 text-base text-ink-muted">房間代碼</p>
                <p class="m-0 font-mono text-[26px] leading-tight font-semibold tracking-[0.12em] text-ink sm:mt-1 sm:text-[44px] sm:tracking-[0.2em]">
                    {{ roomId }}
                </p>
            </div>
            <button type="button" aria-label="複製邀請連結"
                class="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border-0 bg-fill px-4 text-base text-ink transition-[background-color,scale] duration-150 ease-soft hover:bg-hairline active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none sm:mt-3 sm:px-5"
                @click="emit('invite')">
                <RoomIcon name="link" />
                <span>複製<span class="hidden sm:inline">邀請</span>連結</span>
            </button>
        </div>

        <!-- 玩家 -->
        <div class="rounded-tile bg-raised p-5 shadow-(--shadow-tile)">
            <h3 class="m-0 flex items-baseline justify-between gap-2 font-display text-xl font-normal text-ink">
                {{ playersTitle }}
                <span class="text-base tabular-nums text-ink-faint">
                    <template v-if="playersCount">{{ playersCount }}</template>
                    <template v-else>
                        <template v-if="readyMode">{{ readyCount }} / {{ players.length }} 人準備好</template>
                        <template v-else>{{ players.length }}<template v-if="maxPlayers"> / {{ maxPlayers }}</template> 人</template>
                    </template>
                </span>
            </h3>
            <div v-if="$slots.players" class="mt-4">
                <slot name="players" />
            </div>
            <ul v-else class="m-0 mt-4 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
                <li v-for="p in players" :key="p.id"
                    class="flex min-h-11 min-w-0 items-center gap-2 rounded-inset bg-fill px-3 py-2 text-base text-ink"
                    :class="{ 'opacity-60': !isOnline(p) }">
                    <span class="min-w-0 truncate">{{ p.nickname }}</span>
                    <span v-if="p.id === myId" class="shrink-0 text-brand-ink">你</span>
                    <span v-if="p.id === hostId" class="ml-auto grid shrink-0 place-items-center text-ink-muted" title="房主">
                        <RoomIcon name="crown" />
                        <span class="sr-only">（房主）</span>
                    </span>
                    <span v-if="!isOnline(p)" class="shrink-0 text-ink-faint" :class="{ 'ml-auto': p.id !== hostId }">離線</span>
                    <!-- 準備狀態：勾 = 準備好，空心圈 = 還沒；房主不用準備 -->
                    <span v-else-if="readyMode && p.id !== hostId" class="ml-auto grid shrink-0 place-items-center"
                        :class="isReady(p) ? 'text-ink' : 'text-ink-faint'">
                        <RoomIcon :name="isReady(p) ? 'check' : 'circle'" />
                        <span class="sr-only">{{ isReady(p) ? '（已準備）' : '（未準備）' }}</span>
                    </span>
                </li>
                <!-- 還沒湊滿最低人數時，用虛線空位提示「還要找人」 -->
                <li v-for="n in missing" :key="`empty-${n}`"
                    class="flex min-h-11 items-center rounded-inset px-3 py-2 text-base text-ink-faint border-[1.5px] border-dashed border-ink-faint/50">
                    等待加入…
                </li>
            </ul>
        </div>

        <!-- 遊戲設定：房主可改，其他人唯讀 -->
        <div v-if="$slots.settings" class="rounded-tile bg-raised p-5 shadow-(--shadow-tile)">
            <h3 class="m-0 flex items-baseline justify-between gap-2 font-display text-xl font-normal text-ink">
                {{ settingsTitle }}
                <span v-if="!isHost && settingsNote" class="text-base text-ink-faint">{{ settingsNote }}</span>
            </h3>
            <div class="mt-4">
                <slot name="settings" />
            </div>
        </div>

        <!-- 開始：黏在捲動區底部，手機上不用捲到最下面才按得到 -->
        <div class="sticky bottom-0 -mx-3 mt-auto bg-linear-to-t from-canvas from-70% to-transparent px-3 pt-6 pb-3">
            <template v-if="starter">
                <button type="button" :disabled="!!blocker" :aria-describedby="blocker ? 'room-lobby-hint' : undefined"
                    class="flex h-12 w-full cursor-pointer items-center justify-center rounded-full border-0 bg-brand text-lg font-medium text-on-brand transition-[opacity,scale] duration-150 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 motion-reduce:transition-none"
                    @click="emit('start')">
                    {{ startLabel }}
                </button>
                <p v-if="blocker" id="room-lobby-hint" class="m-0 mt-2 text-center text-base text-ink-muted">{{ blocker }}</p>
            </template>
            <template v-else>
                <!-- 準備制：非房主按這顆；按下後可以再按一次取消 -->
                <button v-if="readyMode && isPlayer" type="button" :aria-pressed="meReady"
                    class="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full border-0 text-lg font-medium transition-[background-color,scale] duration-150 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
                    :class="meReady ? 'bg-raised text-ink shadow-(--shadow-tile) hover:bg-fill' : 'bg-brand text-on-brand'"
                    @click="emit('ready', !meReady)">
                    <RoomIcon v-if="meReady" name="check" />
                    {{ meReady ? '已準備，按一下取消' : '準備好了' }}
                </button>
                <p class="m-0 py-3 text-center text-base text-ink-muted" role="status">{{ waitingText }}</p>
            </template>

            <button v-if="canJoin" type="button"
                class="mt-2 flex h-12 w-full cursor-pointer items-center justify-center rounded-full border-0 bg-raised text-lg text-ink shadow-(--shadow-tile) transition-[background-color,scale] duration-150 ease-soft hover:bg-fill active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
                @click="emit('join')">
                加入這一局
            </button>
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import RoomIcon from './RoomIcon.vue'

const props = defineProps({
    roomId: { type: String, default: '' },
    players: { type: Array, default: () => [] },
    myId: { type: String, default: '' },
    hostId: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
    minPlayers: { type: Number, default: 2 },
    maxPlayers: { type: Number, default: 0 },
    // 觀戰者可以轉成玩家時顯示「加入這一局」
    canJoin: { type: Boolean, default: false },

    // ── 選配擴充 ──
    readyMode: { type: Boolean, default: false },
    // 誰看得到開始按鈕；null = 房主
    isStarter: { type: Boolean, default: null },
    startLabel: { type: String, default: '開始遊戲' },
    startBlocker: { type: String, default: '' },
    waitingText: { type: String, default: '等房主開始遊戲…' },
    playersTitle: { type: String, default: '玩家' },
    // 換掉玩家區標題右側的人數文字（例如「已入座 6 / 10」）
    playersCount: { type: String, default: '' },
    settingsTitle: { type: String, default: '遊戲設定' },
    settingsNote: { type: String, default: '由房主設定' },
})

const emit = defineEmits(['invite', 'start', 'join', 'ready'])

const starter = computed(() => (props.isStarter === null ? props.isHost : props.isStarter))
const missing = computed(() => Math.max(0, props.minPlayers - props.players.length))
const isPlayer = computed(() => props.players.some(p => p.id === props.myId))

// 準備制：房主自己不用按，算已準備
const isReady = p => p.id === props.hostId || !!p.is_ready
const meReady = computed(() => !!props.players.find(p => p.id === props.myId)?.is_ready)
const readyCount = computed(() => props.players.filter(isReady).length)
const notReady = computed(() => props.players.length - readyCount.value)

// 不能開始的原因，依序：人數不足 → 有人沒準備 → 遊戲自己的條件
const blocker = computed(() => {
    if (missing.value > 0) return `還差 ${missing.value} 人才能開始（至少 ${props.minPlayers} 人）`
    if (props.readyMode && notReady.value > 0) return `還有 ${notReady.value} 人沒準備好`
    return props.startBlocker
})

// 相容不同遊戲的欄位名稱（is_online vs connected），與 RoomPlayerPanel 一致
function isOnline(p) {
    if (p.is_online !== undefined) return p.is_online
    if (p.connected !== undefined) return p.connected
    return true
}
</script>
