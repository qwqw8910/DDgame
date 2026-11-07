<template>
    <!-- 固定結構：圖示＋名稱 → 分隔線 → 一行說明 → 小標籤。所有卡片同一套樣式，不用顏色區分 -->
    <component :is="tag" v-bind="linkProps"
        class="group flex h-full flex-col rounded-tile bg-raised p-5 text-inherit no-underline shadow-(--shadow-tile) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        :class="isClickable
            ? 'cursor-pointer transition-[translate,box-shadow] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-(--shadow-tile-hover) active:translate-y-0 active:duration-75 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
            : 'opacity-60'"
        :aria-disabled="isClickable ? undefined : 'true'">
        <div class="flex items-center gap-3.5">
            <span aria-hidden="true" class="grid size-11 shrink-0 place-items-center rounded-inset bg-fill p-2.5 text-ink">
                <ToolIcon :id="tool.id" />
            </span>
            <h3 class="m-0 min-w-0 flex-1 font-display text-xl leading-snug font-normal text-ink">{{ tool.name }}</h3>
            <svg v-if="isClickable" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
                class="size-5 shrink-0 text-ink-faint transition-[translate,color] duration-200 ease-soft group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transition-none">
                <path d="m8 5 5 5-5 5" />
            </svg>
        </div>

        <hr class="my-4 h-px border-0 bg-hairline" />

        <p class="m-0 text-base leading-relaxed text-ink-muted">{{ tool.tagline }}</p>

        <div class="mt-auto flex items-start gap-3 pt-4">
            <ul class="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-1.5 p-0" aria-label="標籤">
                <li v-for="t in tool.tags" :key="t"
                    class="rounded-full bg-fill px-2.5 py-0.5 text-base leading-snug text-ink-faint">{{ t }}</li>
            </ul>
            <!-- 狀態標籤：外框樣式，與分類標籤（填色）區分 -->
            <span v-if="statusLabel"
                class="shrink-0 rounded-full px-2.5 py-0.5 text-base leading-snug text-ink-muted shadow-[inset_0_0_0_1px_var(--color-hairline)]">{{ statusLabel }}</span>
        </div>
    </component>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import ToolIcon from './ToolIcon.vue'

const props = defineProps({
    tool: { type: Object, required: true },
})

const isClickable = computed(() =>
    props.tool.status !== 'coming-soon' &&
    !!(props.tool.route || props.tool.externalUrl)
)

const tag = computed(() => {
    if (!isClickable.value) return 'div'
    return props.tool.externalUrl ? 'a' : RouterLink
})

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
