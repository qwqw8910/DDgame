<template>
    <!-- 說書人平衡指標（非強制）：善惡存活比、惡魔被懷疑程度、假資訊數量。讓兩邊都有機會贏 -->
    <section v-if="b" class="flex flex-col gap-1.5 rounded-lg border border-border bg-subtle p-2" aria-label="平衡指標">
        <h3 class="m-0 flex items-center gap-1 text-sm font-semibold text-label"><GameIcon id="balance" :size="14" /> 平衡指標<span class="text-[11px] font-normal text-body">（僅供參考）</span></h3>

        <!-- 善惡存活比 -->
        <div class="flex flex-col gap-0.5">
            <div class="flex justify-between text-xs">
                <span :style="{ color: TEAM_ASSETS.good.color }"><GameIcon kind="team" id="good" :size="12" /> 善良 {{ b.alive.good }}</span>
                <span class="text-body">存活 {{ b.alive.total }} 人</span>
                <span :style="{ color: TEAM_ASSETS.evil.color }">邪惡 {{ b.alive.evil }} <GameIcon kind="team" id="evil" :size="12" /></span>
            </div>
            <div class="flex h-2 overflow-hidden rounded-full bg-card" role="img" :aria-label="`善良 ${b.alive.good} 人、邪惡 ${b.alive.evil} 人存活`">
                <div class="h-full" :style="{ width: `${goodPct}%`, background: TEAM_ASSETS.good.color }"></div>
                <div class="h-full flex-1" :style="{ background: TEAM_ASSETS.evil.color }"></div>
            </div>
        </div>

        <dl class="m-0 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
            <dt class="text-body">惡魔被懷疑</dt>
            <dd class="m-0 text-right text-heading"><GameIcon :id="HEAT[b.heat].icon" :size="12" /> {{ HEAT[b.heat].label }}</dd>
            <dt class="text-body">惡魔被提名</dt>
            <dd class="m-0 text-right text-heading tabular-nums">{{ b.demonNominated }} 次{{ b.demonNominated ? `（最高達門檻 ${Math.round(b.demonMaxRatio * 100)}%）` : '' }}</dd>
            <dt class="text-body">粗估剩餘天數</dt>
            <dd class="m-0 text-right text-heading tabular-nums">{{ b.demonAlive ? `約 ${b.daysLeft} 天` : '—' }}</dd>
            <dt class="text-body">已送資訊</dt>
            <dd class="m-0 text-right text-heading tabular-nums">{{ b.info.total }} 則<span v-if="b.info.false" class="text-lemon">（假 {{ b.info.false }}）</span></dd>
        </dl>

        <ul v-if="b.hints.length" class="m-0 flex list-none flex-col gap-0.5 p-0 text-xs text-heading">
            <li v-for="h in b.hints" :key="h" class="rounded bg-lemon/10 px-1.5 py-0.5"><GameIcon id="warn" :size="10" /> {{ h }}</li>
        </ul>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import GameIcon from './GameIcon.vue'
import { TEAM_ASSETS } from '../data/assets.js'

const props = defineProps({
    balance: { type: Object, default: null },
})

const HEAT = {
    low: { icon: 'heatLow', label: '幾乎沒有' },
    medium: { icon: 'heatMedium', label: '有些懷疑' },
    high: { icon: 'heatHigh', label: '高度懷疑' },
}
const b = computed(() => props.balance)
const goodPct = computed(() => (b.value?.alive.total ? (b.value.alive.good / b.value.alive.total) * 100 : 50))
</script>
