<template>
    <section :class="tile" aria-labelledby="relay-theme">
        <!-- 主題卡：大家都看得到 -->
        <div class="flex items-baseline justify-between gap-3">
            <p class="m-0 text-base font-medium text-brand-ink">主題</p>
            <p class="m-0 text-base tabular-nums text-ink-faint">第 {{ Math.min(relay.done + 1, relay.total) }} / {{ relay.total }} 段</p>
        </div>
        <h2 id="relay-theme" class="mt-1 mb-0 font-display text-3xl leading-snug font-normal text-ink max-sm:text-2xl">{{ relay.theme }}</h2>

        <!-- 進度：每一段一格；卡住的是空心 -->
        <ol class="m-0 mt-5 flex list-none flex-wrap gap-1.5 p-0" aria-label="接句進度">
            <li v-for="i in relay.total" :key="i" class="h-2 min-w-3 flex-1 rounded-full"
                :class="dotClass(i - 1)">
                <span class="sr-only">{{ dotLabel(i - 1) }}</span>
            </li>
        </ol>

        <hr class="my-6 h-px border-0 bg-hairline" />

        <!-- 倒數條 -->
        <div class="flex items-center gap-3" role="timer" :aria-label="`剩餘 ${secondsLeft} 秒`">
            <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-fill">
                <div class="h-full rounded-full transition-[width] duration-250 ease-linear motion-reduce:transition-none"
                    :class="secondsLeft <= 3 ? 'bg-brand' : 'bg-ink-muted'" :style="{ width: `${ratio * 100}%` }"></div>
            </div>
            <span class="w-10 text-right font-display text-2xl tabular-nums text-ink"
                :class="{ 'text-brand-ink': secondsLeft <= 3 }">{{ secondsLeft }}</span>
        </div>

        <!-- 輪到我 -->
        <div v-if="isMine" class="mt-6">
            <p class="m-0 font-display text-2xl text-ink">輪到你了！</p>
            <div class="mt-3 rounded-inset bg-fill px-5 py-4">
                <template v-if="relay.prev">
                    <p class="m-0 text-base text-ink-faint">上一段只有這三個字，接下去：</p>
                    <p class="m-0 mt-1 font-display text-[clamp(36px,8vw,56px)] leading-tight text-ink">{{ relay.prev }}</p>
                </template>
                <p v-else class="m-0 text-lg leading-relaxed text-ink-muted">
                    {{ relay.done === 0 ? '你是第一棒，照主題起個頭。' : '前面都卡住了，你重新起個頭。' }}
                </p>
            </div>

            <form class="mt-4 flex gap-3 max-sm:flex-col" @submit.prevent="send">
                <label class="sr-only" for="relay-input">接三個字</label>
                <input id="relay-input" ref="inputRef" :value="draft" @input="draft = $event.target.value" type="text" maxlength="8" autocomplete="off" autocapitalize="off"
                    enterkeyhint="send" placeholder="三個字"
                    class="h-14 min-w-0 flex-1 max-sm:flex-none rounded-inset border-0 bg-fill px-4 text-center font-display text-3xl text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)] placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    @keydown.enter="e => { if (e.isComposing) e.preventDefault() }" />
                <button type="submit" :class="[primaryBtn, '!h-14 !px-8']" :disabled="count !== SEGMENT_LEN">送出</button>
            </form>
            <p class="m-0 mt-2 text-base" :class="hint ? 'text-danger-ink' : 'text-ink-faint'" aria-live="polite">
                {{ hint || `${count} / ${SEGMENT_LEN} 字（可以加標點，不算字數）` }}
            </p>
        </div>

        <!-- 等別人 -->
        <div v-else class="mt-6">
            <p class="m-0 font-display text-2xl text-ink">
                <span class="text-brand-ink">{{ names[relay.writerId] ?? '?' }}</span> 正在接…
            </p>
            <p class="m-0 mt-2 text-base leading-relaxed text-ink-muted">
                <template v-if="!canWrite">你正在觀戰，最後會一起揭曉整段話。</template>
                <template v-else-if="turnsUntilMe === 1">下一棒就是你，準備好！</template>
                <template v-else-if="turnsUntilMe > 1">再 {{ turnsUntilMe }} 棒輪到你。</template>
                <template v-else>你的部分寫完了，等揭曉。</template>
            </p>
            <div v-if="relay.mySegments?.length" class="mt-4">
                <p class="m-0 text-base text-ink-faint">你寫過的</p>
                <ul class="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                    <li v-for="(t, i) in relay.mySegments" :key="i" class="rounded-full bg-fill px-3 py-1 text-base text-ink">{{ t }}</li>
                </ul>
            </div>
        </div>
    </section>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { SEGMENT_LEN, readSegment, checkSegment } from '../data/constants.js'
import { primaryBtn, tile } from '../data/ui.js'

const props = defineProps({
    relay: { type: Object, required: true },
    names: { type: Object, required: true },
    myId: { type: String, default: '' },
    canWrite: { type: Boolean, default: false },
    participants: { type: Array, required: true },
    turnSeconds: { type: Number, required: true },
    now: { type: Number, required: true },
})
const emit = defineEmits(['submit'])

const isMine = computed(() => props.canWrite && props.relay.writerId === props.myId)
const remainingMs = computed(() => Math.max(0, (props.relay.turnEndsAt ?? 0) - props.now))
const secondsLeft = computed(() => Math.ceil(remainingMs.value / 1000))
const ratio = computed(() => Math.min(1, remainingMs.value / (props.turnSeconds * 1000)))

// 還要幾棒輪到我（剩餘段數內沒有我就是 0）
const turnsUntilMe = computed(() => {
    const order = props.relay.order.filter(id => props.participants.includes(id))
    const left = props.relay.total - props.relay.done
    for (let k = 0; k < Math.min(left, order.length); k++) {
        if (order[(props.relay.done + k) % order.length] === props.myId) return k
    }
    return 0
})

function dotClass(i) {
    const t = props.relay.turns[i]
    if (t) return t.timeout ? 'shadow-[inset_0_0_0_1.5px_var(--color-ink-faint)]' : 'bg-ink-muted'
    return i === props.relay.done ? 'bg-brand' : 'bg-fill'
}
function dotLabel(i) {
    const t = props.relay.turns[i]
    if (t) return `第 ${i + 1} 段：${props.names[t.by] ?? '?'}${t.timeout ? '（卡住）' : ''}`
    return i === props.relay.done ? `第 ${i + 1} 段：進行中` : `第 ${i + 1} 段：還沒輪到`
}

// ── 輸入 ─────────────────────────────────────────────────────────
const draft = ref('')
const hint = ref('')
const inputRef = ref(null)
const count = computed(() => readSegment(draft.value).count)
watch(draft, () => { hint.value = ''; sent = false }) // 改了字就允許再送

// 輪到我：清空、聚焦、手機震一下
watch(isMine, async (mine) => {
    sent = false
    if (!mine) return
    draft.value = ''
    hint.value = ''
    navigator.vibrate?.(40)
    await nextTick()
    inputRef.value?.focus()
}, { immediate: false })
onMounted(() => { if (isMine.value) inputRef.value?.focus() })

function send() {
    const raw = inputRef.value?.value ?? draft.value // 以輸入框實際內容為準
    const err = checkSegment(raw)
    if (err) { hint.value = err; return }
    if (sent) return // 連按 Enter 只送一次，等換棒
    sent = true
    emit('submit', readSegment(raw).text)
}
let sent = false
</script>
