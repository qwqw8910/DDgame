<template>
    <!-- 單則訊息：解析 [[role:id]] / [[seat:n]] 標籤；連結一律當純文字 -->
    <div :class="['flex flex-col gap-0.5 rounded-lg px-2.5 py-1.5 text-sm', message.system ? 'bg-neon-purple/10 text-label italic' : mine ? 'bg-neon-cyan/10' : 'bg-subtle']">
        <div v-if="!message.system" class="flex items-baseline justify-between gap-2 text-[11px]">
            <span :class="['font-semibold', mine ? 'text-neon-cyan' : 'text-label']">{{ fromName }}</span>
            <span class="text-body tabular-nums">{{ formatClock(message.at) }}</span>
        </div>
        <p class="m-0 whitespace-pre-wrap break-words leading-relaxed text-heading">
            <template v-for="(part, i) in parts" :key="i">
                <RoleToken v-if="part.role" :role-id="part.role" :size="16" inline show-name class="mx-0.5 rounded bg-card px-1" />
                <span v-else-if="part.seat !== undefined" class="mx-0.5 rounded bg-card px-1 font-semibold text-neon-cyan">{{ part.seatLabel }}</span>
                <template v-else>{{ part.text }}</template>
            </template>
        </p>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import RoleToken from './RoleToken.vue'
import { formatClock } from '../data/constants.js'

const props = defineProps({
    message: { type: Object, required: true }, // { id, from, text, at, system? }
    names: { type: Object, default: () => ({}) },
    seats: { type: Array, default: () => [] },
    myId: { type: String, default: null },
    storytellerId: { type: String, default: null },
})

const mine = computed(() => !!props.myId && props.message.from === props.myId)
const fromName = computed(() => {
    const id = props.message.from
    if (id && id === props.storytellerId) return `說書人（${props.names[id] ?? '?'}）`
    return props.names[id] ?? '（已離開）'
})

const TAG = /\[\[(role|seat):([a-z0-9]+)\]\]/g
const parts = computed(() => {
    const text = props.message.text ?? ''
    const out = []
    let last = 0
    for (const m of text.matchAll(TAG)) {
        if (m.index > last) out.push({ text: text.slice(last, m.index) })
        if (m[1] === 'role') out.push({ role: m[2] })
        else {
            const n = Number(m[2])
            const seat = props.seats[n - 1]
            out.push({ seat: n, seatLabel: seat ? `${n}號 ${props.names[seat.playerId] ?? ''}` : `${n}號` })
        }
        last = m.index + m[0].length
    }
    if (last < text.length) out.push({ text: text.slice(last) })
    return out
})
</script>
