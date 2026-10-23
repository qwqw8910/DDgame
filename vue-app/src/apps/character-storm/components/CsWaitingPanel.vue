<template>
    <div class="game-card cs-waiting animate-slide-up">
        <div class="section-header" style="margin-bottom:4px">
            <h2 class="neon-heading" style="font-size:22px">等待玩家加入</h2>
            <p class="section-subtitle">需要 {{ minPlayers }} ～ {{ maxPlayers }} 人才能開始</p>
        </div>

        <!-- 房間碼（點擊複製邀請連結） -->
        <div class="cs-room-code" role="button" tabindex="0" title="複製邀請連結" aria-label="複製邀請連結"
            @click="emit('copy-link')" @keydown.enter="emit('copy-link')">
            <span v-for="(c, i) in roomId" :key="i" class="cs-tile cs-tile--md cs-tile--drop"
                :style="{ '--i': i }">{{ c }}</span>
        </div>
        <p class="cs-room-code-hint">點房間碼即可複製邀請連結 🔗</p>

        <!-- 座位 -->
        <TransitionGroup name="cs-seat" tag="div" class="cs-seat-grid">
            <div v-for="p in players" :key="p.id" class="cs-seat" :class="{
                'cs-seat--me': p.id === myPlayerId,
                'cs-seat--offline': !(p.is_online ?? p.connected),
            }">
                <span v-if="p.id === hostId" class="cs-seat__crown" title="房主">👑</span>
                <span v-if="p.id === myPlayerId" class="cs-seat__me">我</span>
                <span class="cs-tile cs-avatar" :style="{ '--tok': playerColor(players, p.id) }">{{
                    avatarChar(p.nickname) }}</span>
                <span class="cs-seat__name">{{ p.nickname }}</span>
            </div>
            <div v-for="n in emptySeats" :key="`empty-${n}`" class="cs-seat cs-seat--empty">
                <span class="cs-seat__dots"><i></i><i></i><i></i></span>
                <span style="font-size:11px">等待加入</span>
            </div>
        </TransitionGroup>

        <!-- 開始按鈕（僅房主） -->
        <template v-if="isHost">
            <button class="btn-primary cs-cta" style="width:100%" :disabled="players.length < minPlayers"
                @click="emit('start')">
                開始遊戲 🚀
            </button>
            <p v-if="players.length < minPlayers"
                style="text-align:center;font-size:12px;color:var(--label);margin-top:10px">
                還需要 {{ minPlayers - players.length }} 人才能開始
            </p>
        </template>
        <p v-else style="text-align:center;font-size:14px;color:var(--body)">等待房主開始遊戲…</p>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { avatarChar, playerColor } from '../data/playerLook.js'

const props = defineProps({
    roomId: { type: String, default: '' },
    players: { type: Array, required: true },
    myPlayerId: { type: String, default: '' },
    hostId: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
    minPlayers: { type: Number, required: true },
    maxPlayers: { type: Number, default: 0 },
})
const emit = defineEmits(['copy-link', 'start'])

const emptySeats = computed(() => Math.max(0, props.maxPlayers - props.players.length))
</script>
