<template>
    <section class="flex flex-col gap-5" aria-labelledby="gt-lb-title">
        <div>
            <h2 id="gt-lb-title" class="m-0 font-sans text-2xl font-bold text-(--gt-ink)">排行榜</h2>
            <p class="mt-1 mb-0 text-(--gt-muted)">每個波數前 50 名，簡單與困難同榜。分數 =（到達波數 × 100 + 最高傷害測試的傷害比率 × 100）× 難度倍率（簡單 ×1、普通 ×1.5、困難 ×2）。</p>
        </div>

        <div class="flex flex-wrap items-center gap-2" role="group" aria-label="波數">
            <button v-for="w in WAVES" :key="w.id" type="button" class="gt-chip" :class="{ 'gt-chip--on': waves === w.id }"
                :aria-pressed="waves === w.id" @click="pick(w.id)">{{ w.name }}</button>
        </div>

        <div class="min-h-[200px]">
            <p v-if="loading" class="m-0 py-8 text-center text-(--gt-muted)" role="status">載入中…</p>
            <p v-else-if="error" class="m-0 py-8 text-center text-(--gt-muted)" role="status">{{ error }}</p>
            <p v-else-if="!rows.length" class="m-0 py-8 text-center text-(--gt-muted)" role="status">這個組合還沒有紀錄，成為第一個吧。</p>
            <ol v-else class="m-0 flex list-none flex-col gap-2 p-0" :aria-label="`${waveName} 排行榜`">
                <li v-for="(r, i) in rows" :key="`${r.name}-${r.at}`"
                    class="grid grid-cols-[2.5rem_1fr_auto] items-center gap-x-3 rounded-lg border border-(--gt-line) bg-(--gt-surface) px-3 py-2.5">
                    <span class="flex size-9 items-center justify-center rounded-full text-base font-bold"
                        :class="i < 3 ? 'bg-(--gt-accent) text-white' : 'bg-transparent text-(--gt-muted)'">{{ i + 1 }}</span>
                    <span class="min-w-0">
                        <span class="block truncate text-(--gt-ink)">{{ r.name }}</span>
                        <span class="block truncate text-(--gt-muted)">{{ diffName(r.difficulty) }} · {{ r.livesMode === 'solo' ? '獨立血量' : '共用血量' }} · {{ r.playerCount }} 人 · {{ fmtDate(r.at) }}</span>
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

const WAVES = [{ id: 15, name: '15 波' }, { id: 30, name: '30 波' }, { id: 50, name: '50 波' }, { id: 0, name: '無盡' }]
const DIFFICULTIES = { easy: '簡單', normal: '普通', hard: '困難' }

const waves = ref(30)
const rows = ref([])
const loading = ref(false)
const error = ref('')

const waveName = computed(() => WAVES.find(w => w.id === waves.value)?.name ?? '')
const diffName = id => DIFFICULTIES[id] ?? id

function pick(id) {
    waves.value = id
    load()
}

const fmtDate = (iso) => {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const main = r => `${r.score.toLocaleString()} 分`
function sub(r) {
    const parts = [r.cleared ? '通關' : `第 ${r.reachedWave} 波`]
    if (r.cleared && r.clearSeconds !== null) parts.push(fmtTime(r.clearSeconds))
    if (r.damageRatio !== null) parts.push(`傷害 ${Math.round(r.damageRatio * 100)}%`)
    return parts.join(' · ')
}

async function load() {
    loading.value = true
    error.value = ''
    try {
        const res = await fetch(`${SERVER_URL}/api/gem-td/leaderboard?waves=${waves.value}`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || '讀取失敗')
        rows.value = data.rows
    } catch (e) {
        rows.value = []
        error.value = e.message || '排行榜暫時無法讀取'
    } finally {
        loading.value = false
    }
}

onMounted(load)
</script>
