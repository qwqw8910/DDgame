<template>
    <div class="sb-theme page-wrapper page-wrapper--scrollable">
        <header class="sticky-header app-header--room">
            <div class="header-inner header-inner--room">
                <div class="flex items-center gap-1 min-w-0 flex-1 sm:flex-none">
                    <button class="header-back-btn" aria-label="返回首頁" @click="goHome">←<span class="hidden sm:inline"> 返回</span></button>
                    <span class="logo-sm truncate">{{ bill.roomName || '分帳' }} 💸</span>
                </div>
                <div class="header-info order-last w-full justify-center sm:order-none sm:w-auto">
                    <span class="header-room-id">{{ roomState.roomId }}</span>
                    <span class="text-base text-body">{{ activeMembers.length }} 人</span>
                </div>
                <div class="flex gap-1.5 items-center shrink-0">
                    <button class="header-icon-btn" title="複製邀請連結" aria-label="複製邀請連結" @click="copyLink">🔗</button>
                    <button class="header-icon-btn" title="切換主題" aria-label="切換主題" @click="toggleTheme">{{ isDark ? '🌙' : '☀️' }}</button>
                </div>
            </div>
        </header>

        <!-- 載入中 -->
        <div v-if="bill.loading && !roomState.room" class="fullscreen-overlay fullscreen-overlay--blur">
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ bill.loadingText || '連線中…' }}</p>
        </div>

        <!-- 沒有名字 -->
        <div v-else-if="needNickname" class="overlay">
            <div class="overlay-card">
                <h2 class="neon-heading text-xl mb-3">輸入你的名字</h2>
                <p class="text-base text-body mb-3">同一個名字 = 同一個人，換手機也能接回帳務</p>
                <input v-model="overlayName" class="game-input mb-3" style="padding-left:14px" maxlength="20"
                    placeholder="你的名字" @keydown.enter="joinWithName" />
                <button class="btn-primary" @click="joinWithName">進入帳本</button>
            </div>
        </div>

        <!-- 進房失敗 -->
        <main v-else-if="!roomState.room" class="main-content main-content--room">
            <div class="game-card text-center">
                <p class="text-xl mb-4 text-heading">{{ bill.error || '尚未進入帳本' }}</p>
                <button class="btn-secondary" @click="goHome">回到入口</button>
            </div>
        </main>

        <main v-else class="main-content main-content--room sb">
            <!-- Tabs -->
            <nav class="sb__tabs" role="tablist">
                <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id"
                    :class="['sb__tab', { 'sb__tab--on': tab === t.id }]" @click="tab = t.id">{{ t.label }}</button>
            </nav>

            <!-- ───────── 支出 ───────── -->
            <section v-if="tab === 'expenses'">
                <AppAlert v-if="bill.missingRates.length" variant="info" action-label="前往設定匯率" @action="goRateSettings">
                    {{ bill.missingRates.join('、') }} 的支出還沒有匯率，所以沒有計入結算金額。
                </AppAlert>

                <div class="game-card xlist__panel">
                    <div class="xlist__top">
                        <h2 class="xlist__heading">支出列表</h2>
                        <button class="btn-secondary sb__add xlist__add" @click="openForm(null)">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"
                                stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            新增支出項目
                        </button>
                    </div>
                    <div class="xlist__filters">
                        <SbSelect v-model="memberFilter" class="xlist__select" aria-label="依成員篩選" :options="memberOptions" />
                        <div class="xlist__search">
                            <input v-model="search" class="game-input" placeholder="搜尋支出項目…" aria-label="搜尋支出項目" />
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>
                        </div>
                    </div>
                </div>

                <div class="xlist__bar">
                    <span class="sb__sub">共 {{ visibleExpenses.length }} 項</span>
                    <div class="xlist__right">
                    <label class="xlist__del"><input v-model="showDeleted" type="checkbox" /> 顯示已刪除</label>
                    <div ref="viewEl" class="xlist__view">
                        <button type="button" class="xlist__viewbtn" aria-haspopup="menu" :aria-expanded="viewOpen"
                            @click="viewOpen = !viewOpen">
                            檢視方式
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                        <div v-if="viewOpen" class="xcard__popover xlist__viewmenu" role="menu">
                            <label class="xlist__opt"><input v-model="layout" type="radio" value="list" /> 單欄</label>
                            <label class="xlist__opt"><input v-model="layout" type="radio" value="grid" /> 雙欄</label>
                        </div>
                    </div>
</div>
                </div>

                <p v-if="!bill.expenses.length" class="sb__empty">還沒有支出，按「新增支出項目」記下第一筆吧！</p>
                <p v-else-if="!visibleExpenses.length" class="sb__empty">找不到符合條件的支出</p>
                <div :class="['xlist__grid', { 'xlist__grid--2': layout === 'grid' }]">
                    <ExpenseCard v-for="x in visibleExpenses" :key="x.id" :expense="x" :name-of="nameOf"
                        :me-member-id="bill.meMemberId" :base-currency="bill.baseCurrency" :rate="rateOf(x.currency)"
                        :can-edit="canEdit(x.createdBy)" @edit="openForm(x)" @delete="confirmDelete(x)"
                        @restore="restoreExpense(x.id)" />
                </div>
            </section>

            <!-- ───────── 結算：誰該給誰 ───────── -->
            <section v-else-if="tab === 'transfers'">
                <AppAlert v-if="bill.missingRates.length" variant="info" action-label="前往設定匯率" @action="goRateSettings">
                    {{ bill.missingRates.join('、') }} 的支出還沒有匯率，所以沒有計入下面的金額。
                </AppAlert>

                <div class="game-card xlist__panel">
                    <h2 class="xlist__heading">誰該給誰</h2>
                    <p class="sb__sub">以 {{ bill.baseCurrency }} 結算，互相欠的已抵銷，點「詳細」看組成明細</p>
                </div>

                <div class="xlist__bar">
                    <span class="sb__sub">共 {{ bill.transfers.length }} 筆</span>
                    <div class="xlist__right">
                        <div ref="viewEl" class="xlist__view">
                            <button type="button" class="xlist__viewbtn" aria-haspopup="menu" :aria-expanded="viewOpen"
                                @click="viewOpen = !viewOpen">
                                檢視方式
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            <div v-if="viewOpen" class="xcard__popover xlist__viewmenu" role="menu">
                                <label class="xlist__opt"><input v-model="layout" type="radio" value="list" /> 單欄</label>
                                <label class="xlist__opt"><input v-model="layout" type="radio" value="grid" /> 雙欄</label>
                            </div>
                        </div>
                    </div>
                </div>

                <p v-if="!bill.transfers.length" class="sb__empty">目前沒有人需要給錢 🎉</p>
                <div :class="['xlist__grid', { 'xlist__grid--2': layout === 'grid' }]">
                    <article v-for="t in bill.transfers" :key="t.from + t.to" class="game-card xcard">
                        <div class="xcard__head">
                            <div class="min-w-0">
                                <div class="xcard__title">
                                    <span :class="{ 'xcard__me': t.from === bill.meMemberId }">{{ nameOf(t.from) }}</span>
                                    <span class="xcard__arrow">給</span>
                                    <span :class="{ 'xcard__me': t.to === bill.meMemberId }">{{ nameOf(t.to) }}</span>
                                </div>
                                <div class="xcard__meta"><span class="xcard__date">共 {{ t.details.length }} 筆支出</span></div>
                            </div>
                            <div class="xcard__side"><span class="xcard__amount">{{ formatMoney(t.amount, bill.baseCurrency) }}</span></div>
                        </div>

                        <button type="button" class="xcard__toggle" :aria-expanded="isOpen(t)" @click="toggleOpen(t)">
                            <span>詳細</span>
                            <svg :class="['xcard__chev', { 'xcard__chev--up': isOpen(t) }]" viewBox="0 0 24 24" width="18" height="18" fill="none"
                                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        <div v-if="isOpen(t)" class="xcard__detail">
                            <div v-for="d in t.details" :key="d.expenseId" class="xcard__line xcard__line--split">
                                <div class="min-w-0">
                                    <div>{{ expenseTitle(d.expenseId) }}</div>
                                    <div class="sb__sub">{{ detailNote(d) }}</div>
                                </div>
                                <span :class="d.amount < 0 ? 'xcard__minus' : 'xcard__share'">
                                    {{ d.amount < 0 ? '− ' : '' }}{{ formatMoney(Math.abs(d.amount), bill.baseCurrency) }}
                                </span>
                            </div>
                            <div class="xcard__line xcard__line--split xcard__total">
                                <span>合計</span>
                                <span>{{ formatMoney(t.amount, bill.baseCurrency) }}</span>
                            </div>
                        </div>
                    </article>
                </div>
            </section>

            <!-- ───────── 成員 ───────── -->
            <section v-else-if="tab === 'members'">
                <div class="game-card xlist__panel">
                    <div class="xlist__top">
                        <h2 class="xlist__heading">成員列表</h2>
                        <button v-if="isHost" class="btn-secondary sb__add xlist__add" @click="openAddMember">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"
                                stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            新增成員
                        </button>
                    </div>
                    <div class="xlist__search">
                        <input v-model="memberSearch" class="game-input" placeholder="搜尋成員…" aria-label="搜尋成員" />
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>
                    </div>
                </div>

                <div class="xlist__bar">
                    <span class="sb__sub">共 {{ visibleMembers.length }} 位</span>
                    <div class="xlist__right">
                        <label class="xlist__del"><input v-model="showLeft" type="checkbox" /> 顯示已離開</label>
                        <div ref="viewEl" class="xlist__view">
                            <button type="button" class="xlist__viewbtn" aria-haspopup="menu" :aria-expanded="viewOpen"
                                @click="viewOpen = !viewOpen">
                                檢視方式
                                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            <div v-if="viewOpen" class="xcard__popover xlist__viewmenu" role="menu">
                                <label class="xlist__opt"><input v-model="layout" type="radio" value="list" /> 單欄</label>
                                <label class="xlist__opt"><input v-model="layout" type="radio" value="grid" /> 雙欄</label>
                            </div>
                        </div>
                    </div>
                </div>

                <p v-if="!visibleMembers.length" class="sb__empty">找不到符合條件的成員</p>
                <div :class="['xlist__grid', { 'xlist__grid--2': layout === 'grid' }]">
                    <MemberCard v-for="m in visibleMembers" :key="m.id" :member="m" :is-me="m.id === bill.meMemberId"
                        :can-manage="roomState.isHost && m.id !== bill.meMemberId && !m.leftAt && !m.isVirtual"
                        @transfer="transferTo(m)" @kick="kick(m)" />
                </div>
            </section>

            <!-- ───────── 設定 ───────── -->
            <section v-else-if="tab === 'settings'">
                <div class="game-card sb__item">
                    <h2 class="xlist__heading" style="margin-bottom:10px">帳本設定</h2>
                    <div class="sb__sub">帳本名稱</div>
                    <div v-if="isHost" class="sb__bar" style="margin:4px 0 0">
                        <input v-model="nameDraft" class="game-input" style="padding-left:14px" maxlength="30"
                            placeholder="例如：日本旅行" @keydown.enter="saveSettings" />
                    </div>
                    <div v-else class="sb__title">{{ bill.roomName || '（未命名）' }}</div>

                    <div class="sb__sub" style="margin-top:14px">結算幣別</div>
                    <SbSelect v-if="isHost" v-model="baseDraft" aria-label="結算幣別" :options="baseOptions" />
                    <div v-else class="sb__title">{{ bill.baseCurrency }}</div>
                    <p class="sb__sub">所有外幣都換算成這個幣別來算「誰給誰」。{{ isHost ? '' : '（只有房主可以更改）' }}</p>
                </div>

                <div id="sb-currency-settings" class="game-card sb__item">
                    <div class="xlist__top">
                        <h2 class="xlist__heading">外幣與匯率</h2>
                        <button v-if="isHost" class="btn-secondary sb__add xlist__add" @click="openAddCurrency">
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"
                                stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                            新增幣別
                        </button>
                    </div>
                    <p v-if="!foreignCurrencies.length" class="sb__sub">還沒有外幣。{{ isHost ? '按「新增幣別」，之後記帳時才能選到。' : '請房主先新增。' }}</p>
                    <p v-else class="sb__sub">全帳本共用，改了全部一起變。</p>
                    <div v-for="c in foreignCurrencies" :key="c.code" class="sb__rate">
                        <span class="sb__rate-label">1 {{ c.code }} =</span>
                        <input v-model="rateDrafts[c.code]" class="game-input sb__rate-input" inputmode="decimal"
                            :placeholder="rateOf(c.code) ? '' : '尚未設定'" @keydown.enter="saveRate(c.code)" />
                        <span class="sb__rate-label">{{ bill.baseCurrency }}</span>
                        <button class="btn-secondary sb__rate-btn" :disabled="!rateChanged(c.code)" @click="saveRate(c.code)">儲存</button>
                        <button class="btn-ghost-sm" title="重置為最新匯率" @click="refreshRate(c.code)">🔄 最新</button>
                        <span v-if="bill.rates[c.code]" class="badge">{{ bill.rates[c.code].source === 'manual' ? '手動' : '自動' }}</span>
                    </div>

                </div>

                <div class="game-card sb__item">
                    <div class="sb__sub">房間碼</div>
                    <div class="flex items-center gap-3">
                        <span class="sb__code">{{ roomState.roomId }}</span>
                        <button class="btn-ghost-sm" @click="copyLink">複製邀請連結</button>
                    </div>
                </div>

                <div class="sb__actions" style="justify-content:space-between">
                    <button class="btn-ghost" @click="leave">離開帳本</button>
                    <button v-if="roomState.isHost" class="btn-danger-sm" @click="removeRoom">刪除整個帳本</button>
                </div>
            </section>

            <!-- ───────── 歷史紀錄 ───────── -->
            <section v-else>
                <div class="game-card xlist__panel">
                    <h2 class="xlist__heading" style="margin-bottom:12px">歷史紀錄</h2>
                    <div class="xlist__search">
                        <input v-model="logSearch" class="game-input" placeholder="搜尋紀錄…" aria-label="搜尋紀錄" />
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><line x1="20" y1="20" x2="16.5" y2="16.5" /></svg>
                    </div>
                </div>

                <div class="xlist__bar">
                    <span class="sb__sub">共 {{ visibleLogs.length }} 筆</span>
                </div>

                <p v-if="!activities.length" class="sb__empty">還沒有歷史紀錄</p>
                <p v-else-if="!visibleLogs.length" class="sb__empty">找不到符合條件的紀錄</p>
                <div v-for="a in visibleLogs" :key="a.id" class="sb__row sb__log">
                    <span>{{ describe(a) }}</span>
                    <span class="sb__sub">{{ fmtTime(a.createdAt) }}</span>
                </div>
            </section>
        </main>

        <ExpenseForm v-if="form.open" :members="activeMembers" :me-member-id="bill.meMemberId"
            :expense="form.expense" :currencies="formCurrencies" :default-currency="bill.baseCurrency"
            @cancel="form.open = false" @submit="saveExpense" />

        <!-- 帳本設定：有未儲存的變更時，浮在畫面下方的操作列 -->
        <Transition name="savebar">
            <div v-if="settingsDirty && tab === 'settings' && roomState.room" class="sb-savebar" role="region" aria-label="未儲存的變更">
                <span class="sb-savebar__text">有尚未儲存的變更</span>
                <div class="sb-savebar__actions">
                    <button class="btn-ghost" @click="resetSettings">取消</button>
                    <button class="btn-primary" :disabled="!settingsValid" @click="saveSettings">儲存</button>
                </div>
            </div>
        </Transition>

        <!-- 新增成員 -->
        <div v-if="showAddMember" class="overlay" @click.self="showAddMember = false">
            <div class="overlay-card sb-modal" role="dialog" aria-label="新增成員">
                <button type="button" class="sb-modal__close" aria-label="關閉" @click="showAddMember = false"><svg viewBox="0 0 256 256" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg></button>
                <h2 class="neon-heading text-xl mb-3">新增成員</h2>

                <label class="eform__label" style="margin-top:0">成員名稱</label>
                <div class="sb__bar" style="margin-bottom:4px">
                    <input ref="addNameInput" v-model="virtualName" class="game-input" style="padding-left:14px" maxlength="20"
                        placeholder="例如：奶奶" @keydown.enter="submitVirtual" />
                </div>
                <p class="sb__sub">之後有人用「同樣的名字」進來，就會自動接手這個成員的所有帳目，不會重複。</p>

                <div class="sb__actions sb-modal__foot">
                    <button class="btn-ghost" @click="showAddMember = false">取消</button>
                    <button class="btn-primary" :disabled="!virtualName.trim()" @click="submitVirtual">新增</button>
                </div>
            </div>
        </div>

        <!-- 新增幣別 -->
        <div v-if="showAddCurrency" class="overlay" @click.self="showAddCurrency = false">
            <div class="overlay-card sb-modal" role="dialog" aria-label="新增幣別">
                <button type="button" class="sb-modal__close" aria-label="關閉" @click="showAddCurrency = false"><svg viewBox="0 0 256 256" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg></button>
                <h2 class="neon-heading text-xl mb-3">新增幣別</h2>

                <label class="eform__label" style="margin-top:0">幣別</label>
                <SbSelect v-model="newCurrency" aria-label="選擇要新增的幣別" placeholder="選擇幣別" :options="addableCurrencies" />

                <label class="eform__label">匯率（必填）</label>
                <div class="sb__rate" style="margin:0">
                    <span class="sb__rate-label">1 {{ newCurrency || '外幣' }} =</span>
                    <input v-model="newRate" class="game-input sb__rate-input" inputmode="decimal" placeholder="實際匯率"
                        @keydown.enter="addCurrency" />
                    <span class="sb__rate-label">{{ bill.baseCurrency }}</span>
                </div>

                <div class="sb__actions sb-modal__foot">
                    <button class="btn-ghost" @click="showAddCurrency = false">取消</button>
                    <button class="btn-primary" :disabled="!canAddCurrency" @click="addCurrency">新增</button>
                </div>
            </div>
        </div>

        <!-- 確認對話框 -->
        <div v-if="confirm" class="overlay" @click.self="confirm = null">
            <div class="overlay-card sb-modal">
                <button type="button" class="sb-modal__close" aria-label="關閉" @click="confirm = null"><svg viewBox="0 0 256 256" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z"/></svg></button>
                <p class="text-xl mb-4 text-heading">{{ confirm.text }}</p>
                <div class="sb__actions sb-modal__foot">
                    <button class="btn-ghost" @click="confirm = null">取消</button>
                    <button class="btn-primary" @click="runConfirm">確定</button>
                </div>
            </div>
        </div>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import { useSplitBill } from '../composables/useSplitBill.js'
import { formatMoney, CURRENCIES } from '../data/money.js'
import { rememberRoom, forgetRoom } from '../data/recentRooms.js'
import ExpenseForm from '../components/ExpenseForm.vue'
import AppAlert from '@/shared/components/AppAlert.vue'
import ExpenseCard from '../components/ExpenseCard.vue'
import SbSelect from '../components/SbSelect.vue'
import MemberCard from '../components/MemberCard.vue'
import '../split-bill.css'

const route = useRoute()
const router = useRouter()
const {
    bill, roomState, nameOf, connect, disconnect, copyInviteLink,
    addExpense, updateExpense, deleteExpense, restoreExpense,
    addVirtualMember, setRate, refreshRate, setBaseCurrency, deleteRoom, renameRoom,
    kickPlayer, transferHost, leaveRoom,
} = useSplitBill()

const TABS = [
    { id: 'expenses', label: '支出' },
    { id: 'transfers', label: '結算' },
    { id: 'members', label: '成員' },
    { id: 'settings', label: '帳本設定' },
    { id: 'activity', label: '歷史紀錄' },
]
const tab = ref('expenses')

// ── 主題 / 導覽 ─────────────────────────────────────────────
const isDark = ref(true)
function toggleTheme() {
    const html = document.documentElement
    const next = html.getAttribute('data-theme') === 'light' ? 'mygame' : 'light'
    html.setAttribute('data-theme', next)
    localStorage.setItem('theme', next === 'light' ? 'light' : 'dark')
    isDark.value = next !== 'light'
}
function goHome() { disconnect(); router.push({ name: 'split-bill' }) }

// ── Toast ───────────────────────────────────────────────────
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '') {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, 3500)
}
watch(() => bill.errorSeq, () => bill.error && showToast(bill.error, 'error'))
watch(() => bill.kicked, (v) => { if (v) { forgetRoom(roomState.roomId); showToast('你已被移出這個帳本', 'error'); setTimeout(goHome, 1200) } })
watch(() => bill.roomDeleted, (v) => { if (v) { forgetRoom(roomState.roomId); showToast('房主已刪除這個帳本', 'info'); setTimeout(goHome, 1200) } })

// ── 進房 ────────────────────────────────────────────────────
const needNickname = ref(false)
const overlayName = ref('')

function enter(nickname) {
    const roomId = String(route.query.id || '').toUpperCase()
    saveNickname(nickname)
    rememberRoom(roomId, nickname)
    connect(roomId, nickname, route.query.create === '1')
}
function joinWithName() {
    const n = overlayName.value.trim()
    if (!n) return
    needNickname.value = false
    enter(n)
}
onMounted(() => {
    isDark.value = document.documentElement.getAttribute('data-theme') !== 'light'
    if (!route.query.id) return goHome()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    if (nickname) enter(nickname)
    else needNickname.value = true
})
onUnmounted(() => clearTimeout(_toastTimer))

// ── 派生資料 ────────────────────────────────────────────────
const activeMembers = computed(() => bill.members.filter(m => !m.leftAt))
const isHost = computed(() => roomState.isHost)
const canEdit = (createdBy) => createdBy === bill.meMemberId || isHost.value

const fmtDate = (iso) => new Date(iso).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })

const fmtTime = (iso) => new Date(iso).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

// 支出
const search = ref('')
const memberFilter = ref('')          // '' = 所有成員；否則只看該成員「付款或參與分攤」的支出
const memberOptions = computed(() => [
    { value: '', label: '所有成員' },
    ...bill.members.map(m => ({ value: m.id, label: m.name + (m.leftAt ? '（已離開）' : '') })),
])
const showDeleted = ref(false)
const LAYOUT_KEY = 'split-bill:expense-layout'
const readLayout = () => { try { return localStorage.getItem(LAYOUT_KEY) === 'grid' ? 'grid' : 'list' } catch { return 'list' } }
const layout = ref(readLayout())      // list 單欄 | grid 雙欄（窄螢幕一律單欄）
watch(layout, (v) => { try { localStorage.setItem(LAYOUT_KEY, v) } catch { /* 無痕模式等情況不影響使用 */ } })

const viewOpen = ref(false)
const viewEl = ref(null)
const closeViewMenu = (e) => { if (!viewEl.value?.contains(e.target)) viewOpen.value = false }
onMounted(() => document.addEventListener('pointerdown', closeViewMenu))
onUnmounted(() => document.removeEventListener('pointerdown', closeViewMenu))

const involves = (x, memberId) =>
    x.payers.some(p => p.memberId === memberId) || x.splits.some(s => s.memberId === memberId)
const visibleExpenses = computed(() => {
    const q = search.value.trim().toLowerCase()
    return bill.expenses
        .filter(x => (showDeleted.value || !x.deletedAt)
            && (!memberFilter.value || involves(x, memberFilter.value))
            && (!q || x.title.toLowerCase().includes(q) || x.note.toLowerCase().includes(q)))
        .slice()
        .sort((a, b) => b.paidAt.localeCompare(a.paidAt) || b.createdAt.localeCompare(a.createdAt))
})

// 結算：誰該給誰
const rateOf = (cur) => bill.rates[cur]?.rate ?? null
const openKeys = ref(new Set())
const keyOf = (t) => `${t.from}>${t.to}`
const isOpen = (t) => openKeys.value.has(keyOf(t))
function toggleOpen(t) {
    const next = new Set(openKeys.value)
    if (!next.delete(keyOf(t))) next.add(keyOf(t))
    openKeys.value = next
}
const expenseOf = (id) => bill.expenses.find(x => x.id === id)
const expenseTitle = (id) => expenseOf(id)?.title ?? '（已刪除的支出）'
function detailNote(d) {
    const x = expenseOf(d.expenseId)
    if (!x) return ''
    const base = `${formatMoney(x.amount, x.currency)}・${fmtDate(x.paidAt)}`
    const rate = rateOf(x.currency)
    return x.currency === bill.baseCurrency || !rate ? base : `${base}・匯率 ${rate}`
}

// 結算幣別與匯率
async function goRateSettings() {
    tab.value = 'settings'
    await nextTick()
    document.getElementById('sb-currency-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    if (isHost.value) {
        openAddCurrency()
        newCurrency.value = bill.missingRates[0] ?? ''   // 直接帶入缺匯率的幣別，補上匯率即可
    }
}
const foreignCurrencies = computed(() => {
    const codes = new Set(Object.keys(bill.rates))   // 只列出透過「新增幣別」設定過匯率的
    codes.delete(bill.baseCurrency)
    return [...codes].sort().map(code => CURRENCIES.find(c => c.code === code) ?? { code, label: code })
})
const newCurrency = ref('')
const newRate = ref('')
const addableCurrencies = computed(() => CURRENCIES
    .filter(c => c.code !== bill.baseCurrency && !foreignCurrencies.value.some(x => x.code === c.code))
    .map(c => ({ value: c.code, label: c.label })))
const showAddCurrency = ref(false)
const canAddCurrency = computed(() => !!newCurrency.value && Number(newRate.value) > 0)
function openAddCurrency() {
    newCurrency.value = ''
    newRate.value = ''
    showAddCurrency.value = true
}
function addCurrency() {
    if (!canAddCurrency.value) return
    setRate(newCurrency.value, Number(newRate.value))
    showAddCurrency.value = false
}
const rateDrafts = reactive({})
watch(() => [bill.rates, bill.baseCurrency], () => {
    for (const c of CURRENCIES) rateDrafts[c.code] = bill.rates[c.code] ? String(bill.rates[c.code].rate) : ''
}, { immediate: true, deep: true })
const rateChanged = (code) => {
    const v = Number(rateDrafts[code])
    return rateDrafts[code] !== '' && v > 0 && v !== rateOf(code)
}
function saveRate(code) {
    if (rateChanged(code)) setRate(code, Number(rateDrafts[code]))
}
const baseOptions = CURRENCIES.map(c => ({ value: c.code, label: c.label }))
const baseDraft = ref('')
watch(() => bill.baseCurrency, (c) => { baseDraft.value = c }, { immediate: true })

// 歷史紀錄
const activities = computed(() => bill.activities.slice().reverse())
function describe(a) {
    const who = nameOf(a.actor)
    const title = a.after?.title ?? a.before?.title ?? ''
    switch (a.action) {
        case 'expense.add': return `${who} 新增支出「${title}」`
        case 'expense.update': return `${who} 修改支出「${title}」`
        case 'expense.delete': return `${who} 刪除了一筆支出`
        case 'expense.restore': return `${who} 復原了一筆支出`
        case 'rate.set': return `${who} 將 ${a.after?.currency} 匯率改為 ${a.after?.rate}`
        case 'rate.refresh': return `${who} 將 ${a.after?.currency} 匯率重置為最新（${a.after?.rate}）`
        case 'room.base-currency': return `${who} 將結算幣別改為 ${a.after?.currency}`
        case 'room.rename': return `${who} 將帳本命名為「${a.after?.name ?? ''}」`
        case 'member.join': return `${who} 加入了帳本`
        case 'member.leave': return `${who} 離開了帳本`
        case 'member.kick': return `${who} 被移出帳本`
        case 'member.add-virtual': return `${who} 新增了成員「${a.after?.name ?? ''}」`
        default: return `${who}：${a.action}`
    }
}

// 成員
const memberSearch = ref('')
const showLeft = ref(false)
const showAddMember = ref(false)
const visibleMembers = computed(() => {
    const q = memberSearch.value.trim().toLowerCase()
    return bill.members.filter(m => (showLeft.value || !m.leftAt) && (!q || m.name.toLowerCase().includes(q)))
})

// 歷史紀錄
const logSearch = ref('')
const visibleLogs = computed(() => {
    const q = logSearch.value.trim().toLowerCase()
    return q ? activities.value.filter(a => describe(a).toLowerCase().includes(q)) : activities.value
})

// ── 操作 ────────────────────────────────────────────────────
const form = reactive({ open: false, expense: null })
// 記帳時可選的幣別：結算幣別 + 房主新增的外幣（編輯舊支出時保留它原本的幣別）
const formCurrencies = computed(() => {
    const codes = new Set([bill.baseCurrency, ...Object.keys(bill.rates)])
    if (form.expense) codes.add(form.expense.currency)
    return [...codes].map(code => CURRENCIES.find(c => c.code === code) ?? { code, label: code })
})
function openForm(expense) { form.expense = expense; form.open = true }
function saveExpense(payload) {
    form.open = false
    if (payload.expenseId) updateExpense(payload)
    else addExpense(payload)
}

const confirm = ref(null)
const runConfirm = () => { const c = confirm.value; confirm.value = null; c?.run() }
const confirmDelete = (x) => { confirm.value = { text: `刪除「${x.title}」？之後可以在「顯示已刪除」中復原。`, run: () => deleteExpense(x.id) } }

// ── 帳本名稱 ────────────────────────────────────────────────
const nameDraft = ref('')
watch(() => bill.roomName, (n) => {
    nameDraft.value = n
    if (n) rememberRoom(roomState.roomId, roomState.myNickname, n)
}, { immediate: true })
const nameChanged = computed(() => nameDraft.value.trim() !== (bill.roomName ?? ''))
const baseChanged = computed(() => !!baseDraft.value && baseDraft.value !== bill.baseCurrency)
const settingsDirty = computed(() => isHost.value && (nameChanged.value || baseChanged.value))
const settingsValid = computed(() => !nameChanged.value || !!nameDraft.value.trim())
function resetSettings() {
    nameDraft.value = bill.roomName
    baseDraft.value = bill.baseCurrency
}
function saveSettings() {
    if (!settingsDirty.value || !settingsValid.value) return
    if (nameChanged.value) renameRoom(nameDraft.value.trim())
    if (baseChanged.value) {
        const next = baseDraft.value
        confirm.value = {
            text: `改用 ${next} 結算？現有匯率會全部重設為最新匯率（你手動改過的也會被覆蓋）。`,
            run: () => setBaseCurrency(next),
        }
    }
}
// 離開設定頁就放棄未儲存的變更，避免回來時還留著草稿
watch(tab, (t) => { if (t !== 'settings') resetSettings() })
// 建房時在入口填的名稱：房主第一次拿到帳務狀態後送出
watch(() => bill.meMemberId, (id) => {
    const wanted = String(route.query.name || '').trim()
    if (id && route.query.create === '1' && wanted && !bill.roomName && roomState.isHost) renameRoom(wanted)
})

const virtualName = ref('')
const addNameInput = ref(null)
function openAddMember() {
    virtualName.value = ''
    showAddMember.value = true
    nextTick(() => addNameInput.value?.focus())
}
function submitVirtual() {
    const n = virtualName.value.trim()
    if (!n) return
    addVirtualMember(n)
    virtualName.value = ''
    showAddMember.value = false
}

// 房間模組以 playerId 操作，帳務成員以名稱對應
const normalize = (s) => String(s ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
const playerOf = (m) => roomState.players.find(p => normalize(p.nickname) === normalize(m.name))
function kick(m) {
    const p = playerOf(m)
    if (!p) return showToast('找不到這位成員的連線資料', 'error')
    confirm.value = { text: `把「${m.name}」移出帳本？帳目會保留，對方以同名重新加入即可接回。`, run: () => kickPlayer(p.id) }
}
function transferTo(m) {
    const p = playerOf(m)
    if (!p) return showToast('找不到這位成員的連線資料', 'error')
    confirm.value = { text: `把房主移交給「${m.name}」？`, run: () => transferHost(p.id) }
}
function leave() {
    confirm.value = {
        text: '離開帳本？你的帳目會保留，之後用同一個名字回來就能接回。',
        run: () => { leaveRoom(); forgetRoom(roomState.roomId); goHome() },
    }
}
function removeRoom() {
    confirm.value = { text: '永久刪除整個帳本與所有帳務？此動作無法復原！', run: () => deleteRoom() }
}

function copyLink() {
    copyInviteLink()
    showToast('邀請連結已複製 🔗', 'success')
}
</script>
