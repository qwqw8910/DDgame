<template>
    <section class="game-section">
        <div class="section-header">
            <h2 v-if="isSubject" class="section-title">選擇你的答案！</h2>
            <h2 v-else class="section-title">
                <span class="subject-name-highlight">{{ subjectName }}</span> 的題目，先看看吧！
            </h2>
            <span v-if="topicName" class="topic-badge">{{ topicName }}</span>
        </div>

        <!-- 題目已載入 -->
        <template v-if="question">
            <p v-if="!isSubject" class="section-hint" style="text-align:center;margin-bottom:12px">
                等待 {{ subjectName }} 悄悄作答，先看看題目吧！
            </p>
            <ChoiceCards :question="question" :clickable="isSubject && !hasSubmittedAnswer" :selected="submittedAnswer"
                @pick="$emit('submit-answer', $event)" />
            <p v-if="hasSubmittedAnswer" class="submitted-hint">✓ 答案已送出，等待猜測階段…</p>
        </template>

        <!-- 等待被猜者選題中 -->
        <div v-else class="waiting-container">
            <div class="loading-dots"><span></span><span></span><span></span></div>
            <p class="text-body" style="font-size:15px;margin-top:16px">等待 {{ subjectName }} 作答…</p>
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import ChoiceCards from './ChoiceCards.vue'

const props = defineProps({
    question: { type: Object, default: null },
    isSubject: { type: Boolean, default: false },
    hasSubmittedAnswer: { type: Boolean, default: false },
    submittedAnswer: { type: String, default: null },
    players: { type: Array, default: () => [] },
    subjectId: { type: String, default: '' },
    topicName: { type: String, default: '' },
})
defineEmits(['submit-answer'])

const subjectName = computed(() => props.players.find(p => p.id === props.subjectId)?.nickname ?? '??')
</script>
