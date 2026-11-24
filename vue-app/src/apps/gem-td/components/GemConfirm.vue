<template>
    <!-- 遊戲內的確認視窗：取代瀏覽器的 confirm()。按鈕寫成動作本身（例：離開／繼續玩），不用「確定／取消」 -->
    <div v-if="dialog" class="overlay gt-modal" @click.self="$emit('cancel')" @keydown.esc.stop="$emit('cancel')">
        <div class="flex w-full max-w-[360px] flex-col gap-3 rounded-[12px] border border-(--gt-line) bg-(--gt-surface) p-5 text-(--gt-text)" role="alertdialog" aria-modal="true"
            aria-labelledby="gt-confirm-title" aria-describedby="gt-confirm-text">
            <h2 id="gt-confirm-title" class="m-0 font-sans text-xl font-bold text-(--gt-ink)">{{ dialog.title }}</h2>
            <p id="gt-confirm-text" class="m-0 leading-snug">{{ dialog.text }}</p>
            <div class="mt-1 flex gap-2">
                <button ref="cancelEl" class="gt-btn min-w-0 flex-1" @click="$emit('cancel')">{{ dialog.cancelText || '繼續玩' }}</button>
                <button class="gt-btn min-w-0 flex-1" :class="dialog.danger ? 'gt-btn--danger' : 'gt-btn--lamp'" @click="$emit('confirm')">{{ dialog.confirmText }}</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
    // { title, text, confirmText, cancelText?, danger? }；null 就是沒有視窗
    dialog: { type: Object, default: null },
})
defineEmits(['confirm', 'cancel'])

// 預設把焦點放在安全的那顆（繼續玩），鍵盤使用者按 Enter 不會誤離開
const cancelEl = ref(null)
watch(() => props.dialog, (d) => { if (d) nextTick(() => cancelEl.value?.focus()) })
</script>
