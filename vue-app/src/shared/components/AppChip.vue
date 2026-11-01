<template>
    <span :class="['app-chip', `app-chip--${variant}`]"><slot /></span>
</template>

<script setup>
defineProps({
    variant: { type: String, default: 'danger', validator: v => ['danger'].includes(v) },
})
</script>

<style scoped>
.app-chip {
    --chip-color: #cf2f5b;
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--chip-color) 40%, transparent);
    background: color-mix(in srgb, var(--chip-color) 12%, transparent);
    color: var(--chip-color);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.5;
    white-space: nowrap;
}
</style>
