<template>
    <div class="h-[100dvh] overflow-x-hidden overflow-y-auto">
        <!-- 浮動背景 emoji -->
        <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
            <span class="float-emoji text-[52px] top-[4%] left-[4%] [animation-delay:0s]">🔡</span>
            <span class="float-emoji text-[40px] top-[8%] right-[7%] [animation-delay:1.4s]">✨</span>
            <span class="float-emoji text-4xl top-[22%] left-[10%] [animation-delay:0.7s]">📝</span>
            <span class="float-emoji text-[44px] top-[18%] right-[18%] [animation-delay:2.1s]">💫</span>
            <span class="float-emoji text-[48px] top-[45%] left-[2%] [animation-delay:1.1s]">●</span>
            <span class="float-emoji text-4xl top-[55%] right-[4%] [animation-delay:0.4s]">▲</span>
            <span class="float-emoji text-[44px] bottom-[22%] left-[7%] [animation-delay:1.7s]">■</span>
            <span class="float-emoji text-[50px] bottom-[8%] right-[11%] [animation-delay:0.2s]">✏️</span>
        </div>

        <!-- Theme toggle -->
        <button @click="toggleTheme" title="切換主題" class="theme-toggle fixed top-4 right-4 z-50">
            {{ isDark ? '🌙' : '☀️' }}
        </button>

        <!-- 返回入口 -->
        <RouterLink to="/"
            class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-[13px] font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-glow">
            ← 甜甜的小秘密
        </RouterLink>

        <!-- 主要內容 -->
        <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-10">

            <!-- Hero -->
            <div class="animate-slide-up text-center mb-10">
                <div class="text-6xl mb-3 [filter:drop-shadow(0_0_20px_rgba(6,182,212,0.4))]">🔡</div>
                <h1 class="neon-heading gradient-text text-[clamp(32px,7vw,48px)] m-0 mb-2 leading-[1.1]">
                    默契傳聲筒
                </h1>
                <p class="text-base font-medium mb-1 [letter-spacing:1px] text-label">字元風暴</p>
                <p class="text-[15px] text-body">提示 · 代換 · 解謎 · 看符號，猜出隱藏的答案！</p>
            </div>

            <!-- 操作卡片 -->
            <div class="w-full max-w-[720px] grid gap-5 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">

                <!-- 建立房間（透過 URL 分享進入時隱藏） -->
                <div v-if="!hasRoomFromUrl" class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center text-2xl mb-4 [background:rgba(6,182,212,0.12)] [border:1px_solid_rgba(6,182,212,0.25)]">🏠</div>
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">建立新房間</h2>
                    <p class="text-[15px] mb-[22px] text-body">邀請 4 ～ 10 人加入，開始字元風暴</p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div class="input-wrapper">
                            <span class="input-icon">😊</span>
                            <input v-model="createNickname" ref="createNicknameRef" type="text" placeholder="你的暱稱"
                                maxlength="12" class="game-input" @keydown.enter="handleCreateRoom" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">👥</span>
                            <select v-model="maxPlayers" class="game-input pl-11 cursor-pointer">
                                <option v-for="n in [4, 5, 6, 7, 8, 9, 10]" :key="n" :value="n">最多 {{ n }} 人</option>
                            </select>
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">🎲</span>
                            <select v-model="selectedTheme" class="game-input pl-11 cursor-pointer">
                                <option :value="-1">隨機主題（每局不同）</option>
                                <option v-for="t in themeList" :key="t.id" :value="t.id">{{ t.name }}</option>
                            </select>
                        </div>
                        <button class="btn-primary [background:linear-gradient(135deg,#0891B2,#06B6D4)] [border-color:rgba(6,182,212,0.4)]"
                            :disabled="createLoading" @click="handleCreateRoom">
                            <span v-if="createLoading" class="spinner spinner-sm"></span>
                            {{ createLoading ? '建立中…' : '建立房間' }}
                        </button>
                    </div>
                </div>

                <!-- 加入房間 -->
                <div class="game-card flex flex-col">
                    <div class="w-[50px] h-[50px] rounded-[10px] flex items-center justify-center text-2xl mb-4 [background:rgba(139,92,246,0.12)] [border:1px_solid_rgba(139,92,246,0.25)]">🔑</div>
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">加入房間</h2>
                    <p class="text-[15px] mb-[22px] text-body">
                        {{ hasRoomFromUrl ? `房間碼：${joinCode}` : '輸入朋友分享的房間碼' }}
                    </p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div v-if="!hasRoomFromUrl" class="input-wrapper">
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

            <!-- 說明文字 -->
            <div class="mt-8 text-center max-w-[480px]">
                <p class="text-[13px] opacity-70 leading-[1.8] text-body">
                    提示者輸入線索，重複字元會被神秘符號（●▲■）遮蓋<br>
                    猜題者要從殘缺的線索中，推理出隱藏的答案！
                </p>
            </div>
        </div>

        <!-- Toast -->
        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>

        <!-- 伺服器冷啟動等待框 -->
        <Transition name="wakeup">
            <div v-if="wakeup.active" role="dialog" aria-live="polite" aria-label="伺服器啟動中"
                class="fixed inset-0 z-[200] grid place-items-center backdrop-blur-[6px] p-5 [background:rgba(2,8,23,0.62)]">
                <div class="wakeup-card w-[min(92vw,380px)] pt-7 px-[26px] pb-[22px] rounded-[18px] text-center flex flex-col items-center gap-2.5 [border:1px_solid_rgba(6,182,212,0.45)] [background:linear-gradient(160deg,rgba(15,23,42,0.98),rgba(8,47,73,0.92))] [box-shadow:0_24px_60px_rgba(2,8,23,0.55)]">
                    <div class="text-[44px] leading-none [filter:drop-shadow(0_0_16px_rgba(6,182,212,0.6))] [animation:wakeup-pulse_1.3s_ease-in-out_infinite] motion-reduce:[animation:none]">⚡</div>
                    <h3 class="m-0 text-[22px] font-extrabold [letter-spacing:0.02em] [color:#d7fbff]">伺服器啟動中…</h3>
                    <p class="m-0 text-[13px] leading-relaxed [color:#a5f3fc]">後端使用 Render 免費方案，閒置後首次需重新啟動<br>約 30 ～ 60 秒，請稍候</p>
                    <div class="w-full h-1.5 rounded-full overflow-hidden my-1.5 [background:rgba(6,182,212,0.18)]">
                        <div class="h-full w-[35%] rounded-full [background:linear-gradient(90deg,#06B6D4,#67E8F9,#06B6D4)] [background-size:200%_100%] [animation:wakeup-slide_1.6s_linear_infinite] motion-reduce:[animation:none]"></div>
                    </div>
                    <p class="mt-1 mb-0 text-xs [letter-spacing:0.02em] text-label">
                        已等待 <strong class="[color:var(--color-neon-cyan)] font-bold [font-variant-numeric:tabular-nums] mx-0.5">{{ wakeup.elapsed }}</strong> 秒 · 第 <strong class="[color:var(--color-neon-cyan)] font-bold [font-variant-numeric:tabular-nums] mx-0.5">{{ wakeup.attempts }}</strong> 次嘗試
                    </p>
                    <button class="btn-secondary mt-2.5 py-2 px-[22px] text-[13px]" type="button" @click="cancelWakeup">取消</button>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getOrCreatePlayerId, getSavedNickname, saveNickname, generateRoomId } from '@/shared/data/identity.js'

const router = useRouter()
const SERVER_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'
const HEALTH_TIMEOUT_MS = 5000
const HEALTH_RETRY_INTERVAL_MS = 3000

// 主題切換
const isDark = ref(true)
function toggleTheme() {
    const html = document.documentElement
    const isLight = html.getAttribute('data-theme') === 'light'
    const next = isLight ? 'mygame' : 'light'
    html.setAttribute('data-theme', next)
    localStorage.setItem('theme', next === 'light' ? 'light' : 'dark')
    isDark.value = next !== 'light'
}

const createNickname = ref('')
const maxPlayers = ref(6)
const selectedTheme = ref(-1)

// 主題名稱對照表（新增主題時只需在此加名稱，欄位由後端動態抓）
const THEME_NAMES = {
  0: '原始題庫',
  1: '綜合主題包',
  2: '好友精選包',
  3: '深海底撈',
  4: '百鬼夜行',
}
const themeList = ref([])
const joinCode = ref('')
const joinNickname = ref('')
const createLoading = ref(false)
const joinLoading = ref(false)
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

function focusJoinNickname() {
    joinNicknameRef.value?.focus()
}

// ── 伺服器冷啟動偵測 ────────────────────────────────────────────
// Render 免費方案閒置後首次連線需要 cold start（約 30 ~ 60 秒）；
// 點下「建立/加入」時先 ping /health，未醒則顯示等待框、自動重試到醒為止
const wakeup = ref({ active: false, elapsed: 0, attempts: 0 })
let _wakeupRetryTimer = null
let _wakeupTickTimer = null
let _wakeupStart = 0
let _wakeupCancelled = false

async function pingHealth(timeoutMs = HEALTH_TIMEOUT_MS) {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
        // mode:'no-cors' → 不需後端設 CORS 也能判斷「server 是否回應」
        // 任何非網路錯誤的回傳都代表 server 已活著
        await fetch(`${SERVER_URL}/health`, {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            signal: ctrl.signal,
        })
        return true
    } catch (_) {
        return false
    } finally {
        clearTimeout(tid)
    }
}

function _stopWakeupTimers() {
    clearTimeout(_wakeupRetryTimer)
    clearInterval(_wakeupTickTimer)
    _wakeupRetryTimer = null
    _wakeupTickTimer = null
}

function cancelWakeup() {
    _wakeupCancelled = true
    _stopWakeupTimers()
    wakeup.value.active = false
    createLoading.value = false
    joinLoading.value = false
    showToast('已取消等待，可以稍後再試 👌', 'info')
}

async function ensureServerAlive() {
    _wakeupCancelled = false

    // Step 1：先試一次短 timeout，活著就直接 return
    if (await pingHealth(HEALTH_TIMEOUT_MS)) return true

    // Step 2：開等待框，每 N 秒重試一次
    wakeup.value = { active: true, elapsed: 0, attempts: 1 }
    _wakeupStart = Date.now()

    _wakeupTickTimer = setInterval(() => {
        wakeup.value.elapsed = Math.floor((Date.now() - _wakeupStart) / 1000)
    }, 500)

    return new Promise((resolve) => {
        const retry = async () => {
            if (_wakeupCancelled) { resolve(false); return }
            wakeup.value.attempts++
            const ok = await pingHealth(HEALTH_TIMEOUT_MS)
            if (_wakeupCancelled) { resolve(false); return }
            if (ok) {
                _stopWakeupTimers()
                wakeup.value.active = false
                resolve(true)
                return
            }
            _wakeupRetryTimer = setTimeout(retry, HEALTH_RETRY_INTERVAL_MS)
        }
        _wakeupRetryTimer = setTimeout(retry, HEALTH_RETRY_INTERVAL_MS)
    })
}

async function loadThemes() {
    try {
        const res = await fetch(`${SERVER_URL}/api/cs/themes`)
        const { themes } = await res.json()
        themeList.value = themes.map(id => ({ id, name: THEME_NAMES[id] ?? `主題 ${id}` }))
    } catch {
        // 載入失敗時回退為靜態清單
        themeList.value = Object.entries(THEME_NAMES).map(([id, name]) => ({ id: Number(id), name }))
    }
}

onMounted(() => {
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'
    loadThemes()

    const saved = getSavedNickname()
    if (saved) {
        createNickname.value = saved
        joinNickname.value = saved
    }

    // 從 URL 帶入房間碼（別人分享連結進來）
    const params = new URLSearchParams(window.location.search)
    const hash = window.location.hash // Hash Router: #/character-storm?room=XXXX
    const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
    const roomCode = (
        params.get('room') || params.get('id') ||
        hashParams.get('room') || hashParams.get('id') || ''
    ).toUpperCase()

    if (roomCode) {
        joinCode.value = roomCode
        hasRoomFromUrl.value = true
        setTimeout(() => joinNicknameRef.value?.focus(), 100)
        showToast('請輸入暱稱後加入房間 🎉', 'info')
    } else {
        createNicknameRef.value?.focus()
    }
})

async function handleCreateRoom() {
    const nickname = createNickname.value.trim()
    if (!nickname) { showToast('請輸入你的暱稱！', 'error'); return }

    createLoading.value = true
    const alive = await ensureServerAlive()
    if (!alive) { createLoading.value = false; return }  // 使用者取消

    try {
        getOrCreatePlayerId()
        const roomId = generateRoomId()
        saveNickname(nickname)
        router.push({
            name: 'character-storm-room',
            query: { id: roomId, nickname, create: '1', max: maxPlayers.value, theme: selectedTheme.value }
        })
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
    const alive = await ensureServerAlive()
    if (!alive) { joinLoading.value = false; return }  // 使用者取消

    try {
        saveNickname(nickname)
        router.push({
            name: 'character-storm-room',
            query: { id: code, nickname }
        })
    } catch (err) {
        showToast('加入失敗：' + err.message, 'error')
        joinLoading.value = false
    }
}

onUnmounted(() => {
    _stopWakeupTimers()
})
</script>
