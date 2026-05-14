<template>
    <section class="game-section">
        <!-- 房間資訊 + 玩家列表卡片 -->
        <div class="neon-card mb-16">
            <div class="section-header" style="margin-bottom:18px">
                <div class="section-icon">🏠</div>
                <h2 class="neon-heading" style="font-size:22px">等待玩家加入</h2>
                <p class="section-subtitle">分享房間碼或連結邀請朋友！</p>
            </div>

            <!-- 分享連結列 -->
            <div class="share-row">
                <div style="font-size:18px;flex-shrink:0">🔗</div>
                <div style="flex:1;min-width:0">
                    <div class="header-stat-label" style="margin-bottom:2px">
                        邀請連結 · 房間碼 <strong style="color:var(--neon-purple-light)">{{ roomId }}</strong>
                    </div>
                    <div class="share-row__url">{{ shareUrl }}</div>
                </div>
                <button class="btn-copy" @click="copyLink">複製</button>
            </div>

            <!-- 玩家列表 -->
            <PlayerList :players="players" :my-id="myId" :host-id="hostId" :is-host="isHost"
                @kick="$emit('kick', $event)"
                @transfer-host="(id, name) => $emit('transfer-host', id, name)" />
        </div>

        <!-- 操作按鈕 -->
        <div class="action-stack">
            <!-- 非房主：準備 -->
            <button v-if="!isHost" :class="meReady ? 'btn-success' : 'btn-primary'" @click="$emit('toggle-ready')">
                {{ meReady ? '✓ 已準備好！' : '準備好了 🙋' }}
            </button>

            <!-- 房主：開始遊戲 -->
            <button v-if="isHost" class="btn-success" :disabled="!allReady" @click="$emit('start-game')">
                {{ allReady ? '🎮 開始遊戲！' : `等待所有人準備 (${readyCount}/${players.length})` }}
            </button>
        </div>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import PlayerList from './PlayerList.vue'

const props = defineProps({
    players: { type: Array, default: () => [] },
    myId: { type: String, default: '' },
    hostId: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
    roomId: { type: String, default: '' },
})
const emit = defineEmits(['toggle-ready', 'start-game', 'kick', 'transfer-host', 'copy-link'])

const shareUrl = computed(() => `${location.origin}${location.pathname}#/room?id=${props.roomId}`)
const meReady = computed(() => props.players.find(p => p.id === props.myId)?.is_ready ?? false)
const readyCount = computed(() => props.players.filter(p => p.is_ready || p.id === props.hostId).length)
const allReady = computed(() => props.players.length >= 1 && props.players.every(p => p.is_ready || p.id === props.hostId))

function copyLink() { emit('copy-link') }
</script>
