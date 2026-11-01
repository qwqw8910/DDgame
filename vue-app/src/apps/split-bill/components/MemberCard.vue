<template>
    <article :class="['game-card', 'xcard', { 'xcard--del': member.leftAt }]">
        <div class="xcard__head">
            <div class="min-w-0">
                <div class="xcard__title">
                    {{ member.name }}
                    <span v-if="isMe" class="badge badge-me">我</span>
                    <span v-if="member.isHost" class="badge badge-host">👑 房主</span>
                    <span v-if="member.isVirtual" class="badge badge-waiting">未加入</span>
                    <span v-if="member.leftAt" class="badge">已離開</span>
                </div>
                <div class="xcard__meta">
                    <span v-if="member.leftAt">帳目仍保留；以同名重新加入即可接回</span>
                    <span v-else-if="member.isVirtual">之後用同名加入，就會自動接上這些帳目</span>
                    <span v-else>{{ member.online ? '🟢 在線' : '⚪ 離線' }}</span>
                </div>
            </div>

            <div v-if="canManage" ref="menuEl" class="xcard__menu">
                <button type="button" class="xcard__kebab" aria-label="更多操作" aria-haspopup="menu" :aria-expanded="menuOpen"
                    @click="menuOpen = !menuOpen">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                    </svg>
                </button>
                <div v-if="menuOpen" class="xcard__popover" role="menu">
                    <button type="button" role="menuitem" class="xcard__item" @click="pick('transfer')">移交房主</button>
                    <button type="button" role="menuitem" class="xcard__item xcard__item--danger" @click="pick('kick')">移出帳本</button>
                </div>
            </div>
        </div>
    </article>
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

defineProps({
    member: { type: Object, required: true },
    isMe: { type: Boolean, default: false },
    canManage: { type: Boolean, default: false },   // 房主對其他在場真人成員
})
const emit = defineEmits(['transfer', 'kick'])

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
