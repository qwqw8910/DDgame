<template>
    <!-- 說書人送資訊給玩家：欄位預填系統算出的真實答案；改成與魔典不符時標示「⚠ 給假資訊」（日誌由伺服器判定） -->
    <CtDialog :open="target !== null" :title="title" @close="$emit('close')">
        <div v-if="target !== null" class="flex flex-col gap-3">
            <p v-if="impaired" class="m-0 rounded-lg border border-lemon/40 bg-lemon/10 px-2 py-1 text-sm text-heading">
                <GameIcon id="warn" :size="14" /> 此玩家目前中毒 / 醉酒，可給任意資訊
            </p>
            <p v-if="reply?.length" class="m-0 text-sm text-label">玩家選了：<strong class="text-heading">{{ reply.map(seatName).join('、') }}</strong></p>

            <!-- 系統答案 -->
            <section v-if="truth" class="flex flex-col gap-1 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1.5 text-sm">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-label">真實答案：<strong class="text-heading">{{ describeTruth(truth, ctx) }}</strong></span>
                    <button v-if="truthReady(truth)" type="button" class="btn-ghost-sm shrink-0" @click="fillTruth">照實填入</button>
                </div>
                <ul v-if="truth.notes?.length" class="m-0 list-none p-0 text-xs text-body">
                    <li v-for="n in truth.notes" :key="n"><GameIcon id="info" :size="10" /> {{ n }}</li>
                </ul>
            </section>

            <label class="flex flex-col gap-1 text-sm text-label">類型
                <select v-model="type" class="game-input cursor-pointer">
                    <option v-for="t in INFO_TYPES" :key="t.type" :value="t.type">{{ t.label }}</option>
                </select>
            </label>

            <label v-if="type === 'info-number'" class="flex flex-col gap-1 text-sm text-label">數字
                <input v-model.number="number" type="number" min="0" max="20" class="game-input" />
            </label>

            <template v-if="type === 'info-players-role' || type === 'info-role'">
                <fieldset class="m-0 rounded-lg border border-border p-2">
                    <legend class="px-1 text-sm text-label">{{ type === 'info-role' ? '玩家（可不選）' : '玩家（通常 2 位）' }}</legend>
                    <div class="flex flex-wrap gap-1">
                        <button v-for="s in seats" :key="s.index" type="button"
                            :class="['rounded-lg border px-2 py-1 text-xs', players.includes(s.index) ? 'border-neon-cyan bg-neon-cyan/15 text-heading' : 'border-border text-body']"
                            @click="togglePlayer(s.index)">{{ seatName(s.index) }}</button>
                    </div>
                </fieldset>
                <label class="flex flex-col gap-1 text-sm text-label">角色
                    <select v-model="showRole" class="game-input cursor-pointer">
                        <option :value="null">{{ type === 'info-players-role' ? '（沒有此類角色在場）' : '請選擇' }}</option>
                        <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}（{{ TEAM_NAMES[r.team] }}）</option>
                    </select>
                </label>
            </template>

            <div v-if="type === 'info-yes-no'" class="flex gap-2">
                <button type="button" :class="['flex-1', yes === true ? 'btn-primary' : 'btn-secondary']" @click="yes = true">是</button>
                <button type="button" :class="['flex-1', yes === false ? 'btn-primary' : 'btn-secondary']" @click="yes = false">否</button>
            </div>

            <p v-if="type === 'info-grimoire'" class="m-0 text-sm text-body">送出目前魔典的唯讀快照（角色、存活、提醒標記、偽裝）。</p>

            <label class="flex flex-col gap-1 text-sm text-label">{{ type === 'custom' ? '內容' : '附註（可留空）' }}
                <textarea v-model="text" rows="2" maxlength="300" class="game-input resize-y"></textarea>
            </label>

            <p v-if="verdict === false" class="m-0 rounded-lg border border-ruby/50 bg-ruby/10 px-2 py-1 text-sm font-semibold text-heading" role="alert">
                <GameIcon id="lie" :size="14" /> 給假資訊：與魔典不符{{ impaired ? '（對象中毒 / 醉酒，合乎規則）' : '' }}。會記錄在日誌，終局公開。
            </p>
            <p v-else-if="verdict === true" class="m-0 text-sm text-success-text"><GameIcon id="truth" :size="14" /> 與魔典相符</p>
        </div>
        <template #footer>
            <button class="btn-primary btn-full" :disabled="!valid" @click="send">送出給 {{ target !== null ? seatName(target) : '' }}</button>
        </template>
    </CtDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import CtDialog from './CtDialog.vue'
import GameIcon from './GameIcon.vue'
import { INFO_TYPES } from '../data/constants.js'
import { TEAM_NAMES } from '../data/labels.js'
import { scriptState, roleInfo } from '../composables/useClocktower.js'
import { truthReady, describeTruth, judgeDraft } from '../data/truth.js'

const props = defineProps({
    target: { type: Number, default: null },     // 座位號
    roleId: { type: String, default: null },     // 以哪個角色的能力給資訊（決定預設類型）
    reply: { type: Array, default: null },
    impaired: { type: Boolean, default: false },
    truth: { type: Object, default: null },      // 系統算出的真實答案（夜晚順序項目才有）
    seats: { type: Array, default: () => [] },
    names: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['close', 'send'])

const roles = computed(() => scriptState.script?.roles ?? [])
const seatName = i => `${i + 1}號 ${props.names[props.seats[i]?.playerId] ?? ''}`.trim()
const ctx = { seatName, roleName: id => roleInfo(id)?.name ?? id }
const title = computed(() => {
    const r = props.roleId ? roleInfo(props.roleId)?.name : null
    return r ? `送資訊（${r}）` : '送資訊'
})

const type = ref('custom')
const number = ref(0)
const players = ref([])
const showRole = ref(null)
const yes = ref(null)
const text = ref('')

function defaultType(roleId) {
    const p = roleInfo(roleId)?.prompt
    if (!p) return 'custom'
    if (p.type === 'choose-player') return p.then ?? 'custom'
    return INFO_TYPES.some(t => t.type === p.type) ? p.type : 'custom'
}
watch(() => [props.target, props.roleId], () => {
    type.value = defaultType(props.roleId)
    number.value = 0
    players.value = props.reply && defaultType(props.roleId) === 'info-role' ? [props.reply[0]] : []
    showRole.value = null
    yes.value = null
    text.value = ''
    if (props.target !== null && truthReady(props.truth)) fillTruth()
}, { immediate: true })

// 「照實填入」：把系統答案填進欄位（之後說書人可以改）
function fillTruth() {
    const t = props.truth
    if (!t) return
    type.value = t.type
    if (t.type === 'info-number') number.value = t.number
    if (t.type === 'info-yes-no') yes.value = t.yes
    if (t.type === 'info-players-role') { players.value = [...t.players]; showRole.value = t.showRole }
    if (t.type === 'info-role') { showRole.value = t.showRole; players.value = Number.isInteger(t.player) ? [t.player] : [] }
}

const verdict = computed(() => judgeDraft(props.truth,
    { type: type.value, number: number.value, yes: yes.value, players: players.value, showRole: showRole.value },
    { seat: props.target, seats: props.seats, teamOf: id => roleInfo(id)?.team ?? null }))

function togglePlayer(i) {
    players.value = players.value.includes(i) ? players.value.filter(x => x !== i) : [...players.value, i]
}

const valid = computed(() => {
    switch (type.value) {
        case 'info-number': return Number.isInteger(number.value) && number.value >= 0
        case 'info-players-role': return players.value.length > 0 || !!showRole.value
        case 'info-yes-no': return typeof yes.value === 'boolean'
        case 'info-role': return !!showRole.value
        case 'custom': return !!text.value.trim()
        default: return true
    }
})

function send() {
    if (!valid.value) return
    const info = { type: type.value, forRole: props.roleId, text: text.value.trim() || undefined }
    if (type.value === 'info-number') info.number = number.value
    if (type.value === 'info-players-role') { info.players = [...players.value]; info.showRole = showRole.value }
    if (type.value === 'info-yes-no') info.yes = yes.value
    if (type.value === 'info-role') { info.showRole = showRole.value; if (players.value.length) info.player = players.value[0] }
    emit('send', props.target, info)
}
</script>
