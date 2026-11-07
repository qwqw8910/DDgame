<template>
    <div class="h-dvh overflow-x-hidden overflow-y-auto bg-canvas font-text text-ink">
        <div class="mx-auto max-w-[1280px] 2xl:max-w-[1440px] min-[1920px]:max-w-[1600px] px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] sm:px-8 lg:px-12">
            <!-- 首屏重點：只有標題。圖示按鈕和眉標同一列，不另佔一列 -->
            <header class="pb-10 sm:pb-14">
                <div class="flex items-center justify-between gap-4">
                    <p class="m-0 text-base font-medium text-brand-ink">{{ tools.length }} 個小遊戲與小工具</p>
                    <div class="flex shrink-0 items-center gap-2">
                        <div v-if="canInstall" class="relative">
                            <button type="button" :class="iconBtn" aria-label="安裝成 App" title="安裝成 App"
                                :aria-expanded="installEvent ? undefined : String(showIosHint)" @click="onInstall">
                                <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor"
                                    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
                                </svg>
                            </button>
                            <p v-if="showIosHint" role="status"
                                class="absolute top-[calc(100%+8px)] right-0 z-10 m-0 w-64 rounded-tile bg-raised px-4 py-3 text-base leading-relaxed text-ink shadow-(--shadow-tile-hover)">
                                點 Safari 的「分享」→「加入主畫面」即可安裝
                            </p>
                        </div>
                        <button type="button" :class="iconBtn" :aria-label="isDark ? '切換為淺色模式' : '切換為深色模式'"
                            :title="isDark ? '切換為淺色模式' : '切換為深色模式'" @click="toggleTheme">
                            <!-- 顯示「按下去會變成的」模式 -->
                            <svg v-if="isDark" aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none"
                                stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                                <circle cx="12" cy="12" r="4" />
                                <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
                            </svg>
                            <svg v-else aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor"
                                stroke-width="1.8" stroke-linejoin="round">
                                <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
                            </svg>
                        </button>
                    </div>
                </div>
                <h1 class="mt-3 mb-0 font-display text-[clamp(44px,10vw,88px)] leading-[1.08] font-normal tracking-[0.01em] text-ink">
                    甜甜的小秘密
                </h1>
                <p class="mt-5 mb-0 max-w-[26em] text-lg leading-relaxed text-ink-muted sm:text-xl">
                    給朋友與情侶的派對遊戲和生活小工具。<br class="hidden sm:inline" />挑一個，丟連結給大家就能開始。
                </p>
            </header>

            <!-- 上下兩塊：含「多人」的放上面，其餘（單人 / 雙人 / 工具）放下面 -->
            <section v-for="(shelf, s) in shelves" :key="shelf.id" :aria-labelledby="`shelf-${shelf.id}`"
                :class="s > 0 && 'mt-14'">
                <h2 :id="`shelf-${shelf.id}`" class="m-0 mb-5 flex items-baseline gap-2 font-display text-2xl font-normal text-ink">
                    {{ shelf.title }}
                    <span class="text-base tabular-nums text-ink-faint">{{ shelf.tools.length }}</span>
                </h2>
                <ul class="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                    <li v-for="tool in shelf.tools" :key="tool.id">
                        <ToolCard :tool="tool" />
                    </li>
                </ul>
            </section>

            <footer class="mt-16 border-t border-hairline pt-6 text-base text-ink-faint">
                持續更新中，有想玩的歡迎告訴我
            </footer>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ToolCard from '../components/ToolCard.vue'
import { tools } from '../data/tools.js'
import { usePwaInstall } from '@/shared/composables/usePwaInstall.js'
import { warmUpServer } from '@/shared/api/config.js'

// 以 tags 分組：含「多人」的放上面，其餘放下面
const shelves = computed(() => [
    { id: 'party', title: '和朋友一起玩', tools: tools.filter(t => t.tags.includes('多人')) },
    { id: 'small', title: '自己或兩個人', tools: tools.filter(t => !t.tags.includes('多人')) },
].filter(s => s.tools.length > 0))

const iconBtn = 'grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-raised text-ink shadow-(--shadow-tile) transition-[background-color,scale] duration-150 ease-soft hover:bg-fill active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none'

// PWA 安裝：Chromium 直接跳安裝框；iOS Safari 沒有 API，改顯示手動步驟
const { installEvent, canInstall, install } = usePwaInstall()
const showIosHint = ref(false)
function onInstall() {
    if (installEvent.value) install()
    else showIosHint.value = !showIosHint.value
}

const isDark = ref(true)

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
