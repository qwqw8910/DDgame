<template>
  <div class="story-canvas-app" :class="{ 'present-mode': isPresentMode }">

    <!-- ===== 左側形狀面板（編輯模式才顯示） ===== -->
    <aside v-if="!isPresentMode" class="shape-panel" @dragstart.stop>
      <div class="panel-title">📐 形狀</div>
      <div
        v-for="shape in shapeOptions"
        :key="shape.type"
        class="shape-item"
        draggable="true"
        @dragstart="onShapeDragStart($event, shape)"
        :title="shape.label"
      >
        <svg :viewBox="shape.viewBox" class="shape-icon">
          <component :is="shape.svgTag" v-bind="shape.svgAttrs" class="shape-svg-el" />
        </svg>
        <span>{{ shape.label }}</span>
      </div>

      <div class="panel-divider" />
      <div class="panel-title-row">
        <span class="panel-title">💾 存檔</span>
        <button class="add-slot-btn" @click="addSlot" title="新增存檔">＋</button>
      </div>
      <div class="slot-list">
        <div
          v-for="slot in slots"
          :key="slot.id"
          class="slot-item"
          :class="{ active: slot.id === currentSlotId }"
          @click="switchSlot(slot.id)"
        >
          <div v-if="renamingSlotId === slot.id" class="slot-rename-row" @click.stop>
            <input
              v-model="renamingName"
              class="slot-rename-input"
              @keydown.enter="confirmRename"
              @keydown.escape="renamingSlotId = null"
              @blur="confirmRename"
              ref="renameInputRef"
            />
          </div>
          <div v-else class="slot-name-row" @dblclick.stop="startRename(slot)">
            <span class="slot-name">{{ slot.name }}</span>
            <button
              v-if="slots.length > 1"
              class="slot-delete-btn"
              @click.stop="deleteSlot(slot.id)"
              title="刪除此存檔"
            >×</button>
          </div>
          <div class="slot-time">{{ formatTime(slot.updatedAt) }}</div>
        </div>
      </div>
    </aside>

    <!-- ===== 主畫布 ===== -->
    <div class="canvas-area" ref="canvasArea" @dragover.prevent @drop="onDrop">
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
    <div class="top-bar">
      <span class="top-title">{{ canvasTitle }}</span>
      <button class="mode-btn" @click="toggleMode">
        {{ isPresentMode ? '✏️ 編輯' : '🎬 展示' }}
      </button>
    </div>

    <!-- ===== 節點文字編輯 Modal ===== -->
    <div v-if="editingNode" class="modal-overlay" @click.self="closeNodeEdit">
      <div class="modal-box">
        <div class="modal-title">編輯節點</div>
        <input
          v-model="editingNode.label"
          class="modal-input"
          placeholder="節點名稱…"
          @keydown.enter="closeNodeEdit"
          ref="nodeInputRef"
        />
        <textarea
          v-model="editingNode.note"
          class="modal-textarea"
          placeholder="備注（展示模式點擊可查看）…"
          rows="3"
        />
        <div class="modal-color-row">
          <span>顏色：</span>
          <button
            v-for="c in nodeColors"
            :key="c"
            class="color-dot"
            :style="{ background: c }"
            :class="{ active: editingNode.color === c }"
            @click="editingNode.color = c"
          />
        </div>
        <div class="modal-actions">
          <button class="modal-btn danger" @click="deleteNode(editingNode.id)">刪除</button>
          <button class="modal-btn primary" @click="closeNodeEdit">完成</button>
        </div>
      </div>
    </div>

    <!-- ===== 線段標籤編輯 Modal ===== -->
    <div v-if="editingEdge" class="modal-overlay" @click.self="closeEdgeEdit">
      <div class="modal-box">
        <div class="modal-title">編輯關係線</div>
        <input
          v-model="editingEdge.label"
          class="modal-input"
          placeholder="關係標籤（如：愛人、敵人、不知道）…"
          @keydown.enter="closeEdgeEdit"
          ref="edgeInputRef"
        />
        <div class="edge-type-row">
          <span>線型：</span>
          <button
            v-for="t in edgeTypes"
            :key="t.value"
            class="edge-type-btn"
            :class="{ active: editingEdge.type === t.value }"
            @click="editingEdge.type = t.value"
          >{{ t.label }}</button>
        </div>
        <div class="edge-type-row">
          <span>顏色：</span>
          <button
            v-for="c in edgeColors"
            :key="c"
            class="color-dot"
            :style="{ background: c }"
            :class="{ active: editingEdge.color === c }"
            @click="editingEdge.color = c"
          />
        </div>
        <div class="modal-actions">
          <button class="modal-btn danger" @click="deleteEdge(editingEdge.id)">刪除</button>
          <button class="modal-btn primary" @click="closeEdgeEdit">完成</button>
        </div>
      </div>
    </div>

    <!-- ===== 展示模式：節點備注浮層 ===== -->
    <div v-if="presentNote" class="present-note-overlay" @click="presentNote = null">
      <div class="present-note-box">
        <div class="present-note-name">{{ presentNote.label }}</div>
        <div class="present-note-text">{{ presentNote.note || '（無備注）' }}</div>
        <div class="present-note-hint">點擊任意處關閉</div>
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

<style scoped>
/* ─── 整體佈局 ─────────────────────────────── */
.story-canvas-app {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #0d0d1a;
  font-family: system-ui, sans-serif;
  overflow: hidden;
  position: relative;
}

/* ─── 左側面板 ─────────────────────────────── */
.shape-panel {
  width: 112px;
  background: #13131f;
  border-right: 1px solid #2a2a3e;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px;
  gap: 6px;
  overflow-y: auto;
  z-index: 10;
  flex-shrink: 0;
}

.panel-title {
  font-size: 11px;
  color: #6b6b8a;
  letter-spacing: 0.5px;
  text-align: center;
  width: 100%;
  margin-top: 4px;
}

.shape-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: grab;
  padding: 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  transition: all 0.15s;
  width: 76px;
}

.shape-item:hover {
  background: #1e1e32;
  border-color: #a78bfa44;
}

.shape-icon {
  width: 36px;
  height: 36px;
}

.shape-svg-el {
  fill: #a78bfa44;
  stroke: #a78bfa;
  stroke-width: 2;
}

.shape-item span {
  font-size: 10px;
  color: #9090b0;
}

.panel-divider {
  width: 60%;
  height: 1px;
  background: #2a2a3e;
  margin: 8px 0;
}

.panel-btn {
  width: 76px;
  padding: 6px 4px;
  border-radius: 6px;
  border: 1px solid #2a2a3e;
  background: #1e1e32;
  color: #c0c0d8;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.panel-btn:hover { border-color: #a78bfa; color: #a78bfa; }
.panel-btn.danger:hover { border-color: #f87171; color: #f87171; }

/* ─── 存檔渾項 ──────────────────────────────────────── */
.panel-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 2px;
}

.add-slot-btn {
  background: transparent;
  border: 1px solid #2a2a3e;
  color: #a78bfa;
  font-size: 14px;
  line-height: 1;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}

.add-slot-btn:hover { background: #a78bfa22; border-color: #a78bfa; }

.slot-list {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.slot-item {
  width: 100%;
  padding: 6px 6px 4px;
  border-radius: 8px;
  border: 1px solid #2a2a3e;
  background: #0d0d1a;
  cursor: pointer;
  transition: all 0.15s;
  box-sizing: border-box;
}

.slot-item:hover { border-color: #a78bfa44; background: #1a1a2e; }
.slot-item.active { border-color: #a78bfa; background: #a78bfa15; }

.slot-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
}

.slot-name {
  font-size: 11px;
  font-weight: 600;
  color: #c0c0d8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.slot-item.active .slot-name { color: #a78bfa; }

.slot-delete-btn {
  background: transparent;
  border: none;
  color: #4a4a6a;
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.slot-item:hover .slot-delete-btn { opacity: 1; }
.slot-delete-btn:hover { color: #f87171; }

.slot-time {
  font-size: 9px;
  color: #4a4a6a;
  margin-top: 2px;
}

.slot-rename-row { width: 100%; }

.slot-rename-input {
  width: 100%;
  background: #0d0d1a;
  border: 1px solid #a78bfa;
  border-radius: 4px;
  padding: 2px 4px;
  color: #e2e8f0;
  font-size: 11px;
  outline: none;
  box-sizing: border-box;
}

/* ─── 畫布區域 ─────────────────────────────── */
.canvas-area {
  flex: 1;
  position: relative;
}

/* ─── 頂部工具列 ───────────────────────────── */
.top-bar {
  position: fixed;
  top: 12px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 20;
}

.top-title {
  font-size: 14px;
  color: #6b6b8a;
  letter-spacing: 0.5px;
}

.mode-btn {
  padding: 6px 16px;
  border-radius: 20px;
  border: 1px solid #a78bfa66;
  background: #13131f;
  color: #a78bfa;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn:hover {
  background: #a78bfa22;
  border-color: #a78bfa;
}

/* ─── 展示模式 ─────────────────────────────── */
.present-mode .canvas-area { flex: none; width: 100vw; }

/* ─── Modal ────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-box {
  background: #1a1a2e;
  border: 1px solid #2a2a4e;
  border-radius: 14px;
  padding: 24px 28px;
  width: 340px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #e2e8f0;
}

.modal-input {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 8px;
  padding: 8px 12px;
  color: #e2e8f0;
  font-size: 14px;
  outline: none;
}

.modal-input:focus { border-color: #a78bfa; }

.modal-textarea {
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  border-radius: 8px;
  padding: 8px 12px;
  color: #c0c0d8;
  font-size: 13px;
  outline: none;
  resize: vertical;
}

.modal-textarea:focus { border-color: #a78bfa44; }

.modal-color-row,
.edge-type-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 13px;
  color: #9090b0;
}

.color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.15s;
}

.color-dot.active, .color-dot:hover { border-color: #fff; transform: scale(1.2); }

.edge-type-btn {
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid #2a2a4e;
  background: transparent;
  color: #9090b0;
  font-size: 12px;
  cursor: pointer;
}

.edge-type-btn.active {
  border-color: #a78bfa;
  color: #a78bfa;
  background: #a78bfa15;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.modal-btn {
  padding: 7px 20px;
  border-radius: 8px;
  border: 1px solid #2a2a4e;
  background: transparent;
  color: #c0c0d8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.modal-btn.primary { border-color: #a78bfa; color: #a78bfa; }
.modal-btn.primary:hover { background: #a78bfa22; }
.modal-btn.danger  { border-color: #f87171; color: #f87171; }
.modal-btn.danger:hover  { background: #f8717122; }

/* ─── 展示模式備注浮層 ─────────────────────── */
.present-note-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  cursor: pointer;
}

.present-note-box {
  background: #1a1a2e;
  border: 1px solid #a78bfa66;
  border-radius: 16px;
  padding: 32px 36px;
  max-width: 420px;
  text-align: center;
}

.present-note-name {
  font-size: 22px;
  font-weight: 800;
  color: #a78bfa;
  margin-bottom: 12px;
}

.present-note-text {
  font-size: 16px;
  color: #c0c0d8;
  line-height: 1.7;
  white-space: pre-wrap;
}

.present-note-hint {
  margin-top: 20px;
  font-size: 12px;
  color: #4a4a6a;
}
</style>
