<template>
    <div class="h-screen overflow-y-auto overflow-x-hidden">

        <!-- 浮動背景 emoji -->
        <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
            <span class="float-emoji text-[56px] top-[3%] left-[3%] [animation-delay:0s]">🍬</span>
            <span class="float-emoji text-[38px] top-[7%] right-[6%] [animation-delay:1.4s]">💝</span>
            <span class="float-emoji text-[34px] top-[20%] left-[8%] [animation-delay:0.7s]">✨</span>
            <span class="float-emoji text-[44px] top-[16%] right-[16%] [animation-delay:2.1s]">🌸</span>
            <span class="float-emoji text-[42px] top-[44%] left-[2%] [animation-delay:1.1s]">💫</span>
            <span class="float-emoji text-[34px] top-[53%] right-[3%] [animation-delay:0.4s]">🎀</span>
            <span class="float-emoji text-[46px] bottom-[20%] left-[6%] [animation-delay:1.7s]">🍭</span>
            <span class="float-emoji text-[40px] bottom-[7%] right-[10%] [animation-delay:0.2s]">💖</span>
        </div>

        <!-- Theme toggle -->
        <button @click="toggleTheme" title="切換主題" class="theme-toggle fixed top-4 right-4 z-50">
            {{ isDark ? '🌙' : '☀️' }}
        </button>

        <!-- 主要內容 -->
        <div class="relative z-10 min-h-screen flex flex-col items-center px-4 pt-10 pb-20 sm:pt-16">

            <!-- Hero -->
            <div class="animate-slide-up text-center mb-10 sm:mb-14">
                <div class="text-6xl sm:text-7xl mb-4 [filter:drop-shadow(0_0_24px_rgba(225,29,72,0.35))]">🍬</div>
                <h1 class="neon-heading gradient-text text-[clamp(32px,7vw,52px)] m-0 mb-2.5 leading-[1.1]">
                    甜甜的小秘密
                </h1>
                <p class="text-[17px] font-normal mb-1 [letter-spacing:0.5px] text-label">
                    互動工具集
                </p>
                <p class="text-sm font-normal text-body">
                    選擇你想玩的工具，和朋友一起開始吧 ✨
                </p>
            </div>

            <!-- 工具卡片格線 -->
            <div class="grid grid-cols-1 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5 w-full max-w-[900px]">
                <ToolCard v-for="tool in tools" :key="tool.id" :tool="tool" />
            </div>

            <!-- Footer -->
            <p class="mt-14 text-[13px] text-body opacity-60">
                甜甜的小秘密 · 持續更新中 🍬
            </p>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ToolCard from '../components/ToolCard.vue'
import { tools } from '../data/tools.js'

const isDark = ref(true)

onMounted(() => {
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
