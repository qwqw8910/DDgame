<template>
    <section class="game-section">
        <!-- 被猜者：預覽並可換題 -->
        <template v-if="isSubject">
            <div class="section-header">
                <h2 class="section-title">預覽你的題目</h2>
                <p class="section-hint">不喜歡可以換題，最多換 {{ swapLimit }} 次</p>
            </div>

            <ChoiceCards v-if="question" :question="question" :clickable="false" />
            <div v-else class="waiting-container">
                <div class="loading-dots"><span></span><span></span><span></span></div>
            </div>

            <div class="preview-actions">
                <button class="btn-secondary" :disabled="swapCount >= swapLimit" @click="$emit('swap')">
                    🔄 換一題（剩 {{ swapLimit - swapCount }} 次）
                </button>
                <button class="btn-primary" @click="$emit('confirm')">
                    ✓ 就這題！
                </button>
            </div>
        </template>

        <!-- 非被猜者：等待 -->
        <div v-else class="waiting-container">
            <div class="loading-dots"><span></span><span></span><span></span></div>
            <p class="text-body" style="font-size:15px;margin-top:16px">等待 {{ subjectName }} 確認題目…</p>
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import ChoiceCards from './ChoiceCards.vue'

const props = defineProps({
    question: { type: Object, default: null },
    isSubject: { type: Boolean, default: false },
    players: { type: Array, default: () => [] },
    subjectId: { type: String, default: '' },
    swapCount: { type: Number, default: 0 },
    swapLimit: { type: Number, default: 3 },
})
defineEmits(['swap', 'confirm'])

const subjectName = computed(() => props.players.find(p => p.id === props.subjectId)?.nickname ?? '??')
</script>
