<template>
    <!-- 傷害測試紀錄：每場一份排行，兩場以上再加總傷害榜 -->
    <section v-if="test" aria-label="傷害測試紀錄">
        <h3 class="gt-heading">傷害測試紀錄</h3>
        <div v-for="r in test.rounds" :key="r.at" class="mb-2">
            <p class="m-0 mb-1 text-(--gt-muted)">打完第 {{ r.at }} 波後（巨獸血量 {{ r.maxHp.toLocaleString() }}）</p>
            <ol class="m-0 flex list-none flex-col gap-1 p-0">
                <li v-for="(t, i) in r.rows" :key="t.id" class="flex justify-between gap-3">
                    <span class="truncate">{{ i + 1 }}. {{ nameOf(t.id) }}</span>
                    <span class="shrink-0 tabular-nums">{{ rowText(t, r.maxHp) }}</span>
                </li>
            </ol>
        </div>
        <template v-if="test.totals">
            <p class="m-0 mb-1 text-(--gt-muted)">總傷害榜</p>
            <ol class="m-0 flex list-none flex-col gap-1 p-0">
                <li v-for="(t, i) in test.totals" :key="t.id" class="flex justify-between gap-3">
                    <span class="truncate">{{ i + 1 }}. {{ nameOf(t.id) }}</span>
                    <span class="shrink-0 tabular-nums">{{ t.damage.toLocaleString() }} 傷<template v-if="t.kills">，擊倒 {{ t.kills }} 次</template></span>
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

function rowText(t, maxHp) {
    const pct = Math.min(100, Math.round((t.damage / maxHp) * 100))
    const base = t.killed ? `${t.damage.toLocaleString()} 傷，擊倒（${t.seconds} 秒）` : `${t.damage.toLocaleString()} 傷（${pct}%）`
    return t.reward ? `${base}，+${t.reward} 金` : base
}
</script>
