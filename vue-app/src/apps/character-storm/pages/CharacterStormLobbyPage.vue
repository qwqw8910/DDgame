<template>
    <div style="min-height:100vh;overflow-x:hidden">
        <!-- 浮動背景 emoji -->
        <div style="position:fixed;inset:0;pointer-events:none;overflow:hidden;z-index:0" aria-hidden="true">
            <span class="float-emoji" style="font-size:52px;top:4%;left:4%;animation-delay:0s">🔡</span>
            <span class="float-emoji" style="font-size:40px;top:8%;right:7%;animation-delay:1.4s">✨</span>
            <span class="float-emoji" style="font-size:36px;top:22%;left:10%;animation-delay:0.7s">📝</span>
            <span class="float-emoji" style="font-size:44px;top:18%;right:18%;animation-delay:2.1s">💫</span>
            <span class="float-emoji" style="font-size:48px;top:45%;left:2%;animation-delay:1.1s">●</span>
            <span class="float-emoji" style="font-size:36px;top:55%;right:4%;animation-delay:0.4s">▲</span>
            <span class="float-emoji" style="font-size:44px;bottom:22%;left:7%;animation-delay:1.7s">■</span>
            <span class="float-emoji" style="font-size:50px;bottom:8%;right:11%;animation-delay:0.2s">✏️</span>
        </div>

        <!-- Theme toggle -->
        <button @click="toggleTheme" title="切換主題" class="theme-toggle"
            style="position:fixed;top:16px;right:16px;z-index:50">
            {{ isDark ? '🌙' : '☀️' }}
        </button>

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
                <div style="font-size:64px;margin-bottom:12px;filter:drop-shadow(0 0 20px rgba(6,182,212,0.4))">🔡</div>
                <h1 class="neon-heading gradient-text"
                    style="font-size:clamp(32px,7vw,48px);margin:0 0 8px;line-height:1.1">
                    默契傳聲筒
                </h1>
                <p style="font-size:16px;color:var(--label);font-weight:500;margin-bottom:4px;letter-spacing:1px">
                    字元風暴
                </p>
                <p style="font-size:15px;color:var(--body);font-weight:400">
                    提示 · 代換 · 解謎 · 看符號，猜出隱藏的答案！
                </p>
            </div>

            <!-- 操作卡片 -->
            <div style="width:100%;max-width:720px;display:grid;
                  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">

                <!-- 建立房間（透過 URL 分享進入時隱藏） -->
                <div v-if="!hasRoomFromUrl" class="game-card" style="display:flex;flex-direction:column">
                    <div style="width:50px;height:50px;border-radius:10px;
                      background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.25);
                      display:flex;align-items:center;justify-content:center;
                      font-size:24px;margin-bottom:16px">🏠</div>
                    <h2 class="neon-heading" style="font-size:20px;color:var(--heading);margin-bottom:6px">建立新房間</h2>
                    <p style="font-size:15px;color:var(--body);font-weight:400;margin-bottom:22px">
                        邀請 4 ～ 10 人加入，開始字元風暴
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
                                <option v-for="n in [4, 5, 6, 7, 8, 9, 10]" :key="n" :value="n">最多 {{ n }} 人</option>
                            </select>
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">🎲</span>
                            <select v-model="selectedTheme" class="game-input" style="padding-left:44px;cursor:pointer">
                                <option :value="-1">隨機主題（每局不同）</option>
                                <option :value="0">原始題庫</option>
                                <option :value="1">綜合主題包</option>
                                <option :value="2">好友精選包</option>
                            </select>
                        </div>
                        <button class="btn-primary" :disabled="createLoading" @click="handleCreateRoom"
                            style="background:linear-gradient(135deg,#0891B2,#06B6D4);border-color:rgba(6,182,212,0.4)">
                            <span v-if="createLoading" class="spinner spinner-sm"></span>
                            {{ createLoading ? '建立中…' : '建立房間' }}
                        </button>
                    </div>
                </div>

                <!-- 加入房間 -->
                <div class="game-card" style="display:flex;flex-direction:column">
                    <div style="width:50px;height:50px;border-radius:10px;
                      background:rgba(139,92,246,0.12);border:1px solid rgba(139,92,246,0.25);
                      display:flex;align-items:center;justify-content:center;
                      font-size:24px;margin-bottom:16px">🔑</div>
                    <h2 class="neon-heading" style="font-size:20px;color:var(--heading);margin-bottom:6px">加入房間</h2>
                    <p style="font-size:15px;color:var(--body);font-weight:400;margin-bottom:22px">
                        {{ hasRoomFromUrl ? `房間碼：${joinCode}` : '輸入朋友分享的房間碼' }}
                    </p>
                    <div style="display:flex;flex-direction:column;gap:12px;flex:1;justify-content:flex-end">
                        <div v-if="!hasRoomFromUrl" class="input-wrapper">
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

            <!-- 說明文字 -->
            <div style="margin-top:32px;text-align:center;max-width:480px">
                <p style="font-size:13px;color:var(--body);opacity:0.7;line-height:1.8">
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
            <div v-if="wakeup.active" class="wakeup-overlay" role="dialog" aria-live="polite"
                aria-label="伺服器啟動中">
                <div class="wakeup-card">
                    <div class="wakeup-icon">⚡</div>
                    <h3 class="wakeup-title">伺服器啟動中…</h3>
                    <p class="wakeup-desc">後端使用 Render 免費方案，閒置後首次需重新啟動<br>約 30 ～ 60 秒，請稍候</p>
                    <div class="wakeup-bar"><div class="wakeup-bar__fill"></div></div>
                    <p class="wakeup-meta">
                        已等待 <strong>{{ wakeup.elapsed }}</strong> 秒 · 第 <strong>{{ wakeup.attempts }}</strong> 次嘗試
                    </p>
                    <button class="btn-secondary wakeup-cancel" type="button" @click="cancelWakeup">取消</button>
                </div>
            </div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getOrCreatePlayerId, getSavedNickname, saveNickname, generateRoomId } from '../../../data/identity.js'

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

onMounted(() => {
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'

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

<style scoped>
.wakeup-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: grid;
    place-items: center;
    background: rgba(2, 8, 23, 0.62);
    backdrop-filter: blur(6px);
    padding: 20px;
}

.wakeup-card {
    width: min(92vw, 380px);
    padding: 28px 26px 22px;
    border-radius: 18px;
    border: 1px solid rgba(6, 182, 212, 0.45);
    background: linear-gradient(160deg, rgba(15, 23, 42, 0.98), rgba(8, 47, 73, 0.92));
    box-shadow: 0 24px 60px rgba(2, 8, 23, 0.55);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
}

.wakeup-icon {
    font-size: 44px;
    line-height: 1;
    animation: wakeupPulse 1.3s ease-in-out infinite;
    filter: drop-shadow(0 0 16px rgba(6, 182, 212, 0.6));
}

@keyframes wakeupPulse {
    0%, 100% { transform: scale(1); opacity: 0.85; }
    50%      { transform: scale(1.12); opacity: 1; }
}

.wakeup-title {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    color: #d7fbff;
    letter-spacing: 0.02em;
}

.wakeup-desc {
    margin: 0;
    font-size: 13px;
    color: #a5f3fc;
    line-height: 1.6;
}

.wakeup-bar {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: rgba(6, 182, 212, 0.18);
    overflow: hidden;
    margin: 6px 0 2px;
}

.wakeup-bar__fill {
    height: 100%;
    width: 35%;
    border-radius: 999px;
    background: linear-gradient(90deg, #06B6D4, #67E8F9, #06B6D4);
    background-size: 200% 100%;
    animation: wakeupSlide 1.6s linear infinite;
}

@keyframes wakeupSlide {
    0%   { transform: translateX(-100%); background-position: 0% 50%; }
    100% { transform: translateX(285%);  background-position: 100% 50%; }
}

.wakeup-meta {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--label);
    letter-spacing: 0.02em;
}

.wakeup-meta strong {
    color: var(--neon-cyan);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    margin: 0 2px;
}

.wakeup-cancel {
    margin-top: 10px;
    padding: 8px 22px;
    font-size: 13px;
}

.wakeup-enter-active,
.wakeup-leave-active {
    transition: opacity 220ms ease;
}

.wakeup-enter-active .wakeup-card,
.wakeup-leave-active .wakeup-card {
    transition: transform 220ms ease, opacity 220ms ease;
}

.wakeup-enter-from,
.wakeup-leave-to {
    opacity: 0;
}

.wakeup-enter-from .wakeup-card,
.wakeup-leave-to .wakeup-card {
    transform: translateY(12px) scale(0.96);
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .wakeup-icon,
    .wakeup-bar__fill {
        animation: none;
    }
}
</style>
