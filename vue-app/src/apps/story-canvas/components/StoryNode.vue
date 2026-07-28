<template>
  <div
    class="story-node"
    :class="[`shape-${data.shape}`, { 'is-present': isPresent }]"
    :style="{ '--node-color': data.color || '#a78bfa' }"
  >
    <!-- 形狀 SVG 背景 -->
    <svg class="node-shape-svg" viewBox="0 0 80 80" preserveAspectRatio="none">
      <!-- 方塊 -->
      <rect v-if="data.shape === 'rect'"
        x="2" y="2" width="76" height="76" rx="10"
        :fill="data.color + '22'"
        :stroke="data.color || '#a78bfa'"
        stroke-width="2.5"
      />
      <!-- 三角形 -->
      <polygon v-else-if="data.shape === 'triangle'"
        points="40,4 76,74 4,74"
        :fill="data.color + '22'"
        :stroke="data.color || '#a78bfa'"
        stroke-width="2.5"
      />
      <!-- 圓形 -->
      <circle v-else-if="data.shape === 'circle'"
        cx="40" cy="40" r="36"
        :fill="data.color + '22'"
        :stroke="data.color || '#a78bfa'"
        stroke-width="2.5"
      />
      <!-- 菱形 -->
      <polygon v-else-if="data.shape === 'diamond'"
        points="40,4 76,40 40,76 4,40"
        :fill="data.color + '22'"
        :stroke="data.color || '#a78bfa'"
        stroke-width="2.5"
      />
    </svg>

    <!-- 文字 -->
    <div class="node-label" :style="{ color: data.color || '#a78bfa' }">
      {{ data.label || '…' }}
    </div>

    <!-- 有備注時顯示小點 -->
    <div v-if="data.note" class="note-dot" title="有備注" />

    <!-- vue-flow 連接點 -->
    <Handle type="target" :position="Position.Top"    class="node-handle" />
    <Handle type="source" :position="Position.Bottom" class="node-handle" />
    <Handle type="target" :position="Position.Left"   class="node-handle" />
    <Handle type="source" :position="Position.Right"  class="node-handle" />
  </div>
</template>

<script setup>
import { Handle, Position } from '@vue-flow/core'

defineProps({
  data:      { type: Object, required: true },
  id:        { type: String, required: true },
  isPresent: { type: Boolean, default: false },
})
</script>

<style scoped>
.story-node {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  user-select: none;
}

.node-shape-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.node-label {
  position: relative;
  z-index: 1;
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  max-width: 68px;
  word-break: break-all;
  line-height: 1.3;
  text-shadow: 0 1px 4px rgba(0,0,0,0.8);
}

/* 三角形文字往下移一點 */
.shape-triangle .node-label { margin-top: 16px; }

.note-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--node-color, #a78bfa);
  box-shadow: 0 0 6px var(--node-color, #a78bfa);
  z-index: 2;
}

/* 展示模式：光暈效果 */
.is-present .story-node:hover .node-shape-svg { filter: drop-shadow(0 0 12px var(--node-color, #a78bfa)); }

/* 連接點 */
.node-handle {
  width: 8px !important;
  height: 8px !important;
  background: var(--node-color, #a78bfa) !important;
  border: 2px solid #0d0d1a !important;
  border-radius: 50% !important;
  opacity: 0;
  transition: opacity 0.2s;
}

.story-node:hover .node-handle { opacity: 1; }
</style>
