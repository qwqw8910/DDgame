<template>
    <div ref="root" class="sbdate">
        <button type="button" class="game-input sbdate__btn" aria-haspopup="dialog" :aria-expanded="open"
            :aria-label="ariaLabel" @click="toggle" @keydown.esc="open = false">
            <span class="sbdate__label">{{ label }}</span>
            <svg class="sbdate__icon" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
                <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM72,48v8a8,8,0,0,0,16,0V48h80v8a8,8,0,0,0,16,0V48h24V80H48V48ZM208,208H48V96H208V208Z" />
            </svg>
        </button>

        <!-- 傳送到 body 並用 fixed 定位，原因同 SbSelect：彈窗有 overflow 會裁切 -->
        <Teleport to="body">
            <div v-if="open" ref="panel" class="sb-theme sbdate__panel" :style="pos" role="dialog" aria-label="選擇日期" @keydown.esc="open = false">
                <div class="sbdate__months">
                    <section v-for="(mo, i) in months" :key="mo.y * 12 + mo.m" class="sbdate__month">
                        <div class="sbdate__nav">
                            <button type="button" class="sbdate__step" :style="{ visibility: i === 0 ? 'visible' : 'hidden' }"
                                aria-label="上個月" @click="shift(-1)">
                                <svg viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" /></svg>
                            </button>
                            <span class="sbdate__title">{{ mo.y }} 年 {{ mo.m + 1 }} 月</span>
                            <button type="button" class="sbdate__step" :style="{ visibility: i === months.length - 1 ? 'visible' : 'hidden' }"
                                aria-label="下個月" @click="shift(1)">
                                <svg viewBox="0 0 256 256" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" /></svg>
                            </button>
                        </div>

                        <div class="sbdate__grid sbdate__week" aria-hidden="true">
                            <span v-for="w in WEEK" :key="w">{{ w }}</span>
                        </div>
                        <div class="sbdate__grid">
                            <button v-for="d in mo.days" :key="d.iso" type="button" :disabled="!d.inMonth" :tabindex="d.inMonth ? 0 : -1"
                                :class="['sbdate__day', { 'sbdate__day--blank': !d.inMonth, 'sbdate__day--today': d.iso === today, 'sbdate__day--on': d.iso === modelValue }]"
                                :aria-label="d.iso" :aria-pressed="d.iso === modelValue" @click="pick(d.iso)">{{ d.inMonth ? d.n : '' }}</button>
                        </div>
                    </section>
                </div>

                <div class="sbdate__foot">
                    <button type="button" class="sbdate__today" @click="pick(today)">回到今天</button>
                </div>
            </div>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
    modelValue: { type: String, default: '' },      // YYYY-MM-DD
    ariaLabel: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const CELL = 36, GAP = 4                            // 日期格大小（px），跟面板寬度無關
const MONTH_W = CELL * 7 + GAP * 6                  // 單月寬度
const pad = (n) => String(n).padStart(2, '0')
const dateIso = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
const parse = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
    return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null
}

const root = ref(null)
const panel = ref(null)
const open = ref(false)
const pos = ref({})
const wide = ref(true)                              // 螢幕夠寬才並排兩個月，手機只顯示一個月
const view = ref({ y: 0, m: 0 })
const today = computed(() => dateIso(new Date()))

const label = computed(() => {
    const p = parse(props.modelValue)
    if (!p) return '選擇日期'
    return `${p.y}/${pad(p.m + 1)}/${pad(p.d)}（週${WEEK[new Date(p.y, p.m, p.d).getDay()]}）`
})

// 每個月固定 6 週（42 格），月外的格子留白，切換月份時高度不會跳動
function buildMonth(y, m) {
    const start = new Date(y, m, 1 - new Date(y, m, 1).getDay())
    const days = Array.from({ length: 42 }, (_, i) => {
        const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
        return { iso: dateIso(dt), n: dt.getDate(), inMonth: dt.getMonth() === m }
    })
    return { y, m, days }
}
const months = computed(() => {
    const { y, m } = view.value
    const next = new Date(y, m + 1, 1)
    return [buildMonth(y, m), ...(wide.value ? [buildMonth(next.getFullYear(), next.getMonth())] : [])]
})

function shift(delta) {
    const dt = new Date(view.value.y, view.value.m + delta, 1)
    view.value = { y: dt.getFullYear(), m: dt.getMonth() }
}

function place() {
    const btn = root.value?.getBoundingClientRect()
    if (!btn) return
    wide.value = window.innerWidth >= 640
    const gap = 6, h = 360
    const w = (wide.value ? MONTH_W * 2 + 24 : MONTH_W) + 24 + 4        // 月份間距 24 + 內距 24 + 外框 4
    const up = window.innerHeight - btn.bottom - gap - 12 < h && btn.top - gap - 12 > window.innerHeight - btn.bottom
    const left = Math.min(Math.max(8, btn.left), Math.max(8, window.innerWidth - w - 8))
    pos.value = up
        ? { left: `${left}px`, bottom: `${window.innerHeight - btn.top + gap}px` }
        : { left: `${left}px`, top: `${btn.bottom + gap}px` }
}

function toggle() {
    open.value = !open.value
    if (!open.value) return
    const p = parse(props.modelValue) ?? parse(today.value)
    view.value = { y: p.y, m: p.m }
    place()
}
function pick(iso) {
    emit('update:modelValue', iso)
    open.value = false
}

const onDown = (e) => {
    if (root.value?.contains(e.target) || panel.value?.contains(e.target)) return
    open.value = false
}
const onMove = (e) => { if (!panel.value?.contains(e.target)) place() }
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
.sbdate { position: relative; }
.sbdate__btn { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding-left: 16px; padding-right: 16px; text-align: left; cursor: pointer; }
.sbdate__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbdate__icon { width: 20px; height: 20px; flex-shrink: 0; color: #d05f56; }

.sbdate__panel { position: fixed; z-index: 300; width: max-content; max-width: calc(100vw - 16px); padding: 12px; background: #fff; border: 2px solid #f5d0ca;
    border-radius: 14px; box-shadow: 0 8px 20px rgba(90, 58, 54, 0.15); color: #5a3a36; }
.sbdate__months { display: flex; gap: 24px; }
.sbdate__nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.sbdate__title { font-size: 16px; font-weight: 700; }
.sbdate__step { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; color: #d05f56; cursor: pointer; }
.sbdate__step:hover { background: #fff3ee; }

.sbdate__grid { display: grid; grid-template-columns: repeat(7, 36px); gap: 4px; }
.sbdate__week { margin-bottom: 4px; text-align: center; font-size: 14px; color: #a08682; }
.sbdate__day { width: 36px; height: 36px; display: grid; place-items: center; padding: 0; border: 2px solid transparent; border-radius: 10px; background: transparent;
    font-size: 14px; color: #5a3a36; cursor: pointer; }
.sbdate__day:hover:not(:disabled) { background: #fff3ee; }
.sbdate__day--blank { cursor: default; }
.sbdate__day--today { border-color: #f5d0ca; }
.sbdate__day--on, .sbdate__day--on:hover { background: #e5776e; border-color: #e5776e; color: #fff; font-weight: 700; }

.sbdate__foot { margin-top: 8px; padding-top: 8px; border-top: 2px dashed #f5d0ca; text-align: center; }
.sbdate__today { padding: 4px 16px; border: 0; border-radius: 999px; background: transparent; color: #d05f56; font-size: 14px; font-weight: 700; cursor: pointer; }
.sbdate__today:hover { background: #fff3ee; }
</style>
