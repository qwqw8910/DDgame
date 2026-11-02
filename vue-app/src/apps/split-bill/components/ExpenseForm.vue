<template>
    <SbModal as="form" class="eform" :title="expense ? '編輯支出' : '新增支出'" @close="$emit('cancel')" @submit.prevent="submit">
            <div v-if="error" class="error-alert mb-3">{{ error }}</div>

            <label class="eform__label">標題</label>
            <input v-model="title" class="game-input eform__input" maxlength="100" placeholder="例如：晚餐" required />

            <div class="eform__row">
                <div class="eform__grow">
                    <label class="eform__label">金額</label>
                    <input v-model="amountText" class="game-input eform__input" inputmode="decimal" placeholder="0"
                        required />
                </div>
                <div class="eform__grow">
                    <label class="eform__label">幣別</label>
                    <SbSelect v-model="currency" class="eform__select" aria-label="幣別" placeholder="選擇幣別" :options="currencyOptions"
                        :searchable="true" @update:model-value="onCurrencyChange" />
                </div>
            </div>

            <div class="eform__row">
                <div class="eform__grow">
                    <label class="eform__label">誰先付的</label>
<SbSelect v-model="payerId" class="eform__select" aria-label="誰先付的" :options="memberOptions" />
                </div>
                <div class="eform__grow">
                    <label class="eform__label">分類</label>
<SbSelect v-model="category" class="eform__select" aria-label="分類" :options="categoryOptions" />
                </div>
            </div>

            <label class="eform__label">日期</label>
            <SbDatePicker v-model="paidDate" class="eform__select" aria-label="日期" />

            <label class="eform__label">怎麼分</label>
            <div class="eform__tabs" role="tablist">
                <button v-for="t in SPLIT_TYPES" :key="t.id" type="button" role="tab"
                    :aria-selected="splitType === t.id" :class="['eform__tab', { 'eform__tab--on': splitType === t.id }]"
                    @click="splitType = t.id">{{ t.label }}</button>
            </div>
            <p class="eform__hint">{{ currentHint }}</p>

            <div class="eform__bulk">
                <span class="eform__bulk-count">已選 {{ picked.length }} / {{ members.length }} 人</span>
                <div class="eform__bulk-btns">
                    <button type="button" class="eform__bulk-btn" @click="setAll(true)">全選</button>
                    <button type="button" class="eform__bulk-btn" @click="setAll(false)">全部取消</button>
                </div>
            </div>

            <div class="eform__people">
                <div v-for="m in members" :key="m.id" class="eform__person">
                    <label class="eform__check">
                        <input type="checkbox" :checked="rows[m.id].on" @change="rows[m.id].on = $event.target.checked" />
                        <span>{{ m.name }}</span>
                    </label>
                    <div v-if="rows[m.id].on && splitType === 'adjust'" class="eform__value">
                        <input :value="adjustShown(m.id)" class="game-input eform__input eform__input--sm"
                            :class="{ 'eform__input--auto': !rows[m.id].locked }" inputmode="decimal" placeholder="金額"
                            @input="onAdjustInput(m.id, $event.target.value)" />
                        <span class="eform__unit">{{ currency }}</span>
                    </div>
                    <div v-else-if="rows[m.id].on && splitType !== 'equal'" class="eform__value">
                        <input v-model="rows[m.id].value" class="game-input eform__input eform__input--sm"
                            inputmode="decimal" :placeholder="valuePlaceholder" />
                        <span class="eform__unit">{{ valueUnit }}</span>
                    </div>
                </div>
            </div>
            <p v-if="sumNote" :class="['eform__hint', { 'eform__hint--bad': sumBad }]">{{ sumNote }}</p>

            <label class="eform__label">備註（選填）</label>
            <input v-model="note" class="game-input eform__input" maxlength="500" />

            <template #actions>
                <button type="button" class="btn-ghost" @click="$emit('cancel')">取消</button>
                <button type="submit" class="btn-primary">{{ expense ? '儲存' : '新增' }}</button>
            </template>
    </SbModal>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import SbSelect from './SbSelect.vue'
import SbModal from './SbModal.vue'
import SbDatePicker from './SbDatePicker.vue'
import { CURRENCIES, CATEGORIES, SPLIT_TYPES, parseMoney, toInput, formatMoney } from '../data/money.js'

const props = defineProps({
    members: { type: Array, required: true },       // 可選的（未離開）成員
    meMemberId: { type: String, default: null },
    expense: { type: Object, default: null },       // 編輯時帶入
    currencies: { type: Array, default: () => CURRENCIES },
    defaultCurrency: { type: String, default: 'TWD' },
})
const emit = defineEmits(['submit', 'cancel'])

const e = props.expense
const title = ref(e?.title ?? '')
const currency = ref(e?.currency ?? props.defaultCurrency)
const amountText = ref(e ? toInput(e.amount, e.currency) : '')
const category = ref(e?.category ?? 'food')
const note = ref(e?.note ?? '')
const payerId = ref(e?.payers?.[0]?.memberId ?? props.meMemberId ?? props.members[0]?.id)
const paidDate = ref((e?.paidAt ?? new Date().toISOString()).slice(0, 10))
// 「調整」無法由結果還原，編輯時改以等值的「指定金額」帶入
const splitType = ref(e ? (e.splitType === 'adjust' ? 'exact' : e.splitType) : 'equal')
const error = ref('')

const rows = reactive({})
for (const m of props.members) rows[m.id] = { on: !e, value: '', locked: false }
if (e) {
    for (const s of e.splits) {
        const v = splitType.value === 'exact' ? toInput(s.amount, e.currency)
            : splitType.value === 'equal' ? ''
                : String(s.share ?? '')
        rows[s.memberId] = { on: true, value: v, locked: false }
    }
}

function setAll(on) { for (const m of props.members) rows[m.id].on = on }

const currentHint = computed(() => SPLIT_TYPES.find(t => t.id === splitType.value)?.hint)
const valuePlaceholder = computed(() => ({ exact: '金額', percent: '%', shares: '份', adjust: '+/- 金額' })[splitType.value])
const valueUnit = computed(() => ({ exact: currency.value, percent: '%', shares: '份', adjust: currency.value })[splitType.value])

const currencyOptions = computed(() => props.currencies.map(c => ({ value: c.code, label: c.label ?? c.code })))
const memberOptions = computed(() => props.members.map(m => ({ value: m.id, label: m.name })))
const categoryOptions = CATEGORIES.map(c => ({ value: c.id, label: c.label }))

function onCurrencyChange() { /* 幣別小數位不同時，讓使用者重新確認金額 */ amountText.value = '' }

const picked = computed(() => props.members.filter(m => rows[m.id].on))
const amount = computed(() => parseMoney(amountText.value, currency.value))

// ── 「調整」：欄位直接顯示每個人的金額，一開始是平均；手動改某人的金額就鎖定他，
//    其餘沒鎖定的人自動重新平分剩下的金額（欄位清空 = 解除鎖定）。送出時以「指定金額」記錄。
watch(splitType, (t) => { if (t === 'adjust') for (const m of props.members) Object.assign(rows[m.id], { value: '', locked: false }) })

const lockedAmount = (id) => parseMoney(rows[id].value, currency.value) ?? 0
const adjustCalc = computed(() => {
    const locked = picked.value.filter(m => rows[m.id].locked)
    const free = picked.value.filter(m => !rows[m.id].locked)
    const remain = (amount.value ?? 0) - locked.reduce((a, m) => a + lockedAmount(m.id), 0)
    const map = {}
    for (const m of locked) map[m.id] = lockedAmount(m.id)
    if (free.length && remain >= 0) {
        const base = Math.floor(remain / free.length)
        const extra = remain - base * free.length                 // 零頭依序分給前面的人，各多 1 個最小單位
        free.forEach((m, i) => { map[m.id] = base + (i < extra ? 1 : 0) })
    }
    return { map, remain, hasFree: free.length > 0 }
})
const adjustShown = (id) => {
    if (rows[id].locked) return rows[id].value
    const v = adjustCalc.value.map[id]
    return amount.value && v != null ? toInput(v, currency.value) : ''
}
function onAdjustInput(id, text) {
    rows[id].value = text
    rows[id].locked = text.trim() !== ''
}

// 即時顯示加總狀況（只提示，最終金額以後端計算為準）
const sumNote = computed(() => {
    const t = splitType.value
    if (t === 'adjust' && amount.value) {
        const { remain, hasFree } = adjustCalc.value
        if (remain < 0) return `指定的金額已超過總額 ${formatMoney(-remain, currency.value)}`
        if (!hasFree) return remain === 0 ? '✔ 金額加總正確' : `目前加總與總額差 ${formatMoney(remain, currency.value)}`
        return '✔ 其餘的人自動平分剩下的金額'
    }
    if (t === 'exact' && amount.value) {
        const sum = picked.value.reduce((a, m) => a + (parseMoney(rows[m.id].value, currency.value) || 0), 0)
        return sum === amount.value ? '✔ 金額加總正確' : `目前加總 ${formatMoney(sum, currency.value)}，與總額差 ${formatMoney(amount.value - sum, currency.value)}`
    }
    if (t === 'percent') {
        const sum = picked.value.reduce((a, m) => a + (Number(rows[m.id].value) || 0), 0)
        return Math.abs(sum - 100) < 0.005 ? '✔ 合計 100%' : `目前合計 ${+sum.toFixed(2)}%，需為 100%`
    }
    return ''
})
const sumBad = computed(() => sumNote.value && !sumNote.value.startsWith('✔'))

function submit() {
    error.value = ''
    if (!amount.value || amount.value <= 0) return void (error.value = '請輸入大於 0 的正確金額')
    if (!picked.value.length) return void (error.value = '至少要選一位分攤的人')
    if (e?.splits.some(s => !props.members.some(m => m.id === s.memberId))) {
        return void (error.value = '這筆支出包含已離開的成員，無法在此編輯；請刪除後重新新增')
    }

    let t = splitType.value
    const participants = []
    if (t === 'adjust') {
        const { map, remain, hasFree } = adjustCalc.value
        if (remain < 0) return void (error.value = '指定的金額已超過總額')
        if (!hasFree && remain !== 0) return void (error.value = '每人金額加總需等於總額')
        for (const m of picked.value) {
            if (rows[m.id].locked && parseMoney(rows[m.id].value, currency.value) == null) {
                return void (error.value = `「${m.name}」的金額格式不正確`)
            }
            participants.push({ memberId: m.id, value: map[m.id] })
        }
        t = 'exact'
    }
    for (const m of participants.length ? [] : picked.value) {      // 「調整」已在上面算好
        const raw = rows[m.id].value
        if (t === 'equal') { participants.push({ memberId: m.id }); continue }
        if (t === 'exact' || t === 'adjust') {
            const v = raw === '' && t === 'adjust' ? 0 : parseMoney(String(raw).replace(/^-/, ''), currency.value)
            if (v == null) return void (error.value = `「${m.name}」的金額格式不正確`)
            participants.push({ memberId: m.id, value: String(raw).startsWith('-') ? -v : v })
        } else {
            const v = Number(raw)
            if (!(v > 0)) return void (error.value = `「${m.name}」請輸入大於 0 的數字`)
            participants.push({ memberId: m.id, value: v })
        }
    }

    emit('submit', {
        ...(e ? { expenseId: e.id, baseUpdatedAt: e.updatedAt } : {}),
        title: title.value.trim(),
        amount: amount.value,
        currency: currency.value,
        category: category.value,
        note: note.value.trim(),
        paidAt: paidDate.value ? new Date(`${paidDate.value}T12:00:00`).toISOString() : undefined,
        payerId: payerId.value,
        splitType: t,
        participants,
    })
}
</script>
