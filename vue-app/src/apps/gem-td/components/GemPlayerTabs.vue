<template>
    <nav v-if="tabs.length > 1" class="flex shrink-0 gap-1 overflow-x-auto px-2 pb-1" aria-label="切換要看的地圖">
        <button v-for="t in tabs" :key="t.id" class="gt-tab" :class="{ 'gt-tab--on': t.id === view.watching, 'gt-tab--out': t.out }"
            :aria-pressed="t.id === view.watching" @click="$emit('watch', t.id)">
            <span class="flex items-center gap-1.5">
                <span class="size-2.5 shrink-0 rounded-full" :style="{ background: t.mark }" aria-hidden="true" />
                <span class="truncate font-semibold text-[#4A2C2A]">{{ t.name }}</span>
            </span>
            <span class="truncate text-[#7A5A50]" :class="{ 'text-[#D6305A]': t.alert }">{{ t.status }}</span>
        </button>
    </nav>
</template>

<script setup>
import { computed } from 'vue'
import { PLAYER_MARKS } from '../data/gems.js'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    frame: { type: Object, default: null },
    myId: { type: String, default: '' },
})
defineEmits(['watch'])

// 建造時顯示進度；波次中顯示這張地圖守得如何，漏怪時變色提醒，不會自動切走畫面
function statusOf(id) {
    const p = props.view.players[id]
    if (p.out) return { status: '出局', alert: false }
    if (props.view.phase === 'build') {
        if (p.ready) return { status: '已準備', alert: false }
        return { status: p.resolved ? '還在調整' : `放置 ${p.placed}／${props.catalog.gemsPerRound}`, alert: false }
    }
    const live = props.frame?.players[id]
    if (live?.leaked) return { status: `漏 ${live.leaked} 隻`, alert: true }
    return { status: live?.done ? '清完了' : '防守中', alert: false }
}

const tabs = computed(() => props.view.playerIds.map((id, i) => {
    const lives = props.frame?.players[id]?.lives ?? props.view.players[id].lives
    const { status, alert } = statusOf(id)
    const solo = props.view.options.livesMode === 'solo'
    return {
        id,
        out: props.view.players[id].out,
        mark: PLAYER_MARKS[i % PLAYER_MARKS.length],
        name: `${props.view.names?.[id] ?? '玩家'}${id === props.myId ? '（我）' : ''}`,
        status: solo && !props.view.players[id].out ? `♥ ${lives}・${status}` : status,
        alert,
    }
}))
</script>
