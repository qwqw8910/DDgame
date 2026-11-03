<template>
    <div class="flex flex-col gap-4">
        <!-- 本輪結果橫幅（全部翻完才出現） -->
        <Transition enter-active-class="transition duration-500 ease-[cubic-bezier(.3,1.4,.5,1)] motion-reduce:transition-none"
            enter-from-class="opacity-0 scale-75">
            <p v-if="done && banner" class="m-0 rounded-xl border border-border-glow bg-card px-3 py-2 text-center font-bold text-heading">{{ banner }}</p>
        </Transition>

        <!-- 詞卡：落單的先翻，最大的同詞組最後翻 -->
        <TransitionGroup tag="div" class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
            enter-active-class="transition duration-500 ease-[cubic-bezier(.3,1.4,.5,1)] motion-reduce:transition-none"
            enter-from-class="opacity-0 scale-75 -rotate-6">
            <div v-for="id in visible" :key="id"
                class="relative flex min-h-28 flex-col items-center justify-center gap-1 rounded-xl border-2 bg-card p-2 text-center"
                :style="{ borderColor: cardColor(id) }"
                :aria-label="`${names[id]}：${round.words[id] || '未送出'}`">
                <span class="max-w-full truncate text-xs text-label">{{ names[id] ?? '?' }}<template v-if="id === myId">（我）</template></span>
                <span class="max-w-full break-all text-xl font-bold text-heading">{{ round.words[id] || '—' }}</span>
                <span v-if="groupSize(id) >= 2" class="text-xs font-semibold text-body">{{ groupSize(id) }} 人同心</span>
                <span v-else-if="round.lone.includes(id)" class="text-xs font-semibold text-body">🦄 獨一無二</span>
                <b v-if="round.points[id] > 0" class="absolute right-1.5 top-1 text-sm tabular-nums text-[#34D399]">+{{ round.points[id] }}</b>

                <!-- 反應：別人的詞可以貼，每人每張卡一個 -->
                <div v-if="round.words[id]" class="mt-1 flex items-center justify-center gap-1">
                    <template v-if="canReact && id !== myId">
                        <button v-for="e in REACTIONS" :key="e" type="button"
                            class="rounded-full border px-1.5 py-0.5 text-sm leading-none transition-transform active:scale-90"
                            :class="myReactions[id] === e ? 'border-border-glow bg-card-hover' : 'border-border opacity-70 hover:opacity-100'"
                            :aria-pressed="myReactions[id] === e" :aria-label="`對${names[id]}的詞貼 ${e}`"
                            @click="emit('react', id, myReactions[id] === e ? null : e)">
                            {{ e }}<span v-if="count(id, e)" class="ml-0.5 text-xs tabular-nums">{{ count(id, e) }}</span>
                        </button>
                    </template>
                    <template v-else>
                        <span v-for="e in REACTIONS.filter(x => count(id, x))" :key="e" class="text-sm">
                            {{ e }}<span class="ml-0.5 text-xs tabular-nums">{{ count(id, e) }}</span>
                        </span>
                    </template>
                </div>
            </div>
        </TransitionGroup>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { GROUP_COLORS, REACTIONS, ALL_SAME_BONUS } from '../data/constants.js'

const props = defineProps({
    round: { type: Object, required: true },
    roundKey: { type: Number, required: true },       // 換輪時重新播放翻牌
    ids: { type: Array, required: true },
    names: { type: Object, required: true },
    myId: { type: String, default: '' },
    myReactions: { type: Object, default: () => ({}) },
    canReact: { type: Boolean, default: false },
})
const emit = defineEmits(['react'])

const groupIndex = id => props.round.groups.findIndex(g => g.includes(id))
const groupSize = id => props.round.groups[groupIndex(id)]?.length ?? 0
const cardColor = id => (groupSize(id) >= 2 ? GROUP_COLORS[groupIndex(id) % GROUP_COLORS.length] : 'var(--color-border, #475569)')
const count = (id, e) => props.round.reactions?.[id]?.[e] ?? 0

// 翻牌順序：沒送出的墊底，其餘依同詞組大小由小到大
const ordered = computed(() => [...props.ids].sort((a, b) => {
    const wa = props.round.words[a] ? 0 : 1
    const wb = props.round.words[b] ? 0 : 1
    return (wa - wb) || (groupSize(a) - groupSize(b))
}))

const shown = ref(0)
const visible = computed(() => ordered.value.slice(0, shown.value))
const done = computed(() => shown.value >= ordered.value.length)
let _timer = null
function play() {
    clearInterval(_timer)
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce) { shown.value = ordered.value.length; return }
    shown.value = 0
    const step = Math.max(180, Math.min(450, 2400 / Math.max(1, ordered.value.length)))
    _timer = setInterval(() => {
        shown.value += 1
        if (shown.value >= ordered.value.length) clearInterval(_timer)
    }, step)
}
watch(() => props.roundKey, play)
onMounted(play)
onUnmounted(() => clearInterval(_timer))

const banner = computed(() => {
    const r = props.round
    if (r.kind === 'converge') {
        const pts = Math.max(0, ...Object.values(r.points))
        return r.allSame ? `🎯 合作成功！全場 +${pts}` : '這次沒有收斂'
    }
    if (r.allSame) return r.kind === 'chain' ? `🎉 接龍通關！全員同詞，每人再 +${ALL_SAME_BONUS}` : `🎉 心電感應！全員同詞，每人再 +${ALL_SAME_BONUS}`
    if (!r.groups.some(g => g.length >= 2)) return '這題沒有人想到一起…'
    return ''
})
</script>
