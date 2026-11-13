<template>
    <!-- 建造時：下一波預告；波次中：正在看的地圖的進度與倍速 -->
    <section v-if="phase === 'build' && view.nextWave" class="gt-card" aria-label="下一波預告">
        <h3 class="gt-heading">{{ view.nextWave.test ? '傷害測試預告' : `第 ${view.nextWave.number} 波預告` }}</h3>
        <p v-if="view.nextWave.test" class="m-0 mb-2 leading-snug text-(--gt-muted)">加賽：巨獸走到終點不會扣血，盡量把傷害打滿。中途的加賽依傷害比例發金幣（打滿約 5 波收入），最後一場不發；成績記在左側紀錄與結算畫面。</p>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="g in waveRows" :key="g.type" class="leading-snug">
                <p class="m-0">
                    <b class="font-semibold text-(--gt-ink)">{{ g.name }}</b> {{ g.count }} 隻，血量 {{ g.hp }}<span v-if="g.armor">，護甲 {{ g.armor }}</span><span v-if="g.flying">，會飛</span>
                </p>
                <template v-if="g.trait">
                    <p class="m-0 font-semibold" :style="{ color: g.trait.color }">{{ g.trait.name }}：{{ g.trait.desc }}</p>
                    <p class="m-0 text-(--gt-muted)">對策：{{ g.trait.tip }}</p>
                </template>
            </li>
        </ul>
    </section>

    <section v-else-if="phase === 'wave'" class="gt-card" aria-label="波次進度">
        <h3 class="gt-heading">{{ view.nextWave?.test ? '傷害測試進行中' : `第 ${view.nextWave?.number} 波進行中` }}</h3>
        <p v-if="view.nextWave?.test" class="m-0">{{ watchedLabel }}已造成 {{ (watched?.damage ?? 0).toLocaleString() }}／{{ view.nextWave.hp.toLocaleString() }} 傷害（{{ Math.min(100, Math.round(((watched?.damage ?? 0) / view.nextWave.hp) * 100)) }}%）</p>
        <p v-else class="m-0">{{ watchedLabel }}擊殺 {{ watched?.killed ?? 0 }}／{{ frame?.total ?? view.nextWave?.count }}，漏掉 {{ watched?.leaked ?? 0 }}</p>
        <button v-if="isHost" class="gt-btn gt-btn--small mt-2 w-full" aria-keyshortcuts="F" @click="$emit('speed', view.speed === 1 ? 2 : 1)">
            {{ view.speed === 1 ? '切換 2 倍速' : '切回 1 倍速' }}<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">F</kbd>
        </button>
    </section>
</template>

<script setup>
import { computed } from 'vue'

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
const watched = computed(() => props.frame?.players[props.view.watching] ?? null)
const watchedLabel = computed(() => (props.view.watching === props.myId ? '' : `${props.view.names?.[props.view.watching] ?? '玩家'}：`))

const waveRows = computed(() => (props.view.nextWave?.groups ?? []).map((g) => {
    const info = props.catalog.monsters.find(m => m.id === g.type)
    return { ...g, name: info.name, flying: info.flying, trait: g.trait ? props.catalog.traits[g.trait] : null }
}))
</script>
