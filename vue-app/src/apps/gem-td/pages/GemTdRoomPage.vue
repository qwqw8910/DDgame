<template>
    <div class="gt-root flex h-[100dvh] w-full flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />

        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-[#EAC8CF] px-3 py-1.5">
            <div class="flex min-w-0 items-center gap-2">
                <button class="gt-chip" @click="goHome">離開</button>
                <span class="truncate font-sans font-bold text-[#4A2C2A] max-[400px]:hidden">甜點守衛戰</span>
                <span class="hidden font-mono tracking-[2px] text-[#7A5A50] sm:inline">{{ roomState.roomId }}</span>
            </div>
            <div class="flex shrink-0 items-center gap-1">
                <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                    :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
                <PwaInstallButton button-class="header-icon-btn" hint-class="gt-install-hint" />
                <GemVolumePanel />
                <button v-if="inGame" class="header-icon-btn" title="合成表" aria-label="合成表" :aria-pressed="showRecipes" @click="showRecipes = !showRecipes">📖</button>
                <button class="header-icon-btn" title="怎麼玩" aria-label="怎麼玩" @click="guide.open">❔</button>
                <button class="header-icon-btn" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink">🔗</button>
            </div>
        </header>

        <GemGuide v-model="guide.show.value" :catalog="state.catalog" />
        <GemRecipes v-if="inGame" v-model="showRecipes" :view="view" :catalog="state.catalog" @combine="onCombine" />

        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <div v-else-if="state.kicked || (state.error && !roomState.room)" class="overlay">
            <div class="overlay-card text-center">
                <p class="mb-1 text-lg font-semibold text-heading">{{ state.kicked ? '你已離開房間' : '無法進入房間' }}</p>
                <p class="mb-4 text-body">{{ state.kicked || state.error }}</p>
                <button class="btn-primary" @click="goLobby">回到入口</button>
            </div>
        </div>

        <div v-else-if="showNickname" class="overlay">
            <div class="overlay-card">
                <h2 class="neon-heading mb-3 text-xl">輸入暱稱</h2>
                <input v-model="overlayNickname" class="game-input mb-3" type="text" placeholder="你的暱稱" maxlength="8"
                    aria-label="暱稱" autocomplete="off" @keydown.enter="joinWithNickname" />
                <button class="btn-primary" @click="joinWithNickname">加入房間</button>
            </div>
        </div>

        <!-- 等待大廳 -->
        <main v-else-if="view?.phase === 'waiting'" class="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
            <div>
                <h1 class="m-0 font-sans text-3xl font-bold text-[#4A2C2A]">等待玩家</h1>
                <button class="mt-2 cursor-pointer border-0 bg-transparent p-0 font-mono text-3xl tracking-[6px] text-[#D6305A]"
                    title="複製邀請連結" @click="handleCopyLink">{{ roomState.roomId }}</button>
                <p class="mt-1 mb-0 text-[#7A5A50]">點房號複製邀請連結</p>
            </div>

            <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="(p, i) in roomState.players" :key="p.id" class="gt-row">
                    <span class="size-2.5 shrink-0 rounded-full" :style="{ background: p.is_online ? PLAYER_MARKS[i % PLAYER_MARKS.length] : '#C9B2AD' }" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate text-[#4A2C2A]">{{ p.nickname }}</span>
                    <span v-if="p.id === roomState.room?.host_player_id" class="text-[#7A5A50]">房主</span>
                    <span v-if="p.id === roomState.myPlayerId" class="text-[#7A5A50]">我</span>
                </li>
            </ul>

            <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="!roomState.isHost">
                <label class="flex flex-col gap-1 text-[#7A5A50]">
                    血量模式{{ roomState.isHost ? '' : '（房主決定）' }}
                    <select class="gt-input cursor-pointer" :value="view.options.livesMode" @change="setOptions({ livesMode: $event.target.value })">
                        <option v-for="c in LIVES_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-[#7A5A50]">
                    波數{{ roomState.isHost ? '' : '（房主決定）' }}
                    <select class="gt-input cursor-pointer" :value="view.options.waves" @change="setOptions({ waves: Number($event.target.value) })">
                        <option v-for="c in WAVE_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-[#7A5A50]">
                    每回合建造時間
                    <select class="gt-input cursor-pointer" :value="view.options.buildSeconds" @change="setOptions({ buildSeconds: Number($event.target.value) })">
                        <option v-for="c in BUILD_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
            </fieldset>

            <button v-if="roomState.isHost" class="gt-btn gt-btn--lamp" @click="startGame">開始遊戲</button>
            <p v-else-if="roomState.isSpectator" class="m-0 text-[#7A5A50]">你正在觀戰。
                <button class="gt-btn gt-btn--small" @click="upgradeFromSpectator">加入遊戲</button></p>
            <p v-else class="m-0 text-[#7A5A50]">等房主開始遊戲。</p>
        </main>

        <!-- 遊戲畫面 -->
        <main v-else-if="view?.board && state.catalog" class="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                <div class="flex h-9 shrink-0 items-center gap-x-3 overflow-hidden px-3 text-base whitespace-nowrap" role="status">
                    <span :title="view.options.livesMode === 'team' ? '隊伍血量' : '我的血量'"><span class="text-[#D6305A]" aria-hidden="true">♥</span> {{ lives }}／{{ view.maxLives }}</span>
                    <span v-if="view.me" title="金幣"><span class="text-[#D6305A]" aria-hidden="true">●</span> {{ gold }} 金</span>
                    <span>第 {{ waveNumber }}／{{ view.options.waves }} 波</span>
                    <span v-if="view.nextWave" class="min-w-0 truncate text-[#7A5A50]">{{ nextWaveLabel }}</span>
                    <span v-if="secondsLeft !== null" class="ml-auto shrink-0 font-semibold tabular-nums" :class="secondsLeft <= 10 ? 'text-[#D6305A]' : 'text-[#4A2C2A]'">{{ secondsLeft }} 秒</span>
                </div>
                <GemPlayerTabs :view="view" :catalog="state.catalog" :frame="frame" :my-id="roomState.myPlayerId" @watch="watchMap" />
                <div class="relative min-h-0 flex-1 px-1 pb-1 max-lg:max-h-[58dvh]">
                    <p v-if="!mine" class="gt-watching" role="status">
                        <span class="truncate">正在看 {{ watchingName }} 的地圖</span>
                        <button v-if="view.me" class="gt-btn gt-btn--small" @click="watchMap(roomState.myPlayerId)">回到我的地圖</button>
                    </p>
                    <GemBoard :view="view" :frame="frame" :catalog="state.catalog" :my-id="roomState.myPlayerId"
                        :pending-gem="pendingGem" :selected-id="selectedId"
                        @cell="onCell" @tower="onTower" @clear="clearSelection" />
                </div>
            </div>

            <aside class="min-h-0 shrink-0 overflow-y-auto border-t border-[#EAC8CF] p-3 max-lg:flex-1 lg:w-[320px] lg:border-t-0 lg:border-l">
                <p v-if="roomState.isSpectator" class="mt-0 mb-3 text-[#7A5A50]">你正在觀戰。</p>
                <GemPanel :view="view" :catalog="state.catalog" :frame="frame" :selected-slot="activeSlot" :selected-id="selectedId"
                    :swap-from="swapFrom" :is-host="roomState.isHost" :my-id="roomState.myPlayerId"
                    @select-slot="onSelectSlot" @select-tower="onTower"
                    @keep="id => { keep(id); clearSelection() }" @merge="id => { merge(id); clearSelection() }"
                    @combine="onCombine" @ready="ready" @speed="setSpeed" @upgrade="upgradeQuality" @research="upgradeResearch"
                    @remove="id => { removeStone(id); clearSelection() }"
                    @start-swap="id => swapFrom = id" @cancel-swap="swapFrom = null" />
                <button v-if="roomState.isHost" class="gt-chip mt-5" @click="handleFinish">提早結束這局</button>
            </aside>
        </main>

        <!-- 結算 -->
        <div v-if="view?.phase === 'finished' && view.result" class="overlay">
            <div class="flex w-full max-w-[420px] flex-col gap-4 border border-[#EAC8CF] bg-[#FFFFFF] p-6 text-[#5E4038]">
                <h2 class="m-0 font-sans text-4xl font-black text-[#4A2C2A]">{{ resultTitle }}</h2>
                <p class="m-0">{{ resultText }}</p>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                    <li v-for="s in view.result.scores" :key="s.id" class="flex justify-between gap-3">
                        <span class="truncate">{{ view.names?.[s.id] ?? '玩家' }}</span>
                        <span class="shrink-0 tabular-nums">{{ scoreText(s) }}</span>
                    </li>
                </ul>
                <p v-if="view.result.topTower && state.catalog" class="m-0 flex items-center gap-2">
                    <GemIcon :kind="view.result.topTower.kind" :level="view.result.topTower.level" :size="32" />
                    最強的塔：{{ topTowerName }}，打出 {{ view.result.topTower.damage.toLocaleString() }} 傷害
                </p>
                <button v-if="roomState.isHost" class="gt-btn gt-btn--lamp" @click="restart">回大廳再來一局</button>
                <p v-else class="m-0 text-[#7A5A50]">等房主開新的一局。</p>
                <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="gt-btn" @click="upgradeFromSpectator">加入下一局</button>
            </div>
        </div>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import { useGameGuide } from '@/shared/composables/useGameGuide.js'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import PwaInstallButton from '@/shared/components/PwaInstallButton.vue'
import { useGemTd } from '../composables/useGemTd.js'
import { useGemTdCues, useGemTdSfx } from '../composables/useGemTdSfx.js'
import { WAVE_CHOICES, BUILD_CHOICES, LIVES_CHOICES, PLAYER_MARKS, isSpecial } from '../data/gems.js'
import GemBoard from '../components/GemBoard.vue'
import GemPanel from '../components/GemPanel.vue'
import GemPlayerTabs from '../components/GemPlayerTabs.vue'
import GemGuide from '../components/GemGuide.vue'
import GemRecipes from '../components/GemRecipes.vue'
import GemIcon from '../components/GemIcon.vue'
import GemVolumePanel from '../components/GemVolumePanel.vue'

const route = useRoute()
const router = useRouter()
const {
    state, frame, roomState, connect, setOptions, watch: watchMap, startGame, place, keep, merge, combine,
    upgradeQuality, upgradeResearch, removeStone, swap, ready, setSpeed, finishNow, restart,
    clearError, clearNotice, disconnect, copyInviteLink,
    kickPlayer, transferHost, leaveRoom, upgradeFromSpectator,
} = useGemTd()
const { playSfx } = useGemTdSfx()

const guide = useGameGuide('gem-td-guide-seen')
const view = computed(() => state.view)
const inGame = computed(() => !!state.catalog && ['build', 'wave'].includes(view.value?.phase))
const showRecipes = ref(false)

const showNickname = ref(false)
const overlayNickname = ref('')

// ── 選取狀態 ─────────────────────────────────────────────────────
const selectedSlot = ref(null)
const selectedId = ref(null)
const swapFrom = ref(null)

const pending = computed(() => view.value?.me?.pending ?? [])
const activeSlot = computed(() => (
    pending.value.some(g => g.slot === selectedSlot.value) ? selectedSlot.value : pending.value[0]?.slot ?? null
))
// 只有在自己的地圖上才能放甜點；看別人的地圖時是唯讀
const mine = computed(() => view.value?.watching === roomState.myPlayerId)
const watchingName = computed(() => view.value?.names?.[view.value.watching] ?? '玩家')
const pendingGem = computed(() => (
    view.value?.phase === 'build' && mine.value ? pending.value.find(g => g.slot === activeSlot.value) ?? null : null
))

function clearSelection() {
    selectedId.value = null
    swapFrom.value = null
}

function onCell(x, y) {
    if (activeSlot.value === null || !mine.value) return
    place(activeSlot.value, x, y)
}

function onSelectSlot(slot) {
    selectedSlot.value = slot
    playSfx('click')
}

function onTower(tower) {
    if (swapFrom.value && tower.kind === 'stone') {
        swap(swapFrom.value, tower.id)
        clearSelection()
        return
    }
    selectedId.value = tower.id
    playSfx('click')
}

function onCombine(recipeId) {
    // 選中的塔是材料時，特殊塔就出現在那裡
    combine(recipeId, selectedId.value ?? undefined)
    clearSelection()
}

// ── 抬頭資訊 ─────────────────────────────────────────────────────
// 血量顯示自己的；觀戰者顯示正在看的玩家
const livesOwner = computed(() => (view.value?.me ? roomState.myPlayerId : view.value?.watching))
const lives = computed(() => frame.value?.players[livesOwner.value]?.lives ?? view.value?.players[livesOwner.value]?.lives ?? 0)
const gold = computed(() => (view.value?.me?.gold ?? 0) + (frame.value?.players[roomState.myPlayerId]?.earned ?? 0))
const waveNumber = computed(() => view.value?.nextWave?.number ?? view.value?.wave ?? 0)

const nextWaveLabel = computed(() => {
    const next = view.value?.nextWave
    if (!next || !state.catalog) return ''
    return next.groups.map((g) => {
        const info = state.catalog.monsters.find(m => m.id === g.type)
        const trait = g.trait ? `・${state.catalog.traits[g.trait].name}` : ''
        return `${info?.name ?? ''} ${g.count} 隻${trait}${info?.flying ? '（會飛）' : ''}`
    }).join('＋')
})

const topTowerName = computed(() => {
    const t = view.value?.result?.topTower
    if (!t) return ''
    if (isSpecial(t.kind)) return state.catalog.specials[t.kind].name
    return `Lv${t.level} ${state.catalog.levelNames[t.level - 1]}${state.catalog.gems[t.kind].name}`
})

// ── 結算文字 ─────────────────────────────────────────────────────
const nameOf = id => view.value?.names?.[id] ?? '玩家'

const resultTitle = computed(() => {
    const r = view.value?.result
    if (!r) return ''
    if (!r.versus) return r.win ? '蛋糕守住了' : '蛋糕被搬光了'
    if (!r.win) return '沒有贏家'
    if (r.winnerIds.length > 1) return `${r.winnerIds.map(nameOf).join('、')} 並列第一`
    return r.winnerIds[0] === roomState.myPlayerId ? '你贏了' : `${nameOf(r.winnerIds[0])} 獲勝`
})

const resultText = computed(() => {
    const r = view.value?.result
    if (!r) return ''
    if (r.versus) return r.win ? `打到第 ${r.wave} 波，最高還剩 ${r.lives} 點血。` : `撐到第 ${r.wave} 波。`
    return r.win ? `撐過全部 ${view.value.options.waves} 波，還剩 ${r.lives} 點血。` : `撐到第 ${r.wave} 波。`
})

function scoreText(s) {
    const score = `${s.kills} 殺，${s.damage.toLocaleString()} 傷`
    if (!view.value?.result?.versus) return score
    return `${s.out ? `第 ${s.outWave} 波出局` : `♥ ${s.lives}`}，${score}`
}

const nowTick = ref(Date.now())
const clock = setInterval(() => { nowTick.value = Date.now() }, 250)
const secondsLeft = computed(() => {
    const ends = view.value?.buildEndsAt
    if (!ends) return null
    return Math.max(0, Math.ceil((ends - (nowTick.value + state.clockOffset)) / 1000))
})

useGemTdCues({ view: () => state.view, frame, myId: () => roomState.myPlayerId, secondsLeft })

// ── 通知 ─────────────────────────────────────────────────────────
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '', duration = 2600) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

watch(() => state.error, (message) => {
    if (!message || !roomState.room) return
    showToast(message, 'error')
    playSfx('error')
    clearError()
})
watch(() => state.notice, (message) => {
    if (!message) return
    showToast(message, 'info')
    playSfx('notice')
    clearNotice()
})
watch(() => view.value?.watching, clearSelection)
watch(() => view.value?.phase, (phase, before) => {
    clearSelection()
    if (phase === 'build' && before === 'waiting') guide.autoOpen()
})

// ── 進出房間 ─────────────────────────────────────────────────────
function enter(nickname) {
    saveNickname(nickname)
    connect(
        String(route.query.id).toUpperCase(),
        nickname,
        route.query.create === '1',
        Number(route.query.max) || 4,
    )
}

function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { showToast('請輸入暱稱', 'error'); return }
    showNickname.value = false
    enter(nickname)
}

function goLobby() {
    disconnect()
    router.push({ name: 'gem-td' })
}

async function goHome() {
    if (!confirm('確定要離開房間嗎？離開後再進來會是全新的人。')) return
    await leaveRoom()
    goLobby()
}

function handleCopyLink() {
    copyInviteLink()
    showToast('邀請連結已複製', 'success')
}

function handleFinish() {
    if (confirm('確定要提早結束這局嗎？')) finishNow()
}

onMounted(() => {
    if (!route.query.id) { router.replace({ name: 'gem-td' }); return }
    const nickname = route.query.nickname || getSavedNickname()
    if (nickname) enter(String(nickname))
    else showNickname.value = true
})

onUnmounted(() => {
    clearInterval(clock)
    clearTimeout(_toastTimer)
})
</script>
