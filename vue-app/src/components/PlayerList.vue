<template>
    <div class="player-list">
        <div v-for="p in players" :key="p.id" :class="['player-row', { 'is-me': p.id === myId }]">
            <div :class="['player-avatar', p.is_online ? 'online' : 'offline']"
                :style="{ background: getPlayerColor(p.join_order) }">{{ getPlayerEmoji(p.join_order) }}</div>

            <div class="player-info">
                <div class="player-badges">
                    <span class="player-name">{{ p.nickname }}</span>
                    <span v-if="p.id === myId" class="badge badge-me">我</span>
                    <span v-if="p.id === hostId" class="badge badge-host">👑 房主</span>
                    <span v-if="subjectId && p.id === subjectId" class="badge badge-subject">🎯 被猜者</span>
                </div>
                <div :class="['player-online', p.is_online ? 'player-online--on' : 'player-online--off']">
                    {{ p.is_online ? '● 在線' : '○ 離線' }}
                </div>
            </div>

            <div class="player-actions">
                <span :class="['badge', (p.is_ready || p.id === hostId) ? 'badge-ready' : 'badge-waiting']">
                    {{ (p.is_ready || p.id === hostId) ? '✓ 準備' : '等待中' }}
                </span>
                <button v-if="isHost && p.id !== myId && p.id !== hostId" class="btn-danger-sm"
                    @click="$emit('kick', p.id, p.nickname)">踢</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { getPlayerEmoji, getPlayerColor } from '../data/identity.js'

defineProps({
    players: { type: Array, default: () => [] },
    myId: { type: String, default: '' },
    hostId: { type: String, default: '' },
    subjectId: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
})
defineEmits(['kick'])
</script>
