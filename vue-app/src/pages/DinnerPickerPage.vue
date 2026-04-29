<template>
    <div style="min-height:100vh;overflow-x:hidden">

        <!-- 浮動背景食物 emoji -->
        <div style="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0" aria-hidden="true">
            <span class="float-emoji" style="font-size:52px;top:4%;left:4%;animation-delay:0s">🍜</span>
            <span class="float-emoji" style="font-size:40px;top:8%;right:7%;animation-delay:1.4s">🍣</span>
            <span class="float-emoji" style="font-size:36px;top:22%;left:10%;animation-delay:0.7s">🍕</span>
            <span class="float-emoji" style="font-size:44px;top:18%;right:18%;animation-delay:2.1s">🍔</span>
            <span class="float-emoji" style="font-size:48px;top:45%;left:2%;animation-delay:1.1s">🍱</span>
            <span class="float-emoji" style="font-size:36px;top:55%;right:4%;animation-delay:0.4s">🥢</span>
            <span class="float-emoji" style="font-size:44px;bottom:22%;left:7%;animation-delay:1.7s">🍛</span>
            <span class="float-emoji" style="font-size:50px;bottom:8%;right:11%;animation-delay:0.2s">🎰</span>
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
                        filter:drop-shadow(0 0 28px rgba(251,191,36,0.5))">🎰</div>
                <h1 class="neon-heading" style="font-size:clamp(30px,7vw,48px);margin:0 0 8px;line-height:1.1;
                        background:linear-gradient(135deg,#FBBF24 0%,#F97316 50%,#EF4444 100%);
                        -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent">
                    今晚吃什麼
                </h1>
                <p style="font-size:16px;color:var(--label);margin-bottom:4px;letter-spacing:0.5px">
                    讓命運決定你的晚餐 🍜</p>
                <p style="font-size:13px;color:var(--body)">抽中了就是天意，再抽就是不知足</p>
            </div>

            <!-- 主卡片 -->
            <div style="width:100%;max-width:460px;
                    background:var(--bg-card);border:1px solid var(--border);
                    border-radius:20px;padding:32px 28px;backdrop-filter:blur(12px);
                    -webkit-backdrop-filter:blur(12px)">

                <!-- ── IDLE：初始設定 ─────────────────────────────── -->
                <div v-if="phase === 'idle'">
                    <p style="font-size:13px;color:var(--label);text-align:center;
                            margin-bottom:12px;letter-spacing:0.5px;text-transform:uppercase">
                        搜尋範圍
                    </p>
                    <!-- 距離選擇 -->
                    <div style="display:flex;gap:10px;margin-bottom:28px">
                        <button v-for="r in radiusOptions" :key="r.value" @click="radius = r.value" style="flex:1;padding:10px 0;border-radius:10px;font-size:14px;
                                    font-weight:500;border:1px solid;cursor:pointer;
                                    transition:all 0.2s;background:transparent"
                            :style="radius === r.value ? activeRadiusStyle : inactiveRadiusStyle">
                            {{ r.label }}
                        </button>
                    </div>

                    <!-- 取得位置按鈕 -->
                    <button @click="getLocation" style="width:100%;padding:16px;border-radius:12px;border:none;
                                cursor:pointer;font-size:16px;font-weight:600;
                                background:linear-gradient(135deg,#FBBF24,#F97316);
                                color:#1a1a1a;transition:transform 0.2s,box-shadow 0.2s;
                                letter-spacing:0.5px;box-shadow:0 4px 20px rgba(251,191,36,0.3)"
                        @mouseenter="e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(251,191,36,0.4)' }"
                        @mouseleave="e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(251,191,36,0.3)' }">
                        📍 取得我的位置
                    </button>
                </div>

                <!-- ── LOCATING / FETCHING：讀取中 ──────────────────── -->
                <div v-if="phase === 'locating' || phase === 'fetching'" style="text-align:center;padding:24px 0">
                    <div class="dinner-spinner" style="margin:0 auto 24px"></div>
                    <p style="font-size:16px;color:var(--heading);font-weight:500;margin-bottom:8px">
                        {{ phase === 'locating' ? '正在定位中...' : '搜尋附近餐廳中...' }}
                    </p>
                    <p style="font-size:13px;color:var(--body)">
                        {{ phase === 'locating' ? '請允許瀏覽器存取位置權限' : `搜尋 ${radius}m 範圍內` }}
                    </p>
                </div>

                <!-- ── READY：已取得餐廳，準備開抽 ───────────────────── -->
                <div v-if="phase === 'ready'" style="text-align:center">
                    <!-- 結果統計 -->
                    <div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.25);
                            border-radius:14px;padding:20px;margin-bottom:20px">
                        <p style="font-size:36px;font-weight:700;color:#FBBF24;margin:0 0 4px;
                                line-height:1">
                            {{ restaurants.length }}
                        </p>
                        <p style="font-size:14px;color:var(--body);margin:0">
                            間餐廳在 {{ radius }}m 範圍內等你
                        </p>
                    </div>

                    <!-- 切換距離 -->
                    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px">
                        <button v-for="r in radiusOptions" :key="r.value" @click="changeRadius(r.value)" style="padding:6px 16px;border-radius:8px;font-size:13px;
                                    font-weight:500;border:1px solid;cursor:pointer;
                                    transition:all 0.2s;background:transparent"
                            :style="radius === r.value ? activeRadiusStyle : inactiveRadiusStyle">
                            {{ r.label }}
                        </button>
                    </div>

                    <!-- 開始抽 -->
                    <button @click="startSpin" style="width:100%;padding:18px;border-radius:12px;border:none;
                                cursor:pointer;font-size:18px;font-weight:700;
                                background:linear-gradient(135deg,#FBBF24,#F97316);
                                color:#1a1a1a;letter-spacing:1px;
                                transition:transform 0.2s,box-shadow 0.2s;
                                box-shadow:0 4px 20px rgba(251,191,36,0.35)"
                        @mouseenter="e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(251,191,36,0.45)' }"
                        @mouseleave="e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(251,191,36,0.35)' }">
                        🎰 開始抽！
                    </button>
                </div>

                <!-- ── SPINNING：拉霸轉動中 ──────────────────────────── -->
                <div v-if="phase === 'spinning'" style="text-align:center">
                    <p style="font-size:13px;color:var(--label);margin-bottom:16px;letter-spacing:1px">
                        ✨ 命運的齒輪正在轉動...
                    </p>
                    <!-- 拉霸轉輪 -->
                    <div style="position:relative;border:2px solid rgba(251,191,36,0.35);
                            border-radius:16px;background:rgba(0,0,0,0.25);
                            padding:32px 20px;overflow:hidden;
                            box-shadow:inset 0 0 30px rgba(251,191,36,0.08),
                                       0 0 20px rgba(251,191,36,0.15)">
                        <!-- 上方高光 -->
                        <div style="position:absolute;top:0;left:0;right:0;height:35%;
                                background:linear-gradient(to bottom,rgba(251,191,36,0.07),transparent);
                                pointer-events:none"></div>
                        <!-- 下方漸層 -->
                        <div style="position:absolute;bottom:0;left:0;right:0;height:35%;
                                background:linear-gradient(to top,rgba(251,191,36,0.07),transparent);
                                pointer-events:none"></div>
                        <!-- 中間掃描線 -->
                        <div style="position:absolute;left:12px;right:12px;top:50%;
                                height:2px;margin-top:-1px;
                                background:linear-gradient(90deg,transparent,rgba(251,191,36,0.4),transparent);
                                pointer-events:none"></div>

                        <p :class="['drum-text', isfast ? 'drum-fast' : 'drum-slow']" style="font-size:clamp(16px,4.5vw,24px);font-weight:700;
                                    color:var(--heading);min-height:36px;margin:0;
                                    line-height:1.4;word-break:break-all;
                                    letter-spacing:0.5px">
                            {{ spinCurrent }}
                        </p>
                    </div>

                    <!-- 轉動指示點 -->
                    <div style="display:flex;justify-content:center;gap:6px;margin-top:16px">
                        <span v-for="i in 3" :key="i" class="dot-pulse"
                            :style="{ animationDelay: `${(i - 1) * 0.2}s` }"></span>
                    </div>
                </div>

                <!-- ── RESULT：抽籤結果 ─────────────────────────────── -->
                <div v-if="phase === 'result'" style="text-align:center" class="animate-slide-up">
                    <!-- 獲獎卡片 -->
                    <div style="background:linear-gradient(135deg,rgba(251,191,36,0.10),rgba(249,115,22,0.10));
                            border:1px solid rgba(251,191,36,0.4);border-radius:16px;
                            padding:28px 20px;margin-bottom:20px;
                            box-shadow:0 0 30px rgba(251,191,36,0.12)">
                        <div style="font-size:40px;margin-bottom:14px">🎊</div>
                        <p style="font-size:11px;font-weight:600;letter-spacing:2px;
                                color:rgba(251,191,36,0.75);margin-bottom:8px;text-transform:uppercase">
                            今晚就去這裡
                        </p>
                        <p style="font-size:clamp(20px,5.5vw,30px);font-weight:700;
                                color:var(--heading);margin:0 0 8px;line-height:1.3;
                                word-break:break-all">
                            {{ winner?.name }}
                        </p>
                        <!-- 距離 + 料理類型 chips -->
                        <div style="display:flex;flex-wrap:wrap;justify-content:center;
                                gap:8px;margin-bottom:16px">
                            <span v-if="winner?.distance != null"
                                style="display:inline-flex;align-items:center;gap:4px;
                                        font-size:12px;color:var(--body);
                                        background:rgba(255,255,255,0.06);
                                        border:1px solid rgba(255,255,255,0.1);
                                        border-radius:20px;padding:4px 10px">
                                📍 約 {{ winner.distance }}m
                            </span>
                            <span v-if="winner?.cuisine"
                                style="display:inline-flex;align-items:center;gap:4px;
                                        font-size:12px;color:#FBBF24;
                                        background:rgba(251,191,36,0.1);
                                        border:1px solid rgba(251,191,36,0.25);
                                        border-radius:20px;padding:4px 10px">
                                {{ cuisineEmoji(winner.cuisine) }} {{ cuisineLabel(winner.cuisine) }}
                            </span>
                        </div>

                        <!-- 額外資訊列 -->
                        <div v-if="winner?.opening_hours || winner?.phone || winner?.address"
                            style="text-align:left;background:rgba(0,0,0,0.15);
                                    border-radius:10px;padding:12px 14px;margin-bottom:16px;
                                    display:flex;flex-direction:column;gap:7px">
                            <div v-if="winner?.opening_hours"
                                style="display:flex;align-items:flex-start;gap:8px;
                                        font-size:12px;color:var(--body)">
                                <span style="flex-shrink:0">🕐</span>
                                <span style="line-height:1.5;word-break:break-all">
                                    {{ winner.opening_hours }}
                                </span>
                            </div>
                            <div v-if="winner?.phone"
                                style="display:flex;align-items:center;gap:8px;
                                        font-size:12px;color:var(--body)">
                                <span>📞</span>
                                <a :href="'tel:' + winner.phone"
                                    style="color:#FBBF24;text-decoration:none;
                                            letter-spacing:0.5px">
                                    {{ winner.phone }}
                                </a>
                            </div>
                            <div v-if="winner?.address"
                                style="display:flex;align-items:center;gap:8px;
                                        font-size:12px;color:var(--body)">
                                <span>🏠</span>
                                <span>{{ winner.address }}</span>
                            </div>
                        </div>

                        <!-- Google Maps 按鈕 -->
                        <a :href="googleMapsUrl(winner)" target="_blank" rel="noopener noreferrer"
                            style="display:flex;align-items:center;justify-content:center;
                                    gap:8px;width:100%;padding:11px;
                                    border-radius:10px;border:1px solid rgba(66,133,244,0.4);
                                    background:rgba(66,133,244,0.08);
                                    color:#74A9FF;font-size:13px;font-weight:600;
                                    text-decoration:none;margin-bottom:16px;
                                    transition:all 0.2s;letter-spacing:0.3px"
                            @mouseenter="e => { e.currentTarget.style.background='rgba(66,133,244,0.16)'; e.currentTarget.style.borderColor='rgba(66,133,244,0.6)' }"
                            @mouseleave="e => { e.currentTarget.style.background='rgba(66,133,244,0.08)'; e.currentTarget.style.borderColor='rgba(66,133,244,0.4)' }">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                            </svg>
                            在 Google Maps 查看
                        </a>

                        <!-- 命理台詞 -->
                        <div style="background:rgba(0,0,0,0.18);border-radius:10px;
                                padding:12px 16px;border-left:3px solid rgba(251,191,36,0.55)">
                            <p style="font-size:13px;color:var(--label);margin:0;
                                    font-style:italic;line-height:1.7">
                                「{{ fortune }}」
                            </p>
                        </div>
                    </div>

                    <!-- 操作按鈕 -->
                    <div style="display:flex;gap:12px">
                        <button @click="startSpin" style="flex:1;padding:14px;border-radius:10px;border:none;
                                    cursor:pointer;font-size:15px;font-weight:600;
                                    background:linear-gradient(135deg,#FBBF24,#F97316);
                                    color:#1a1a1a;transition:transform 0.2s,box-shadow 0.2s;
                                    box-shadow:0 4px 16px rgba(251,191,36,0.3)"
                            @mouseenter="e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(251,191,36,0.4)' }"
                            @mouseleave="e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(251,191,36,0.3)' }">
                            🎰 再抽一次
                        </button>
                        <button @click="resetAll" style="flex:1;padding:14px;border-radius:10px;border:1px solid var(--border);
                                    cursor:pointer;font-size:15px;font-weight:500;
                                    background:var(--bg-subtle);color:var(--body);
                                    transition:all 0.2s"
                            @mouseenter="e => { e.currentTarget.style.borderColor = 'var(--border-glow)'; e.currentTarget.style.color = 'var(--heading)' }"
                            @mouseleave="e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--body)' }">
                            重新設定
                        </button>
                    </div>
                </div>

                <!-- ── ERROR：錯誤狀態 ──────────────────────────────── -->
                <div v-if="phase === 'error'" style="text-align:center;padding:12px 0">
                    <div style="font-size:44px;margin-bottom:16px">😰</div>
                    <p style="font-size:15px;color:var(--heading);font-weight:500;
                            margin-bottom:8px;line-height:1.6">
                        {{ errorMsg }}
                    </p>
                    <div style="display:flex;gap:10px;margin-top:20px">
                        <button @click="phase = 'idle'" style="flex:1;padding:12px;border-radius:10px;border:1px solid var(--border);
                                    cursor:pointer;font-size:14px;font-weight:500;
                                    background:var(--bg-subtle);color:var(--body);transition:all 0.2s"
                            @mouseenter="e => { e.currentTarget.style.borderColor = 'var(--border-glow)'; e.currentTarget.style.color = 'var(--heading)' }"
                            @mouseleave="e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--body)' }">
                            ← 重新設定
                        </button>
                        <button v-if="canRetryFetch" @click="fetchRestaurants" style="flex:1;padding:12px;border-radius:10px;border:none;
                                    cursor:pointer;font-size:14px;font-weight:600;
                                    background:linear-gradient(135deg,#FBBF24,#F97316);
                                    color:#1a1a1a;transition:transform 0.15s"
                            @mouseenter="e => e.currentTarget.style.transform = 'translateY(-1px)'"
                            @mouseleave="e => e.currentTarget.style.transform = 'translateY(0)'">
                            重試
                        </button>
                    </div>
                </div>

            </div><!-- /主卡片 -->

            <!-- Footer 說明 -->
            <p style="margin-top:24px;font-size:12px;color:var(--body);opacity:0.5;text-align:center">
                餐廳資料來源：OpenStreetMap contributors
            </p>

        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue'
import { RouterLink } from 'vue-router'

// ── 狀態 ─────────────────────────────────────────────────────
const phase = ref('idle')   // idle | locating | fetching | ready | spinning | result | error
const radius = ref(500)
const restaurants = ref([])
const spinCurrent = ref('')
const winner = ref(null)
const fortune = ref('')
const errorMsg = ref('')
const isfast = ref(true)
const canRetryFetch = ref(false)

let userLat = 0
let userLng = 0
let spinTimer = null

// ── 常數 ─────────────────────────────────────────────────────
const radiusOptions = [
    { label: '300m', value: 300 },
    { label: '500m', value: 500 },
    { label: '1km', value: 1000 },
]

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

// ── 樣式 ─────────────────────────────────────────────────────
const activeRadiusStyle = {
    background: 'rgba(251,191,36,0.12)',
    borderColor: 'rgba(251,191,36,0.5)',
    color: '#FBBF24',
}
const inactiveRadiusStyle = {
    background: 'var(--bg-subtle)',
    borderColor: 'var(--border)',
    color: 'var(--body)',
}

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

async function fetchRestaurants() {
    phase.value = 'fetching'
    canRetryFetch.value = true

    const query = `[out:json][timeout:20];
(
  node["amenity"="restaurant"](around:${radius.value},${userLat},${userLng});
  node["amenity"="fast_food"](around:${radius.value},${userLat},${userLng});
  node["amenity"="food_court"](around:${radius.value},${userLat},${userLng});
);
out body;`

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`

    try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        const named = data.elements
            .filter(el => el.tags?.name)
            .map(el => ({
                id:            el.id,
                name:          el.tags.name,
                lat:           el.lat,
                lon:           el.lon,
                cuisine:       el.tags.cuisine ?? null,
                opening_hours: el.tags.opening_hours ?? null,
                phone:         el.tags.phone ?? el.tags['contact:phone'] ?? null,
                address:       [el.tags['addr:street'], el.tags['addr:housenumber']]
                                    .filter(Boolean).join(' ') || null,
                distance:      calcDistance(userLat, userLng, el.lat, el.lon),
            }))

        if (named.length === 0) {
            errorMsg.value = `${radius.value}m 內找不到餐廳資料，請試試擴大搜尋範圍`
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
</script>

<style scoped>
/* 轉圈 Spinner */
.dinner-spinner {
    width: 44px;
    height: 44px;
    border: 3px solid rgba(251, 191, 36, 0.18);
    border-top-color: #FBBF24;
    border-radius: 50%;
    animation: dinner-spin 0.75s linear infinite;
}

@keyframes dinner-spin {
    to {
        transform: rotate(360deg);
    }
}

/* 拉霸文字 — 高速模糊 */
.drum-text {
    transition: filter 0.06s;
}

.drum-fast {
    filter: blur(1.8px);
    opacity: 0.75;
}

.drum-slow {
    filter: none;
    opacity: 1;
}

/* 等待點 */
.dot-pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(251, 191, 36, 0.55);
    animation: dot-bounce 0.9s ease-in-out infinite both;
}

@keyframes dot-bounce {

    0%,
    80%,
    100% {
        transform: scale(0.65);
        opacity: 0.4;
    }

    40% {
        transform: scale(1.1);
        opacity: 1;
    }
}
</style>
