<template>
    <div :class="['game-card', 'cs-player-card', isGuesser ? 'cs-player-card--guesser' : 'cs-player-card--clue',
        { 'cs-player-card--self': isSelf, 'hint-just-submitted': submitted && isHintPhase }]"
        style="position:relative;overflow:hidden">
        <!-- 浮動反應 emoji 覆層 -->
        <TransitionGroup name="cs-react" tag="div" class="cs-react-overlay" aria-hidden="true">
            <span v-for="r in (state.reactions[player.id] || [])" :key="r.id"
                :class="r.emoji === '🥚' ? 'cs-egg-wrapper' : 'cs-react-fly'" :style="{ '--x': r.x }">
                <template v-if="r.emoji === '🥚'">
                    <span class="cs-egg-raw">🥚</span>
                    <span class="cs-egg-fried">💩</span>
                </template>
                <template v-else>{{ r.emoji }}</template>
            </span>
        </TransitionGroup>

        <!-- 玩家資訊列 -->
        <div class="cs-card-head">
            <span class="cs-tile cs-avatar" :class="{ 'cs-avatar--offline': !isOnline }"
                :style="{ '--tok': playerColor(players, player.id) }" :title="isOnline ? undefined : '離線中'">{{
                avatarChar(player.nickname) }}</span>
            <span class="cs-card-head__name">{{ player.nickname }}</span>
            <span v-if="isSelf" class="cs-chip cs-chip--me">我</span>
            <span class="cs-chip" :class="isGuesser ? 'cs-chip--guesser' : 'cs-chip--clue'">
                {{ roleBadge }}
            </span>
            <!-- 互動按鈕（桌機：右上角；手機改到卡片底部，避免擠出卡片） -->
            <span v-if="!isSelf" class="cs-card-head__end cs-react-btns cs-react-btns--head">
                <button v-for="r in REACTIONS" :key="r.emoji" class="cs-react-btn" :title="r.title"
                    :aria-label="r.title" @click.stop="emit('react', player.id, r.emoji)">{{ r.emoji }}</button>
            </span>
        </div>

        <!-- 猜題者：兩輪答案 -->
        <div v-if="isGuesser" class="cs-guesser-hero">
            <p class="cs-guesser-hero__title">{{ isSelf ? '你是猜題者' : '猜題者' }}</p>
            <div class="cs-guess-rows">
                <!-- R1 -->
                <div class="cs-guess-row">
                    <span class="cs-guess-label">第一輪</span>
                    <template v-if="state.round1GuessResult">
                        <span class="cs-guess-answer">{{ state.round1GuessResult.answer || '（空白）' }}</span>
                        <span class="cs-guess-ab cs-guess-ab--a">{{ state.round1GuessResult.a }}A</span>
                        <span class="cs-guess-ab cs-guess-ab--b">{{ state.round1GuessResult.b }}B</span>
                    </template>
                    <span v-else-if="state.status === 'round1-result'" class="cs-guess-pending">{{ isSelf ?
                        '作答中…' : '等待作答' }}</span>
                    <span v-else class="cs-guess-empty">—</span>
                </div>
                <!-- R2 (進入 round2 後才顯示) -->
                <div v-if="['round2', 'round2-result', 'revealing'].includes(state.status)" class="cs-guess-row">
                    <span class="cs-guess-label">第二輪</span>
                    <template v-if="state.status === 'revealing' && state.guessResult">
                        <span class="cs-guess-answer"
                            :style="{ color: state.guessResult.correct ? 'var(--success-text)' : 'var(--heading)' }">
                            {{ state.guessResult.correct ? '🎉 ' : '' }}{{ state.guessResult.answer || '（空白）' }}
                        </span>
                        <template v-if="state.guessAB">
                            <span class="cs-guess-ab cs-guess-ab--a">{{ state.guessAB.a }}A</span>
                            <span class="cs-guess-ab cs-guess-ab--b">{{ state.guessAB.b }}B</span>
                        </template>
                    </template>
                    <span v-else-if="state.status === 'round2-result'" class="cs-guess-pending">{{ isSelf ?
                        '作答中…' : '等待作答' }}</span>
                    <span v-else class="cs-guess-empty">—</span>
                </div>
            </div>
            <p v-if="isHintPhase" class="cs-hint-placeholder">
                等待隊友出牌 <span class="cs-seat__dots"><i></i><i></i><i></i></span>
            </p>
        </div>

        <!-- 提示者：兩輪字牌 -->
        <template v-else>
            <div v-for="r in hintRounds" :key="r.round" class="cs-hint-block">
                <p class="cs-round-label">第{{ r.round === 1 ? '一' : '二' }}輪</p>
                <TransitionGroup v-if="r.get(player.id).length" appear name="hint-char" tag="div"
                    class="hint-chars-wrap">
                    <span v-for="(c, i) in r.get(player.id)" :key="i"
                        :class="[hintTileClass(c), { 'cs-flipcard': canFlip(c), 'is-flipped': isFlipped(r.round, i) }]"
                        :style="{ '--i': i, '--tok': c.tok }" :data-symbol="c.symbol"
                        :title="c.isSpyMask ? '🕵 間諜干擾：這個字被遮住了' : canFlip(c) && !isFlipped(r.round, i) ? '點擊翻開被擋住的字' : symKey(c) ? '點擊高亮所有相同符號' : undefined"
                        @click="onTileClick(c, r.round, i)">
                        <template v-if="canFlip(c)">
                            <span class="cs-flipcard__back">{{ c.char }}</span>
                            <span class="cs-flipcard__front">{{ c.real }}</span>
                        </template>
                        <template v-else>{{ c.char }}</template>
                    </span>
                </TransitionGroup>
                <div v-else class="cs-hint-placeholder">
                    <template v-if="state.status === r.hintStatus">
                        <template v-if="submitted">
                            <span class="cs-tile cs-tile--sm cs-tile--back cs-tile--pop">✓</span>
                            <span class="cs-chip cs-chip--done">已出牌</span>
                        </template>
                        <template v-else>
                            <span class="cs-seat__dots"><i></i><i></i><i></i></span> 思考中
                        </template>
                    </template>
                    <template v-else>—</template>
                </div>
            </div>
        </template>

        <span v-if="!isSelf" class="cs-react-btns cs-react-btns--foot">
            <button v-for="r in REACTIONS" :key="r.emoji" class="cs-react-btn" :title="r.title"
                :aria-label="r.title" @click.stop="emit('react', player.id, r.emoji)">{{ r.emoji }}</button>
        </span>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { avatarChar, playerColor } from '../data/playerLook.js'

const props = defineProps({
    player: { type: Object, required: true },
    players: { type: Array, required: true },
    state: { type: Object, required: true },
    myPlayerId: { type: String, default: '' },
    isGuesser: { type: Boolean, default: false },
    isHintPhase: { type: Boolean, default: false },
    hintRounds: { type: Array, default: () => [] },
    flipped: { type: Array, default: () => [] },
    highlight: { type: String, default: '' },   // 目前高亮的符號
})
const emit = defineEmits(['react', 'flip', 'pick-symbol'])

const REACTIONS = [
    { emoji: '🔥', title: '這很屬火' },
    { emoji: '🥚', title: '丟蛋' },
    { emoji: '💯', title: '100 分' },
]

const isSelf = computed(() => props.player.id === props.myPlayerId)
const isOnline = computed(() => props.player.is_online ?? props.player.connected ?? true)
const submitted = computed(() => props.state.submittedPlayerIds.includes(props.player.id))
const roleBadge = computed(() => {
    if (props.isGuesser) return '猜題者'
    return props.player.quota ? `${props.player.quota} 字` : '提示者'
})

// 猜題者揭曉時：點擊被符號擋住的提示字牌，翻開原字
const canFlip = c => props.state.isGuesser && props.state.status === 'revealing' && !!c.isSymbol && !!c.real
const isFlipped = (round, i) => props.flipped.includes(`${props.player.id}:${round}:${i}`)

// 這張字牌代表哪個符號（猜題者看到符號牌；提示者看到撞字牌的角標）
const symKey = c => (c.isSymbol ? c.char : c.symbol) || ''

function onTileClick(c, round, i) {
    if (canFlip(c)) return emit('flip', props.player.id, round, i)
    const key = symKey(c)
    if (key) emit('pick-symbol', key)
}

function hintTileClass(c) {
    const key = symKey(c)
    return ['cs-tile', 'cs-tile--md', {
        'cs-tile--symbol': c.isSymbol, 'cs-tile--conflict': c.isConflict, 'cs-tile--spy': c.isSpyMask,
        'cs-tile--pickable': !!key,
        'cs-tile--hl': !!props.highlight && key === props.highlight,
        'cs-tile--dim': !!props.highlight && key !== props.highlight,
    }]
}
</script>
