<template>
    <div ref="rootRef" class="relative">
        <button class="header-icon-btn" title="聲音設定" aria-label="聲音設定" :aria-expanded="open"
            :class="anyOn ? '' : 'opacity-50'" @click="open = !open">{{ anyOn ? '🔊' : '🔇' }}</button>
        <div v-if="open"
            class="absolute right-0 top-full z-50 mt-2 flex w-[240px] flex-col gap-3 rounded-[10px] border border-border-glow bg-card-solid p-3 shadow-[0_6px_22px_rgba(0,0,0,0.55)]">
            <div v-for="ch in channels" :key="ch.key" class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                    <span class="text-sm font-semibold text-heading">{{ ch.icon }} {{ ch.label }}</span>
                    <button class="rounded-md border border-border px-2 py-0.5 text-xs text-label"
                        :aria-pressed="ch.on.value" @click="ch.on.value = !ch.on.value">{{ ch.on.value ? '開' : '關' }}</button>
                </div>
                <input type="range" min="0" max="100" step="5" class="w-full accent-neon-purple-light"
                    :aria-label="`${ch.label}音量`" :disabled="!ch.on.value" :class="ch.on.value ? '' : 'opacity-40'"
                    :value="Math.round(ch.vol.value * 100)" @input="ch.vol.value = $event.target.value / 100" />
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useSound } from '../composables/useSound.js'

const { sfxOn, ambientOn, sfxVol, ambientVol } = useSound()
const open = ref(false)
const rootRef = ref(null)
const anyOn = computed(() => (sfxOn.value && sfxVol.value > 0) || (ambientOn.value && ambientVol.value > 0))

const channels = [
    { key: 'sfx', icon: '🔊', label: '音效', on: sfxOn, vol: sfxVol },
    { key: 'ambient', icon: '🌧️', label: '雨聲', on: ambientOn, vol: ambientVol },
]

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
