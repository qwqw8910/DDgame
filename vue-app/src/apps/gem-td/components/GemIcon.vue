<template>
    <img :src="towerImage(kind)" :alt="label" :width="size" :height="size" class="shrink-0 object-contain" draggable="false"
        :style="{ transform: `scale(${scale})` }" />
</template>

<script setup>
import { computed } from 'vue'
import { gemScale, isSpecial, towerImage } from '../data/gems.js'

const props = defineProps({
    kind: { type: String, required: true },
    level: { type: Number, default: 6 },
    size: { type: Number, default: 32 },
    label: { type: String, default: '' },
})

const scale = computed(() => (isSpecial(props.kind) ? 1 : gemScale(props.level) + 0.1))
</script>
