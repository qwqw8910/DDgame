<template>
    <!-- 鍋爐室：與 LodgeSeat 同規格的格子；結算後依序放入被送進來的角色牌 -->
    <div class="@container relative block h-full w-full min-h-0 min-w-0 overflow-hidden rounded-xl border border-neon-rose/50 bg-card-solid"
        :aria-label="`${BOILER.name}${cards.length ? '，' + cards.length + ' 張牌' : '，空'}`">
        <img :src="BOILER.img" alt="" draggable="false" loading="lazy" class="absolute inset-0 h-full w-full object-cover" />
        <div class="absolute inset-0 [background:linear-gradient(to_top,rgba(0,0,0,0.85)_0%,rgba(80,0,20,0.35)_60%,rgba(80,0,20,0.2)_100%)]" aria-hidden="true"></div>

        <div class="absolute inset-x-1 top-[5%] flex h-[62%] items-start justify-center gap-1">
            <template v-if="cards.length">
                <LodgeCard v-for="(c, i) in cards" :key="i" :card="c" revealed compact fluid />
            </template>
            <LodgeCard v-else compact fluid empty class="opacity-30" />
        </div>

        <div class="absolute inset-x-0 bottom-0 flex flex-col items-center px-1 pb-1">
            <span class="max-w-full truncate font-bold text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] text-[clamp(11px,4.2cqw,17px)]">{{ BOILER.name }}</span>
            <span v-if="empty" class="hidden text-white/80 text-[clamp(9px,3.2cqw,12px)] @[100px]:inline">沒有人被送進來</span>
        </div>
    </div>
</template>

<script setup>
import LodgeCard from './LodgeCard.vue'
import { BOILER } from '../data/constants.js'

defineProps({
    cards: { type: Array, default: () => [] },   // 已揭曉的角色牌
    empty: { type: Boolean, default: false },    // 已結算但沒有人被送進來
})
</script>
