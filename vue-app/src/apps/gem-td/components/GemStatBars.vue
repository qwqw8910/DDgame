<template>
    <!-- 攻擊／攻速／射程：5 格長條讓人一眼比高低，右邊附實際數字 -->
    <dl class="gt-bars m-0">
        <div v-for="r in rows" :key="r.label" class="gt-bar-row" :title="r.title">
            <dt class="gt-bar-label">{{ r.label }}</dt>
            <dd class="gt-bar-pips m-0" role="img" :aria-label="`${r.label} ${r.pips}／5，${r.value}`">
                <span v-for="i in 5" :key="i" class="gt-bar-pip" :class="i <= r.pips && 'gt-bar-pip--on'" />
            </dd>
            <dd class="gt-bar-value m-0">{{ r.value }}</dd>
        </div>
        <div v-if="showTarget && target" class="gt-bar-row" :title="target.title">
            <dt class="gt-bar-label">目標</dt>
            <dd class="gt-bar-target m-0">{{ target.value }}</dd>
        </div>
    </dl>
</template>

<script setup>
import { computed } from 'vue'
import { HITS, HITS_SHORT } from '../data/gems.js'

const props = defineProps({
    stats: { type: Object, required: true }, // { damage, cooldown, range }
    catalog: { type: Object, required: true },
    showTarget: { type: Boolean, default: false }, // 多一列「目標」（地面／空中）；選中的塔已有目標小方格，不重複顯示
})

// 刻度依整份圖鑑（所有甜點的每個等級＋特殊塔）的最小／最大值算：傷害與攻速差距大，用對數；射程用線性。
// 數值表改了也會自動跟著調整
const scaleCache = new WeakMap()
function scalesOf(catalog) {
    if (scaleCache.has(catalog)) return scaleCache.get(catalog)
    const all = [
        ...Object.values(catalog.gems).flatMap(g => g.levels),
        ...Object.values(catalog.specials).map(s => s.stats),
    ].filter(s => s?.cooldown)
    const span = (vals) => [Math.min(...vals), Math.max(...vals)]
    const scales = {
        damage: span(all.map(s => Math.log(Math.max(1, s.damage)))),
        speed: span(all.map(s => Math.log(1 / s.cooldown))),
        range: span(all.map(s => s.range)),
    }
    scaleCache.set(catalog, scales)
    return scales
}
const pipsOf = (v, [lo, hi]) => (hi <= lo ? 3 : Math.min(5, Math.max(1, Math.round(1 + ((v - lo) / (hi - lo)) * 4))))

function compact(n) {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}億`
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}萬`
    return String(Math.round(n))
}

const target = computed(() => (props.stats.hits ? { value: HITS_SHORT[props.stats.hits], title: HITS[props.stats.hits] } : null))

const rows = computed(() => {
    const s = props.stats
    const sc = scalesOf(props.catalog)
    const perSec = 1 / s.cooldown
    return [
        { label: '攻擊', pips: pipsOf(Math.log(Math.max(1, s.damage)), sc.damage), value: compact(s.damage), title: `每發 ${s.damage} 傷害` },
        { label: '攻速', pips: pipsOf(Math.log(perSec), sc.speed), value: `${+perSec.toFixed(1)}/秒`, title: `每 ${s.cooldown} 秒攻擊一次` },
        { label: '射程', pips: pipsOf(s.range, sc.range), value: `${s.range.toFixed(1)} 格` },
    ]
})
</script>
