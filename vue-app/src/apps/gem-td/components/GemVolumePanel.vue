<template>
    <div ref="rootRef" class="relative">
        <button class="header-icon-btn" title="音量設定" aria-label="音量設定" :aria-expanded="open"
            @click="toggleOpen">{{ audible ? '🔊' : '🔇' }}</button>
        <div v-if="open"
            class="absolute right-0 top-full z-50 mt-2 flex w-[220px] flex-col gap-2 rounded-[10px] border border-[#EAC8CF] bg-[#FFFFFF] p-3 text-[#4A2C2A] shadow-[0_6px_22px_rgba(74,44,42,0.25)]">
            <div class="flex items-center justify-between">
                <span class="text-sm font-semibold">🔊 音量 {{ percent }}%</span>
                <button class="gt-chip" :aria-pressed="!isSfxMuted" @click="toggleSfxMute">{{ isSfxMuted ? '關' : '開' }}</button>
            </div>
            <input type="range" min="0" max="100" step="5" class="w-full accent-[#D6305A]"
                aria-label="音量" :disabled="isSfxMuted" :class="isSfxMuted ? 'opacity-40' : ''" :value="percent"
                @input="sfxVolume = $event.target.value / 100" @change="previewSfx" />
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useGemTdSfx } from '../composables/useGemTdSfx.js'

const { isSfxMuted, sfxVolume, toggleSfxMute, unlockSfx, playSfx } = useGemTdSfx()
const open = ref(false)
const rootRef = ref(null)
const percent = computed(() => Math.round(sfxVolume.value * 100))
const audible = computed(() => !isSfxMuted.value && sfxVolume.value > 0)

function toggleOpen() {
    open.value = !open.value
    if (open.value) unlockSfx()
}
function previewSfx() { unlockSfx(); playSfx('click') }

function onOutside(e) {
    if (open.value && rootRef.value && !rootRef.value.contains(e.target)) open.value = false
}
function onKey(e) { if (e.key === 'Escape') open.value = false }
onMounted(() => {
    document.addEventListener('pointerdown', onOutside)
    document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onOutside)
    document.removeEventListener('keydown', onKey)
})
</script>
