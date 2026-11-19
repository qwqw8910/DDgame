<template>
    <section class="gt-dex" aria-label="蟲蟲圖鑑">
        <h3 class="gt-heading">怪物</h3>
        <ul class="m-0 mb-3 flex list-none flex-col gap-1.5 p-0">
            <li v-for="m in monsters" :key="m.id" class="gt-row flex-col !items-stretch !gap-1" :class="{ 'gt-row--on': m.next }">
                <div class="flex items-center gap-2">
                    <img :src="monsterImage(m.id)" :alt="m.name" width="36" height="36" class="shrink-0 object-contain" draggable="false" />
                    <b class="min-w-0 flex-1 truncate font-semibold text-(--gt-ink)">{{ m.name }}</b>
                    <span v-if="m.next" class="gt-need gt-need--placing">下一波</span>
                    <span v-if="m.flying" class="gt-need">會飛</span>
                    <span v-if="m.boss" class="gt-need">首領</span>
                </div>
                <p class="m-0 flex flex-wrap gap-x-3 tabular-nums text-(--gt-text)">
                    <span>血量 ×{{ m.hp }}</span>
                    <span>速度 {{ speedWord(m.speed) }}</span>
                    <span>護甲 {{ m.armor }}</span>
                    <span v-if="m.leak">漏掉扣 {{ m.leak }} 血</span>
                    <span v-else>漏掉不扣血</span>
                </p>
                <p class="m-0 leading-snug text-(--gt-muted)">{{ m.tip }}</p>
            </li>
        </ul>

        <h3 class="gt-heading">怪物特性</h3>
        <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
            <li v-for="t in traits" :key="t.id" class="gt-row flex-col !items-stretch !gap-0.5">
                <b class="font-semibold" :style="{ color: t.color }">{{ t.name }}</b>
                <p class="m-0">{{ t.desc }}</p>
                <p class="m-0 text-(--gt-muted)">對策：{{ t.tip }}</p>
            </li>
        </ul>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import { MONSTER_TIPS, monsterImage } from '../data/gems.js'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
})

const speedWord = s => `${s < 3 ? '慢' : s < 4 ? '普通' : '快'}（${s}）`

const nextTypes = computed(() => new Set((props.view.nextWave?.groups ?? []).map(g => g.type)))

const monsters = computed(() => props.catalog.monsters.map(m => ({ ...m, tip: MONSTER_TIPS[m.id] ?? '', next: nextTypes.value.has(m.id) })))
const traits = computed(() => props.catalog.traitIds.map(id => ({ id, ...props.catalog.traits[id] })))
</script>
