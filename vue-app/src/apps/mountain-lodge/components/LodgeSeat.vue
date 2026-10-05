<template>
    <!-- 一個地點：玩家頭像附著在地點上（投票對象是地點，不是玩家）。填滿父層格子，內容隨格寬縮放 -->
    <component
        :is="selectable ? 'button' : 'div'"
        :type="selectable ? 'button' : undefined"
        :class="[
            '@container relative block h-full w-full min-h-0 min-w-0 overflow-hidden rounded-xl border p-0 text-center transition-all duration-150 bg-card-solid',
            selected ? 'z-10 scale-[1.03] border-neon-purple [box-shadow:0_0_0_2px_var(--color-neon-purple)]' : 'border-border',
            isMe && !selected ? 'border-neon-cyan/70' : '',
            isActor ? '[box-shadow:0_0_0_2px_var(--color-lemon)] border-lemon' : '',
            selectable ? 'cursor-pointer hover:border-neon-purple focus-visible:outline-2 focus-visible:outline-neon-purple' : '',
            boiler ? 'animate-boiler-glow border-neon-rose' : '',
        ]"
        :aria-pressed="selectable ? selected : undefined"
        :aria-label="ariaLabel"
        @click="selectable && $emit('select')">
        <img v-if="location.img" :src="location.img" alt="" draggable="false" loading="lazy"
            class="absolute inset-0 h-full w-full object-cover" />
        <span v-else class="absolute inset-0 flex items-center justify-center text-3xl" aria-hidden="true">{{ location.emoji }}</span>
        <div class="absolute inset-0 [background:linear-gradient(to_top,rgba(0,0,0,0.85)_0%,rgba(0,0,0,0.25)_55%,transparent_100%)]" aria-hidden="true"></div>

        <!-- 牌（蓋著 / 揭曉 / 空位）：高度為格高的一部分，隨格子縮放 -->
        <div :class="['absolute right-[4%] top-[5%] flex justify-end', revealedCard ? 'h-[62%]' : 'h-[42%]']">
            <LodgeCard v-if="revealedCard" :card="revealedCard" revealed compact fluid />
            <LodgeCard v-else-if="hasCard" compact fluid class="animate-card-deal" />
            <LodgeCard v-else compact fluid empty class="opacity-30" />
        </div>

        <!-- 狀態徽章 -->
        <div class="absolute left-1 top-1 flex flex-col items-start gap-0.5 text-[clamp(9px,3cqw,12px)] font-semibold leading-none">
            <span v-if="isActor" class="rounded bg-black/60 px-1 py-0.5 text-lemon">⏳<span class="hidden @[100px]:inline"> 操作中</span></span>
            <span v-else-if="voted" class="rounded bg-black/60 px-1 py-0.5 text-success-text">✓<span class="hidden @[100px]:inline"> 已投</span></span>
            <span v-if="voteCount !== null" :key="voteCount" class="animate-pop-in rounded bg-black/60 px-1 py-0.5 text-white">{{ voteCount }}<span class="hidden @[100px]:inline"> 票</span></span>
        </div>
        <span v-if="boiler" class="absolute right-1 bottom-1 text-lg" title="被送進鍋爐室" aria-hidden="true">🔥</span>

        <!-- 地點名 + 玩家 -->
        <div class="absolute inset-x-0 bottom-0 flex flex-col items-center gap-px px-1 pb-1">
            <span class="max-w-full truncate font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] text-[clamp(11px,4.2cqw,17px)]">{{ location.name }}</span>
            <div v-if="player" class="flex max-w-full items-center gap-1 text-white/90 text-[clamp(9px,3.4cqw,13px)]">
                <span :class="['inline-block h-1.5 w-1.5 shrink-0 rounded-full', online ? 'bg-success' : 'bg-ruby']" aria-hidden="true"></span>
                <span class="truncate">{{ player.nickname }}</span>
                <span v-if="isMe" class="badge badge-me !px-1 !py-0 !text-[10px]">我</span>
            </div>
        </div>
    </component>
</template>

<script setup>
import { computed } from 'vue'
import LodgeCard from './LodgeCard.vue'

const props = defineProps({
    location:     { type: Object, required: true },        // { name, emoji }
    player:       { type: Object, default: null },         // { id, nickname, is_online }
    hasCard:      { type: Boolean, default: false },
    revealedCard: { type: Object, default: null },
    isMe:         { type: Boolean, default: false },
    isActor:      { type: Boolean, default: false },
    selectable:   { type: Boolean, default: false },
    selected:     { type: Boolean, default: false },
    voted:        { type: Boolean, default: false },
    voteCount:    { type: Number, default: null },
    boiler:       { type: Boolean, default: false },
})
defineEmits(['select'])

const online = computed(() => props.player?.is_online ?? true)
const ariaLabel = computed(() =>
    `${props.location.name}${props.player ? '，' + props.player.nickname : ''}${props.selected ? '，已選取' : ''}`)
</script>
