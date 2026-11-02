<template>
    <div class="flex flex-col gap-4">
        <!-- 新配對稱號 -->
        <TransitionGroup v-if="round.newPairs.length" tag="div" class="flex flex-col gap-2"
            appear enter-active-class="transition duration-500 ease-[cubic-bezier(.3,1.4,.5,1)] motion-reduce:transition-none"
            enter-from-class="opacity-0 scale-75">
            <div v-for="p in round.newPairs" :key="p.a + p.b"
                class="flex items-center gap-3 rounded-xl border border-border-glow bg-card px-3 py-2">
                <img :src="badgeUrl(tierOf(p.tierId).badge)" alt="" class="h-12 w-12 shrink-0 object-contain" loading="lazy" />
                <div class="min-w-0">
                    <p class="m-0 truncate font-bold text-heading">{{ names[p.a] }} × {{ names[p.b] }}</p>
                    <p class="m-0 text-sm text-body">{{ tierOf(p.tierId).emoji }} {{ tierOf(p.tierId).title }}　{{ tierOf(p.tierId).value }}%</p>
                </div>
            </div>
        </TransitionGroup>
        <p v-else class="m-0 text-center text-sm text-body">這一輪沒有人新配對成功</p>

        <!-- 詞卡 -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            <button v-for="id in ids" :key="id" type="button"
                class="relative flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-card p-2 text-center transition-transform"
                :class="votable(id) ? 'cursor-pointer hover:-translate-y-0.5' : 'cursor-default'"
                :style="{ borderColor: cardColor(id) }" :disabled="!votable(id)"
                :aria-label="`${names[id]}：${round.words[id] || '未送出'}`" @click="emit('vote', id)">
                <span class="max-w-full truncate text-xs text-label">{{ names[id] ?? '?' }}<template v-if="id === myId">（我）</template></span>
                <span class="max-w-full break-all text-xl font-bold text-heading">{{ round.words[id] || '—' }}</span>
                <span v-if="groupSize(id) >= 2" class="text-xs font-semibold text-body">{{ groupSize(id) }} 人同心</span>
                <span v-if="myVote === id" class="absolute right-1 top-1 text-sm" title="你投了離譜">🛸</span>
            </button>
        </div>
        <p v-if="canVote" class="m-0 text-center text-xs text-label">
            點別人的詞可以投「最離譜」（{{ voteSeconds }} 秒內，再點一次收回）
        </p>
    </div>
</template>

<script setup>
import { GROUP_COLORS, badgeUrl, tierOf } from '../data/constants.js'

const props = defineProps({
    round: { type: Object, required: true },
    ids: { type: Array, required: true },
    names: { type: Object, required: true },
    myId: { type: String, default: '' },
    myVote: { type: String, default: null },
    voteSeconds: { type: Number, default: 0 },
    canVote: { type: Boolean, default: false },
})
const emit = defineEmits(['vote'])

const groupIndex = id => props.round.groups.findIndex(g => g.includes(id))
const groupSize = id => props.round.groups[groupIndex(id)]?.length ?? 0
const cardColor = id => (groupSize(id) >= 2 ? GROUP_COLORS[groupIndex(id) % GROUP_COLORS.length] : 'var(--color-border, #475569)')
const votable = id => props.canVote && id !== props.myId && !!props.round.words[id]
</script>
