<template>
    <!-- 左欄的查詢區：合成表／甜點圖鑑／蟲蟲圖鑑三個頁簽。電腦版是固定卡片，手機與平板是普通區塊 -->
    <section id="gt-recipes" :class="desktop ? 'gt-panel gt-panel--fill' : 'gt-recipes'" aria-label="圖鑑">
        <header :class="desktop ? 'gt-panel-head !px-2' : 'mb-2'">
            <div class="gt-codex-tabs" role="tablist" aria-label="圖鑑分頁">
                <button v-for="t in TABS" :id="`gt-codex-tab-${t.id}`" :key="t.id" type="button" role="tab" class="gt-codex-tab"
                    :aria-selected="tab === t.id" :aria-controls="`gt-codex-${t.id}`" :tabindex="tab === t.id ? 0 : -1"
                    @click="tab = t.id" @keydown.right.prevent="move(1)" @keydown.left.prevent="move(-1)">{{ t.label }}<span v-if="t.id === 'recipes' && readyFavs" class="gt-dot" aria-hidden="true" /><span v-if="t.id === 'recipes' && readyFavs" class="sr-only">，最愛有 {{ readyFavs }} 種可以合成</span></button>
            </div>
            <span v-if="desktop && tab === 'recipes' && meta" class="gt-panel-meta">{{ meta }}</span>
        </header>
        <div :id="`gt-codex-${tab}`" role="tabpanel" :aria-labelledby="`gt-codex-tab-${tab}`" :class="desktop ? 'gt-panel-body' : ''">
            <GemRecipes v-if="tab === 'recipes'" bare :view="view" :catalog="catalog" @combine="id => $emit('combine', id)" />
            <GemTowerDex v-else-if="tab === 'towers'" :view="view" :catalog="catalog" />
            <GemMonsterDex v-else :view="view" :catalog="catalog" />
        </div>
    </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGemFavs } from '../composables/useGemFavs.js'
import { desktop } from '../composables/useGemLayout.js'
import GemRecipes from './GemRecipes.vue'
import GemTowerDex from './GemTowerDex.vue'
import GemMonsterDex from './GemMonsterDex.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    meta: { type: String, default: '' },
})
defineEmits(['combine'])

const TABS = [
    { id: 'recipes', label: '合成表' },
    { id: 'towers', label: '甜點圖鑑' },
    { id: 'bugs', label: '蟲蟲圖鑑' },
]
const tab = ref('recipes')
const { readyFavCount } = useGemFavs()
const readyFavs = computed(() => readyFavCount(props.view, props.catalog))

// 方向鍵切換頁簽，並把焦點跟著移過去
function move(step) {
    const i = TABS.findIndex(t => t.id === tab.value)
    tab.value = TABS[(i + step + TABS.length) % TABS.length].id
    document.getElementById(`gt-codex-tab-${tab.value}`)?.focus()
}
</script>

<style scoped>
.gt-dot { display: inline-block; width: 8px; height: 8px; margin-left: 4px; border-radius: 50%; background: var(--gt-accent); vertical-align: middle; }
.gt-codex-tabs { display: flex; flex: 1; gap: 4px; min-width: 0; padding: 6px 0; }
.gt-codex-tab {
    flex: 1; min-width: 0; min-height: 34px; padding: 0 8px; border: 1px solid transparent; border-radius: 10px;
    background: transparent; color: var(--gt-muted); font-size: 15px; cursor: pointer; white-space: nowrap;
}
@media (pointer: coarse) { .gt-codex-tab { min-height: 44px; } }
.gt-codex-tab[aria-selected="true"] { border-color: var(--gt-accent); background: var(--gt-surface); color: var(--gt-accent-ink); font-weight: 700; }
.gt-codex-tab:focus-visible { outline: 2px solid var(--gt-accent); outline-offset: 2px; }
</style>
