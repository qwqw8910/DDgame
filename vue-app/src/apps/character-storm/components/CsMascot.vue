<template>
    <img v-if="!failed" :src="src" :alt="alt" class="cs-mascot" :class="`cs-mascot--${mood}`" draggable="false"
        @error="failed = true" />
    <span v-else-if="FALLBACK[mood]" class="cs-mascot cs-mascot--emoji" :class="`cs-mascot--${mood}`" role="img"
        :aria-label="alt">{{ FALLBACK[mood] }}</span>
</template>

<script setup>
// 吉祥物「字囊君」：圖片放在 public/character-storm/mascot-<mood>.png
// 沒有圖片時自動退回 emoji（idle 則不顯示），因此可以先上線、之後再補圖
import { ref, computed, watch } from 'vue'

const props = defineProps({
    mood: { type: String, default: 'idle' }, // idle | happy | sad | trophy
    alt: { type: String, default: '字囊君' },
})

const FALLBACK = { idle: '', happy: '🎉', sad: '😅', trophy: '🏆' }

const failed = ref(false)
const src = computed(() => `${import.meta.env.BASE_URL}character-storm/mascot-${props.mood}.png`)
watch(src, () => { failed.value = false })
</script>
