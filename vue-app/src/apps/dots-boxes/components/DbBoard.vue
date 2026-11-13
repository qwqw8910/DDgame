<template>
    <!--
      點格棋盤面（SVG）。座標單位：格寬 100、外圍留 36。
      兩位玩家用「主色玫瑰紅」與「中性墨色」區分（設計系統只有一個主色），
      格內另外放字（普通模式＝拿下者的暱稱首字、進階模式＝分值），不單靠顏色辨識。
    -->
    <svg :viewBox="`0 0 ${S} ${S}`" role="group" :aria-label="`點格棋盤面，${size} × ${size} 格`"
        class="mx-auto block h-auto w-full max-w-[560px] max-h-[calc(100dvh-21rem)] max-lg:max-h-none select-none touch-manipulation">
        <!-- 格子 -->
        <g v-for="b in boxList" :key="b.i">
            <rect :x="b.x" :y="b.y" :width="CELL - 12" :height="CELL - 12" rx="10"
                :class="[
                    b.owner === 0 ? 'fill-brand/25' : b.owner === 1 ? 'fill-ink/20' : 'fill-transparent',
                    b.claimable ? 'stroke-ink-muted' : 'stroke-transparent',
                    b.fresh ? 'db-pop' : '',
                ]"
                stroke-width="3" stroke-dasharray="7 6" />
            <text v-if="b.label" :x="b.x + (CELL - 12) / 2" :y="b.y + (CELL - 12) / 2" text-anchor="middle"
                dominant-baseline="central" font-size="36" :class="['font-display', b.labelClass]" aria-hidden="true">{{ b.label }}</text>
        </g>

        <!-- 最後一步的光暈 -->
        <line v-if="lastGeom" :x1="lastGeom.from[0]" :y1="lastGeom.from[1]" :x2="lastGeom.to[0]" :y2="lastGeom.to[1]"
            stroke-width="18" stroke-linecap="round"
            :class="last.seat === 0 ? 'stroke-brand/30' : 'stroke-ink/25'" />

        <!-- 線段 -->
        <g v-for="e in edgeList" :key="e.i">
            <line v-if="lines[e.i] !== -1" :x1="e.from[0]" :y1="e.from[1]" :x2="e.to[0]" :y2="e.to[1]"
                stroke-width="9" stroke-linecap="round" :class="lines[e.i] === 0 ? 'stroke-brand' : 'stroke-ink'" />
            <g v-else class="db-edge" :class="canMove ? 'db-edge--live' : ''" :role="canMove ? 'button' : undefined"
                :tabindex="canMove ? 0 : undefined" :aria-label="canMove ? e.label : undefined"
                @click="pick(e.i)" @keydown.enter.prevent="pick(e.i)" @keydown.space.prevent="pick(e.i)">
                <line :x1="e.from[0]" :y1="e.from[1]" :x2="e.to[0]" :y2="e.to[1]" stroke-width="6"
                    stroke-linecap="round" class="db-edge-line stroke-ink/15" />
                <!-- 加粗的透明點擊區：手機手指好點 -->
                <line :x1="e.from[0]" :y1="e.from[1]" :x2="e.to[0]" :y2="e.to[1]" stroke-width="40"
                    stroke-linecap="butt" stroke="transparent" class="db-edge-hit" />
            </g>
        </g>

        <!-- 點 -->
        <circle v-for="d in dots" :key="d.k" :cx="d.x" :cy="d.y" r="7" class="fill-ink" />
    </svg>
</template>

<script setup>
import { computed } from 'vue'
import { CELL, PAD, boardSize, boxEdges, edgeGeometry, hCount } from '../data/constants.js'

const props = defineProps({
    size: { type: Number, required: true },
    mode: { type: String, default: 'classic' },
    lines: { type: Array, required: true },
    boxes: { type: Array, required: true },
    values: { type: Array, required: true },
    last: { type: Object, default: null },
    // 輪到我、遊戲進行中才可點
    canMove: { type: Boolean, default: false },
    // 座位 0/1 的暱稱首字（普通模式拿下的格子顯示）
    initials: { type: Array, default: () => ['', ''] },
})
const emit = defineEmits(['move'])

const S = computed(() => boardSize(props.size))

const edgeList = computed(() => {
    const n = props.size
    const H = hCount(n)
    return Array.from({ length: 2 * H }, (_, i) => {
        const g = edgeGeometry(n, i)
        const label = g.horizontal
            ? `橫線，第 ${g.r + 1} 排，第 ${g.c + 1} 格`
            : `直線，第 ${g.r + 1} 列，第 ${g.c + 1} 條`
        return { i, from: g.from, to: g.to, label }
    })
})

const dots = computed(() => {
    const n = props.size
    const out = []
    for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) out.push({ k: `${r}-${c}`, x: PAD + c * CELL, y: PAD + r * CELL })
    return out
})

const lastGeom = computed(() => (props.last ? edgeGeometry(props.size, props.last.edge) : null))

const boxList = computed(() => {
    const n = props.size
    const fresh = new Set(props.last?.claimed ?? [])
    return Array.from({ length: n * n }, (_, i) => {
        const owner = props.boxes[i]
        const drawn = boxEdges(n, i).filter(e => props.lines[e] !== -1).length
        let label = ''
        let labelClass = 'fill-ink-faint'
        if (owner !== -1) {
            label = props.mode === 'advanced' ? String(props.values[i]) : (props.initials[owner] ?? '')
            labelClass = owner === 0 ? 'fill-brand-ink' : 'fill-ink'
        } else if (props.mode === 'advanced') {
            label = String(props.values[i])
        }
        return {
            i, owner, label, labelClass,
            x: PAD + (i % n) * CELL + 6,
            y: PAD + Math.floor(i / n) * CELL + 6,
            // 已有 3 條邊：下一條線就能拿下，提示一下（提示對雙方都公開）
            claimable: owner === -1 && drawn === 3,
            fresh: fresh.has(i),
        }
    })
})

function pick(edge) {
    if (props.canMove && props.lines[edge] === -1) emit('move', edge)
}
</script>

<style scoped>
.db-edge { outline: none; }
.db-edge--live { cursor: pointer; }
.db-edge--live:hover .db-edge-line,
.db-edge--live:focus-visible .db-edge-line { stroke: var(--color-ink-muted); stroke-width: 9; }
.db-edge--live:focus-visible .db-edge-line { stroke: var(--color-brand); }
.db-edge:not(.db-edge--live) .db-edge-hit { pointer-events: none; }

/* 拿下格子：從中心彈出（只動 transform / opacity） */
.db-pop { transform-box: fill-box; transform-origin: center; animation: db-pop 260ms var(--ease-soft) both; }
@keyframes db-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .db-pop { animation: none; } }
</style>
