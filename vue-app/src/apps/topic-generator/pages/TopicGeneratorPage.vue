<template>
    <div style="min-height:100vh;overflow-x:hidden">

        <!-- 浮動背景 emoji -->
        <div style="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0" aria-hidden="true">
            <span class="float-emoji" style="font-size:50px;top:4%;left:4%;animation-delay:0s">💬</span>
            <span class="float-emoji" style="font-size:38px;top:8%;right:7%;animation-delay:1.4s">🎲</span>
            <span class="float-emoji" style="font-size:34px;top:22%;left:10%;animation-delay:0.7s">✨</span>
            <span class="float-emoji" style="font-size:44px;top:18%;right:18%;animation-delay:2.1s">💭</span>
            <span class="float-emoji" style="font-size:46px;top:45%;left:2%;animation-delay:1.1s">🎯</span>
            <span class="float-emoji" style="font-size:36px;top:55%;right:4%;animation-delay:0.4s">🃏</span>
            <span class="float-emoji" style="font-size:42px;bottom:22%;left:7%;animation-delay:1.7s">💡</span>
            <span class="float-emoji" style="font-size:48px;bottom:8%;right:11%;animation-delay:0.2s">🎪</span>
        </div>

        <!-- 返回入口 -->
        <RouterLink to="/" style="position:fixed;top:16px;left:16px;z-index:50;
                   display:flex;align-items:center;gap:6px;
                   font-size:13px;font-weight:500;color:var(--body);
                   text-decoration:none;padding:6px 12px;
                   border-radius:8px;border:1px solid var(--border);
                   background:var(--bg-card);backdrop-filter:blur(8px);
                   transition:color 0.15s,border-color 0.15s"
            @mouseenter="e => { e.currentTarget.style.color = 'var(--heading)'; e.currentTarget.style.borderColor = 'var(--border-glow)' }"
            @mouseleave="e => { e.currentTarget.style.color = 'var(--body)'; e.currentTarget.style.borderColor = 'var(--border)' }">
            ← 甜甜的小秘密
        </RouterLink>

        <!-- 主要內容 -->
        <div style="position:relative;z-index:10;min-height:100vh;
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                padding:80px 16px 60px">

            <!-- Hero -->
            <div class="animate-slide-up" style="text-align:center;margin-bottom:32px">
                <div style="font-size:64px;margin-bottom:12px;
                        filter:drop-shadow(0 0 28px rgba(236,72,153,0.5))">💬</div>
                <h1 class="neon-heading" style="font-size:clamp(30px,7vw,48px);margin:0 0 8px;line-height:1.1;
                        background:linear-gradient(135deg,#EC4899 0%,#A855F7 50%,#6366F1 100%);
                        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">
                    話題產生器
                </h1>
                <p style="font-size:16px;color:var(--label);margin-bottom:4px;letter-spacing:0.5px">
                    不知道說什麼？讓命運幫你開話題 💬</p>
                <p style="font-size:13px;color:var(--body)">選分類，點卡片，隨機抽出一個話題</p>
            </div>

            <!-- 主卡片 -->
            <div style="width:100%;max-width:480px;
                    background:var(--bg-card);border:1px solid var(--border);
                    border-radius:20px;padding:32px 28px;backdrop-filter:blur(12px);
                    -webkit-backdrop-filter:blur(12px)">

                <!-- 分類選擇 -->
                <div style="margin-bottom:24px">
                    <p style="font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;
                            color:var(--label);margin-bottom:12px">選擇分類</p>
                    <div style="display:flex;flex-wrap:wrap;gap:8px">
                        <button v-for="cat in categories" :key="cat.id" @click="selectCategory(cat)" style="padding:7px 14px;border-radius:20px;font-size:13px;font-weight:500;
                                   border:1px solid;cursor:pointer;transition:all 0.2s;
                                   display:flex;align-items:center;gap:5px"
                            :style="selectedCategory.id === cat.id ? activeCatStyle : inactiveCatStyle">
                            {{ cat.emoji }} {{ cat.label }}
                        </button>
                    </div>
                </div>

                <!-- 話題卡片（可點擊） -->
                <div @click="toggleSpin" style="border-radius:16px;padding:36px 24px;text-align:center;
                           cursor:pointer;transition:all 0.2s;user-select:none;
                           min-height:140px;display:flex;align-items:center;justify-content:center;
                           position:relative;overflow:hidden;" :style="isSpinning ? spinningCardStyle : idleCardStyle">

                    <!-- 掃描光線（轉動中） -->
                    <div v-if="isSpinning" style="position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;
                               background:linear-gradient(90deg,transparent,rgba(236,72,153,0.6),transparent);
                               pointer-events:none"></div>

                    <p :class="isSpinning ? 'topic-text-spin' : ''" style="font-size:clamp(15px,4vw,20px);font-weight:600;
                               color:var(--heading);line-height:1.6;word-break:break-word;
                               white-space:pre-line;margin:0;position:relative;z-index:1">
                        {{ displayText }}
                    </p>
                </div>

                <!-- 操作按鈕列 -->
                <div style="display:flex;gap:12px;margin-top:20px">
                    <!-- 停止 / 再抽一次 -->
                    <button @click="pickOne" style="flex:1;padding:14px;border-radius:12px;border:none;cursor:pointer;
                               font-size:15px;font-weight:600;letter-spacing:0.5px;
                               background:linear-gradient(135deg,#EC4899,#A855F7);
                               color:#fff;transition:transform 0.2s,box-shadow 0.2s;
                               box-shadow:0 4px 20px rgba(236,72,153,0.35)"
                        @mouseenter="e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(236,72,153,0.45)' }"
                        @mouseleave="e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(236,72,153,0.35)' }">
                        🎲 再抽一次
                    </button>

                    <!-- 點卡片提示 -->
                    <button @click="toggleSpin" style="padding:14px 18px;border-radius:12px;cursor:pointer;
                               font-size:14px;font-weight:500;
                               border:1px solid var(--border);
                               background:var(--bg-subtle);color:var(--label);
                               transition:all 0.2s"
                        @mouseenter="e => { e.currentTarget.style.borderColor = 'var(--border-glow)'; e.currentTarget.style.color = 'var(--heading)' }"
                        @mouseleave="e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--label)' }">
                        {{ isSpinning ? '⏹ 停止' : '▶ 轉動' }}
                    </button>
                </div>

                <!-- 題庫數量提示 -->
                <p style="text-align:center;font-size:12px;color:var(--body);
                          margin-top:16px;opacity:0.7">
                    {{ selectedCategory.emoji }} {{ selectedCategory.label }} —
                    共 {{ selectedCategory.items.length }} 個話題
                </p>
            </div>

            <!-- Footer -->
            <p style="margin-top:48px;font-size:13px;color:var(--body);opacity:0.5">
                甜甜的小秘密 · 話題產生器 💬
            </p>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { categories } from '../data/topics.js'

// ── 狀態 ────────────────────────────────────────────────
const selectedCategory = ref(categories[0])
const displayText = ref('點我 / 點「轉動」開始抽題！')
const isSpinning = ref(false)
let spinTimer = null

// ── 樣式 ────────────────────────────────────────────────
const activeCatStyle = {
    background: 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(168,85,247,0.15))',
    borderColor: 'rgba(236,72,153,0.5)',
    color: '#F9A8D4',
}
const inactiveCatStyle = {
    background: 'transparent',
    borderColor: 'var(--border)',
    color: 'var(--body)',
}
const idleCardStyle = {
    background: 'linear-gradient(135deg,rgba(236,72,153,0.07),rgba(168,85,247,0.07))',
    border: '1px solid rgba(236,72,153,0.25)',
    boxShadow: '0 0 0 rgba(236,72,153,0)',
}
const spinningCardStyle = {
    background: 'linear-gradient(135deg,rgba(236,72,153,0.12),rgba(168,85,247,0.12))',
    border: '1px solid rgba(236,72,153,0.45)',
    boxShadow: '0 0 24px rgba(236,72,153,0.2)',
}

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

<style scoped>
.topic-text-spin {
    animation: topic-flicker 0.06s infinite;
}

@keyframes topic-flicker {
    0% {
        opacity: 1;
    }

    50% {
        opacity: 0.7;
    }

    100% {
        opacity: 1;
    }
}
</style>
