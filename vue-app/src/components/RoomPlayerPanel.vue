<template>
    <div class="rpp-wrap">
        <!-- Header 觸發按鈕 -->
        <button class="header-icon-btn rpp__trigger" :aria-expanded="open" aria-label="玩家列表"
            @click.stop="open = !open">
            👥<span class="rpp__count">{{ players.length }}</span>
        </button>

        <Teleport to="body">
            <!-- 遮罩 -->
            <div v-if="open" class="rpp__backdrop" @click="open = false" />

            <!-- 面板 -->
            <Transition name="rpp-slide">
                <div v-if="open" class="rpp__panel" role="dialog" aria-label="玩家列表">
                    <div class="rpp__panel-header">
                        <span style="font-weight:600;font-size:16px">👥 玩家（{{ players.length }} 人）</span>
                        <button class="header-icon-btn" aria-label="關閉" @click="open = false">✕</button>
                    </div>

                    <div class="rpp__list">
                        <div v-for="p in players" :key="p.id" class="rpp__row">
                            <!-- 在線狀態 -->
                            <span :class="['rpp__dot', playerOnline(p) ? 'rpp__dot--on' : 'rpp__dot--off']" />

                            <!-- 暱稱 + 標籤 -->
                            <div class="rpp__info">
                                <span class="rpp__name">{{ p.nickname }}</span>
                                <span v-if="p.id === myId" class="badge badge-me"
                                    style="font-size:11px;padding:1px 7px">我</span>
                                <span v-if="p.id === hostId" class="badge badge-host"
                                    style="font-size:11px;padding:1px 7px">👑</span>
                            </div>

                            <!-- 房主操作 -->
                            <div v-if="isHost && p.id !== myId" class="rpp__actions">
                                <button class="btn-ghost-sm" title="移交房主"
                                    @click="onTransfer(p)">👑</button>
                                <button class="btn-danger-sm" title="踢出"
                                    @click="onKick(p)">踢</button>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script setup>
import { ref } from 'vue'

const props = defineProps({
    players: { type: Array, default: () => [] },
    myId:    { type: String, default: '' },
    hostId:  { type: String, default: '' },
    isHost:  { type: Boolean, default: false },
})

const emit = defineEmits(['kick', 'transfer-host'])

const open = ref(false)

// 相容兩個遊戲的不同欄位名稱（is_online vs connected）
function playerOnline(p) {
    if (p.is_online !== undefined) return p.is_online
    if (p.connected !== undefined) return p.connected
    return true
}

function onKick(p) {
    if (!confirm(`確定要踢出 ${p.nickname}？`)) return
    emit('kick', p.id, p.nickname)
    open.value = false
}

function onTransfer(p) {
    if (!confirm(`將房主移交給 ${p.nickname}？`)) return
    emit('transfer-host', p.id, p.nickname)
    open.value = false
}
</script>
