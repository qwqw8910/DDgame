<template>
    <div class="cs-hint-bar cs-reveal-bar">
        <ul v-if="collisions.length" class="cs-collisions" aria-label="撞字">
            <li v-for="c in collisions" :key="c.char" class="cs-collisions__item">
                <span class="cs-tile cs-tile--xs cs-tile--symbol" :style="{ '--tok': tok(c.symbol) }">{{ c.symbol
                    }}</span>
                <span class="cs-collisions__char">{{ c.char }}</span>
                <span class="cs-collisions__names">{{ c.names.join('、') }} 撞字了</span>
            </li>
        </ul>
        <div class="cs-reveal-cta">
            <span style="font-size:26px">{{ skipped ? '⏭️' : correct ? '🎉' : '😅' }}</span>
            <span class="cs-reveal-cta__verdict"
                :class="correct ? 'cs-reveal-cta__verdict--win' : 'cs-reveal-cta__verdict--lose'">
                {{ skipped ? '猜題者離線，本題跳過' : correct ? `${guesserName} 答對了！` : '可惜！下次加油' }}
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
import { SYMBOL_COLORS } from '../data/playerLook.js'

defineProps({
    correct: { type: Boolean, default: false },
    guesserName: { type: String, default: '' },
    isHost: { type: Boolean, default: false },
    skipped: { type: Boolean, default: false },
    collisions: { type: Array, default: () => [] },   // [{ char, symbol, names }]
})
const tok = sym => SYMBOL_COLORS[sym] ?? '#F43F5E'
const emit = defineEmits(['next'])
</script>
