<template>
    <!-- 傷害測試紀錄：每場一份排行，兩場以上再加總傷害榜。
         左欄很窄：每人兩行，第一行名字＋縮寫傷害，第二行進度條與細節，不會擠爆 -->
    <section v-if="test" aria-label="傷害測試紀錄">
        <h3 class="gt-heading">傷害測試紀錄</h3>
        <div v-for="r in test.rounds" :key="r.at" class="mb-3 last:mb-0">
            <p class="m-0 mb-1.5 flex flex-wrap justify-between gap-x-2 text-xs text-(--gt-muted)">
                <span>第 {{ r.at }} 波後</span>
                <span class="tabular-nums" :title="`巨獸血量 ${r.maxHp.toLocaleString()}`">巨獸 {{ compact(r.maxHp) }} 血</span>
            </p>
            <ol class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="(t, i) in r.rows" :key="t.id" class="min-w-0">
                    <div class="flex items-baseline gap-2">
                        <span class="min-w-0 flex-1 truncate">{{ i + 1 }}. {{ nameOf(t.id) }}</span>
                        <b class="shrink-0 font-semibold text-(--gt-ink) tabular-nums" :title="`${t.damage.toLocaleString()} 傷害`">{{ compact(t.damage) }}</b>
                    </div>
                    <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-(--gt-line-soft)" aria-hidden="true">
                        <div class="h-full rounded-full" :class="t.killed ? 'bg-(--gt-accent)' : 'bg-(--gt-faint)'" :style="{ width: `${pct(t, r.maxHp)}%` }" />
                    </div>
                    <p class="m-0 mt-0.5 flex flex-wrap gap-x-2 text-xs text-(--gt-muted) tabular-nums">
                        <span v-if="t.killed" class="font-semibold text-(--gt-accent-ink)">擊倒 {{ t.seconds }} 秒</span>
                        <span v-else>{{ pct(t, r.maxHp) }}%</span>
                        <span v-if="t.reward">+{{ t.reward }} 金</span>
                    </p>
                </li>
            </ol>
        </div>
        <template v-if="test.totals">
            <p class="m-0 mt-3 mb-1.5 text-xs text-(--gt-muted)">總傷害榜</p>
            <ol class="m-0 flex list-none flex-col gap-1 p-0">
                <li v-for="(t, i) in test.totals" :key="t.id" class="flex items-baseline gap-2">
                    <span class="min-w-0 flex-1 truncate">{{ i + 1 }}. {{ nameOf(t.id) }}</span>
                    <span class="shrink-0 tabular-nums" :title="`${t.damage.toLocaleString()} 傷害`">
                        <b class="font-semibold text-(--gt-ink)">{{ compact(t.damage) }}</b><span v-if="t.kills" class="text-xs text-(--gt-muted)">・倒 {{ t.kills }}</span>
                    </span>
                </li>
            </ol>
        </template>
    </section>
</template>

<script setup>
const props = defineProps({
    test: { type: Object, default: null },
    names: { type: Object, default: () => ({}) },
})

const nameOf = id => props.names?.[id] ?? '玩家'
const pct = (t, maxHp) => (t.killed ? 100 : Math.min(100, Math.round((t.damage / maxHp) * 100)))

// 大數字縮寫成「12.3萬」「1.2億」，完整數字放在 title
function compact(n) {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}億`
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}萬`
    return Math.round(n).toLocaleString()
}
</script>
