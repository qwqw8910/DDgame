<template>
    <div class="cs-hint-bar cs-reveal-bar">
        <div class="cs-reveal-cta">
            <span style="font-size:26px">{{ correct ? '🎉' : '😅' }}</span>
            <span class="cs-reveal-cta__verdict"
                :class="correct ? 'cs-reveal-cta__verdict--win' : 'cs-reveal-cta__verdict--lose'">
                {{ correct ? `${guesserName} 答對了！` : '可惜！下次加油' }}
            </span>
            <button v-if="isHost" type="button" class="btn-primary cs-cta cs-send-btn" style="margin-left:auto"
                @click="emit('next')">
                下一位 →
            </button>
            <span v-else style="font-size:12px;color:var(--label);margin-left:auto">等待房主…</span>
        </div>
    </div>
</template>

<script setup>
defineProps({
    correct: { type: Boolean, default: false },
    guesserName: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
})
const emit = defineEmits(['next'])
</script>
