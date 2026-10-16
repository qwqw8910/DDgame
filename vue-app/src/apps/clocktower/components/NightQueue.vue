<template>
    <!-- 說書人夜晚順序清單：只列出在場且存活（或能力仍有效）的角色 -->
    <section class="flex flex-col gap-2" aria-label="夜晚順序">
        <h3 class="m-0 flex items-center gap-1 text-sm font-semibold text-label">
            <GameIcon id="night" :size="14" /> 第 {{ view.dayNumber + 1 }} 夜順序（{{ doneCount }}/{{ queue.length }}）
        </h3>
        <p v-if="!queue.length" class="m-0 text-sm text-body">今晚沒有需要喚醒的角色。</p>
        <ol class="m-0 flex list-none flex-col gap-1.5 p-0">
            <li v-for="e in queue" :key="e.key"
                :class="['flex flex-col gap-1 rounded-lg border px-2 py-1.5', e.done ? 'border-border opacity-55' : e.key === nextKey ? 'border-neon-purple bg-subtle ring-1 ring-neon-purple' : 'border-border-glow bg-subtle']">
                <div class="flex items-center gap-2">
                    <span v-if="e.done" class="w-4 shrink-0 text-center text-sm text-neon-cyan" aria-label="已完成">✓</span>
                    <span v-else-if="e.key === nextKey" class="w-4 shrink-0 text-center text-sm text-neon-purple" aria-label="下一步">▶</span>
                    <span v-else class="w-4 shrink-0" />
                    <RoleToken :role-id="e.roleId" :size="26" />
                    <div class="min-w-0 flex-1">
                        <p class="m-0 truncate text-sm font-semibold text-heading">{{ label(e) }}</p>
                        <p class="m-0 text-xs leading-snug text-body">{{ e.reminder }}</p>
                    </div>
                </div>
                <p v-if="e.seat !== null && impaired?.[e.seat]" class="m-0 text-xs text-lemon">
                    <GameIcon id="warn" :size="12" /> 此玩家中毒 / 醉酒，能力可能無效
                </p>
                <p v-if="e.seat !== null && view.seats[e.seat]?.roleId === 'drunk'" class="m-0 text-xs text-lemon">
                    <GameIcon id="warn" :size="12" /> 其實是酒鬼
                </p>
                <p v-if="e.reply" class="m-0 text-xs text-heading">選了：{{ e.reply.map(seatName).join('、') }}</p>
                <p v-else-if="e.seat !== null && prompts?.[view.seats[e.seat]?.playerId]" class="m-0 text-xs text-neon-cyan">等待玩家選擇…</p>
                <!-- 系統算出的真實答案 -->
                <p v-if="e.truth" class="m-0 text-xs text-label">
                    <GameIcon id="truth" :size="11" /> 真實答案：<strong class="text-heading">{{ describeTruth(e.truth, ctx) }}</strong>
                    <span v-if="e.truth.notes?.length" class="block text-body">{{ e.truth.notes.join('；') }}</span>
                </p>
                <p v-if="!e.done && e.key === nextKey" class="m-0 text-xs text-neon-purple">{{ hint(e) }}</p>
                <div v-if="e.done" class="flex items-center gap-1.5">
                    <span class="text-xs text-body">已完成</span>
                    <button class="btn-ghost-sm" @click="$emit('done', e.key, false)">復原</button>
                </div>
                <div v-else class="flex flex-wrap gap-1.5">
                    <template v-if="e.seat === null">
                        <button class="btn-primary !w-auto !px-3 !py-1 text-xs" @click="$emit('evil', e.key)">送出{{ label(e) }}</button>
                    </template>
                    <template v-else>
                        <button v-if="promptType(e) === 'choose-player'" class="btn-secondary !w-auto !px-3 !py-1 text-xs" @click="$emit('wake', e)">喚醒選人</button>
                        <button v-if="truthReady(e.truth)" class="btn-primary !w-auto !px-3 !py-1 text-xs" @click="$emit('send-truth', e)">照實送出</button>
                        <button class="btn-secondary !w-auto !px-3 !py-1 text-xs" @click="$emit('info', e)">{{ e.truth ? '修改後送出' : '送資訊' }}</button>
                        <button class="btn-ghost-sm" @click="$emit('seat', e.seat)">座位選單</button>
                        <button class="btn-ghost-sm ml-auto" @click="skip(e)">{{ needsInfo(e) ? '跳過' : '完成' }}</button>
                    </template>
                </div>
            </li>
        </ol>

        <!-- 預計死亡：小惡魔攻擊目標（受保護 / 士兵 / 鎮長等狀況由說書人判斷） -->
        <section v-if="attacks.length || pendingDeaths.length" class="rounded-lg border border-ruby/40 bg-ruby/10 p-2 text-sm">
            <h4 class="m-0 mb-1 text-xs font-semibold text-label">預計死亡（按確認才真正死亡）</h4>
            <ul class="m-0 flex list-none flex-col gap-1 p-0">
                <li v-for="a in attacks" :key="a.id" class="flex flex-wrap items-center gap-1.5">
                    <span class="text-heading">{{ seatName(a.seat) }}</span>
                    <span v-for="w in warnings(a.seat)" :key="w" class="rounded bg-card px-1 text-[11px] text-lemon">{{ w }}</span>
                    <span v-if="a.doubtful" class="rounded bg-card px-1 text-[11px] text-lemon">惡魔中毒 / 醉酒</span>
                    <button v-if="!view.seats[a.seat].isDead" class="btn-danger-sm ml-auto" @click="$emit('kill', a.seat)">確認死亡</button>
                </li>
                <li v-for="i in pendingDeaths" :key="`d${i}`" class="text-heading">{{ seatName(i) }}：已確認，天亮公布</li>
            </ul>
        </section>
    </section>
</template>

<script setup>
import { computed } from 'vue'
import RoleToken from './RoleToken.vue'
import GameIcon from './GameIcon.vue'
import { ROLE_ASSETS } from '../data/assets.js'
import { roleInfo } from '../composables/useClocktower.js'
import { truthReady, describeTruth } from '../data/truth.js'

const props = defineProps({
    view: { type: Object, required: true },
})
const emit = defineEmits(['wake', 'info', 'send-truth', 'done', 'evil', 'seat', 'kill'])

const g = computed(() => props.view.grimoire)
const queue = computed(() => g.value?.nightQueue ?? [])
const prompts = computed(() => g.value?.prompts ?? {})
const impaired = computed(() => g.value?.impaired ?? [])
const doneCount = computed(() => queue.value.filter(e => e.done).length)
// 依序第一個未完成的項目 = 下一步
const nextKey = computed(() => queue.value.find(e => !e.done)?.key ?? null)
const seatName = i => `${i + 1}號 ${props.view.names[props.view.seats[i]?.playerId] ?? ''}`
const ctx = { seatName, roleName: id => roleInfo(id)?.name ?? id }
// 首夜固定項目的名稱是資料（不是圖示），從 assets 的 name 欄位讀
const label = e => (e.seat === null ? ROLE_ASSETS[e.roleId]?.name ?? e.roleId : `${roleInfo(e.roleId)?.name ?? e.roleId}・${seatName(e.seat)}`)
const promptType = e => roleInfo(e.roleId)?.prompt?.type ?? 'custom'
// 規則上每晚都要給資訊的角色（可給假資訊，但不能不給）
const needsInfo = e => { const p = roleInfo(e.roleId)?.prompt; return !!p && (p.type.startsWith('info-') || !!p.then) }
function hint(e) {
    if (e.seat === null) return '按下送出，系統會自動告知相關玩家'
    const p = roleInfo(e.roleId)?.prompt
    if (p?.type === 'choose-player' && !e.reply) return p.then ? '先「喚醒選人」，玩家選完再送資訊' : '「喚醒選人」，玩家選完自動完成'
    if (needsInfo(e)) return truthReady(e.truth) ? '送出資訊後自動完成' : '用「送資訊」填好後送出，送出即完成'
    return '處理完按「完成」'
}
function skip(e) {
    if (needsInfo(e) && !confirm(`${label(e)} 今晚應該要收到資訊（中毒／醉酒時可給假資訊，但不能不給）。確定跳過不送？`)) return
    emit('done', e.key, true)
}

const reminders = computed(() => g.value?.reminders ?? [])
const attacks = computed(() => reminders.value.filter(r => r.reminderId === 'imp:target'))
const pendingDeaths = computed(() => props.view.seats.filter(s => s.deathPending).map(s => s.index))
function warnings(seat) {
    const out = []
    if (reminders.value.some(r => r.seat === seat && r.reminderId === 'monk:protected')) out.push('受僧侶保護')
    const roleId = props.view.seats[seat]?.roleId
    if (roleId === 'soldier') out.push('士兵')
    if (roleId === 'mayor') out.push('鎮長（可轉移死亡）')
    if (['imp'].includes(roleId)) out.push('小惡魔自殺 → 爪牙接手')
    return out
}
</script>
