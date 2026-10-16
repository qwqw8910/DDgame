<template>
    <!-- 終局時間軸回放：逐筆播放日誌，圓桌顯示當時的角色、存活與參與這個事件的座位 -->
    <section class="flex flex-col gap-2" aria-label="時間軸回放">
        <p v-if="!frames.length" class="m-0 text-sm text-body">沒有可回放的紀錄。</p>
        <template v-else>
            <div class="relative mx-auto aspect-square w-full max-w-sm">
                <TownCircle :seats="frameSeats" :names="names" :badges="frame.badges" :selected="frame.highlight" :clickable="false">
                    <template #center>
                        <GameIcon :id="frame.entry.phase === 'night' ? 'night' : frame.entry.type === 'winner' ? 'trophy' : 'day'" :size="22" />
                        <p class="m-0 text-xs font-semibold text-heading">{{ phaseLabel(frame.entry) }}</p>
                        <p class="m-0 text-[11px] tabular-nums text-body">{{ formatClock(frame.entry.at) }}</p>
                    </template>
                </TownCircle>
            </div>

            <!-- 目前事件 -->
            <p class="m-0 min-h-[3rem] rounded-lg px-2 py-1.5 text-sm text-heading" :class="frame.entry.public ? 'bg-subtle' : 'bg-neon-purple/10'" aria-live="polite">
                <span class="mr-1 text-xs text-body">{{ index + 1 }}/{{ frames.length }}</span>
                {{ describeLog(frame.entry, ctx) }}
                <span v-if="infoVerdict(frame.entry)" class="ml-1 text-xs text-lemon">（{{ infoVerdict(frame.entry) }}）</span>
                <span v-if="!frame.entry.public" class="ml-1 text-[11px] text-body">・當時只有說書人知道</span>
            </p>

            <!-- 控制列 -->
            <div class="flex flex-wrap items-center justify-center gap-1">
                <button type="button" class="header-icon-btn" aria-label="回到開頭" :disabled="index === 0" @click="go(0)"><GameIcon id="first" :size="16" /></button>
                <button type="button" class="header-icon-btn" aria-label="上一步" :disabled="index === 0" @click="go(index - 1)"><GameIcon id="stepBack" :size="16" /></button>
                <button type="button" class="btn-primary !w-auto !px-4 !py-1 text-sm" :aria-label="playing ? '暫停' : '播放'" @click="toggle">
                    <GameIcon :id="playing ? 'pause' : 'play'" :size="14" /> {{ playing ? '暫停' : '播放' }}
                </button>
                <button type="button" class="header-icon-btn" aria-label="下一步" :disabled="atEnd" @click="go(index + 1)"><GameIcon id="stepForward" :size="16" /></button>
                <button type="button" class="header-icon-btn" aria-label="跳到最後" :disabled="atEnd" @click="go(frames.length - 1)"><GameIcon id="last" :size="16" /></button>
                <select v-model.number="speed" class="game-input !w-auto cursor-pointer !py-1 text-xs" aria-label="播放速度">
                    <option v-for="s in SPEEDS" :key="s.ms" :value="s.ms">{{ s.label }}</option>
                </select>
            </div>
            <input type="range" min="0" :max="frames.length - 1" :value="index" class="w-full accent-[var(--color-neon-purple)]" aria-label="時間軸位置"
                @input="go(Number($event.target.value))" />
            <label class="flex items-center justify-center gap-1 text-xs text-label">
                <input v-model="importantOnly" type="checkbox" /> 只看重要事件（略過喚醒、提醒標記、階段切換）
            </label>
        </template>
    </section>
</template>

<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import TownCircle from './TownCircle.vue'
import GameIcon from './GameIcon.vue'
import { buildReplay, phaseLabel } from '../data/replay.js'
import { describeLog, infoVerdict } from '../data/labels.js'
import { formatClock } from '../data/constants.js'

const props = defineProps({
    log: { type: Array, default: () => [] },
    seats: { type: Array, default: () => [] },
    names: { type: Object, default: () => ({}) },
    ctx: { type: Object, required: true },   // { seatName, name, roleName }
})

const SPEEDS = [{ ms: 600, label: '快' }, { ms: 1500, label: '標準' }, { ms: 3000, label: '慢' }]
const importantOnly = ref(true)
const speed = ref(1500)
const index = ref(0)
const playing = ref(false)

const frames = computed(() => buildReplay(props.log, props.seats, { importantOnly: importantOnly.value }))
const frame = computed(() => frames.value[Math.min(index.value, frames.value.length - 1)])
const frameSeats = computed(() => frame.value.seats.map(s => ({ ...s, name: props.names[s.playerId] ?? '?' })))
const atEnd = computed(() => index.value >= frames.value.length - 1)

// 切換「只看重要事件」時停在同一個時間點附近
watch(importantOnly, () => {
    const at = frame.value?.entry.at ?? 0
    const i = frames.value.findIndex(f => f.entry.at >= at)
    index.value = i < 0 ? frames.value.length - 1 : i
})

let _timer = null
function stop() { playing.value = false; clearInterval(_timer); _timer = null }
function go(i) { index.value = Math.max(0, Math.min(frames.value.length - 1, i)) }
function toggle() {
    if (playing.value) return stop()
    if (atEnd.value) index.value = 0
    playing.value = true
    _timer = setInterval(() => { if (atEnd.value) stop(); else index.value += 1 }, speed.value)
}
watch(speed, () => { if (playing.value) { stop(); toggle() } })
onUnmounted(stop)
</script>
