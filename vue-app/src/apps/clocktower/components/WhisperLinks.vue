<template>
    <!-- 疊在圓桌上的私聊連線：2 人一條線、3 人以上連成一圈；自己的群組加粗 + 流動動畫 -->
    <svg class="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true">
        <g v-for="g in shapes" :key="g.id" :opacity="focusId && focusId !== g.id ? 0.15 : 1">
            <polyline :points="g.points" fill="none" :stroke="g.color" stroke-linecap="round" stroke-linejoin="round"
                :stroke-width="g.mine || focusId === g.id ? 1.4 : 0.6"
                :class="g.mine ? 'ct-flow' : ''" :stroke-dasharray="g.mine ? '3 2' : undefined" />
        </g>
    </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    groups: { type: Array, default: () => [] },        // [{ id, color, members: [playerId] }]
    seatOfPlayer: { type: Function, required: true },  // playerId → 座位號
    position: { type: Function, required: true },      // 座位號 → { x, y }（0–100）
    myGroupId: { type: String, default: null },
    focusId: { type: String, default: null },
})

const shapes = computed(() => props.groups.map(g => {
    const seats = g.members.map(props.seatOfPlayer).filter(i => i >= 0).sort((a, b) => a - b)
    const pts = seats.map(i => props.position(i))
    if (pts.length > 2) pts.push(pts[0])
    return { id: g.id, color: g.color, mine: g.id === props.myGroupId, points: pts.map(p => `${p.x},${p.y}`).join(' ') }
}).filter(g => g.points))
</script>
