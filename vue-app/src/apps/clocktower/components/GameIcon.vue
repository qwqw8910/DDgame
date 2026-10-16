<template>
    <!-- UI / 陣營 / 提醒標記圖示（讀取 assets.js）；與 RoleToken 是唯二讀 assets 的元件 -->
    <span class="inline-flex items-center justify-center align-middle leading-none" :title="label || undefined"
        :style="{ width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.85)}px` }">
        <img v-if="src && !broken" :src="src" :alt="label" class="h-full w-full object-contain" draggable="false" @error="broken = true" />
        <span v-else aria-hidden="true">{{ entry?.icon ?? '' }}</span>
    </span>
</template>

<script setup>
import { ref, computed } from 'vue'
import { UI_ASSETS, TEAM_ASSETS, REMINDER_ASSETS, resolveImg } from '../data/assets.js'

const props = defineProps({
    kind: { type: String, default: 'ui' }, // ui | team | reminder
    id: { type: String, required: true },
    size: { type: Number, default: 18 },
})

const broken = ref(false)
const TABLE = { ui: [UI_ASSETS, 'ui'], team: [TEAM_ASSETS, 'teams'], reminder: [REMINDER_ASSETS, 'reminders'] }
const entry = computed(() => {
    const [table] = TABLE[props.kind] ?? TABLE.ui
    return table[props.id] ?? (props.kind === 'reminder' ? { icon: UI_ASSETS.tokenBack.icon } : null)
})
const src = computed(() => resolveImg((TABLE[props.kind] ?? TABLE.ui)[1], props.id, entry.value))
const label = computed(() => entry.value?.label ?? entry.value?.name ?? '')
</script>
