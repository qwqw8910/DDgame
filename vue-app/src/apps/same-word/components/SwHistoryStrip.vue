<template>
    <div v-if="rounds.length" class="rounded-xl border border-border bg-card p-2">
        <p class="m-0 mb-1 text-xs text-label">前幾輪</p>
        <div class="max-h-40 overflow-auto">
            <table class="w-full border-collapse text-sm">
                <thead>
                    <tr>
                        <th class="sticky left-0 bg-card px-2 py-1 text-left text-xs font-normal text-label"></th>
                        <th v-for="id in ids" :key="id" class="whitespace-nowrap px-2 py-1 text-xs font-medium text-body"
                            :class="id === myId ? 'text-heading' : ''">{{ names[id] ?? '?' }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(r, i) in rounds" :key="i" class="border-t border-border">
                        <td class="sticky left-0 bg-card px-2 py-1 text-xs text-label">{{ i + 1 }}</td>
                        <td v-for="id in ids" :key="id" class="whitespace-nowrap px-2 py-1 text-center text-heading">
                            <span v-if="r.words[id]" class="rounded px-1.5 py-0.5"
                                :style="{ background: colorOf(r, id) }">{{ r.words[id] }}</span>
                            <span v-else class="text-label">—</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script setup>
import { GROUP_COLORS } from '../data/constants.js'

defineProps({
    rounds: { type: Array, required: true },
    ids: { type: Array, required: true },
    names: { type: Object, required: true },
    myId: { type: String, default: '' },
})

// 同組（≥2 人）才上色
function colorOf(round, id) {
    const gi = round.groups.findIndex(g => g.includes(id))
    if (gi < 0 || round.groups[gi].length < 2) return 'transparent'
    return `${GROUP_COLORS[gi % GROUP_COLORS.length]}55`
}
</script>
