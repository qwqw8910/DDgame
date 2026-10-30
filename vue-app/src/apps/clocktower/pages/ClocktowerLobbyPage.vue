<template>
    <div class="relative h-[100dvh] overflow-x-hidden overflow-y-auto bg-dark">
        <RouterLink to="/"
            class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-[13px] font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-glow">
            ← 甜甜的小秘密
        </RouterLink>

        <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-16">
            <!-- Hero -->
            <div class="animate-slide-up text-center mb-10">
                <div class="mb-2"><GameIcon id="banner" :size="56" /></div>
                <h1 class="neon-heading gradient-text text-[clamp(30px,7vw,46px)] m-0 mb-2 leading-[1.1]">血染鐘樓</h1>
                <p class="text-base font-medium mb-1 [letter-spacing:1px] text-label">暗流湧動 · 線上魔典 · 真人說書人</p>
                <p class="text-[15px] text-body">{{ MIN_SEATS }} ～ {{ MAX_SEATS }} 位玩家 + 1 位說書人</p>
            </div>

            <div class="w-full max-w-[720px] grid gap-5 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
                <!-- 建立房間（透過連結進來時隱藏） -->
                <div v-if="!hasRoomFromUrl" class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center mb-4 [background:rgba(139,92,246,0.12)] [border:1px_solid_rgba(139,92,246,0.25)]"><GameIcon id="storyteller" :size="26" /></div>
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">建立新房間</h2>
                    <p class="text-[15px] mb-[22px] text-body">建立者是房主，可以指定或隨機抽出說書人</p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div class="input-wrapper">
                            <span class="input-icon"><GameIcon id="voice" :size="16" /></span>
                            <input v-model="createNickname" ref="createNicknameRef" type="text" placeholder="你的暱稱（與 Discord 相同）"
                                maxlength="12" class="game-input" @keydown.enter="handleCreateRoom" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon"><GameIcon id="seat" :size="16" /></span>
                            <select v-model="seats" class="game-input pl-11 cursor-pointer" aria-label="座位人數上限">
                                <option v-for="n in seatCounts" :key="n" :value="n">最多 {{ n }} 位玩家（+1 說書人）</option>
                            </select>
                        </div>
                        <button class="btn-primary" @click="handleCreateRoom">建立房間</button>
                    </div>
                </div>

                <!-- 加入房間 -->
                <div class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center mb-4 [background:rgba(6,182,212,0.12)] [border:1px_solid_rgba(6,182,212,0.25)]"><GameIcon id="link" :size="26" /></div>
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">加入房間</h2>
                    <p class="text-[15px] mb-[22px] text-body">
                        {{ hasRoomFromUrl ? `房間碼：${joinCode}` : '輸入朋友分享的房間碼' }}
                    </p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div v-if="!hasRoomFromUrl" class="input-wrapper">
                            <input v-model="joinCode" type="text" placeholder="房間碼（6碼）" maxlength="6"
                                class="game-input text-center [letter-spacing:6px] text-base font-semibold px-0"
                                @input="joinCode = joinCode.toUpperCase()" @keydown.enter="joinNicknameRef?.focus()" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon"><GameIcon id="voice" :size="16" /></span>
                            <input v-model="joinNickname" ref="joinNicknameRef" type="text" placeholder="你的暱稱（與 Discord 相同）"
                                maxlength="12" class="game-input" @keydown.enter="handleJoinRoom" />
                        </div>
                        <button class="btn-secondary" @click="handleJoinRoom">加入房間</button>
                    </div>
                </div>
            </div>

            <ul class="mt-8 max-w-[560px] list-none p-0 text-[13px] leading-[1.9] text-body opacity-80">
                <li><GameIcon id="voice" :size="14" /> 公開討論請進 Discord 語音；私聊與所有操作在網頁上。</li>
                <li><GameIcon id="voice" :size="14" /> 請使用和 Discord 相同的暱稱，方便大家對上座位。</li>
                <li><GameIcon id="night" :size="14" /> 夜晚請關麥克風。</li>
                <li><GameIcon id="warn" :size="14" /> 不可出示角色牌或截圖。</li>
            </ul>
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
import { MIN_SEATS, MAX_SEATS } from '../data/constants.js'
import GameIcon from '../components/GameIcon.vue'

const router = useRouter()
const seatCounts = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => MIN_SEATS + i)

const createNickname = ref('')
const seats = ref(10)
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
    if (saved) { createNickname.value = saved; joinNickname.value = saved }

    // 分享連結：#/clocktower?room=XXXXXX
    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
    const roomCode = (hashParams.get('room') || hashParams.get('id') || '').toUpperCase()
    if (roomCode) {
        joinCode.value = roomCode
        hasRoomFromUrl.value = true
        setTimeout(() => joinNicknameRef.value?.focus(), 100)
        showToast('請輸入暱稱後加入房間', 'info')
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
        name: 'clocktower-room',
        query: { id: generateRoomId(), nickname, create: '1', seats: seats.value },
    })
}

function handleJoinRoom() {
    const code = joinCode.value.trim().toUpperCase()
    const nickname = joinNickname.value.trim()
    if (code.length !== 6) { showToast('請輸入 6 碼房間碼！', 'error'); return }
    if (!nickname) { showToast('請輸入你的暱稱！', 'error'); return }
    saveNickname(nickname)
    router.push({ name: 'clocktower-room', query: { id: code, nickname } })
}
</script>
