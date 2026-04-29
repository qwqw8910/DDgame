<template>
    <div style="min-height:100vh; overflow-x:hidden">

        <!-- 浮動背景 emoji -->
        <div style="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0" aria-hidden="true">
            <span class="float-emoji" style="font-size:56px;top:3%;left:3%;animation-delay:0s">🍬</span>
            <span class="float-emoji" style="font-size:38px;top:7%;right:6%;animation-delay:1.4s">💝</span>
            <span class="float-emoji" style="font-size:34px;top:20%;left:8%;animation-delay:0.7s">✨</span>
            <span class="float-emoji" style="font-size:44px;top:16%;right:16%;animation-delay:2.1s">🌸</span>
            <span class="float-emoji" style="font-size:42px;top:44%;left:2%;animation-delay:1.1s">💫</span>
            <span class="float-emoji" style="font-size:34px;top:53%;right:3%;animation-delay:0.4s">🎀</span>
            <span class="float-emoji" style="font-size:46px;bottom:20%;left:6%;animation-delay:1.7s">🍭</span>
            <span class="float-emoji" style="font-size:40px;bottom:7%;right:10%;animation-delay:0.2s">💖</span>
        </div>

        <!-- Theme toggle -->
        <button @click="toggleTheme" title="切換主題" class="theme-toggle"
            style="position:fixed;top:16px;right:16px;z-index:50">
            {{ isDark ? '🌙' : '☀️' }}
        </button>

        <!-- 主要內容 -->
        <div style="position:relative;z-index:10;min-height:100vh;
                display:flex;flex-direction:column;align-items:center;
                padding:60px 16px 80px">

            <!-- Hero -->
            <div class="animate-slide-up" style="text-align:center;margin-bottom:56px">
                <div style="font-size:72px;margin-bottom:16px;filter:drop-shadow(0 0 24px rgba(225,29,72,0.35))">🍬
                </div>
                <h1 class="neon-heading gradient-text"
                    style="font-size:clamp(32px,7vw,52px);margin:0 0 10px;line-height:1.1">
                    甜甜的小秘密
                </h1>
                <p style="font-size:17px;color:var(--label);font-weight:400;margin-bottom:4px;letter-spacing:0.5px">
                    互動工具集
                </p>
                <p style="font-size:14px;color:var(--body);font-weight:400">
                    選擇你想玩的工具，和朋友一起開始吧 ✨
                </p>
            </div>

            <!-- 工具卡片格線 -->
            <div class="portal-grid">
                <ToolCard v-for="tool in tools" :key="tool.id" :tool="tool" />
            </div>

            <!-- Footer -->
            <p style="margin-top:60px;font-size:13px;color:var(--body);opacity:0.6">
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

<style scoped>
.portal-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    width: 100%;
    max-width: 900px;
}

@media (max-width: 480px) {
    .portal-grid {
        grid-template-columns: 1fr;
    }
}
</style>
