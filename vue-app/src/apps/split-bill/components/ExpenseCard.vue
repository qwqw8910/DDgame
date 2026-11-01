<template>
    <article :class="['game-card', 'xcard', { 'xcard--del': expense.deletedAt }]">
        <div class="xcard__head">
            <div class="min-w-0">
                <div class="xcard__title">{{ categoryLabel(expense.category) }} {{ expense.title }}</div>
                <div class="xcard__meta">
                    <span class="xcard__date">{{ fmtDate(expense.paidAt) }}</span>
                    <span>由 <b class="xcard__payer">{{ payersText }}</b> 付款</span>
                </div>
            </div>

            <div class="xcard__side">
                <span class="xcard__amount">{{ formatMoney(expense.amount, expense.currency) }}</span>

                <div v-if="canEdit" ref="menuEl" class="xcard__menu">
                    <button type="button" class="xcard__kebab" aria-label="更多操作" aria-haspopup="menu"
                        :aria-expanded="menuOpen" @click="toggleMenu">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
                        </svg>
                    </button>
                    <div v-if="menuOpen" class="xcard__popover" role="menu">
                        <template v-if="!expense.deletedAt">
                            <button type="button" role="menuitem" class="xcard__item" :disabled="expense.payers.length > 1"
                                :title="expense.payers.length > 1 ? '多人共同付款的支出暫不支援編輯' : ''"
                                @click="pick('edit')">編輯</button>
                            <button type="button" role="menuitem" class="xcard__item xcard__item--danger"
                                @click="pick('delete')">刪除</button>
                        </template>
                        <button v-else type="button" role="menuitem" class="xcard__item" @click="pick('restore')">復原</button>
                    </div>
                </div>
            </div>
        </div>

        <div v-if="expense.currency !== baseCurrency && rate" class="xcard__converted">
            ≈ {{ formatMoney(convertMinor(expense.amount, expense.currency, baseCurrency, rate), baseCurrency) }}
        </div>

        <button type="button" class="xcard__toggle" :aria-expanded="open" @click="open = !open">
            <span>詳細</span>
            <svg :class="['xcard__chev', { 'xcard__chev--up': open }]" viewBox="0 0 24 24" width="18" height="18" fill="none"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="6 9 12 15 18 9" />
            </svg>
        </button>

        <div v-if="open" class="xcard__detail">
            <div class="xcard__line">
                <span class="xcard__label">參與成員：</span>
                <span class="xcard__chips">
                    <span v-for="s in expense.splits" :key="s.memberId" class="xcard__chip">
                        {{ nameOf(s.memberId) }}<template v-if="expense.splitType !== 'equal'"> {{ formatMoney(s.amount, expense.currency) }}</template>
                    </span>
                </span>
            </div>
            <div v-if="expense.payers.length > 1" class="xcard__line">
                <span class="xcard__label">付款明細：</span>
                <span>{{ expense.payers.map(p => `${nameOf(p.memberId)} ${formatMoney(p.amount, expense.currency)}`).join('、') }}</span>
            </div>
            <div v-if="myShare != null" class="xcard__line">
                <span class="xcard__label">你的分攤：</span>
                <span class="xcard__share">{{ formatMoney(myShare, expense.currency) }}</span>
            </div>
            <div v-if="expense.note" class="xcard__line">
                <span class="xcard__label">備註：</span>
                <span>{{ expense.note }}</span>
            </div>
        </div>
    </article>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { formatMoney, categoryLabel, convertMinor } from '../data/money.js'

const props = defineProps({
    expense: { type: Object, required: true },
    nameOf: { type: Function, required: true },
    meMemberId: { type: String, default: null },
    baseCurrency: { type: String, required: true },
    rate: { type: Number, default: null },        // 1 外幣 = rate 結算幣別；null = 尚無匯率
    canEdit: { type: Boolean, default: false },
})
const emit = defineEmits(['edit', 'delete', 'restore'])

const open = ref(false)
const menuOpen = ref(false)
const menuEl = ref(null)

const fmtDate = (iso) => new Date(iso).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
const payersText = computed(() => props.expense.payers.map(p => props.nameOf(p.memberId)).join('、'))
const myShare = computed(() => props.expense.splits.find(s => s.memberId === props.meMemberId)?.amount ?? null)

// 點選選單以外的地方、按 Esc 都會收起選單
const close = () => { menuOpen.value = false }
const onDown = (e) => { if (!menuEl.value?.contains(e.target)) close() }
const onKey = (e) => { if (e.key === 'Escape') close() }
watch(menuOpen, (v) => {
    if (v) { document.addEventListener('pointerdown', onDown); document.addEventListener('keydown', onKey) }
    else { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
})
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) })

function toggleMenu() { menuOpen.value = !menuOpen.value }
function pick(action) { close(); emit(action) }
</script>
