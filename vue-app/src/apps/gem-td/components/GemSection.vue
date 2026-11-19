<template>
    <!-- 手機與平板：就是原本的普通區塊，不加任何外殼 -->
    <details v-if="!desktop && fold" v-bind="$attrs" class="gt-fold" open>
        <summary class="gt-heading !mb-1">{{ title }}<GemHeaderIcon name="chevron" class="gt-fold-arrow text-(--gt-muted)" /></summary>
        <slot />
    </details>
    <section v-else-if="!desktop || bare" v-bind="$attrs"><slot /></section>

    <!-- 電腦：固定位置的卡片，標題列左邊是名稱、右邊是一句狀態（例：還可放 3 顆） -->
    <section v-else v-bind="$attrs" class="gt-panel">
        <header class="gt-panel-head">
            <h2 class="gt-panel-title">{{ title }}</h2>
            <span v-if="meta" class="gt-panel-meta">{{ meta }}</span>
        </header>
        <div class="gt-panel-body"><slot /></div>
    </section>
</template>

<script setup>
import GemHeaderIcon from './GemHeaderIcon.vue'
import { desktop } from '../composables/useGemLayout.js'

defineOptions({ inheritAttrs: false })
defineProps({
    title: { type: String, required: true },
    meta: { type: String, default: '' },
    fold: { type: Boolean, default: false }, // 手機與平板用可收合的 <details>
    bare: { type: Boolean, default: false }, // 電腦版也不加卡片外殼（放在別的卡片裡時用）
})
</script>
