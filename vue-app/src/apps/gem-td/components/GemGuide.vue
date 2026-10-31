<template>
    <GameGuideModal :model-value="modelValue" title="甜點守衛戰怎麼玩" confirm-text="知道了" @update:model-value="$emit('update:modelValue', $event)">
        <GameGuideSection title="一回合的流程">
            <ol class="gg-list">
                <li>每回合拿到 5 個隨機甜點，全部放到桌布上。</li>
                <li>放下的甜點都是障礙物，用它們把蟲子的路線繞長，但不能封死。</li>
                <li>從 5 個裡留下 1 個當塔，其餘 4 個變成餅乾牆。</li>
                <li>全隊按下準備後，每張地圖同時出現一樣的蟲子。金幣各賺各的：自己消滅的蟲子加上過關獎勵。</li>
            </ol>
        </GameGuideSection>
        <GameGuideSection title="合成">
            <ul class="gg-list">
                <li>本回合有 2 個同種同級：留下的那個升 1 級；4 個升 2 級。</li>
                <li>材料湊齊時可合成特殊塔。材料可以是本回合的甜點，也可以是場上自己保留的塔。</li>
                <li>遊戲中按右上角 📖 打開合成表，可以拖到不擋視線的地方，同級合成與三階特殊塔都查得到，缺少的材料會標出來。</li>
            </ul>
        </GameGuideSection>
        <GameGuideSection title="多人">
            <ul class="gg-list">
                <li>每個人有自己的地圖，點地圖上方的名字可以切換去看別人的，看別人時不能操作。</li>
                <li>共用血量：全隊血量是人數 × 100，任何人漏掉蟲子都扣同一條血，歸零全隊輸。</li>
                <li>獨立血量：各扣各的，血量歸零的人出局並可以繼續觀看；剩最後一人獲勝，打完全部波次就比剩餘血量。</li>
            </ul>
        </GameGuideSection>
        <GameGuideSection title="蟲子">
            <ul class="gg-list">
                <li>地面蟲依序踩過 1～5 號路徑點才到出口，會繞過所有障礙物。把路徑點圍進迷宮裡，蟲子就得反覆進出同一區，後面的波次沒有迷宮很難撐住。</li>
                <li>胡蜂從入口直線飛向出口，無視迷宮。方糖打不到胡蜂，葡萄棒棒糖只打胡蜂。</li>
                <li>蟲子走到出口會扣血，每種蟲扣的量不同。</li>
                <li>第 6 波起主力蟲會帶特性，並混入護衛。右側的波次預告會寫出對策，地圖上帶虛線光圈的就是特性蟲。</li>
            </ul>
        </GameGuideSection>
        <GameGuideSection v-if="catalog" title="蟲子特性">
            <ul class="gg-list">
                <li v-for="t in catalog.traits" :key="t.name"><b class="font-semibold text-heading">{{ t.name }}</b>：{{ t.desc }}。{{ t.tip }}。</li>
            </ul>
        </GameGuideSection>
        <GameGuideSection title="金幣">
            <ul class="gg-list">
                <li>品質讓之後抽到更高等的甜點，研究則立刻強化所有塔，金幣不夠兩邊都買，要自己取捨。</li>
                <li>過關時會依存款發利息，留著不花也有收益。拆餅乾牆要付費，放之前先想好。</li>
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
        <GameGuideSection title="手機操作">
            <p class="m-0">點一下格子預覽，同一格再點一下才放下。雙指縮放，放大後可拖曳地圖。</p>
        </GameGuideSection>
    </GameGuideModal>
</template>

<script setup>
import GameGuideModal from '@/shared/components/GameGuideModal.vue'
import GameGuideSection from '@/shared/components/GameGuideSection.vue'
import GemIcon from './GemIcon.vue'
import { GEM_ORDER, ingredientLabel } from '../data/gems.js'

defineProps({
    modelValue: { type: Boolean, default: false },
    catalog: { type: Object, default: null },
})
defineEmits(['update:modelValue'])
</script>
