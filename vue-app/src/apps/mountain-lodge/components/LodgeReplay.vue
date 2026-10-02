<template>
    <!-- 真相回放：每次傳牌「看到什麼、留了什麼、傳給誰」（結算後唯一全員可見所有牌的時刻） -->
    <ol class="flex flex-col gap-2.5 m-0 p-0 list-none">
        <li v-for="s in replay" :key="s.step"
            class="rounded-xl border border-border bg-subtle p-3 flex flex-col gap-1.5">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="w-6 h-6 rounded-full bg-accent-tint text-accent text-sm font-bold grid place-items-center shrink-0">{{ s.step }}</span>
                <span class="font-semibold text-heading">{{ name(s.playerId) }}</span>
                <span class="text-body text-sm">（{{ locationName(s.playerId) }}）</span>
            </div>
            <p class="m-0 text-sm text-label leading-relaxed">
                拿到
                <template v-for="(h, i) in s.hand" :key="h.id">
                    <span v-if="i" class="text-body"> 與 </span>
                    <strong :class="h.id === s.keptId ? 'text-heading' : 'text-body'">{{ label(h) }}</strong>
                    <span class="text-body text-xs">（{{ h.from === 'deck' ? '牌堆' : '被傳來' }}）</span>
                </template>
                ，留下 <strong class="text-neon-purple-light">{{ labelById(s.keptId) }}</strong>，
                <template v-if="s.passedTo === 'lodge-room'">
                    另一張 <strong class="text-heading">{{ labelById(s.passedId) }}</strong> 放進 <strong class="text-heading">客房</strong>。
                </template>
                <template v-else>
                    把 <strong class="text-heading">{{ labelById(s.passedId) }}</strong> 傳給
                    <strong class="text-heading">{{ name(s.passedTo) }}</strong>（{{ locationName(s.passedTo) }}）。
                </template>
            </p>
        </li>
    </ol>
</template>

<script setup>
import { computed } from 'vue'
import { LOCATIONS, cardLabel } from '../data/constants.js'

const props = defineProps({
    replay:    { type: Array, required: true },
    players:   { type: Array, required: true },     // roomState.players
    locations: { type: Object, required: true },    // { [playerId]: locationId }
})

const nameMap = computed(() => Object.fromEntries(props.players.map(p => [p.id, p.nickname])))
const cards = computed(() => {
    const m = {}
    for (const s of props.replay) for (const h of s.hand) m[h.id] = h
    return m
})

const name = id => nameMap.value[id] ?? '（已離開）'
const locationName = id => LOCATIONS[props.locations[id]]?.name ?? ''
const label = card => cardLabel(card)
const labelById = id => cardLabel(cards.value[id])
</script>
