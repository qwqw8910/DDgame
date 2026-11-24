<template>
    <section class="gt-panel gt-mini" aria-label="整體地圖">
        <header v-if="!compact" class="gt-panel-head">
            <h2 class="gt-panel-title">整體地圖</h2>
            <span class="gt-panel-meta">點區域跳過去</span>
        </header>
        <div class="gt-panel-body" :class="compact ? '!p-1' : '!p-2'">
            <svg ref="svgRef" class="block w-full cursor-pointer touch-none select-none" :viewBox="viewBox" preserveAspectRatio="xMidYMid meet" role="group"
                aria-label="所有玩家的地圖，由左到右排成一列；每個方塊是一位玩家，點一下切換過去" @click="onClick">
                <!-- 傳送路線：最後一區回到第一區 -->
                <path v-if="zones.length > 1" :d="wrapPath" fill="none" stroke="var(--gt-faint)" stroke-width="0.9" stroke-dasharray="2.5 2" />
                <g v-for="z in zoneRects" :key="z.id">
                    <rect :x="z.x" :y="z.y" :width="size" :height="size" rx="2" :fill="`${z.color}26`" :stroke="z.color" :stroke-width="z.on ? 2.6 : 1.2" />
                    <text :x="z.x + size / 2" :y="z.y + size / 2 + 3" text-anchor="middle" :fill="z.color" font-weight="800" font-size="8" aria-hidden="true">{{ z.label }}</text>
                </g>
                <!-- 蟲：每隻一個小點，顏色是出生區 -->
                <circle v-for="d in dots" :key="d.id" :cx="d.x" :cy="d.y" :r="d.boss ? 2.4 : 1.1" :fill="d.color" :stroke="d.boss ? '#fff' : 'none'" stroke-width="0.6" />
                <!-- 目前主地圖看到的範圍 -->
                <rect v-if="camera" :x="camera.x" :y="camera.y" :width="camera.w" :height="camera.h" fill="none" stroke="var(--gt-ink)" stroke-width="1.1" stroke-dasharray="3 2" pointer-events="none" />
            </svg>
            <ul v-if="!compact" class="m-0 mt-1.5 flex list-none flex-wrap gap-x-3 gap-y-0.5 p-0 text-xs text-(--gt-muted)">
                <li v-for="z in zoneRects" :key="z.id" class="flex items-center gap-1"><span class="size-2 rounded-full" :style="{ background: z.color }" aria-hidden="true" />{{ z.bot || z.label === z.name ? z.label : `${z.label}＝${z.name}` }}</li>
            </ul>
        </div>
    </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { zoneLabels, ZONE_COLORS } from '../data/gems.js'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, default: null },
    frame: { type: Object, default: null },
    camera: { type: Object, default: null }, // 主地圖目前看到的世界範圍 { x, y, w, h }
    compact: { type: Boolean, default: false }, // 手機最下面那一排：只留地圖本身
})
const emit = defineEmits(['goto'])

const svgRef = ref(null)
const layout = computed(() => props.view.relay.layout)
const zones = computed(() => props.view.relay.zones)
const labels = computed(() => zoneLabels(props.view))
const size = computed(() => layout.value.size)
const colorOf = i => props.catalog?.relay?.colors?.[i] ?? ZONE_COLORS[i % ZONE_COLORS.length]

// 視窗留一點邊，下面空一條放「回到第一區」的傳送線
const box = computed(() => {
    const b = layout.value.bounds
    return { x: b.minX + 1, y: b.minY + 1, w: b.maxX - b.minX - 2, h: b.maxY - b.minY - 2 + 8 }
})
const viewBox = computed(() => `${box.value.x} ${box.value.y} ${box.value.w} ${box.value.h}`)

const zoneRects = computed(() => zones.value.map((z, i) => ({
    id: z.id,
    index: i,
    label: labels.value[i],
    bot: z.bot,
    color: colorOf(i),
    name: props.view.names?.[z.id] ?? '玩家',
    on: z.id === props.view.watching,
    x: layout.value.zones[i].origin.x,
    y: layout.value.zones[i].origin.y,
})))

// 最後一區的出口弧回第一區的入口（畫在方塊下方）
const wrapPath = computed(() => {
    const first = layout.value.zones[0].origin
    const last = layout.value.zones.at(-1).origin
    const y = last.y + size.value
    const a = last.x + size.value / 2
    const b = first.x + size.value / 2
    return `M ${a} ${y} Q ${(a + b) / 2} ${y + 14} ${b} ${y}`
})

const dots = computed(() => {
    const f = props.frame
    if (!f?.ring) return []
    const types = props.catalog?.monsters ?? []
    return f.m.slice(0, 400).map(([id, type, x, y, , , born]) => ({ id, x: x / 10, y: y / 10, color: colorOf(born), boss: !!types[type]?.boss }))
})

function onClick(e) {
    const svg = svgRef.value
    const ctm = svg.getScreenCTM()
    if (!ctm) return
    const pt = svg.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const w = pt.matrixTransform(ctm.inverse())
    const i = zoneRects.value.findIndex(z => w.x >= z.x && w.x <= z.x + size.value && w.y >= z.y && w.y <= z.y + size.value)
    emit('goto', i >= 0 ? { zone: i } : { x: w.x, y: w.y })
}
</script>
