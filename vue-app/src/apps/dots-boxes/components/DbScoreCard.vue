<template>
    <!-- 單一玩家計分卡：色點（與棋盤線色相同）＋名稱＋分數；輪到的人有一圈外框 -->
    <div class="flex min-w-0 items-center gap-3 rounded-tile bg-raised p-4 shadow-(--shadow-tile) transition-[box-shadow] duration-150 ease-soft motion-reduce:transition-none"
        :class="active ? (seat === 0 ? 'shadow-[inset_0_0_0_2px_var(--color-brand)]' : 'shadow-[inset_0_0_0_2px_var(--color-ink)]') : ''"
        :aria-current="active ? 'true' : undefined">
        <span aria-hidden="true" class="size-3 shrink-0 rounded-full" :class="seat === 0 ? 'bg-brand' : 'bg-ink'"></span>
        <div class="min-w-0 flex-1">
            <p class="m-0 flex min-w-0 items-center gap-1.5 text-base leading-snug text-ink">
                <span class="truncate">{{ name || '等待加入…' }}</span>
                <span v-if="isMe" class="shrink-0 text-brand-ink">你</span>
            </p>
            <p class="m-0 text-base leading-snug text-ink-faint">
                <template v-if="!online">離線</template>
                <template v-else-if="outcome">{{ outcome }}<template v-if="showCount"> · {{ count }} 格</template></template>
                <template v-else-if="showCount">{{ count }} 格</template>
                <template v-else>{{ active ? '下棋中' : '等待中' }}</template>
            </p>
        </div>
        <p class="m-0 font-display text-4xl leading-none tabular-nums text-ink">
            <span class="sr-only">得分</span>{{ score }}
        </p>
    </div>
</template>

<script setup>
defineProps({
    seat: { type: Number, required: true },
    name: { type: String, default: '' },
    score: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    // 進階模式才需要另外顯示「拿了幾格」
    showCount: { type: Boolean, default: false },
    active: { type: Boolean, default: false },
    isMe: { type: Boolean, default: false },
    online: { type: Boolean, default: true },
    // 結算後顯示的結果文字（獲勝／平手）；空字串 = 對局中
    outcome: { type: String, default: '' },
})
</script>
