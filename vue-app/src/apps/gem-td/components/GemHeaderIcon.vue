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
    // 合成表狀態：已有／放完才能用／缺少
    check: ['M5 12.5l4.5 4.5L19 7.5'],
    pending: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
    cross: ['M6 6l12 12', 'M18 6 6 18'],
    close: ['M6 6l12 12', 'M18 6 6 18'],
    grip: ['M9 6h.01', 'M15 6h.01', 'M9 12h.01', 'M15 12h.01', 'M9 18h.01', 'M15 18h.01'],
    chevron: ['M6 9l6 6 6-6'],
    more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
    flag: ['M5 21V4', 'M5 4h11l-2 4 2 4H5'],
    layout: ['M4 4h16v16H4z', 'M9 4v16', 'M15 4v16'],
    pause: ['M9 5v14', 'M15 5v14'],
    play: ['M7 4.5v15l12-7.5z'],
    speed: ['M4 6l7 6-7 6z', 'M13 6l7 6-7 6z'],
    // 右側圖示列：升品質、研究、許願、補血
    quality: ['M12 19V6', 'M6 12l6-6 6 6', 'M6 21h12'],
    research: ['M9 3h6', 'M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3', 'M7.5 15h9'],
    wish: ['M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z'],
    life: ['M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z'],
    exit: ['M15 4h4v16h-4', 'M10 8l-4 4 4 4', 'M6 12h10'],
}
</script>
