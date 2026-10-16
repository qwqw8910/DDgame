<template>
    <!-- 提名投票：時鐘指針逐位結算；即時顯示「目前將被處決」 -->
    <section class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" aria-label="提名與投票" aria-live="polite">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span class="text-label">存活 {{ view.aliveCount }} 人・處決門檻 <strong class="text-heading">{{ view.voteThreshold }}</strong> 票</span>
            <span :class="onTheBlock !== null ? 'text-ruby font-semibold' : 'text-body'">
                <GameIcon id="execute" :size="14" />
                {{ onTheBlock !== null ? `目前將被處決：${seatName(onTheBlock)}（${nom.highestVotes} 票）` : '目前沒有人會被處決' }}
            </span>
        </div>

        <div v-if="cur && cur.stage !== 'done'" class="flex flex-col gap-2 rounded-lg bg-subtle p-2">
            <p class="m-0 text-heading">
                <GameIcon id="nominate" :size="16" /> <strong>{{ seatName(cur.nominator) }}</strong> 提名 <strong>{{ seatName(cur.nominee) }}</strong>
            </p>
            <p v-if="cur.stage === 'speech'" class="m-0 text-sm text-body">提名者發言中 → 被提名者辯護中（在 Discord 發言），說書人按「開始投票」</p>

            <template v-if="voting">
                <div class="flex items-center justify-between text-sm">
                    <span class="text-label">指針：<strong class="text-heading">{{ pointerSeat !== null ? seatName(pointerSeat) : '結算中' }}</strong></span>
                    <span class="text-heading tabular-nums">目前 {{ voting.voters.length }} 票{{ voting.paused ? '・已暫停' : '' }}</span>
                </div>
                <div class="h-1.5 overflow-hidden rounded-full bg-card" aria-hidden="true">
                    <div class="h-full bg-neon-purple-light transition-all" :style="{ width: `${(voting.handIndex / voting.order.length) * 100}%` }"></div>
                </div>
                <!-- 玩家：舉手 / 放下 -->
                <div v-if="mySeat !== null" class="flex flex-col gap-1">
                    <p v-if="myLocked" class="m-0 text-sm text-body">指針已經過你，{{ voting.voters.includes(mySeat) ? '你投了一票' : '你沒有投票' }}。</p>
                    <p v-else-if="!myCanRaise" class="m-0 text-sm text-body">你的幽靈票已經用過了，不能再投票。</p>
                    <button v-else :class="[myHandUp ? 'btn-secondary' : 'btn-primary', 'btn-full']" @click="$emit('vote', !myHandUp)">
                        <GameIcon id="vote" :size="16" /> {{ myHandUp ? '放下手' : (mySeatObj.isDead ? '舉手（使用幽靈票）' : '舉手') }}
                    </button>
                    <p v-if="isButler" class="m-0 text-xs text-lemon">管家：你只能在主人舉手時舉手。</p>
                </div>
            </template>

            <!-- 說書人 -->
            <div v-if="isST" class="flex flex-wrap gap-1.5">
                <template v-if="cur.stage === 'speech'">
                    <select v-model.number="speed" class="game-input !w-auto py-1 text-sm" aria-label="指針速度">
                        <option v-for="s in HAND_SPEEDS" :key="s.ms" :value="s.ms">{{ s.label }}</option>
                    </select>
                    <button class="btn-primary !w-auto !px-3 !py-1.5 text-sm" @click="$emit('start-vote', speed)">開始投票</button>
                </template>
                <template v-if="voting">
                    <button class="btn-secondary !w-auto !px-3 !py-1.5 text-sm" @click="$emit('control', voting.paused ? 'resume' : 'pause')">{{ voting.paused ? '繼續' : '暫停' }}</button>
                    <select class="game-input !w-auto py-1 text-sm" :value="voting.handSpeedMs" aria-label="指針速度"
                        @change="$emit('control', 'speed', { handSpeedMs: Number($event.target.value) })">
                        <option v-for="s in HAND_SPEEDS" :key="s.ms" :value="s.ms">{{ s.label }}</option>
                    </select>
                </template>
                <button class="btn-ghost-sm" @click="$emit('control', 'cancel')">取消提名</button>
            </div>
        </div>
        <p v-else-if="view.daySubPhase === 'nomination'" class="m-0 text-sm text-body">
            {{ isST ? '等待玩家提名（點座位 → 提名）' : '點座位 → 提名。每人每天只能提名一次、被提名一次。' }}
        </p>

        <!-- 今日投票結果 -->
        <ul v-if="nom.results.length" class="m-0 list-none border-t border-divider p-0 pt-1.5 text-xs text-body">
            <li v-for="(r, i) in nom.results" :key="i">{{ seatName(r.nominator) }} → {{ seatName(r.nominee) }}：{{ r.votes }} 票{{ r.votes >= r.threshold ? '' : '（未達門檻）' }}</li>
        </ul>
    </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import GameIcon from './GameIcon.vue'
import { HAND_SPEEDS } from '../data/constants.js'

const props = defineProps({
    view: { type: Object, required: true },
})
defineEmits(['vote', 'start-vote', 'control'])

const speed = ref(1000)
const isST = computed(() => props.view.viewer.role === 'storyteller')
const nom = computed(() => props.view.nominations)
const cur = computed(() => nom.value.current)
const voting = computed(() => props.view.voting)
const onTheBlock = computed(() => nom.value.onTheBlock)
const seatName = i => `${i + 1}號 ${props.view.names[props.view.seats[i]?.playerId] ?? ''}`
const pointerSeat = computed(() => voting.value?.order[voting.value.handIndex] ?? null)
const mySeat = computed(() => props.view.me?.seat ?? null)
const mySeatObj = computed(() => (mySeat.value !== null ? props.view.seats[mySeat.value] : null))
const myLocked = computed(() => !!voting.value && mySeat.value !== null && voting.value.order.indexOf(mySeat.value) < voting.value.handIndex)
const myCanRaise = computed(() => !!mySeatObj.value && !mySeatObj.value.hasLeft && (!mySeatObj.value.isDead || !mySeatObj.value.ghostVoteUsed))
const myHandUp = computed(() => !!voting.value?.hands?.[mySeat.value])
const isButler = computed(() => props.view.me?.roleId === 'butler')
</script>
