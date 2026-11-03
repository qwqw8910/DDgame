<template>
    <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path v-for="d in PATHS[name]" :key="d" :d="d" />
    </svg>
</template>

<script setup>
// 標題列圖示：取代 emoji，各系統長相一致、顏色跟著文字走
defineProps({
    name: { type: String, required: true },
    size: { type: Number, default: 18 },
})

const PATHS = {
    book: ['M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z', 'M4 21V5', 'M9 7h6'],
    help: ['M9.5 9a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8', 'M12 17h.01', 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z'],
    link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
    volume: ['M11 5 6 9H3v6h3l5 4z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
    mute: ['M11 5 6 9H3v6h3l5 4z', 'M16 9l5 6', 'M21 9l-5 6'],
}
</script>
