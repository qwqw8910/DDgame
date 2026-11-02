<template>
    <div class="game-card !p-4 text-center">
        <template v-if="round">
            <p class="m-0 mb-2 text-xs text-label">第 {{ round.number }} 輪的詞 · 這輪要寫一個同時和它們都有關的詞</p>
            <ul class="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
                <li v-for="w in chips" :key="w.key" class="rounded-xl border border-border bg-card px-3 py-1.5">
                    <b class="text-xl text-heading">{{ w.word }}</b>
                    <span class="ml-1.5 text-xs text-label">{{ w.authors }}</span>
                </li>
            </ul>
        </template>
        <p v-else-if="seed" class="m-0 text-sm text-body">
            開局線索：<b class="text-heading">{{ seed[0] }}</b> × <b class="text-heading">{{ seed[1] }}</b>
        </p>
        <p v-else class="m-0 text-sm text-body">第一輪：想到什麼就寫什麼，下一輪起會以大家寫的詞為線索</p>
    </div>
</template>

<script setup>
import { computed } from 'vue'

// 只顯示「上一輪」揭曉的詞；更早的輪次不再顯示
const props = defineProps({
    round: { type: Object, default: null },   // { number, words }
    seed: { type: Array, default: null },
    names: { type: Object, required: true },
    myId: { type: String, default: '' },
})

const chips = computed(() => {
    const m = new Map()
    for (const [id, word] of Object.entries(props.round?.words ?? {})) {
        if (!word) continue
        const k = word.toLowerCase()
        if (!m.has(k)) m.set(k, { key: k, word, authors: [] })
        m.get(k).authors.push(id === props.myId ? '你' : (props.names[id] ?? '?'))
    }
    return [...m.values()].map(c => ({ ...c, authors: c.authors.join('、') }))
})
</script>
