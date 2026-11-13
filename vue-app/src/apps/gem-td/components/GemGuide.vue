<template>
    <GameGuideModal :model-value="modelValue" title="甜點守衛戰怎麼玩" confirm-text="知道了" @update:model-value="$emit('update:modelValue', $event)">
        <img :src="guideImg" alt="甜點守衛戰玩法：每回合抽 5 個甜點、排迷宮繞路、留 1 座塔其餘變餅乾牆、打蟲賺金幣、2 個同款升 1 級；蟲子走到出口會扣血" class="block h-auto w-full rounded-xl" width="1024" height="1536" />
        <GameGuideSection v-if="catalog" title="蟲子特性">
            <ul class="gg-list">
                <li v-for="t in catalog.traits" :key="t.name"><b class="font-semibold text-heading">{{ t.name }}</b>：{{ t.desc }}。{{ t.tip }}。</li>
            </ul>
        </GameGuideSection>
        <GameGuideSection title="重骰">
            <ul class="gg-list">
                <li>這回合的 5 個甜點<b class="font-semibold text-heading">一個都還沒放</b>時，可以花金幣把整手換新；放下第一個之後就不能再骰。</li>
                <li>品質越高，重骰底價越貴；同一回合每多骰一次，再加價一次。</li>
                <li>下一回合重新計算，回到這個品質的底價。</li>
                <li>重骰會用目前的品質抽，先升品質再骰，抽到高等甜點的機會比較大。</li>
            </ul>
            <table v-if="catalog?.rerollBase != null" class="mt-2 w-full border-collapse text-center tabular-nums">
                <caption class="mb-1 text-left text-(--gt-muted)">重骰費用（金）</caption>
                <thead>
                    <tr class="text-(--gt-muted)">
                        <th scope="col" class="py-1 text-left font-normal">品質</th>
                        <th v-for="n in 3" :key="n" scope="col" class="py-1 font-normal">第 {{ n }} 骰</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="q in rerollQualities" :key="q" class="border-t border-(--gt-line-soft)">
                        <th scope="row" class="py-1 text-left font-semibold text-heading">{{ q }}</th>
                        <td v-for="n in 3" :key="n" class="py-1">{{ rerollCost(q, n - 1) }}</td>
                    </tr>
                </tbody>
            </table>
        </GameGuideSection>
        <GameGuideSection v-if="catalog" title="甜點">
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="k in GEM_ORDER" :key="k" class="flex items-center gap-2">
                    <GemIcon :kind="k" :size="26" />
                    <span><b class="font-semibold text-heading">{{ catalog.gems[k].name }}</b>：{{ catalog.gems[k].trait }}</span>
                </li>
            </ul>
        </GameGuideSection>
        <GameGuideSection v-if="catalog" title="特殊塔配方">
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="r in catalog.recipes" :key="r.id" class="flex items-start gap-2">
                    <GemIcon :kind="r.result" :size="26" />
                    <span>
                        <b class="font-semibold text-heading">{{ catalog.specials[r.result].name }}</b>
                        ＝ {{ r.ingredients.map(i => ingredientLabel(i, catalog)).join(' ＋ ') }}<br />
                        {{ catalog.specials[r.result].trait }}
                    </span>
                </li>
            </ul>
        </GameGuideSection>
        <GameGuideSection v-if="keys" title="鍵盤快捷鍵">
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="k in KEY_HELP" :key="k.text" class="flex items-baseline gap-2">
                    <span class="flex w-16 shrink-0 items-center gap-0.5">
                        <template v-for="key in k.keys" :key="key">
                            <kbd v-if="key !== '～'" class="gt-kbd">{{ key }}</kbd><span v-else>～</span>
                        </template>
                    </span>
                    <span>{{ k.text }}</span>
                </li>
            </ul>
        </GameGuideSection>
    </GameGuideModal>
</template>

<script setup>
import { computed } from 'vue'
import GameGuideModal from '@/shared/components/GameGuideModal.vue'
import GameGuideSection from '@/shared/components/GameGuideSection.vue'
import GemIcon from './GemIcon.vue'
import guideImg from '../assets/guide.webp'
import { GEM_ORDER, ingredientLabel } from '../data/gems.js'
import { KEY_HELP } from '../composables/useGemTdKeys.js'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    catalog: { type: Object, default: null },
    keys: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])

// 跟伺服器 config.rerollCost 同一條公式，數字由型錄帶來
const rerollCost = (quality, rerolls) => {
    const c = props.catalog
    return c.rerollBase + (quality - 1) * c.rerollPerQuality + rerolls * c.rerollStep
}
// 表格挑幾個代表品質，不把 8 列全列出來
const rerollQualities = computed(() => {
    const max = props.catalog?.qualityRates.length ?? 0
    return [...new Set([1, 2, 4, 6, max])].filter(q => q >= 1 && q <= max)
})
</script>
