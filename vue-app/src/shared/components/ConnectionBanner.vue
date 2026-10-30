<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'

// 房內斷線提示：斷線超過 LOST_DELAY_MS 才顯示（瞬斷不閃），恢復後顯示「已恢復」RESTORED_MS
const props = defineProps({
  connected: { type: Boolean, default: false },
  active:    { type: Boolean, default: false }, // 人在房內才提示（首次連線、已離開時不顯示）
})

const LOST_DELAY_MS = 800
const RESTORED_MS   = 1800

const lost     = ref(false)
const restored = ref(false)
let _lostTimer = null
let _restoredTimer = null

const offline = computed(() => props.active && !props.connected)

watch(offline, (isOffline) => {
  clearTimeout(_lostTimer)
  if (isOffline) {
    restored.value = false
    _lostTimer = setTimeout(() => { lost.value = true }, LOST_DELAY_MS)
    return
  }
  if (lost.value && props.active) {
    restored.value = true
    clearTimeout(_restoredTimer)
    _restoredTimer = setTimeout(() => { restored.value = false }, RESTORED_MS)
  }
  lost.value = false
})

onUnmounted(() => {
  clearTimeout(_lostTimer)
  clearTimeout(_restoredTimer)
})
</script>

<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+4.25rem)] z-[9998] flex justify-center px-4"
      role="status" aria-live="polite">
      <Transition enter-from-class="-translate-y-3 opacity-0" leave-to-class="-translate-y-3 opacity-0"
        enter-active-class="transition duration-200" leave-active-class="transition duration-300">
        <div v-if="lost" key="lost"
          class="flex items-center gap-2 rounded-full border border-amber-400/60 bg-card-solid px-4 py-2 text-sm font-medium text-heading shadow-lg">
          <span class="size-2 shrink-0 animate-pulse rounded-full bg-amber-400" aria-hidden="true" />
          連線中斷，正在重新連線…
        </div>
        <div v-else-if="restored" key="restored"
          class="flex items-center gap-2 rounded-full border border-emerald-400/60 bg-card-solid px-4 py-2 text-sm font-medium text-heading shadow-lg">
          <span class="size-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
          已恢復連線
        </div>
      </Transition>
    </div>
  </Teleport>
</template>
