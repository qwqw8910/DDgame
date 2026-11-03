<template>
    <div class="flex flex-col gap-4">
        <!-- 🏆 冠軍 -->
        <section class="rounded-2xl border border-border-glow bg-card p-4 text-center">
            <template v-if="result.winners.length">
                <p class="m-0 text-sm text-label">🏆 默契王{{ result.winners.length > 1 ? '（並列）' : '' }}</p>
                <p class="m-0 text-3xl font-extrabold text-heading">{{ result.winners.map(id => names[id]).join('、') }}</p>
                <p class="m-0 mt-1 text-sm text-body">{{ result.scores[result.winners[0]] }} 分</p>
            </template>
            <template v-else>
                <p class="m-0 text-2xl font-extrabold text-heading">這局大家都沒想到一起</p>
                <p class="m-0 mt-1 text-sm text-body">下次換個題目，說不定就有默契了</p>
            </template>
        </section>

        <section v-if="result.mode === 'chain'" class="game-card !p-3 text-center">
            <p class="m-0 text-base font-bold text-heading">
                🔗 接龍：{{ result.allSameAt ? `第 ${result.allSameAt} 輪全員同詞通關！` : `${result.promptsDone} 輪都沒有全員同詞` }}
            </p>
        </section>

        <!-- 終局挑戰 -->
        <section v-if="result.converge" class="game-card !p-3 text-center">
            <p class="m-0 text-base font-bold text-heading">
                🎯 終局挑戰：{{ result.converge.success ? `第 ${result.converge.attempt} 次全員同詞！` : '沒有收斂成功' }}
            </p>
        </section>

        <!-- 排行 -->
        <section class="game-card !p-3">
            <h3 class="m-0 mb-2 text-base text-heading">📊 分數榜</h3>
            <ol class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="(id, i) in result.ranking" :key="id" class="flex items-center gap-2 text-sm">
                    <span class="w-6 shrink-0 text-center text-body">{{ i + 1 }}</span>
                    <span class="w-20 shrink-0 truncate text-heading">{{ names[id] }}</span>
                    <span class="h-2.5 flex-1 overflow-hidden rounded-full bg-border">
                        <span class="block h-full rounded-full bg-[#FBBF24]" :style="{ width: `${maxScore ? (result.scores[id] / maxScore) * 100 : 0}%` }"></span>
                    </span>
                    <span class="w-10 shrink-0 text-right font-bold tabular-nums text-heading">{{ result.scores[id] }}</span>
                </li>
            </ol>
        </section>

        <!-- 💘 最佳拍檔 -->
        <section v-if="result.bestPairs.length" class="game-card !p-3">
            <h3 class="m-0 mb-2 text-base text-heading">💘 最佳拍檔</h3>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="p in result.bestPairs" :key="p.a + p.b" class="flex items-center gap-3">
                    <img :src="badgeUrl(tierOf(p.tierId).badge)" alt="" class="h-12 w-12 object-contain" loading="lazy" />
                    <div>
                        <p class="m-0 font-bold text-heading">{{ names[p.a] }} × {{ names[p.b] }}</p>
                        <p class="m-0 text-sm text-body">{{ tierOf(p.tierId).title }}・{{ p.total }} 題中有 {{ p.count }} 題同詞</p>
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
                    <span class="text-xs font-normal text-label">（{{ p.count }}/{{ p.total }} 題同詞）</span>
                </li>
            </ul>
        </section>

        <!-- 其他頭銜 -->
        <section class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div v-if="result.unique" class="game-card !p-3 text-center">
                <img :src="badgeUrl('badge-unique')" alt="" class="mx-auto h-16 w-16 object-contain" loading="lazy" />
                <p class="m-0 text-xs text-label">🦄 最特別（獨一無二 {{ result.unique.count }} 次）</p>
                <p class="m-0 font-bold text-heading">{{ result.unique.playerIds.map(id => names[id]).join('、') }}</p>
            </div>
            <div v-if="result.laugh" class="game-card !p-3 text-center">
                <img :src="badgeUrl('badge-outlier')" alt="" class="mx-auto h-16 w-16 object-contain" loading="lazy" />
                <p class="m-0 text-xs text-label">🤣 離譜王（被笑 {{ result.laugh.count }} 次）</p>
                <p class="m-0 font-bold text-heading">{{ result.laugh.playerIds.map(id => names[id]).join('、') }}</p>
            </div>
        </section>

        <!-- 個人默契指數 -->
        <section class="game-card !p-3">
            <h3 class="m-0 mb-2 text-base text-heading">🤝 個人默契指數</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="id in chemistryRanking" :key="id" class="flex items-center gap-2 text-sm">
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
const maxScore = computed(() => Math.max(0, ...Object.values(props.result.scores)))
const chemistryRanking = computed(() => [...ids.value].sort((a, b) => props.result.chemistry[b] - props.result.chemistry[a]))
</script>
