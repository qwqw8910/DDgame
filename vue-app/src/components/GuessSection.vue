<template>
    <section class="game-section">
        <div class="section-header">
            <h2 class="section-title">猜猜 <span class="subject-name-highlight">{{ subjectName }}</span> 會選哪個？</h2>
            <span v-if="topicName" class="topic-badge">{{ topicName }}</span>
        </div>

        <!-- 被猜者等待畫面 -->
        <div v-if="isSubject" class="waiting-container">
            <div class="loading-dots"><span></span><span></span><span></span></div>
            <p class="text-body" style="font-size:15px;margin-top:16px">其他人猜測中…</p>
        </div>

        <!-- 其他人猜測 -->
        <template v-else>
            <p class="section-hint" style="text-align:center">
                {{ hasSubmittedGuess ? '✓ 已提交，可在揭曉前改選' : '點選你的答案（揭曉前可改選）' }}
            </p>

            <ChoiceCards :question="question" :clickable="true" :selected="myGuess"
                @pick="$emit('submit-guess', $event)" />

            <!-- 進度條 -->
            <div class="progress-section">
                <div class="progress-label">已提交 {{ guessSubmitted }} / {{ guessTotal }} 人</div>
                <div class="progress-bar">
                    <div class="progress-fill"
                        :style="{ width: guessTotal ? `${(guessSubmitted / guessTotal) * 100}%` : '0%' }"></div>
                </div>
            </div>

            <!-- 玩家猜測狀態列表 -->
            <div class="guess-player-list">
                <div v-for="p in nonSubjectPlayers" :key="p.id" class="guess-status-item">
                    <span class="guess-status-icon">{{ guessSubmittedIds.includes(p.id) ? '✅' : '⏳' }}</span>
                    <span
                        :class="guessSubmittedIds.includes(p.id) ? 'guess-status-name--done' : 'guess-status-name--pending'">
                        {{ p.nickname }}{{ p.id === myId ? ' (我)' : '' }}
                    </span>
                </div>
            </div>
        </template>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import ChoiceCards from './ChoiceCards.vue'

const props = defineProps({
    question: { type: Object, default: null },
    isSubject: { type: Boolean, default: false },
    hasSubmittedGuess: { type: Boolean, default: false },
    myGuess: { type: String, default: null },
    players: { type: Array, default: () => [] },
    myId: { type: String, default: '' },
    subjectId: { type: String, default: '' },
    topicName: { type: String, default: '' },
    guessSubmitted: { type: Number, default: 0 },
    guessTotal: { type: Number, default: 0 },
    guessSubmittedIds: { type: Array, default: () => [] },
})
defineEmits(['submit-guess'])

const subjectName = computed(() => props.players.find(p => p.id === props.subjectId)?.nickname ?? '??')
const nonSubjectPlayers = computed(() => props.players.filter(p => p.id !== props.subjectId))
</script>
