<template>
    <Transition name="gt-pop">
        <section v-if="modelValue" ref="panel" class="gt-recipes" role="dialog" aria-label="合成表"
            :style="{ left: `${pos.x}px`, top: `${pos.y}px` }">
            <header class="flex items-center border-b border-[#EAC8CF]">
                <div class="gt-recipes-handle" title="按住拖曳" @pointerdown="onDragStart" @pointermove="onDragMove"
                    @pointerup="onDragEnd" @pointercancel="onDragEnd">
                    <span aria-hidden="true">⠿</span>
                    <h2 class="m-0 text-base font-bold text-[#4A2C2A]">合成表</h2>
                </div>
                <button class="gt-recipes-close" aria-label="關閉合成表" @click="$emit('update:modelValue', false)">✕</button>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto p-2">
                <p v-if="view.me" class="mt-0 mb-2 text-[#7A5A50]">✓ 已有　◔ 放完才能用　✕ 缺少</p>

                <h3 class="gt-heading">同級合成</h3>
                <ul class="m-0 mb-3 flex list-none flex-col gap-1 p-0">
                    <li>本回合 2 個同種同級：留下的升 1 級</li>
                    <li>本回合 4 個同種同級：留下的升 2 級</li>
                    <li v-for="m in merges" :key="`${m.kind}${m.level}`" class="gt-need w-fit" :class="`gt-need--${m.status}`">
                        <span aria-hidden="true">{{ STATUS[m.status].mark }}</span>
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
                                <b class="min-w-0 flex-1 truncate font-semibold text-[#4A2C2A]">{{ r.name }}</b>
                                <button v-if="r.canCombine" class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('combine', r.id)">合成</button>
                                <span v-else-if="r.summary" class="shrink-0 text-[#7A5A50]">{{ r.summary }}</span>
                            </div>
                            <p class="m-0 leading-snug text-[#7A5A50]">{{ r.trait }}</p>
                            <ul class="m-0 flex list-none flex-wrap gap-1 p-0">
                                <li v-for="(n, i) in r.needs" :key="i" class="gt-need" :class="`gt-need--${n.status}`">
                                    <span v-if="n.mark" aria-hidden="true">{{ n.mark }}</span>
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

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
})
defineEmits(['update:modelValue', 'combine'])

const STATUS = {
    ready: { mark: '✓', text: '已有' },
    placing: { mark: '◔', text: '放完才能用' },
    missing: { mark: '✕', text: '缺少' },
    unknown: { mark: '', text: '' },
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
                mark: STATUS[statuses[i]].mark,
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

function moveTo(x, y) {
    if (!panel.value) return
    pos.x = Math.max(EDGE_GAP, Math.min(x, window.innerWidth - panel.value.offsetWidth - EDGE_GAP))
    pos.y = Math.max(EDGE_GAP, Math.min(y, window.innerHeight - panel.value.offsetHeight - EDGE_GAP))
}

function keepInView() {
    moveTo(pos.x, pos.y)
}

function onDragStart(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    grab = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
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
