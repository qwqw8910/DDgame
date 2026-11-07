<template>
    <div class="flex flex-col gap-4">
        <!-- 整段話（主角） -->
        <section :class="tile" aria-labelledby="relay-result-theme">
            <p class="m-0 text-base font-medium text-brand-ink">{{ result.endReason === 'host' ? '房主提前結束' : '完成！' }}</p>
            <h2 id="relay-result-theme" class="mt-1 mb-0 font-display text-xl leading-snug font-normal text-ink-muted">{{ result.theme }}</h2>
            <p v-if="result.story" class="m-0 mt-4 font-display text-[clamp(28px,5vw,40px)] leading-normal break-all text-ink">{{ result.story }}</p>
            <p v-else class="m-0 mt-4 text-lg text-ink-muted">這次什麼都沒接出來，再來一局吧。</p>
            <button v-if="result.story" type="button" :class="[secondaryBtn, 'mt-5']" @click="copy">
                <SwVoteIcon name="copy" />{{ copied ? '已複製' : '複製整段話' }}
            </button>
        </section>

        <!-- 頒獎：固定結構（圖示＋獎名 → 得主 → 一行說明） -->
        <ul v-if="awards.length" class="m-0 grid list-none grid-cols-2 gap-4 p-0 max-sm:grid-cols-1" aria-label="頒獎">
            <li v-for="a in awards" :key="a.id" class="flex flex-col rounded-tile bg-raised p-5 shadow-(--shadow-tile)">
                <div class="flex items-center gap-3">
                    <span aria-hidden="true" class="grid size-11 shrink-0 place-items-center rounded-inset bg-fill text-ink">
                        <SwVoteIcon :name="a.icon" />
                    </span>
                    <h3 class="m-0 font-display text-xl font-normal text-ink">{{ a.title }}</h3>
                </div>
                <p class="m-0 mt-3 text-lg text-ink">{{ who(a.playerIds) }}</p>
                <p class="m-0 mt-1 text-base text-ink-muted">{{ a.desc }}</p>
            </li>
        </ul>

        <!-- 每段明細 -->
        <section :class="tile" aria-labelledby="relay-detail">
            <h3 id="relay-detail" class="m-0 font-display text-xl font-normal text-ink">每一段</h3>
            <ol class="m-0 mt-4 flex list-none flex-col gap-2 p-0">
                <li v-for="(s, i) in result.segments" :key="i"
                    class="flex min-h-14 items-center gap-3 rounded-inset px-4 py-2"
                    :class="result.bestSegments.includes(i) ? 'bg-brand-soft' : 'bg-fill'">
                    <span class="w-6 shrink-0 text-base tabular-nums text-ink-faint">{{ i + 1 }}</span>
                    <span class="min-w-0 flex-1">
                        <span class="block font-display text-xl leading-snug" :class="s.timeout ? 'text-ink-faint' : 'text-ink'">{{ s.timeout ? '（卡住了）' : s.text }}</span>
                        <span class="block truncate text-base text-ink-faint">
                            {{ names[s.by] ?? '?' }}<template v-if="!s.timeout"> · {{ (s.ms / 1000).toFixed(1) }} 秒</template>
                            <template v-if="result.bestSegments.includes(i)"> · 最佳一接</template>
                        </span>
                    </span>
                    <span v-if="!s.timeout" class="flex shrink-0 items-center gap-3 text-base tabular-nums text-ink-muted">
                        <span class="inline-flex items-center gap-1"><SwVoteIcon name="up" /><span class="sr-only">讚</span>{{ s.up }}</span>
                        <span class="inline-flex items-center gap-1"><SwVoteIcon name="poop" /><span class="sr-only">大便</span>{{ s.poop }}</span>
                    </span>
                </li>
            </ol>
        </section>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import SwVoteIcon from './SwVoteIcon.vue'
import { secondaryBtn, tile } from '../data/ui.js'

const props = defineProps({
    result: { type: Object, required: true },
    names: { type: Object, required: true },
})

const who = ids => ids.map(id => props.names[id] ?? '?').join('、')

const awards = computed(() => {
    const r = props.result
    const out = []
    if (r.best) out.push({ id: 'best', icon: 'up', title: '神接手', playerIds: r.best.playerIds, desc: `總共拿到 ${r.best.count} 個讚` })
    if (r.poop) out.push({ id: 'poop', icon: 'poop', title: '大便製造機', playerIds: r.poop.playerIds, desc: `總共收到 ${r.poop.count} 坨大便` })
    if (r.fastest) out.push({ id: 'fast', icon: 'bolt', title: '閃電手', playerIds: r.fastest.playerIds, desc: `平均 ${(r.fastest.ms / 1000).toFixed(1)} 秒就接上` })
    if (r.stuck) out.push({ id: 'stuck', icon: 'stuck', title: '卡關王', playerIds: r.stuck.playerIds, desc: `卡住 ${r.stuck.count} 次` })
    return out
})

const copied = ref(false)
async function copy() {
    const text = `【${props.result.theme}】${props.result.story}`
    try {
        await navigator.clipboard.writeText(text)
        copied.value = true
        setTimeout(() => { copied.value = false }, 2000)
    } catch {
        window.prompt('複製這段話：', text)
    }
}
</script>
