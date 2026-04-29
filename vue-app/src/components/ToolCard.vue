<template>
    <component :is="isClickable ? (tool.externalUrl ? 'a' : 'RouterLink') : 'div'" v-bind="linkProps" class="tool-card"
        :class="[`tool-card--${tool.color}`, { 'tool-card--disabled': !isClickable }]">
        <!-- Status badge -->
        <div v-if="tool.status !== 'live'" class="tool-card__badge" :class="`tool-card__badge--${tool.status}`">
            {{ statusLabel }}
        </div>
        <div v-if="tool.status === 'beta'" class="tool-card__badge tool-card__badge--beta">
            Beta
        </div>

        <!-- Icon -->
        <div class="tool-card__icon">{{ tool.emoji }}</div>

        <!-- Text -->
        <div class="tool-card__body">
            <h3 class="tool-card__name neon-heading">{{ tool.name }}</h3>
            <p class="tool-card__tagline">{{ tool.tagline }}</p>
            <p class="tool-card__desc">{{ tool.description }}</p>
        </div>

        <!-- Arrow (only for live/beta) -->
        <div v-if="isClickable" class="tool-card__arrow">→</div>
    </component>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
    tool: {
        type: Object,
        required: true,
    },
})

const isClickable = computed(() =>
    props.tool.status !== 'coming-soon' &&
    (props.tool.route || props.tool.externalUrl)
)

const statusLabel = computed(() => {
    if (props.tool.status === 'coming-soon') return '即將推出'
    if (props.tool.status === 'beta') return 'Beta'
    return ''
})

const linkProps = computed(() => {
    if (!isClickable.value) return {}
    if (props.tool.externalUrl) {
        return { href: props.tool.externalUrl, target: '_blank', rel: 'noopener noreferrer' }
    }
    return { to: props.tool.route }
})
</script>

<style scoped>
.tool-card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 28px 24px 24px;
    border-radius: 16px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    cursor: pointer;
    text-decoration: none;
    color: inherit;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    overflow: hidden;
}

.tool-card:not(.tool-card--disabled):hover {
    transform: translateY(-4px);
}

.tool-card--disabled {
    cursor: default;
    opacity: 0.65;
}

/* ── Colour variants ── */
.tool-card--purple {
    border-color: rgba(139, 92, 246, 0.2);
}

.tool-card--purple:hover {
    border-color: rgba(139, 92, 246, 0.5);
    box-shadow: 0 8px 32px rgba(139, 92, 246, 0.2);
}

.tool-card--purple .tool-card__icon {
    background: rgba(139, 92, 246, 0.12);
    border-color: rgba(139, 92, 246, 0.25);
}

.tool-card--rose {
    border-color: rgba(225, 29, 72, 0.2);
}

.tool-card--rose:hover {
    border-color: rgba(225, 29, 72, 0.5);
    box-shadow: 0 8px 32px rgba(225, 29, 72, 0.2);
}

.tool-card--rose .tool-card__icon {
    background: rgba(225, 29, 72, 0.12);
    border-color: rgba(225, 29, 72, 0.25);
}

.tool-card--blue {
    border-color: rgba(59, 130, 246, 0.2);
}

.tool-card--blue:hover {
    border-color: rgba(59, 130, 246, 0.5);
    box-shadow: 0 8px 32px rgba(59, 130, 246, 0.2);
}

.tool-card--blue .tool-card__icon {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.25);
}

.tool-card--cyan {
    border-color: rgba(6, 182, 212, 0.2);
}

.tool-card--cyan:hover {
    border-color: rgba(6, 182, 212, 0.5);
    box-shadow: 0 8px 32px rgba(6, 182, 212, 0.2);
}

.tool-card--cyan .tool-card__icon {
    background: rgba(6, 182, 212, 0.12);
    border-color: rgba(6, 182, 212, 0.25);
}

.tool-card--orange {
    border-color: rgba(251, 191, 36, 0.2);
}

.tool-card--orange:hover {
    border-color: rgba(251, 191, 36, 0.5);
    box-shadow: 0 8px 32px rgba(251, 191, 36, 0.2);
}

.tool-card--orange .tool-card__icon {
    background: rgba(251, 191, 36, 0.12);
    border-color: rgba(251, 191, 36, 0.25);
}

/* ── Badge ── */
.tool-card__badge {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    padding: 3px 10px;
    border-radius: 20px;
}

.tool-card__badge--coming-soon {
    background: rgba(100, 116, 139, 0.18);
    color: var(--body);
    border: 1px solid rgba(100, 116, 139, 0.2);
}

.tool-card__badge--beta {
    background: rgba(251, 191, 36, 0.15);
    color: var(--lemon);
    border: 1px solid rgba(251, 191, 36, 0.25);
}

/* ── Icon ── */
.tool-card__icon {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    border: 1px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    flex-shrink: 0;
}

/* ── Body ── */
.tool-card__name {
    font-size: 20px;
    color: var(--heading);
    margin: 0 0 4px;
    line-height: 1.2;
}

.tool-card__tagline {
    font-size: 13px;
    color: var(--neon-purple-light);
    margin: 0 0 8px;
    font-weight: 500;
    letter-spacing: 0.3px;
}

.tool-card__desc {
    font-size: 14px;
    color: var(--body);
    margin: 0;
    line-height: 1.6;
    white-space: pre-line;
}

.tool-card__body {
    flex: 1;
}

/* ── Arrow ── */
.tool-card__arrow {
    font-size: 18px;
    color: var(--label);
    align-self: flex-end;
    transition: transform 0.2s ease, color 0.2s ease;
}

.tool-card:hover .tool-card__arrow {
    transform: translateX(4px);
    color: var(--heading);
}
</style>
