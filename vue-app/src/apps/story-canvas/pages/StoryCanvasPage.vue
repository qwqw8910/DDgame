<template>
  <div class="flex h-screen w-screen overflow-hidden relative bg-[#0d0d1a] font-sans">

    <!-- ===== 左側形狀面板（編輯模式才顯示） ===== -->
    <aside v-if="!isPresentMode" @dragstart.stop
      class="w-28 bg-[#13131f] border-r border-[#2a2a3e] flex flex-col items-center p-2 py-3 gap-1.5 overflow-y-auto z-10 shrink-0">
      <div class="text-[11px] text-[#6b6b8a] tracking-wide text-center w-full mt-1">📐 形狀</div>
      <div
        v-for="shape in shapeOptions"
        :key="shape.type"
        draggable="true"
        @dragstart="onShapeDragStart($event, shape)"
        :title="shape.label"
        class="flex flex-col items-center gap-1 cursor-grab p-1.5 rounded-lg border border-transparent transition-all duration-150 w-[76px] hover:bg-[#1e1e32] hover:border-[#a78bfa44]"
      >
        <svg :viewBox="shape.viewBox" class="w-9 h-9">
          <component :is="shape.svgTag" v-bind="shape.svgAttrs" class="fill-[#a78bfa44] stroke-[#a78bfa] stroke-2" />
        </svg>
        <span class="text-[10px] text-[#9090b0]">{{ shape.label }}</span>
      </div>

      <div class="w-3/5 h-px bg-[#2a2a3e] my-2" />
      <div class="flex items-center justify-between w-full px-0.5">
        <span class="text-[11px] text-[#6b6b8a] tracking-wide text-center mt-1">💾 存檔</span>
        <button @click="addSlot" title="新增存檔"
          class="bg-transparent border border-[#2a2a3e] text-[#a78bfa] text-sm leading-none w-5 h-5 rounded flex items-center justify-center transition-all duration-150 shrink-0 cursor-pointer hover:bg-[#a78bfa22] hover:border-[#a78bfa]">＋</button>
      </div>
      <div class="w-full flex flex-col gap-1">
        <div
          v-for="slot in slots"
          :key="slot.id"
          @click="switchSlot(slot.id)"
          class="group w-full rounded-lg border cursor-pointer transition-all duration-150 box-border py-1.5 px-1.5 pb-1"
          :class="slot.id === currentSlotId ? 'border-[#a78bfa] bg-[#a78bfa15]' : 'border-[#2a2a3e] bg-[#0d0d1a] hover:border-[#a78bfa44] hover:bg-[#1a1a2e]'"
        >
          <div v-if="renamingSlotId === slot.id" class="w-full" @click.stop>
            <input
              v-model="renamingName"
              @keydown.enter="confirmRename"
              @keydown.escape="renamingSlotId = null"
              @blur="confirmRename"
              ref="renameInputRef"
              class="w-full bg-[#0d0d1a] border border-[#a78bfa] rounded px-1 py-0.5 text-[#e2e8f0] text-[11px] outline-none box-border"
            />
          </div>
          <div v-else class="flex items-center justify-between gap-0.5" @dblclick.stop="startRename(slot)">
            <span class="text-[11px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis flex-1"
              :class="slot.id === currentSlotId ? 'text-[#a78bfa]' : 'text-[#c0c0d8]'">{{ slot.name }}</span>
            <button
              v-if="slots.length > 1"
              @click.stop="deleteSlot(slot.id)"
              title="刪除此存檔"
              class="bg-transparent border-0 text-[#4a4a6a] text-[13px] cursor-pointer px-0.5 leading-none shrink-0 opacity-0 transition-[opacity,color] duration-150 group-hover:opacity-100 hover:text-[#f87171]"
            >×</button>
          </div>
          <div class="text-[9px] text-[#4a4a6a] mt-0.5">{{ formatTime(slot.updatedAt) }}</div>
        </div>
      </div>
    </aside>

    <!-- ===== 主畫布 ===== -->
    <div class="relative" :class="isPresentMode ? 'flex-none w-screen' : 'flex-1'" ref="canvasArea" @dragover.prevent @drop="onDrop">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        :connect-on-click="false"
        :nodes-draggable="!isPresentMode"
        :nodes-connectable="!isPresentMode"
        :elements-selectable="!isPresentMode"
        :zoom-on-double-click="false"
        fit-view-on-init
        @connect="onConnect"
        @node-double-click="onNodeDoubleClick"
        @edge-double-click="onEdgeDoubleClick"
      >
        <Background pattern-color="#3a3a4a" :gap="24" :size="1.2" />
        <Controls v-if="!isPresentMode" />
        <MiniMap v-if="!isPresentMode" node-color="#a78bfa" />

        <!-- 自訂節點 -->
        <template #node-story="{ data, id }">
          <StoryNode :data="data" :id="id" :is-present="isPresentMode" />
        </template>
      </VueFlow>
    </div>

    <!-- ===== 右上角控制列 ===== -->
    <div class="fixed top-3 right-4 flex items-center gap-3 z-20">
      <span class="text-sm text-[#6b6b8a] tracking-wide">{{ canvasTitle }}</span>
      <button @click="toggleMode"
        class="py-1.5 px-4 rounded-full border border-[#a78bfa66] bg-[#13131f] text-[#a78bfa] text-[13px] cursor-pointer transition-all duration-200 hover:bg-[#a78bfa22] hover:border-[#a78bfa]">
        {{ isPresentMode ? '✏️ 編輯' : '🎬 展示' }}
      </button>
    </div>

    <!-- ===== 節點文字編輯 Modal ===== -->
    <DialogRoot :open="!!editingNode" @update:open="v => !v && closeNodeEdit()">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 bg-black/60 z-[100]" />
        <DialogContent
          class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-[#1a1a2e] border border-[#2a2a4e] rounded-2xl py-6 px-7 w-[340px] flex flex-col gap-3 outline-none">
          <DialogTitle class="text-base font-bold text-[#e2e8f0]">編輯節點</DialogTitle>
          <DialogDescription class="sr-only">編輯節點名稱、備注與顏色</DialogDescription>
          <template v-if="editingNode">
            <input
              v-model="editingNode.label"
              placeholder="節點名稱…"
              @keydown.enter="closeNodeEdit"
              ref="nodeInputRef"
              class="bg-[#0d0d1a] border border-[#2a2a4e] rounded-lg py-2 px-3 text-[#e2e8f0] text-sm outline-none focus:border-[#a78bfa]"
            />
            <textarea
              v-model="editingNode.note"
              placeholder="備注（展示模式點擊可查看）…"
              rows="3"
              class="bg-[#0d0d1a] border border-[#2a2a4e] rounded-lg py-2 px-3 text-[#c0c0d8] text-[13px] outline-none resize-y focus:border-[#a78bfa44]"
            />
            <div class="flex items-center gap-2 flex-wrap text-[13px] text-[#9090b0]">
              <span>顏色：</span>
              <button
                v-for="c in nodeColors"
                :key="c"
                :style="{ background: c }"
                @click="editingNode.color = c"
                class="w-5 h-5 rounded-full border-2 cursor-pointer transition-transform duration-150 hover:scale-[1.2] hover:border-white"
                :class="editingNode.color === c ? 'scale-[1.2] border-white' : 'border-transparent'"
              />
            </div>
            <div class="flex justify-end gap-2 mt-1">
              <button @click="deleteNode(editingNode.id)"
                class="py-[7px] px-5 rounded-lg border border-[#f87171] bg-transparent text-[#f87171] text-[13px] cursor-pointer transition-colors duration-150 hover:bg-[#f8717122]">刪除</button>
              <button @click="closeNodeEdit"
                class="py-[7px] px-5 rounded-lg border border-[#a78bfa] bg-transparent text-[#a78bfa] text-[13px] cursor-pointer transition-colors duration-150 hover:bg-[#a78bfa22]">完成</button>
            </div>
          </template>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <!-- ===== 線段標籤編輯 Modal ===== -->
    <DialogRoot :open="!!editingEdge" @update:open="v => !v && closeEdgeEdit()">
      <DialogPortal>
        <DialogOverlay class="fixed inset-0 bg-black/60 z-[100]" />
        <DialogContent
          class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-[#1a1a2e] border border-[#2a2a4e] rounded-2xl py-6 px-7 w-[340px] flex flex-col gap-3 outline-none">
          <DialogTitle class="text-base font-bold text-[#e2e8f0]">編輯關係線</DialogTitle>
          <DialogDescription class="sr-only">編輯關係線標籤、線型與顏色</DialogDescription>
          <template v-if="editingEdge">
            <input
              v-model="editingEdge.label"
              placeholder="關係標籤（如：愛人、敵人、不知道）…"
              @keydown.enter="closeEdgeEdit"
              ref="edgeInputRef"
              class="bg-[#0d0d1a] border border-[#2a2a4e] rounded-lg py-2 px-3 text-[#e2e8f0] text-sm outline-none focus:border-[#a78bfa]"
            />
            <div class="flex items-center gap-2 flex-wrap text-[13px] text-[#9090b0]">
              <span>線型：</span>
              <button
                v-for="t in edgeTypes"
                :key="t.value"
                @click="editingEdge.type = t.value"
                class="py-[3px] px-2.5 rounded-full border bg-transparent text-xs cursor-pointer"
                :class="editingEdge.type === t.value ? 'border-[#a78bfa] text-[#a78bfa] bg-[#a78bfa15]' : 'border-[#2a2a4e] text-[#9090b0]'"
              >{{ t.label }}</button>
            </div>
            <div class="flex items-center gap-2 flex-wrap text-[13px] text-[#9090b0]">
              <span>顏色：</span>
              <button
                v-for="c in edgeColors"
                :key="c"
                :style="{ background: c }"
                @click="editingEdge.color = c"
                class="w-5 h-5 rounded-full border-2 cursor-pointer transition-transform duration-150 hover:scale-[1.2] hover:border-white"
                :class="editingEdge.color === c ? 'scale-[1.2] border-white' : 'border-transparent'"
              />
            </div>
            <div class="flex justify-end gap-2 mt-1">
              <button @click="deleteEdge(editingEdge.id)"
                class="py-[7px] px-5 rounded-lg border border-[#f87171] bg-transparent text-[#f87171] text-[13px] cursor-pointer transition-colors duration-150 hover:bg-[#f8717122]">刪除</button>
              <button @click="closeEdgeEdit"
                class="py-[7px] px-5 rounded-lg border border-[#a78bfa] bg-transparent text-[#a78bfa] text-[13px] cursor-pointer transition-colors duration-150 hover:bg-[#a78bfa22]">完成</button>
            </div>
          </template>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <!-- ===== 展示模式：節點備注浮層 ===== -->
    <div v-if="presentNote" @click="presentNote = null"
      class="fixed inset-0 bg-black/70 flex items-center justify-center z-[200] cursor-pointer">
      <div class="bg-[#1a1a2e] border border-[#a78bfa66] rounded-2xl py-8 px-9 max-w-[420px] text-center">
        <div class="text-xl font-extrabold text-[#a78bfa] mb-3">{{ presentNote.label }}</div>
        <div class="text-base text-[#c0c0d8] leading-[1.7] whitespace-pre-wrap">{{ presentNote.note || '（無備注）' }}</div>
        <div class="mt-5 text-xs text-[#4a4a6a]">點擊任意處關閉</div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'reka-ui'
import StoryNode from '../components/StoryNode.vue'

import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

// ─── 狀態 ────────────────────────────────────────────────
const SLOTS_KEY = 'story-canvas-slots-v1'
const canvasTitle  = '故事關係圖'
const isPresentMode = ref(false)
const editingNode   = ref(null)
const editingEdge   = ref(null)
const presentNote   = ref(null)
const canvasArea    = ref(null)
const nodeInputRef  = ref(null)
const edgeInputRef  = ref(null)
const renameInputRef = ref(null)

const nodes = ref([])
const edges = ref([])

// ─── 存檔 Slot 狀態 ───────────────────────────────────────
const slots         = ref([])
const currentSlotId = ref(1)
const renamingSlotId = ref(null)
const renamingName   = ref('')

let nodeIdCounter = 1

// ─── Slot 工具函式 ────────────────────────────────────────
function makeSlotsStore() {
  return JSON.parse(localStorage.getItem(SLOTS_KEY) || 'null')
}

function persistSlots() {
  localStorage.setItem(SLOTS_KEY, JSON.stringify({
    slots: slots.value,
    currentSlotId: currentSlotId.value,
  }))
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth()+1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function saveCurrentSlot() {
  const slot = slots.value.find(s => s.id === currentSlotId.value)
  if (!slot) return
  slot.nodes     = JSON.parse(JSON.stringify(nodes.value))
  slot.edges     = JSON.parse(JSON.stringify(edges.value))
  slot.updatedAt = new Date().toISOString()
  persistSlots()
}

function switchSlot(id) {
  if (id === currentSlotId.value) return
  saveCurrentSlot()
  currentSlotId.value = id
  const slot = slots.value.find(s => s.id === id)
  if (!slot) return
  nodes.value = slot.nodes ? JSON.parse(JSON.stringify(slot.nodes)) : []
  edges.value = slot.edges ? JSON.parse(JSON.stringify(slot.edges)) : []
  const maxId = Math.max(0, ...nodes.value.map(n => parseInt(n.id?.replace('n','') || 0)))
  nodeIdCounter = maxId + 1
  persistSlots()
}

function addSlot() {
  saveCurrentSlot()
  const newId = Math.max(0, ...slots.value.map(s => s.id)) + 1
  const newSlot = {
    id: newId,
    name: `存檔 ${newId}`,
    nodes: [],
    edges: [],
    updatedAt: new Date().toISOString(),
  }
  slots.value.push(newSlot)
  currentSlotId.value = newId
  nodes.value = []
  edges.value = []
  nodeIdCounter = 1
  persistSlots()
}

function deleteSlot(id) {
  if (slots.value.length <= 1) return
  if (!confirm(`確定刪除「${slots.value.find(s=>s.id===id)?.name}」？`)) return
  slots.value = slots.value.filter(s => s.id !== id)
  if (currentSlotId.value === id) {
    const next = slots.value[0]
    currentSlotId.value = next.id
    nodes.value = next.nodes ? JSON.parse(JSON.stringify(next.nodes)) : []
    edges.value = next.edges ? JSON.parse(JSON.stringify(next.edges)) : []
  }
  persistSlots()
}

function startRename(slot) {
  renamingSlotId.value = slot.id
  renamingName.value   = slot.name
  nextTick(() => renameInputRef.value?.[0]?.focus())
}

function confirmRename() {
  if (!renamingSlotId.value) return
  const slot = slots.value.find(s => s.id === renamingSlotId.value)
  if (slot && renamingName.value.trim()) slot.name = renamingName.value.trim()
  renamingSlotId.value = null
  persistSlots()
}

// ─── 形狀選項 ─────────────────────────────────────────────
const shapeOptions = [
  {
    type: 'rect',
    label: '方塊',
    viewBox: '0 0 40 40',
    svgTag: 'rect',
    svgAttrs: { x: 4, y: 4, width: 32, height: 32, rx: 4 },
  },
  {
    type: 'triangle',
    label: '三角形',
    viewBox: '0 0 40 40',
    svgTag: 'polygon',
    svgAttrs: { points: '20,4 36,36 4,36' },
  },
  {
    type: 'circle',
    label: '圓形',
    viewBox: '0 0 40 40',
    svgTag: 'circle',
    svgAttrs: { cx: 20, cy: 20, r: 16 },
  },
  {
    type: 'diamond',
    label: '菱形',
    viewBox: '0 0 40 40',
    svgTag: 'polygon',
    svgAttrs: { points: '20,2 38,20 20,38 2,20' },
  },
]

const nodeColors = ['#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#fb7185', '#e2e8f0']
const edgeColors = ['#a78bfa', '#f472b6', '#34d399', '#60a5fa', '#fbbf24', '#94a3b8']
const edgeTypes  = [
  { value: 'default',  label: '直線' },
  { value: 'straight', label: '折線' },
  { value: 'step',     label: '階梯' },
  { value: 'smoothstep', label: '圓角' },
]

// ─── 從 localStorage 載入 ─────────────────────────────────
onMounted(() => {
  try {
    const stored = makeSlotsStore()
    if (stored?.slots?.length) {
      slots.value         = stored.slots
      currentSlotId.value = stored.currentSlotId ?? stored.slots[0].id
    } else {
      // 第一次使用：建立預設存檔 1（相容舊版單一存檔）
      const legacy = localStorage.getItem('story-canvas-v1')
      let initNodes = [], initEdges = []
      if (legacy) {
        try { ({ nodes: initNodes, edges: initEdges } = JSON.parse(legacy)) } catch {}
      }
      slots.value = [{ id: 1, name: '存檔 1', nodes: initNodes, edges: initEdges, updatedAt: new Date().toISOString() }]
      currentSlotId.value = 1
    }
    const cur = slots.value.find(s => s.id === currentSlotId.value)
    nodes.value = cur?.nodes ? JSON.parse(JSON.stringify(cur.nodes)) : []
    edges.value = cur?.edges ? JSON.parse(JSON.stringify(cur.edges)) : []
    const maxId = Math.max(0, ...nodes.value.map(n => parseInt(n.id?.replace('n','') || 0)))
    nodeIdCounter = maxId + 1
  } catch (e) {
    console.warn('載入存檔失敗', e)
  }
})

// ─── 自動存檔（500ms debounce） ───────────────────────────
let saveTimer = null
watch([nodes, edges], () => {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveCurrentSlot, 500)
}, { deep: true })

// ─── 拖拉新增節點 ─────────────────────────────────────────
let dragShapeType = null
function onShapeDragStart(e, shape) {
  dragShapeType = shape.type
  e.dataTransfer.effectAllowed = 'copy'
}

function onDrop(e) {
  if (!dragShapeType || isPresentMode.value) return
  const rect = canvasArea.value.getBoundingClientRect()
  // 需要把螢幕座標換算成 flow 座標
  const flowEl = canvasArea.value.querySelector('.vue-flow__renderer')
  const transform = getComputedTransform(flowEl)
  const x = (e.clientX - rect.left - transform.x) / transform.k
  const y = (e.clientY - rect.top  - transform.y) / transform.k

  nodes.value.push({
    id: `n${nodeIdCounter++}`,
    type: 'story',
    position: { x, y },
    data: {
      label: dragShapeType === 'rect' ? '角色' :
             dragShapeType === 'triangle' ? '事件' :
             dragShapeType === 'circle' ? '地點' : '物件',
      shape: dragShapeType,
      color: '#a78bfa',
      note: '',
    },
  })
  dragShapeType = null
}

function getComputedTransform(el) {
  if (!el) return { x: 0, y: 0, k: 1 }
  const style = window.getComputedStyle(el)
  const matrix = new DOMMatrix(style.transform)
  return { x: matrix.m41, y: matrix.m42, k: matrix.m11 }
}

// ─── 節點連線 ─────────────────────────────────────────────
function onConnect(params) {
  edges.value.push({
    id: `e${params.source}-${params.target}-${Date.now()}`,
    source: params.source,
    target: params.target,
    label: '',
    type: 'smoothstep',
    style: { stroke: '#a78bfa', strokeWidth: 2 },
    labelStyle: { fill: '#e2e8f0', fontWeight: 600 },
    labelBgStyle: { fill: '#1e1e2e', fillOpacity: 0.85 },
    markerEnd: { type: 'arrowclosed', color: '#a78bfa' },
    data: { color: '#a78bfa' },
  })
}

// ─── 雙擊節點 → 編輯 ─────────────────────────────────────
function onNodeDoubleClick({ node }) {
  if (isPresentMode.value) {
    // 展示模式：顯示備注
    presentNote.value = node.data
    return
  }
  editingNode.value = {
    id: node.id,
    label: node.data.label,
    note:  node.data.note,
    color: node.data.color,
  }
  nextTick(() => nodeInputRef.value?.focus())
}

function closeNodeEdit() {
  if (!editingNode.value) return
  const node = nodes.value.find(n => n.id === editingNode.value.id)
  if (node) {
    node.data = {
      ...node.data,
      label: editingNode.value.label,
      note:  editingNode.value.note,
      color: editingNode.value.color,
    }
  }
  editingNode.value = null
}

function deleteNode(id) {
  nodes.value = nodes.value.filter(n => n.id !== id)
  edges.value = edges.value.filter(e => e.source !== id && e.target !== id)
  editingNode.value = null
}

// ─── 雙擊線段 → 編輯 ─────────────────────────────────────
function onEdgeDoubleClick({ edge }) {
  if (isPresentMode.value) return
  editingEdge.value = {
    id:    edge.id,
    label: edge.label || '',
    type:  edge.type  || 'smoothstep',
    color: edge.data?.color || '#a78bfa',
  }
  nextTick(() => edgeInputRef.value?.focus())
}

function closeEdgeEdit() {
  if (!editingEdge.value) return
  const edge = edges.value.find(e => e.id === editingEdge.value.id)
  if (edge) {
    const c = editingEdge.value.color
    edge.label      = editingEdge.value.label
    edge.type       = editingEdge.value.type
    edge.style      = { stroke: c, strokeWidth: 2 }
    edge.markerEnd  = { type: 'arrowclosed', color: c }
    edge.data       = { color: c }
  }
  editingEdge.value = null
}

function deleteEdge(id) {
  edges.value = edges.value.filter(e => e.id !== id)
  editingEdge.value = null
}

// ─── 模式切換 ─────────────────────────────────────────────
function toggleMode() {
  isPresentMode.value = !isPresentMode.value
  presentNote.value   = null
}

// ─── 清空當前畫布 ─────────────────────────────────────────
function clearCanvas() {
  if (!confirm('確定清空此存檔的畫布？此操作不可復原。')) return
  nodes.value = []
  edges.value = []
}
</script>
