<template>
    <div :class="['app-alert', `app-alert--${variant}`]" :role="variant === 'error' ? 'alert' : 'status'">
        <svg class="app-alert__icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
            stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <template v-if="variant === 'info'">
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
            </template>
            <template v-else>
                <line x1="12" y1="8" x2="12" y2="13" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
            </template>
        </svg>
        <div class="app-alert__body"><slot /></div>
        <button v-if="actionLabel" type="button" class="app-alert__action" @click="$emit('action')">
            {{ actionLabel }}
        </button>
    </div>
</template>

<script setup>
defineProps({
    variant: { type: String, default: 'info', validator: v => ['info', 'warning', 'error'].includes(v) },
    actionLabel: { type: String, default: '' },
})
defineEmits(['action'])
</script>

<style scoped>
.app-alert {
    --alert-color: #2563eb;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 10px 14px;
    margin-bottom: 12px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--alert-color) 35%, transparent);
    background: var(--alert-bg, color-mix(in srgb, var(--alert-color) 12%, transparent));
    color: var(--color-heading);
    font-size: 16px;
    line-height: 1.5;
}
.app-alert--info { --alert-color: #3b56f6; --alert-bg: rgba(250, 251, 255, 0.8); }
.app-alert--warning { --alert-color: #d97706; }
.app-alert--error { --alert-color: #e11d48; }
.app-alert__icon { flex-shrink: 0; color: var(--alert-color); }
.app-alert__body { flex: 1 1 200px; min-width: 0; }
.app-alert__action {
    flex-shrink: 0;
    margin-left: auto;
    padding: 6px 14px;
    border-radius: 10px;
    border: 1px solid var(--alert-color);
    background: transparent;
    color: var(--alert-color);
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
}
.app-alert__action:hover { background: var(--alert-color); color: #fff; }
</style>
