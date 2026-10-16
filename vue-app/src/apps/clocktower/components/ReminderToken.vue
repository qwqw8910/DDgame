<template>
    <!-- 提醒標記（只有說書人看得到；終局公開）。doubtful = 行動者中毒 / 醉酒，能力可能無效 -->
    <span :class="['inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none whitespace-nowrap',
        reminder.doubtful ? 'border-dashed border-body/60 bg-subtle text-body opacity-70' : 'border-lemon/50 bg-lemon/10 text-heading']"
        :title="reminder.doubtful ? `${label}（⚠ 行動者中毒 / 醉酒，能力可能無效）` : label">
        <GameIcon kind="reminder" :id="reminder.reminderId" :size="12" />
        <span>{{ label }}</span>
        <GameIcon v-if="reminder.doubtful" id="warn" :size="10" />
        <button v-if="removable" type="button" class="ml-0.5 text-body hover:text-ruby" :aria-label="`移除 ${label}`"
            @click.stop="$emit('remove', reminder.id)">✕</button>
    </span>
</template>

<script setup>
import { computed } from 'vue'
import GameIcon from './GameIcon.vue'
import { REMINDER_ASSETS } from '../data/assets.js'

const props = defineProps({
    reminder: { type: Object, required: true }, // { id, reminderId, doubtful, auto }
    removable: { type: Boolean, default: false },
})
defineEmits(['remove'])

// 標籤文字屬於資料而非圖示，可以讀 REMINDER_ASSETS 的 label
const label = computed(() => REMINDER_ASSETS[props.reminder.reminderId]?.label ?? props.reminder.reminderId.split(':')[1])
</script>
