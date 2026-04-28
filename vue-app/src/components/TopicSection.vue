<template>
    <section class="game-section">
        <div class="section-header">
            <p class="section-hint">{{ isSubject ? '選擇你最想聊的主題！' : `等待 ${subjectName} 選主題…` }}</p>
        </div>

        <!-- 被猜者：顯示主題卡片 -->
        <div v-if="isSubject" class="topic-grid">
            <div v-for="(t, i) in topics" :key="t.id" class="topic-card animate-pop-in"
                :style="{ background: getTopicUi(t.name).gradient, animationDelay: `${i * 0.07}s` }"
                @click="$emit('select-topic', t.id)">
                <div class="topic-emoji">{{ getTopicUi(t.name).emoji }}</div>
                <div class="topic-label">{{ t.name }}</div>
            </div>
        </div>

        <!-- 非被猜者：等待動畫 -->
        <div v-else class="waiting-container">
            <div class="loading-dots"><span></span><span></span><span></span></div>
            <p class="text-body" style="font-size:15px;margin-top:16px">等待選擇主題中…</p>
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import { getTopicUi } from '../data/questions.js'

const props = defineProps({
    topics: { type: Array, default: () => [] },
    isSubject: { type: Boolean, default: false },
    players: { type: Array, default: () => [] },
    subjectId: { type: String, default: '' },
})
defineEmits(['select-topic'])

const subjectName = computed(() => props.players.find(p => p.id === props.subjectId)?.nickname ?? '??')
</script>
