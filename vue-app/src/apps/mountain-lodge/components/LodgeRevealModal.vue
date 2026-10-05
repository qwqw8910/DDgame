<template>
    <!-- 能力公開彈窗：左＝卡片翻開動畫、右＝發生了什麼事。所有玩家同時看到，自動關閉。 -->
    <Transition name="toast">
        <div v-if="event" class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
            role="dialog" aria-modal="true" :aria-label="event.title" @click.self="$emit('close')">
            <div class="animate-pop-in game-card w-full max-w-lg flex flex-col gap-3">
                <div class="flex items-center gap-4">
                    <div :class="faceUp ? 'animate-ability-glow rounded-xl' : ''">
                        <LodgeCard :card="{ id: 'reveal', kind: event.kind }" :revealed="faceUp" />
                    </div>
                    <div class="flex flex-col gap-1.5 min-w-0">
                        <span :class="['text-xl font-bold', event.tone]">{{ event.title }}</span>
                        <p class="m-0 text-heading leading-relaxed">{{ event.text }}</p>
                    </div>
                </div>
                <div class="h-1 rounded-full bg-subtle overflow-hidden" aria-hidden="true">
                    <div class="h-full bg-neon-purple-light origin-left" :style="barStyle"></div>
                </div>
                <button class="btn-secondary btn-full" @click="$emit('close')">知道了</button>
            </div>
        </div>
    </Transition>
</template>

<script setup>
import { ref, watch, computed, onUnmounted } from 'vue'
import LodgeCard from './LodgeCard.vue'
import { REVEAL_POPUP_SECONDS } from '../data/constants.js'

const props = defineProps({
    event: { type: Object, default: null }, // { kind, title, text, tone }
})
const emit = defineEmits(['close'])

const faceUp = ref(false)
let _flip = null
let _close = null
watch(() => props.event, (ev) => {
    clearTimeout(_flip); clearTimeout(_close)
    faceUp.value = false
    if (!ev) return
    _flip = setTimeout(() => { faceUp.value = true }, 450)
    _close = setTimeout(() => emit('close'), REVEAL_POPUP_SECONDS * 1000 + 450)
}, { immediate: true })
onUnmounted(() => { clearTimeout(_flip); clearTimeout(_close) })

const barStyle = computed(() => faceUp.value
    ? { transform: 'scaleX(0)', transition: `transform ${REVEAL_POPUP_SECONDS}s linear` }
    : { transform: 'scaleX(1)' })
</script>
