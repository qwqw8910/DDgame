<template>
    <div class="min-h-screen overflow-x-hidden">

        <!-- 浮動背景食物 emoji -->
        <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
            <span class="float-emoji text-[52px] top-[4%] left-[4%] [animation-delay:0s]">🍜</span>
            <span class="float-emoji text-[40px] top-[8%] right-[7%] [animation-delay:1.4s]">🍣</span>
            <span class="float-emoji text-4xl top-[22%] left-[10%] [animation-delay:0.7s]">🍕</span>
            <span class="float-emoji text-[44px] top-[18%] right-[18%] [animation-delay:2.1s]">🍔</span>
            <span class="float-emoji text-[48px] top-[45%] left-[2%] [animation-delay:1.1s]">🍱</span>
            <span class="float-emoji text-4xl top-[55%] right-[4%] [animation-delay:0.4s]">🥢</span>
            <span class="float-emoji text-[44px] bottom-[22%] left-[7%] [animation-delay:1.7s]">🍛</span>
            <span class="float-emoji text-[50px] bottom-[8%] right-[11%] [animation-delay:0.2s]">🎰</span>
        </div>

        <!-- 返回入口 -->
        <RouterLink to="/"
            class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-[13px] font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-glow">
            ← 甜甜的小秘密
        </RouterLink>

        <!-- 主要內容 -->
        <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 pt-20 pb-[60px]">

            <!-- Hero -->
            <div class="animate-slide-up text-center mb-8">
                <div class="text-6xl mb-3 [filter:drop-shadow(0_0_28px_rgba(251,191,36,0.5))]">🎰</div>
                <h1 class="neon-heading text-[clamp(30px,7vw,48px)] m-0 mb-2 leading-[1.1] bg-clip-text text-transparent [-webkit-text-fill-color:transparent]"
                    style="background:linear-gradient(135deg,#FBBF24 0%,#F97316 50%,#EF4444 100%)">
                    今晚吃什麼
                </h1>
                <p class="text-base mb-1 [letter-spacing:0.5px] text-label">讓命運決定你的晚餐 🍜</p>
                <p class="text-[13px] text-body">抽中了就是天意，再抽就是不知足</p>
            </div>

            <!-- 主卡片 -->
            <div class="w-full max-w-[460px] rounded-[20px] p-7 backdrop-blur-md bg-card border border-border">

                <!-- ── IDLE：初始設定 ─────────────────────────────── -->
                <div v-if="phase === 'idle'">

                    <!-- 搜尋類型 -->
                    <p class="text-xs font-semibold [letter-spacing:1.5px] uppercase mb-2.5 text-label">搜尋類型</p>
                    <div class="grid grid-cols-3 gap-2 mb-5">
                        <button v-for="t in placeTypeOptions" :key="t.value" @click="placeType = t.value"
                            class="py-[9px] px-1 rounded-[10px] text-[13px] font-medium border cursor-pointer transition-all duration-200 bg-transparent text-center"
                            :class="placeType === t.value ? 'radius-btn-active' : 'radius-btn-inactive'">
                            {{ t.emoji }} {{ t.label }}
                        </button>
                    </div>

                    <!-- 搜尋範圍 -->
                    <p class="text-xs font-semibold [letter-spacing:1.5px] uppercase mb-2.5 text-label">搜尋範圍</p>
                    <div class="flex gap-1.5 mb-5 flex-wrap">
                        <button v-for="r in radiusOptions" :key="r.value" @click="radius = r.value"
                            class="flex-1 min-w-[52px] py-[9px] rounded-[10px] text-[13px] font-medium border cursor-pointer transition-all duration-200 bg-transparent"
                            :class="radius === r.value ? 'radius-btn-active' : 'radius-btn-inactive'">
                            {{ r.label }}
                        </button>
                    </div>

                    <!-- 取得位置按鈕 -->
                    <button @click="getLocation"
                        class="dinner-btn-primary w-full p-[15px] rounded-xl text-base [letter-spacing:0.5px] [box-shadow:0_4px_20px_rgba(251,191,36,0.3)] hover:-translate-y-0.5 hover:[box-shadow:0_8px_28px_rgba(251,191,36,0.4)]">
                        📍 取得我的位置
                    </button>

                    <!-- 手動輸入座標 -->
                    <div class="mt-3">
                        <button @click="showManualCoord = !showManualCoord"
                            class="w-full p-2.5 rounded-[10px] border bg-transparent text-[13px] font-medium cursor-pointer transition-colors duration-200 flex items-center justify-center gap-1.5 text-body border-border hover:text-heading hover:border-border-glow">
                            📌 手動輸入座標
                            <span class="text-[10px] opacity-60">{{ showManualCoord ? '▲' : '▼' }}</span>
                        </button>

                        <div v-if="showManualCoord" class="mt-2.5 rounded-xl p-4 border border-border [background:rgba(255,255,255,0.04)]">
                            <p class="text-[11px] mb-3 text-body">
                                從 Google Maps 複製座標，格式：<code class="text-[#FBBF24]">25.0330, 121.5654</code>
                            </p>
                            <div class="flex gap-2 mb-2.5">
                                <div class="flex-1">
                                    <label class="text-[11px] block mb-1 text-label">緯度 Lat</label>
                                    <input v-model="manualLat" type="number" step="0.0001" placeholder="25.0330"
                                        class="w-full box-border py-2 px-2.5 rounded-lg border text-[13px] outline-none border-border bg-input text-heading focus:[border-color:rgba(251,191,36,0.5)]" />
                                </div>
                                <div class="flex-1">
                                    <label class="text-[11px] block mb-1 text-label">經度 Lng</label>
                                    <input v-model="manualLng" type="number" step="0.0001" placeholder="121.5654"
                                        class="w-full box-border py-2 px-2.5 rounded-lg border text-[13px] outline-none border-border bg-input text-heading focus:[border-color:rgba(251,191,36,0.5)]" />
                                </div>
                            </div>
                            <p v-if="manualCoordError" class="text-xs mb-2 [color:#FDA4AF]">
                                {{ manualCoordError }}
                            </p>
                            <button @click="useManualCoord"
                                class="dinner-btn-primary w-full p-2.5 rounded-lg text-[13px] transition-transform duration-150 hover:-translate-y-px">
                                🔍 使用此座標搜尋
                            </button>
                        </div>
                    </div>
                </div>

                <!-- ── LOCATING / FETCHING：讀取中 ──────────────────── -->
                <div v-if="phase === 'locating' || phase === 'fetching'" class="text-center py-6">
                    <div class="dinner-spinner mx-auto mb-6"></div>
                    <p class="text-base font-medium mb-2 text-heading">
                        {{ phase === 'locating' ? '正在定位中...' : '搜尋附近餐廳中...' }}
                    </p>
                    <p class="text-[13px] text-body">
                        {{ phase === 'locating' ? '請允許瀏覽器存取位置權限' : `搜尋 ${radius}m 範圍內` }}
                    </p>
                </div>

                <!-- ── READY：已取得餐廳，準備開抽 ───────────────────── -->
                <div v-if="phase === 'ready'" class="text-center">
                    <!-- 結果統計 -->
                    <div class="rounded-2xl p-5 mb-5 [background:rgba(251,191,36,0.08)] [border:1px_solid_rgba(251,191,36,0.25)]">
                        <p class="text-4xl font-bold m-0 mb-1 leading-none [color:#FBBF24]">
                            {{ restaurants.length }}
                        </p>
                        <p class="text-sm m-0 text-body">
                            間餐廳在 {{ radius }}m 範圍內等你
                        </p>
                    </div>

                    <!-- 切換距離 -->
                    <div class="flex gap-2 justify-center mb-5">
                        <button v-for="r in radiusOptions" :key="r.value" @click="changeRadius(r.value)"
                            class="py-1.5 px-4 rounded-lg text-[13px] font-medium border cursor-pointer transition-all duration-200 bg-transparent"
                            :class="radius === r.value ? 'radius-btn-active' : 'radius-btn-inactive'">
                            {{ r.label }}
                        </button>
                    </div>

                    <!-- 開始抽 -->
                    <button @click="startSpin"
                        class="dinner-btn-primary w-full p-[18px] rounded-xl text-lg font-bold [letter-spacing:1px] [box-shadow:0_4px_20px_rgba(251,191,36,0.35)] hover:-translate-y-0.5 hover:[box-shadow:0_8px_28px_rgba(251,191,36,0.45)]">
                        🎰 開始抽！
                    </button>
                </div>

                <!-- ── SPINNING：拉霸轉動中 ──────────────────────────── -->
                <div v-if="phase === 'spinning'" class="text-center">
                    <p class="text-[13px] mb-4 [letter-spacing:1px] text-label">
                        ✨ 命運的齒輪正在轉動...
                    </p>
                    <!-- 拉霸轉輪 -->
                    <div class="relative rounded-2xl py-8 px-5 overflow-hidden [border:2px_solid_rgba(251,191,36,0.35)] [background:rgba(0,0,0,0.25)] [box-shadow:inset_0_0_30px_rgba(251,191,36,0.08),0_0_20px_rgba(251,191,36,0.15)]">
                        <!-- 上方高光 -->
                        <div class="absolute top-0 left-0 right-0 h-[35%] pointer-events-none [background:linear-gradient(to_bottom,rgba(251,191,36,0.07),transparent)]"></div>
                        <!-- 下方漸層 -->
                        <div class="absolute bottom-0 left-0 right-0 h-[35%] pointer-events-none [background:linear-gradient(to_top,rgba(251,191,36,0.07),transparent)]"></div>
                        <!-- 中間掃描線 -->
                        <div class="absolute left-3 right-3 top-1/2 h-0.5 -mt-px pointer-events-none [background:linear-gradient(90deg,transparent,rgba(251,191,36,0.4),transparent)]"></div>

                        <p :class="['drum-text', isfast ? 'drum-fast' : 'drum-slow']"
                            class="text-[clamp(16px,4.5vw,24px)] font-bold min-h-9 m-0 leading-[1.4] break-all [letter-spacing:0.5px] text-heading">
                            {{ spinCurrent }}
                        </p>
                    </div>

                    <!-- 轉動指示點 -->
                    <div class="flex justify-center gap-1.5 mt-4">
                        <span v-for="i in 3" :key="i" class="dot-pulse" :style="{ animationDelay: `${(i - 1) * 0.2}s` }"></span>
                    </div>
                </div>

                <!-- ── RESULT：抽籤結果 ─────────────────────────────── -->
                <div v-if="phase === 'result'" class="text-center animate-slide-up">
                    <!-- 獲獎卡片 -->
                    <div class="rounded-2xl py-7 px-5 mb-5 [background:linear-gradient(135deg,rgba(251,191,36,0.10),rgba(249,115,22,0.10))] [border:1px_solid_rgba(251,191,36,0.4)] [box-shadow:0_0_30px_rgba(251,191,36,0.12)]">
                        <div class="text-4xl mb-3.5">🎊</div>
                        <p class="text-[11px] font-semibold [letter-spacing:2px] uppercase mb-2 [color:rgba(251,191,36,0.75)]">
                            今晚就去這裡
                        </p>
                        <p class="text-[clamp(20px,5.5vw,30px)] font-bold m-0 mb-2 leading-[1.3] break-all text-heading">
                            {{ winner?.name }}
                        </p>
                        <!-- 距離 + 料理類型 chips -->
                        <div class="flex flex-wrap justify-center gap-2 mb-4">
                            <span v-if="winner?.distance != null"
                                class="inline-flex items-center gap-1 text-xs rounded-[20px] py-1 px-2.5 text-body [background:rgba(255,255,255,0.06)] [border:1px_solid_rgba(255,255,255,0.1)]">
                                📍 約 {{ winner.distance }}m
                            </span>
                            <span v-if="winner?.cuisine"
                                class="inline-flex items-center gap-1 text-xs rounded-[20px] py-1 px-2.5 [color:#FBBF24] [background:rgba(251,191,36,0.1)] [border:1px_solid_rgba(251,191,36,0.25)]">
                                {{ cuisineEmoji(winner.cuisine) }} {{ cuisineLabel(winner.cuisine) }}
                            </span>
                        </div>

                        <!-- 額外資訊列 -->
                        <div v-if="winner?.opening_hours || winner?.phone || winner?.address"
                            class="text-left rounded-[10px] py-3 px-3.5 mb-4 flex flex-col gap-1.5 [background:rgba(0,0,0,0.15)]">
                            <div v-if="winner?.opening_hours" class="flex items-start gap-2 text-xs text-body">
                                <span class="shrink-0">🕐</span>
                                <span class="leading-relaxed break-all">{{ winner.opening_hours }}</span>
                            </div>
                            <div v-if="winner?.phone" class="flex items-center gap-2 text-xs text-body">
                                <span>📞</span>
                                <a :href="'tel:' + winner.phone" class="no-underline [letter-spacing:0.5px] [color:#FBBF24]">{{ winner.phone }}</a>
                            </div>
                            <div v-if="winner?.address" class="flex items-center gap-2 text-xs text-body">
                                <span>🏠</span>
                                <span>{{ winner.address }}</span>
                            </div>
                        </div>

                        <!-- Google Maps 按鈕 -->
                        <a :href="googleMapsUrl(winner)" target="_blank" rel="noopener noreferrer"
                            class="flex items-center justify-center gap-2 w-full py-[11px] rounded-[10px] text-[13px] font-semibold no-underline mb-4 transition-all duration-200 [letter-spacing:0.3px] [color:#74A9FF] [border:1px_solid_rgba(66,133,244,0.4)] [background:rgba(66,133,244,0.08)] hover:[background:rgba(66,133,244,0.16)] hover:[border-color:rgba(66,133,244,0.6)]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path
                                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                            </svg>
                            在 Google Maps 查看
                        </a>

                        <!-- 命理台詞 -->
                        <div class="rounded-[10px] py-3 px-4 [background:rgba(0,0,0,0.18)] [border-left:3px_solid_rgba(251,191,36,0.55)]">
                            <p class="text-[13px] m-0 italic leading-[1.7] text-label">「{{ fortune }}」</p>
                        </div>
                    </div>

                    <!-- 操作按鈕 -->
                    <div class="flex gap-3">
                        <button @click="startSpin"
                            class="dinner-btn-primary flex-1 p-3.5 rounded-[10px] text-[15px] [box-shadow:0_4px_16px_rgba(251,191,36,0.3)] hover:-translate-y-0.5 hover:[box-shadow:0_8px_24px_rgba(251,191,36,0.4)]">
                            🎰 再抽一次
                        </button>
                        <button @click="resetAll"
                            class="flex-1 p-3.5 rounded-[10px] border cursor-pointer text-[15px] font-medium transition-all duration-200 border-border bg-subtle text-body hover:text-heading hover:border-border-glow">
                            重新設定
                        </button>
                    </div>
                </div>

                <!-- ── ERROR：錯誤狀態 ──────────────────────────────── -->
                <div v-if="phase === 'error'" class="text-center py-3">
                    <div class="text-[44px] mb-4">😰</div>
                    <p class="text-[15px] font-medium mb-2 leading-relaxed text-heading">
                        {{ errorMsg }}
                    </p>
                    <div class="flex gap-2.5 mt-5">
                        <button @click="phase = 'idle'"
                            class="flex-1 p-3 rounded-[10px] border cursor-pointer text-sm font-medium transition-all duration-200 border-border bg-subtle text-body hover:text-heading hover:border-border-glow">
                            ← 重新設定
                        </button>
                        <button v-if="canRetryFetch" @click="fetchRestaurants"
                            class="dinner-btn-primary flex-1 p-3 rounded-[10px] text-sm transition-transform duration-150 hover:-translate-y-px">
                            重試
                        </button>
                    </div>
                </div>

            </div><!-- /主卡片 -->

            <!-- ── 收藏清單 ────────────────────────────────────── -->
            <div v-if="favorites.length > 0" class="w-full max-w-[460px] mt-4">
                <button @click="showFavorites = !showFavorites"
                    class="w-full py-3 px-4.5 rounded-2xl text-[13px] font-semibold cursor-pointer flex items-center justify-between transition-colors duration-200 [color:#FBBF24] [border:1px_solid_rgba(251,191,36,0.25)] [background:rgba(251,191,36,0.06)] hover:[background:rgba(251,191,36,0.1)]">
                    <span>⭐ 收藏清單（{{ favorites.length }}）</span>
                    <span class="text-[10px] opacity-70">{{ showFavorites ? '▲ 收起' : '▼ 展開' }}</span>
                </button>

                <div v-if="showFavorites" class="mt-2 rounded-2xl overflow-hidden backdrop-blur-md bg-card border border-border">
                    <div v-for="(fav, idx) in favorites" :key="fav.savedAt"
                        class="flex items-center gap-3 py-3 px-4 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.03)]"
                        :class="idx < favorites.length - 1 ? 'border-b border-border' : ''">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold m-0 mb-0.5 whitespace-nowrap overflow-hidden text-ellipsis text-heading">
                                {{ fav.name }}
                            </p>
                            <p class="text-[11px] m-0 text-body">
                                {{ fav.savedAtLabel }}
                                <span v-if="fav.cuisine" class="ml-1.5 opacity-80">
                                    · {{ cuisineEmoji(fav.cuisine) }} {{ cuisineLabel(fav.cuisine) }}
                                </span>
                            </p>
                        </div>
                        <a :href="googleMapsUrl(fav)" target="_blank" rel="noopener noreferrer"
                            class="text-xs no-underline py-1 px-2 rounded-md whitespace-nowrap transition-colors duration-200 [color:#74A9FF] [border:1px_solid_rgba(66,133,244,0.3)] hover:[background:rgba(66,133,244,0.1)]">
                            🗺 Maps
                        </a>
                        <button @click="removeFavorite(fav.savedAt)"
                            class="py-1 px-2 rounded-md bg-transparent text-xs cursor-pointer whitespace-nowrap transition-colors duration-200 [color:rgba(255,120,120,0.7)] [border:1px_solid_rgba(255,100,100,0.25)] hover:[background:rgba(255,100,100,0.1)] hover:[color:#FDA4AF]">
                            删除
                        </button>
                    </div>
                    <div class="py-2.5 px-4 text-right border-t border-border">
                        <button @click="clearFavorites"
                            class="text-xs bg-transparent border-0 cursor-pointer py-1 transition-colors duration-150 text-body hover:[color:#FDA4AF]">
                            清空所有收藏
                        </button>
                    </div>
                </div>
            </div>

            <!-- Footer 說明 -->
            <p class="mt-6 text-xs opacity-50 text-center text-body">
                餐廳資料來源：OpenStreetMap contributors
            </p>

        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'

// ── 狀態 ─────────────────────────────────────────────────────
const phase = ref('idle')   // idle | locating | fetching | ready | spinning | result | error
const radius = ref(500)
const placeType = ref('food')  // food | drink
const restaurants = ref([])
const spinCurrent = ref('')
const winner = ref(null)
const fortune = ref('')
const errorMsg = ref('')
const isfast = ref(true)
const canRetryFetch = ref(false)

// 手動座標
const showManualCoord = ref(false)
const manualLat = ref('')
const manualLng = ref('')
const manualCoordError = ref('')

// 收藏
const favorites = ref([])
const showFavorites = ref(false)
const STORAGE_KEY = 'dinner-picker-favorites'

let userLat = 0
let userLng = 0
let spinTimer = null

// ── 常數 ─────────────────────────────────────────────────────
const radiusOptions = [
    { label: '300m', value: 300 },
    { label: '500m', value: 500 },
    { label: '1km', value: 1000 },
    { label: '3km', value: 3000 },
    { label: '5km', value: 5000 },
]

const placeTypeOptions = [
    { label: '餐廳', emoji: '🍽️', value: 'food' },
    { label: '速食', emoji: '🍔', value: 'fastfood' },
    { label: '飲料店', emoji: '🧋', value: 'drink' },
    { label: '甜點', emoji: '🍰', value: 'dessert' },
    { label: '酒吧', emoji: '🍺', value: 'bar' },
    { label: '麵包', emoji: '🥖', value: 'bakery' },
]

const PLACE_TYPE_NAMES = {
    food: '餐廳',
    fastfood: '速食店',
    drink: '飲料店',
    dessert: '甜點店',
    bar: '酒吧',
    bakery: '麵包店',
}

const PLACE_QUERIES = {
    food: (r, lat, lng) => [
        `node["amenity"="restaurant"](around:${r},${lat},${lng});`,
        `node["amenity"="fast_food"](around:${r},${lat},${lng});`,
        `node["amenity"="food_court"](around:${r},${lat},${lng});`,
    ],
    fastfood: (r, lat, lng) => [
        `node["amenity"="fast_food"](around:${r},${lat},${lng});`,
    ],
    drink: (r, lat, lng) => [
        `node["amenity"="cafe"](around:${r},${lat},${lng});`,
        `node["amenity"="bubble_tea"](around:${r},${lat},${lng});`,
        `node["shop"="tea"](around:${r},${lat},${lng});`,
        `node["shop"="beverages"](around:${r},${lat},${lng});`,
        `node["shop"="coffee"](around:${r},${lat},${lng});`,
    ],
    dessert: (r, lat, lng) => [
        `node["shop"="pastry"](around:${r},${lat},${lng});`,
        `node["shop"="confectionery"](around:${r},${lat},${lng});`,
        `node["shop"="chocolate"](around:${r},${lat},${lng});`,
        `node["amenity"="ice_cream"](around:${r},${lat},${lng});`,
    ],
    bar: (r, lat, lng) => [
        `node["amenity"="bar"](around:${r},${lat},${lng});`,
        `node["amenity"="pub"](around:${r},${lat},${lng});`,
        `node["amenity"="biergarten"](around:${r},${lat},${lng});`,
    ],
    bakery: (r, lat, lng) => [
        `node["shop"="bakery"](around:${r},${lat},${lng});`,
        `node["shop"="bread"](around:${r},${lat},${lng});`,
    ],
}

const fortunes = [
    '今日吃此處，財運滾滾來，錢包稍感壓力乃正常現象。',
    '命中注定，此餐乃今日最佳選擇，抗拒只會肚子更餓。',
    '星象顯示今晚吃飽有益健康，空腹求福適得其反。',
    '此店乃今日吉祥地，吃完記得留五星好評，功德 +1。',
    '天機不可洩漏，但可透露——吃這間今晚不會後悔的。',
    '今日偏財運強，但僅限於用在點一份加料上頭。',
    '吃飯皇帝大，其他事等吃完再說，切記切記。',
    '命運之輪已轉，抗拒者將繼續餓著，此乃天意。',
    '選擇障礙剋星已降臨，請安心落座、翻開菜單。',
    '今晚此餐，吃完雖覺還好，但不去絕對更後悔。',
    '上天早有安排，此刻多想無益，去吃就對了。',
    '今日解籤：與其猶豫，不如行動，胃袋比大腦誠實。',
]

// ── 方法 ─────────────────────────────────────────────────────
function getLocation() {
    if (!navigator.geolocation) {
        errorMsg.value = '您的瀏覽器不支援定位功能，請使用現代瀏覽器開啟'
        canRetryFetch.value = false
        phase.value = 'error'
        return
    }
    phase.value = 'locating'
    navigator.geolocation.getCurrentPosition(
        pos => {
            userLat = pos.coords.latitude
            userLng = pos.coords.longitude
            fetchRestaurants()
        },
        err => {
            if (err.code === 1) {
                errorMsg.value = '定位被拒絕，請在瀏覽器或系統設定中允許位置存取'
                canRetryFetch.value = false
            } else if (err.code === 2) {
                errorMsg.value = '無法取得位置資訊，請確認裝置 GPS 是否開啟'
                canRetryFetch.value = false
            } else {
                errorMsg.value = '定位逾時，請確認網路連線後重試'
                canRetryFetch.value = false
            }
            phase.value = 'error'
        },
        { timeout: 12000, maximumAge: 60000 }
    )
}

function useManualCoord() {
    manualCoordError.value = ''
    const lat = parseFloat(manualLat.value)
    const lng = parseFloat(manualLng.value)
    if (isNaN(lat) || lat < -90 || lat > 90) {
        manualCoordError.value = '緯度格式錯誤，請輸入 -90 ~ 90 之間的數字'
        return
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
        manualCoordError.value = '經度格式錯誤，請輸入 -180 ~ 180 之間的數字'
        return
    }
    userLat = lat
    userLng = lng
    showManualCoord.value = false
    fetchRestaurants()
}

async function fetchRestaurants() {
    phase.value = 'fetching'
    canRetryFetch.value = true

    const queryFn = PLACE_QUERIES[placeType.value] ?? PLACE_QUERIES.food
    const nodes = queryFn(radius.value, userLat, userLng).join('\n  ')
    const query = `[out:json][timeout:25];\n(\n  ${nodes}\n);\nout body;`

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`

    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        const named = data.elements
            .filter(el => el.tags?.name)
            .map(el => ({
                id: el.id,
                name: el.tags.name,
                lat: el.lat,
                lon: el.lon,
                cuisine: el.tags.cuisine ?? null,
                opening_hours: el.tags.opening_hours ?? null,
                phone: el.tags.phone ?? el.tags['contact:phone'] ?? null,
                address: [el.tags['addr:street'], el.tags['addr:housenumber']]
                    .filter(Boolean).join(' ') || null,
                distance: calcDistance(userLat, userLng, el.lat, el.lon),
            }))

        if (named.length === 0) {
            const typeName = PLACE_TYPE_NAMES[placeType.value] ?? '店家'
            const rangeLabel = radius.value >= 1000 ? radius.value / 1000 + 'km' : radius.value + 'm'
            errorMsg.value = `${rangeLabel} 內找不到${typeName}資料，請試試擴大搜尋範圍或手動輸入座標`
            canRetryFetch.value = false
            phase.value = 'error'
            return
        }

        restaurants.value = named
        phase.value = 'ready'
    } catch (e) {
        errorMsg.value = '餐廳資料載入失敗，請確認網路連線後重試'
        canRetryFetch.value = true
        phase.value = 'error'
    }
}

function calcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000
    const phi1 = (lat1 * Math.PI) / 180
    const phi2 = (lat2 * Math.PI) / 180
    const dPhi = ((lat2 - lat1) * Math.PI) / 180
    const dLam = ((lng2 - lng1) * Math.PI) / 180
    const a = Math.sin(dPhi / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2
    return Math.round(2 * R * Math.asin(Math.sqrt(a)))
}

function changeRadius(r) {
    radius.value = r
    fetchRestaurants()
}

function startSpin() {
    if (spinTimer) { clearTimeout(spinTimer); spinTimer = null }

    phase.value = 'spinning'
    isfast.value = true

    let count = 0
    const TOTAL = 38

    function tick() {
        const idx = Math.floor(Math.random() * restaurants.value.length)
        spinCurrent.value = restaurants.value[idx].name
        count++

        let delay
        if (count < 14) { delay = 55; isfast.value = true }
        else if (count < 24) { delay = 130; isfast.value = false }
        else if (count < 32) { delay = 260; isfast.value = false }
        else { delay = 420; isfast.value = false }

        if (count >= TOTAL) {
            const winIdx = Math.floor(Math.random() * restaurants.value.length)
            winner.value = restaurants.value[winIdx]
            spinCurrent.value = winner.value.name
            fortune.value = fortunes[Math.floor(Math.random() * fortunes.length)]
            spinTimer = setTimeout(() => { phase.value = 'result' }, 700)
            return
        }

        spinTimer = setTimeout(tick, delay)
    }

    tick()
}

// ── 料理類型 emoji 對應 ──────────────────────────────────────
const CUISINE_EMOJI_MAP = {
    chinese: '🥢', taiwanese: '🥢', japanese: '🍱', sushi: '🍣',
    ramen: '🍜', pizza: '🍕', burger: '🍔', american: '🍔',
    italian: '🍝', pasta: '🍝', thai: '🌶️', vietnamese: '🍜',
    korean: '🥩', indian: '🍛', mexican: '🌮', seafood: '🦞',
    noodle: '🍜', hot_pot: '🫕', bbq: '🔥', sandwich: '🥪',
    cafe: '☕', coffee: '☕', dessert: '🧁', ice_cream: '🍦',
    steak: '🥩', chicken: '🍗', fish: '🐟', dumpling: '🥟',
}

function cuisineEmoji(cuisine) {
    if (!cuisine) return '🍽️'
    const c = cuisine.toLowerCase()
    for (const [key, emoji] of Object.entries(CUISINE_EMOJI_MAP)) {
        if (c.includes(key)) return emoji
    }
    return '🍽️'
}

function cuisineLabel(cuisine) {
    if (!cuisine) return null
    // 取第一個分類（有些 OSM 會填 "chinese;taiwanese"）
    return cuisine.split(/[;,]/)[0].trim().replace(/_/g, ' ')
}

function googleMapsUrl(restaurant) {
    const q = encodeURIComponent(restaurant.name)
    return `https://www.google.com/maps/search/?api=1&query=${q}`
}

function resetAll() {
    if (spinTimer) { clearTimeout(spinTimer); spinTimer = null }
    restaurants.value = []
    winner.value = null
    phase.value = 'idle'
}

// ── 收藏 ─────────────────────────────────────────────────────
function loadFavorites() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        favorites.value = raw ? JSON.parse(raw) : []
    } catch { favorites.value = [] }
}

function saveFavorites() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites.value))
}

function isFavorited(restaurant) {
    if (!restaurant) return false
    return favorites.value.some(f => f.id === restaurant.id)
}

function toggleFavorite(restaurant) {
    if (!restaurant) return
    if (isFavorited(restaurant)) {
        favorites.value = favorites.value.filter(f => f.id !== restaurant.id)
    } else {
        const now = Date.now()
        const label = new Date(now).toLocaleString('zh-TW', {
            month: 'numeric', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
        favorites.value = [
            { ...restaurant, savedAt: now, savedAtLabel: label },
            ...favorites.value,
        ]
        showFavorites.value = true
    }
    saveFavorites()
}

function removeFavorite(savedAt) {
    favorites.value = favorites.value.filter(f => f.savedAt !== savedAt)
    saveFavorites()
}

function clearFavorites() {
    favorites.value = []
    localStorage.removeItem(STORAGE_KEY)
}

onMounted(() => loadFavorites())
</script>
