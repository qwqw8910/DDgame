<template>
    <!-- 遊戲進行中才進房的觀戰者提示；可以轉成玩家時給一個加入按鈕 -->
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-tile bg-raised px-4 py-3 shadow-(--shadow-tile)" role="status">
        <span class="flex items-center gap-2 text-base text-ink-muted">
            <RoomIcon name="eye" />
            {{ message }}
        </span>
        <button v-if="canJoin" type="button"
            class="inline-flex h-11 cursor-pointer items-center rounded-full border-0 bg-brand px-5 text-base font-medium text-on-brand transition-[scale] duration-150 ease-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
            @click="emit('join')">
            加入房間
        </button>
    </div>
</template>

<script setup>
import RoomIcon from './RoomIcon.vue'

defineProps({
    canJoin: { type: Boolean, default: false },
    message: { type: String, default: '你正在觀戰，這局結束後可以加入。' },
})

const emit = defineEmits(['join'])
</script>
