<template>
    <!-- 圓桌座位（所有視角共用）：座位順序 = 遊戲裡的鄰座，順時針。
         以容器查詢縮放成「容器內最大的正方形」，不撐高版面（整頁一個畫面，不捲動）。父層需為 relative 且有確定的高度 -->
    <div ref="boxRef" class="absolute inset-0 [container-type:size]">
        <div class="absolute left-1/2 top-1/2 h-[min(100cqw,100cqh)] w-[min(100cqw,100cqh)] -translate-x-1/2 -translate-y-1/2">
            <div class="absolute inset-[11%] rounded-full border border-border-glow bg-[radial-gradient(circle,rgba(139,92,246,0.10),transparent_70%)]"
                aria-hidden="true"></div>
            <WhisperLinks v-if="whisperGroups.length" :groups="whisperGroups" :seat-of-player="seatOfPlayer" :position="position"
                :my-group-id="myGroupId" :focus-id="focusGroupId" />
            <!-- 中央 -->
            <div class="absolute inset-[26%] flex flex-col items-center justify-center gap-0.5 overflow-hidden text-center">
                <slot name="center" />
            </div>
            <!-- 座位 -->
            <div v-for="s in seats" :key="s.index" class="absolute -translate-x-1/2 -translate-y-1/2"
                :style="{ left: `${position(s.index).x}%`, top: `${position(s.index).y}%`, width: `${seatWidth}%` }">
                <SeatToken :seat="s" :token-size="tokenSize" :is-me="!!myId && s.playerId === myId"
                    :online="s.empty || s.isBot ? undefined : online?.[s.playerId]"
                    :selected="selected.includes(s.index)" :pointer="pointerSeat === s.index"
                    :hand-up="!!hands?.[s.index]" :whispering="whisperingIds.has(s.playerId)"
                    :whisper-text="whisperTextOf(s.playerId)"
                    :badge="badges?.[s.index] ?? ''" :impaired="!!impaired?.[s.index]"
                    :reminders="remindersBySeat[s.index] ?? []" :clickable="clickable"
                    @click="$emit('seat-click', s.index)" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import SeatToken from './SeatToken.vue'
import WhisperLinks from './WhisperLinks.vue'

const props = defineProps({
    seats: { type: Array, default: () => [] },
    myId: { type: String, default: null },
    online: { type: Object, default: null },
    selected: { type: Array, default: () => [] },
    pointerSeat: { type: Number, default: null },
    hands: { type: Object, default: null },
    badges: { type: Object, default: null },        // 座位號 → 小標籤（提名者 / 被提名者…）
    impaired: { type: Array, default: null },
    reminders: { type: Array, default: () => [] },  // 只有說書人 / 終局才有
    whisperGroups: { type: Array, default: () => [] },
    myGroupId: { type: String, default: null },
    focusGroupId: { type: String, default: null },
    names: { type: Object, default: () => ({}) },
    clickable: { type: Boolean, default: true },
})
defineEmits(['seat-click'])

const n = computed(() => Math.max(props.seats.length, 1))
const RADIUS = 39
function position(i) {
    const t = -Math.PI / 2 + (2 * Math.PI * i) / n.value
    return { x: 50 + RADIUS * Math.cos(t), y: 50 + RADIUS * Math.sin(t) }
}
const seatWidth = computed(() => (n.value <= 8 ? 20 : n.value <= 11 ? 17 : 14))

// 依圓桌實際大小換算頭像大小
const boxRef = ref(null)
const side = ref(400)
let _ro = null
onMounted(() => {
    if (typeof ResizeObserver === 'undefined' || !boxRef.value) return
    _ro = new ResizeObserver(([e]) => { side.value = Math.min(e.contentRect.width, e.contentRect.height) })
    _ro.observe(boxRef.value)
})
onUnmounted(() => _ro?.disconnect())
const tokenSize = computed(() => {
    const ratio = n.value <= 8 ? 0.11 : n.value <= 11 ? 0.095 : 0.08
    return Math.round(Math.min(56, Math.max(24, side.value * ratio)))
})

const seatOfPlayer = id => props.seats.findIndex(s => s.playerId === id)
const whisperingIds = computed(() => new Set(props.whisperGroups.flatMap(g => g.members)))
function whisperTextOf(id) {
    const g = props.whisperGroups.find(x => x.members.includes(id))
    if (!g) return ''
    return `正在和 ${g.members.filter(m => m !== id).map(m => props.names[m] ?? '?').join('、')} 私聊`
}
const remindersBySeat = computed(() => {
    const out = {}
    for (const r of props.reminders) (out[r.seat] ??= []).push(r)
    return out
})
</script>
