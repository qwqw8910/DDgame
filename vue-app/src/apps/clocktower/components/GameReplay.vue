<template>
    <!-- 終局：完整魔典 + 時間軸回放 + 日誌列表（含說書人所有修改、給出的資訊）+ 私聊內容 / 統計 -->
    <CtDialog :open="open" title="終局魔典與日誌" wide @close="$emit('close')">
        <div class="flex flex-col gap-4">
            <div role="tablist" class="flex flex-wrap gap-1">
                <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key"
                    :class="['rounded-full border px-3 py-1 text-sm', tab === t.key ? 'border-neon-purple bg-neon-purple/15 text-heading' : 'border-border text-body']"
                    @click="tab = t.key">{{ t.label }}</button>
            </div>

            <!-- 魔典 -->
            <section v-if="tab === 'grimoire'" class="flex flex-col gap-2">
                <ul class="m-0 grid list-none grid-cols-1 gap-1.5 p-0 sm:grid-cols-2">
                    <li v-for="s in view.seats" :key="s.index" class="flex flex-col gap-1 rounded-lg bg-subtle px-2 py-1.5">
                        <div class="flex items-center gap-2">
                            <RoleToken :role-id="s.roleId" :size="30" />
                            <div class="min-w-0 flex-1">
                                <p :class="['m-0 truncate text-sm font-semibold text-heading', s.isDead ? 'line-through opacity-70' : '']">{{ s.index + 1 }}. {{ view.names[s.playerId] ?? '?' }}</p>
                                <p class="m-0 text-xs text-body">{{ roleName(s.roleId) }}{{ s.roleId !== s.shownRoleId ? `（以為是 ${roleName(s.shownRoleId)}）` : '' }}{{ s.hasLeft ? '・已離開' : '' }}</p>
                            </div>
                        </div>
                        <div v-if="remindersOf(s.index).length" class="flex flex-wrap gap-0.5">
                            <ReminderToken v-for="r in remindersOf(s.index)" :key="r.id" :reminder="r" />
                        </div>
                        <details v-if="messagesOf(s.playerId).length" class="text-xs">
                            <summary class="cursor-pointer text-label">收到的資訊（{{ messagesOf(s.playerId).length }}）</summary>
                            <ul class="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                                <li v-for="m in messagesOf(s.playerId)" :key="m.id" class="rounded bg-card px-1.5 py-1">
                                    <span class="text-body">第 {{ m.dayNumber + (m.phase === 'night' ? 1 : 0) }} {{ m.phase === 'night' ? '夜' : '天' }}：</span>
                                    <span class="text-heading">{{ describeMessage(m, ctx) }}</span>
                                </li>
                            </ul>
                        </details>
                    </li>
                </ul>
                <p class="m-0 text-sm text-label">惡魔偽裝：<RoleToken v-for="b in view.grimoire?.bluffs ?? []" :key="b" :role-id="b" :size="18" inline show-name class="mr-2" /></p>
            </section>

            <!-- 時間軸回放 -->
            <ReplayTimeline v-else-if="tab === 'replay'" :log="view.log" :seats="view.seats" :names="view.names" :ctx="ctx" />

            <!-- 日誌 -->
            <ol v-else-if="tab === 'log'" class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                <li v-for="e in view.log" :key="e.id" class="flex gap-2 rounded px-1 py-0.5" :class="e.public ? '' : 'bg-neon-purple/10'">
                    <span class="w-14 shrink-0 text-xs tabular-nums text-body">{{ formatClock(e.at) }}</span>
                    <span class="text-heading">{{ describeLog(e, ctx) }}<span v-if="infoVerdict(e)" class="ml-1 text-xs text-lemon">（{{ infoVerdict(e) }}）</span></span>
                </li>
            </ol>

            <!-- 私聊統計 -->
            <WhisperStats v-else-if="tab === 'stats'" :whisper-log="view.whisperLog ?? []" :seats="view.seats" :names="view.names" :day-number="view.dayNumber" />

            <!-- 私聊內容 -->
            <section v-else class="flex flex-col gap-3">
                <p v-if="!groups.length" class="m-0 text-sm text-body">這局沒有人私聊。</p>
                <article v-for="g in groups" :key="g.id" class="rounded-lg border border-border p-2">
                    <h4 class="m-0 mb-1 flex items-center gap-1.5 text-sm text-heading">
                        <span class="h-2.5 w-2.5 rounded-full" :style="{ background: g.color }"></span>
                        第 {{ g.dayNumber }} 天 {{ formatClock(g.createdAt) }}–{{ g.endedAt ? formatClock(g.endedAt) : '' }}：{{ (g.participants ?? []).map(id => view.names[id] ?? '?').join('・') }}
                    </h4>
                    <div class="flex flex-col gap-1">
                        <ChatMessage v-for="m in g.history" :key="m.id" :message="m" :names="view.names" :seats="view.seats" />
                        <p v-if="!g.history.length" class="m-0 text-xs text-body">（沒有文字訊息）</p>
                    </div>
                </article>
            </section>
        </div>
    </CtDialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import CtDialog from './CtDialog.vue'
import RoleToken from './RoleToken.vue'
import ReminderToken from './ReminderToken.vue'
import ChatMessage from './ChatMessage.vue'
import ReplayTimeline from './ReplayTimeline.vue'
import WhisperStats from './WhisperStats.vue'
import { describeLog, describeMessage, infoVerdict } from '../data/labels.js'
import { formatClock } from '../data/constants.js'
import { roleInfo } from '../composables/useClocktower.js'

const props = defineProps({
    open: { type: Boolean, default: false },
    view: { type: Object, required: true },
})
defineEmits(['close'])

const tabs = [
    { key: 'grimoire', label: '魔典' }, { key: 'replay', label: '時間軸回放' }, { key: 'log', label: '日誌' },
    { key: 'whispers', label: '私聊內容' }, { key: 'stats', label: '私聊統計' },
]
const tab = ref('grimoire')
const roleName = id => roleInfo(id)?.name ?? id ?? '（無）'
const ctx = computed(() => ({
    seatName: i => `${i + 1}號 ${props.view.names[props.view.seats[i]?.playerId] ?? ''}`,
    name: id => props.view.names[id] ?? '?',
    roleName,
}))
const remindersOf = i => (props.view.grimoire?.reminders ?? []).filter(r => r.seat === i)
const messagesOf = id => props.view.grimoire?.messages?.[id] ?? []
const groups = computed(() => Object.values(props.view.chat.whispers).sort((a, b) => a.createdAt - b.createdAt))
</script>
