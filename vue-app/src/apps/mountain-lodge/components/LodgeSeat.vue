<template>
    <!-- 一個地點：玩家頭像附著在地點上（投票對象是地點，不是玩家） -->
    <component
        :is="selectable ? 'button' : 'div'"
        :type="selectable ? 'button' : undefined"
        :class="[
            'relative w-full rounded-xl border p-1.5 sm:p-3 flex flex-col items-center gap-1 sm:gap-1.5 text-center transition-all duration-150',
            selected ? 'border-neon-purple bg-accent-tint [box-shadow:0_0_0_2px_var(--color-neon-purple)]' : 'border-border bg-subtle',
            isActor ? '[box-shadow:0_0_0_2px_var(--color-lemon)] border-lemon' : '',
            selectable ? 'cursor-pointer hover:border-neon-purple hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-neon-purple' : '',
            boiler ? 'border-neon-rose bg-[rgba(225,29,72,0.12)]' : '',
        ]"
        :aria-pressed="selectable ? selected : undefined"
        :aria-label="ariaLabel"
        @click="selectable && $emit('select')">
        <div class="relative w-full aspect-[2/1] rounded-lg overflow-hidden bg-card-solid">
            <img v-if="location.img" :src="location.img" alt="" draggable="false" loading="lazy"
                class="absolute inset-0 w-full h-full object-cover" />
            <span v-else class="absolute inset-0 flex items-center justify-center text-3xl" aria-hidden="true">{{ location.emoji }}</span>
        </div>
        <span class="font-bold text-heading text-sm sm:text-base">{{ location.name }}</span>

        <!-- 牌（蓋著 / 揭曉 / 空位） -->
        <LodgeCard v-if="revealedCard" :card="revealedCard" revealed compact />
        <LodgeCard v-else-if="hasCard" compact />
        <LodgeCard v-else compact empty class="opacity-30" />

        <!-- 玩家 -->
        <div v-if="player" class="flex items-center gap-1.5 text-sm text-label max-w-full">
            <span :class="['inline-block w-2 h-2 rounded-full shrink-0', online ? 'bg-success' : 'bg-ruby']" aria-hidden="true"></span>
            <span class="truncate">{{ player.nickname }}</span>
            <span v-if="isMe" class="badge badge-me">我</span>
        </div>

        <!-- 狀態徽章 -->
        <span v-if="isActor" class="text-xs font-semibold text-lemon">操作中…</span>
        <span v-else-if="voted" class="text-xs font-semibold text-success-text">已投票 ✓</span>
        <span v-if="voteCount !== null" class="text-sm font-bold text-heading">{{ voteCount }} 票</span>
        <span v-if="boiler" class="absolute -top-2 -right-2 text-xl" title="被送進鍋爐室" aria-hidden="true">🔥</span>
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
