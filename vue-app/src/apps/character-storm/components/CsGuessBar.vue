<template>
    <div v-if="!submitted" class="cs-hint-bar">
        <div class="cs-compose">
            <div v-if="wordLength" class="cs-compose__slots" aria-hidden="true">
                <span v-for="(t, i) in previewTiles" :key="`${i}-${t.char}`" :class="previewTileClass(t)">{{ t.char
                    }}</span>
            </div>
            <div class="cs-compose__row">
                <span class="cs-time-pill" :class="{ 'cs-time-pill--danger': timer <= 10 }">{{ timer }}s</span>
                <input :value="modelValue" type="text" class="game-input" style="flex:1" ref="inputRef"
                    :placeholder="isFirstRound ? '根據第一輪線索猜…' : '根據兩輪線索猜…'" aria-label="猜題答案"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                    @input="emit('update:modelValue', $event.target.value)" @keydown.enter="onEnter" />
                <button type="button" class="btn-primary cs-cta cs-send-btn" @click="submit">送出</button>
            </div>
        </div>
    </div>
    <div v-else class="cs-hint-bar" style="justify-content:center">
        <p class="cs-sent-msg">✓ 已送出「{{ modelValue || '（空白）' }}」，等待揭曉…</p>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { isComposingEnter, previewTileClass } from '../data/compose.js'

const props = defineProps({
    modelValue: { type: String, default: '' },
    wordLength: { type: Number, default: 0 },
    isFirstRound: { type: Boolean, default: true },
    timer: { type: Number, default: 0 },
    submitted: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'submit'])

const inputRef = ref(null)
defineExpose({ focus: () => inputRef.value?.focus() })

// 以 input 實際內容為準，避免輸入法組字期間 v-model 尚未同步
function submit() {
    emit('submit', inputRef.value?.value ?? props.modelValue)
}

function onEnter(e) {
    if (isComposingEnter(e)) return
    e.preventDefault()
    submit()
}

// 依題目字數顯示空位
const previewTiles = computed(() => {
    const chars = [...props.modelValue.replace(/\s/g, '')]
    const len = Math.max(props.wordLength, chars.length)
    return Array.from({ length: len }, (_, i) => ({ char: chars[i] ?? '', bad: i >= props.wordLength }))
})
</script>
