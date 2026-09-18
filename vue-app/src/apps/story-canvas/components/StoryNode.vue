<template>
  <div
    class="group relative w-20 h-20 flex items-center justify-center cursor-pointer select-none"
    :class="[`shape-${data.shape}`, { 'is-present': isPresent }]"
    :style="{ '--node-color': data.color || '#a78bfa' }"
  >
    <!-- 形狀 SVG 背景 -->
    <svg class="absolute inset-0 w-full h-full" viewBox="0 0 80 80" preserveAspectRatio="none">
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
    <div class="relative z-[1] text-xs font-bold text-center max-w-[68px] break-all leading-[1.3] [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]"
      :class="{ 'mt-4': data.shape === 'triangle' }"
      :style="{ color: data.color || '#a78bfa' }">
      {{ data.label || '…' }}
    </div>

    <!-- 有備注時顯示小點 -->
    <div v-if="data.note" title="有備注"
      class="absolute top-1 right-1 w-[7px] h-[7px] rounded-full z-[2]"
      :style="{ background: 'var(--node-color, #a78bfa)', boxShadow: '0 0 6px var(--node-color, #a78bfa)' }" />

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
