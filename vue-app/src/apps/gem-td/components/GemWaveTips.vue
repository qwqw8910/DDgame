<template>
    <!-- 本波有哪些怪、各自怎麼對付：建造時的預告卡與出怪時的右欄共用同一份 -->
    <div>
        <p v-if="warning" class="gt-wave-warn m-0 mb-2" role="alert">{{ warning }}</p>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
            <li v-for="g in rows" :key="g.type" class="flex gap-2 leading-snug">
                <img :src="monsterImage(g.type)" :alt="g.name" width="32" height="32" class="mt-0.5 shrink-0 self-start object-contain" draggable="false" />
                <div class="min-w-0 flex-1">
                    <p class="m-0">
                        <b class="font-semibold text-(--gt-ink)">{{ g.name }}</b> {{ g.count }} 隻，血量 {{ g.hp }}<span v-if="g.armor">，護甲 {{ g.armor }}</span><span v-if="g.flying">，會飛</span>
                    </p>
                    <p v-if="g.leak" class="m-0 font-semibold text-(--gt-accent-ink)">漏掉會扣 {{ g.leak }} 點血</p>
                    <p v-if="g.trait" class="m-0 font-semibold" :style="{ color: g.trait.color }">{{ g.trait.name }}：{{ g.trait.desc }}</p>
                    <p class="m-0 text-(--gt-muted)">對策：{{ g.trait?.tip ?? g.tip }}</p>
                </div>
            </li>
        </ul>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { MONSTER_TIPS, canHitAir, monsterImage } from '../data/gems.js'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
})

const rows = computed(() => (props.view.nextWave?.groups ?? []).map((g) => {
    const info = props.catalog.monsters.find(m => m.id === g.type)
    return { ...g, name: info.name, flying: info.flying, tip: MONSTER_TIPS[g.type] ?? '', trait: g.trait ? props.catalog.traits[g.trait] : null }
}))

// 本波有飛行怪，但場上的塔全都打不到空中：事先提醒，還來得及補
const warning = computed(() => {
    const towers = props.view.me?.towers ?? []
    if (!rows.value.some(g => g.flying) || !towers.length) return ''
    return towers.some(t => canHitAir(t.kind, props.catalog)) ? '' : '本波有飛行怪，但你的塔都打不到空中！'
})
</script>

<style scoped>
.gt-wave-warn {
    padding: 6px 10px; border: 1px solid var(--gt-accent); border-radius: 10px;
    background: var(--gt-accent-soft); color: var(--gt-accent-ink); font-weight: 700;
}
</style>
