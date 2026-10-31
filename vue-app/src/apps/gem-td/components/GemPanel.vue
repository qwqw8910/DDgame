<template>
    <div class="flex flex-col gap-4 text-base text-[#5E4038]">
        <p v-if="me?.out" class="m-0 font-semibold text-[#D6305A]">你已出局，可以切換看其他人的地圖。</p>
        <p v-else-if="me && !mine && (me.pending.length || me.choosing)" class="m-0 text-[#D6305A]">回到自己的地圖才能放置和選擇甜點。</p>

        <!-- 手上的甜點 -->
        <section v-if="mine && me?.pending.length" aria-label="本回合甜點">
            <h3 class="gt-heading">點地圖放下甜點（還有 {{ me.pending.length }} 個）</h3>
            <div class="grid grid-cols-5 gap-1.5">
                <button v-for="g in me.pending" :key="g.slot" class="gt-gem-slot"
                    :class="{ 'gt-gem-slot--on': g.slot === selectedSlot }"
                    :aria-pressed="g.slot === selectedSlot" :title="gemName(g.kind, g.level)"
                    @click="$emit('select-slot', g.slot)">
                    <GemIcon :kind="g.kind" :level="g.level" :size="38" :label="gemName(g.kind, g.level)" />
                    <span class="text-sm leading-none">Lv{{ g.level }}</span>
                </button>
            </div>
            <p v-if="current" class="mt-2 mb-0 leading-snug">
                <b class="font-semibold text-[#4A2C2A]">{{ gemName(current.kind, current.level) }}</b>：{{ catalog.gems[current.kind].trait }}
            </p>
        </section>

        <!-- 五顆都放完：選一顆 -->
        <section v-else-if="mine && me?.choosing" aria-label="選擇保留的甜點">
            <h3 class="gt-heading">留下一個，其餘變成餅乾牆</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="f in freshRows" :key="f.id" class="gt-row" :class="{ 'gt-row--on': f.id === selectedId }">
                    <button class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 bg-transparent p-0 text-left text-inherit"
                        @click="$emit('select-tower', f.tower)">
                        <GemIcon :kind="f.tower.kind" :level="f.tower.level" :size="30" />
                        <span class="truncate">{{ gemName(f.tower.kind, f.tower.level) }}</span>
                    </button>
                    <button v-if="f.mergeGain" class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('merge', f.id)">合成 +{{ f.mergeGain }}</button>
                    <button class="gt-btn gt-btn--small" @click="$emit('keep', f.id)">保留</button>
                </li>
            </ul>
        </section>

        <!-- 特殊塔 -->
        <section v-if="recipes.length" aria-label="可合成的特殊塔">
            <h3 class="gt-heading">可以合成</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="r in recipes" :key="r.id" class="gt-row">
                    <GemIcon :kind="r.result" :size="30" />
                    <span class="min-w-0 flex-1 truncate" :title="r.trait">{{ r.name }}</span>
                    <button class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('combine', r.id)">合成</button>
                </li>
            </ul>
        </section>

        <!-- 準備 -->
        <section v-if="phase === 'build' && me?.resolved && !me.out">
            <button class="gt-btn gt-btn--lamp w-full" :disabled="me.ready" @click="$emit('ready')">
                {{ me.ready ? '已準備，等待隊友' : '準備好了，開始出怪' }}
            </button>
        </section>

        <!-- 下一波預告 -->
        <section v-if="phase === 'build' && view.nextWave" aria-label="下一波預告">
            <h3 class="gt-heading">第 {{ view.nextWave.number }} 波預告</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="g in waveRows" :key="g.type" class="leading-snug">
                    <p class="m-0">
                        <b class="font-semibold text-[#4A2C2A]">{{ g.name }}</b> {{ g.count }} 隻，血量 {{ g.hp }}<span v-if="g.armor">，護甲 {{ g.armor }}</span><span v-if="g.flying">，會飛</span>
                    </p>
                    <p v-if="g.trait" class="m-0" :style="{ color: g.trait.color }">{{ g.trait.name }}：{{ g.trait.desc }}</p>
                    <p v-if="g.trait" class="m-0 text-[#7A5A50]">對策：{{ g.trait.tip }}</p>
                </li>
            </ul>
        </section>

        <!-- 波次進度 -->
        <section v-if="phase === 'wave'" aria-label="波次進度">
            <h3 class="gt-heading">第 {{ view.nextWave?.number }} 波進行中</h3>
            <p class="m-0">{{ watchedLabel }}擊殺 {{ watched?.killed ?? 0 }}／{{ frame?.total ?? view.nextWave?.count }}，漏掉 {{ watched?.leaked ?? 0 }}</p>
            <button v-if="isHost" class="gt-btn gt-btn--small mt-2" @click="$emit('speed', view.speed === 1 ? 2 : 1)">
                {{ view.speed === 1 ? '切換 2 倍速' : '切回 1 倍速' }}
            </button>
        </section>

        <!-- 選中的塔 -->
        <section v-if="selected" aria-label="選取的塔">
            <template v-if="selected.kind === 'stone'">
                <h3 class="gt-heading">餅乾牆</h3>
                <template v-if="phase === 'build' && me && mine">
                    <button v-if="swapFrom" class="gt-btn w-full" @click="$emit('cancel-swap')">取消移動</button>
                    <button v-else class="gt-btn w-full" :disabled="me.gold < catalog.removeStoneCost" @click="$emit('remove', selected.id)">拆除（{{ catalog.removeStoneCost }} 金）</button>
                </template>
                <p v-else-if="mine" class="m-0">只有建造階段可以拆除。</p>
            </template>
            <template v-else>
                <h3 class="gt-heading">{{ gemName(selected.kind, selected.level) }}</h3>
                <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                    <dt class="text-[#7A5A50]">傷害</dt><dd class="m-0">{{ selectedStats.damage }}</dd>
                    <dt class="text-[#7A5A50]">射程</dt><dd class="m-0">{{ selectedStats.range.toFixed(1) }} 格</dd>
                    <dt class="text-[#7A5A50]">目標</dt><dd class="m-0">{{ HITS[selectedStats.hits] }}</dd>
                    <dt class="text-[#7A5A50]">戰績</dt><dd class="m-0">擊殺 {{ selected.kills }}，總傷 {{ selected.damage }}</dd>
                </dl>
                <p class="mt-1 mb-0 leading-snug">{{ selectedTrait }}</p>
                <button v-if="canMove" class="gt-btn gt-btn--small mt-2" :disabled="me.gold < catalog.swapCost"
                    @click="$emit(swapFrom ? 'cancel-swap' : 'start-swap', selected.id)">
                    {{ swapFrom ? '取消移動' : `跟餅乾牆換位置（${catalog.swapCost} 金）` }}
                </button>
            </template>
        </section>
        <p v-if="swapFrom" class="m-0 text-[#D6305A]" role="status">點一塊餅乾牆，塔會移到那裡。</p>

        <!-- 品質 -->
        <section v-if="me && !me.out && phase === 'build'" aria-label="甜點品質">
            <h3 class="gt-heading">甜點品質 {{ me.quality }}／{{ catalog.qualityRates.length }}</h3>
            <div class="flex h-2.5 overflow-hidden rounded-sm bg-[#F6DFE3]" role="img" :aria-label="`目前機率：${rateText}`">
                <span v-for="(r, i) in rates" :key="i" :style="{ width: `${r}%`, background: RATE_COLORS[i] }" />
            </div>
            <p class="mt-1.5 mb-2 leading-snug">{{ rateText }}</p>
            <button v-if="qualityCost" class="gt-btn gt-btn--small w-full" :disabled="me.gold < qualityCost" @click="$emit('upgrade')">
                提升品質（{{ qualityCost }} 金）
            </button>
        </section>

        <!-- 研究 -->
        <section v-if="me && !me.out && phase === 'build'" aria-label="甜點研究">
            <h3 class="gt-heading">甜點研究</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="r in researchRows" :key="r.id" class="gt-row">
                    <span class="min-w-0 flex-1 leading-snug">
                        <b class="font-semibold text-[#4A2C2A]">{{ r.name }} Lv{{ r.level }}／{{ catalog.researchCosts.length }}</b><br />{{ r.desc }}
                    </span>
                    <button v-if="r.cost" class="gt-btn gt-btn--small shrink-0" :disabled="me.gold < r.cost" @click="$emit('research', r.id)">{{ r.cost }} 金</button>
                </li>
            </ul>
            <p class="mt-1.5 mb-0 leading-snug text-[#7A5A50]">過關利息：存款的 {{ catalog.interest.rate * 100 }}%，最多 {{ catalog.interest.cap }} 金</p>
        </section>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { isSpecial } from '../data/gems.js'
import GemIcon from './GemIcon.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    frame: { type: Object, default: null },
    selectedSlot: { type: Number, default: null },
    selectedId: { type: Number, default: null },
    swapFrom: { type: Number, default: null },
    isHost: { type: Boolean, default: false },
    myId: { type: String, default: '' },
})
defineEmits(['select-slot', 'select-tower', 'keep', 'merge', 'combine', 'ready', 'speed', 'upgrade', 'research', 'remove', 'start-swap', 'cancel-swap'])

const HITS = { all: '地面與空中', ground: '只打地面', air: '只打空中' }
const RATE_COLORS = ['#C9B2AD', '#9FB8C9', '#5FA8D3', '#3CCB72', '#F2B233', '#D6305A']

const me = computed(() => props.view.me)
const phase = computed(() => props.view.phase)
const mine = computed(() => props.view.watching === props.myId)
const towerMap = computed(() => new Map(props.view.towers.map(t => [t.id, t])))
const watched = computed(() => props.frame?.players[props.view.watching] ?? null)
const watchedLabel = computed(() => (mine.value ? '' : `${props.view.names?.[props.view.watching] ?? '玩家'}：`))

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
    return { id: r.id, result: def.result, name: special.name, trait: special.trait }
}))

const selected = computed(() => towerMap.value.get(props.selectedId) ?? null)
const selectedStats = computed(() => {
    const t = selected.value
    if (!t || t.kind === 'stone') return null
    return isSpecial(t.kind) ? props.catalog.specials[t.kind].stats : props.catalog.gems[t.kind].levels[t.level - 1]
})
const selectedTrait = computed(() => {
    const t = selected.value
    return (isSpecial(t.kind) ? props.catalog.specials[t.kind] : props.catalog.gems[t.kind]).trait
})
const canMove = computed(() => {
    const t = selected.value
    return phase.value === 'build' && mine.value && me.value && t && !t.fresh
})

const waveRows = computed(() => (props.view.nextWave?.groups ?? []).map((g) => {
    const info = props.catalog.monsters.find(m => m.id === g.type)
    return { ...g, name: info.name, flying: info.flying, trait: g.trait ? props.catalog.traits[g.trait] : null }
}))

const researchRows = computed(() => Object.entries(props.catalog.research).map(([id, r]) => {
    const level = me.value?.research[id] ?? 0
    return { id, name: r.name, desc: r.desc, level, cost: props.catalog.researchCosts[level] ?? 0 }
}))

const rates = computed(() => props.catalog.qualityRates[(me.value?.quality ?? 1) - 1])
const rateText = computed(() => rates.value.flatMap((r, i) => (r ? [`Lv${i + 1} ${r}%`] : [])).join('、'))
const qualityCost = computed(() => props.catalog.qualityCosts[(me.value?.quality ?? 1) - 1] ?? 0)
</script>
