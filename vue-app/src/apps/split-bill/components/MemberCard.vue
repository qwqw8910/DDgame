<template>
    <div :class="['mrow', { 'mrow--del': member.leftAt }]">
        <div class="mrow__name">
            {{ member.name }}
            <span v-if="isMe" class="badge badge-me">我</span>
        </div>
        <div class="mrow__type">
            <span class="xcard__chip">{{ member.isHost ? '管理員' : member.isVirtual ? '虛擬成員' : '成員' }}</span>
            <span v-if="member.leftAt" class="xcard__chip">已離開</span>
        </div>
        <div class="mrow__actions">
            <div v-if="canManage || canInvite" ref="menuEl" class="xcard__menu">
                <button type="button" class="xcard__kebab" aria-label="更多操作" aria-haspopup="menu" :aria-expanded="menuOpen"
                    @click="menuOpen = !menuOpen">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                    </svg>
                </button>
                <div v-if="menuOpen" class="xcard__popover" role="menu">
                    <button v-if="canInvite" type="button" role="menuitem" class="xcard__item" @click="pick('copy-link')">分享邀請連結</button>
                    <button v-if="canManage && !member.isVirtual" type="button" role="menuitem" class="xcard__item" @click="pick('transfer')">移交管理員</button>
                    <button v-if="canManage" type="button" role="menuitem" class="xcard__item xcard__item--danger" @click="pick('kick')">
                        移除成員
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

defineProps({
    member: { type: Object, required: true },
    isMe: { type: Boolean, default: false },
    canManage: { type: Boolean, default: false },   // 管理員對其他在場真人成員
    canInvite: { type: Boolean, default: false },   // 虛擬成員可分享邀請連結
})
const emit = defineEmits(['transfer', 'kick', 'copy-link'])

const menuOpen = ref(false)
const menuEl = ref(null)
const close = () => { menuOpen.value = false }
const onDown = (e) => { if (!menuEl.value?.contains(e.target)) close() }
const onKey = (e) => { if (e.key === 'Escape') close() }
watch(menuOpen, (v) => {
    const m = v ? 'addEventListener' : 'removeEventListener'
    document[m]('pointerdown', onDown)
    document[m]('keydown', onKey)
})
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDown)
    document.removeEventListener('keydown', onKey)
})
function pick(a) { close(); emit(a) }
</script>
