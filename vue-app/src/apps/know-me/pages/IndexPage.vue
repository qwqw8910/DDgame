<template>
    <div class="h-screen overflow-y-auto overflow-x-hidden">
        <!-- 浮動背景 emoji -->
        <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
            <span class="float-emoji text-[52px] top-[4%] left-[4%] [animation-delay:0s]">🎭</span>
            <span class="float-emoji text-[40px] top-[8%] right-[7%] [animation-delay:1.4s]">✨</span>
            <span class="float-emoji text-4xl top-[22%] left-[10%] [animation-delay:0.7s]">🎪</span>
            <span class="float-emoji text-[44px] top-[18%] right-[18%] [animation-delay:2.1s]">💫</span>
            <span class="float-emoji text-[48px] top-[45%] left-[2%] [animation-delay:1.1s]">🌈</span>
            <span class="float-emoji text-4xl top-[55%] right-[4%] [animation-delay:0.4s]">🎉</span>
            <span class="float-emoji text-[44px] bottom-[22%] left-[7%] [animation-delay:1.7s]">🎊</span>
            <span class="float-emoji text-[50px] bottom-[8%] right-[11%] [animation-delay:0.2s]">🦋</span>
        </div>

        <!-- 返回入口 -->
        <RouterLink to="/"
            class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-[13px] font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-glow">
            ← 甜甜的小秘密
        </RouterLink>

        <!-- 主要內容 -->
        <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10">

            <!-- Hero -->
            <div class="animate-slide-up text-center mb-10">
                <div class="text-6xl mb-3 [filter:drop-shadow(0_0_20px_rgba(139,92,246,0.3))]">🎭</div>
                <h1 class="neon-heading gradient-text text-[clamp(36px,8vw,52px)] m-0 mb-2 leading-[1.1]">
                    懂我再說
                </h1>
                <p class="text-lg font-normal mb-1 [letter-spacing:0.5px] text-label">多人互動猜測遊戲</p>
                <p class="text-[15px] font-normal text-body">選擇 · 猜測 · 揭曉 · 看看朋友有多了解你！</p>
            </div>

            <!-- 操作卡片 -->
            <div class="w-full max-w-[720px] grid gap-5 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">

                <!-- 建立房間 -->
                <div class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center text-2xl mb-4 bg-accent-tint border border-border-glow">🏠</div>
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">建立新房間</h2>
                    <p class="text-[15px] mb-[22px] text-body">
                        誰才是最懂你的人？發送邀請來揭曉
                    </p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div class="input-wrapper">
                            <span class="input-icon">😊</span>
                            <input v-model="createNickname" ref="createNicknameRef" type="text" placeholder="你的暱稱"
                                maxlength="12" class="game-input" @keydown.enter="handleCreateRoom" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">👥</span>
                            <select v-model="maxPlayers" class="game-input pl-11 cursor-pointer">
                                <option v-for="n in [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]" :key="n" :value="n">最多 {{ n }}
                                    人
                                </option>
                            </select>
                        </div>
                        <button class="btn-primary" :disabled="createLoading" @click="handleCreateRoom">
                            <span v-if="createLoading" class="spinner spinner-sm"></span>
                            {{ createLoading ? '建立中…' : '建立房間' }}
                        </button>
                    </div>
                </div>

                <!-- 加入房間 -->
                <div class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center text-2xl mb-4 [background:rgba(225,29,72,0.12)] [border:1px_solid_rgba(225,29,72,0.2)]">🎪</div>
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">加入房間</h2>
                    <p class="text-[15px] mb-[22px] text-body">
                        輸入朋友分享的房間碼
                    </p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div class="input-wrapper">
                            <input v-model="joinCode" type="text" placeholder="房間碼（6碼）" maxlength="6"
                                class="game-input text-center [letter-spacing:6px] text-base font-semibold px-0"
                                @input="joinCode = joinCode.toUpperCase()" @keydown.enter="focusJoinNickname" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">😊</span>
                            <input v-model="joinNickname" ref="joinNicknameRef" type="text" placeholder="你的暱稱"
                                maxlength="12" class="game-input" @keydown.enter="handleJoinRoom" />
                        </div>
                        <button class="btn-secondary" :disabled="joinLoading" @click="handleJoinRoom">
                            <span v-if="joinLoading" class="spinner spinner-sm"></span>
                            {{ joinLoading ? '加入中…' : '加入房間' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- Toast -->
        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getOrCreatePlayerId, getSavedNickname, saveNickname, generateRoomId } from '@/shared/data/identity.js'
import { DB } from '../data/db.js'

const router = useRouter()

const createNickname = ref('')
const maxPlayers = ref(8)
const joinCode = ref('')
const joinNickname = ref('')
const createLoading = ref(false)
const joinLoading = ref(false)
const createNicknameRef = ref(null)
const joinNicknameRef = ref(null)

const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null

function showToast(msg, type = '', duration = 3000) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

function focusJoinNickname() {
    joinNicknameRef.value?.focus()
}

onMounted(() => {
    const saved = getSavedNickname()
    if (saved) {
        createNickname.value = saved
        joinNickname.value = saved
    }

    // 從 URL 帶入房間碼（別人分享連結進來）
    const params = new URLSearchParams(window.location.search)
    const roomCode = (params.get('room') || params.get('id') || '').toUpperCase()
    if (roomCode) {
        joinCode.value = roomCode
        joinNicknameRef.value?.focus()
        showToast('請輸入暱稱後加入房間 🎉', 'info')
    } else {
        createNicknameRef.value?.focus()
    }
})

async function handleCreateRoom() {
    const nickname = createNickname.value.trim()
    if (!nickname) { showToast('請輸入你的暱稱！', 'error'); return }

    createLoading.value = true
    try {
        const playerId = getOrCreatePlayerId()
        const roomId = generateRoomId()
        await DB.createRoom(roomId, playerId, maxPlayers.value)
        saveNickname(nickname)
        router.push({ name: 'room', query: { id: roomId, nickname } })
    } catch (err) {
        showToast('建立失敗：' + err.message, 'error')
        createLoading.value = false
    }
}

async function handleJoinRoom() {
    const code = joinCode.value.trim().toUpperCase()
    const nickname = joinNickname.value.trim()
    if (!code || code.length !== 6) { showToast('請輸入6碼房間碼！', 'error'); return }
    if (!nickname) { showToast('請輸入你的暱稱！', 'error'); return }

    joinLoading.value = true
    try {
        await DB.getRoom(code)
        saveNickname(nickname)
        router.push({ name: 'room', query: { id: code, nickname } })
    } catch (err) {
        const isNotFound = (err.message || '').includes('No rows') || err.code === 'PGRST116'
        showToast(isNotFound ? '找不到這個房間！' : '加入失敗：' + err.message, 'error')
        joinLoading.value = false
    }
}
</script>
