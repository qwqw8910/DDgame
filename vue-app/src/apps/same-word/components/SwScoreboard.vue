<template>
    <ol class="m-0 flex list-none flex-wrap justify-center gap-1.5 p-0" aria-label="目前分數">
        <li v-for="(id, i) in sorted" :key="id"
            class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
            :class="id === myId ? 'border-border-glow bg-card text-heading' : 'border-border text-body'">
            <span v-if="i === 0 && scores[id] > 0">👑</span>
            <span class="max-w-20 truncate">{{ names[id] ?? '?' }}</span>
            <b class="tabular-nums text-heading">{{ scores[id] ?? 0 }}</b>
            <b v-if="deltas?.[id] > 0" class="tabular-nums text-[#34D399]">+{{ deltas[id] }}</b>
        </li>
    </ol>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    ids: { type: Array, required: true },
    scores: { type: Object, required: true },
    names: { type: Object, required: true },
    deltas: { type: Object, default: null },   // 本輪加分
    myId: { type: String, default: '' },
})

const sorted = computed(() => [...props.ids].sort((a, b) => (props.scores[b] ?? 0) - (props.scores[a] ?? 0)))
</script>
