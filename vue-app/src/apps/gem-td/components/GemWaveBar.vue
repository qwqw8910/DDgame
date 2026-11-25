<template>
    <!-- 出怪中的底部列：建造階段這一排放甜點與準備，出怪時換成全隊戰況，不留一整條空白 -->
    <div class="gt-wavebar" role="status" aria-label="出怪戰況">
        <div class="gt-wavebar-block min-w-[180px]">
            <span class="gt-wavebar-label">{{ view.options.livesMode === 'team' || view.relay ? '隊伍血量' : '我的血量' }}</span>
            <div class="flex items-center gap-2">
                <div class="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-(--gt-line-soft)" role="progressbar" aria-label="血量"
                    :aria-valuenow="lives" aria-valuemin="0" :aria-valuemax="view.maxLives">
                    <div class="h-full rounded-full transition-[width] duration-300" :class="pct > 50 ? 'bg-[#3CCB72]' : pct > 25 ? 'bg-[#F2B233]' : 'bg-[#F0506E]'" :style="{ width: `${pct}%` }" />
                </div>
                <b class="shrink-0 text-lg tabular-nums text-(--gt-ink)">{{ lives }}<span class="text-sm font-normal text-(--gt-muted)">／{{ view.maxLives }}</span></b>
            </div>
        </div>

        <div class="gt-wavebar-block">
            <span class="gt-wavebar-label">{{ view.nextWave?.test ? '傷害測試' : `第 ${view.nextWave?.number} 波` }}</span>
            <template v-if="view.nextWave?.test">
                <b class="text-lg tabular-nums text-(--gt-ink)">{{ (progress.damage).toLocaleString() }}<span class="text-sm font-normal text-(--gt-muted)">／{{ view.nextWave.hp.toLocaleString() }} 傷害</span></b>
            </template>
            <b v-else class="text-lg tabular-nums text-(--gt-ink)">擊殺 {{ progress.killed }}<span class="text-sm font-normal text-(--gt-muted)">／{{ total }}</span>
                <span v-if="progress.leaked" class="ml-2 text-sm font-semibold text-(--gt-accent-ink)">漏 {{ progress.leaked }}</span></b>
        </div>

        <!-- 環形接力：每區漏出去（傳給下一區）的數量，誰漏得多一目了然 -->
        <ul v-if="view.relay" class="gt-wavebar-zones" aria-label="各區傳出的蟲">
            <li v-for="z in zoneRows" :key="z.id" class="gt-wavebar-zone" :class="z.top && 'gt-wavebar-zone--top'" :title="`${z.name}：擊殺 ${z.kills}，漏給下一區 ${z.handoff}`">
                <span class="size-2.5 shrink-0 rounded-full" :style="{ background: z.color }" aria-hidden="true" />
                <span class="font-bold" :style="{ color: z.color }">{{ z.label }}</span>
                <span class="tabular-nums text-(--gt-ink)">殺 {{ z.kills }}</span>
                <span class="tabular-nums text-(--gt-muted)">傳 {{ z.handoff }}</span>
            </li>
        </ul>

        <!-- 主動技能：全場減速、全場暈眩，冷卻跑完才能再用 -->
        <div v-if="!view.relay && skillList.length" class="flex shrink-0 items-center gap-2" aria-label="主動技能">
            <button v-for="s in skillList" :key="s.id" class="gt-skill" :class="[`gt-skill--${s.id}`, canCast && s.ready && 'gt-skill--ready']" :disabled="!canCast || !s.ready"
                :aria-label="`${s.name}：${s.desc}`" :title="s.disabledReason || `${s.name}：${s.desc}（${s.duration} 秒，施放後 ${s.cooldownWaves} 波才能再用）`" :aria-keyshortcuts="s.key" @click="$emit('skill', s.id)">
                <svg v-if="s.id === 'freeze'" class="gt-skill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
                    <path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7" />
                    <path d="M9.5 3.8L12 6.3l2.5-2.5M9.5 20.2L12 17.7l2.5 2.5M2.9 10.6l3.4 1-1 3.4M21.1 13.4l-3.4-1 1-3.4M2.9 13.4l3.4-1-1-3.4M21.1 10.6l-3.4 1 1 3.4" />
                </svg>
                <svg v-else class="gt-skill-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 2.5l2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.4 6.3 19.7l1.4-6.3-4.8-4.3 6.4-.7z" />
                </svg>
                <span class="gt-skill-name">{{ s.name }}</span>
                <span v-if="canCast && s.sk > 0" class="gt-skill-cd tabular-nums" :aria-label="`還要 ${s.sk} 波`">{{ s.sk }}</span>
                <kbd v-if="keys" class="gt-skill-key" aria-hidden="true">{{ s.key }}</kbd>
            </button>
        </div>

        <div class="ml-auto flex shrink-0 items-center gap-2">
            <button v-if="isHost" class="gt-btn gt-btn--small" :aria-label="`目前 ${view.speed} 倍速，切換為 ${nextSpeed(view.speed)} 倍`" @click="$emit('speed', nextSpeed(view.speed))">
                {{ view.speed }}× 倍速<kbd v-if="keys && !view.relay" class="gt-kbd ml-2" aria-hidden="true">F</kbd>
            </button>
            <button v-if="isSolo" class="gt-btn gt-btn--small" @click="$emit('pause')">暫停<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">P</kbd></button>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { nextSpeed, zoneLabels, ZONE_COLORS } from '../data/gems.js'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, default: null },
    frame: { type: Object, default: null },
    isHost: { type: Boolean, default: false },
    isSolo: { type: Boolean, default: false },
    keys: { type: Boolean, default: false },
    canCast: { type: Boolean, default: false },
})
defineEmits(['speed', 'pause', 'skill'])

const skillList = computed(() => {
    const skills = props.catalog?.skills
    if (!skills) return []
    const sk = props.frame?.sk
    return Object.entries(skills).map(([id, s], i) => ({
        id, ...s, sk: sk?.[i] ?? 0, ready: !!sk && sk[i] === 0,
        disabledReason: sk ? '' : '這一波不能使用技能',
    }))
})

const lives = computed(() => props.frame?.players?.[props.view.playerIds[0]]?.lives ?? props.view.lives)
const pct = computed(() => Math.max(0, Math.min(100, (lives.value / props.view.maxLives) * 100)))

const progress = computed(() => {
    const players = props.frame?.players
    if (!players) return { killed: 0, leaked: 0, damage: 0 }
    if (props.frame.ring) {
        const sum = key => Object.values(players).reduce((n, p) => n + p[key], 0)
        return { killed: sum('killed'), leaked: sum('leaked'), damage: sum('damage') }
    }
    return players[props.view.watching] ?? { killed: 0, leaked: 0, damage: 0 }
})
const total = computed(() => props.frame?.total ?? props.view.nextWave?.count ?? 0)

const colorOf = i => props.catalog?.relay?.colors?.[i] ?? ZONE_COLORS[i % ZONE_COLORS.length]
const zoneRows = computed(() => {
    const labels = zoneLabels(props.view)
    const live = props.frame?.zs
    const rows = (props.view.relay?.zones ?? []).map((z, i) => ({
        id: z.id, index: z.index, label: labels[i], color: colorOf(z.index), name: props.view.names?.[z.id] ?? '玩家',
        kills: (live?.[i] ?? z.stats).kills, handoff: (live?.[i] ?? z.stats).handoff,
    }))
    const max = Math.max(0, ...rows.map(r => r.handoff))
    return rows.map(r => ({ ...r, top: max > 0 && r.handoff === max }))
})
</script>

<style scoped>
.gt-wavebar { display: flex; flex: 1; align-items: center; gap: 20px; min-width: 0; padding: 0 4px; }
.gt-wavebar-block { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.gt-wavebar-label { font-size: 13px; color: var(--gt-muted); }
.gt-wavebar-zones { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; margin: 0; padding: 0; list-style: none; }
.gt-wavebar-zone {
    display: flex; align-items: center; gap: 6px; padding: 4px 10px; border: 1px solid var(--gt-line-soft);
    border-radius: 999px; background: var(--gt-surface); font-size: 14px; white-space: nowrap;
}
.gt-wavebar-zone--top { border-color: var(--gt-accent); background: var(--gt-accent-soft); }
</style>
