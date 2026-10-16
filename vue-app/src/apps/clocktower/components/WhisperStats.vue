<template>
    <!-- 私聊統計表：誰跟誰聊過幾次、累計多久；可切換今天 / 第 N 天 / 全部；點格子列出每次私聊的時間 -->
    <section class="flex flex-col gap-2" aria-label="私聊統計">
        <div class="flex flex-wrap items-center gap-1" role="tablist">
            <button v-for="f in filters" :key="f.key" type="button" role="tab" :aria-selected="filter === f.key"
                :class="['rounded-full border px-2.5 py-0.5 text-xs', filter === f.key ? 'border-neon-purple bg-neon-purple/15 text-heading' : 'border-border text-body']"
                @click="filter = f.key; picked = null">{{ f.label }}</button>
        </div>

        <p v-if="!people.length" class="m-0 text-sm text-body">{{ filter === 'all' ? '這局還沒有人私聊。' : '這段時間沒有人私聊。' }}</p>

        <div v-else class="max-w-full overflow-x-auto">
            <table class="border-separate border-spacing-0.5 text-xs">
                <thead>
                    <tr>
                        <th scope="col" class="sr-only">玩家</th>
                        <th v-for="c in people" :key="c" scope="col" class="min-w-8 px-1 font-semibold text-label" :title="nameOf(c)">{{ seatNo(c) }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="r in people" :key="r">
                        <th scope="row" class="max-w-24 truncate pr-1 text-left font-semibold text-heading" :title="nameOf(r)">{{ seatNo(r) }}. {{ nameOf(r) }}</th>
                        <td v-for="c in people" :key="c" class="p-0 text-center">
                            <span v-if="r === c" class="block px-1 text-body" aria-hidden="true">—</span>
                            <button v-else-if="pairs[pairKey(r, c)]" type="button"
                                :class="['block w-full rounded px-1 py-0.5 tabular-nums', picked === pairKey(r, c) ? 'bg-neon-cyan/25 text-heading ring-1 ring-neon-cyan' : 'bg-neon-purple/15 text-heading hover:bg-neon-purple/25']"
                                :title="`${nameOf(r)} ↔ ${nameOf(c)}：${pairs[pairKey(r, c)].count} 次，共 ${formatDuration(pairs[pairKey(r, c)].totalMs)}`"
                                @click="picked = picked === pairKey(r, c) ? null : pairKey(r, c)">{{ pairs[pairKey(r, c)].count }}次</button>
                            <span v-else class="block px-1 text-body/50" aria-hidden="true">·</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <!-- 點格子：兩人每次私聊的時間 -->
        <section v-if="pickedPair" class="rounded-lg bg-subtle p-2 text-sm">
            <h4 class="m-0 mb-1 text-xs font-semibold text-label">
                {{ nameOf(pickedPair.a) }} ↔ {{ nameOf(pickedPair.b) }}：{{ pickedPair.count }} 次，共 {{ formatDuration(pickedPair.totalMs) }}
            </h4>
            <ul class="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-heading">
                <li v-for="(x, i) in pickedPair.sessions" :key="i" class="flex items-center gap-1.5">
                    <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: x.color }"></span>
                    第 {{ x.dayNumber }} 天　{{ formatClock(x.start) }}–{{ x.ongoing ? '現在' : formatClock(x.end) }}（{{ formatDuration(x.end - x.start) }}）
                </li>
            </ul>
        </section>
    </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import { formatClock } from '../data/constants.js'
import { whisperPairs, whisperDays, pairKey, formatDuration } from '../data/whisperStats.js'

const props = defineProps({
    whisperLog: { type: Array, default: () => [] },
    seats: { type: Array, default: () => [] },
    names: { type: Object, default: () => ({}) },
    dayNumber: { type: Number, default: 0 },
    now: { type: Number, default: () => Date.now() },
})

const filter = ref('today')
const picked = ref(null)
const filters = computed(() => [
    { key: 'today', label: '今天' },
    ...whisperDays(props.whisperLog).filter(d => d !== props.dayNumber).map(d => ({ key: d, label: `第 ${d} 天` })),
    { key: 'all', label: '全部' },
])
const day = computed(() => (filter.value === 'all' ? null : filter.value === 'today' ? props.dayNumber : filter.value))
const pairs = computed(() => whisperPairs(props.whisperLog, { day: day.value, now: props.now }))

// 有私聊紀錄的人，依座位順序
const seatIndexOf = id => props.seats.findIndex(s => s.playerId === id)
const people = computed(() => {
    const ids = new Set(Object.values(pairs.value).flatMap(p => [p.a, p.b]))
    return [...ids].sort((a, b) => seatIndexOf(a) - seatIndexOf(b))
})
const nameOf = id => props.names[id] ?? '?'
const seatNo = id => (seatIndexOf(id) >= 0 ? seatIndexOf(id) + 1 : '?')
const pickedPair = computed(() => (picked.value ? pairs.value[picked.value] ?? null : null))
</script>
