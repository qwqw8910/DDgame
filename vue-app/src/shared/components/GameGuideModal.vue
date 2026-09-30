<template>
    <Teleport to="body">
        <Transition name="toast">
            <div v-if="modelValue" class="overlay" role="dialog" aria-modal="true" :aria-labelledby="titleId"
                @click.self="close" @keydown.esc="close">
                <div class="overlay-card" ref="cardRef" tabindex="-1"
                    style="max-width:480px;width:100%;max-height:85vh;display:flex;flex-direction:column;padding:0;text-align:left">

                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;
                                padding:16px 20px;border-bottom:1px solid var(--divider)">
                        <h2 :id="titleId" class="neon-heading" style="font-size:20px;margin:0">{{ title }}</h2>
                        <button class="header-icon-btn" aria-label="關閉說明" @click="close">✕</button>
                    </div>

                    <div class="gg-body">
                        <slot />
                    </div>

                    <div style="padding:12px 20px 16px;border-top:1px solid var(--divider)">
                        <button class="btn-primary" style="width:100%" @click="close">{{ confirmText }}</button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
/**
 * 通用「玩法說明」彈窗外框。
 * 內容以 slot 傳入，建議搭配 <GameGuideSection> 分段；
 * 第一次自動彈出的邏輯見 composables/useGameGuide.js。
 */
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    title: { type: String, default: '📖 玩法說明' },
    confirmText: { type: String, default: '我知道了，開始玩！' },
})
const emit = defineEmits(['update:modelValue'])

const titleId = `gg-title-${Math.random().toString(36).slice(2, 8)}`
const cardRef = ref(null)

function close() {
    emit('update:modelValue', false)
}

watch(() => props.modelValue, (open) => {
    if (open) nextTick(() => cardRef.value?.focus())
})
</script>

<style scoped>
.gg-body {
    overflow-y: auto;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

/* 供 slot 內容使用的通用樣式：ul/ol、備註、表格 */
.gg-body :deep(.gg-list) {
    margin: 0;
    padding-left: 20px;
}

.gg-body :deep(.gg-note) {
    margin-top: 8px !important;
    font-size: 12px;
    color: var(--label);
}

.gg-body :deep(.gg-table) {
    width: 100%;
    margin: 6px 0;
    border-collapse: collapse;
    text-align: center;
    font-size: 13px;
}

.gg-body :deep(.gg-table th),
.gg-body :deep(.gg-table td) {
    padding: 4px 6px;
    border: 1px solid var(--border);
}

.gg-body :deep(.gg-table th) {
    color: var(--heading);
    background: var(--bg-subtle);
}
</style>
