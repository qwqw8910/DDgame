<template>
    <!-- 進不了房間（房號不存在、房間已滿…）或被踢出時的遮罩，只有一個出口：回到遊戲入口 -->
    <div class="fixed inset-0 z-50 grid place-items-center bg-canvas/80 p-4 backdrop-blur-sm">
        <div class="w-full max-w-sm rounded-tile bg-raised p-6 text-center shadow-(--shadow-tile-hover)" role="alertdialog"
            aria-modal="true" aria-labelledby="room-blocked-title" aria-describedby="room-blocked-msg">
            <h2 id="room-blocked-title" class="m-0 font-display text-2xl font-normal text-ink">{{ kicked ? '你已離開房間' : '無法進入房間' }}</h2>
            <p id="room-blocked-msg" class="m-0 mt-2 text-base text-ink-muted">{{ message }}</p>
            <button ref="btnRef" type="button"
                class="mt-5 flex h-12 w-full cursor-pointer items-center justify-center rounded-full border-0 bg-brand text-lg font-medium text-on-brand transition-[scale] duration-150 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
                @click="emit('back')">
                回到入口
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'

defineProps({
    // 被踢出 = true；進不去 = false（標題不同）
    kicked: { type: Boolean, default: false },
    message: { type: String, default: '' },
})

const emit = defineEmits(['back'])

const btnRef = ref(null)
onMounted(() => nextTick(() => btnRef.value?.focus()))
</script>
