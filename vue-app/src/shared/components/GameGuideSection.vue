<template>
    <section class="gg-section" :class="{ 'gg-section--warn': warn }">
        <h3 class="gg-section-title">{{ title }}</h3>
        <slot />
    </section>
</template>

<script setup>
// GameGuideModal 內的一個段落；warn 用於強調「禁止事項」
defineProps({
    title: { type: String, required: true },
    warn: { type: Boolean, default: false },
})
</script>

<style scoped>
.gg-section {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    font-size: 14px;
    line-height: 1.7;
    color: var(--body);
}

.gg-section :deep(p) {
    margin: 0 0 6px;
}

.gg-section :deep(p:last-child) {
    margin-bottom: 0;
}

.gg-section :deep(b) {
    color: var(--heading);
}

.gg-section--warn {
    border-color: rgba(244, 63, 94, 0.35);
    background: rgba(244, 63, 94, 0.07);
}

.gg-section-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 700;
    color: var(--heading);
}
</style>
