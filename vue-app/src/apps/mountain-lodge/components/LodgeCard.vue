<template>
    <!-- 角色牌：未揭曉時是牌背；自己的牌可「按住偷看、放開蓋回」（避免螢幕分享時洩漏） -->
    <div
        :class="[
            'relative select-none overflow-hidden rounded-xl border flex flex-col items-center justify-center text-center transition-transform duration-150',
            sizeClass,
            showFace ? 'border-border-glow bg-card-solid' : 'border-border-glow bg-card-solid',
            peekable ? 'cursor-pointer active:scale-95 focus-visible:outline-2 focus-visible:outline-neon-purple' : '',
        ]"
        :role="peekable ? 'button' : undefined"
        :tabindex="peekable ? 0 : undefined"
        :aria-label="ariaLabel"
        @pointerdown="peekable && (holding = true)"
        @pointerup="holding = false"
        @pointerleave="holding = false"
        @pointercancel="holding = false"
        @contextmenu.prevent
        @keydown.space.prevent="peekable && (holding = true)"
        @keydown.enter.prevent="peekable && (holding = true)"
        @keyup="holding = false"
        @blur="holding = false">
        <template v-if="showFace && card">
            <img v-if="faceImg" :src="faceImg" :alt="label" draggable="false"
                class="absolute inset-0 w-full h-full object-cover pointer-events-none" />
            <span v-else :class="compact ? 'text-2xl' : 'text-4xl'" aria-hidden="true">{{ role.emoji }}</span>
            <div :class="['absolute inset-x-0 bottom-0 flex flex-col items-center px-1 pt-5 pb-1 [background:linear-gradient(to_top,rgba(0,0,0,0.85),transparent)]', card.kind === 'guest' ? 'border-b-[5px]' : '']"
                :style="card.kind === 'guest' ? { borderBottomColor: colorHex } : undefined">
                <span :class="['font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]', compact ? 'text-xs' : 'text-lg']">{{ label }}</span>
                <span v-if="!compact" class="text-xs text-white/80 px-2 mt-0.5 leading-snug">{{ role.hint }}</span>
            </div>
        </template>
        <template v-else>
            <img v-if="!empty" :src="CARD_BACK_IMG" alt="" draggable="false"
                class="absolute inset-0 w-full h-full object-cover pointer-events-none" />
            <span v-if="peekable && !compact"
                class="relative text-xs text-white/90 mt-auto mb-2 px-2 py-0.5 rounded-full bg-black/55">按住偷看</span>
        </template>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ROLES, GUEST_COLORS, CARD_BACK_IMG, cardLabel, cardImage } from '../data/constants.js'

const props = defineProps({
    card:     { type: Object, default: null },   // 有值才有正面
    revealed: { type: Boolean, default: false }, // 結算揭曉：直接顯示正面
    peekable: { type: Boolean, default: false }, // 自己的牌：按住顯示
    compact:  { type: Boolean, default: false },
    empty:    { type: Boolean, default: false }, // 尚無牌（空位）
})

const holding = ref(false)
const showFace = computed(() => !!props.card && (props.revealed || (props.peekable && holding.value)))
const role = computed(() => ROLES[props.card?.kind] ?? ROLES.guest)
const label = computed(() => cardLabel(props.card))
const faceImg = computed(() => cardImage(props.card))
const colorHex = computed(() => GUEST_COLORS[props.card?.color]?.hex ?? 'transparent')
const sizeClass = computed(() => props.compact ? 'w-[72px] h-[96px]' : 'w-[132px] h-[176px]')
const ariaLabel = computed(() => {
    if (props.revealed && props.card) return `角色牌：${label.value}`
    return props.peekable ? '角色牌（按住偷看）' : '蓋著的角色牌'
})
</script>
