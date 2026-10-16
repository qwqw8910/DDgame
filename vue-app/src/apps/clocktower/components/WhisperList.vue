<template>
    <!-- 「私聊中」清單：點一列只高亮該組連線，再點一次取消 -->
    <section v-if="groups.length" class="rounded-xl border border-border bg-card px-2.5 py-2" aria-label="私聊中">
        <h3 class="m-0 mb-1 flex items-center gap-1 text-xs font-semibold text-label"><GameIcon id="whisper" :size="12" /> 私聊中（{{ groups.length }} 組）</h3>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
            <li v-for="g in groups" :key="g.id">
                <button type="button" :aria-pressed="focusId === g.id"
                    :class="['flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-sm', focusId === g.id ? 'bg-subtle ring-1 ring-border-glow' : 'hover:bg-subtle', g.id === myGroupId ? 'font-semibold' : '']"
                    @click="$emit('focus', focusId === g.id ? null : g.id)">
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="{ background: g.color }"></span>
                    <span class="min-w-0 flex-1 truncate text-heading">{{ g.members.map(id => names[id] ?? '?').join('・') }}</span>
                    <span class="shrink-0 text-xs text-body tabular-nums">{{ minutes(g.createdAt) }} 分鐘</span>
                </button>
                <!-- 說書人：邀請與加入 / 離開時間（看不到內容） -->
                <ul v-if="memberLog?.[g.id]" class="m-0 mb-1 ml-6 list-none p-0 text-[11px] text-body">
                    <li v-for="(m, i) in memberLog[g.id]" :key="i">{{ names[m.playerId] ?? '?' }} {{ formatClock(m.joinAt) }}–{{ m.leaveAt ? formatClock(m.leaveAt) : '現在' }}</li>
                </ul>
            </li>
        </ul>
        <ul v-if="invites?.length" class="m-0 mt-1 list-none border-t border-divider p-0 pt-1 text-[11px] text-body">
            <li v-for="inv in invites" :key="inv.id">邀請中：{{ names[inv.from] ?? '?' }} → {{ names[inv.to] ?? '?' }}</li>
        </ul>
    </section>
</template>

<script setup>
import GameIcon from './GameIcon.vue'
import { formatClock } from '../data/constants.js'

const props = defineProps({
    groups: { type: Array, default: () => [] },
    names: { type: Object, default: () => ({}) },
    myGroupId: { type: String, default: null },
    focusId: { type: String, default: null },
    now: { type: Number, default: () => Date.now() },
    memberLog: { type: Object, default: null }, // 說書人：私聊總覽
    invites: { type: Array, default: null },
})
defineEmits(['focus'])
const minutes = t => Math.max(0, Math.floor((props.now - t) / 60000))
</script>
