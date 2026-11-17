<template>
    <!-- 電腦版標題列的「面板」選單：列出目前有的區塊，可顯示／隱藏，並重設版面 -->
    <div class="relative max-lg:hidden">
        <button class="header-icon-btn" title="面板（顯示、隱藏、重設版面）" aria-label="面板選單" aria-haspopup="menu" :aria-expanded="open" @click="open = !open">
            <GemHeaderIcon name="layout" />
        </button>
        <template v-if="open">
            <div class="fixed inset-0 z-40" aria-hidden="true" @click="open = false" />
            <div role="menu" aria-label="面板"
                class="absolute right-0 top-full z-50 mt-2 flex max-h-[70dvh] w-60 flex-col gap-1 overflow-y-auto rounded-[10px] border border-(--gt-line) bg-(--gt-surface) p-2 shadow-(--gt-shadow)">
                <p class="m-0 px-2 py-1 text-xs text-(--gt-muted)">拖標題列可換位置、換欄；雙擊標題列收折。</p>
                <button v-for="[id, title] in items" :key="id" role="menuitemcheckbox" :aria-checked="!dock.get(id).hidden" class="gt-btn flex items-center gap-2 border-0 text-left" @click="dock.setHidden(id, !dock.get(id).hidden)">
                    <span class="w-4 shrink-0">{{ dock.get(id).hidden ? '' : '✓' }}</span>
                    <span class="min-w-0 flex-1 truncate">{{ title }}</span>
                    <span v-if="dock.get(id).where === 'float' && !dock.get(id).hidden" class="shrink-0 text-xs text-(--gt-muted)">浮動</span>
                </button>
                <p v-if="!items.length" class="m-0 px-2 py-1 text-(--gt-muted)">目前沒有可調整的區塊。</p>
                <button role="menuitem" class="gt-btn mt-1" @click="reset">重設版面</button>
            </div>
        </template>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import GemHeaderIcon from './GemHeaderIcon.vue'
import * as dock from '../composables/useGemDock.js'

const open = ref(false)
const items = computed(() => Object.entries(dock.mounted).sort((a, b) => dock.orderOf(a[0]) - dock.orderOf(b[0])))
function reset() {
    dock.resetLayout()
    open.value = false
}
</script>
