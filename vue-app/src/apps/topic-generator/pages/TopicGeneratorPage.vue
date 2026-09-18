<template>
    <div class="min-h-screen overflow-x-hidden">

        <!-- 浮動背景 emoji -->
        <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
            <span class="float-emoji text-[50px] top-[4%] left-[4%] [animation-delay:0s]">💬</span>
            <span class="float-emoji text-[38px] top-[8%] right-[7%] [animation-delay:1.4s]">🎲</span>
            <span class="float-emoji text-[34px] top-[22%] left-[10%] [animation-delay:0.7s]">✨</span>
            <span class="float-emoji text-[44px] top-[18%] right-[18%] [animation-delay:2.1s]">💭</span>
            <span class="float-emoji text-[46px] top-[45%] left-[2%] [animation-delay:1.1s]">🎯</span>
            <span class="float-emoji text-[36px] top-[55%] right-[4%] [animation-delay:0.4s]">🃏</span>
            <span class="float-emoji text-[42px] bottom-[22%] left-[7%] [animation-delay:1.7s]">💡</span>
            <span class="float-emoji text-[48px] bottom-[8%] right-[11%] [animation-delay:0.2s]">🎪</span>
        </div>

        <!-- 返回入口 -->
        <RouterLink to="/"
            class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-[13px] font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-glow">
            ← 甜甜的小秘密
        </RouterLink>

        <!-- 主要內容 -->
        <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 pt-20 pb-14">

            <!-- Hero -->
            <div class="animate-slide-up text-center mb-8">
                <div class="text-6xl mb-3 [filter:drop-shadow(0_0_28px_rgba(236,72,153,0.5))]">💬</div>
                <h1 class="neon-heading text-[clamp(30px,7vw,48px)] m-0 mb-2 leading-[1.1] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]"
                    style="background:linear-gradient(135deg,#EC4899 0%,#A855F7 50%,#6366F1 100%)">
                    話題產生器
                </h1>
                <p class="text-base mb-1 [letter-spacing:0.5px] text-label">不知道說什麼？讓命運幫你開話題 💬</p>
                <p class="text-[13px] text-body">選分類，點卡片，隨機抽出一個話題</p>
            </div>

            <!-- 主卡片 -->
            <div class="w-full max-w-[480px] rounded-[20px] p-7 backdrop-blur-md bg-card border border-border">

                <!-- 分類選擇 -->
                <div class="mb-6">
                    <p class="text-xs font-semibold [letter-spacing:1.5px] uppercase mb-3 text-label">選擇分類</p>
                    <div class="flex flex-wrap gap-2">
                        <button v-for="cat in categories" :key="cat.id" @click="selectCategory(cat)"
                            class="px-3.5 py-[7px] rounded-full text-[13px] font-medium border cursor-pointer transition-all duration-200 flex items-center gap-1.5"
                            :class="selectedCategory.id === cat.id
                                ? '[background:linear-gradient(135deg,rgba(236,72,153,0.15),rgba(168,85,247,0.15))] [border-color:rgba(236,72,153,0.5)] [color:#F9A8D4]'
                                : 'bg-transparent border-border text-body'">
                            {{ cat.emoji }} {{ cat.label }}
                        </button>
                    </div>
                </div>

                <!-- 話題卡片（可點擊） -->
                <div @click="toggleSpin"
                    class="rounded-2xl text-center cursor-pointer transition-all duration-200 select-none min-h-[140px] flex items-center justify-center relative overflow-hidden py-9 px-6"
                    :class="isSpinning
                        ? '[background:linear-gradient(135deg,rgba(236,72,153,0.12),rgba(168,85,247,0.12))] [border:1px_solid_rgba(236,72,153,0.45)] [box-shadow:0_0_24px_rgba(236,72,153,0.2)]'
                        : '[background:linear-gradient(135deg,rgba(236,72,153,0.07),rgba(168,85,247,0.07))] [border:1px_solid_rgba(236,72,153,0.25)]'">

                    <!-- 掃描光線（轉動中） -->
                    <div v-if="isSpinning"
                        class="absolute left-0 right-0 top-1/2 h-0.5 -mt-px pointer-events-none [background:linear-gradient(90deg,transparent,rgba(236,72,153,0.6),transparent)]">
                    </div>

                    <p :class="[isSpinning ? 'topic-text-spin' : '']"
                        class="text-[clamp(15px,4vw,20px)] font-semibold leading-relaxed [word-break:break-word] whitespace-pre-line m-0 relative z-[1] text-heading">
                        {{ displayText }}
                    </p>
                </div>

                <!-- 操作按鈕列 -->
                <div class="flex gap-3 mt-5">
                    <!-- 停止 / 再抽一次 -->
                    <button @click="pickOne"
                        class="flex-1 p-3.5 rounded-xl border-0 cursor-pointer text-[15px] font-semibold [letter-spacing:0.5px] text-white transition-[transform,box-shadow] duration-200 [background:linear-gradient(135deg,#EC4899,#A855F7)] [box-shadow:0_4px_20px_rgba(236,72,153,0.35)] hover:-translate-y-0.5 hover:[box-shadow:0_8px_28px_rgba(236,72,153,0.45)]">
                        🎲 再抽一次
                    </button>

                    <!-- 點卡片提示 -->
                    <button @click="toggleSpin"
                        class="px-4.5 py-3.5 rounded-xl cursor-pointer text-sm font-medium border transition-colors duration-200 border-border bg-subtle text-label hover:border-border-glow hover:text-heading">
                        {{ isSpinning ? '⏹ 停止' : '▶ 轉動' }}
                    </button>
                </div>

                <!-- 題庫數量提示 -->
                <p class="text-center text-xs mt-4 opacity-70 text-body">
                    {{ selectedCategory.emoji }} {{ selectedCategory.label }} —
                    共 {{ selectedCategory.items.length }} 個話題
                </p>
            </div>

            <!-- Footer -->
            <p class="mt-12 text-[13px] opacity-50 text-body">
                甜甜的小秘密 · 話題產生器 💬
            </p>
        </div>
    </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue'
import { categories } from '../data/topics.js'

// ── 狀態 ────────────────────────────────────────────────
const selectedCategory = ref(categories[0])
const displayText = ref('點我 / 點「轉動」開始抽題！')
const isSpinning = ref(false)
let spinTimer = null

// ── 方法 ────────────────────────────────────────────────
function randomItem() {
    const items = selectedCategory.value.items
    return items[Math.floor(Math.random() * items.length)]
}

function selectCategory(cat) {
    selectedCategory.value = cat
    stopSpin()
    displayText.value = '點我 / 點「轉動」開始抽題！'
}

function toggleSpin() {
    if (isSpinning.value) {
        stopSpin()
    } else {
        startSpin()
    }
}

function startSpin() {
    isSpinning.value = true
    spinTimer = setInterval(() => {
        displayText.value = randomItem()
    }, 60)
}

function stopSpin() {
    if (spinTimer) {
        clearInterval(spinTimer)
        spinTimer = null
    }
    isSpinning.value = false
}

function pickOne() {
    stopSpin()
    displayText.value = randomItem()
}

// 離開頁面時清除 timer
onUnmounted(() => stopSpin())
</script>
