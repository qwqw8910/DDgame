<template>
  <div class="contents">
    <!-- 目前生效的突變：傷害測試不套用，投票中的候選在右欄 -->
    <GemDock v-if="activeMutation" id="mutation" title="目前突變" class="gt-card" aria-label="目前突變">
        <h3 class="gt-heading">目前突變</h3>
        <GemMutationCard :mutation="activeMutation" />
    </GemDock>

    <!-- 建造時：下一波預告；波次中：正在看的地圖的進度與倍速 -->
    <GemDock v-if="phase === 'build' && view.nextWave" id="wave" :title="waveTitle" class="gt-card" aria-label="下一波預告">
        <h3 class="gt-heading">{{ view.nextWave.test ? '傷害測試預告' : `第 ${view.nextWave.number} 波預告` }}</h3>
        <p v-if="view.nextWave.test" class="m-0 mb-2 leading-snug text-(--gt-muted)">加賽：巨獸走到終點不會扣血，盡量把傷害打滿。中途的加賽依傷害比例發金幣（打滿約 5 波收入），最後一場不發；成績記在左側紀錄與結算畫面。</p>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="g in waveRows" :key="g.type" class="leading-snug">
                <p class="m-0">
                    <b class="font-semibold text-(--gt-ink)">{{ g.name }}</b> {{ g.count }} 隻，血量 {{ g.hp }}<span v-if="g.armor">，護甲 {{ g.armor }}</span><span v-if="g.flying">，會飛</span>
                </p>
                <p v-if="g.leak" class="m-0 font-semibold text-(--gt-accent-ink)">漏掉會扣 {{ g.leak }} 點血</p>
                <template v-if="g.trait">
                    <p class="m-0 font-semibold" :style="{ color: g.trait.color }">{{ g.trait.name }}：{{ g.trait.desc }}</p>
                    <p class="m-0 text-(--gt-muted)">對策：{{ g.trait.tip }}</p>
                </template>
            </li>
        </ul>
    </GemDock>

    <GemDock v-else-if="phase === 'wave'" id="wave" :title="waveTitle" class="gt-card" aria-label="波次進度">
        <h3 class="gt-heading">{{ view.nextWave?.test ? '傷害測試進行中' : `第 ${view.nextWave?.number} 波進行中` }}</h3>
        <p v-if="view.nextWave?.test" class="m-0">{{ watchedLabel }}已造成 {{ (watched?.damage ?? 0).toLocaleString() }}／{{ view.nextWave.hp.toLocaleString() }} 傷害（{{ Math.min(100, Math.round(((watched?.damage ?? 0) / view.nextWave.hp) * 100)) }}%）</p>
        <p v-else class="m-0">{{ watchedLabel }}擊殺 {{ watched?.killed ?? 0 }}／{{ frame?.total ?? view.nextWave?.count }}，漏掉 {{ watched?.leaked ?? 0 }}</p>
        <button v-if="isHost" class="gt-btn gt-btn--small mt-2 w-full" aria-keyshortcuts="F" @click="$emit('speed', nextSpeed(view.speed))">
            目前 {{ view.speed }} 倍速，切換為 {{ nextSpeed(view.speed) }} 倍<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">F</kbd>
        </button>
    </GemDock>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { nextSpeed } from '../data/gems.js'
import GemMutationCard from './GemMutationCard.vue'
import GemDock from './GemDock.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    frame: { type: Object, default: null },
    myId: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
    keys: { type: Boolean, default: false },
})
defineEmits(['speed'])

const phase = computed(() => props.view.phase)
// 投票中還沒決定，不顯示；傷害測試不套用突變
const activeMutation = computed(() => {
    const id = props.view.mutation
    if (!id || props.view.mutationOffer || props.view.nextWave?.test) return null
    return props.catalog.mutations?.[id] ?? null
})
const waveTitle = computed(() => {
    const n = props.view.nextWave
    if (props.view.phase === 'build') return n?.test ? '傷害測試預告' : `第 ${n?.number} 波預告`
    return n?.test ? '傷害測試進行中' : `第 ${n?.number} 波進行中`
})
const watched = computed(() => props.frame?.players[props.view.watching] ?? null)
const watchedLabel = computed(() => (props.view.watching === props.myId ? '' : `${props.view.names?.[props.view.watching] ?? '玩家'}：`))

const waveRows = computed(() => (props.view.nextWave?.groups ?? []).map((g) => {
    const info = props.catalog.monsters.find(m => m.id === g.type)
    return { ...g, name: info.name, flying: info.flying, trait: g.trait ? props.catalog.traits[g.trait] : null }
}))
</script>
