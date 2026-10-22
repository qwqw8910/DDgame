<template>
    <Teleport to="body">
        <Transition name="toast">
            <div v-if="modelValue" class="overlay" role="dialog" aria-modal="true" aria-labelledby="bm-title"
                @click.self="close" @keydown.esc="close">
                <div class="overlay-card bm-card" :class="{ 'bm-card-wide': view !== 'login' }" ref="cardRef"
                    tabindex="-1">

                    <!-- Header -->
                    <div class="bm-header">
                        <button v-if="view === 'words'" class="header-icon-btn" aria-label="返回主題列表"
                            @click="backToThemes">←</button>
                        <h2 id="bm-title" class="neon-heading bm-title">
                            {{ view === 'words' ? `📂 ${currentTheme?.name}` : '🗂️ 題庫管理' }}
                        </h2>
                        <button class="header-icon-btn" aria-label="關閉題庫管理" @click="close">✕</button>
                    </div>

                    <!-- 密碼 -->
                    <form v-if="view === 'login'" class="bm-body bm-stack" @submit.prevent="handleLogin">
                        <p class="bm-hint">請輸入管理密碼，才能新增或修改題庫。</p>
                        <input v-model="passwordInput" ref="passwordRef" type="password" class="game-input"
                            placeholder="管理密碼" autocomplete="current-password" />
                        <button class="btn-primary" type="submit" :disabled="busy || !passwordInput">
                            <span v-if="busy" class="spinner spinner-sm"></span>
                            {{ busy ? '驗證中…' : '進入管理' }}
                        </button>
                        <p v-if="message.text" :class="['bm-msg', message.type]" role="status">{{ message.text }}</p>
                    </form>

                    <!-- 主題表格 -->
                    <template v-else-if="view === 'themes'">
                        <div class="bm-toolbar">
                            <input v-model="themeFilter" class="game-input bm-input-sm bm-flex" placeholder="🔍 搜尋主題" />
                        </div>

                        <div class="bm-table-wrap">
                            <table class="bm-table">
                                <thead>
                                    <tr>
                                        <th class="bm-col-no">#</th>
                                        <th>主題名稱</th>
                                        <th class="bm-col-num">題數</th>
                                        <th class="bm-col-act">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <!-- 新增列 -->
                                    <tr class="bm-row-new">
                                        <td class="bm-col-no">＋</td>
                                        <td colspan="2">
                                            <input v-model="newThemeName" class="bm-cell-input" placeholder="輸入新主題名稱"
                                                maxlength="20" @keydown.enter.prevent="handleCreateTheme" />
                                        </td>
                                        <td class="bm-col-act">
                                            <button class="bm-act bm-act-primary" :disabled="busy || !newThemeName.trim()"
                                                @click="handleCreateTheme">新增</button>
                                        </td>
                                    </tr>

                                    <tr v-for="(t, i) in filteredThemes" :key="t.id">
                                        <td class="bm-col-no">{{ i + 1 }}</td>
                                        <template v-if="editingThemeId === t.id">
                                            <td colspan="2">
                                                <input v-model="themeDraft" class="bm-cell-input" maxlength="20"
                                                    @keydown.enter.prevent="handleRenameTheme(t)"
                                                    @keydown.esc.stop="editingThemeId = null" />
                                            </td>
                                            <td class="bm-col-act">
                                                <button class="bm-act bm-act-primary" :disabled="busy"
                                                    @click="handleRenameTheme(t)">儲存</button>
                                                <button class="bm-act" @click="editingThemeId = null">取消</button>
                                            </td>
                                        </template>
                                        <template v-else>
                                            <td>
                                                <button class="bm-link" @click="openTheme(t)">{{ t.name }}</button>
                                            </td>
                                            <td class="bm-col-num">{{ t.count }}</td>
                                            <td class="bm-col-act">
                                                <button class="bm-act bm-act-primary" @click="openTheme(t)">題目</button>
                                                <button class="bm-act" @click="startEditTheme(t)">修改</button>
                                                <button class="bm-act bm-act-danger" @click="handleDeleteTheme(t)">刪除</button>
                                            </td>
                                        </template>
                                    </tr>

                                    <tr v-if="!filteredThemes.length && !busy">
                                        <td colspan="4" class="bm-empty">
                                            {{ themeFilter ? '找不到符合的主題' : '還沒有任何主題' }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div class="bm-footer">
                            <span>「全部」與「隨機」是自動產生的選項，不需要建立</span>
                            <p v-if="message.text" :class="['bm-msg', message.type]" role="status">{{ message.text }}</p>
                        </div>
                    </template>

                    <!-- 題目表格 -->
                    <template v-else>
                        <div class="bm-toolbar">
                            <input v-model="wordFilter" class="game-input bm-input-sm bm-flex"
                                placeholder="🔍 搜尋題目或出題者" />
                            <button class="bm-act" :class="{ 'bm-act-primary': showBulk }" @click="showBulk = !showBulk">
                                批次新增
                            </button>
                        </div>

                        <!-- 批次新增 -->
                        <form v-if="showBulk" class="bm-bulk" @submit.prevent="handleBulkAdd">
                            <textarea v-model="bulkText" class="game-input bm-textarea" rows="3"
                                placeholder="一行一個詞，也可以用逗號、頓號分隔"></textarea>
                            <div class="bm-bulk-row">
                                <input v-model="bulkAuthor" class="game-input bm-input-sm bm-flex" maxlength="20"
                                    placeholder="出題者（選填，套用到這批）" />
                                <button class="bm-act bm-act-primary" type="submit"
                                    :disabled="busy || !parsedBulkWords.length">
                                    加入 {{ parsedBulkWords.length || '' }} 個詞
                                </button>
                            </div>
                        </form>

                        <div class="bm-table-wrap">
                            <table class="bm-table">
                                <thead>
                                    <tr>
                                        <th class="bm-col-no">#</th>
                                        <th>題目</th>
                                        <th class="bm-col-author">出題者</th>
                                        <th class="bm-col-act">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <!-- 新增列 -->
                                    <tr class="bm-row-new">
                                        <td class="bm-col-no">＋</td>
                                        <td>
                                            <input v-model="newWord.word" ref="newWordRef" class="bm-cell-input"
                                                placeholder="新題目" maxlength="20"
                                                @keydown.enter.prevent="handleAddWord" />
                                        </td>
                                        <td class="bm-col-author">
                                            <input v-model="newWord.author" class="bm-cell-input" placeholder="選填"
                                                maxlength="20" @keydown.enter.prevent="handleAddWord" />
                                        </td>
                                        <td class="bm-col-act">
                                            <button class="bm-act bm-act-primary"
                                                :disabled="busy || !newWord.word.trim()"
                                                @click="handleAddWord">新增</button>
                                        </td>
                                    </tr>

                                    <tr v-for="(w, i) in filteredWords" :key="w.id">
                                        <td class="bm-col-no">{{ i + 1 }}</td>
                                        <template v-if="editingWordId === w.id">
                                            <td>
                                                <input v-model="wordDraft.word" class="bm-cell-input" maxlength="20"
                                                    @keydown.enter.prevent="handleUpdateWord(w)"
                                                    @keydown.esc.stop="editingWordId = null" />
                                            </td>
                                            <td class="bm-col-author">
                                                <input v-model="wordDraft.author" class="bm-cell-input" maxlength="20"
                                                    placeholder="選填"
                                                    @keydown.enter.prevent="handleUpdateWord(w)"
                                                    @keydown.esc.stop="editingWordId = null" />
                                            </td>
                                            <td class="bm-col-act">
                                                <button class="bm-act bm-act-primary" :disabled="busy"
                                                    @click="handleUpdateWord(w)">儲存</button>
                                                <button class="bm-act" @click="editingWordId = null">取消</button>
                                            </td>
                                        </template>
                                        <template v-else>
                                            <td class="bm-cell-word">{{ w.word }}</td>
                                            <td class="bm-col-author bm-cell-muted">{{ w.author || '—' }}</td>
                                            <td class="bm-col-act">
                                                <button class="bm-act" @click="startEditWord(w)">修改</button>
                                                <button class="bm-act bm-act-danger"
                                                    @click="handleDeleteWord(w)">刪除</button>
                                            </td>
                                        </template>
                                    </tr>

                                    <tr v-if="!filteredWords.length && !busy">
                                        <td colspan="4" class="bm-empty">
                                            {{ wordFilter ? '找不到符合的題目' : '這個主題還沒有題目' }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div class="bm-footer">
                            <span>{{ wordFilter ? `符合 ${filteredWords.length} / ` : '共 ' }}{{ words.length }} 題</span>
                            <p v-if="message.text" :class="['bm-msg', message.type]" role="status">{{ message.text }}</p>
                        </div>
                    </template>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
/**
 * 默契字囊團 — 題庫管理彈窗（表格式 CRUD）
 * 密碼由後端 CS_ADMIN_PASSWORD 驗證；密碼只保存在此頁面記憶體中。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { bankAdmin } from '../data/themes.js'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'changed'])

const cardRef = ref(null)
const passwordRef = ref(null)
const newWordRef = ref(null)

const view = ref('login') // 'login' | 'themes' | 'words'
const password = ref('')
const passwordInput = ref('')
const busy = ref(false)
const message = ref({ text: '', type: '' })
let dirty = false

// 主題
const themes = ref([])
const themeFilter = ref('')
const newThemeName = ref('')
const editingThemeId = ref(null)
const themeDraft = ref('')

// 題目
const currentTheme = ref(null)
const words = ref([])
const wordFilter = ref('')
const newWord = ref({ word: '', author: '' })
const editingWordId = ref(null)
const wordDraft = ref({ word: '', author: '' })
const showBulk = ref(false)
const bulkText = ref('')
const bulkAuthor = ref('')

const filteredThemes = computed(() => {
    const q = themeFilter.value.trim()
    return q ? themes.value.filter(t => t.name.includes(q)) : themes.value
})

const filteredWords = computed(() => {
    const q = wordFilter.value.trim()
    if (!q) return words.value
    return words.value.filter(w => w.word.includes(q) || (w.author ?? '').includes(q))
})

const parsedBulkWords = computed(() =>
    bulkText.value.split(/[\n,，、]+/).map(w => w.trim()).filter(Boolean))

function say(text, type = 'info') {
    message.value = { text, type }
}

function close() {
    emit('update:modelValue', false)
    if (dirty) { emit('changed'); dirty = false }
}

// 統一處理 busy / 錯誤；密碼失效時退回登入畫面
async function run(fn) {
    busy.value = true
    say('')
    try {
        return await fn()
    } catch (err) {
        if (err.status === 401) {
            password.value = ''
            view.value = 'login'
        }
        say(err.message, 'error')
    } finally {
        busy.value = false
    }
}

watch(() => props.modelValue, (open) => {
    if (!open) return
    say('')
    nextTick(() => (view.value === 'login' ? passwordRef.value : cardRef.value)?.focus())
    if (view.value === 'themes') loadThemes()
})

async function handleLogin() {
    await run(async () => {
        await bankAdmin.login(passwordInput.value)
        password.value = passwordInput.value
        passwordInput.value = ''
        view.value = 'themes'
        await loadThemes()
    })
}

// ── 主題 CRUD ─────────────────────────────────────────────────
async function loadThemes() {
    await run(async () => { themes.value = await bankAdmin.listThemes(password.value) })
}

async function handleCreateTheme() {
    const name = newThemeName.value.trim()
    if (!name || busy.value) return
    await run(async () => {
        const theme = await bankAdmin.createTheme(password.value, name)
        themes.value.push(theme)
        newThemeName.value = ''
        say(`已新增主題「${theme.name}」，點「題目」開始加入題目`, 'success')
    })
}

function startEditTheme(t) {
    editingThemeId.value = t.id
    themeDraft.value = t.name
}

async function handleRenameTheme(t) {
    const name = themeDraft.value.trim()
    if (!name || name === t.name) { editingThemeId.value = null; return }
    await run(async () => {
        const updated = await bankAdmin.renameTheme(password.value, t.id, name)
        t.name = updated.name
        editingThemeId.value = null
        dirty = true
        say('已更新主題名稱', 'success')
    })
}

async function handleDeleteTheme(t) {
    if (!confirm(`確定刪除主題「${t.name}」？\n裡面的 ${t.count} 個題目會一起刪除，無法復原。`)) return
    await run(async () => {
        await bankAdmin.deleteTheme(password.value, t.id)
        themes.value = themes.value.filter(x => x.id !== t.id)
        dirty = true
        say(`已刪除主題「${t.name}」`, 'success')
    })
}

// ── 題目 CRUD ─────────────────────────────────────────────────
async function openTheme(t) {
    currentTheme.value = t
    words.value = []
    wordFilter.value = ''
    newWord.value = { word: '', author: '' }
    editingWordId.value = null
    showBulk.value = false
    view.value = 'words'
    await run(async () => { words.value = await bankAdmin.listWords(password.value, t.id) })
    nextTick(() => newWordRef.value?.focus())
}

function backToThemes() {
    if (currentTheme.value) currentTheme.value.count = words.value.length
    view.value = 'themes'
    say('')
}

async function addWords(items) {
    const { inserted, duplicates, invalid } = await bankAdmin.addWords(password.value, currentTheme.value.id, items)
    words.value.push(...inserted)
    if (inserted.length) dirty = true
    const extra = [
        duplicates ? `${duplicates} 個重複已略過` : '',
        invalid ? `${invalid} 個超過 20 字已略過` : '',
    ].filter(Boolean).join('，')
    say(`已新增 ${inserted.length} 筆${extra ? `（${extra}）` : ''}`, inserted.length ? 'success' : 'error')
    return inserted.length
}

async function handleAddWord() {
    const word = newWord.value.word.trim()
    if (!word || busy.value) return
    await run(async () => {
        if (await addWords([{ word, author: newWord.value.author }]))
            newWord.value.word = '' // 保留出題者，方便連續新增
        nextTick(() => newWordRef.value?.focus())
    })
}

async function handleBulkAdd() {
    if (!parsedBulkWords.value.length) return
    await run(async () => {
        await addWords(parsedBulkWords.value.map(word => ({ word, author: bulkAuthor.value })))
        bulkText.value = ''
    })
}

function startEditWord(w) {
    editingWordId.value = w.id
    wordDraft.value = { word: w.word, author: w.author ?? '' }
}

async function handleUpdateWord(w) {
    const word = wordDraft.value.word.trim()
    const author = wordDraft.value.author.trim()
    if (!word) { say('題目不能空白', 'error'); return }
    if (word === w.word && author === (w.author ?? '')) { editingWordId.value = null; return }
    await run(async () => {
        const updated = await bankAdmin.updateWord(password.value, w.id, { word, author })
        Object.assign(w, updated)
        editingWordId.value = null
        say('已更新', 'success')
    })
}

async function handleDeleteWord(w) {
    if (!confirm(`確定刪除「${w.word}」？`)) return
    await run(async () => {
        await bankAdmin.deleteWord(password.value, w.id)
        words.value = words.value.filter(x => x.id !== w.id)
        dirty = true
        say(`已刪除「${w.word}」`, 'success')
    })
}
</script>

<style scoped>
.bm-card {
    max-width: 440px;
    width: 100%;
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    text-align: left;
    overflow: hidden;
}

.bm-card-wide {
    max-width: 680px;
    height: 88vh;
}

.bm-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 14px 20px;
    border-bottom: 1px solid var(--divider);
}

.bm-title {
    flex: 1;
    min-width: 0;
    font-size: 20px;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.bm-body {
    padding: 16px 20px 20px;
}

.bm-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.bm-hint {
    margin: 0;
    font-size: 13px;
    color: var(--label);
}

.bm-flex {
    flex: 1;
    min-width: 0;
}

.bm-input-sm {
    padding: 8px 12px;
    font-size: 14px;
}

/* 工具列 / 批次新增 */
.bm-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
}

.bm-bulk {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0 16px 12px;
    padding: 12px;
    border-radius: 10px;
    border: 1px dashed var(--border);
}

.bm-bulk-row {
    display: flex;
    gap: 8px;
}

.bm-textarea {
    resize: vertical;
    min-height: 72px;
    line-height: 1.6;
}

/* 表格 */
.bm-table-wrap {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0 16px;
    border: 1px solid var(--border);
    border-radius: 10px;
}

.bm-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.bm-table th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 9px 10px;
    font-size: 12px;
    font-weight: 600;
    text-align: left;
    color: var(--label);
    background: var(--bg-subtle);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
}

.bm-table td {
    padding: 6px 10px;
    color: var(--heading);
    border-bottom: 1px solid var(--divider);
    vertical-align: middle;
}

.bm-table tbody tr:last-child td {
    border-bottom: none;
}

.bm-table tbody tr:not(.bm-row-new):hover td {
    background: var(--bg-subtle);
}

.bm-row-new td {
    background: rgba(6, 182, 212, 0.06);
}

.bm-col-no {
    width: 44px;
    text-align: center !important;
    color: var(--label) !important;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
}

.bm-col-num {
    width: 64px;
    text-align: right !important;
    font-variant-numeric: tabular-nums;
}

.bm-col-author {
    width: 28%;
}

.bm-col-act {
    width: 1%;
    white-space: nowrap;
    text-align: right !important;
}

.bm-cell-word {
    font-weight: 500;
}

.bm-cell-muted {
    color: var(--label) !important;
}

.bm-cell-input {
    width: 100%;
    padding: 6px 10px;
    font-size: 14px;
    color: var(--heading);
    background: var(--bg-subtle);
    border: 1px solid var(--border);
    border-radius: 6px;
    outline: none;
}

.bm-cell-input:focus {
    border-color: var(--color-neon-cyan, #06B6D4);
}

.bm-empty {
    padding: 28px 10px !important;
    text-align: center;
    color: var(--label) !important;
}

/* 操作按鈕 */
.bm-act {
    padding: 5px 10px;
    margin-left: 4px;
    font-size: 13px;
    color: var(--body);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
}

.bm-act:hover:not(:disabled) {
    color: var(--heading);
    border-color: var(--border-glow, var(--border));
}

.bm-act:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

.bm-act-primary {
    color: #06B6D4;
    border-color: rgba(6, 182, 212, 0.45);
}

.bm-act-danger {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.4);
}

.bm-act-danger:hover:not(:disabled) {
    color: #fff;
    background: #ef4444;
    border-color: #ef4444;
}

.bm-link {
    padding: 0;
    font-size: 14px;
    font-weight: 500;
    color: var(--heading);
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
}

.bm-link:hover {
    color: #06B6D4;
    text-decoration: underline;
}

/* 底部狀態列 */
.bm-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 10px 20px 14px;
    font-size: 12px;
    color: var(--label);
}

.bm-msg {
    margin: 0;
    font-size: 13px;
    color: var(--body);
}

.bm-msg.success {
    color: #34d399;
}

.bm-msg.error {
    color: #f87171;
}

/* 手機：縮小欄位與按鈕 */
@media (max-width: 520px) {
    .bm-toolbar { padding: 10px 12px; }
    .bm-table-wrap { margin: 0 12px; }
    .bm-bulk { margin: 0 12px 10px; }
    .bm-col-no { display: none; }
    .bm-table td, .bm-table th { padding: 6px 6px; }
    .bm-act { padding: 4px 7px; font-size: 12px; margin-left: 2px; }
}
</style>
