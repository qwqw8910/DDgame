<template>
    <div class="lobby-root relative h-[100dvh] overflow-x-hidden overflow-y-auto">
        <!-- 背景（Figma 01_首頁）：#171717 底 + 山林橫幅（模糊、60%）+ 紙紋（20%） -->
        <div class="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
            <img :src="LOBBY_BANNER_IMG" alt="" draggable="false"
                class="absolute top-0 left-0 h-[560px] w-full object-cover opacity-60 blur-[2px]" />
            <!-- 下半部：三張紙紋快速輪流切換，營造顆粒閃動 -->
            <div class="absolute inset-x-0 bottom-0 h-1/2 overflow-hidden">
                <img v-for="(src, i) in LOBBY_TEXTURE_IMGS" :key="src" :src="src" alt="" draggable="false"
                    class="texture-frame absolute inset-0 h-full w-full object-cover object-bottom"
                    :style="{ animationDelay: `${i * 0.25}s` }" />
            </div>
        </div>

        <!-- 撕紙邊緣濾鏡：讓卡片外框呈現不規則的紙張毛邊 -->
        <svg class="absolute w-0 h-0" aria-hidden="true" focusable="false">
            <filter id="lodge-torn" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
            </filter>
        </svg>

        <!-- 頂欄（Figma 01_首頁）：左返回，右為說明按鈕 -->
        <header class="lobby-topbar">
            <RouterLink to="/" class="topbar-btn topbar-back">
                <img :src="ARROW_LEFT_ICON" alt="" width="24" height="24" draggable="false" />
                <span>甜甜的小秘密</span>
            </RouterLink>
            <nav class="flex items-center gap-1" aria-label="遊戲說明">
                <button class="topbar-btn" @click="openGuide('roles')">角色介紹</button>
                <button class="topbar-btn" @click="openGuide('rules')">遊戲規則</button>
            </nav>
        </header>

        <LodgeGuideModal v-model="showGuide" :initial-tab="guideTab" />

        <div class="relative z-10 min-h-full flex flex-col items-center justify-center px-5 pb-16 pt-24 sm:px-20">
            <div class="flex w-full max-w-[800px] flex-col items-center gap-12">
                <!-- Hero -->
                <div class="animate-slide-up flex w-full flex-col items-center gap-4 text-center">
                    <h1 class="lobby-title m-0">山中別館殺人事件</h1>
                    <div class="lobby-lead">
                        <p><b class="text-[#ee5353]">殺人魔</b>就在賓客之中！</p>
                        <p><b class="text-white">說謊</b>是規則的一部分 ——</p>
                        <p>看牌、傳牌、目擊情報，殺人魔究竟在哪個「<b class="text-white">地點</b>」？</p>
                        <p>把最<b class="text-white underline">可疑的人</b>關進鍋爐室，努力活下去吧。</p>
                    </div>
                </div>

                <div class="grid w-full gap-8 sm:gap-4" :class="hasRoomFromUrl ? 'sm:max-w-[392px]' : 'sm:grid-cols-2'">
                    <!-- 建立房間（透過連結進來時隱藏） -->
                    <section v-if="!hasRoomFromUrl" class="paper-card">
                        <h2 class="paper-tab">建立新房間</h2>
                        <div class="paper-body">
                            <p class="paper-text">山莊最多可同時接納 {{ MAX_PLAYERS }} 位房客加入。</p>
                            <div class="paper-fields">
                                <input v-model="createNickname" ref="createNicknameRef" type="text" placeholder="您的名稱（限8個字）"
                                    maxlength="8" class="paper-input" @keydown.enter="handleCreateRoom" />
                                <select v-model="maxPlayers" class="paper-input paper-select" aria-label="房間人數上限">
                                    <option v-for="n in playerCounts" :key="n" :value="n">{{ n === 1 ? '1 人（單人試玩）' : `${n}人房` }}</option>
                                </select>
                            </div>
                            <button class="paper-btn" @click="handleCreateRoom">建立房間</button>
                        </div>
                    </section>

                    <!-- 加入房間 -->
                    <section class="paper-card">
                        <h2 class="paper-tab">加入房間</h2>
                        <div class="paper-body">
                            <p class="paper-text">
                                {{ hasRoomFromUrl ? `房號：${joinCode}` : '前往朋友的房間。' }}
                            </p>
                            <div class="paper-fields">
                                <input v-model="joinNickname" ref="joinNicknameRef" type="text" placeholder="您的名稱（限8個字）"
                                    maxlength="8" class="paper-input" @keydown.enter="handleJoinRoom" />
                                <input v-if="!hasRoomFromUrl" v-model="joinCode" type="text" placeholder="請輸入房號（6碼）" maxlength="6"
                                    class="paper-input" @input="joinCode = joinCode.toUpperCase()" @keydown.enter="joinNicknameRef?.focus()" />
                            </div>
                            <button class="paper-btn" @click="handleJoinRoom">前往房間</button>
                        </div>
                    </section>
                </div>
            </div>
        </div>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getOrCreatePlayerId, getSavedNickname, saveNickname, generateRoomId } from '@/shared/data/identity.js'
import { warmUpServer } from '@/shared/api/config.js'
import { MIN_PLAYERS, MAX_PLAYERS, LOBBY_BANNER_IMG, LOBBY_TEXTURE_IMGS } from '../data/constants.js'
import { useLodgeDarkTheme } from '../composables/useLodgeDarkTheme.js'
import LodgeGuideModal from '../components/LodgeGuideModal.vue'

const ARROW_LEFT_ICON = `${import.meta.env.BASE_URL}mountain-lodge/icons/arrow-left.svg`

const router = useRouter()

const showGuide = ref(false)
const guideTab = ref('story')
function openGuide(tab) {
    guideTab.value = tab
    showGuide.value = true
}
const playerCounts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)

useLodgeDarkTheme()

const createNickname = ref('')
const maxPlayers = ref(4)
const joinCode = ref('')
const joinNickname = ref('')
const createNicknameRef = ref(null)
const joinNicknameRef = ref(null)
const hasRoomFromUrl = ref(false)

const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '', duration = 3000) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

onMounted(() => {
    warmUpServer()
    const saved = getSavedNickname()
    if (saved) { createNickname.value = saved.slice(0, 8); joinNickname.value = saved.slice(0, 8) }

    // 分享連結：#/mountain-lodge?room=XXXXXX
    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
    const roomCode = (hashParams.get('room') || hashParams.get('id') || '').toUpperCase()
    if (roomCode) {
        joinCode.value = roomCode
        hasRoomFromUrl.value = true
        setTimeout(() => joinNicknameRef.value?.focus(), 100)
        showToast('請輸入暱稱後加入房間 🎉', 'info')
    } else {
        createNicknameRef.value?.focus()
    }
})

onUnmounted(() => clearTimeout(_toastTimer))

// 依房間系統統一規範：Lobby 只做輸入驗證 + 路由跳轉，不碰 DB / Socket
function handleCreateRoom() {
    const nickname = createNickname.value.trim()
    if (!nickname) { showToast('請輸入你的暱稱！', 'error'); return }
    getOrCreatePlayerId()
    saveNickname(nickname)
    router.push({
        name: 'mountain-lodge-room',
        query: { id: generateRoomId(), nickname, create: '1', max: maxPlayers.value },
    })
}

function handleJoinRoom() {
    const code = joinCode.value.trim().toUpperCase()
    const nickname = joinNickname.value.trim()
    if (code.length !== 6) { showToast('請輸入 6 碼房間碼！', 'error'); return }
    if (!nickname) { showToast('請輸入你的暱稱！', 'error'); return }
    saveNickname(nickname)
    router.push({ name: 'mountain-lodge-room', query: { id: code, nickname } })
}
</script>

<style scoped>
/* 對應 Figma「01_首頁」(node 28:122)：深黑紙紋底、白字紅暈標題、米白撕紙卡片 */
.lobby-root { background-color: #171717; }

.lobby-topbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 72px;
    padding: 0 24px;
}
.topbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 36px;
    padding: 0 12px;
    background: #212121;
    border: 1px solid #676767;
    color: #fff;
    font-family: 'Noto Serif TC', 'Songti TC', serif;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color 0.15s, background-color 0.15s;
}
.topbar-btn:hover { background: #2c2c2c; border-color: #9a9a9a; }
.topbar-back { height: 40px; padding: 0 12px 0 8px; font-weight: 400; }
@media (max-width: 480px) {
    .lobby-topbar { padding: 0 12px; }
}

/* 3 張依序硬切（無淡入淡出），每張亮 0.25s、週期 0.75s，像膠片顆粒閃動；20% 對應 Figma 材質透明度 */
.texture-frame { opacity: 0; animation: texture-cycle 0.75s step-end infinite; }
@keyframes texture-cycle {
    0%        { opacity: 0.2; }
    33.333%   { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
    .texture-frame { animation: none; }
    .texture-frame:first-child { opacity: 0.2; }
}

.lobby-title {
    font-family: 'Noto Serif TC', 'Songti TC', serif;
    font-weight: 600;
    font-size: clamp(30px, 8vw, 48px);
    letter-spacing: 0.08em;
    line-height: normal;
    color: #fff;
    text-shadow: 0 0 24px #892f2f;
}

.lobby-lead {
    font-family: 'Noto Serif TC', 'Songti TC', serif;
    font-size: clamp(15px, 4vw, 18px);
    line-height: 1.4;
    color: #e2e2e2;
    text-shadow: 0 0 8px #892f2f;
}
.lobby-lead b { font-weight: 600; }

.paper-card {
    position: relative;
    isolation: isolate;
    font-family: 'Noto Serif TC', 'Songti TC', serif;
    color: #3c3c3c;
}
/* 紙張底：套用撕紙濾鏡，文字與輸入框不受影響 */
.paper-card::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: #dddad7;
    filter: url(#lodge-torn);
}

.paper-tab {
    position: absolute;
    top: -15px;
    left: 16px;
    z-index: 1;
    margin: 0;
    padding: 8px 12px;
    background: #eee;
    font-family: inherit;
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0;
    color: #3c3c3c;
    white-space: nowrap;
    line-height: normal;
}

.paper-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 40px 24px 24px;
}
.paper-text { margin: 0; font-size: 14px; line-height: normal; }
.paper-fields { display: flex; flex-direction: column; gap: 8px; }

.paper-input {
    box-sizing: border-box;
    width: 100%;
    height: 42px;
    padding: 4px 12px;
    background: #eee;
    border: 1px solid #d0cac4;
    border-radius: 0;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    color: #3c3c3c;
    outline: none;
    box-shadow: none;
}
.paper-input::placeholder { color: #a5a5a5; font-weight: 500; }
.paper-input:focus { border-color: #3c3c3c; box-shadow: none; }

.paper-select {
    appearance: none;
    cursor: pointer;
    padding-right: 36px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M7 10l5 5 5-5z' fill='%233c3c3c'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
}

.paper-btn {
    padding: 8px 12px;
    background: #212121;
    border: 0;
    border-radius: 0;
    font-family: inherit;
    font-size: 16px;
    color: #fff;
    cursor: pointer;
    transition: background-color 0.15s;
}
.paper-btn:hover { background: #333; }
.paper-btn:active { background: #000; }
</style>
