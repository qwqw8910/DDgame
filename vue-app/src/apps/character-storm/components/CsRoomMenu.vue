<template>
    <div ref="rootRef" class="relative">
        <button class="header-icon-btn" title="房間選單" aria-label="房間選單" aria-haspopup="menu"
            :aria-expanded="open" @click="open = !open">
            <CsIcon name="more" />
        </button>
        <div v-if="open" role="menu" class="cs-room-menu">
            <button role="menuitem" class="cs-room-menu__item" @click="pick('copy-link')">
                <CsIcon name="link" :size="16" /> 複製邀請連結
            </button>
            <button v-if="isHost && inGame" role="menuitem" class="cs-room-menu__item" @click="pick('restart')">
                <CsIcon name="restart" :size="16" /> 重新一局
            </button>
            <button role="menuitem" class="cs-room-menu__item cs-room-menu__item--danger" @click="pick('exit')">
                <CsIcon name="exit" :size="16" /> 退出房間
            </button>
        </div>
    </div>
</template>

<script setup>
// 默契字囊團 — 房間選單：不常用、具破壞性的操作（退出／重新一局）收在這裡，不佔遊戲畫面
import { onBeforeUnmount, onMounted, ref } from 'vue'
import CsIcon from './CsIcon.vue'

defineProps({
    isHost: { type: Boolean, default: false },
    inGame: { type: Boolean, default: false },
})
const emit = defineEmits(['copy-link', 'restart', 'exit'])

const open = ref(false)
const rootRef = ref(null)

function pick(action) {
    open.value = false
    emit(action)
}

function onOutside(e) {
    if (open.value && rootRef.value && !rootRef.value.contains(e.target)) open.value = false
}
function onKey(e) { if (e.key === 'Escape') open.value = false }
onMounted(() => {
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('keydown', onKey)
})
</script>
