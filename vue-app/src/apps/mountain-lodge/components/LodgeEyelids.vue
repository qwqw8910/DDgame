<template>
    <!-- 眼皮轉場：階段切換時全螢幕兩片眼皮闔上再睜開，內容在闔眼時換場 -->
    <div v-if="active" class="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden="true">
        <div class="lodge-lid-top absolute inset-x-0 top-0 h-[52%] bg-[#05080a] shadow-[0_10px_40px_rgba(0,0,0,0.9)]"></div>
        <div class="lodge-lid-bottom absolute inset-x-0 bottom-0 h-[52%] bg-[#05080a] shadow-[0_-10px_40px_rgba(0,0,0,0.9)]"
            @animationend="active = false"></div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
    playKey: { type: Number, default: 0 }, // 每次遞增就播放一次
})
const active = ref(false)

watch(() => props.playKey, async () => {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    active.value = false
    await Promise.resolve()
    active.value = true
})
</script>
