<template>
    <section class="game-section reveal-section">
        <!-- 標題列（簡化：含 subject + topic） -->
        <div class="reveal-header">
            <div class="section-icon">🎉</div>
            <h2 class="neon-heading reveal-title">
                <span class="subject-name-highlight">{{ subjectName }}</span> 的答案揭曉
                <span v-if="topicName" class="topic-badge topic-badge--inline">{{ topicName }}</span>
            </h2>
        </div>

        <!-- 倒數 -->
        <div v-if="phase === 'countdown'" class="game-card mb-16">
            <div class="reveal-countdown-container">
                <div class="reveal-countdown">{{ countdownNum }}</div>
            </div>
        </div>

        <!-- 統計 -->
        <div v-else-if="phase === 'stats'" class="game-card mb-16">
            <div class="reveal-stats text-center animate-bounce-in">
                <div style="font-size:52px;margin-bottom:12px">📊</div>
                <div class="reveal-stat-row">
                    <div class="reveal-stat-box reveal-stat-box--success">
                        <div class="reveal-stat-number" style="color:var(--success-fg)">{{ correctCount }}</div>
                        <div class="reveal-stat-label" style="color:var(--success-fg)">猜對</div>
                    </div>
                    <div class="reveal-stat-box reveal-stat-box--error">
                        <div class="reveal-stat-number" style="color:var(--error-fg)">{{ wrongCount }}</div>
                        <div class="reveal-stat-label" style="color:var(--error-fg)">猜錯</div>
                    </div>
                </div>
            </div>
        </div>

        <!-- 完整結果:左右雙欄 -->
        <div v-else-if="phase === 'final' && question" class="reveal-layout">
            <!-- 左:正解 + 每人猜測 -->
            <div class="game-card reveal-left">
                <div class="text-center animate-bounce-in reveal-answer-block">
                    <div class="reveal-answer">{{ correctAnswer === 'A' ? '🅰️' : '🅱️' }}</div>
                    <div class="reveal-answer-text">{{ correctAnswer === 'A' ? question.a : question.b }}</div>
                </div>
                <div class="reveal-results">
                    <div v-for="(p, i) in nonSubjectPlayers" :key="p.id"
                        :class="['player-row', guessIsCorrect(p) ? 'is-correct' : 'is-wrong', 'animate-slide-up']"
                        :style="{ animationDelay: `${i * 0.08}s` }">
                        <div class="player-avatar" :style="{ background: getPlayerColor(p.join_order) }">{{
                            getPlayerEmoji(p.join_order) }}</div>
                        <div style="flex:1;min-width:0">
                            <div class="player-name">{{ p.nickname }}</div>
                            <div class="text-body" style="font-size:12px">
                                <span :class="['guess-chip', guessLetter(p) ?? 'none']">{{ guessLabel(p) }}</span>
                            </div>
                        </div>
                        <div style="font-size:26px">{{ guessIsCorrect(p) ? '✅' : '❌' }}</div>
                    </div>
                </div>
            </div>

            <!-- 右:排名 -->
            <div class="reveal-right">
                <div class="game-card reveal-scoreboard">
                    <h3 class="neon-heading scoreboard-title">排名</h3>
                    <div v-for="(p, i) in sortedPlayers" :key="p.id" class="player-row animate-slide-up"
                        :style="{ animationDelay: `${i * 0.06}s` }">
                        <div class="medal-col">{{ ['🥇', '🥈', '🥉'][i] ?? `${i + 1}.` }}</div>
                        <div class="player-avatar" :style="{ background: getPlayerColor(p.join_order) }">{{
                            getPlayerEmoji(p.join_order) }}</div>
                        <div class="player-name" style="flex:1;min-width:0">{{ p.nickname }}</div>
                        <div class="player-score">{{ p.score }} 分</div>
                    </div>
                </div>
            </div>

            <!-- 跨欄 CTA -->
            <div class="action-stack action-stack--center reveal-actions">
                <template v-if="isHost">
                    <button class="btn-primary" @click="$emit('next-round')">下一回合</button>
                    <button class="btn-ghost" @click="$emit('end-game')">結束遊戲</button>
                </template>
                <p v-else class="text-body text-center">等待房主進入下一回合…</p>
            </div>
        </div>
    </section>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { getPlayerEmoji, getPlayerColor } from '../data/identity.js'

const props = defineProps({
    question: { type: Object, default: null },
    correctAnswer: { type: String, default: '' },
    guesses: { type: Array, default: () => [] },
    players: { type: Array, default: () => [] },
    subjectId: { type: String, default: '' },
    topicName: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
    alreadyAnimated: { type: Boolean, default: false },
})
const emit = defineEmits(['next-round', 'end-game', 'animation-done'])

const phase = ref('countdown')
const countdownNum = ref(3)

const subjectName = computed(() => props.players.find(p => p.id === props.subjectId)?.nickname ?? '??')
const nonSubjectPlayers = computed(() => props.players.filter(p => p.id !== props.subjectId))
const sortedPlayers = computed(() => [...props.players].sort((a, b) => b.score - a.score))
const guessMap = computed(() => Object.fromEntries(props.guesses.map(g => [g.player_id, g])))
const correctCount = computed(() => props.guesses.filter(g => g.guess === props.correctAnswer).length)
const wrongCount = computed(() => nonSubjectPlayers.value.length - correctCount.value)

function guessIsCorrect(p) { return guessMap.value[p.id]?.guess === props.correctAnswer }
function guessLetter(p) { const g = guessMap.value[p.id]?.guess; return g === 'A' ? 'a' : g === 'B' ? 'b' : null }
function guessLabel(p) { const g = guessMap.value[p.id]?.guess; return g === 'A' ? 'A 選項' : g === 'B' ? 'B 選項' : '未作答' }

function startAnimation() {
    if (props.alreadyAnimated) { phase.value = 'final'; return }
    phase.value = 'countdown'
    countdownNum.value = 3
    const tick = () => {
        countdownNum.value--
        if (countdownNum.value >= 0) {
            setTimeout(tick, 1000)
        } else {
            phase.value = 'stats'
            emit('animation-done')
            setTimeout(() => { phase.value = 'final' }, 1500)
        }
    }
    setTimeout(tick, 1000)
}

onMounted(startAnimation)
watch(() => props.correctAnswer, (val) => { if (val) startAnimation() })
</script>
