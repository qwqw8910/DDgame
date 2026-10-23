<template>
    <div v-if="!submitted" class="cs-hint-bar">
        <div class="cs-compose">
            <div class="cs-compose__slots" aria-hidden="true">
                <span v-for="(t, i) in previewTiles" :key="`${i}-${t.char}`" :class="previewTileClass(t)">{{ t.char
                    }}</span>
            </div>
            <div class="cs-compose__row">
                <span class="cs-time-pill" :class="{ 'cs-time-pill--danger': timer <= 10 }">{{ timer }}s</span>
                <input :value="modelValue" type="text" class="game-input" style="flex:1" ref="inputRef"
                    :placeholder="`輸入中文提示（1 ～ ${maxChars} 字）`" :maxlength="12" aria-label="提示輸入"
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
                    @input="onInput" @keydown.enter="onEnter" />
                <button type="button" class="btn-primary cs-cta cs-send-btn" :disabled="!canSubmit"
                    @click="emit('submit')">出牌</button>
            </div>
            <p v-if="error" class="cs-compose__error">{{ error }}</p>
        </div>
    </div>
    <div v-else class="cs-hint-bar" style="justify-content:center">
        <p class="cs-sent-msg">✓ 已出牌，等待其他提示者…</p>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { isComposingEnter, previewTileClass, isHanChar } from '../data/compose.js'

const props = defineProps({
    modelValue: { type: String, default: '' },
    maxChars: { type: Number, default: 4 },
    word: { type: String, default: '' },
    timer: { type: Number, default: 0 },
    error: { type: String, default: '' },
    submitted: { type: Boolean, default: false },
    canSubmit: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'input', 'submit'])

const inputRef = ref(null)
defineExpose({ focus: () => inputRef.value?.focus() })

function onInput(e) {
    emit('update:modelValue', e.target.value)
    emit('input')
}

function onEnter(e) {
    if (isComposingEnter(e)) return
    e.preventDefault()
    emit('submit')
}

// 依字數上限顯示空位；超量、非中文、含題目字都標紅
const previewTiles = computed(() => {
    const chars = [...props.modelValue.replace(/\s/g, '')]
    const wordChars = new Set([...props.word])
    const len = Math.max(props.maxChars, chars.length)
    return Array.from({ length: len }, (_, i) => {
        const char = chars[i] ?? ''
        const bad = !!char && (i >= props.maxChars || !isHanChar(char) || wordChars.has(char))
        return { char, bad }
    })
})
</script>
