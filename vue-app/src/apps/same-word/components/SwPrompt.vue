<template>
    <div class="game-card !p-4 text-center">
        <!-- 題目輪 -->
        <template v-if="kind === 'prompt'">
            <p class="m-0 mb-1 text-xs text-label">{{ chainStart ? `🔗 接龍 第 ${promptIndex} / ${promptTotal} 輪 · 起始題目，下一輪起沒有題目` : `第 ${promptIndex} / ${promptTotal} 題` }} · 寫下第一個想到的詞，越多人跟你一樣越高分</p>
            <p class="m-0 text-2xl font-extrabold text-heading sm:text-3xl">{{ prompt }}</p>
        </template>
        <!-- 接龍：第 2 輪起沒有題目，看上一輪的詞寫一個新詞 -->
        <template v-else-if="kind === 'chain'">
            <p class="m-0 mb-1 text-xs text-label">🔗 接龍 第 {{ promptIndex }} / {{ promptTotal }} 輪 · 寫一個和這些詞都有關的新詞，越多人一樣越高分</p>
            <p class="m-0 mb-3 text-sm text-body">前面出現過的詞不能再寫；全員同詞就提早通關</p>
            <ul class="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
                <li v-for="w in chips" :key="w.key" class="rounded-xl border border-border bg-card px-3 py-1.5">
                    <b class="text-xl text-heading">{{ w.word }}</b>
                    <span class="ml-1.5 text-xs text-label">{{ w.authors }}</span>
                </li>
            </ul>
            <p v-if="usedWords.length" class="m-0 mt-3 text-xs text-label">
                已用過：<span v-for="w in usedWords" :key="w" class="mx-1 inline-block text-body">{{ w }}</span>
            </p>
        </template>
        <!-- 終局：看上一輪的詞往中間靠攏 -->
        <template v-else>
            <p class="m-0 mb-1 text-xs text-label">🎯 終局挑戰 第 {{ attempt }} / {{ convergeMax }} 次 · 全員合作，一起寫出同一個詞</p>
            <p class="m-0 mb-3 text-sm text-body">看看大家上一輪寫了什麼，往中間靠攏。第 {{ attempt }} 次成功全場 +{{ points }} 分，失敗不扣分</p>
            <ul class="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
                <li v-for="w in chips" :key="w.key" class="rounded-xl border border-border bg-card px-3 py-1.5">
                    <b class="text-xl text-heading">{{ w.word }}</b>
                    <span class="ml-1.5 text-xs text-label">{{ w.authors }}</span>
                </li>
            </ul>
        </template>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { CONVERGE_MAX } from '../data/constants.js'

const props = defineProps({
    kind: { type: String, required: true },          // 'prompt' | 'converge'
    prompt: { type: String, default: null },
    promptIndex: { type: Number, default: 0 },
    promptTotal: { type: Number, default: 0 },
    attempt: { type: Number, default: 0 },
    chainStart: { type: Boolean, default: false },   // 接龍模式的第 1 輪
    usedWords: { type: Array, default: () => [] },   // 接龍：前面出現過的詞
    prevWords: { type: Object, default: () => ({}) }, // 上一輪揭曉的 { playerId: word }
    names: { type: Object, required: true },
    myId: { type: String, default: '' },
})

const convergeMax = CONVERGE_MAX
const points = computed(() => [6, 4, 2][props.attempt - 1] ?? 0)

const chips = computed(() => {
    const m = new Map()
    for (const [id, word] of Object.entries(props.prevWords)) {
        if (!word) continue
        const k = word.toLowerCase()
        if (!m.has(k)) m.set(k, { key: k, word, authors: [] })
        m.get(k).authors.push(id === props.myId ? '你' : (props.names[id] ?? '?'))
    }
    return [...m.values()].map(c => ({ ...c, authors: c.authors.join('、') }))
})
</script>
