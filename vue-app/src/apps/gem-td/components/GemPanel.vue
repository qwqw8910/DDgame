<template>
    <!-- 右欄只放「現在要做的事」；戰況與波次預告在左欄 -->
    <div class="flex flex-col gap-4 text-base text-(--gt-text)">
        <p v-if="me?.out" class="m-0 font-semibold text-(--gt-accent-ink)">你已出局，可以切換看其他人的地圖。</p>
        <p v-else-if="me && !mine && (me.pending.length || me.choosing)" class="m-0 text-(--gt-accent-ink)">回到自己的地圖才能放置和選擇甜點。</p>

        <!-- 手上的甜點 -->
        <section v-if="mine && me?.pending.length" aria-label="本回合甜點">
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
        </section>

        <!-- 五顆都放完：選一顆 -->
        <section v-else-if="mine && me?.choosing" aria-label="選擇保留的甜點">
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
        </section>

        <!-- 準備：放完、選完之後最重要的一步，放在最上面 -->
        <section v-if="phase === 'build' && me?.resolved && !me.out">
            <button class="gt-btn gt-btn--lamp w-full" :disabled="me.ready" aria-keyshortcuts="R" @click="$emit('ready')">
                {{ me.ready ? '已準備，等待隊友' : '準備好了，開始出怪' }}<kbd v-if="keys && !me.ready" class="gt-kbd ml-2" aria-hidden="true">R</kbd>
            </button>
        </section>

        <!-- 特殊塔 -->
        <section v-if="recipes.length" aria-label="可合成的特殊塔">
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
        </section>

        <!-- 選中的塔 -->
        <section v-if="selected" class="gt-card" aria-label="選取的塔">
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
                <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt class="text-(--gt-muted)">傷害</dt><dd class="m-0">{{ selectedStats.damage }}</dd>
                    <dt class="text-(--gt-muted)">射程</dt><dd class="m-0">{{ selectedStats.range.toFixed(1) }} 格</dd>
                    <dt class="text-(--gt-muted)">目標</dt><dd class="m-0">{{ HITS[selectedStats.hits] }}</dd>
                    <dt class="text-(--gt-muted)">戰績</dt><dd class="m-0">擊殺 {{ selected.kills }}，總傷 {{ selected.damage }}</dd>
                    <dt class="text-(--gt-muted)">熟練度</dt><dd class="m-0">{{ masteryText }}</dd>
                </dl>
                <p class="mt-1 mb-0 leading-snug">{{ selectedTrait }}</p>
                <template v-if="canMove">
                    <button class="gt-btn gt-btn--small mt-2 w-full" :disabled="!swapFrom && shortOf(catalog.swapCost) > 0" aria-keyshortcuts="S"
                        @click="$emit(swapFrom ? 'cancel-swap' : 'start-swap', selected.id)">
                        {{ swapFrom ? '取消移動' : `跟餅乾牆換位置（${catalog.swapCost} 金）` }}<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">S</kbd>
                    </button>
                    <p v-if="!swapFrom && shortOf(catalog.swapCost)" class="mt-1 mb-0 text-(--gt-muted)">還差 {{ shortOf(catalog.swapCost) }} 金</p>
                </template>
            </template>
        </section>
        <p v-if="swapFrom" class="m-0 text-(--gt-accent-ink)" role="status">點一塊餅乾牆，塔會移到那裡。</p>
        <!-- 出怪中沒有能做的事：告訴玩家右欄現在的用途，不留一整欄空白 -->
        <p v-if="phase === 'wave' && !selected && !recipes.length" class="m-0 text-(--gt-muted)">出怪中。點地圖上的塔，可以在這裡看它的傷害、射程和戰績。</p>

        <!-- 品質 -->
        <section v-if="me && !me.out && phase === 'build'" aria-label="甜點品質">
            <h3 class="gt-heading">甜點品質 {{ me.quality }}／{{ catalog.qualityRates.length }}</h3>
            <div class="flex h-2.5 overflow-hidden rounded-sm bg-(--gt-track)" role="img" :aria-label="`目前機率：${rateText}`">
                <span v-for="(r, i) in rates" :key="i" :style="{ width: `${r}%`, background: RATE_COLORS[i] }" />
            </div>
            <p class="mt-1.5 mb-2 leading-snug">{{ rateText }}</p>
            <button v-if="qualityCost" class="gt-btn gt-btn--small w-full" :disabled="shortOf(qualityCost) > 0" aria-keyshortcuts="U" @click="$emit('upgrade')">
                提升品質（{{ qualityCost }} 金）<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">U</kbd>
            </button>
            <p v-if="qualityCost && shortOf(qualityCost)" class="mt-1 mb-0 text-(--gt-muted)">還差 {{ shortOf(qualityCost) }} 金</p>
        </section>

        <!-- 研究：選項多，可收合 -->
        <details v-if="me && !me.out && phase === 'build'" class="gt-fold" open aria-label="甜點研究">
            <summary class="gt-heading !mb-1">
                甜點研究
                <GemHeaderIcon name="chevron" class="gt-fold-arrow text-(--gt-muted)" />
            </summary>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="r in researchRows" :key="r.id" class="gt-row">
                    <span class="min-w-0 flex-1 leading-snug">
                        <b class="font-semibold text-(--gt-ink)">{{ r.name }} Lv{{ r.level }}／{{ catalog.researchCosts.length }}</b><br />{{ r.desc }}
                        <template v-if="r.cost && shortOf(r.cost)"><br /><span class="text-(--gt-muted)">還差 {{ shortOf(r.cost) }} 金</span></template>
                    </span>
                    <button v-if="r.cost" class="gt-btn gt-btn--small shrink-0" :disabled="shortOf(r.cost) > 0" @click="$emit('research', r.id)">{{ r.cost }} 金</button>
                </li>
            </ul>
            <p class="mt-1.5 mb-0 leading-snug text-(--gt-muted)">過關利息：存款的 {{ catalog.interest.rate * 100 }}%，最多 {{ catalog.interest.cap }} 金</p>
        </details>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { isSpecial } from '../data/gems.js'
import GemIcon from './GemIcon.vue'
import GemHeaderIcon from './GemHeaderIcon.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    selectedSlot: { type: Number, default: null },
    selectedId: { type: Number, default: null },
    swapFrom: { type: Number, default: null },
    myId: { type: String, default: '' },
    keys: { type: Boolean, default: false }, // 有實體鍵盤時顯示快捷鍵提示
})
defineEmits(['select-slot', 'select-tower', 'keep', 'merge', 'combine', 'ready', 'upgrade', 'research', 'remove', 'start-swap', 'cancel-swap'])

const HITS = { all: '地面與空中', ground: '只打地面', air: '只打空中' }
const RATE_COLORS = ['#C9B2AD', '#9FB8C9', '#5FA8D3', '#3CCB72', '#F2B233', '#D6305A']

const me = computed(() => props.view.me)
const phase = computed(() => props.view.phase)
const mine = computed(() => props.view.watching === props.myId)
const towerMap = computed(() => new Map(props.view.towers.map(t => [t.id, t])))

// 買不起時還差多少金（0 表示買得起）
const shortOf = cost => Math.max(0, cost - (me.value?.gold ?? 0))

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
const selectedStats = computed(() => {
    const t = selected.value
    if (!t || t.kind === 'stone') return null
    return isSpecial(t.kind) ? props.catalog.specials[t.kind].stats : props.catalog.gems[t.kind].levels[t.level - 1]
})
const masteryText = computed(() => {
    const { kills: steps, damage, haste } = props.catalog.mastery
    const kills = selected.value?.kills ?? 0
    const rank = steps.filter(n => kills >= n).length
    const effect = rank ? `傷害 +${Math.round(rank * damage * 100)}%，攻速 +${Math.round(rank * haste * 100)}%` : '尚未升階'
    return rank < steps.length ? `${rank} 階（${effect}），再 ${steps[rank] - kills} 殺升階` : `${rank} 階滿（${effect}）`
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
