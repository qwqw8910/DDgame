<template>
    <div class="gt-root min-h-[100dvh] overflow-x-hidden">
        <header class="flex items-center justify-between px-4 py-3 sm:px-8">
            <RouterLink to="/" class="gt-chip no-underline">回首頁</RouterLink>
            <div class="flex items-center gap-2">
                <PwaInstallButton button-class="gt-chip" hint-class="gt-install-hint" />
                <button class="gt-chip" @click="showGuide = true">怎麼玩</button>
            </div>
        </header>
        <GemGuide v-model="showGuide" />

        <main class="mx-auto flex w-full max-w-[880px] flex-col gap-10 px-4 pt-6 pb-16 sm:px-8 sm:pt-12">
            <div>
                <img :src="HERO_IMAGE" alt="一群螞蟻朝草莓蛋糕前進，路上擋著糖果和馬卡龍" class="mb-6 block aspect-[16/7] w-full rounded-lg object-cover object-[50%_30%]" />
                <h1 class="m-0 font-sans text-[clamp(44px,11vw,84px)] leading-[1.05] font-black tracking-[0.02em] text-[#D6305A]">甜點守衛戰</h1>
                <p class="mt-4 mb-0 max-w-[32em] text-lg leading-relaxed text-[#7A5A50]">
                    每回合放下五個甜點，只留一個當塔。剩下的變成餅乾牆，把蟲子逼進你蓋的迷宮。最多四人一起守住蛋糕。
                </p>
            </div>

            <div class="grid gap-8 sm:gap-10" :class="hasRoomFromUrl ? 'sm:max-w-[400px]' : 'sm:grid-cols-2'">
                <section v-if="!hasRoomFromUrl" class="flex flex-col gap-3">
                    <h2 class="m-0 font-sans text-2xl font-bold text-[#4A2C2A]">開新房間</h2>
                    <input v-model="createNickname" ref="createRef" class="gt-input" type="text" placeholder="你的暱稱" maxlength="8"
                        aria-label="你的暱稱" @keydown.enter="handleCreate" />
                    <select v-model.number="maxPlayers" class="gt-input cursor-pointer" aria-label="房間人數上限">
                        <option v-for="n in counts" :key="n" :value="n">{{ n === 1 ? '單人' : `最多 ${n} 人` }}</option>
                    </select>
                    <button class="gt-btn gt-btn--lamp" @click="handleCreate">開房間</button>
                </section>

                <section class="flex flex-col gap-3">
                    <h2 class="m-0 font-sans text-2xl font-bold text-[#4A2C2A]">{{ hasRoomFromUrl ? `加入房間 ${joinCode}` : '加入朋友的房間' }}</h2>
                    <input v-model="joinNickname" ref="joinRef" class="gt-input" type="text" placeholder="你的暱稱" maxlength="8"
                        aria-label="你的暱稱" @keydown.enter="handleJoin" />
                    <input v-if="!hasRoomFromUrl" v-model="joinCode" class="gt-input" type="text" placeholder="6 碼房號" maxlength="6"
                        aria-label="房號" @input="joinCode = joinCode.toUpperCase()" @keydown.enter="handleJoin" />
                    <button class="gt-btn" @click="handleJoin">加入房間</button>
                </section>
            </div>
        </main>

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
import PwaInstallButton from '@/shared/components/PwaInstallButton.vue'
import { MIN_PLAYERS, MAX_PLAYERS, HERO_IMAGE } from '../data/gems.js'
import GemGuide from '../components/GemGuide.vue'

const router = useRouter()

const showGuide = ref(false)
const createNickname = ref('')
const joinNickname = ref('')
const joinCode = ref('')
const maxPlayers = ref(4)
const createRef = ref(null)
const joinRef = ref(null)
const hasRoomFromUrl = ref(false)

const counts = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i)

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

    const hash = window.location.hash
    const params = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
    const roomCode = (params.get('room') || '').toUpperCase()
    if (roomCode) {
        joinCode.value = roomCode
        hasRoomFromUrl.value = true
        setTimeout(() => joinRef.value?.focus({ preventScroll: true }), 100)
    } else {
        createRef.value?.focus({ preventScroll: true })
    }
})

onUnmounted(() => clearTimeout(_toastTimer))

// 依房間系統統一規範：Lobby 只做輸入驗證 + 路由跳轉，不碰 DB / Socket
function handleCreate() {
    const nickname = createNickname.value.trim()
    if (!nickname) { showToast('請輸入暱稱', 'error'); return }
    getOrCreatePlayerId()
    saveNickname(nickname)
    router.push({ name: 'gem-td-room', query: { id: generateRoomId(), nickname, create: '1', max: maxPlayers.value } })
}

function handleJoin() {
    const code = joinCode.value.trim().toUpperCase()
    const nickname = joinNickname.value.trim()
    if (code.length !== 6) { showToast('請輸入 6 碼房號', 'error'); return }
    if (!nickname) { showToast('請輸入暱稱', 'error'); return }
    saveNickname(nickname)
    router.push({ name: 'gem-td-room', query: { id: code, nickname } })
}
</script>
