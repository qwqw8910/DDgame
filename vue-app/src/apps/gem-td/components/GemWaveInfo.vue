<template>
  <div class="contents">
    <!-- 建造時：下一波預告；波次中：正在看的地圖的進度與倍速 -->
    <GemSection v-if="phase === 'build' && view.nextWave" :title="waveTitle" :meta="waveMeta" class="gt-card" aria-label="下一波預告">
        <h3 class="gt-heading">{{ view.nextWave.test ? '傷害測試預告' : `第 ${view.nextWave.number} 波預告` }}</h3>
        <p v-if="view.nextWave.test" class="m-0 mb-2 leading-snug text-(--gt-muted)">加賽：巨獸走到終點不會扣血，盡量把傷害打滿。中途的加賽依傷害比例發金幣（打滿約 5 波收入），最後一場不發；打完會跳出成績，之後可以從右上「⋯」再打開。</p>
        <GemWaveTips :view="view" :catalog="catalog" />
    </GemSection>

    <GemSection v-else-if="phase === 'wave'" :title="waveTitle" :meta="waveMeta" class="gt-card" aria-label="波次進度">
        <h3 class="gt-heading">{{ view.nextWave?.test ? '傷害測試進行中' : `第 ${view.nextWave?.number} 波進行中` }}</h3>
        <p v-if="view.nextWave?.test" class="m-0">{{ watchedLabel }}已造成 {{ (watched?.damage ?? 0).toLocaleString() }}／{{ view.nextWave.hp.toLocaleString() }} 傷害（{{ Math.min(100, Math.round(((watched?.damage ?? 0) / view.nextWave.hp) * 100)) }}%）</p>
        <p v-else class="m-0">{{ watchedLabel }}擊殺 {{ watched?.killed ?? 0 }}／{{ frame?.total ?? view.nextWave?.count }}，漏掉 {{ watched?.leaked ?? 0 }}</p>
        <!-- 電腦與平板的倍速在標題列；手機標題列放不下，留在這裡 -->
        <button v-if="isHost" class="gt-btn gt-btn--small mt-2 w-full sm:hidden" aria-keyshortcuts="F" @click="$emit('speed', nextSpeed(view.speed))">
            目前 {{ view.speed }} 倍速，切換為 {{ nextSpeed(view.speed) }} 倍<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">F</kbd>
        </button>
    </GemSection>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { nextSpeed } from '../data/gems.js'
import GemSection from './GemSection.vue'
import GemWaveTips from './GemWaveTips.vue'

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
const waveTitle = computed(() => {
    const n = props.view.nextWave
    if (props.view.phase === 'build') return n?.test ? '傷害測試預告' : `第 ${n?.number} 波預告`
    return n?.test ? '傷害測試進行中' : `第 ${n?.number} 波進行中`
})
// 卡片標題列右邊：建造時是總隻數，出怪時是倍速
const waveMeta = computed(() => {
    const n = props.view.nextWave
    if (props.view.phase === 'wave') return `${props.view.speed}×`
    if (!n || n.test) return ''
    return `共 ${(n.groups ?? []).reduce((a, g) => a + g.count, 0)} 隻`
})
const watched = computed(() => props.frame?.players[props.view.watching] ?? null)
const watchedLabel = computed(() => (props.view.watching === props.myId ? '' : `${props.view.names?.[props.view.watching] ?? '玩家'}：`))
</script>
