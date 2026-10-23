<template>
    <div class="game-card cs-finish animate-slide-up">
        <div class="cs-finish__mascot">
            <CsMascot mood="trophy" />
        </div>
        <h2 class="neon-heading gradient-text" style="font-size:28px;margin-bottom:4px">一局結束！</h2>
        <div v-if="turnHistory.length" class="cs-finish__score">
            <strong>{{ correctCount }}</strong><span>/ {{ turnHistory.length }} 題答對</span>
        </div>
        <p v-else style="color:var(--body);font-size:15px;margin-bottom:24px">所有人都猜過一圈了</p>

        <!-- 本局回顧 -->
        <ul v-if="turnHistory.length" class="cs-recap">
            <li v-for="(t, i) in turnHistory" :key="t.id" :style="{ '--i': i }">
                <span class="cs-tile cs-avatar" style="--size:26px;font-size:13px"
                    :style="{ '--tok': playerColor(players, t.guesserId) }">{{ avatarChar(t.guesser) }}</span>
                <span class="cs-recap__name">{{ t.guesser }}</span>
                <span class="cs-recap__word">
                    <span v-for="(c, j) in [...t.word]" :key="j" class="cs-tile cs-tile--xs">{{ c }}</span>
                </span>
                <span class="cs-recap__result"
                    :class="t.correct ? (t.round === 1 ? 'cs-recap__result--r1' : 'cs-recap__result--r2') : 'cs-recap__result--miss'">
                    {{ t.correct ? (t.round === 1 ? '一輪命中' : '二輪命中') : '未猜中' }}
                </span>
            </li>
        </ul>

        <div v-if="isHost" style="display:flex;flex-direction:column;gap:10px">
            <!-- 主題選擇（換局前） -->
            <div style="display:flex;align-items:center;gap:10px;
                       padding:10px 14px;border-radius:10px;
                       background:var(--bg-subtle);border:1px solid var(--border)">
                <span style="font-size:13px;color:var(--label);white-space:nowrap">🎲 下一局主題</span>
                <select :value="theme" class="game-input"
                    style="flex:1;padding:6px 10px;font-size:13px;cursor:pointer"
                    @change="emit('set-theme', Number($event.target.value))">
                    <option :value="THEME_ALL">全部（所有主題混在一起）</option>
                    <option :value="THEME_RANDOM">隨機主題（每局不同）</option>
                    <option v-for="t in themeList" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
            </div>
            <button class="btn-primary cs-cta" @click="emit('continue')">
                繼續下一局 🔁
            </button>
            <button class="btn-secondary" @click="emit('end')">結束遊戲</button>
        </div>
        <p v-else style="color:var(--body);font-size:14px">等待房主決定…</p>
    </div>
</template>

<script setup>
import CsMascot from './CsMascot.vue'
import { THEME_ALL, THEME_RANDOM } from '../data/themes.js'
import { avatarChar, playerColor } from '../data/playerLook.js'

defineProps({
    turnHistory: { type: Array, default: () => [] },
    correctCount: { type: Number, default: 0 },
    players: { type: Array, required: true },
    isHost: { type: Boolean, default: false },
    theme: { type: Number, default: THEME_RANDOM },
    themeList: { type: Array, default: () => [] },
})
const emit = defineEmits(['set-theme', 'continue', 'end'])
</script>
