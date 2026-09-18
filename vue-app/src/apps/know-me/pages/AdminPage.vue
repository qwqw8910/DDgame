<template>
    <div class="min-h-screen">
        <!-- Theme toggle -->
        <button @click="toggleTheme" title="切換主題" class="theme-toggle fixed top-4 right-4 z-50">
            {{ isDark ? '🌙' : '☀️' }}
        </button>

        <!-- 登入畫面 -->
        <div v-if="!connected" class="min-h-screen flex items-center justify-center p-4">
            <div class="game-card animate-bounce-in max-w-[420px] w-full text-center [cursor:default] hover:!translate-y-0">
                <div class="text-5xl mb-2">🔐</div>
                <h2 class="neon-heading text-[22px] mb-1 [letter-spacing:-0.22px] text-heading">題庫管理後台</h2>
                <p class="text-[13px] mb-5 text-body">請輸入 Supabase 連線資訊</p>

                <div class="text-left mb-3">
                    <label class="text-xs font-medium mb-1 block text-label">Supabase URL</label>
                    <div class="input-wrapper">
                        <span class="input-icon">🌐</span>
                        <input v-model="url" ref="urlInputRef" class="game-input pl-9" placeholder="https://xxx.supabase.co"
                            @keydown.enter="() => keyInputRef?.focus()" />
                    </div>
                </div>
                <div class="text-left mb-5">
                    <label class="text-xs font-medium mb-1 block text-label">Service Role Key</label>
                    <div class="input-wrapper">
                        <span class="input-icon">🔑</span>
                        <input v-model="key" ref="keyInputRef" type="password" class="game-input pl-9" placeholder="eyJhbGciOi…"
                            @keydown.enter="connectDB" />
                    </div>
                </div>

                <button class="btn-primary" :disabled="connecting" @click="connectDB">
                    {{ connecting ? '連線中…' : '連線' }}
                </button>
                <p v-if="connectError" class="text-xs mt-2 text-error-fg">{{ connectError }}</p>
            </div>
        </div>

        <!-- 管理面板 -->
        <div v-else class="max-w-[960px] mx-auto px-4 pt-6 pb-16">

            <!-- Header -->
            <div class="flex items-center justify-between mb-5 flex-wrap gap-2">
                <div>
                    <h1 class="neon-heading text-[22px] [letter-spacing:-0.22px] m-0 text-heading">🔧 題庫管理</h1>
                    <p class="text-xs mt-0.5 m-0 text-body">本機專用工具</p>
                </div>
                <div class="flex gap-2 items-center">
                    <span class="badge text-[13px] rounded-md py-1 px-3 bg-accent-tint text-accent">{{ allQuestions.length ? `${allQuestions.length} 題` : '— 題' }}</span>
                    <button class="btn-ghost w-auto py-1.5 px-3.5 text-[13px]" @click="exportCSV">📥 匯出 CSV</button>
                </div>
            </div>

            <!-- CSV 上傳區 -->
            <div class="game-card mb-4 [cursor:default] hover:!translate-y-0">
                <h3 class="text-[15px] font-medium m-0 mb-3 text-heading">📤 上傳 CSV</h3>
                <div class="admin-dropzone" :class="{ 'is-active': dropActive }" @click="fileInputRef?.click()"
                    @dragover.prevent="dropActive = true" @dragleave="dropActive = false"
                    @drop.prevent="onDrop">
                    <div class="text-4xl mb-2">📁</div>
                    <p class="text-sm m-0 text-body">拖拉 CSV 檔案到這裡，或<span class="font-medium text-accent">點擊選擇</span></p>
                    <p class="text-[11px] mt-1.5 m-0 text-body">格式：id, topic_id, option_a, option_b, title</p>
                    <input ref="fileInputRef" type="file" accept=".csv" hidden @change="onFileChange" />
                </div>
            </div>

            <!-- 預覽區 -->
            <div v-if="pendingRows.length" class="game-card mb-4 [cursor:default] hover:!translate-y-0">
                <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 class="text-[15px] font-medium m-0 text-heading">📋 預覽變更</h3>
                    <div class="flex gap-1.5 flex-wrap">
                        <span class="badge text-[13px] rounded-md py-1 px-3 [background:rgba(16,185,129,0.12)] [color:var(--color-success-text)]">🆕 新增 {{ previewCounts.insert }}</span>
                        <span class="badge text-[13px] rounded-md py-1 px-3 [background:rgba(251,191,36,0.1)] [color:#FBBF24]">✏️ 修改 {{ previewCounts.update }}</span>
                        <span class="badge text-[13px] rounded-md py-1 px-3 [background:rgba(244,63,94,0.1)] text-error-fg">🗑️ 刪除 {{ previewCounts.delete }}</span>
                    </div>
                </div>
                <div class="max-h-[360px] overflow-y-auto rounded-md border border-border">
                    <table class="admin-table">
                        <thead><tr><th>動作</th><th>ID</th><th>主題</th><th>選項 A</th><th>選項 B</th><th>標題</th><th>作者</th></tr></thead>
                        <tbody>
                            <tr v-for="(r, i) in pendingRows" :key="i" :class="`admin-row--${r._action}`">
                                <td class="text-xs">{{ actionLabel(r._action) }}</td>
                                <td class="text-[11px] font-mono text-body">{{ r.id ? r.id.slice(0, 8) + '…' : '(自動)' }}</td>
                                <td><span class="badge badge-host">{{ r.topic_id }}</span></td>
                                <td>{{ r.option_a }}</td>
                                <td>{{ r.option_b }}</td>
                                <td class="text-xs text-body">{{ r.title }}</td>
                                <td class="text-xs text-label">{{ r.author }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="flex gap-2 mt-3.5">
                    <button class="btn-primary flex-1" :disabled="submitting" @click="submitBatch">
                        {{ submitting ? '⏳ 提交中…' : '✅ 確認提交' }}
                    </button>
                    <button class="btn-ghost w-auto flex-none py-2.5 px-5" @click="cancelPreview">取消</button>
                </div>
                <div v-if="submitResult" class="mt-2.5 text-[13px]">
                    <span :class="submitResult.errors.length ? 'text-[color:var(--color-ruby)]' : 'text-success-text'">{{ submitResult.message }}</span>
                    <template v-if="submitResult.errors.length">
                        <br><span class="text-[11px] text-[color:var(--color-ruby)]">
                            <template v-for="(e, i) in submitResult.errors" :key="i">{{ e }}<br></template>
                        </span>
                    </template>
                </div>
            </div>

            <!-- 現有題庫 -->
            <div class="game-card [cursor:default] hover:!translate-y-0">
                <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h3 class="text-[15px] font-medium m-0 text-heading">📚 目前題庫</h3>
                    <div class="flex gap-1.5 items-center flex-wrap">
                        <div class="relative">
                            <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm pointer-events-none">🔍</span>
                            <input v-model="searchTerm" placeholder="搜尋題目…"
                                class="w-[180px] text-xs py-1 pl-8 pr-2.5 rounded-lg border border-border bg-input text-heading outline-none focus:border-[color:var(--color-neon-purple)]" />
                        </div>
                        <button class="btn-primary w-auto py-1.5 px-3.5 text-[13px]" @click="openAddModal">➕ 新增題目</button>
                    </div>
                </div>
                <div class="flex gap-1 flex-wrap mb-2.5">
                    <button class="admin-filter-btn" :class="{ 'is-active': activeFilter === '' }" @click="activeFilter = ''">全部</button>
                    <button v-for="t in topicList" :key="t" class="admin-filter-btn" :class="{ 'is-active': activeFilter === t }"
                        @click="activeFilter = t">{{ t }}</button>
                </div>
                <div class="max-h-[520px] overflow-y-auto">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th class="w-10">#</th>
                                <th class="w-20">主題</th>
                                <th>選項 A</th>
                                <th>選項 B</th>
                                <th class="w-40">標題</th>
                                <th class="w-[72px]"></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="!filteredQuestions.length">
                                <td colspan="6" class="text-center text-body py-6">{{ searchTerm ? '沒有符合搜尋的題目' : '沒有題目' }}</td>
                            </tr>
                            <tr v-for="(q, i) in filteredQuestions" :key="q.id">
                                <td class="text-body">{{ i + 1 }}</td>
                                <td class="admin-edit-cell" @click="openEditModal(q.id)"><span class="badge badge-host">{{ q.topic_id }}</span></td>
                                <td class="admin-edit-cell" @click="openEditModal(q.id)">{{ q.option_a }}</td>
                                <td class="admin-edit-cell" @click="openEditModal(q.id)">{{ q.option_b }}</td>
                                <td class="admin-edit-cell text-xs text-body" @click="openEditModal(q.id)">{{ q.title || '' }}</td>
                                <td>
                                    <div class="flex gap-1">
                                        <button class="btn-danger-sm [background:rgba(139,92,246,0.12)] text-accent [border-color:rgba(139,92,246,0.25)]"
                                            title="編輯" @click="openEditModal(q.id)">✏️</button>
                                        <button class="btn-danger-sm" title="刪除" @click="deleteOne(q.id)">✕</button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- 編輯 / 新增 Modal -->
        <DialogRoot :open="!!editing" @update:open="v => !v && closeModal()">
            <DialogPortal>
                <DialogOverlay class="fixed inset-0 bg-[rgba(5,5,15,0.7)] backdrop-blur-md z-[300]" />
                <DialogContent
                    class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[300] rounded-xl p-7 max-w-[560px] w-[calc(100vw-32px)] outline-none animate-bounce-in bg-card-solid border border-border-glow [box-shadow:0_30px_60px_rgba(0,0,0,0.5),0_0_30px_rgba(139,92,246,0.08)]">
                    <div class="flex items-center justify-between mb-4">
                        <DialogTitle class="text-[17px] font-medium m-0 text-heading">{{ editing?.id ? '✏️ 編輯題目' : '➕ 新增題目' }}</DialogTitle>
                        <DialogClose as-child>
                            <button class="bg-transparent border-0 text-xl cursor-pointer p-1 text-body">&times;</button>
                        </DialogClose>
                    </div>
                    <DialogDescription class="sr-only">編輯題目的主題、選項、標題與作者</DialogDescription>
                    <template v-if="editing">
                        <div class="mb-3">
                            <label class="text-xs font-medium mb-1 block text-label">主題 (topic_id)</label>
                            <div class="flex gap-1.5 flex-wrap mb-1.5">
                                <button v-for="t in topicList" :key="t" type="button" class="admin-filter-btn text-[11px] py-0.5 px-2"
                                    @click="editing.topic_id = t">{{ t }}</button>
                            </div>
                            <input v-model="editing.topic_id" class="game-input" placeholder="例如：career, love, life" />
                        </div>
                        <div class="mb-3">
                            <label class="text-xs font-medium mb-1 block text-label">選項 A</label>
                            <textarea v-model="editing.option_a" rows="2" placeholder="輸入選項 A"
                                class="w-full py-2 px-3 rounded-lg text-[13px] outline-none transition-colors duration-200 resize-y min-h-[60px] border border-border bg-input text-heading font-sans focus:border-[color:var(--color-neon-purple)]" />
                        </div>
                        <div class="mb-3">
                            <label class="text-xs font-medium mb-1 block text-label">選項 B</label>
                            <textarea v-model="editing.option_b" rows="2" placeholder="輸入選項 B"
                                class="w-full py-2 px-3 rounded-lg text-[13px] outline-none transition-colors duration-200 resize-y min-h-[60px] border border-border bg-input text-heading font-sans focus:border-[color:var(--color-neon-purple)]" />
                        </div>
                        <div class="mb-3">
                            <label class="text-xs font-medium mb-1 block text-label">標題 (可留空)</label>
                            <input v-model="editing.title" class="game-input" placeholder="例如：二選一，你想要哪個？" />
                        </div>
                        <div class="mb-5">
                            <label class="text-xs font-medium mb-1 block text-label">作者 (可留空)</label>
                            <input v-model="editing.author" class="game-input" placeholder="留空則不顯示" maxlength="20" />
                        </div>
                        <div class="flex gap-2">
                            <button class="btn-primary flex-1" :disabled="saving" @click="saveEdit">
                                {{ saving ? '✉️ 儲存中…' : (editing.id ? '💾 儲存' : '➕ 新增') }}
                            </button>
                            <button class="btn-ghost w-auto flex-none py-2.5 px-5" @click="closeModal">取消</button>
                        </div>
                    </template>
                </DialogContent>
            </DialogPortal>
        </DialogRoot>

        <!-- Toast -->
        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { createClient } from '@supabase/supabase-js'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription, DialogClose } from 'reka-ui'

// ── 主題切換 ──────────────────────────────────────────────────────
const isDark = ref(document.documentElement.getAttribute('data-theme') !== 'light')
function toggleTheme() {
    const html = document.documentElement
    const next = html.getAttribute('data-theme') === 'light' ? 'mygame' : 'light'
    html.setAttribute('data-theme', next)
    localStorage.setItem('theme', next === 'light' ? 'light' : 'dark')
    isDark.value = next !== 'light'
}

// ── Toast ─────────────────────────────────────────────────────────
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '') {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, 2500)
}

// ── 連線（每次執行期輸入，不寫死、不進 env、不進 build）───────────
// service_role key 可繞過 RLS，只在瀏覽器記憶體中存活，重整即消失
const connected = ref(false)
const url = ref('')
const key = ref('')
const connecting = ref(false)
const connectError = ref('')
const urlInputRef = ref(null)
const keyInputRef = ref(null)
let db = null

async function connectDB() {
    connectError.value = ''
    if (!url.value.trim() || !key.value.trim()) { connectError.value = '請填入完整資訊'; return }

    connecting.value = true
    try {
        db = createClient(url.value.trim(), key.value.trim(), { auth: { persistSession: false } })
        const { error } = await db.from('questions').select('id').limit(1)
        if (error) throw error
        connected.value = true
        await loadQuestions()
    } catch (e) {
        connectError.value = '連線失敗：' + e.message
    } finally {
        connecting.value = false
    }
}

// ── 題庫讀取 ──────────────────────────────────────────────────────
const allQuestions = ref([])
const activeFilter = ref('')
const searchTerm = ref('')

async function loadQuestions() {
    const { data, error } = await db.from('questions').select('*').order('topic_id')
    if (error) { showToast('讀取失敗：' + error.message, 'error'); return }
    allQuestions.value = data || []
}

const topicList = computed(() => [...new Set(allQuestions.value.map(q => q.topic_id))].sort())

const filteredQuestions = computed(() => {
    let list = activeFilter.value ? allQuestions.value.filter(q => q.topic_id === activeFilter.value) : allQuestions.value
    const term = searchTerm.value.trim().toLowerCase()
    if (term) {
        list = list.filter(q =>
            (q.option_a || '').toLowerCase().includes(term) ||
            (q.option_b || '').toLowerCase().includes(term) ||
            (q.title || '').toLowerCase().includes(term) ||
            (q.topic_id || '').toLowerCase().includes(term)
        )
    }
    return list
})

async function deleteOne(id) {
    if (!confirm('確定要刪除這題嗎？')) return
    const { error } = await db.from('questions').delete().eq('id', id)
    if (error) { showToast('刪除失敗：' + error.message, 'error'); return }
    showToast('已刪除', 'success')
    await loadQuestions()
}

// ── CSV 上傳 ──────────────────────────────────────────────────────
const dropActive = ref(false)
const fileInputRef = ref(null)
const pendingRows = ref([])
const submitting = ref(false)
const submitResult = ref(null)

function onDrop(e) {
    dropActive.value = false
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
}
function onFileChange() {
    if (fileInputRef.value?.files[0]) handleFile(fileInputRef.value.files[0])
}

function handleFile(file) {
    if (!file || !file.name.endsWith('.csv')) { showToast('請上傳 .csv 檔案', 'error'); return }
    const reader = new FileReader()
    reader.onload = e => parseAndPreview(e.target.result)
    reader.readAsText(file, 'UTF-8')
}

// ── CSV 解析（RFC 4180 狀態機，支援欄位內換行）──────────────────
function parseCSV(text) {
    const records = []
    let curField = ''
    let inQuotes = false
    let curRecord = []
    const n = text.length

    for (let i = 0; i < n; i++) {
        const ch = text[i]
        const next = text[i + 1]

        if (inQuotes) {
            if (ch === '"' && next === '"') { curField += '"'; i++ }
            else if (ch === '"') { inQuotes = false }
            else { curField += ch }
        } else {
            if (ch === '"') { inQuotes = true }
            else if (ch === ',') { curRecord.push(curField); curField = '' }
            else if (ch === '\r' && next === '\n') {
                curRecord.push(curField); curField = ''
                records.push(curRecord); curRecord = []
                i++
            } else if (ch === '\n' || ch === '\r') {
                curRecord.push(curField); curField = ''
                records.push(curRecord); curRecord = []
            } else {
                curField += ch
            }
        }
    }
    if (curField || curRecord.length) {
        curRecord.push(curField)
        if (curRecord.some(f => f.trim())) records.push(curRecord)
    }

    if (!records.length) return []

    const headerRow = records[0].map(h => h.toLowerCase().trim())
    const hasHeader = headerRow.includes('id') && headerRow.includes('topic_id')
    const start = hasHeader ? 1 : 0

    const rows = []
    for (let i = start; i < records.length; i++) {
        const cols = records[i]
        if (cols.length < 4) continue
        rows.push({
            id: cols[0].trim(),
            topic_id: cols[1].trim(),
            option_a: cols[2].trim(),
            option_b: cols[3].trim(),
            title: (cols[4] || '').trim(),
            author: (cols[5] || '').trim(),
        })
    }
    return rows
}

function actionLabel(action) {
    if (action === 'insert') return '🆕 新增'
    if (action === 'delete') return '🗑️ 刪除'
    return '✏️ 修改'
}

function parseAndPreview(text) {
    const rows = parseCSV(text)
    if (!rows.length) { showToast('CSV 中沒有有效資料', 'error'); return }

    // 分類：無 id → 新增 / 有 id 但欄位全空 → 刪除 / 有 id 且有內容 → 修改
    const existIds = new Set(allQuestions.value.map(q => q.id))
    pendingRows.value = rows.map(r => {
        if (!r.id) return { ...r, _action: 'insert' }
        if (!r.topic_id && !r.option_a && !r.option_b) return { ...r, _action: 'delete' }
        return { ...r, _action: existIds.has(r.id) ? 'update' : 'insert' }
    })
    submitResult.value = null
}

const previewCounts = computed(() => ({
    insert: pendingRows.value.filter(r => r._action === 'insert').length,
    update: pendingRows.value.filter(r => r._action === 'update').length,
    delete: pendingRows.value.filter(r => r._action === 'delete').length,
}))

function cancelPreview() {
    pendingRows.value = []
    submitResult.value = null
    if (fileInputRef.value) fileInputRef.value.value = ''
}

function chunk(arr, size) {
    const out = []
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
    return out
}

// ── 批次提交（合併為最少 API 請求）─────────────────────────────
async function submitBatch() {
    submitting.value = true
    submitResult.value = null

    let inserted = 0, updated = 0, deleted = 0
    const errors = []

    const inserts = pendingRows.value.filter(r => r._action === 'insert')
    const updates = pendingRows.value.filter(r => r._action === 'update')
    const deletes = pendingRows.value.filter(r => r._action === 'delete')

    // 1) 批次新增（每批 100 筆）
    if (inserts.length) {
        for (const batch of chunk(inserts, 100)) {
            const payloads = batch.map(r => {
                const p = { topic_id: r.topic_id, option_a: r.option_a, option_b: r.option_b, title: r.title || null, author: r.author || null }
                if (r.id) p.id = r.id
                return p
            })
            const { error } = await db.from('questions').insert(payloads)
            if (error) errors.push('新增失敗: ' + error.message)
            else inserted += batch.length
        }
    }

    // 2) 批次修改（每批 200 筆 upsert）
    if (updates.length) {
        for (const batch of chunk(updates, 200)) {
            const payloads = batch.map(r => ({
                id: r.id, topic_id: r.topic_id, option_a: r.option_a, option_b: r.option_b, title: r.title || null, author: r.author || null
            }))
            const { error } = await db.from('questions').upsert(payloads, { onConflict: 'id' })
            if (error) errors.push('修改失敗: ' + error.message)
            else updated += batch.length
        }
    }

    // 3) 批次刪除（一次 delete + in）
    if (deletes.length) {
        const ids = deletes.map(r => r.id)
        const { error } = await db.from('questions').delete().in('id', ids)
        if (error) errors.push('刪除失敗: ' + error.message)
        else deleted = deletes.length
    }

    submitting.value = false

    const msg = `完成！新增 ${inserted} / 修改 ${updated} / 刪除 ${deleted}` + (errors.length ? ` / 錯誤 ${errors.length}` : '')
    submitResult.value = { message: msg, errors }
    showToast(msg, errors.length ? 'error' : 'success')

    await loadQuestions()
    if (!errors.length) cancelPreview()
}

// ── 匯出 CSV ──────────────────────────────────────────────────────
function csvEscape(str) {
    if (!str) return ''
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"'
    }
    return str
}

function exportCSV() {
    if (!allQuestions.value.length) { showToast('題庫為空', 'error'); return }
    const header = 'id,topic_id,option_a,option_b,title,author'
    const lines = allQuestions.value.map(q =>
        [q.id, q.topic_id, csvEscape(q.option_a), csvEscape(q.option_b), csvEscape(q.title || ''), csvEscape(q.author || '')].join(',')
    )
    const csv = [header, ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'questions_' + new Date().toISOString().slice(0, 10) + '.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    showToast('已匯出 CSV', 'success')
}

// ── 編輯 / 新增 Modal ─────────────────────────────────────────────
const editing = ref(null)
const saving = ref(false)

function openAddModal() {
    editing.value = { id: '', topic_id: '', option_a: '', option_b: '', title: '', author: '' }
}

function openEditModal(id) {
    const q = allQuestions.value.find(x => x.id === id)
    if (!q) return
    editing.value = { id: q.id, topic_id: q.topic_id || '', option_a: q.option_a || '', option_b: q.option_b || '', title: q.title || '', author: q.author || '' }
}

function closeModal() {
    editing.value = null
}

async function saveEdit() {
    const { id, author } = editing.value
    const topic_id = editing.value.topic_id.trim()
    const option_a = editing.value.option_a.trim()
    const option_b = editing.value.option_b.trim()
    const title = editing.value.title.trim() || null
    const authorVal = (author || '').trim() || null

    if (!topic_id || !option_a || !option_b) {
        showToast('請填入主題、選項 A 和選項 B', 'error')
        return
    }

    saving.value = true
    try {
        if (id) {
            const { error } = await db.from('questions').update({ topic_id, option_a, option_b, title, author: authorVal }).eq('id', id)
            if (error) throw error
            showToast('✅ 已儲存', 'success')
        } else {
            const { error } = await db.from('questions').insert({ topic_id, option_a, option_b, title, author: authorVal })
            if (error) throw error
            showToast('✅ 已新增', 'success')
        }
        closeModal()
        await loadQuestions()
    } catch (e) {
        showToast('儲存失敗：' + e.message, 'error')
    } finally {
        saving.value = false
    }
}
</script>
