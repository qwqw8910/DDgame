<template>
    <!-- 單一座位：名字、存活 / 死亡、幽靈票、已離開、私聊中、提名、投票舉手；說書人另見角色與提醒標記 -->
    <button type="button"
        :class="['group relative flex w-full flex-col items-center gap-0.5 rounded-xl p-1 text-center outline-none transition-transform focus-visible:ring-2 focus-visible:ring-neon-cyan',
            clickable ? 'cursor-pointer hover:scale-105' : 'cursor-default',
            selected ? 'ring-2 ring-neon-cyan bg-neon-cyan/10' : '',
            pointer ? 'ring-2 ring-lemon bg-lemon/15 animate-timer-pulse' : '']"
        :aria-label="ariaLabel" :title="statusText" @click="clickable && $emit('click')">
        <!-- 頭像 / 角色 -->
        <span class="relative">
            <RoleToken v-if="seat.roleId" :role-id="seat.roleId" :size="tokenSize" />
            <span v-else :class="['flex items-center justify-center rounded-full border-2 bg-subtle font-bold text-heading',
                seat.empty ? 'border-dashed border-border-glow text-body' : 'border-border-glow']"
                :style="{ width: `${tokenSize}px`, height: `${tokenSize}px`, fontSize: `${Math.round(tokenSize * 0.38)}px` }">
                <GameIcon v-if="seat.empty" id="seat" :size="Math.round(tokenSize * 0.5)" />
                <GameIcon v-else-if="seat.isBot" id="bot" :size="Math.round(tokenSize * 0.5)" />
                <template v-else>{{ initial }}</template>
            </span>
            <!-- 死亡 / 已離開覆蓋 -->
            <span v-if="seat.hasLeft || seat.isDead" class="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
                <GameIcon :id="seat.hasLeft ? 'left' : 'dead'" :size="Math.round(tokenSize * 0.5)" />
            </span>
            <!-- 角落徽章 -->
            <span v-if="!seat.empty && !seat.isBot && online === false" class="absolute -left-1 -top-1" title="離線"><GameIcon id="offline" :size="14" /></span>
            <span v-if="seat.isDead && !seat.hasLeft && !seat.ghostVoteUsed" class="absolute -right-1 -top-1" title="還有幽靈票"><GameIcon id="ghostVote" :size="14" /></span>
            <span v-if="whispering" class="absolute -bottom-1 -right-1" title="私聊中"><GameIcon id="whisper" :size="14" /></span>
            <span v-if="handUp" class="absolute -bottom-1 -left-1 animate-bounce-in" title="舉手"><GameIcon id="vote" :size="16" /></span>
            <span v-if="seat.deathPending" class="absolute -right-1 -bottom-1 rounded bg-ruby px-1 text-[9px] font-bold text-white">夜死</span>
        </span>
        <span :class="['max-w-full truncate text-[11px] sm:text-xs font-semibold leading-tight', isMe ? 'text-neon-cyan' : 'text-heading', seat.isDead ? 'line-through opacity-70' : '']">
            {{ seat.index + 1 }}. {{ seat.empty ? '空位' : seat.name }}
        </span>
        <span v-if="seat.drunkAs && seat.roleId === 'drunk'" class="text-[10px] text-body">以為是 <RoleToken :role-id="seat.drunkAs" :size="14" inline show-name /></span>
        <span v-if="badge" class="rounded-full bg-neon-purple/30 px-1.5 text-[10px] font-semibold text-heading">{{ badge }}</span>
        <span v-if="impaired" class="text-[10px] text-lemon" title="中毒 / 醉酒"><GameIcon id="warn" :size="10" /> 失能</span>
        <span v-if="reminders.length" class="flex max-w-full flex-wrap justify-center gap-0.5">
            <ReminderToken v-for="r in reminders" :key="r.id" :reminder="r" />
        </span>
    </button>
</template>

<script setup>
import { computed } from 'vue'
import RoleToken from './RoleToken.vue'
import GameIcon from './GameIcon.vue'
import ReminderToken from './ReminderToken.vue'

const props = defineProps({
    seat: { type: Object, required: true },   // { index, playerId, name, isDead, ghostVoteUsed, hasLeft, isBot, roleId?, empty? }
    tokenSize: { type: Number, default: 44 },
    isMe: { type: Boolean, default: false },
    online: { type: Boolean, default: undefined },
    selected: { type: Boolean, default: false },
    pointer: { type: Boolean, default: false },
    handUp: { type: Boolean, default: false },
    whispering: { type: Boolean, default: false },
    badge: { type: String, default: '' },
    impaired: { type: Boolean, default: false },
    reminders: { type: Array, default: () => [] },
    clickable: { type: Boolean, default: true },
    whisperText: { type: String, default: '' },
})
defineEmits(['click'])

const initial = computed(() => (props.seat.name ?? '?').trim().charAt(0).toUpperCase())
const statusText = computed(() => {
    const s = props.seat
    if (s.empty) return '空位'
    const parts = [s.name]
    if (s.hasLeft) parts.push('已離開')
    else if (s.isDead) parts.push(s.ghostVoteUsed ? '死亡（幽靈票已用）' : '死亡（還有幽靈票）')
    if (props.whisperText) parts.push(props.whisperText)
    return parts.join('・')
})
const ariaLabel = computed(() => `座位 ${props.seat.index + 1}：${statusText.value}`)
</script>
