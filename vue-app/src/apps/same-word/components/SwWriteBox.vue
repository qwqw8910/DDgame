<template>
    <div class="flex flex-col items-center gap-4">
        <!-- 倒數環 -->
        <div class="relative grid h-28 w-28 place-items-center" role="timer" :aria-label="`剩餘 ${secondsLeft} 秒`">
            <svg viewBox="0 0 100 100" class="absolute inset-0 -rotate-90">
                <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="8" class="text-border" />
                <circle cx="50" cy="50" r="44" fill="none" stroke-width="8" stroke-linecap="round"
                    :stroke="secondsLeft <= 10 ? '#FB7185' : '#FBBF24'" :stroke-dasharray="C"
                    :stroke-dashoffset="C * (1 - ratio)" class="transition-[stroke-dashoffset] duration-500 ease-linear" />
            </svg>
            <span class="text-3xl font-bold tabular-nums"
                :class="secondsLeft <= 10 ? 'text-ruby animate-timer-pulse' : 'text-heading'">{{ secondsLeft }}</span>
        </div>

        <form v-if="canWrite" class="flex w-full max-w-sm flex-col gap-2" @submit.prevent="send">
            <!-- 不用 v-model：中文輸入法組字中 v-model 不會更新，Android 鍵盤常常一直停在組字狀態，
                 送出鈕就一直是 disabled、按 Enter 也送不出去，時間到變成空白 -->
            <input :value="draft" ref="inputRef" type="text" maxlength="12" autocomplete="off" autocapitalize="off"
                enterkeyhint="send" placeholder="第一個想到的詞" aria-label="你的詞"
                class="game-input !py-3 text-center !text-2xl font-bold"
                @input="draft = $event.target.value" @keydown.enter="onEnter" />
            <p class="m-0 min-h-5 text-center text-sm" :class="hint ? 'text-ruby' : 'text-label'">
                {{ hint || (myWord ? `已送出「${myWord}」，截止前可再改` : '寫好按送出，全員送出就立刻揭曉') }}
            </p>
            <button type="submit" class="btn-primary" :disabled="!draft.trim()">{{ myWord ? '更新答案' : '送出' }}</button>
        </form>
        <p v-else class="m-0 text-sm text-body">你正在觀戰，這一輪等大家寫完。</p>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { checkWord } from '../data/constants.js'

const props = defineProps({
    seconds: { type: Number, required: true },   // 剩餘秒數（含小數）
    total: { type: Number, required: true },
    myWord: { type: String, default: null },
    canWrite: { type: Boolean, default: true },
    round: { type: Number, required: true },
})
const emit = defineEmits(['submit'])

const C = 2 * Math.PI * 44
const secondsLeft = computed(() => Math.max(0, Math.ceil(props.seconds)))
const ratio = computed(() => Math.min(1, Math.max(0, props.seconds / props.total)))

const draft = ref(props.myWord ?? '')
const hint = ref('')
const inputRef = ref(null)

// 新的一輪清空輸入框並聚焦
watch(() => props.round, () => { draft.value = ''; hint.value = ''; autoSent = false; lastSent = null; inputRef.value?.focus() })
watch(draft, () => { hint.value = '' })
onMounted(() => inputRef.value?.focus())

// 注音選字時按的 Enter 只用來確認選字，不送出
function onEnter(e) {
    if (e.isComposing) e.preventDefault()
}

// 以輸入框實際的字為準（組字中 draft 可能還沒同步）
const currentText = () => (inputRef.value?.value ?? draft.value).trim()

function send() {
    const text = currentText()
    const err = checkWord(text)
    if (err) { hint.value = err; return }
    draft.value = text
    // 連按 Enter 不重送同一個詞（避免最後一人送出後立刻揭曉，第二下跳出錯誤提示）
    if (text === lastSent || text === props.myWord) return
    lastSent = text
    emit('submit', text)
}
let lastSent = null

// 保險：快到時間還有沒送出（或改過沒更新）的合法詞，自動幫忙送出
let autoSent = false
watch(() => props.seconds, (s) => {
    if (autoSent || !props.canWrite || s > 1.2 || s <= 0) return
    const text = currentText()
    if (!text || text === props.myWord || text === lastSent || checkWord(text)) return
    autoSent = true
    lastSent = text
    emit('submit', text)
})
</script>
