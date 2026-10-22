<template>
    <div ref="rootRef" class="relative">
        <button :class="buttonClass" title="音量設定" aria-label="音量設定" :aria-expanded="open"
            @click="toggleOpen">{{ audible ? '🔊' : '🔇' }}</button>
        <div v-if="open"
            class="absolute right-0 top-full z-50 mt-2 flex w-[220px] flex-col gap-2 rounded-[10px] border border-border-glow bg-card-solid p-3 shadow-[0_6px_22px_rgba(0,0,0,0.55)]">
            <div class="flex items-center justify-between">
                <span class="text-sm font-semibold text-heading">🔊 音量 {{ percent }}%</span>
                <button class="rounded-md border border-border px-2 py-0.5 text-xs text-label"
                    :aria-pressed="!isSfxMuted" @click="toggleSfxMute">{{ isSfxMuted ? '關' : '開' }}</button>
            </div>
            <input type="range" min="0" max="100" step="5" class="w-full accent-neon-purple-light"
                aria-label="音量" :disabled="isSfxMuted" :class="isSfxMuted ? 'opacity-40' : ''" :value="percent"
                @input="sfxVolume = $event.target.value / 100" @change="previewSfx" />
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useCharacterStormSfx } from '../composables/useCharacterStormSfx.js'

defineProps({ buttonClass: { type: String, default: 'header-icon-btn' } })

const { isSfxMuted, sfxVolume, toggleSfxMute, unlockSfx, playSfx } = useCharacterStormSfx()
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
