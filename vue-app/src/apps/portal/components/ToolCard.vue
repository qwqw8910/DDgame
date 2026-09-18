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
