<template>
    <!-- 鼓聲倒數 3-2-1 → 揭曉 -->
    <Transition name="result-card">
        <div v-if="card.show" class="result-card-overlay" aria-live="assertive">
            <div class="result-card-box"
                :class="card.phase === 'reveal' ? (card.correct ? 'result-card-box--correct' : 'result-card-box--wrong') : ''">
                <!-- 倒數 -->
                <template v-if="card.phase === 'countdown'">
                    <div :key="card.countdownNum" class="result-card-countdown">
                        {{ card.countdownNum }}
                    </div>
                    <p style="margin:0;font-size:12px;letter-spacing:0.4em;color:#A5F3FC">判定中</p>
                </template>
                <!-- 揭曉 -->
                <template v-else>
                    <div v-if="card.correct" class="cs-result-rays" aria-hidden="true"></div>
                    <CsMascot :mood="card.correct ? 'happy' : 'sad'" style="--mascot-size:104px" />
                    <p class="result-card-verdict">
                        {{ card.correct
                            ? '答對了！'
                            : (card.isFinal ? '答錯了' : '答錯，進入第二輪') }}
                    </p>
                    <div v-if="card.answer" class="cs-result-guess">
                        <div class="cs-tile-row cs-tile-row--tight">
                            <span v-for="(c, i) in [...card.answer]" :key="i"
                                class="cs-tile cs-tile--sm cs-tile--flip" :style="{ '--i': i }">{{ c }}</span>
                        </div>
                        <div v-if="!card.correct && card.a !== null" class="cs-result-ab">
                            <span class="a">{{ card.a }}A</span>
                            <span class="b">{{ card.b ?? 0 }}B</span>
                        </div>
                    </div>
                </template>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import CsMascot from './CsMascot.vue'

defineProps({
    card: { type: Object, required: true },
})
</script>
