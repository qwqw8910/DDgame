<template>
    <!-- 手機與平板：就是原本的普通區塊，不加任何外殼 -->
    <details v-if="!desktop && fold" v-bind="$attrs" class="gt-fold" open>
        <summary class="gt-heading !mb-1">{{ title }}<GemHeaderIcon name="chevron" class="gt-fold-arrow text-(--gt-muted)" /></summary>
        <slot />
    </details>
    <section v-else-if="!desktop" v-bind="$attrs"><slot /></section>

    <!-- 電腦：帶標題列的停靠區塊，依狀態送到左欄、右欄或浮動層 -->
    <Teleport v-else-if="host && !it.hidden" :to="host">
        <section v-bind="$attrs" ref="root" class="gt-dock" :class="{ 'gt-dock--float': floating, 'gt-dock--collapsed': it.collapsed, 'gt-dock--drag': dragging }"
            :style="rootStyle" :data-dock-id="id">
            <header class="gt-dock-head" @pointerdown="onHeadDown" @dblclick="dock.toggleCollapsed(id)">
                <GemHeaderIcon name="grip" :size="14" class="shrink-0 text-(--gt-faint)" />
                <span class="min-w-0 flex-1 truncate text-sm font-bold text-(--gt-ink)">{{ title }}</span>
                <button class="gt-dock-btn" :aria-label="it.collapsed ? `展開${title}` : `收折${title}`" :aria-expanded="!it.collapsed" @pointerdown.stop @click="dock.toggleCollapsed(id)">
                    <GemHeaderIcon name="chevron" :size="14" :class="{ 'rotate-180': !it.collapsed }" />
                </button>
                <button v-if="floating" class="gt-dock-btn" :aria-label="`${title}放回欄位`" title="放回欄位" @pointerdown.stop @click="dock.dockBack(id)">⤓</button>
                <button v-else class="gt-dock-btn" :aria-label="`${title}彈出成浮動視窗`" title="彈出成浮動視窗" @pointerdown.stop @click="popOut">⧉</button>
                <button class="gt-dock-btn" :aria-label="`關閉${title}`" title="關閉（可從「面板」選單叫回）" @pointerdown.stop @click="close">✕</button>
            </header>
            <div v-show="!it.collapsed" ref="body" class="gt-dock-body" :style="bodyStyle"><slot /></div>
            <!-- 欄內：拖下緣調高度；浮動：拖右下角調大小 -->
            <div v-if="!it.collapsed" class="gt-dock-grip" :class="floating ? 'gt-dock-grip--corner' : 'gt-dock-grip--bar'" aria-hidden="true"
                @pointerdown="onGripDown" @dblclick="resetSize" />
        </section>
    </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import GemHeaderIcon from './GemHeaderIcon.vue'
import * as dock from '../composables/useGemDock.js'

defineOptions({ inheritAttrs: false })
const props = defineProps({
    id: { type: String, required: true },
    title: { type: String, required: true },
    externalClose: { type: Boolean, default: false }, // ✕ 不隱藏，改發出 close 讓外面處理
    fold: { type: Boolean, default: false }, // 手機與平板用可收合的 <details>（保留原本的行為）
})
const emit = defineEmits(['close'])

const desktop = dock.desktop
const it = computed(() => dock.get(props.id))
const floating = computed(() => it.value.where === 'float')
const host = computed(() => dock.targets[it.value.where])
const root = ref(null)
const body = ref(null)
const dragging = ref(false)

dock.register(props.id, props.title)
onBeforeUnmount(() => { dock.unregister(props.id); stopTrack?.() })
watch(() => props.title, t => dock.retitle(props.id, t))

const rootStyle = computed(() => {
    const v = it.value
    if (v.where === 'float' && v.float) {
        return { left: `${v.float.x}px`, top: `${v.float.y}px`, width: `${v.float.w}px`, height: v.collapsed ? 'auto' : `${v.float.h}px` }
    }
    return { order: dock.orderOf(props.id) }
})
const bodyStyle = computed(() => {
    const v = it.value
    if (v.where === 'float') return null
    return v.h ? { height: `${v.h}px` } : null
})

function close() {
    if (props.externalClose) emit('close')
    else dock.setHidden(props.id, true)
}
function popOut() {
    dock.popOut(props.id, root.value.getBoundingClientRect())
}
function resetSize() {
    if (floating.value) dock.patch(props.id, { float: { ...it.value.float, w: 320, h: 360 } })
    else dock.patch(props.id, { h: null })
}

// ── 拖曳（共用）：用 window 監聽，DOM 在欄之間移動時也不會掉游標 ──
let stopTrack = null
function track(e, onMove, onEnd) {
    const sx = e.clientX, sy = e.clientY
    const move = ev => onMove(ev.clientX, ev.clientY, ev.clientX - sx, ev.clientY - sy)
    const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        document.body.style.userSelect = ''
        stopTrack = null
        onEnd?.()
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    stopTrack = up
}

const inRect = (el, x, y) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

function onHeadDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    if (floating.value) {
        const f0 = { ...it.value.float }
        track(e, (x, y, dx, dy) => {
            dock.patch(props.id, { float: { ...f0, x: Math.min(Math.max(f0.x + dx, 0), window.innerWidth - 80), y: Math.min(Math.max(f0.y + dy, 0), window.innerHeight - 32) } })
        })
        return
    }
    dragging.value = true
    track(e, (x, y) => {
        const col = inRect(dock.targets.left, x, y) ? 'left' : inRect(dock.targets.right, x, y) ? 'right' : null
        if (!col) return
        const sibs = [...dock.targets[col].querySelectorAll(':scope > [data-dock-id]')].filter(el => el.dataset.dockId !== props.id)
        const next = sibs.find((el) => {
            const r = el.getBoundingClientRect()
            return y < r.top + r.height / 2
        })
        dock.moveTo(props.id, col, next ? next.dataset.dockId : null)
    }, () => { dragging.value = false })
}

function onGripDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    if (floating.value) {
        const f0 = { ...it.value.float }
        track(e, (x, y, dx, dy) => {
            dock.patch(props.id, { float: { ...f0, w: Math.min(Math.max(f0.w + dx, 220), window.innerWidth - f0.x), h: Math.min(Math.max(f0.h + dy, 100), window.innerHeight - f0.y) } })
        })
        return
    }
    const h0 = body.value.offsetHeight
    track(e, (x, y, dx, dy) => { dock.patch(props.id, { h: Math.round(Math.min(Math.max(h0 + dy, 60), 900)) }) })
}
</script>
