<template>
    <div class="cs-spy-panel" role="region" aria-label="間諜面板">
        <p class="cs-spy-panel__title">🕵 你是本回合的間諜</p>
        <template v-if="spy.used">
            <p class="cs-spy-panel__text">
                已對 <strong>{{ targetName }}</strong> 發動：他第一輪提示中的一個字會被遮住。別被抓到！
            </p>
        </template>
        <template v-else-if="canUse">
            <p class="cs-spy-panel__text">
                指定一位提示者，系統會隨機遮住他提示中的一個字（本回合限用一次，不用就作廢）。
            </p>
            <div class="cs-spy-panel__targets">
                <button v-for="p in targets" :key="p.id" type="button" class="cs-spy-target"
                    :class="{ 'is-picked': picked === p.id }" @click="picked = p.id">
                    {{ p.nickname }}
                </button>
            </div>
            <button type="button" class="btn-primary cs-cta" :disabled="!picked" @click="confirm">發動</button>
        </template>
        <p v-else class="cs-spy-panel__text">技能時機已過。繼續混在大家之中，把大家帶偏吧。</p>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
    spy: { type: Object, required: true },        // { isSpy, used, targetId }
    canUse: { type: Boolean, default: false },    // 是否在第一輪提示階段
    players: { type: Array, required: true },
    myPlayerId: { type: String, default: '' },
})
const emit = defineEmits(['use'])

const picked = ref('')
const targets = computed(() =>
    props.players.filter(p => p.role && p.role !== 'guesser' && p.id !== props.myPlayerId))
const targetName = computed(() => props.players.find(p => p.id === props.spy.targetId)?.nickname ?? '')

function confirm() {
    if (!picked.value) return
    emit('use', picked.value)
}
</script>
