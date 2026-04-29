<template>
    <div style="min-height:100vh;overflow-x:hidden">
        <!-- 浮動背景 emoji -->
        <div style="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0" aria-hidden="true">
            <span class="float-emoji" style="font-size:52px;top:4%;left:4%;animation-delay:0s">🎭</span>
            <span class="float-emoji" style="font-size:40px;top:8%;right:7%;animation-delay:1.4s">✨</span>
            <span class="float-emoji" style="font-size:36px;top:22%;left:10%;animation-delay:0.7s">🎪</span>
            <span class="float-emoji" style="font-size:44px;top:18%;right:18%;animation-delay:2.1s">💫</span>
            <span class="float-emoji" style="font-size:48px;top:45%;left:2%;animation-delay:1.1s">🌈</span>
            <span class="float-emoji" style="font-size:36px;top:55%;right:4%;animation-delay:0.4s">🎉</span>
            <span class="float-emoji" style="font-size:44px;bottom:22%;left:7%;animation-delay:1.7s">🎊</span>
            <span class="float-emoji" style="font-size:50px;bottom:8%;right:11%;animation-delay:0.2s">🦋</span>
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
                padding:40px 16px">

            <!-- Hero -->
            <div class="animate-slide-up" style="text-align:center;margin-bottom:40px">
                <div style="font-size:64px;margin-bottom:12px;filter:drop-shadow(0 0 20px rgba(139,92,246,0.3))">🎭
                </div>
                <h1 class="neon-heading gradient-text"
                    style="font-size:clamp(36px,8vw,52px);margin:0 0 8px;line-height:1.1">
                    懂我再說
                </h1>
                <p style="font-size:18px;color:var(--label);font-weight:400;margin-bottom:4px;letter-spacing:0.5px">
                    多人互動猜測遊戲</p>
                <p style="font-size:15px;color:var(--body);font-weight:400">選擇 · 猜測 · 揭曉 · 看看朋友有多了解你！</p>
            </div>

            <!-- 操作卡片 -->
            <div style="width:100%;max-width:720px;display:grid;
                  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">

                <!-- 建立房間 -->
                <div class="game-card" style="display:flex;flex-direction:column">
                    <div style="width:50px;height:50px;border-radius:10px;
                      background:var(--bg-accent);border:1px solid var(--border-glow);
                      display:flex;align-items:center;justify-content:center;
                      font-size:24px;margin-bottom:16px">🏠</div>
                    <h2 class="neon-heading" style="font-size:20px;color:var(--heading);margin-bottom:6px">建立新房間</h2>
                    <p style="font-size:15px;color:var(--body);font-weight:400;margin-bottom:22px">
                        誰才是最懂你的人？發送邀請來揭曉
                    </p>
                    <div style="display:flex;flex-direction:column;gap:12px;flex:1;justify-content:flex-end">
                        <div class="input-wrapper">
                            <span class="input-icon">😊</span>
                            <input v-model="createNickname" ref="createNicknameRef" type="text" placeholder="你的暱稱"
                                maxlength="12" class="game-input" @keydown.enter="handleCreateRoom" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">👥</span>
                            <select v-model="maxPlayers" class="game-input" style="padding-left:44px;cursor:pointer">
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
                <div class="game-card" style="display:flex;flex-direction:column">
                    <div style="width:50px;height:50px;border-radius:10px;
                      background:rgba(225,29,72,0.12);border:1px solid rgba(225,29,72,0.2);
                      display:flex;align-items:center;justify-content:center;
                      font-size:24px;margin-bottom:16px">🎪</div>
                    <h2 class="neon-heading" style="font-size:20px;color:var(--heading);margin-bottom:6px">加入房間</h2>
                    <p style="font-size:15px;color:var(--body);font-weight:400;margin-bottom:22px">
                        輸入朋友分享的房間碼
                    </p>
                    <div style="display:flex;flex-direction:column;gap:12px;flex:1;justify-content:flex-end">
                        <div class="input-wrapper">
                            <input v-model="joinCode" type="text" placeholder="房間碼（6碼）" maxlength="6" class="game-input"
                                style="text-align:center;letter-spacing:6px;font-size:16px;font-weight:600;padding-left:0;padding-right:0"
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
import { getOrCreatePlayerId, getSavedNickname, saveNickname, generateRoomId } from '../data/identity.js'
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
