<template>
    <p v-if="question.title" class="question-title">題目 :{{ question.title }}</p>
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
    <p v-if="question.author" style="text-align:center;font-size:13px;color:var(--label);margin-top:8px">✍️ {{
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

<style scoped>
.question-title {
    text-align: center;
    font-size: 17px;
    font-weight: 600;
    color: var(--heading);
    margin-bottom: 14px;
    line-height: 1.5;
    padding: 0 4px;
}
</style>
