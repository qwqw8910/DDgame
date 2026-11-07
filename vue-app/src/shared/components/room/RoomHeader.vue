<template>
    <!--
      房間頂列（所有遊戲同一套順序）：
      ← 離開 ｜ 遊戲名 + 房號・進度 ｜ #actions（遊戲專屬按鈕） ｜ 邀請 ｜ #players（玩家面板） ｜ 深淺色
      slot 會拿到 btnClass，遊戲專屬按鈕套用它就和其他按鈕一致。
    -->
    <header class="relative z-40 shrink-0 border-b border-hairline bg-canvas/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div class="mx-auto flex h-16 max-w-3xl items-center gap-1.5 px-2 sm:gap-2 sm:px-4">
            <button type="button" :class="btnClass" aria-label="離開房間" title="離開房間" @click="emit('leave')">
                <RoomIcon name="back" />
            </button>

            <div class="min-w-0 flex-1">
                <p class="m-0 truncate font-display text-lg leading-snug text-ink">{{ title }}</p>
                <p class="m-0 flex min-w-0 items-center gap-1.5 text-base leading-snug text-ink-faint">
                    <!-- 遊戲中手機寬度只顯示進度（房號在邀請按鈕裡拿得到），避免進度被截斷 -->
                    <span :class="progress ? 'hidden sm:contents' : 'contents'">
                        <span class="sr-only">房號</span>
                        <span class="font-mono tracking-[0.15em]">{{ roomId }}</span>
                        <span v-if="progress" aria-hidden="true">·</span>
                    </span>
                    <span v-if="progress" class="truncate">{{ progress }}</span>
                </p>
            </div>

            <div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
                <slot name="actions" :btn-class="btnClass" />
                <button type="button" :class="btnClass" aria-label="複製邀請連結" title="複製邀請連結" @click="emit('invite')">
                    <RoomIcon name="link" />
                </button>
                <slot name="players" :btn-class="btnClass" />
                <button type="button" :class="btnClass" :aria-label="isDark ? '切換為淺色模式' : '切換為深色模式'"
                    :title="isDark ? '切換為淺色模式' : '切換為深色模式'" @click="toggleTheme">
                    <!-- 顯示「按下去會變成的」模式，與首頁一致 -->
                    <RoomIcon :name="isDark ? 'sun' : 'moon'" />
                </button>
            </div>
        </div>
    </header>
</template>

<script setup>
import RoomIcon from './RoomIcon.vue'
import { useTheme } from '@/shared/composables/useTheme.js'

defineProps({
    title: { type: String, required: true },
    roomId: { type: String, default: '' },
    // 進度文字，例如「第 2 / 5 題」；沒有就只顯示房號
    progress: { type: String, default: '' },
})

const emit = defineEmits(['leave', 'invite'])

const { isDark, toggleTheme } = useTheme()

// 44×44 觸控目標；無底色，hover / 按下才出現填色，避免頂列一排框框
const btnClass = 'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-transparent text-ink-muted transition-[background-color,color,scale] duration-150 ease-soft hover:bg-fill hover:text-ink active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none'
</script>
