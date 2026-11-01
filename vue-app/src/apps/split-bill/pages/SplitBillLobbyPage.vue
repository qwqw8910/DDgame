<template>
    <div class="sb-theme h-[100dvh] overflow-x-hidden overflow-y-auto">
        <button @click="toggleTheme" title="切換主題" class="theme-toggle fixed top-4 right-4 z-50">
            {{ isDark ? '🌙' : '☀️' }}
        </button>

        <RouterLink to="/"
            class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-base font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-glow">
            ← 甜甜的小秘密
        </RouterLink>

        <div class="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-16">
            <div class="animate-slide-up text-center mb-8">
                <div class="text-6xl mb-3">💸</div>
                <h1 class="neon-heading gradient-text text-[clamp(32px,7vw,48px)] m-0 mb-2 leading-[1.1]">分帳</h1>
                <p class="text-base text-body">記下誰先付、誰要分，自動算出誰欠誰</p>
                <p class="text-base text-body">不用註冊，輸入同一個名字就是同一個人</p>
            </div>

            <div class="w-full max-w-[720px] grid gap-5 sm:grid-cols-[repeat(auto-fit,minmax(280px,1fr))]">
                <!-- 建立房間（透過分享連結進入時隱藏） -->
                <div v-if="!hasRoomFromUrl" class="game-card flex flex-col">
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">🏠 建立新帳本</h2>
                    <p class="text-base mb-5 text-body">例如「日本旅行」，再把房間碼分享給大家</p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div class="input-wrapper">
                            <span class="input-icon">📒</span>
                            <input v-model="createRoomName" type="text" placeholder="帳本名稱（選填，例如：日本旅行）" maxlength="30"
                                class="game-input" @keydown.enter="handleCreate" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">😊</span>
                            <input v-model="createNickname" type="text" placeholder="你的名字" maxlength="20"
                                class="game-input" @keydown.enter="handleCreate" />
                        </div>
                        <button class="btn-primary" :disabled="busy" @click="handleCreate">
                            <span v-if="busy" class="spinner spinner-sm"></span>
                            {{ busy ? '準備中…' : '建立帳本' }}
                        </button>
                    </div>
                </div>

                <!-- 加入房間 -->
                <div class="game-card flex flex-col">
                    <h2 class="neon-heading text-xl mb-1.5 text-heading">🔑 加入帳本</h2>
                    <p class="text-base mb-5 text-body">
                        {{ hasRoomFromUrl ? `房間碼：${joinCode}` : '輸入朋友分享的房間碼' }}
                    </p>
                    <div class="flex flex-col gap-3 flex-1 justify-end">
                        <div v-if="!hasRoomFromUrl" class="input-wrapper">
                            <input v-model="joinCode" type="text" placeholder="房間碼（6碼）" maxlength="6"
                                class="game-input text-center [letter-spacing:6px] font-semibold px-0"
                                @input="joinCode = joinCode.toUpperCase()" />
                        </div>
                        <div class="input-wrapper">
                            <span class="input-icon">😊</span>
                            <input v-model="joinNickname" type="text" placeholder="你的名字" maxlength="20"
                                class="game-input" @keydown.enter="handleJoin" />
                        </div>
                        <button class="btn-secondary" :disabled="busy" @click="handleJoin">
                            {{ busy ? '準備中…' : '加入帳本' }}
                        </button>
                    </div>
                </div>
            </div>

            <!-- 最近的帳本 -->
            <div v-if="recent.length" class="w-full max-w-[720px] mt-6 game-card">
                <h2 class="neon-heading text-xl mb-3 text-heading">🕘 最近的帳本</h2>
                <div class="flex flex-col gap-2">
                    <button v-for="r in recent" :key="r.roomId" class="btn-ghost text-left flex justify-between"
                        :disabled="busy" @click="openRecent(r)">
                        <span><b v-if="r.name" class="mr-2">{{ r.name }}</b><span class="font-mono tracking-widest">{{ r.roomId }}</span></span>
                        <span class="text-body">以「{{ r.nickname }}」進入</span>
                    </button>
                </div>
            </div>

            <p class="mt-6 text-center max-w-[480px] text-body text-base leading-relaxed">
                輸入某人的名字就能以該人身分操作，請只把房間碼分享給信任的人。
            </p>
        </div>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>

        <div v-if="wakeup" role="dialog" aria-live="polite"
            class="fixed inset-0 z-[200] grid place-items-center p-5 [background:rgba(2,8,23,0.7)]">
            <div class="overlay-card text-center">
                <div class="text-5xl mb-2">⚡</div>
                <h3 class="text-xl font-bold mb-2 text-heading">伺服器啟動中…</h3>
                <p class="text-base text-body mb-4">閒置後首次需要約 30～60 秒，請稍候</p>
                <button class="btn-secondary" @click="cancelWakeup">取消</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { getSavedNickname, saveNickname, generateRoomId } from '@/shared/data/identity.js'
import { SERVER_URL } from '@/shared/api/config.js'
import { loadRecentRooms, rememberRoom } from '../data/recentRooms.js'
import '../split-bill.css'

const router = useRouter()

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
const createRoomName = ref('')
const joinNickname = ref('')
const joinCode = ref('')
const hasRoomFromUrl = ref(false)
const busy = ref(false)
const recent = ref([])

const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '') {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, 3000)
}

// ── 伺服器冷啟動：先 ping /health，未醒就顯示等待框並重試 ─────────────
const wakeup = ref(false)
let _cancelled = false
let _retryTimer = null

async function pingHealth() {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 5000)
    try {
        await fetch(`${SERVER_URL}/health`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
        return true
    } catch { return false } finally { clearTimeout(tid) }
}

async function ensureServerAlive() {
    _cancelled = false
    if (await pingHealth()) return true
    wakeup.value = true
    while (!_cancelled) {
        await new Promise(r => { _retryTimer = setTimeout(r, 3000) })
        if (_cancelled) break
        if (await pingHealth()) { wakeup.value = false; return true }
    }
    return false
}

function cancelWakeup() {
    _cancelled = true
    clearTimeout(_retryTimer)
    wakeup.value = false
    busy.value = false
}

onMounted(() => {
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'
    const saved = getSavedNickname()
    if (saved) { createNickname.value = saved; joinNickname.value = saved }
    recent.value = loadRecentRooms()

    const hash = window.location.hash
    const hashParams = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
    const code = (hashParams.get('room') || '').toUpperCase()
    if (code) {
        joinCode.value = code
        hasRoomFromUrl.value = true
        showToast('請輸入名字後加入帳本 🎉', 'info')
    }
})

onUnmounted(() => { clearTimeout(_retryTimer); clearTimeout(_toastTimer) })

async function go(query, nickname) {
    busy.value = true
    if (!(await ensureServerAlive())) { busy.value = false; return }
    saveNickname(nickname)
    rememberRoom(query.id, nickname, query.name)
    router.push({ name: 'split-bill-room', query })
}

function handleCreate() {
    const nickname = createNickname.value.trim()
    if (!nickname) return showToast('請輸入你的名字！', 'error')
    const name = createRoomName.value.trim()
    go({ id: generateRoomId(), nickname, create: '1', ...(name ? { name } : {}) }, nickname)
}

function handleJoin() {
    const code = joinCode.value.trim().toUpperCase()
    const nickname = joinNickname.value.trim()
    if (code.length !== 6) return showToast('請輸入 6 碼房間碼！', 'error')
    if (!nickname) return showToast('請輸入你的名字！', 'error')
    go({ id: code, nickname }, nickname)
}

function openRecent(r) {
    go({ id: r.roomId, nickname: r.nickname }, r.nickname)
}
</script>
