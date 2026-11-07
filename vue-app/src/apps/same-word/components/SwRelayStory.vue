<template>
    <div class="flex flex-col gap-4">
        <!-- 整段話：一段一段跑出來 -->
        <section :class="tile" aria-labelledby="story-theme">
            <p class="m-0 text-base font-medium text-brand-ink">這段話誕生了</p>
            <h2 id="story-theme" class="mt-1 mb-0 font-display text-xl leading-snug font-normal text-ink-muted">{{ relay.theme }}</h2>
            <p class="m-0 mt-4 font-display text-[clamp(28px,5vw,40px)] leading-normal break-all text-ink" aria-live="polite">
                <span v-for="(s, i) in shownSegments" :key="i"
                    class="inline-block animate-[sw-pop_320ms_cubic-bezier(.2,.8,.2,1)] motion-reduce:animate-none">{{ s.text }}</span>
                <span v-if="!done" class="ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.1em] animate-pulse bg-brand motion-reduce:animate-none" aria-hidden="true"></span>
            </p>
            <p v-if="!relay.story" class="m-0 mt-2 text-lg text-ink-muted">大家都卡住了，什麼都沒接出來…</p>
            <button v-if="!done" type="button" :class="[secondaryBtn, 'mt-5']" @click="skip">直接看全部</button>
        </section>

        <!-- 每段投票 -->
        <section v-if="done && votable" :class="tile" aria-labelledby="vote-title">
            <div class="flex items-baseline justify-between gap-3">
                <h3 id="vote-title" class="m-0 font-display text-xl font-normal text-ink">給每一段評分</h3>
                <p class="m-0 text-base tabular-nums text-ink-faint">{{ relay.voters }} 人投過票</p>
            </div>
            <p class="m-0 mt-1 text-base leading-relaxed text-ink-muted">
                {{ canVote ? '神接手按讚，接爛了給大便。票數最後才公開。' : '你正在觀戰，看大家投票。' }}
            </p>
            <ol class="m-0 mt-4 flex list-none flex-col gap-2 p-0">
                <li v-for="(s, i) in relay.segments" :key="i"
                    class="flex min-h-14 items-center gap-3 rounded-inset bg-fill px-4 py-2 max-sm:gap-2 max-sm:pr-2">
                    <span class="w-6 shrink-0 text-base tabular-nums text-ink-faint">{{ i + 1 }}</span>
                    <span class="min-w-0 flex-1">
                        <span class="block font-display text-xl leading-snug" :class="s.timeout ? 'text-ink-faint' : 'text-ink'">{{ s.timeout ? '（卡住了）' : s.text }}</span>
                        <span class="block truncate text-base text-ink-faint">{{ s.by === myId ? '你' : (names[s.by] ?? '?') }}</span>
                    </span>
                    <div v-if="canVote && !s.timeout && s.by !== myId" class="flex shrink-0 gap-2">
                        <button v-for="v in VOTE_CHOICES" :key="v.id" type="button" :aria-pressed="relay.myVotes[i] === v.id"
                            :aria-label="`第 ${i + 1} 段「${s.text}」${v.label}`"
                            class="inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border-0 px-4 text-base max-sm:px-0 transition-[background-color,color,scale] duration-150 ease-soft active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
                            :class="relay.myVotes[i] === v.id ? 'bg-brand text-on-brand' : 'bg-raised text-ink shadow-(--shadow-tile) hover:bg-canvas'"
                            @click="emit('vote', i, relay.myVotes[i] === v.id ? null : v.id)">
                            <SwVoteIcon :name="v.id" /><span class="max-sm:hidden">{{ v.label }}</span>
                        </button>
                    </div>
                    <span v-else-if="s.by === myId" class="shrink-0 text-base text-ink-faint">你寫的</span>
                </li>
            </ol>
        </section>

        <div v-if="done" class="flex flex-wrap items-center justify-center gap-3">
            <button v-if="isHost" type="button" :class="primaryBtn" @click="emit('end')">
                公布結果<span class="tabular-nums opacity-80">（{{ voteSeconds }}）</span>
            </button>
            <p v-else class="m-0 text-base text-ink-muted"><span class="tabular-nums">{{ voteSeconds }}</span> 秒後公布結果</p>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import SwVoteIcon from './SwVoteIcon.vue'
import { primaryBtn, secondaryBtn, tile } from '../data/ui.js'

const props = defineProps({
    relay: { type: Object, required: true },
    names: { type: Object, required: true },
    myId: { type: String, default: '' },
    canVote: { type: Boolean, default: false },
    isHost: { type: Boolean, default: false },
    now: { type: Number, required: true },
})
const emit = defineEmits(['vote', 'end'])

const VOTE_CHOICES = [{ id: 'up', label: '讚' }, { id: 'poop', label: '大便' }]

const written = computed(() => props.relay.segments.filter(s => !s.timeout))
const votable = computed(() => written.value.length > 0)
const voteSeconds = computed(() => Math.max(0, Math.ceil(((props.relay.voteEndsAt ?? 0) - props.now) / 1000)))

// 逐段揭曉（遊戲本身的玩法動畫）；減少動態時直接全部顯示
const shown = ref(0)
const shownSegments = computed(() => written.value.slice(0, shown.value))
const done = computed(() => shown.value >= written.value.length)
let _timer = null
function skip() { clearInterval(_timer); shown.value = written.value.length }
onMounted(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return skip()
    _timer = setInterval(() => {
        shown.value += 1
        if (done.value) clearInterval(_timer)
    }, 550)
})
onUnmounted(() => clearInterval(_timer))
</script>

<style>
@keyframes sw-pop {
    from { opacity: 0; transform: translateY(0.25em); }
    to { opacity: 1; transform: none; }
}
</style>
