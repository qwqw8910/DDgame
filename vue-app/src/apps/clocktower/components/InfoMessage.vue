<template>
    <!-- 說書人送出的一則夜晚資訊（玩家彈窗、紀錄、終局回放共用） -->
    <div class="flex flex-col gap-1.5">
        <div v-if="message.roleId" class="flex items-center gap-1 text-xs text-body">
            <RoleToken :role-id="message.roleId" :size="16" inline show-name /> 的能力
        </div>
        <template v-if="message.type === 'info-number'">
            <span class="text-4xl font-bold text-neon-cyan tabular-nums">{{ message.number }}</span>
        </template>
        <template v-else-if="message.type === 'info-yes-no'">
            <span :class="['text-3xl font-bold', message.yes ? 'text-success-text' : 'text-ruby']">{{ message.yes ? '是' : '否' }}</span>
        </template>
        <template v-else-if="message.type === 'info-players-role'">
            <span class="text-heading">
                <strong>{{ (message.players ?? []).map(seatName).join('、') || '（沒有玩家）' }}</strong>
                之中有一位是
            </span>
            <RoleToken v-if="message.showRole" :role-id="message.showRole" :size="40" show-name />
            <span v-else class="text-heading">（場上沒有此類角色）</span>
        </template>
        <template v-else-if="message.type === 'info-role'">
            <span v-if="Number.isInteger(message.player)" class="text-heading"><strong>{{ seatName(message.player) }}</strong> 的角色是</span>
            <RoleToken :role-id="message.showRole" :size="40" show-name />
        </template>
        <template v-else-if="message.type === 'evil-info'">
            <p v-if="message.demons?.length" class="m-0 text-heading">惡魔：<strong>{{ message.demons.map(seatName).join('、') }}</strong></p>
            <p v-if="message.minions?.length" class="m-0 text-heading">爪牙：<strong>{{ message.minions.map(seatName).join('、') }}</strong></p>
            <div v-if="message.bluffs?.length" class="flex flex-col gap-1">
                <span class="text-sm text-label">不在場的善良角色（可以用來偽裝）：</span>
                <div class="flex flex-wrap gap-2"><RoleToken v-for="b in message.bluffs" :key="b" :role-id="b" :size="36" show-name /></div>
            </div>
        </template>
        <template v-else-if="message.type === 'info-grimoire'">
            <ul class="m-0 grid list-none grid-cols-2 gap-1 p-0 text-sm sm:grid-cols-3">
                <li v-for="s in message.grimoire.seats" :key="s.index" class="flex items-center gap-1 rounded bg-subtle px-1.5 py-1">
                    <RoleToken :role-id="s.roleId" :size="20" inline />
                    <span :class="['truncate text-heading', s.isDead ? 'line-through opacity-60' : '']">{{ seatName(s.index) }}</span>
                    <span v-if="s.reminders.length" class="text-[10px] text-lemon">+{{ s.reminders.length }}</span>
                </li>
            </ul>
        </template>
        <p v-if="message.text" class="m-0 whitespace-pre-wrap text-heading">{{ message.text }}</p>
        <RoleToken v-if="message.type === 'custom' && message.showRole" :role-id="message.showRole" :size="36" show-name />
    </div>
</template>

<script setup>
import RoleToken from './RoleToken.vue'

const props = defineProps({
    message: { type: Object, required: true },
    seats: { type: Array, default: () => [] },
    names: { type: Object, default: () => ({}) },
})
const seatName = i => `${i + 1}號 ${props.names[props.seats[i]?.playerId] ?? ''}`.trim()
</script>
