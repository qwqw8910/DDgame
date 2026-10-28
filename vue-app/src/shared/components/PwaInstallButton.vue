<script setup>
import { ref } from 'vue'
import { usePwaInstall } from '@/shared/composables/usePwaInstall.js'

defineProps({
  buttonClass: { type: String, default: '' },
  hintClass: { type: String, default: '' },
})

const { installEvent, canInstall, install } = usePwaInstall()
const showIosHint = ref(false)

// Chromium shows the native install dialog; iOS Safari has no install API, so show the manual steps.
function onClick() {
  if (installEvent.value) install()
  else showIosHint.value = !showIosHint.value
}
</script>

<template>
  <template v-if="canInstall">
    <button type="button" title="安裝成 App" aria-label="安裝成 App" :class="buttonClass" @click="onClick">⬇️</button>
    <p v-if="showIosHint" role="status" :class="hintClass">點 Safari 的「分享」→「加入主畫面」即可安裝</p>
  </template>
</template>
