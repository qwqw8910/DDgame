<template>
    <div class="flex flex-col gap-4">
        <!-- 🦄 與眾不同 -->
        <section v-if="result.unique" class="rounded-2xl border border-border-glow bg-card p-4 text-center">
            <img :src="badgeUrl('badge-unique')" alt="" class="mx-auto h-32 w-32 object-contain" />
            <p class="m-0 text-sm text-label">🦄 與眾不同</p>
            <p class="m-0 text-3xl font-extrabold text-heading">{{ names[result.unique] }}</p>
            <p class="m-0 mt-1 text-sm text-body">全場只有 TA 始終沒和任何人想到一起</p>
        </section>

        <!-- 💘 最佳拍檔 -->
        <section v-if="result.bestPairs.length" class="game-card !p-3">
            <h3 class="m-0 mb-2 text-base text-heading">💘 最佳拍檔</h3>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="p in result.bestPairs" :key="p.a + p.b" class="flex items-center gap-3">
                    <img :src="badgeUrl(tierOf(p.tierId).badge)" alt="" class="h-12 w-12 object-contain" loading="lazy" />
                    <div>
                        <p class="m-0 font-bold text-heading">{{ names[p.a] }} × {{ names[p.b] }}</p>
                        <p class="m-0 text-sm text-body">{{ tierOf(p.tierId).title }} {{ p.value }}%・第 {{ p.firstMatch }} 輪</p>
                    </div>
                </li>
            </ul>
        </section>

        <!-- 💔 頭號死對頭 -->
        <section v-if="result.worstPairs.length" class="game-card !p-3">
            <h3 class="m-0 mb-2 text-base text-heading">💔 頭號死對頭</h3>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
                <li v-for="(p, i) in result.worstPairs" :key="p.a + p.b" class="text-heading"
                    :class="i === 0 ? 'text-xl font-extrabold' : 'text-base'">
                    {{ names[p.a] }} × {{ names[p.b] }}
                    <span v-if="p.votes" class="text-xs font-normal text-label">（互投離譜 {{ p.votes }} 票）</span>
                </li>
            </ul>
        </section>

        <!-- 其他頭銜 -->
        <section class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div v-if="result.loners.length" class="game-card !p-3 text-center">
                <img :src="badgeUrl('badge-loner')" alt="" class="mx-auto h-16 w-16 object-contain" loading="lazy" />
                <p class="m-0 text-xs text-label">🐺 孤狼</p>
                <p class="m-0 font-bold text-heading">{{ result.loners.map(id => names[id]).join('、') }}</p>
            </div>
            <div v-if="result.magnet.length" class="game-card !p-3 text-center">
                <img :src="badgeUrl('badge-magnet')" alt="" class="mx-auto h-16 w-16 object-contain" loading="lazy" />
                <p class="m-0 text-xs text-label">🧲 磁鐵</p>
                <p class="m-0 font-bold text-heading">{{ result.magnet.map(id => names[id]).join('、') }}</p>
            </div>
            <div v-if="result.outlier.length" class="game-card !p-3 text-center">
                <img :src="badgeUrl('badge-outlier')" alt="" class="mx-auto h-16 w-16 object-contain" loading="lazy" />
                <p class="m-0 text-xs text-label">🛸 離譜王</p>
                <p class="m-0 font-bold text-heading">{{ result.outlier.map(id => names[id]).join('、') }}</p>
            </div>
        </section>

        <!-- 📊 個人默契指數 -->
        <section class="game-card !p-3">
            <h3 class="m-0 mb-2 text-base text-heading">📊 個人默契指數</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="id in ranking" :key="id" class="flex items-center gap-2 text-sm">
                    <span class="w-20 shrink-0 truncate text-body">{{ names[id] }}</span>
                    <span class="h-2.5 flex-1 overflow-hidden rounded-full bg-border">
                        <span class="block h-full rounded-full bg-[#FB7185]" :style="{ width: `${result.chemistry[id]}%` }"></span>
                    </span>
                    <span class="w-10 shrink-0 text-right tabular-nums text-heading">{{ result.chemistry[id] }}%</span>
                </li>
            </ul>
        </section>

        <!-- N×N 熱力圖 -->
        <details class="game-card !p-3">
            <summary class="cursor-pointer text-base text-heading">兩兩默契熱力圖</summary>
            <div class="mt-2"><SwPairMatrix :matrix="result.matrix" :ids="ids" :names="names" /></div>
        </details>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { badgeUrl, tierOf } from '../data/constants.js'
import SwPairMatrix from './SwPairMatrix.vue'

const props = defineProps({
    result: { type: Object, required: true },
    names: { type: Object, required: true },
})

// 已離場者不進榜
const ids = computed(() => Object.keys(props.result.chemistry))
const ranking = computed(() => [...ids.value].sort((a, b) => props.result.chemistry[b] - props.result.chemistry[a]))
</script>
