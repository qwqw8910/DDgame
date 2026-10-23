<template>
    <component :is="isClickable ? (tool.externalUrl ? 'a' : 'RouterLink') : 'div'" v-bind="linkProps"
        class="group relative flex gap-4 text-inherit no-underline [--flavor:var(--p-grape)] border-[1.5px] border-[color-mix(in_srgb,var(--flavor)_38%,transparent)] bg-[color-mix(in_srgb,var(--flavor)_14%,var(--p-surface))] shadow-[0_3px_0_color-mix(in_srgb,var(--flavor)_55%,transparent)] animate-[pcard-in_.5s_cubic-bezier(.3,1.2,.5,1)_both] [animation-delay:calc(var(--i,0)*55ms+120ms)] focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-(--flavor) motion-reduce:animate-none motion-reduce:transition-none"
        :class="[
            flavorClass,
            wide ? 'items-center rounded-2xl px-[18px] py-3.5' : 'rounded-[22px] px-[22px] pt-[22px] pb-5',
            isClickable
                ? 'transition-[transform,box-shadow] duration-200 ease-[cubic-bezier(.3,1.4,.5,1)] hover:-translate-y-1 hover:-rotate-[.6deg] hover:shadow-[0_7px_0_color-mix(in_srgb,var(--flavor)_55%,transparent)] active:translate-y-px active:shadow-[0_1px_0_color-mix(in_srgb,var(--flavor)_55%,transparent)] motion-reduce:hover:transform-none'
                : 'opacity-60 shadow-none',
        ]">
        <div aria-hidden="true"
            class="grid shrink-0 place-items-center rounded-full leading-none border-[1.5px] border-dashed border-[color-mix(in_srgb,var(--flavor)_70%,transparent)] bg-[color-mix(in_srgb,var(--flavor)_28%,var(--p-surface))]"
            :class="wide ? 'size-[46px] text-[23px]' : 'size-[60px] text-[30px]'">
            {{ tool.emoji }}
        </div>

        <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2.5">
                <h3 class="m-0 font-serif-tc font-black leading-tight text-(--p-ink)"
                    :class="wide ? 'text-lg' : 'text-[21px]'">{{ tool.name }}</h3>
                <span v-if="statusLabel"
                    class="rounded-full px-2.5 py-px text-base font-semibold text-(--p-ink) bg-[color-mix(in_srgb,var(--p-lemon)_75%,transparent)]">{{ statusLabel }}</span>
            </div>
            <p class="m-0 text-base font-semibold text-(--p-ink) opacity-85" :class="wide ? 'mt-0.5' : 'mt-1'">
                {{ tool.tagline }}
            </p>
            <p v-if="!wide" class="mt-2.5 mb-0 whitespace-pre-line text-base leading-relaxed text-(--p-ink-soft)">
                {{ tool.description }}
            </p>
        </div>

        <span v-if="isClickable" aria-hidden="true"
            class="text-xl text-(--p-ink) transition-transform duration-200 group-hover:translate-x-1"
            :class="wide ? 'self-center' : 'self-end'">→</span>
    </component>
</template>

<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps({
    tool: { type: Object, required: true },
    // wide = 橫列精簡版（單人 / 雙人工具）
    wide: { type: Boolean, default: false },
})

// tool.color 對應一種糖果口味色（定義於 main.css 的 .portal）
const FLAVORS = {
    purple: '[--flavor:var(--p-grape)]',
    rose: '[--flavor:var(--p-berry)]',
    blue: '[--flavor:var(--p-blue)]',
    cyan: '[--flavor:var(--p-mint)]',
    orange: '[--flavor:var(--p-orange)]',
}
const flavorClass = computed(() => FLAVORS[props.tool.color] ?? FLAVORS.purple)

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
