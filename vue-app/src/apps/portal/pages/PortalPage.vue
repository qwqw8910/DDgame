<template>
    <div class="portal h-screen overflow-y-auto overflow-x-hidden" :class="{ 'portal--light': !isDark }">
        <div class="fixed top-4 right-4 z-50 flex items-center gap-2">
            <PwaInstallButton :button-class="iconBtn"
                hint-class="fixed top-[68px] right-4 z-50 max-w-[16rem] rounded-xl border border-[color-mix(in_srgb,var(--p-ink)_25%,transparent)] bg-(--p-surface) px-4 py-3 text-sm text-(--p-ink)" />
            <button @click="toggleTheme" :title="isDark ? '切換為亮色' : '切換為暗色'" aria-label="切換主題" :class="iconBtn">
                {{ isDark ? '🌙' : '☀️' }}
            </button>
        </div>

        <div class="mx-auto max-w-[960px] px-4 pt-14 pb-[72px] sm:px-8 sm:pt-[88px] sm:pb-24">
            <!-- Hero：靠左，襯線粗體標題，視覺重心只放標題旁的糖果 -->
            <header class="mb-14">
                <svg class="mb-3.5 h-auto w-24 origin-left -rotate-12 animate-[candy-in_.7s_cubic-bezier(.3,1.4,.5,1)_both] motion-reduce:animate-none"
                    viewBox="0 0 120 64" aria-hidden="true">
                    <path d="M4 10 L34 32 L4 54 Z" fill="var(--p-berry)" />
                    <path d="M116 10 L86 32 L116 54 Z" fill="var(--p-berry)" />
                    <ellipse cx="60" cy="32" rx="34" ry="26" fill="var(--p-berry)" />
                    <path d="M42 12 Q56 32 42 52 M60 8 Q74 32 60 56" stroke="var(--p-paper)" stroke-width="7"
                        stroke-linecap="round" fill="none" opacity=".85" />
                </svg>
                <h1 class="m-0 font-serif-tc text-[clamp(40px,9vw,72px)] font-black leading-[1.1] tracking-[.02em] text-(--p-ink)">
                    甜甜的小秘密
                </h1>
                <p class="mt-[18px] mb-0 max-w-[30em] text-lg leading-[1.7] text-(--p-ink-soft)">
                    {{ tools.length }} 個給朋友與情侶的小遊戲和小工具。<br class="hidden sm:inline" />
                    挑一個，丟連結給大家就能開始。
                </p>
            </header>

            <!-- 多人 -->
            <section class="mb-12" aria-labelledby="shelf-party">
                <h2 id="shelf-party" class="m-0 mb-[18px] font-serif-tc text-2xl font-bold text-(--p-ink)">和朋友一起玩</h2>
                <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <ToolCard v-for="(tool, i) in partyTools" :key="tool.id" :tool="tool" :style="{ '--i': i }" />
                </div>
            </section>

            <!-- 單人 / 雙人 -->
            <section class="mb-12" aria-labelledby="shelf-small">
                <h2 id="shelf-small" class="m-0 mb-[18px] font-serif-tc text-2xl font-bold text-(--p-ink)">自己或兩個人</h2>
                <div class="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                    <ToolCard v-for="(tool, i) in smallTools" :key="tool.id" :tool="tool" wide
                        :style="{ '--i': partyTools.length + i }" />
                </div>
            </section>

            <footer class="mt-16 text-base text-(--p-ink-soft) opacity-75">持續更新中，有想玩的歡迎告訴我</footer>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ToolCard from '../components/ToolCard.vue'
import { tools } from '../data/tools.js'
import PwaInstallButton from '@/shared/components/PwaInstallButton.vue'
import { warmUpServer } from '@/shared/api/config.js'

const isDark = ref(true)

const iconBtn = 'grid size-11 cursor-pointer place-items-center rounded-full border-[1.5px] border-[color-mix(in_srgb,var(--p-ink)_25%,transparent)] bg-(--p-surface) text-(--p-ink) hover:border-(--p-berry) focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-(--p-berry)'

// 以 tags 分組：含「多人」的放上方大卡片，其餘放下方橫列
const partyTools = computed(() => tools.filter(t => t.tags.includes('多人')))
const smallTools = computed(() => tools.filter(t => !t.tags.includes('多人')))

onMounted(() => {
    warmUpServer()
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'
})

function toggleTheme() {
    const html = document.documentElement
    const isLight = html.getAttribute('data-theme') === 'light'
    const next = isLight ? 'mygame' : 'light'
    html.setAttribute('data-theme', next)
    localStorage.setItem('theme', next === 'light' ? 'light' : 'dark')
    isDark.value = next !== 'light'
}
</script>
