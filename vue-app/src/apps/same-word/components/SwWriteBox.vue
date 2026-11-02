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
            <input v-model="draft" ref="inputRef" type="text" maxlength="12" autocomplete="off" autocapitalize="off"
                placeholder="想到什麼就寫什麼" aria-label="你的詞"
                class="game-input !py-3 text-center !text-2xl font-bold" />
            <p class="m-0 min-h-5 text-center text-sm" :class="hint ? 'text-ruby' : 'text-label'">
                {{ hint || (myWord ? `已送出「${myWord}」，截止前可再改` : '寫好按送出，和大家想成同一個詞') }}
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
watch(() => props.round, () => { draft.value = ''; hint.value = ''; inputRef.value?.focus() })
watch(draft, () => { hint.value = '' })
onMounted(() => inputRef.value?.focus())

function send() {
    const err = checkWord(draft.value)
    if (err) { hint.value = err; return }
    emit('submit', draft.value.trim())
}
</script>
