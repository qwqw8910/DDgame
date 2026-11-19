<template>
    <section class="gt-dex" aria-label="甜點圖鑑">
        <!-- 快速跳階：點了直接捲到那一階；★ 只看最愛 -->
        <nav class="gt-dex-jump" aria-label="跳到階級">
            <button v-for="s in sections" :key="s.key" type="button" class="gt-chip" :aria-pressed="!favOnly && active === s.key" @click="jump(s.key)">{{ s.short }}</button>
            <button type="button" class="gt-chip gt-chip--fav" :aria-pressed="favOnly" :aria-label="favOnly ? '顯示全部' : '只看最愛'" @click="favOnly = !favOnly">
                <span aria-hidden="true">{{ favOnly ? "★" : "☆" }}</span>最愛<span v-if="favCount" class="tabular-nums">{{ favCount }}</span>
            </button>
        </nav>

        <p v-if="favOnly && !visibleSections.length" class="m-0 py-4 text-center text-(--gt-muted)">
            還沒有最愛。點甜點右邊的 ☆ 加入，它的配方會排在合成表最上面。
        </p>

        <section v-for="s in visibleSections" :key="s.key" :id="`gt-dex-${s.key}`" class="gt-dex-sec">
            <h3 class="gt-heading">{{ s.title }}</h3>
            <p v-if="s.hint" class="m-0 mb-2 text-(--gt-muted)">{{ s.hint }}</p>

            <!-- 基礎甜點：選等級看各等級數值 -->
            <div v-if="s.key === 'base'" class="gt-dex-levels" role="group" aria-label="等級">
                <button v-for="(n, i) in catalog.levelNames" :key="n" type="button" class="gt-chip" :aria-pressed="level === i + 1" @click="level = i + 1">
                    Lv{{ i + 1 }}<span class="max-lg:hidden"> {{ n }}</span>
                </button>
            </div>

            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="t in s.items" :key="t.kind" class="gt-row group relative flex-col !items-stretch !gap-1">
                    <div class="flex items-center gap-2">
                        <!-- 滑鼠移上去、鍵盤聚焦或點名字，才在下方顯示攻擊／攻速／射程（跟合成提示同一套） -->
                        <button type="button" class="gt-plain flex min-h-9 min-w-0 flex-1 cursor-help items-center gap-2 p-0 text-left"
                            :aria-expanded="tipKind === t.kind" :aria-describedby="`gt-dex-tip-${t.kind}`"
                            @click="tipKind = tipKind === t.kind ? null : t.kind" @blur="tipKind = null">
                            <GemIcon :kind="t.kind" :level="t.base ? level : 6" :size="32" />
                            <b class="min-w-0 flex-1 truncate font-semibold text-(--gt-ink)">{{ t.base ? `Lv${level} ${catalog.levelNames[level - 1]}${t.name}` : t.name }}</b>
                        </button>
                        <button type="button" class="gt-star" :aria-pressed="isFav(t.kind)" :aria-label="`${isFav(t.kind) ? '取消最愛' : '加入最愛'}：${t.name}`" @click="toggleFav(t.kind)">{{ isFav(t.kind) ? '★' : '☆' }}</button>
                    </div>
                    <p class="m-0 leading-snug text-(--gt-muted)">{{ t.trait }}</p>
                    <ul v-if="t.needs" class="m-0 flex list-none flex-wrap gap-1 p-0">
                        <li v-for="(n, i) in t.needs" :key="i" class="gt-need" :class="`gt-need--${n.status}`">
                            <GemIcon :kind="n.kind" :size="20" />
                            <span>{{ n.label }}</span>
                        </li>
                    </ul>
                    <div :id="`gt-dex-tip-${t.kind}`" role="tooltip" class="gt-tip"
                        :class="tipKind === t.kind ? 'block' : 'hidden group-hover:block group-focus-within:block'">
                        <GemStatBars :stats="t.stats" :catalog="catalog" show-target />
                    </div>
                </li>
            </ul>
        </section>
    </section>
</template>

<script setup>
import { computed, nextTick, ref } from 'vue'
import { GEM_ORDER, ingredientLabel, recipeProgress } from '../data/gems.js'
import { useGemFavs } from '../composables/useGemFavs.js'
import GemIcon from './GemIcon.vue'
import GemStatBars from './GemStatBars.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
})

const { favs, isFav, toggleFav } = useGemFavs()
const level = ref(1)
const favOnly = ref(false)
const active = ref('base')
const tipKind = ref(null)

const TIERS = [
    { key: 't1', tier: 1, short: '1階', title: '1 階特殊塔', hint: '3 種基礎甜點合成' },
    { key: 't2', tier: 2, short: '2階', title: '2 階 進階特殊塔', hint: '由 1 階特殊塔再升級' },
    { key: 't3', tier: 3, short: '3階', title: '3 階 極致特殊塔', hint: '由 2 階特殊塔再升級' },
    { key: 't4', tier: 4, short: '隱藏', title: '隱藏塔', hint: '' },
]

const needsOf = (kind) => {
    const recipe = props.catalog.recipes.find(r => r.result === kind)
    if (!recipe) return null
    const me = props.view.me
    const statuses = me ? recipeProgress(recipe, me) : recipe.ingredients.map(() => 'unknown')
    return recipe.ingredients.map((need, i) => ({ kind: need.kind, label: ingredientLabel(need, props.catalog), status: statuses[i] }))
}

const sections = computed(() => {
    const base = {
        key: 'base', short: '基礎', title: '基礎甜點', hint: '每回合從這 8 種裡抽 5 顆，抽到的等級不一定。點下面的 Lv 可以看各等級的數值。',
        items: GEM_ORDER.filter(k => props.catalog.gems[k]).map(k => ({
            kind: k, base: true, name: props.catalog.gems[k].name, trait: props.catalog.gems[k].trait,
            stats: props.catalog.gems[k].levels[level.value - 1],
        })),
    }
    const unlocked = id => props.view.me?.recipes.some(r => r.id === id)
    const tiers = TIERS.map(t => ({
        ...t,
        items: Object.entries(props.catalog.specials)
            .filter(([kind, s]) => s.tier === t.tier && (t.tier < 4 || unlocked(kind) || !props.catalog.recipes.find(r => r.result === kind)?.hidden))
            .map(([kind, s]) => ({ kind, base: false, name: s.name, trait: s.trait, stats: s.stats, needs: needsOf(kind) })),
    })).filter(t => t.items.length)
    return [base, ...tiers]
})

const favCount = computed(() => favs.value.length)

const visibleSections = computed(() => {
    if (!favOnly.value) return sections.value
    return sections.value
        .map(s => ({ ...s, items: s.items.filter(t => isFav(t.kind)) }))
        .filter(s => s.items.length)
})

async function jump(key) {
    favOnly.value = false
    active.value = key
    await nextTick()
    document.getElementById(`gt-dex-${key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
</script>

<style scoped>
.gt-dex-jump {
    display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 10px;
}
@media (min-width: 1024px) {
    /* 電腦版內容在卡片裡捲動，跳階列釘在最上面 */
    .gt-dex-jump {
        position: sticky; top: -12px; z-index: 2; margin: -12px -14px 10px; padding: 10px 14px 8px;
        background: var(--gt-surface); border-bottom: 1px solid var(--gt-line-soft);
    }
    .gt-dex-sec { scroll-margin-top: 52px; }
}
.gt-dex-sec { margin-bottom: 14px; }
.gt-dex-sec:last-child { margin-bottom: 0; }
.gt-dex-levels { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
.gt-chip {
    min-height: 30px; padding: 2px 8px; border: 1px solid var(--gt-line-soft); border-radius: 999px;
    background: var(--gt-surface); color: var(--gt-text); font-size: 13px; cursor: pointer; white-space: nowrap;
}
.gt-chip[aria-pressed="true"] { border-color: var(--gt-accent); background: var(--gt-accent-soft); color: var(--gt-accent-ink); font-weight: 700; }
.gt-chip:focus-visible, .gt-star:focus-visible { outline: 2px solid var(--gt-accent); outline-offset: 2px; }
.gt-star {
    flex-shrink: 0; width: 36px; height: 36px; border: 0; border-radius: 10px; background: transparent;
    color: var(--gt-muted); font-size: 22px; line-height: 1; cursor: pointer;
}
.gt-star[aria-pressed="true"] { color: #E5B400; }
</style>
