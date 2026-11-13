<template>
    <Transition name="gt-pop">
        <!-- docked：電腦版停靠在左欄；否則是可拖曳的浮動面板 -->
        <section v-if="modelValue" ref="panel" class="gt-recipes" :class="{ 'gt-recipes--docked': docked }"
            :role="docked ? 'region' : 'dialog'" aria-label="合成表"
            :style="docked ? null : { left: `${pos.x}px`, top: `${pos.y}px` }">
            <header class="flex items-center border-b border-(--gt-line-soft)">
                <h2 v-if="docked" class="m-0 flex-1 px-3 text-base font-bold text-(--gt-ink)">合成表</h2>
                <div v-else class="gt-recipes-handle" title="按住拖曳" @pointerdown="onDragStart" @pointermove="onDragMove"
                    @pointerup="onDragEnd" @pointercancel="onDragEnd">
                    <GemHeaderIcon name="grip" />
                    <h2 class="m-0 text-base font-bold text-(--gt-ink)">合成表</h2>
                </div>
                <button class="gt-recipes-close" aria-label="關閉合成表" @click="$emit('update:modelValue', false)"><GemHeaderIcon name="close" /></button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto p-2">
                <p v-if="view.me" class="mt-0 mb-2 flex flex-wrap items-center gap-x-3 text-(--gt-muted)">
                    <span class="inline-flex items-center gap-1"><GemHeaderIcon name="check" :size="14" />已有</span>
                    <span class="inline-flex items-center gap-1"><GemHeaderIcon name="pending" :size="14" />放完才能用</span>
                    <span class="inline-flex items-center gap-1"><GemHeaderIcon name="cross" :size="14" />缺少</span>
                </p>

                <h3 class="gt-heading">同級合成</h3>
                <ul class="m-0 mb-3 flex list-none flex-col gap-1 p-0">
                    <li>本回合 2 個同種同級：留下的升 1 級</li>
                    <li>本回合 4 個同種同級：留下的升 2 級</li>
                    <li v-for="m in merges" :key="`${m.kind}${m.level}`" class="gt-need w-fit" :class="`gt-need--${m.status}`">
                        <GemHeaderIcon :name="STATUS[m.status].icon" :size="14" />
                        <GemIcon :kind="m.kind" :size="20" />
                        <span>{{ catalog.gems[m.kind].name }} Lv{{ m.level }} ×{{ m.count }} → Lv{{ m.level + m.gain }}</span>
                        <span class="sr-only">{{ STATUS[m.status].text }}</span>
                    </li>
                </ul>

                <template v-for="group in groups" :key="group.title">
                    <h3 class="gt-heading">{{ group.title }}</h3>
                    <ul class="m-0 mb-3 flex list-none flex-col gap-1.5 p-0 last:mb-0">
                        <li v-for="r in group.rows" :key="r.id" class="gt-row flex-col !items-stretch !gap-1" :class="{ 'gt-row--on': r.canCombine }">
                            <div class="flex items-center gap-2">
                                <GemIcon :kind="r.result" :size="30" />
                                <b class="min-w-0 flex-1 truncate font-semibold text-(--gt-ink)">{{ r.name }}</b>
                                <button v-if="r.canCombine" class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('combine', r.id)">合成</button>
                                <span v-else-if="r.summary" class="shrink-0 text-(--gt-muted)">{{ r.summary }}</span>
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
            </div>
        </section>
    </Transition>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ingredientLabel, mergeOptions, recipeProgress } from '../data/gems.js'
import GemIcon from './GemIcon.vue'
import GemHeaderIcon from './GemHeaderIcon.vue'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    docked: { type: Boolean, default: false },
})
defineEmits(['update:modelValue', 'combine'])

const STATUS = {
    ready: { icon: 'check', text: '已有' },
    placing: { icon: 'pending', text: '放完才能用' },
    missing: { icon: 'cross', text: '缺少' },
    unknown: { icon: '', text: '' },
}

const rows = computed(() => {
    const me = props.view.me
    return props.catalog.recipes.map((recipe) => {
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

const groups = computed(() => [
    { title: '特殊塔', rows: rows.value.filter(r => r.tier === 1) },
    { title: '進階特殊塔', rows: rows.value.filter(r => r.tier === 2) },
    { title: '極致特殊塔', rows: rows.value.filter(r => r.tier === 3) },
])

const merges = computed(() => (props.view.me ? mergeOptions(props.view.me, props.catalog.levelNames.length) : []))

// ── 拖曳 ─────────────────────────────────────────────────────────
const EDGE_GAP = 8
const panel = ref(null)
const pos = reactive({ x: EDGE_GAP, y: 56 })
let grab = null
let dragged = false

// 停靠模式不需要定位。浮動時預設對齊最左邊的玩家名字分頁、放在它下方（看別人地圖時再往下讓出提示列）；
// 單人沒有分頁時，放在血量／金幣那一列下方靠左。拖過就記住使用者的位置
function placeDefault() {
    if (!panel.value) return
    const firstTab = document.querySelector('.gt-root .gt-tab')
    const anchor = document.querySelector('.gt-root .gt-watching')
        ?? firstTab?.parentElement
        ?? document.querySelector('.gt-root [role="status"]')
    const top = anchor ? anchor.getBoundingClientRect().bottom + EDGE_GAP : 56
    const left = firstTab ? firstTab.getBoundingClientRect().left : EDGE_GAP
    moveTo(left, top)
}

function moveTo(x, y) {
    if (!panel.value) return
    pos.x = Math.max(EDGE_GAP, Math.min(x, window.innerWidth - panel.value.offsetWidth - EDGE_GAP))
    pos.y = Math.max(EDGE_GAP, Math.min(y, window.innerHeight - panel.value.offsetHeight - EDGE_GAP))
}

function keepInView() {
    if (props.docked) return
    if (dragged) moveTo(pos.x, pos.y)
    else placeDefault()
}

function onDragStart(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    grab = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    dragged = true
}

function onDragMove(e) {
    if (grab) moveTo(e.clientX - grab.dx, e.clientY - grab.dy)
}

function onDragEnd() {
    grab = null
}

watch(() => props.modelValue, (open) => { if (open) nextTick(keepInView) })
onMounted(() => window.addEventListener('resize', keepInView))
onUnmounted(() => window.removeEventListener('resize', keepInView))
</script>
