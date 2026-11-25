<template>
    <div class="contents">
        <!-- 隊伍共用血量 -->
        <GemSection v-if="part !== 'stats'" title="隊伍血量" :meta="`${lives}／${view.maxLives}`" class="gt-card" aria-label="隊伍共用血量">
            <div class="h-2.5 overflow-hidden rounded-full bg-(--gt-line-soft)" role="progressbar" aria-label="隊伍共用血量"
                :aria-valuenow="lives" aria-valuemin="0" :aria-valuemax="view.maxLives">
                <div class="h-full rounded-full transition-[width] duration-300" :class="livesPct > 50 ? 'bg-[#3CCB72]' : livesPct > 25 ? 'bg-[#F2B233]' : 'bg-[#F0506E]'" :style="{ width: `${livesPct}%` }" />
            </div>
        </GemSection>

        <!-- 區域：點一下切換正在看（單人還能操作）的區；Tab 也可以 -->
        <GemSection v-if="part !== 'stats'" title="玩家" :meta="`${zones.length} 人`" class="gt-card" aria-label="區域">
            <nav class="flex flex-col gap-1" aria-label="切換區域">
                <button v-for="z in zoneRows" :key="z.id" class="gt-tab gt-tab--compact" :class="{ 'gt-tab--on': z.id === view.watching }"
                    :aria-pressed="z.id === view.watching" :title="z.id === view.watching ? (operateAny ? '操作中' : '正在看') : ''" @click="$emit('watch', z.id)">
                    <span class="flex items-center gap-1.5">
                        <span class="size-2.5 shrink-0 rounded-full" :style="{ background: z.color }" aria-hidden="true" />
                        <span class="min-w-0 flex-1 truncate font-semibold text-(--gt-ink)">{{ z.label }}{{ z.label === z.name || z.bot ? '' : ` ${z.name}` }}{{ z.index === view.relay.myZone ? '（我）' : '' }}</span>
                        <span v-if="z.gold !== null" class="shrink-0 text-xs font-semibold tabular-nums text-(--gt-ink)" :aria-label="`金幣 ${z.gold}`">💰{{ z.gold }}</span>
                    </span>
                    <span class="flex items-center gap-1 pl-4 text-xs leading-tight">
                        <span class="min-w-0 flex-1 truncate text-(--gt-muted)">{{ z.status }}</span>
                        <span v-if="z.id === view.watching" class="shrink-0 text-(--gt-accent-ink)">{{ operateAny ? '操作中' : '正在看' }}</span>
                    </span>
                </button>
            </nav>
        </GemSection>

        <!-- 分區統計：每欄最高的格子加粗 -->
        <GemSection v-if="part !== 'rail'" title="分區統計" class="gt-card" aria-label="分區統計">
            <div class="overflow-x-auto">
                <table class="w-full border-collapse text-center text-xs tabular-nums">
                    <caption class="sr-only">每區的路徑長度、擊殺、傳給後援、後援補救、漏怪與傷害；每欄最高的格子加粗</caption>
                    <thead>
                        <tr class="text-(--gt-muted)">
                            <th scope="col" class="px-1 py-1 text-left font-normal">區</th>
                            <th v-for="c in COLUMNS" :key="c.key" scope="col" class="px-1 py-1 font-normal" :title="c.tip">{{ c.label }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in statRows" :key="r.id" class="border-t border-(--gt-line-soft)">
                            <th scope="row" class="px-1 py-1 text-left font-semibold" :style="{ color: r.color }">{{ r.label }}</th>
                            <td v-for="c in COLUMNS" :key="c.key" class="px-1 py-1" :class="r.top[c.key] ? 'font-black text-(--gt-ink)' : 'text-(--gt-text)'" :title="`${c.tip}：${r[c.key].toLocaleString()}`">{{ compact(r[c.key]) }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <p class="m-0 mt-1.5 text-xs leading-snug text-(--gt-muted)">傳後援＝從自己區漏出去；補救＝在自己區打死別區傳來的蟲；漏怪＝從自己區出口離場並扣到血。</p>
        </GemSection>

        <!-- 事件紀錄：最近幾筆 -->
        <GemSection v-if="part !== 'rail'" title="事件" :meta="events.length ? `最近 ${events.length} 筆` : ''" class="gt-card" aria-label="事件紀錄">
            <p v-if="!events.length" class="m-0 text-(--gt-muted)">打完第一波就會有紀錄。</p>
            <ol v-else class="m-0 flex list-none flex-col gap-1 p-0" aria-live="polite">
                <li v-for="(e, i) in eventsNewestFirst" :key="`${e.wave}-${i}-${e.text}`" class="leading-snug" :class="i === 0 ? 'text-(--gt-ink)' : 'text-(--gt-muted)'">{{ e.text }}</li>
            </ol>
        </GemSection>

        <button v-if="part !== 'rail' && isHost && view.relay.canBossWave" class="gt-btn gt-btn--small w-full" title="開發與測試用：直接放出一隻繞完整圈的首領，不推進波數、不發獎勵，這局不列入排行榜" @click="onBoss">首領波（測試）</button>
        <GemConfirm :dialog="bossAsk" @confirm="confirmBoss" @cancel="bossAsk = null" />
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { zoneLabels, ZONE_COLORS } from '../data/gems.js'
import GemSection from './GemSection.vue'
import GemConfirm from './GemConfirm.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    frame: { type: Object, default: null },
    myId: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
    keys: { type: Boolean, default: false },
    // 'all'：手機一次全放；'rail'：電腦左欄只放血量與玩家；'stats'：電腦右上「戰況」頁籤放統計與事件
    part: { type: String, default: 'all' },
})
const emit = defineEmits(['watch', 'boss-wave'])

const COLUMNS = [
    { key: 'pathLength', label: '路徑', tip: '目前路徑長度（格）' },
    { key: 'kills', label: '擊殺', tip: '擊殺數' },
    { key: 'handoff', label: '傳後援', tip: '從自己區漏出去、傳給下一區的數量' },
    { key: 'relief', label: '補救', tip: '在自己區打死別區傳來的蟲' },
    { key: 'leaks', label: '漏怪', tip: '從自己區出口離場並扣到血的數量' },
    { key: 'damage', label: '傷害', tip: '累計傷害' },
]

const zones = computed(() => props.view.relay.zones)
const colorOf = i => props.catalog?.relay?.colors?.[i] ?? ZONE_COLORS[i % ZONE_COLORS.length]
const operateAny = computed(() => props.view.relay.operateAny)

const lives = computed(() => props.frame?.players?.[props.view.playerIds[0]]?.lives ?? props.view.lives)
const livesPct = computed(() => Math.max(0, Math.min(100, (lives.value / props.view.maxLives) * 100)))

function statusOf(z) {
    if (z.left) return '已離開（塔繼續攻擊）'
    const p = props.view.players[z.id]
    if (props.view.phase === 'build') {
        if (z.bot) return '電腦：開波時自動放牆'
        if (p.ready) return '已準備'
        return p.resolved ? '還在調整' : `放置 ${p.placed}／${props.catalog.gemsPerRound}`
    }
    return z.bot ? '電腦' : '防守中'
}

const labels = computed(() => zoneLabels(props.view))
const zoneRows = computed(() => zones.value.map(z => ({
    id: z.id,
    label: labels.value[z.index],
    bot: z.bot,
    index: z.index,
    color: colorOf(z.index),
    name: props.view.names?.[z.id] ?? '玩家',
    status: statusOf(z),
    gold: goldOf(z),
})))

// 每區的金幣（所有玩家都看得到）；波次中本波收入還沒入帳，把即時收入加上去，跟標題列一致。假人與已離開的區不顯示
function goldOf(z) {
    const p = props.view.players[z.id]
    if (z.bot || z.left || !p || p.out || p.gold == null) return null
    return p.gold + (props.frame?.players?.[z.id]?.earned ?? 0)
}

// 波次中的統計來自快照（即時），其他時候來自視圖
const statRows = computed(() => {
    const live = props.frame?.zs
    const rows = zones.value.map((z, i) => ({ id: z.id, index: z.index, label: labels.value[z.index], color: colorOf(z.index), pathLength: z.pathLength, ...(live?.[i] ?? z.stats) }))
    const max = Object.fromEntries(COLUMNS.map(c => [c.key, Math.max(...rows.map(r => r[c.key]))]))
    return rows.map(r => ({ ...r, top: Object.fromEntries(COLUMNS.map(c => [c.key, max[c.key] > 0 && r[c.key] === max[c.key]])) }))
})

const events = computed(() => props.view.relay.events)
const eventsNewestFirst = computed(() => [...events.value].reverse())

function compact(n) {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}億`
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}萬`
    return String(n)
}

const bossAsk = ref(null)
function onBoss() {
    bossAsk.value = { title: '放出首領？', text: '一隻首領會繞完整圈。這是測試功能：不推進波數、不發獎勵，這局不列入排行榜。', confirmText: '放出首領', cancelText: '先不要' }
}
function confirmBoss() {
    bossAsk.value = null
    emit('boss-wave')
}
</script>
