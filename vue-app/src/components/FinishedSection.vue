<template>
    <section class="game-section">
        <div class="finished-header">
            <div style="font-size:64px;text-align:center">🎉</div>
            <h2 class="section-title" style="text-align:center">遊戲結束！</h2>
        </div>

        <!-- 排行榜 -->
        <div class="finished-scores">
            <div v-for="(p, i) in sortedPlayers" :key="p.id"
                :class="['player-row', i === 0 ? 'is-correct' : '', 'animate-slide-up']"
                :style="{ animationDelay: `${i * 0.08}s` }">
                <div class="medal-col medal-col--lg">{{ medals[i] ?? `${i + 1}.` }}</div>
                <div class="player-avatar" :style="{ background: getPlayerColor(p.join_order) }">
                    {{ getPlayerEmoji(p.join_order) }}
                </div>
                <div class="player-name player-name--lg" style="flex:1">{{ p.nickname }}</div>
                <div class="player-score">{{ p.score }} 分</div>
            </div>
        </div>

        <div class="finished-actions">
            <button v-if="isHost" class="btn-primary" @click="$emit('restart')">🔄 再玩一次</button>
            <p v-else class="section-hint">等待房主重新開始…</p>
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import { getPlayerEmoji, getPlayerColor } from '../data/identity.js'

const props = defineProps({
    players: { type: Array, default: () => [] },
    isHost: { type: Boolean, default: false },
})
defineEmits(['restart'])

const medals = ['🥇', '🥈', '🥉']
const sortedPlayers = computed(() => [...props.players].sort((a, b) => b.score - a.score))
</script>
