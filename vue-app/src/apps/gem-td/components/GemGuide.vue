<template>
    <GameGuideModal :model-value="modelValue" title="甜點守衛戰怎麼玩" confirm-text="知道了" @update:model-value="$emit('update:modelValue', $event)">
        <img :src="guideImg" alt="甜點守衛戰玩法：每回合抽 5 個甜點、排迷宮繞路、留 1 座塔其餘變餅乾牆、打蟲賺金幣、2 個同款升 1 級；蟲子走到出口會扣血" class="block h-auto w-full rounded-xl" width="1024" height="1536" />
        <GameGuideSection v-if="catalog" title="蟲子特性">
            <ul class="gg-list">
                <li v-for="t in catalog.traits" :key="t.name"><b class="font-semibold text-heading">{{ t.name }}</b>：{{ t.desc }}。{{ t.tip }}。</li>
            </ul>
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
import GameGuideModal from '@/shared/components/GameGuideModal.vue'
import GameGuideSection from '@/shared/components/GameGuideSection.vue'
import GemIcon from './GemIcon.vue'
import guideImg from '../assets/guide.webp'
import { GEM_ORDER, ingredientLabel } from '../data/gems.js'
import { KEY_HELP } from '../composables/useGemTdKeys.js'

defineProps({
    modelValue: { type: Boolean, default: false },
    catalog: { type: Object, default: null },
    keys: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])
</script>
