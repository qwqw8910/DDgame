<template>
    <div class="overlay" @click.self="closable && $emit('close')">
        <component :is="as" v-bind="$attrs" class="overlay-card sb-modal" role="dialog" aria-modal="true" :aria-label="title">
            <!-- 固定三段：標題（含關閉鈕）、內容、操作按鈕；內容超出時只有中間的內容區會捲動 -->
            <header class="sb-modal__head">
                <button v-if="closable" type="button" class="sb-modal__close" aria-label="關閉" @click="$emit('close')">
                    <svg viewBox="0 0 256 256" width="22" height="22" fill="currentColor" aria-hidden="true">
                        <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                    </svg>
                </button>
                <h2 class="neon-heading text-xl sb-modal__title">{{ title }}</h2>
            </header>

            <div class="sb-modal__body">
                <p v-if="text" class="sb-modal__text">{{ text }}</p>
                <slot />
            </div>

            <footer class="sb__actions sb-modal__foot">
                <slot name="actions" />
            </footer>
        </component>
    </div>
</template>

<script setup>
defineOptions({ inheritAttrs: false })

defineProps({
    title: { type: String, required: true },
    text: { type: String, default: '' },               // 內容區的說明文字（確認視窗用）；表單類彈窗直接放 slot
    as: { type: String, default: 'div' },              // 表單彈窗用 'form'，submit 事件會透傳
    closable: { type: Boolean, default: true },        // false = 必須用按鈕操作（例如首次輸入名字）
})
defineEmits(['close'])
</script>
