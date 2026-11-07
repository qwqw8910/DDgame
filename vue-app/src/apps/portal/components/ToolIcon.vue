<template>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true" class="size-full" v-html="PATHS[id] ?? PATHS.fallback" />
</template>

<script setup>
// 首頁卡片專用線稿圖示：靜態常數字串，不含使用者輸入；顏色吃 currentColor
defineProps({ id: { type: String, required: true } })

const PATHS = {
    'know-me': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    'dinner-picker': '<path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10"/><path d="M17 21V3c-2.5 1.5-3.5 4-3.5 7 0 1.5 1 2.5 3.5 2.5"/>',
    'topic-generator': '<path d="M4 5h16v11H10l-4 4v-4H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
    'character-storm': '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><circle cx="17" cy="17" r="3.5" fill="currentColor" fill-opacity=".25"/>',
    'mountain-lodge': '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/><path d="M16.5 7V4.5h2V9"/>',
    clocktower: '<path d="M8 21V8l4-5 4 5v13"/><circle cx="12" cy="11" r="2.4"/><path d="M12 9.8v1.4l.9.6"/><path d="M6 21h12"/>',
    'gem-td': '<path d="M6 3h12l3.5 6L12 21 2.5 9z"/><path d="M2.5 9h19M9 3l-2 6 5 12M15 3l2 6-5 12"/>',
    'dinner-invite': '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
    'gender-score': '<circle cx="9" cy="9" r="4.5"/><path d="M9 13.5V21M6 17.5h6"/><path d="M14 4h6v6M20 4l-4.5 4.5"/>',
    'story-canvas': '<circle cx="5.5" cy="6" r="2.5"/><circle cx="18.5" cy="8" r="2.5"/><circle cx="11" cy="18" r="2.5"/><path d="M8 6.6l8 1M7 8l3 8M16.8 10l-4.4 6.2"/>',
    ladder: '<path d="M7 3v18M17 3v18M7 7h10M7 12h10M7 17h10"/>',
    'split-bill': '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    'same-word': '<circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/>',
    'webp-compress': '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M9 9 5.5 5.5M9 9V6M9 9H6M15 15l3.5 3.5M15 15v3M15 15h3"/>',
    fallback: '<path d="m12 3 2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
}
</script>
