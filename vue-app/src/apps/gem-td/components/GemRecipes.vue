<template>
    <!-- 合成表：一律排在版面裡（電腦版在左欄卡片、平板在操作區、手機是分頁），不再浮在地圖上 -->
    <section :id="bare ? undefined : 'gt-recipes'" :class="bare ? '' : 'gt-recipes'" aria-label="合成表">
        <p v-if="view.me" class="mt-0 mb-2 flex flex-wrap items-center gap-x-3 text-(--gt-muted)">
            <span class="inline-flex items-center gap-1"><GemHeaderIcon name="check" :size="14" />已有</span>
            <span class="inline-flex items-center gap-1"><GemHeaderIcon name="pending" :size="14" />放完才能用</span>
            <span class="inline-flex items-center gap-1"><GemHeaderIcon name="cross" :size="14" />缺少</span>
        </p>

        <!-- 只在本回合真的有同種同級可以合時才出現（規則本身在新手教學裡） -->
        <template v-if="merges.length">
            <h3 class="gt-heading">本回合可同級合成</h3>
            <ul class="m-0 mb-3 flex list-none flex-col gap-1 p-0">
                <li v-for="m in merges" :key="`${m.kind}${m.level}`" class="gt-need w-fit" :class="`gt-need--${m.status}`">
                    <GemHeaderIcon :name="STATUS[m.status].icon" :size="14" />
                    <GemIcon :kind="m.kind" :size="20" />
                    <span>{{ catalog.gems[m.kind].name }} Lv{{ m.level }} ×{{ m.count }} → Lv{{ m.level + m.gain }}</span>
                    <span class="sr-only">{{ STATUS[m.status].text }}</span>
                </li>
            </ul>
        </template>

        <template v-for="group in groups.filter(g => g.rows.length)" :key="group.title">
            <h3 class="gt-heading">{{ group.title }}</h3>
            <ul class="m-0 mb-3 flex list-none flex-col gap-1.5 p-0 last:mb-0">
                <li v-for="r in group.rows" :key="r.id" class="gt-row flex-col !items-stretch !gap-1" :class="{ 'gt-row--on': r.canCombine }">
                    <div class="flex items-center gap-2">
                        <GemIcon :kind="r.result" :size="30" />
                        <b class="min-w-0 flex-1 truncate font-semibold text-(--gt-ink)">{{ r.name }}</b>
                        <button v-if="r.canCombine" class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('combine', r.id)">合成</button>
                        <span v-else-if="r.summary" class="shrink-0 text-(--gt-muted)">{{ r.summary }}</span>
                        <button type="button" class="gt-fav" :aria-pressed="isFav(r.result)" :aria-label="`${isFav(r.result) ? '取消最愛' : '加入最愛'}：${r.name}`" @click="toggleFav(r.result)">{{ isFav(r.result) ? '★' : '☆' }}</button>
                    </div>
                    <p class="m-0 leading-snug text-(--gt-muted)">{{ r.trait }}</p>
                    <ul class="m-0 flex list-none flex-wrap gap-1 p-0">
                        <li v-for="(n, i) in r.needs" :key="i" class="gt-need" :class="`gt-need--${n.status}`">
                            <GemHeaderIcon v-if="n.icon" :name="n.icon" :size="14" />
                            <GemIcon :kind="n.kind" :size="20" />
                            <span>{{ n.label }}</span>
                            <span class="sr-only">{{ n.statusText }}</span>
                        </li>
                    </ul>
                </li>
            </ul>
        </template>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import { ingredientLabel, mergeOptions, recipeProgress } from '../data/gems.js'
import GemIcon from './GemIcon.vue'
import GemHeaderIcon from './GemHeaderIcon.vue'
import { useGemFavs } from '../composables/useGemFavs.js'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    bare: { type: Boolean, default: false }, // 放在圖鑑頁簽裡時，外層由 GemCodex 負責
})
const { isFav, toggleFav } = useGemFavs()
defineEmits(['combine'])

const STATUS = {
    ready: { icon: 'check', text: '已有' },
    placing: { icon: 'pending', text: '放完才能用' },
    missing: { icon: 'cross', text: '缺少' },
    unknown: { icon: '', text: '' },
}

const rows = computed(() => {
    const me = props.view.me
    // 隱藏配方：材料湊齊（可以合成）前不顯示
    return props.catalog.recipes.filter(recipe => !recipe.hidden || props.view.me?.recipes.some(r => r.id === recipe.id)).map((recipe) => {
        // 觀戰者沒有材料可比對，只顯示配方
        const statuses = me ? recipeProgress(recipe, me) : recipe.ingredients.map(() => 'unknown')
        const missing = statuses.filter(s => s === 'missing').length
        const canCombine = !!me?.recipes.some(r => r.id === recipe.id)
        const special = props.catalog.specials[recipe.result]
        return {
            id: recipe.id,
            result: recipe.result,
            tier: special.tier,
            name: special.name,
            trait: special.trait,
            canCombine,
            summary: !me ? '' : missing ? `缺 ${missing} 樣` : props.view.phase === 'build' ? '放完可合成' : '建造時可合成',
            needs: recipe.ingredients.map((need, i) => ({
                kind: need.kind,
                label: ingredientLabel(need, props.catalog),
                status: statuses[i],
                icon: STATUS[statuses[i]].icon,
                statusText: STATUS[statuses[i]].text,
            })),
        }
    })
})

// 最愛的塔排在最上面，一眼看到現在要湊什麼
const groups = computed(() => [
    { title: '★ 我的目標', rows: rows.value.filter(r => isFav(r.result)) },
    { title: '特殊塔', rows: rows.value.filter(r => r.tier === 1 && !isFav(r.result)) },
    { title: '進階特殊塔', rows: rows.value.filter(r => r.tier === 2 && !isFav(r.result)) },
    { title: '極致特殊塔', rows: rows.value.filter(r => r.tier === 3 && !isFav(r.result)) },
    { title: '隱藏塔', rows: rows.value.filter(r => r.tier === 4 && !isFav(r.result)) },
])

const merges = computed(() => (props.view.me ? mergeOptions(props.view.me, props.catalog.levelNames.length) : []))
</script>

<style scoped>
.gt-fav {
    flex-shrink: 0; width: 32px; height: 32px; border: 0; border-radius: 10px; background: transparent;
    color: var(--gt-muted); font-size: 20px; line-height: 1; cursor: pointer;
}
@media (pointer: coarse) { .gt-fav { width: 44px; height: 44px; margin: -6px; } }
.gt-fav[aria-pressed="true"] { color: #E5B400; }
.gt-fav:focus-visible { outline: 2px solid var(--gt-accent); outline-offset: 2px; }
</style>
