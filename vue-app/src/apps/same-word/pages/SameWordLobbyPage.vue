<template>
    <div class="sw-scope relative h-[100dvh] overflow-x-hidden overflow-y-auto bg-dark">
        <SwAmbient />
        <RouterLink to="/"
            class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-[13px] font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-glow">
            ← 甜甜的小秘密
        </RouterLink>

        <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-16">
            <!-- Hero -->
            <div class="animate-slide-up text-center mb-10">
                <img :src="heroUrl" alt="" class="mx-auto mb-3 w-[min(360px,80vw)]" @error="e => e.target.remove()" />
                <h1 class="neon-heading gradient-text text-[clamp(30px,7vw,46px)] m-0 mb-2 leading-[1.1]">同詞相遇</h1>
                <p class="text-base font-medium mb-1 [letter-spacing:1px] text-label">同時寫下一個詞 · 看誰跟誰最有默契</p>
                <p class="text-[15px] text-body">{{ MIN_PLAYERS }} ～ {{ MAX_PLAYERS }} 人</p>
            </div>

            <div class="w-full max-w-[720px] grid gap-5 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
                <!-- 建立房間（透過連結進來時隱藏） -->
                <div v-if="!hasRoomFromUrl" class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center text-2xl mb-4 [background:rgba(251,113,133,0.12)] [border:1px_solid_rgba(251,113,133,0.3)]">💘</div>
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">建立新房間</h2>
                    <p class="text-[15px] mb-[22px] text-body">計時與回合數進房後再調整</p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div class="input-wrapper">
                            <span class="input-icon">😊</span>
                            <input v-model="createNickname" ref="createNicknameRef" type="text" placeholder="你的暱稱"
                                maxlength="12" class="game-input" @keydown.enter="handleCreateRoom" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">👥</span>
                            <select v-model="maxPlayers" class="game-input pl-11 cursor-pointer" aria-label="人數上限">
                                <option v-for="n in counts" :key="n" :value="n">最多 {{ n }} 人</option>
                            </select>
                        </div>
                        <button class="btn-primary" @click="handleCreateRoom">建立房間</button>
                    </div>
                </div>

                <!-- 加入房間 -->
                <div class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center text-2xl mb-4 [background:rgba(6,182,212,0.12)] [border:1px_solid_rgba(6,182,212,0.25)]">🔑</div>
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
                            <span class="input-icon">😊</span>
                            <input v-model="joinNickname" ref="joinNicknameRef" type="text" placeholder="你的暱稱"
                                maxlength="12" class="game-input" @keydown.enter="handleJoinRoom" />
                        </div>
                        <button class="btn-secondary" @click="handleJoinRoom">加入房間</button>
                    </div>
                </div>
            </div>

            <ul class="mt-8 max-w-[560px] list-none p-0 text-[13px] leading-[1.9] text-body opacity-80">
                <li>✍️ 大家同時寫一個中文或英文詞，時間到一起揭曉。</li>
                <li>💘 越早和別人寫出同一個詞，默契越高；始終沒配上的就是死對頭。</li>
                <li>🦄 最後只剩一人沒配對，就是「與眾不同」。</li>
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
import { MIN_PLAYERS, MAX_PLAYERS } from '../data/constants.js'
import SwAmbient from '../components/SwAmbient.vue'

const router = useRouter()
const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)
const heroUrl = `${import.meta.env.BASE_URL}same-word/hero-lobby.webp`

const createNickname = ref('')
const maxPlayers = ref(8)
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

    // 分享連結：#/same-word?room=XXXXXX
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
        name: 'same-word-room',
        query: { id: generateRoomId(), nickname, create: '1', max: maxPlayers.value },
    })
}

function handleJoinRoom() {
    const code = joinCode.value.trim().toUpperCase()
    const nickname = joinNickname.value.trim()
    if (code.length !== 6) { showToast('請輸入 6 碼房間碼！', 'error'); return }
    if (!nickname) { showToast('請輸入你的暱稱！', 'error'); return }
    saveNickname(nickname)
    router.push({ name: 'same-word-room', query: { id: code, nickname } })
}
</script>

<style scoped>
.sw-scope :deep(.game-card) {
    background: color-mix(in srgb, var(--color-card-solid) 55%, transparent);
    backdrop-filter: blur(14px) saturate(140%);
    box-shadow: 0 8px 32px var(--color-shadow-ambient), inset 0 1px 0 rgba(255, 255, 255, .06);
}
</style>
