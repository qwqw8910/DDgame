<template>
    <!-- 直接點邀請連結進來、還沒有暱稱時的遮罩。錯誤顯示在欄位下方，不用 toast -->
    <div class="fixed inset-0 z-50 grid place-items-center bg-canvas/80 p-4 backdrop-blur-sm">
        <form class="w-full max-w-sm rounded-tile bg-raised p-6 shadow-(--shadow-tile-hover)" novalidate
            aria-labelledby="nick-gate-title" @submit.prevent="submit">
            <h2 id="nick-gate-title" class="m-0 font-display text-2xl font-normal text-ink">加入{{ title ? `「${title}」` : '房間' }}</h2>
            <p v-if="roomId" class="m-0 mt-1 text-base text-ink-muted">房號 <span class="font-mono tracking-[0.15em]">{{ roomId }}</span></p>
            <p v-if="hint" class="m-0 mt-3 text-base text-ink-muted">{{ hint }}</p>

            <label for="nick-gate-input" class="mt-5 block text-base text-ink">你的暱稱</label>
            <input id="nick-gate-input" ref="inputRef" v-model="nickname" type="text" maxlength="12" autocomplete="nickname"
                enterkeyhint="go" :aria-invalid="error ? 'true' : undefined" :aria-describedby="error ? 'nick-gate-error' : undefined"
                class="mt-2 h-12 w-full rounded-inset border-0 bg-fill px-4 text-lg text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)] outline-none placeholder:text-ink-faint focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)] aria-invalid:shadow-[inset_0_0_0_2px_var(--color-brand)]"
                placeholder="最多 12 個字" @input="error = ''" />
            <p v-if="error" id="nick-gate-error" class="m-0 mt-2 text-base text-brand-ink" role="alert">{{ error }}</p>

            <button type="submit"
                class="mt-5 flex h-12 w-full cursor-pointer items-center justify-center rounded-full border-0 bg-brand text-lg font-medium text-on-brand transition-[scale] duration-150 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none">
                加入房間
            </button>
        </form>
    </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
    title: { type: String, default: '' },
    roomId: { type: String, default: '' },
    // 欄位上方的補充說明（例如「請使用和 Discord 相同的暱稱」）
    hint: { type: String, default: '' },
    // 伺服器退回的錯誤（例如暱稱重複），顯示在欄位下方
    serverError: { type: String, default: '' },
})

const emit = defineEmits(['submit'])

const nickname = ref('')
const error = ref(props.serverError)
const inputRef = ref(null)

watch(() => props.serverError, (m) => {
    if (!m) return
    error.value = m
    nextTick(() => inputRef.value?.focus())
})

onMounted(() => nextTick(() => inputRef.value?.focus()))

function submit() {
    const value = nickname.value.trim()
    if (!value) {
        error.value = '請輸入暱稱'
        inputRef.value?.focus()
        return
    }
    emit('submit', value)
}
</script>
