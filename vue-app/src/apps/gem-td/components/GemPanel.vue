<template>
    <!-- 右欄只放「現在要做的事」；戰況與波次預告在左欄 -->
    <div class="flex flex-col gap-4 text-base text-(--gt-text)">
        <p v-if="me?.out" class="m-0 font-semibold text-(--gt-accent-ink)" :class="tabClass('place')">你已出局，可以切換看其他人的地圖。</p>
        <p v-else-if="me && !mine && (me.pending.length || me.choosing)" class="m-0 text-(--gt-accent-ink)" :class="tabClass('place')">回到自己的地圖才能放置和選擇甜點。</p>

        <!-- 手上的甜點 -->
        <GemDock v-if="mine && me?.pending.length" id="pending" :title="`點地圖放下甜點（還有 ${me.pending.length} 個）`" :class="tabClass('place')" aria-label="本回合甜點">
            <h3 class="gt-heading">點地圖放下甜點（還有 {{ me.pending.length }} 個）</h3>
            <div class="grid grid-cols-5 gap-1.5">
                <button v-for="(g, i) in me.pending" :key="g.slot" class="gt-gem-slot"
                    :class="{ 'gt-gem-slot--on': g.slot === selectedSlot }"
                    :aria-pressed="g.slot === selectedSlot" :title="gemName(g.kind, g.level)" :aria-keyshortcuts="String(i + 1)"
                    @click="$emit('select-slot', g.slot)">
                    <GemIcon :kind="g.kind" :level="g.level" :size="38" :label="gemName(g.kind, g.level)" />
                    <span class="flex items-center gap-1 leading-none">
                        <kbd v-if="keys" class="gt-kbd" aria-hidden="true">{{ i + 1 }}</kbd>Lv{{ g.level }}
                    </span>
                </button>
            </div>
            <p v-if="current" class="mt-2 mb-0 leading-snug">
                <b class="font-semibold text-(--gt-ink)">{{ gemName(current.kind, current.level) }}</b>：{{ catalog.gems[current.kind].trait }}
            </p>
            <!-- 重骰：一個都還沒放才能骰；品質越高越貴，同回合每骰一次加價 -->
            <template v-if="me.canReroll">
                <button class="gt-btn gt-btn--small mt-2 w-full" :disabled="shortOf(me.rerollCost) > 0" aria-keyshortcuts="D" @click="$emit('reroll')">
                    重骰這手（{{ me.rerollCost }} 金）<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">D</kbd>
                </button>
                <p class="mt-1 mb-0 text-xs text-(--gt-muted) max-sm:hidden">
                    <template v-if="shortOf(me.rerollCost)">還差 {{ shortOf(me.rerollCost) }} 金・</template>本回合已骰 {{ me.rerolls }} 次，每骰一次 +{{ catalog.rerollStep }} 金，下回合恢復
                </p>
            </template>
        </GemDock>

        <!-- 五顆都放完：選一顆 -->
        <GemDock v-else-if="mine && me?.choosing" id="choosing" title="留下一個，其餘變成餅乾牆" :class="tabClass('place')" aria-label="選擇保留的甜點">
            <h3 class="gt-heading">留下一個，其餘變成餅乾牆</h3>
            <p v-if="keys" class="mt-0 mb-2 text-(--gt-muted)">按 <kbd class="gt-kbd">1</kbd>～<kbd class="gt-kbd">5</kbd> 選，<kbd class="gt-kbd">K</kbd> 保留，<kbd class="gt-kbd">M</kbd> 合成</p>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="(f, i) in freshRows" :key="f.id" class="gt-row" :class="{ 'gt-row--on': f.id === selectedId }">
                    <button class="gt-plain flex min-h-11 min-w-0 flex-1 items-center gap-2 p-0 text-left"
                        :aria-keyshortcuts="String(i + 1)" @click="$emit('select-tower', f.tower)">
                        <kbd v-if="keys" class="gt-kbd" aria-hidden="true">{{ i + 1 }}</kbd>
                        <GemIcon :kind="f.tower.kind" :level="f.tower.level" :size="30" />
                        <span class="truncate">{{ gemName(f.tower.kind, f.tower.level) }}</span>
                    </button>
                    <button v-if="f.mergeGain" class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('merge', f.id)">合成 +{{ f.mergeGain }}</button>
                    <button class="gt-btn gt-btn--small" @click="$emit('keep', f.id)">保留</button>
                </li>
            </ul>
        </GemDock>

        <!-- 準備：放完、選完之後最重要的一步，放在最上面 -->
        <GemDock v-if="phase === 'build' && me?.resolved && !me.out" id="ready" title="準備" :class="tabClass('place')">
            <button class="gt-btn gt-btn--lamp w-full" :disabled="me.ready" aria-keyshortcuts="R" @click="$emit('ready')">
                {{ me.ready ? '已準備，等待隊友' : '準備好了，開始出怪' }}<kbd v-if="keys && !me.ready" class="gt-kbd ml-2" aria-hidden="true">R</kbd>
            </button>
        </GemDock>

        <!-- 特殊塔 -->
        <!-- 突變：共用血量由全隊投票三選一，獨立血量由伺服器隨機，直接看戰況欄的預告 -->
        <GemDock v-if="phase === 'build' && view.mutationOffer && me && !me.out" id="vote" :title="`第 ${view.mutationOffer.wave} 波突變：全隊三選一${view.mutationOffer.myVote ? '' : '（還沒投票）'}`" :class="tabClass('place')" aria-label="突變投票">
            <h3 class="gt-heading">第 {{ view.mutationOffer.wave }} 波突變：全隊三選一<span v-if="!view.mutationOffer.myVote" class="ml-2 text-(--gt-accent-ink)">還沒投票</span></h3>
            <div class="flex flex-col gap-2">
                <GemMutationCard v-for="id in view.mutationOffer.options" :key="id" :mutation="catalog.mutations[id]" :votes="view.mutationOffer.counts[id]"
                    interactive :picked="view.mutationOffer.myVote === id" @pick="$emit('vote-mutation', id)" />
            </div>
            <p class="mt-1.5 mb-0 text-xs leading-snug text-(--gt-muted)">票數最高者生效，持續 {{ catalog.mutationEvery }} 波；同票或沒人投就隨機。開波前都可以改票。</p>
        </GemDock>

        <GemDock v-if="recipes.length" id="combine" title="可以合成" :class="tabClass('place')" aria-label="可合成的特殊塔">
            <h3 class="gt-heading">可以合成</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="r in recipes" :key="r.id" class="gt-row group relative">
                    <!-- 滑鼠移上去、鍵盤聚焦或點名字，都會在下方顯示這座塔的效果 -->
                    <button class="gt-plain flex min-h-11 min-w-0 flex-1 cursor-help items-center gap-2 p-0 text-left"
                        :aria-expanded="tipId === r.id" :aria-describedby="`gt-tip-${r.id}`"
                        @click="tipId = tipId === r.id ? null : r.id" @blur="tipId = null">
                        <GemIcon :kind="r.result" :size="30" />
                        <span class="min-w-0 flex-1 truncate">{{ r.name }}</span>
                    </button>
                    <button class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('combine', r.id)">合成</button>
                    <div :id="`gt-tip-${r.id}`" role="tooltip" class="gt-tip"
                        :class="tipId === r.id ? 'block' : 'hidden group-hover:block group-focus-within:block'">
                        <p class="m-0 font-semibold text-(--gt-ink)">{{ r.name }}</p>
                        <p class="m-0 text-(--gt-muted)">傷害 {{ r.stats.damage }}・射程 {{ r.stats.range.toFixed(1) }} 格・{{ HITS[r.stats.hits] }}</p>
                        <p class="m-0 leading-snug">{{ r.trait }}</p>
                    </div>
                </li>
            </ul>
        </GemDock>

        <!-- 選中的塔 -->
        <GemDock v-if="selected" id="selected" :title="selectedTitle" class="gt-card" :class="tabClass('tower', ...(me?.choosing ? ['place'] : []))" aria-label="選取的塔">
            <template v-if="selected.kind === 'stone'">
                <h3 class="gt-heading">餅乾牆</h3>
                <template v-if="phase === 'build' && me && mine">
                    <button v-if="swapFrom" class="gt-btn w-full" aria-keyshortcuts="S Escape" @click="$emit('cancel-swap')">取消移動<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">Esc</kbd></button>
                    <button v-else class="gt-btn w-full" aria-keyshortcuts="Delete" @click="$emit('remove', selected.id)">拆除（免費）<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">Del</kbd></button>
                </template>
                <p v-else-if="mine" class="m-0">只有建造階段可以拆除。</p>
            </template>
            <template v-else>
                <h3 class="gt-heading">{{ gemName(selected.kind, selected.level) }}</h3>
                <!-- 數值排成小方格：長數字縮寫，不會擠成好幾行 -->
                <dl class="m-0 grid grid-cols-3 gap-1">
                    <div v-for="s in statTiles" :key="s.label" class="min-w-0 rounded-lg bg-(--gt-bg) px-2 py-1" :title="s.title">
                        <dt class="text-xs text-(--gt-muted)">{{ s.label }}</dt>
                        <dd class="m-0 truncate font-semibold text-(--gt-ink) tabular-nums">{{ s.value }}</dd>
                    </div>
                </dl>
                <div class="mt-2">
                    <div class="flex items-baseline justify-between gap-2">
                        <span class="text-(--gt-muted)">熟練度 <b class="font-semibold text-(--gt-ink)">{{ mastery.rank }} 階{{ mastery.max ? '（滿）' : '' }}</b></span>
                        <span v-if="!mastery.max" class="shrink-0 text-xs text-(--gt-muted) tabular-nums">再 {{ mastery.left }} 殺</span>
                    </div>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-(--gt-line-soft)" role="progressbar" aria-label="熟練度進度"
                        :aria-valuenow="Math.round(mastery.progress * 100)" aria-valuemin="0" aria-valuemax="100">
                        <div class="h-full rounded-full bg-(--gt-accent)" :style="{ width: `${mastery.progress * 100}%` }" />
                    </div>
                    <p v-if="mastery.effect" class="mt-1 mb-0 text-xs text-(--gt-muted)">{{ mastery.effect }}</p>
                </div>
                <p class="mt-1 mb-0 leading-snug">{{ selectedTrait }}</p>
                <template v-if="canMove">
                    <button class="gt-btn gt-btn--small mt-2 w-full" :disabled="!swapFrom && shortOf(catalog.swapCost) > 0" aria-keyshortcuts="S"
                        @click="$emit(swapFrom ? 'cancel-swap' : 'start-swap', selected.id)">
                        {{ swapFrom ? '取消移動' : `跟餅乾牆換位置（${catalog.swapCost} 金）` }}<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">S</kbd>
                    </button>
                    <p v-if="!swapFrom && shortOf(catalog.swapCost)" class="mt-1 mb-0 text-(--gt-muted)">還差 {{ shortOf(catalog.swapCost) }} 金</p>
                </template>
            </template>
        </GemDock>
        <p v-if="swapFrom" class="m-0 text-(--gt-accent-ink)" :class="tabClass('place', 'tower')" role="status">點一塊餅乾牆，塔會移到那裡。</p>
        <!-- 出怪中沒有能做的事：告訴玩家右欄現在的用途，不留一整欄空白 -->
        <p v-if="phase === 'wave' && !selected && !recipes.length" class="m-0 text-(--gt-muted)" :class="tabClass('place', 'tower')">出怪中。點地圖上的塔，可以在這裡看它的傷害、射程和戰績。</p>

        <!-- 品質 -->
        <GemDock v-if="me && !me.out && phase === 'build'" id="quality" :title="`甜點品質 ${me.quality}／${catalog.qualityRates.length}`" :class="tabClass('shop')" aria-label="甜點品質">
            <h3 class="gt-heading">甜點品質 {{ me.quality }}／{{ catalog.qualityRates.length }}</h3>
            <div class="flex h-2.5 overflow-hidden rounded-sm bg-(--gt-track)" role="img" :aria-label="`目前機率：${rateText}`">
                <span v-for="(r, i) in rates" :key="i" :style="{ width: `${r}%`, background: RATE_COLORS[i] }" />
            </div>
            <p class="mt-1.5 mb-2 leading-snug">{{ rateText }}</p>
            <button v-if="qualityCost" class="gt-btn gt-btn--small w-full" :disabled="shortOf(qualityCost) > 0" aria-keyshortcuts="U" @click="$emit('upgrade')">
                提升品質（{{ qualityCost }} 金）<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">U</kbd>
            </button>
            <p v-if="qualityCost && shortOf(qualityCost)" class="mt-1 mb-0 text-(--gt-muted)">還差 {{ shortOf(qualityCost) }} 金</p>
        </GemDock>

        <!-- 許願池：預訂下一回合 5 選 1 的風向，每回合一次 -->
        <GemDock v-if="me && !me.out && phase === 'build' && catalog.wish" id="wish" title="甜點許願池" :class="tabClass('shop')" aria-label="甜點許願池">
            <h3 class="gt-heading">甜點許願池</h3>
            <p v-if="me.wish" class="m-0 mb-1.5 leading-snug" role="status">
                已許願 {{ me.wish.stacks }}/{{ catalog.wish.maxStacks }} 次：下回合有 1 格 {{ Math.round(catalog.wish.stackRates[me.wish.stacks - 1] * 100) }}% 機率變成「{{ catalog.wish.categories[me.wish.category].name }}」{{ me.wish.stacks >= catalog.wish.levelStack ? '，且等級提高' : '' }}，其餘格照常隨機
            </p>
            <div class="flex flex-wrap gap-1.5">
                <button v-for="(c, id) in catalog.wish.categories" :key="id" class="gt-btn gt-btn--small" :disabled="wishDisabled(id)" @click="$emit('wish', id)">
                    {{ c.name }}（{{ wishPrice() }} 金）
                </button>
            </div>
            <p class="mt-1.5 mb-0 text-xs leading-snug text-(--gt-muted)">只影響下一回合的 5 選 1，不直接給甜點。只影響其中 1 格，其餘 4 格照常隨機。同回合可連續許同一分類，該格機率 60% → 80% → 100%、價格 60／120／180 金，許滿第 3 次該格等級也提高，最多 {{ catalog.wish.maxStacks }} 層。</p>
        </GemDock>

        <!-- 買命：金幣換血量，血量滿了或傷害測試（不扣血）就不顯示 -->
        <GemDock v-if="me && !me.out && phase === 'build' && !view.nextWave?.test" id="life" title="補血" :class="tabClass('shop')" aria-label="買命">
            <h3 class="gt-heading">補血</h3>
            <button class="gt-btn gt-btn--small w-full" :disabled="!canBuyLife" @click="$emit('buy-life')">
                {{ me.lifeCost }} 金換 1 點血（{{ myLives }}／{{ view.maxLives }}）
            </button>
            <p v-if="myLives >= view.maxLives" class="mt-1 mb-0 text-(--gt-muted)">血量已滿</p>
            <p v-else class="mt-1 mb-0 text-xs text-(--gt-muted)">
                <template v-if="shortOf(me.lifeCost)">還差 {{ shortOf(me.lifeCost) }} 金・</template>價格隨波次上漲；本回合已買 {{ me.livesBought }} 點，每多買 1 點貴 {{ Math.round(catalog.lifeStep * 100) }}%，下回合恢復
            </p>
        </GemDock>

        <!-- 研究：選項多，可收合 -->
        <GemDock v-if="me && !me.out && phase === 'build'" id="research" title="甜點研究" fold :class="tabClass('shop')" aria-label="甜點研究">
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="r in researchRows" :key="r.id" class="gt-row">
                    <span class="min-w-0 flex-1 leading-snug">
                        <b class="font-semibold text-(--gt-ink)">{{ r.name }} Lv{{ r.level }}／{{ catalog.researchCosts.length }}<span v-if="r.level > catalog.researchBaseLevels" class="ml-1 text-(--gt-muted)">匠心 +{{ r.level - catalog.researchBaseLevels }}</span></b><br />{{ r.desc }}
                        <template v-if="r.cost && shortOf(r.cost)"><br /><span class="text-(--gt-muted)">還差 {{ shortOf(r.cost) }} 金</span></template>
                    </span>
                    <button v-if="r.cost" class="gt-btn gt-btn--small shrink-0" :disabled="shortOf(r.cost) > 0" @click="$emit('research', r.id)">{{ r.cost }} 金</button>
                </li>
            </ul>
            <p class="mt-1.5 mb-0 leading-snug text-(--gt-muted)">過關利息：存款的 {{ catalog.interest.rate * 100 }}%，最多 {{ catalog.interest.cap }} 金</p>
        </GemDock>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { isSpecial } from '../data/gems.js'
import GemIcon from './GemIcon.vue'
import GemMutationCard from './GemMutationCard.vue'
import GemDock from './GemDock.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    selectedSlot: { type: Number, default: null },
    selectedId: { type: Number, default: null },
    swapFrom: { type: Number, default: null },
    myId: { type: String, default: '' },
    keys: { type: Boolean, default: false }, // 有實體鍵盤時顯示快捷鍵提示
    phoneTab: { type: String, default: '' }, // 手機分頁；只用 max-sm: 隱藏，電腦與平板不受影響
})

// 手機只顯示目前分頁的區塊；沒傳分頁（空字串）時全部顯示
const tabClass = (...tabs) => (props.phoneTab && !tabs.includes(props.phoneTab) ? 'max-sm:hidden' : '')
defineEmits(['select-slot', 'select-tower', 'keep', 'merge', 'combine', 'ready', 'upgrade', 'buy-life', 'reroll', 'wish', 'vote-mutation', 'research', 'remove', 'start-swap', 'cancel-swap'])

const HITS = { all: '地面與空中', ground: '只打地面', air: '只打空中' }
const RATE_COLORS = ['#C9B2AD', '#9FB8C9', '#5FA8D3', '#3CCB72', '#F2B233', '#D6305A']

const me = computed(() => props.view.me)
const phase = computed(() => props.view.phase)
const mine = computed(() => props.view.watching === props.myId)
const towerMap = computed(() => new Map(props.view.towers.map(t => [t.id, t])))

const myLives = computed(() => props.view.players[props.myId]?.lives ?? 0)
const canBuyLife = computed(() => myLives.value < props.view.maxLives && shortOf(props.view.me?.lifeCost ?? Infinity) === 0)

// 買不起時還差多少金（0 表示買得起）
const shortOf = cost => Math.max(0, cost - (me.value?.gold ?? 0))

// 許願：只能疊加同一個願；價格依已疊層數遞增，滿層後鎖住
const wishPrice = () => {
    const w = props.catalog.wish
    const stacks = me.value?.wish?.stacks ?? 0
    return w.categoryCost * w.stackCostMult[Math.min(stacks, w.maxStacks - 1)]
}
const wishDisabled = category => {
    const w = me.value?.wish
    if (w && (w.category !== category || w.stacks >= props.catalog.wish.maxStacks)) return true
    return shortOf(wishPrice()) > 0
}

function gemName(kind, level) {
    const c = props.catalog
    if (isSpecial(kind)) return c.specials[kind].name
    return `Lv${level} ${c.levelNames[level - 1]}${c.gems[kind].name}`
}

const current = computed(() => me.value?.pending.find(g => g.slot === props.selectedSlot) ?? me.value?.pending[0] ?? null)

const freshRows = computed(() => (me.value?.fresh ?? [])
    .map(f => ({ ...f, tower: me.value.towers.find(t => t.id === f.id) }))
    .filter(f => f.tower))

const recipes = computed(() => (me.value?.recipes ?? []).map((r) => {
    const def = props.catalog.recipes.find(x => x.id === r.id)
    const special = props.catalog.specials[def.result]
    return { id: r.id, result: def.result, name: special.name, trait: special.trait, stats: special.stats }
}))
const tipId = ref(null) // 手機點名字時打開的效果說明

const selected = computed(() => towerMap.value.get(props.selectedId) ?? null)
const selectedTitle = computed(() => (!selected.value ? '' : selected.value.kind === 'stone' ? '餅乾牆' : gemName(selected.value.kind, selected.value.level)))
const selectedStats = computed(() => {
    const t = selected.value
    if (!t || t.kind === 'stone') return null
    return isSpecial(t.kind) ? props.catalog.specials[t.kind].stats : props.catalog.gems[t.kind].levels[t.level - 1]
})
const mastery = computed(() => {
    const { kills: steps, damage, haste } = props.catalog.mastery
    const kills = selected.value?.kills ?? 0
    const rank = steps.filter(n => kills >= n).length
    const max = rank >= steps.length
    const from = rank ? steps[rank - 1] : 0
    return {
        rank,
        max,
        left: max ? 0 : steps[rank] - kills,
        progress: max ? 1 : (kills - from) / (steps[rank] - from),
        effect: rank ? `傷害 +${Math.round(rank * damage * 100)}%・攻速 +${Math.round(rank * haste * 100)}%` : '',
    }
})

// 大數字縮寫成「12.3萬」「1.2億」，完整數字放在 title
function compact(n) {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}億`
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}萬`
    return String(Math.round(n))
}
const HITS_SHORT = { all: '地＋空', ground: '地面', air: '空中' }
const statTiles = computed(() => {
    const t = selected.value
    const s = selectedStats.value
    return [
        { label: '傷害', value: compact(s.damage), title: String(s.damage) },
        { label: '射程', value: `${s.range.toFixed(1)} 格` },
        { label: '目標', value: HITS_SHORT[s.hits], title: HITS[s.hits] },
        { label: '擊殺', value: compact(t.kills), title: String(t.kills) },
        { label: '總傷', value: compact(t.damage), title: Math.round(t.damage).toLocaleString() },
        { label: 'DPS', value: s.cooldown ? compact(s.damage / s.cooldown) : '—', title: '傷害 ÷ 攻擊間隔（未含加成）' },
    ]
})
const selectedTrait = computed(() => {
    const t = selected.value
    return (isSpecial(t.kind) ? props.catalog.specials[t.kind] : props.catalog.gems[t.kind]).trait
})
const canMove = computed(() => {
    const t = selected.value
    return phase.value === 'build' && mine.value && me.value && t && !t.fresh
})

const researchRows = computed(() => Object.entries(props.catalog.research).map(([id, r]) => {
    const level = me.value?.research[id] ?? 0
    return { id, name: r.name, desc: r.desc, level, cost: props.catalog.researchCosts[level] ?? 0 }
}))

const rates = computed(() => props.catalog.qualityRates[(me.value?.quality ?? 1) - 1])
const rateText = computed(() => rates.value.flatMap((r, i) => (r ? [`Lv${i + 1} ${r}%`] : [])).join('、'))
const qualityCost = computed(() => props.catalog.qualityCosts[(me.value?.quality ?? 1) - 1] ?? 0)
</script>
