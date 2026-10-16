<template>
    <!-- 點座位打開的玩家選單：第一行是狀態，下方是操作（私聊 / 提名 / 紀錄；說書人另有魔典操作） -->
    <CtDialog :open="seat !== null" :title="title" @close="$emit('close')">
        <div v-if="s" class="flex flex-col gap-3">
            <!-- 狀態 -->
            <div class="flex flex-col gap-1 rounded-lg bg-subtle px-3 py-2 text-sm">
                <span class="text-heading"><GameIcon id="whisper" :size="14" />
                    {{ partners.length ? `正在和 ${partners.join('、')} 私聊` : '目前沒有私聊' }}</span>
                <span v-if="s.hasLeft" class="text-body"><GameIcon id="left" :size="14" /> 已離開（視同死亡，沒有幽靈票）</span>
                <span v-else-if="s.isDead" class="text-body"><GameIcon id="dead" :size="14" /> 死亡・{{ s.ghostVoteUsed ? '幽靈票已用' : '還有一張幽靈票' }}</span>
                <span v-if="online === false && !s.isBot" class="text-body"><GameIcon id="offline" :size="14" /> 離線中</span>
            </div>

            <!-- 玩家操作 -->
            <div v-if="role === 'player' && !isMe" class="flex flex-col gap-2">
                <button v-if="canInvite" class="btn-secondary btn-full" @click="act('invite')">
                    <GameIcon id="whisper" :size="16" /> 邀請私聊{{ myGroupId ? '（加入我的群組）' : '' }}
                </button>
                <button v-if="canNominate" class="btn-primary btn-full" @click="act('nominate')">
                    <GameIcon id="nominate" :size="16" /> 提名 {{ name }}
                </button>
            </div>
            <p v-if="role === 'player' && nominateBlockReason" class="m-0 text-xs text-body">{{ nominateBlockReason }}</p>

            <!-- 今日私聊紀錄 -->
            <section v-if="todayWhispers.length" class="text-sm">
                <h4 class="m-0 mb-1 text-xs font-semibold text-label">今日私聊紀錄</h4>
                <ul class="m-0 list-none p-0 text-body">
                    <li v-for="e in todayWhispers" :key="e.id">{{ formatClock(e.startAt) }}–{{ formatClock(e.endAt) }}　{{ e.participants.map(id => names[id] ?? '?').join(' ↔ ') }}</li>
                </ul>
            </section>

            <!-- 說書人操作 -->
            <template v-if="role === 'storyteller' && inGame">
                <div class="flex items-center gap-2">
                    <RoleToken :role-id="s.roleId" :size="40" show-name />
                    <span v-if="s.roleId === 'drunk'" class="text-xs text-body">以為是 {{ roleName(s.shownRoleId) }}</span>
                    <span v-if="impaired" class="text-xs text-lemon"><GameIcon id="warn" :size="12" /> 中毒 / 醉酒</span>
                </div>

                <div class="grid grid-cols-2 gap-2">
                    <button v-if="!s.hasLeft" class="btn-secondary" @click="act('dead', !s.isDead)">
                        <GameIcon :id="s.isDead ? 'day' : 'dead'" :size="16" /> {{ s.isDead ? '復活' : (phase === 'night' ? '確認死亡（天亮公布）' : '標記死亡') }}
                    </button>
                    <button class="btn-secondary" @click="act('dm')"><GameIcon id="chat" :size="16" /> 私訊</button>
                    <template v-if="phase === 'night' && !s.hasLeft">
                        <button class="btn-secondary" @click="act('wake', { count: wakeCount, notSelf: wakeNotSelf, text: wakeText })">
                            <GameIcon id="night" :size="16" /> 喚醒選人
                        </button>
                        <button class="btn-secondary" @click="act('info')"><GameIcon id="info" :size="16" /> 送資訊</button>
                    </template>
                </div>

                <details v-if="phase === 'night' && !s.hasLeft" class="text-sm">
                    <summary class="cursor-pointer text-label">喚醒設定</summary>
                    <div class="mt-2 flex flex-wrap items-center gap-2">
                        <label class="flex items-center gap-1 text-label">選
                            <select v-model.number="wakeCount" class="game-input !w-auto py-1"><option v-for="n in [1, 2, 3]" :key="n" :value="n">{{ n }}</option></select> 人
                        </label>
                        <label class="flex items-center gap-1 text-label"><input v-model="wakeNotSelf" type="checkbox" /> 不能選自己</label>
                        <input v-model="wakeText" class="game-input flex-1 py-1" maxlength="300" placeholder="附註（可留空）" />
                    </div>
                </details>

                <!-- 待回覆 prompt：代為選擇 -->
                <section v-if="pendingPrompt" class="rounded-lg border border-lemon/40 bg-lemon/10 p-2 text-sm">
                    <p class="m-0 mb-1 text-heading">等待回覆：選 {{ pendingPrompt.count }} 人</p>
                    <div class="flex flex-wrap gap-1">
                        <button v-for="o in seats" :key="o.index" type="button"
                            :class="['rounded border px-1.5 py-0.5 text-xs', actPicks.includes(o.index) ? 'border-neon-cyan text-heading' : 'border-border text-body']"
                            @click="toggleAct(o.index)">{{ o.index + 1 }}</button>
                    </div>
                    <div class="mt-2 flex gap-2">
                        <button class="btn-secondary flex-1 !py-1 text-sm" :disabled="actPicks.length !== pendingPrompt.count" @click="act('act-for', actPicks)">代為選擇</button>
                        <button class="btn-ghost-sm" @click="act('cancel-prompt')">取消喚醒</button>
                    </div>
                </section>

                <!-- 投票中：代座位舉手 -->
                <div v-if="voting && !s.hasLeft" class="flex gap-2">
                    <button class="btn-secondary flex-1" @click="act('hand', true)"><GameIcon id="vote" :size="16" /> 代為舉手</button>
                    <button class="btn-secondary flex-1" @click="act('hand', false)">代為放下</button>
                </div>

                <label class="flex flex-col gap-1 text-sm text-label">變更角色（小惡魔傳位、紅唇女郎接手…）
                    <select class="game-input cursor-pointer" :value="s.roleId" @change="act('role', $event.target.value)">
                        <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}（{{ TEAM_NAMES[r.team] }}）</option>
                    </select>
                </label>

                <div class="flex flex-col gap-1 text-sm">
                    <span class="text-label">提醒標記</span>
                    <div class="flex flex-wrap gap-1">
                        <ReminderToken v-for="r in seatReminders" :key="r.id" :reminder="r" removable @remove="id => act('remove-reminder', id)" />
                        <span v-if="!seatReminders.length" class="text-body">（無）</span>
                    </div>
                    <div class="flex gap-1">
                        <select v-model="newReminder" class="game-input flex-1 cursor-pointer py-1">
                            <option value="">新增提醒標記…</option>
                            <option v-for="r in reminderOptions" :key="r.id" :value="r.id">{{ r.label }}</option>
                        </select>
                        <button class="btn-secondary !w-auto !px-3 !py-1" :disabled="!newReminder" @click="act('add-reminder', newReminder); newReminder = ''">放</button>
                    </div>
                </div>
            </template>

            <!-- 說書人交接（遊戲中只能交給觀戰者，從房間玩家清單操作） -->
        </div>
    </CtDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import CtDialog from './CtDialog.vue'
import GameIcon from './GameIcon.vue'
import RoleToken from './RoleToken.vue'
import ReminderToken from './ReminderToken.vue'
import { TEAM_NAMES } from '../data/labels.js'
import { REMINDER_ASSETS } from '../data/assets.js'
import { formatClock } from '../data/constants.js'
import { scriptState, roleInfo } from '../composables/useClocktower.js'

const props = defineProps({
    seat: { type: Number, default: null },
    view: { type: Object, required: true },
})
const emit = defineEmits(['close', 'action'])

const v = computed(() => props.view)
const role = computed(() => v.value.viewer.role)
const phase = computed(() => v.value.phase)
const inGame = computed(() => ['night', 'day'].includes(phase.value))
const seats = computed(() => v.value.seats)
const names = computed(() => v.value.names)
const s = computed(() => (props.seat === null ? null : seats.value[props.seat]))
const name = computed(() => names.value[s.value?.playerId] ?? '?')
const title = computed(() => (s.value ? `${s.value.index + 1}號 ${name.value}` : ''))
const online = computed(() => v.value.online?.[s.value?.playerId])
const isMe = computed(() => s.value?.playerId === v.value.viewer.playerId)
const roleName = id => roleInfo(id)?.name ?? id

const group = computed(() => v.value.whisperGroups.find(g => g.members.includes(s.value?.playerId)))
const partners = computed(() => (group.value ? group.value.members.filter(id => id !== s.value.playerId).map(id => names.value[id] ?? '?') : []))
const myGroupId = computed(() => v.value.me?.whisperGroupId ?? null)

const canInvite = computed(() => phase.value === 'day' && v.value.daySubPhase === 'free' && !s.value?.hasLeft
    && !(myGroupId.value && group.value?.id === myGroupId.value))

const mySeat = computed(() => (v.value.me ? seats.value[v.value.me.seat] : null))
const nominateBlockReason = computed(() => {
    if (phase.value !== 'day' || v.value.daySubPhase !== 'nomination') return ''
    const nom = v.value.nominations
    if (!mySeat.value) return ''
    if (mySeat.value.isDead) return '死亡玩家不能提名'
    if (nom.current && nom.current.stage !== 'done') return '目前的提名還沒結束'
    if (nom.nominators.includes(mySeat.value.index)) return '你今天已經提名過了'
    if (nom.nominees.includes(props.seat)) return '這位玩家今天已經被提名過了'
    if (s.value?.hasLeft) return '不能提名已離開的玩家'
    return ''
})
const canNominate = computed(() => phase.value === 'day' && v.value.daySubPhase === 'nomination' && !!mySeat.value && !nominateBlockReason.value)

const todayWhispers = computed(() => v.value.log.filter(e => e.type === 'whisper' && e.dayNumber === v.value.dayNumber && e.participants.includes(s.value?.playerId)))

// 說書人
const impaired = computed(() => !!v.value.grimoire?.impaired?.[props.seat])
const seatReminders = computed(() => (v.value.grimoire?.reminders ?? []).filter(r => r.seat === props.seat))
const pendingPrompt = computed(() => v.value.grimoire?.prompts?.[s.value?.playerId] ?? null)
const voting = computed(() => !!v.value.voting)
const roles = computed(() => scriptState.script?.roles ?? [])
const reminderOptions = computed(() => {
    const ids = new Set([...Object.keys(REMINDER_ASSETS), ...roles.value.flatMap(r => r.reminders ?? [])])
    return [...ids].map(id => ({ id, label: `${roleName(id.split(':')[0])}：${REMINDER_ASSETS[id]?.label ?? id.split(':')[1]}` }))
})

const wakeCount = ref(1)
const wakeNotSelf = ref(false)
const wakeText = ref('')
const actPicks = ref([])
const newReminder = ref('')
watch(() => props.seat, () => {
    const p = roleInfo(s.value?.roleId === 'drunk' ? s.value?.shownRoleId : s.value?.roleId)?.prompt
    wakeCount.value = p?.count ?? 1
    wakeNotSelf.value = !!p?.notSelf
    wakeText.value = ''
    actPicks.value = []
})
function toggleAct(i) {
    actPicks.value = actPicks.value.includes(i) ? actPicks.value.filter(x => x !== i) : [...actPicks.value, i].slice(-(pendingPrompt.value?.count ?? 1))
}
function act(type, payload) {
    emit('action', { type, seat: props.seat, playerId: s.value?.playerId, payload })
    if (!['add-reminder', 'remove-reminder', 'role'].includes(type)) emit('close')
}
</script>
