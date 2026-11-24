<template>
    <div class="gt-root h-[100dvh] overflow-x-hidden overflow-y-auto">
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
                <h1 class="m-0 font-sans text-[clamp(44px,11vw,84px)] leading-[1.05] font-black tracking-[0.02em] text-(--gt-accent)">甜點守衛戰</h1>
                <p class="mt-4 mb-0 max-w-[32em] text-lg leading-relaxed text-(--gt-muted)">
                    每回合放下五個甜點，只留一個當塔。剩下的變成餅乾牆，把蟲子逼進你蓋的迷宮。最多六人一起守住蛋糕。
                </p>
            </div>

            <!-- 暱稱只填一次，開房間與加入房間共用 -->
            <div class="flex max-w-[400px] flex-col gap-3">
                <label class="flex flex-col gap-1 text-(--gt-muted)">
                    你的暱稱
                    <input v-model="nickname" ref="nicknameRef" class="gt-input" type="text" placeholder="最多 8 個字" maxlength="8"
                        autocomplete="nickname" enterkeyhint="go" @keydown.enter="hasRoomFromUrl ? handleJoin() : handleCreate()" />
                </label>
            </div>

            <div class="grid gap-8 sm:gap-10" :class="hasRoomFromUrl ? 'sm:max-w-[400px]' : 'sm:grid-cols-2'">
                <section v-if="!hasRoomFromUrl" class="flex flex-col gap-3">
                    <h2 class="m-0 font-sans text-2xl font-bold text-(--gt-ink)">開新房間</h2>
                    <select v-model.number="maxPlayers" class="gt-input cursor-pointer" aria-label="房間人數上限">
                        <option v-for="n in counts" :key="n" :value="n">{{ n === 1 ? '單人（自己玩）' : `最多 ${n} 人` }}</option>
                    </select>
                    <button class="gt-btn gt-btn--lamp" @click="handleCreate">開房間</button>
                    <p class="m-0 text-(--gt-muted)">一個人也能玩：人數選「單人」。</p>
                </section>

                <section class="flex flex-col gap-3">
                    <h2 class="m-0 font-sans text-2xl font-bold text-(--gt-ink)">{{ hasRoomFromUrl ? `加入房間 ${joinCode}` : '加入朋友的房間' }}</h2>
                    <input v-if="!hasRoomFromUrl" v-model="joinCode" class="gt-input" type="text" placeholder="6 碼房號，或貼上邀請連結"
                        aria-label="房號或邀請連結" autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="go"
                        @input="joinCode = parseRoomCode(joinCode)" @keydown.enter="handleJoin" />
                    <button class="gt-btn" @click="handleJoin">加入房間</button>
                </section>
            </div>

            <GemLeaderboard v-if="!hasRoomFromUrl" />
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
import GemLeaderboard from '../components/GemLeaderboard.vue'

const router = useRouter()

const showGuide = ref(false)
const nickname = ref('')
const joinCode = ref('')
const maxPlayers = ref(4)
const nicknameRef = ref(null)
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
    if (saved) nickname.value = saved.slice(0, 8)

    const hash = window.location.hash
    const params = new URLSearchParams(hash.includes('?') ? hash.split('?')[1] : '')
    const roomCode = (params.get('room') || '').toUpperCase()
    if (roomCode) {
        joinCode.value = roomCode
        hasRoomFromUrl.value = true
    }
    // 已經有暱稱就不搶焦點（手機上會一直彈出鍵盤）
    if (!nickname.value) setTimeout(() => nicknameRef.value?.focus({ preventScroll: true }), 100)
})

onUnmounted(() => clearTimeout(_toastTimer))

// 依房間系統統一規範：Lobby 只做輸入驗證 + 路由跳轉，不碰 DB / Socket
// 房號欄：貼上整段邀請連結也能認出房號；其他輸入只留英數字、轉大寫、最多 6 碼
function parseRoomCode(raw) {
    const fromLink = /[?&](?:room|id)=([A-Za-z0-9]{6})(?![A-Za-z0-9])/.exec(raw)
    if (fromLink) return fromLink[1].toUpperCase()
    return raw.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6)
}

function requireNickname() {
    const name = nickname.value.trim()
    if (!name) {
        showToast('請輸入暱稱', 'error')
        nicknameRef.value?.focus()
    }
    return name
}

function handleCreate() {
    const name = requireNickname()
    if (!name) return
    getOrCreatePlayerId()
    saveNickname(name)
    router.push({ name: 'gem-td-room', query: { id: generateRoomId(), nickname: name, create: '1', max: maxPlayers.value } })
}

function handleJoin() {
    const code = parseRoomCode(joinCode.value)
    if (code.length !== 6) { showToast('請輸入 6 碼房號', 'error'); return }
    const name = requireNickname()
    if (!name) return
    saveNickname(name)
    router.push({ name: 'gem-td-room', query: { id: code, nickname: name } })
}
</script>
