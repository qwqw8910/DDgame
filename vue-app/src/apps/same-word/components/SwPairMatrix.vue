<template>
    <div>
        <div class="overflow-x-auto">
            <table class="border-collapse text-xs">
                <thead>
                    <tr>
                        <th class="p-1"></th>
                        <th v-for="id in ids" :key="id" class="max-w-16 truncate p-1 font-medium text-body">{{ names[id] }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="a in ids" :key="a">
                        <th class="max-w-16 truncate p-1 text-right font-medium text-body">{{ names[a] }}</th>
                        <td v-for="b in ids" :key="b" class="p-0.5">
                            <button v-if="a !== b" type="button"
                                class="grid h-9 w-9 place-items-center rounded font-semibold text-heading"
                                :style="{ background: heatColor(cell(a, b).value) }"
                                :class="picked && same(picked, a, b) ? 'outline-2 outline-heading' : ''"
                                :aria-label="`${names[a]} 與 ${names[b]}：${tierOf(cell(a, b).tierId).title}`"
                                @click="picked = { a, b }">{{ cell(a, b).value }}</button>
                            <span v-else class="grid h-9 w-9 place-items-center text-label">·</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
        <p class="m-0 mt-2 min-h-6 text-sm text-body">
            <template v-if="picked">
                {{ names[picked.a] }} × {{ names[picked.b] }}：
                {{ tierOf(cell(picked.a, picked.b).tierId).emoji }} {{ tierOf(cell(picked.a, picked.b).tierId).title }}
                <span v-if="cell(picked.a, picked.b).firstMatch">（第 {{ cell(picked.a, picked.b).firstMatch }} 輪首次相同）</span>
            </template>
            <template v-else>點格子看兩人的稱號</template>
        </p>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { heatColor, tierOf } from '../data/constants.js'

const props = defineProps({
    matrix: { type: Array, required: true },
    ids: { type: Array, required: true },
    names: { type: Object, required: true },
})

const picked = ref(null)
const lookup = computed(() => {
    const m = new Map()
    for (const p of props.matrix) { m.set(`${p.a}|${p.b}`, p); m.set(`${p.b}|${p.a}`, p) }
    return m
})
const cell = (a, b) => lookup.value.get(`${a}|${b}`) ?? { value: 0, tierId: 'rivals', firstMatch: null }
const same = (p, a, b) => (p.a === a && p.b === b) || (p.a === b && p.b === a)
</script>
