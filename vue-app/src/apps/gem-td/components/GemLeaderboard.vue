<template>
    <section class="flex flex-col gap-5" aria-labelledby="gt-lb-title">
        <div>
            <h2 id="gt-lb-title" class="m-0 font-sans text-2xl font-bold text-(--gt-ink)">排行榜</h2>
            <p class="mt-1 mb-0 text-(--gt-muted)">各組別前 10 名，同一位玩家的每場成績都會列入。</p>
        </div>

        <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-2" role="group" aria-label="波數">
                <button v-for="n in WAVES" :key="n" type="button" class="gt-chip" :class="{ 'gt-chip--on': waves === n }"
                    :aria-pressed="waves === n" @click="pick('waves', n)">{{ n }} 波</button>
            </div>
            <div class="flex flex-wrap items-center gap-2" role="group" aria-label="難度">
                <button v-for="d in DIFFICULTIES" :key="d.id" type="button" class="gt-chip" :class="{ 'gt-chip--on': difficulty === d.id }"
                    :aria-pressed="difficulty === d.id" @click="pick('difficulty', d.id)">{{ d.name }}</button>
            </div>
        </div>

        <div class="flex gap-1 border-b border-(--gt-line)" role="group" aria-label="榜單">
            <button v-for="b in BOARDS" :key="b.id" type="button"
                class="min-h-11 flex-1 cursor-pointer border-0 border-b-2 bg-transparent px-2 text-base transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--gt-accent)"
                :class="board === b.id ? 'border-(--gt-accent) font-bold text-(--gt-accent)' : 'border-transparent text-(--gt-muted) hover:text-(--gt-ink)'"
                :aria-pressed="board === b.id" @click="board = b.id">{{ b.name }}</button>
        </div>

        <div class="min-h-[200px]">
            <p v-if="loading" class="m-0 py-8 text-center text-(--gt-muted)" role="status">載入中…</p>
            <p v-else-if="error" class="m-0 py-8 text-center text-(--gt-muted)" role="status">{{ error }}</p>
            <p v-else-if="!rows.length" class="m-0 py-8 text-center text-(--gt-muted)" role="status">這個組合還沒有紀錄，成為第一個吧。</p>
            <ol v-else class="m-0 flex list-none flex-col gap-2 p-0" :aria-label="`${waves} 波 ${difficultyName} ${boardName}`">
                <li v-for="(r, i) in rows" :key="`${r.name}-${r.at}`"
                    class="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 rounded-lg border border-(--gt-line) bg-(--gt-surface) px-3 py-2.5">
                    <span class="flex size-9 items-center justify-center rounded-full text-base font-bold"
                        :class="i < 3 ? 'bg-(--gt-accent) text-white' : 'bg-transparent text-(--gt-muted)'">{{ i + 1 }}</span>
                    <span class="min-w-0">
                        <span class="block truncate text-(--gt-ink)">{{ r.name }}</span>
                        <span class="block truncate text-(--gt-muted)">{{ r.livesMode === 'solo' ? '獨立血量' : '共用血量' }} · {{ r.playerCount }} 人 · {{ fmtDate(r.at) }}</span>
                    </span>
                    <span class="text-right">
                        <span class="block font-bold text-(--gt-ink)">{{ main(r) }}</span>
                        <span v-if="sub(r)" class="block text-(--gt-muted)">{{ sub(r) }}</span>
                    </span>
                </li>
            </ol>
        </div>
    </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { SERVER_URL } from '@/shared/api/config.js'

const WAVES = [15, 30, 50]
const DIFFICULTIES = [{ id: 'easy', name: '簡單' }, { id: 'normal', name: '普通' }, { id: 'hard', name: '困難' }]
const BOARDS = [{ id: 'reach', name: '通關波數' }, { id: 'time', name: '通關時間' }, { id: 'damage', name: '最終傷害' }]

const waves = ref(30)
const difficulty = ref('easy')
const board = ref('reach')
const boards = ref({ reach: [], time: [], damage: [] })
const loading = ref(false)
const error = ref('')

const rows = computed(() => boards.value[board.value] ?? [])
const difficultyName = computed(() => DIFFICULTIES.find(d => d.id === difficulty.value)?.name ?? '')
const boardName = computed(() => BOARDS.find(b => b.id === board.value)?.name ?? '')

function pick(key, value) {
    if (key === 'waves') waves.value = value
    else difficulty.value = value
    load()
}

const fmtDate = (iso) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
// 主要數字依榜單而定；次要欄位補上其他兩項指標
function main(r) {
    if (board.value === 'time') return fmtTime(r.clearSeconds)
    if (board.value === 'damage') return `${r.finalDamage.toLocaleString()} 傷害`
    return r.cleared ? '通關' : `第 ${r.reachedWave} 波`
}
function sub(r) {
    const parts = []
    if (board.value !== 'time' && r.cleared && r.clearSeconds !== null) parts.push(fmtTime(r.clearSeconds))
    if (board.value !== 'damage' && r.finalDamage !== null) parts.push(`${r.finalDamage.toLocaleString()} 傷害`)
    return parts.join(' · ')
}

async function load() {
    loading.value = true
    error.value = ''
    try {
        const res = await fetch(`${SERVER_URL}/api/gem-td/leaderboard?waves=${waves.value}&difficulty=${difficulty.value}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '讀取失敗')
        boards.value = data.boards
    } catch (e) {
        boards.value = { reach: [], time: [], damage: [] }
        error.value = e.message || '排行榜暫時無法讀取'
    } finally {
        loading.value = false
    }
}

onMounted(load)
</script>
