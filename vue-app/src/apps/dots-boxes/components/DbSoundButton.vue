<template>
    <!-- 房間頂列的音效開關：開＝喇叭加聲波、關＝喇叭加叉；aria-pressed 表示目前是否出聲 -->
    <button type="button" :class="btnClass" :aria-pressed="!isSfxMuted"
        :aria-label="isSfxMuted ? '開啟音效' : '關閉音效'" :title="isSfxMuted ? '開啟音效' : '關閉音效'"
        @click="toggleSfxMute">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" class="size-5 shrink-0">
            <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
            <path v-if="isSfxMuted" d="M16 9.5l5 5M21 9.5l-5 5" />
            <path v-else d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11" />
        </svg>
    </button>
</template>

<script setup>
import { useDotsBoxesSfx } from '../composables/useDotsBoxesSfx.js'

defineProps({ btnClass: { type: String, default: '' } })
const { isSfxMuted, toggleSfxMute } = useDotsBoxesSfx()
</script>
