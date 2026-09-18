<template>
    <p v-if="question.title" class="text-center text-[17px] font-semibold mb-3.5 leading-relaxed px-1 text-heading">題目 :{{ question.title }}</p>
    <div class="choices-grid">
        <div v-for="opt in ['A', 'B']" :key="opt" :class="[
            'choice-card',
            { clickable: clickable, selected: selected === opt }
        ]" :style="{ background: opt === 'A' ? 'rgba(139,92,246,0.08)' : 'rgba(225,29,72,0.08)' }"
            @click="clickable && $emit('pick', opt)">
            <div class="choice-emoji">{{ opt === 'A' ? '🅰️' : '🅱️' }}</div>
            <div class="choice-text">{{ opt === 'A' ? question.a : question.b }}</div>
        </div>
    </div>
    <p v-if="question.author" class="text-center text-[13px] mt-2 text-label">✍️ {{
        question.author }}</p>
</template>

<script setup>
defineProps({
    question: { type: Object, required: true },
    clickable: { type: Boolean, default: false },
    selected: { type: String, default: null },
})
defineEmits(['pick'])
</script>
