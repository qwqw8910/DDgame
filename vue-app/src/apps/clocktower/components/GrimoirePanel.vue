<template>
    <!-- 說書人魔典：setup 階段 = 開局設定（進入時已全自動隨機，說書人確認或微調；分三步，每步都能一個畫面看完）；遊戲中 = 偽裝、座位角色一覽 -->
    <section :class="['flex min-h-0 flex-col gap-3', view.phase === 'setup' ? 'h-full' : '']" aria-label="魔典">
        <!-- ═══ 開局設定 ═══ -->
        <div v-if="view.phase === 'setup'" class="flex h-full min-h-0 flex-col gap-2">
            <!-- 配置概況：已選 / 建議 -->
            <div class="shrink-0 rounded-lg bg-subtle p-1.5">
                <p class="m-0 mb-1 text-center text-[11px] text-body">
                    {{ n }} 人局配置（已選 / 建議）<span v-if="hasBaron" class="text-lemon">・男爵：外來者 +2、鎮民 −2</span>
                </p>
                <div class="grid grid-cols-4 gap-1 text-center">
                    <div v-for="t in TEAMS" :key="t" class="flex flex-col items-center leading-tight">
                        <span class="flex items-center gap-0.5 text-[11px] text-body"><GameIcon kind="team" :id="t" :size="12" />{{ TEAM_NAMES[t] }}</span>
                        <span :class="['text-sm font-bold tabular-nums', pickedCount(t) === expectedPicked?.[t] ? 'text-success-text' : 'text-heading']">
                            {{ pickedCount(t) }}/{{ expectedPicked?.[t] ?? '?' }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- 步驟 -->
            <div class="flex shrink-0 gap-1" role="tablist">
                <button v-for="st in steps" :key="st.key" type="button" role="tab" :aria-selected="step === st.key"
                    :class="['flex-1 rounded-full border px-2 py-1 text-xs', step === st.key ? 'border-neon-purple bg-neon-purple/15 text-heading' : 'border-border text-body']"
                    @click="step = st.key">{{ st.label }}</button>
            </div>

            <div class="min-h-0 flex-1 overflow-y-auto pr-0.5">
                <!-- ① 選角色 -->
                <section v-if="step === 'roles'" class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs text-label">點選放入本局的角色（{{ picked.length }}/{{ n }}）</span>
                        <button class="btn-secondary !w-auto !px-2 !py-1 text-xs" @click="$emit('setup', 'random-roles')"><GameIcon id="dice" :size="12" /> 隨機配置</button>
                    </div>
                    <!-- 每個陣營一個框；角色牌固定同寬，圖示在上、名字在下 -->
                    <fieldset v-for="t in TEAMS" :key="t" class="m-0 rounded-xl border-2 px-2 pb-2 pt-0"
                        :style="{ borderColor: `${TEAM_ASSETS[t].color}66` }">
                        <legend class="flex items-center gap-1 rounded-full px-2 text-xs font-bold" :style="{ color: TEAM_ASSETS[t].color }">
                            <GameIcon kind="team" :id="t" :size="14" />{{ TEAM_NAMES[t] }}
                            <span class="tabular-nums text-body">{{ pickedCount(t) }}/{{ expectedPicked?.[t] ?? '?' }}</span>
                        </legend>
                        <div class="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
                            <button v-for="r in rolesOf(t)" :key="r.id" type="button" :title="r.ability" :aria-pressed="picked.includes(r.id)"
                                :class="['flex h-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-lg border px-1 transition-colors',
                                    picked.includes(r.id) ? 'border-neon-cyan bg-neon-cyan/15' : 'border-border opacity-60 hover:opacity-100']"
                                @click="toggleRole(r.id)">
                                <RoleToken :role-id="r.id" :size="30" />
                                <span class="w-full truncate text-center text-[11px] leading-tight text-heading">{{ r.name }}</span>
                            </button>
                        </div>
                    </fieldset>
                </section>

                <!-- ② 分配 -->
                <section v-else-if="step === 'assign'" class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs text-label">{{ swapFrom !== null ? '再點另一個 ⇄ 互換角色' : '只有你看得到分配結果' }}</span>
                        <button class="btn-secondary !w-auto !px-2 !py-1 text-xs" :disabled="picked.length !== n && !allAssigned" @click="$emit('assign', { action: 'random' })">
                            <GameIcon id="dice" :size="12" /> {{ assigned ? '重新隨機' : '隨機分配' }}
                        </button>
                    </div>
                    <ul class="m-0 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
                        <li v-for="s in view.seats" :key="s.index" class="flex items-center gap-1 rounded-lg bg-subtle px-1.5 py-1">
                            <span class="w-14 shrink-0 truncate text-xs text-heading" :title="view.names[s.playerId]">{{ s.index + 1 }}.{{ view.names[s.playerId] ?? '?' }}</span>
                            <RoleToken :role-id="s.roleId" :size="20" />
                            <select class="game-input min-w-0 flex-1 cursor-pointer !px-1 !py-0.5 text-xs" :value="s.roleId ?? ''" :aria-label="`${s.index + 1}號角色`"
                                @change="$emit('assign', { action: 'set', seat: s.index, roleId: $event.target.value || null })">
                                <option value="">（未分配）</option>
                                <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
                            </select>
                            <button type="button" :class="['btn-ghost-sm shrink-0 !px-1.5', swapFrom === s.index ? 'ring-1 ring-neon-cyan' : '']"
                                :aria-label="`互換 ${s.index + 1}號角色`" @click="swap(s.index)">⇄</button>
                        </li>
                    </ul>
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-subtle px-2 py-1.5 text-xs text-label">
                        <span v-if="drunkSeat">酒鬼以為：<b class="text-heading">{{ drunkSeat.drunkAs ? roleName(drunkSeat.drunkAs) : '未指定' }}</b></span>
                        <span>惡魔偽裝：<b class="text-heading">{{ bluffs.length ? bluffs.map(roleName).join('、') : '未指定' }}</b></span>
                        <button type="button" class="btn-ghost-sm ml-auto" @click="step = 'bluffs'">修改</button>
                    </div>
                </section>

                <!-- ③ 酒鬼 / 偽裝 / 設定 -->
                <section v-else class="flex flex-col gap-3">
                    <div v-if="drunkSeat" class="flex flex-col gap-1">
                        <span class="text-xs text-label">酒鬼（{{ drunkSeat.index + 1 }}號）以為自己是</span>
                        <select class="game-input cursor-pointer py-1 text-sm" :value="drunkSeat.drunkAs ?? ''" @change="$emit('setup', 'drunk', { roleId: $event.target.value })">
                            <option value="" disabled>請選擇不在場的鎮民</option>
                            <option v-for="r in drunkOptions" :key="r.id" :value="r.id">{{ r.name }}</option>
                        </select>
                    </div>
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-xs text-label">惡魔偽裝（3 個不在場的善良角色）</span>
                            <button class="btn-ghost-sm" @click="$emit('setup', 'random-bluffs')"><GameIcon id="dice" :size="12" /> 重抽</button>
                        </div>
                        <div class="grid grid-cols-3 gap-1">
                            <select v-for="i in 3" :key="i" class="game-input cursor-pointer !px-1 py-1 text-xs" :value="bluffs[i - 1] ?? ''"
                                :aria-label="`偽裝 ${i}`" @change="setBluff(i - 1, $event.target.value)">
                                <option value="">—</option>
                                <option v-for="r in bluffOptions" :key="r.id" :value="r.id">{{ r.name }}</option>
                            </select>
                        </div>
                    </div>
                    <label class="flex items-center justify-between gap-2 text-xs text-label">私聊人數上限
                        <select class="game-input !w-auto cursor-pointer py-1 text-xs" :value="view.settings.whisperMax"
                            @change="$emit('setup', 'settings', { settings: { whisperMax: Number($event.target.value) } })">
                            <option :value="0">不限</option>
                            <option v-for="k in [2, 3, 4, 5, 6]" :key="k" :value="k">最多 {{ k }} 人</option>
                        </select>
                    </label>
                    <p class="m-0 text-[11px] text-body">紅鯡魚等開局標記：先開始遊戲，再從座位選單放提醒標記。</p>
                </section>
            </div>

            <!-- 檢查與開始（固定在底部） -->
            <div class="flex shrink-0 flex-col gap-1.5">
                <ul v-if="errors.length" class="m-0 max-h-16 list-none overflow-y-auto rounded-lg border border-ruby/40 bg-ruby/10 p-1.5 text-xs text-heading">
                    <li v-for="e in errors" :key="e"><GameIcon id="warn" :size="10" /> {{ e }}</li>
                </ul>
                <p v-else class="m-0 text-center text-xs text-success-text">已自動隨機配好，確認沒問題就開始。</p>
                <div class="flex items-center gap-1.5">
                    <button class="btn-primary flex-1 !py-2 text-sm" :disabled="!!errors.length" @click="$emit('start', false)">發角色、進入首夜</button>
                    <button class="btn-ghost-sm" title="重新隨機角色、座位、酒鬼與偽裝" @click="$emit('setup', 'auto')"><GameIcon id="dice" :size="12" /> 全部重抽</button>
                    <button v-if="errors.length && assigned" class="btn-ghost-sm" title="略過檢查強制開始（會記錄在日誌）" @click="confirmForce">強制</button>
                    <button class="btn-ghost-sm" @click="$emit('setup', 'back')">回大廳</button>
                </div>
            </div>
        </div>

        <!-- ═══ 遊戲中 ═══ -->
        <template v-else-if="grimoire">
            <BalancePanel :balance="grimoire.balance" />
            <section class="flex flex-col gap-1">
                <h3 class="m-0 text-sm font-semibold text-label">惡魔偽裝</h3>
                <div class="flex flex-wrap gap-2"><RoleToken v-for="b in grimoire.bluffs" :key="b" :role-id="b" :size="30" show-name /></div>
            </section>
            <section class="flex flex-col gap-1">
                <h3 class="m-0 text-sm font-semibold text-label">座位一覽</h3>
                <ul class="m-0 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2 lg:grid-cols-1">
                    <li v-for="s in view.seats" :key="s.index">
                        <button type="button" class="flex w-full items-center gap-2 rounded-lg bg-subtle px-2 py-1 text-left hover:ring-1 hover:ring-border-glow" @click="$emit('seat', s.index)">
                            <RoleToken :role-id="s.roleId" :size="22" />
                            <span :class="['min-w-0 flex-1 truncate text-sm text-heading', s.isDead ? 'line-through opacity-60' : '']">{{ s.index + 1 }}. {{ view.names[s.playerId] ?? '?' }}</span>
                            <span v-if="s.roleId === 'drunk'" class="text-[11px] text-body">以為 {{ roleName(s.shownRoleId) }}</span>
                            <GameIcon v-if="grimoire.impaired?.[s.index]" id="warn" :size="12" />
                            <GameIcon v-if="s.hasLeft" id="left" :size="14" />
                            <GameIcon v-else-if="s.isDead" id="dead" :size="14" />
                        </button>
                    </li>
                </ul>
            </section>
        </template>
    </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import RoleToken from './RoleToken.vue'
import GameIcon from './GameIcon.vue'
import BalancePanel from './BalancePanel.vue'
import { TEAMS, GOOD_TEAMS, COMPOSITION } from '../data/constants.js'
import { TEAM_NAMES } from '../data/labels.js'
import { TEAM_ASSETS } from '../data/assets.js'
import { scriptState, roleInfo } from '../composables/useClocktower.js'

const props = defineProps({
    view: { type: Object, required: true },
})
const emit = defineEmits(['setup', 'assign', 'start', 'seat'])

const steps = [{ key: 'roles', label: '① 選角色' }, { key: 'assign', label: '② 分配（總覽）' }, { key: 'bluffs', label: '③ 偽裝・設定' }]
const step = ref('assign') // 進入 setup 時伺服器已自動隨機配好，先給說書人看結果

const grimoire = computed(() => props.view.grimoire)
const roles = computed(() => scriptState.script?.roles ?? [])
const rolesOf = t => roles.value.filter(r => r.team === t)
const roleName = id => roleInfo(id)?.name ?? id
const n = computed(() => props.view.seats.length)
const picked = computed(() => grimoire.value?.setupRoles ?? [])
const pickedCount = t => picked.value.filter(id => roleInfo(id)?.team === t).length
const assigned = computed(() => props.view.seats.some(s => s.roleId))
const allAssigned = computed(() => props.view.seats.length > 0 && props.view.seats.every(s => s.roleId))
const inPlay = computed(() => props.view.seats.map(s => s.roleId).filter(Boolean))
const hasBaron = computed(() => inPlay.value.includes('baron') || picked.value.includes('baron'))
// 依目前勾選的角色（含男爵）給的建議數量
const expectedPicked = computed(() => {
    const row = COMPOSITION[n.value]
    if (!row) return null
    const out = Object.fromEntries(TEAMS.map((t, i) => [t, row[i]]))
    if (hasBaron.value) { out.outsider += 2; out.townsfolk -= 2 }
    return out
})
const errors = computed(() => grimoire.value?.setupErrors ?? [])
const drunkSeat = computed(() => props.view.seats.find(s => s.roleId === 'drunk') ?? null)
const drunkOptions = computed(() => rolesOf('townsfolk').filter(r => !inPlay.value.includes(r.id)))
const bluffs = computed(() => grimoire.value?.bluffs ?? [])
const bluffOptions = computed(() => roles.value.filter(r => GOOD_TEAMS.includes(r.team) && !inPlay.value.includes(r.id)))

function toggleRole(id) {
    const next = picked.value.includes(id) ? picked.value.filter(x => x !== id) : [...picked.value, id]
    if (next.length > n.value) return
    emit('setup', 'roles', { roles: next })
}
const swapFrom = ref(null)
function swap(i) {
    if (swapFrom.value === null) { swapFrom.value = i; return }
    if (swapFrom.value !== i) emit('assign', { action: 'swap', a: swapFrom.value, b: i })
    swapFrom.value = null
}
function setBluff(i, id) {
    const next = [...bluffs.value]
    next[i] = id
    if (next.filter(Boolean).length === 3) emit('setup', 'bluffs', { bluffs: next })
}
function confirmForce() {
    if (confirm(`配置不合法：\n${errors.value.join('\n')}\n\n確定要強制開始嗎？（會記錄在日誌，終局公開）`)) emit('start', true)
}
</script>
