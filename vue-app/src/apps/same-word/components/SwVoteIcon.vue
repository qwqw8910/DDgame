<template>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round" class="size-5 shrink-0">
        <template v-if="name === 'up'">
            <path d="M7 10v11" />
            <path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.8a2 2 0 0 0 1.8-1.1L12 2a3.1 3.1 0 0 1 3 3.9Z" />
        </template>
        <!-- 大便：三層堆疊 -->
        <template v-else-if="name === 'poop'">
            <path d="M11 6.2c-.2-1.6.8-2.8 2.6-3.2" />
            <path d="M9.6 10a2 2 0 0 1 .9-3.8h3a2 2 0 0 1 .9 3.8" />
            <path d="M7.4 14.6a2.3 2.3 0 0 1 .9-4.6h7.4a2.3 2.3 0 0 1 .9 4.6" />
            <path d="M6.5 14.6h11a2.7 2.7 0 0 1 0 5.4h-11a2.7 2.7 0 0 1 0-5.4Z" />
        </template>
        <!-- 閃電 -->
        <path v-else-if="name === 'bolt'" d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        <!-- 卡住：沙漏 -->
        <template v-else-if="name === 'stuck'">
            <path d="M6 2h12M6 22h12" />
            <path d="M7 2v3.5a5 5 0 0 0 2.5 4.3L12 11.5l2.5-1.7A5 5 0 0 0 17 5.5V2" />
            <path d="M7 22v-3.5a5 5 0 0 1 2.5-4.3L12 12.5l2.5 1.7a5 5 0 0 1 2.5 4.3V22" />
        </template>
        <!-- 複製 -->
        <template v-else-if="name === 'copy'">
            <rect x="9" y="9" width="12" height="12" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </template>
    </svg>
</template>

<script setup>
defineProps({ name: { type: String, required: true } })
</script>
