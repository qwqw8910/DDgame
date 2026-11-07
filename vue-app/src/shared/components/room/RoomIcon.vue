<template>
    <!-- 房間外殼用的線稿圖示（與首頁 ToolIcon 同風格：24 格、1.8 線寬、圓角端點）。純裝飾，語意由按鈕的 aria-label 提供 -->
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" class="size-5 shrink-0">
        <path v-for="(d, i) in PATHS[name]" :key="i" :d="d" />
    </svg>
</template>

<script setup>
defineProps({
    name: { type: String, required: true },
})

const PATHS = {
    back: ['M15 18l-6-6 6-6'],
    link: [
        'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1',
        'M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
    ],
    users: [
        'M12.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',
        'M3 19.5c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5',
        'M15.5 4.6a3.5 3.5 0 0 1 0 6.8',
        'M18 14c1.8.7 3 2.6 3 5.5',
    ],
    sun: [
        'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
        'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
    ],
    moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
    close: ['M6 6l12 12M18 6 6 18'],
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    circle: ['M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0'],
    book: [
        'M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v13a1.5 1.5 0 0 0-1.5-1.5H5.5A1.5 1.5 0 0 1 4 16z',
        'M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v13a1.5 1.5 0 0 1 1.5-1.5h5a1.5 1.5 0 0 0 1.5-1.5z',
    ],
    crown: ['M4 18h16', 'M4 18 3 7.5l5 3.5 4-6 4 6 5-3.5L20 18'],
    eye: [
        'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z',
        'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    ],
}
</script>
