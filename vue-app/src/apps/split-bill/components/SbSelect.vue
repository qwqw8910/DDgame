<template>
    <div ref="root" class="sbsel">
        <button type="button" class="game-input sbsel__btn" aria-haspopup="listbox" :aria-expanded="open"
            :aria-label="ariaLabel" @click="toggle" @keydown="onButtonKey">
            <span class="sbsel__label">{{ current?.short ?? current?.label ?? placeholder }}</span>
            <svg class="sbsel__caret" :class="{ 'sbsel__caret--up': open }" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                <path d="M213.66,101.66l-80,80a8,8,0,0,1-11.32,0l-80-80A8,8,0,0,1,53.66,90.34L128,164.69l74.34-74.35a8,8,0,0,1,11.32,11.32Z" />
            </svg>
        </button>

        <!-- 傳送到 body 並用 fixed 定位：彈窗有 overflow，放在裡面會被裁切或把彈窗撐開 -->
        <Teleport to="body">
            <div v-if="open" ref="listRoot" class="sb-theme sbsel__list" :style="pos" role="listbox" tabindex="-1">
                <input v-if="isSearchable" ref="searchEl" v-model="query" class="game-input sbsel__search" placeholder="輸入搜尋…"
                    aria-label="搜尋選項" autocomplete="off" @keydown="onSearchKey" />
                <ul ref="listEl" class="sbsel__items" :style="{ maxHeight: itemsMax + 'px' }">
                    <li v-for="(o, i) in filtered" :key="o.value" role="option" :aria-selected="o.value === modelValue"
                        :class="['sbsel__opt', { 'sbsel__opt--on': o.value === modelValue, 'sbsel__opt--hl': i === hl }]"
                        @pointerenter="hl = i" @click="choose(o)">
                        <span>{{ o.label }}</span>
                        <svg v-if="o.value === modelValue" viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z" />
                        </svg>
                    </li>
                    <li v-if="!filtered.length" class="sbsel__none">找不到符合的選項</li>
                </ul>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps({
    modelValue: { type: String, default: '' },
    options: { type: Array, required: true },       // [{ value, label, short?, keywords? }]；short = 收合時顯示的短標籤
    placeholder: { type: String, default: '請選擇' },
    ariaLabel: { type: String, default: '' },
    searchable: { type: Boolean, default: null },   // null = 選項超過 8 個才出現搜尋框
})
const emit = defineEmits(['update:modelValue'])

const root = ref(null)
const listRoot = ref(null)
const searchEl = ref(null)
const listEl = ref(null)
const open = ref(false)
const hl = ref(0)
const query = ref('')
const pos = ref({})
const itemsMax = ref(240)
const current = computed(() => props.options.find(o => o.value === props.modelValue))
const isSearchable = computed(() => props.searchable ?? props.options.length > 8)

const filtered = computed(() => {
    const q = query.value.trim().toLowerCase()
    if (!q) return props.options
    return props.options.filter(o => `${o.value} ${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q))
})
watch(query, () => { hl.value = 0 })

// 依按鈕位置定位；下方空間不夠就往上開，高度也隨剩餘空間縮短
function place() {
    const btn = root.value?.getBoundingClientRect()
    if (!btn) return
    const gap = 6, chrome = isSearchable.value ? 64 : 20, want = 240
    const below = window.innerHeight - btn.bottom - gap - 12
    const above = btn.top - gap - 12
    const up = below < 180 && above > below
    const room = Math.max(120, (up ? above : below) - chrome)
    itemsMax.value = Math.min(want, room)
    const width = Math.max(btn.width, 200)
    const left = Math.min(Math.max(8, btn.left), Math.max(8, window.innerWidth - width - 8))
    pos.value = up
        ? { left: `${left}px`, bottom: `${window.innerHeight - btn.top + gap}px`, minWidth: `${btn.width}px` }
        : { left: `${left}px`, top: `${btn.bottom + gap}px`, minWidth: `${btn.width}px` }
}

function toggle() {
    open.value = !open.value
    if (!open.value) return
    query.value = ''
    hl.value = Math.max(0, props.options.findIndex(o => o.value === props.modelValue))
    place()
    nextTick(() => {
        searchEl.value?.focus()
        listEl.value?.querySelector('.sbsel__opt--hl')?.scrollIntoView({ block: 'nearest' })
    })
}
function choose(o) {
    if (!o) return
    emit('update:modelValue', o.value)
    open.value = false
}
function move(dir) {
    const n = filtered.value.length
    if (!n) return
    hl.value = (hl.value + dir + n) % n
    nextTick(() => listEl.value?.querySelector('.sbsel__opt--hl')?.scrollIntoView({ block: 'nearest' }))
}
function onButtonKey(e) {
    if (e.key === 'Escape') { open.value = false; return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        if (!open.value) return toggle()
        move(e.key === 'ArrowDown' ? 1 : -1)
    } else if ((e.key === 'Enter' || e.key === ' ') && open.value) {
        e.preventDefault()
        choose(filtered.value[hl.value])
    }
}
function onSearchKey(e) {
    if (e.key === 'Escape') { open.value = false; root.value?.querySelector('.sbsel__btn')?.focus(); return }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1) }
    else if (e.key === 'Enter') { e.preventDefault(); choose(filtered.value[hl.value]) }
}

const onDown = (e) => {
    if (root.value?.contains(e.target) || listRoot.value?.contains(e.target)) return
    open.value = false
}
// 捲動（彈窗內容）或縮放時：按鈕移動了，重新定位；若是選單自己在捲動就不處理
const onMove = (e) => { if (!listRoot.value?.contains(e.target)) place() }
watch(open, (v) => {
    const act = v ? 'addEventListener' : 'removeEventListener'
    document[act]('pointerdown', onDown)
    window[act]('scroll', onMove, true)
    window[act]('resize', onMove)
})
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDown)
    window.removeEventListener('scroll', onMove, true)
    window.removeEventListener('resize', onMove)
})
</script>

<style scoped>
.sbsel { position: relative; }
.sbsel__btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding-left: 14px; padding-right: 14px; text-align: left; cursor: pointer; }
.sbsel__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbsel__caret { width: 18px; height: 18px; flex-shrink: 0; color: #d05f56; transition: transform 0.2s; }
.sbsel__caret--up { transform: rotate(180deg); }
.sbsel__list { position: fixed; z-index: 300; width: max-content; max-width: min(80vw, 360px);
    padding: 6px; background: #fff; border: 2px solid #f5d0ca; border-radius: 14px; box-shadow: 0 8px 20px rgba(90, 58, 54, 0.15); }
.sbsel__search { width: 100%; margin-bottom: 6px; padding-left: 12px !important; }
.sbsel__items { overflow-y: auto; margin: 0; padding: 0; list-style: none; }
.sbsel__opt { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; border-radius: 10px; font-size: 16px; color: #5a3a36; cursor: pointer; }
.sbsel__opt--hl { background: #fff3ee; }
.sbsel__opt--on { color: #d05f56; font-weight: 700; }
.sbsel__none { padding: 10px 12px; font-size: 14px; color: #a08682; }
</style>
