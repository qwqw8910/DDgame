<template>
    <svg class="cs-icon" :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path v-for="(d, i) in PATHS[name] ?? []" :key="i" :d="d" />
    </svg>
</template>

<script setup>
// 默契字囊團 — 線條圖示（取代 header 上的 emoji 按鈕，各平台顯示一致）
defineProps({
    name: { type: String, required: true },
    size: { type: [Number, String], default: 18 },
})

const PATHS = {
    moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z'],
    sun: ['M12 4V2', 'M12 22v-2', 'M4 12H2', 'M22 12h-2', 'M5.6 5.6 4.2 4.2', 'M19.8 19.8l-1.4-1.4', 'M5.6 18.4l-1.4 1.4', 'M19.8 4.2l-1.4 1.4', 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
    help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6', 'M12 17h.01'],
    volume: ['M11 5 6 9H3v6h3l5 4V5Z', 'M15.5 8.5a5 5 0 0 1 0 7', 'M18.5 5.5a9 9 0 0 1 0 13'],
    mute: ['M11 5 6 9H3v6h3l5 4V5Z', 'M22 9l-6 6', 'M16 9l6 6'],
    link: ['M10 14a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1 1', 'M14 10a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1-1'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    exit: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l-5-5 5-5', 'M5 12h11'],
    restart: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5'],
}
</script>
