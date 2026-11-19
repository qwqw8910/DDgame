<template>
    <!-- 右欄只放「現在要做的事」；戰況與波次預告在左欄 -->
    <!-- 電腦版：由上到下是「本回合甜點 → 選中的塔 → 可以合成 → 品質 → 商店分頁」，主按鈕釘在欄底 -->
    <div class="gt-actions flex flex-col gap-4 text-base text-(--gt-text)">
        <p v-if="me?.out" class="m-0 font-semibold text-(--gt-accent-ink)" :class="tabClass('place')">你已出局，可以切換看其他人的地圖。</p>
        <p v-else-if="me && !mine && (me.pending.length || me.choosing)" class="m-0 text-(--gt-accent-ink)" :class="tabClass('place')">回到自己的地圖才能放置和選擇甜點。</p>

        <!-- 手上的甜點 -->
        <GemSection v-if="mine && me?.pending.length" title="本回合甜點" :meta="`還可放 ${me.pending.length} 顆`" :class="tabClass('place')" aria-label="本回合甜點">
            <h3 class="gt-heading">點地圖放下甜點（還有 {{ me.pending.length }} 個）</h3>
            <!-- 五格位置固定：放下的那格留著、變灰寫「已放」，其他格子不會往前擠；點已放的格子可以看那座塔 -->
            <div class="grid grid-cols-5 gap-1.5" @mouseleave="hoverSlot = null">
                <template v-for="g in slotRows" :key="g.slot">
                    <button v-if="g.placed" class="gt-gem-slot gt-gem-slot--placed" :aria-label="`${gemName(g.kind, g.level)}，已放下，看這座塔`"
                        @mouseenter="hoverSlot = g.slot" @focus="hoverSlot = g.slot" @blur="hoverSlot = null" @click="$emit('select-tower', g.placed)">
                        <GemIcon :kind="g.kind" :level="g.level" :size="38" />
                        <span class="leading-none">已放</span>
                    </button>
                    <button v-else class="gt-gem-slot"
                        :class="{ 'gt-gem-slot--on': g.slot === selectedSlot }"
                        :aria-pressed="g.slot === selectedSlot" :aria-keyshortcuts="String(g.slot + 1)"
                        @mouseenter="hoverSlot = g.slot" @focus="hoverSlot = g.slot" @blur="hoverSlot = null" @click="$emit('select-slot', g.slot)">
                        <GemIcon :kind="g.kind" :level="g.level" :size="38" :label="gemName(g.kind, g.level)" />
                        <span class="flex items-center gap-1 leading-none">
                            <kbd v-if="keys" class="gt-kbd" aria-hidden="true">{{ g.slot + 1 }}</kbd>Lv{{ g.level }}
                        </span>
                    </button>
                </template>
            </div>
            <!-- 數值預覽：滑鼠移到哪一格就顯示哪一格，移開回到目前選的那顆（手機點一下就是選取） -->
            <div v-if="preview" class="gt-preview" aria-live="polite">
                <span class="gt-preview-icon"><GemIcon :kind="preview.kind" :level="preview.level" :size="44" /></span>
                <div class="min-w-0 flex-1">
                    <p class="m-0 mb-1 truncate font-bold text-(--gt-ink)">
                        {{ gemName(preview.kind, preview.level) }}<span v-if="preview.placed" class="ml-1.5 text-sm font-normal text-(--gt-muted)">已放</span>
                    </p>
                    <GemStatBars :stats="statsOf(preview.kind, preview.level)" :catalog="catalog" />
                </div>
            </div>
            <p v-if="preview" class="mt-2 mb-0 leading-snug text-(--gt-muted)">{{ catalog.gems[preview.kind].trait }}</p>
            <!-- 重骰：一個都還沒放才能骰，一次換掉五顆；品質越高越貴，同回合每骰一次加價 -->
            <template v-if="me.canReroll">
                <button class="gt-btn gt-btn--small mt-2 w-full" :disabled="shortOf(me.rerollCost) > 0" aria-keyshortcuts="D" @click="$emit('reroll')">
                    重骰全部五顆（{{ me.rerollCost }} 金）<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">D</kbd>
                </button>
                <p class="mt-1 mb-0 text-xs text-(--gt-muted) max-sm:hidden">
                    <template v-if="shortOf(me.rerollCost)">還差 {{ shortOf(me.rerollCost) }} 金・</template>本回合已骰 {{ me.rerolls }} 次，每骰一次 +{{ catalog.rerollStep }} 金，下回合恢復
                </p>
            </template>
        </GemSection>

        <!-- 五顆都放完：選一顆 -->
        <GemSection v-else-if="mine && me?.choosing" title="選 1 顆留下" meta="其餘變成餅乾牆" :class="tabClass('place')" aria-label="選擇保留的甜點">
            <h3 class="gt-heading">留下一個，其餘變成餅乾牆</h3>
            <p v-if="keys" class="mt-0 mb-2 text-(--gt-muted)">按 <kbd class="gt-kbd">1</kbd>～<kbd class="gt-kbd">5</kbd> 選，<kbd class="gt-kbd">K</kbd> 保留，<kbd class="gt-kbd">M</kbd> 合成</p>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="(f, i) in freshRows" :key="f.id" class="gt-row" :class="{ 'gt-row--on': f.id === selectedId }">
                    <button class="gt-plain flex min-h-11 min-w-0 flex-1 items-center gap-2 p-0 text-left"
                        :aria-keyshortcuts="String(i + 1)" @click="$emit('select-tower', f.tower)">
                        <kbd v-if="keys" class="gt-kbd" aria-hidden="true">{{ i + 1 }}</kbd>
                        <GemIcon :kind="f.tower.kind" :level="f.tower.level" :size="30" />
                        <span class="truncate">{{ gemName(f.tower.kind, f.tower.level) }}</span>
                    </button>
                    <button v-if="f.mergeGain" class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('merge', f.id)">合成 +{{ f.mergeGain }}</button>
                    <button class="gt-btn gt-btn--small" @click="$emit('keep', f.id)">保留</button>
                </li>
            </ul>
        </GemSection>

        <!-- 準備：手機與平板放完、選完才出現，排在最上面；電腦版整個建造階段都釘在右欄底部，
             還沒放完時是灰的並說明還差什麼，按鈕位置不會跳 -->
        <GemSection v-if="phase === 'build' && me && !me.out" bare title="準備" class="gt-ready" :class="[tabClass('place'), !me.resolved && 'max-lg:hidden']">
            <button class="gt-btn gt-btn--lamp gt-btn--hero w-full" :disabled="me.ready || !me.resolved" aria-keyshortcuts="R" @click="$emit('ready')">
                {{ readyLabel }}<kbd v-if="keys && me.resolved && !me.ready" class="gt-kbd ml-2" aria-hidden="true">R</kbd>
            </button>
        </GemSection>

        <GemSection v-if="recipes.length" title="可以合成" :meta="`${recipes.length} 種`" :class="tabClass('place')" aria-label="可合成的特殊塔">
            <h3 class="gt-heading">可以合成</h3>
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="r in recipes" :key="r.id" class="gt-row group relative">
                    <!-- 滑鼠移上去、鍵盤聚焦或點名字，都會在下方顯示這座塔的效果 -->
                    <button class="gt-plain flex min-h-11 min-w-0 flex-1 cursor-help items-center gap-2 p-0 text-left"
                        :aria-expanded="tipId === r.id" :aria-describedby="`gt-tip-${r.id}`"
                        @click="tipId = tipId === r.id ? null : r.id" @blur="tipId = null">
                        <GemIcon :kind="r.result" :size="30" />
                        <span class="min-w-0 flex-1 truncate">{{ r.name }}</span>
                    </button>
                    <button class="gt-btn gt-btn--small gt-btn--lamp" @click="$emit('combine', r.id)">合成</button>
                    <div :id="`gt-tip-${r.id}`" role="tooltip" class="gt-tip"
                        :class="tipId === r.id ? 'block' : 'hidden group-hover:block group-focus-within:block'">
                        <p class="m-0 font-semibold text-(--gt-ink)">{{ r.name }}</p>
                        <GemStatBars :stats="r.stats" :catalog="catalog" show-target class="my-1" />
                        <p class="m-0 leading-snug">{{ r.trait }}</p>
                    </div>
                </li>
            </ul>
        </GemSection>

        <!-- 選中的塔 -->
        <GemSection v-if="selected" :title="selectedTitle" :meta="selected.kind === 'stone' ? '' : `擊殺 ${selected.kills}`" class="gt-card" :class="tabClass('tower', ...(me?.choosing ? ['place'] : []))" aria-label="選取的塔">
            <template v-if="selected.kind === 'stone'">
                <h3 class="gt-heading">餅乾牆</h3>
                <template v-if="phase === 'build' && me && mine">
                    <button v-if="swapFrom" class="gt-btn w-full" aria-keyshortcuts="S Escape" @click="$emit('cancel-swap')">取消移動<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">Esc</kbd></button>
                    <button v-else class="gt-btn w-full" aria-keyshortcuts="Delete" @click="$emit('remove', selected.id)">拆除（免費）<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">Del</kbd></button>
                </template>
                <p v-else-if="mine" class="m-0">只有建造階段可以拆除。</p>
            </template>
            <template v-else>
                <h3 class="gt-heading">{{ gemName(selected.kind, selected.level) }}</h3>
                <!-- 攻擊／攻速／射程用長條比高低，其餘數值排成小方格（長數字縮寫，不會擠成好幾行） -->
                <GemStatBars :stats="selectedStats" :catalog="catalog" class="mb-2" />
                <dl class="m-0 grid grid-cols-4 gap-1">
                    <div v-for="s in statTiles" :key="s.label" class="min-w-0 rounded-lg bg-(--gt-bg) px-2 py-1" :title="s.title">
                        <dt class="text-xs text-(--gt-muted)">{{ s.label }}</dt>
                        <dd class="m-0 truncate font-semibold text-(--gt-ink) tabular-nums">{{ s.value }}</dd>
                    </div>
                </dl>
                <div class="mt-2">
                    <div class="flex items-baseline justify-between gap-2">
                        <span class="text-(--gt-muted)">熟練度 <b class="font-semibold text-(--gt-ink)">{{ mastery.rank }} 階{{ mastery.max ? '（滿）' : '' }}</b></span>
                        <span v-if="!mastery.max" class="shrink-0 text-xs text-(--gt-muted) tabular-nums">再 {{ mastery.left }} 殺</span>
                    </div>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-(--gt-line-soft)" role="progressbar" aria-label="熟練度進度"
                        :aria-valuenow="Math.round(mastery.progress * 100)" aria-valuemin="0" aria-valuemax="100">
                        <div class="h-full rounded-full bg-(--gt-accent)" :style="{ width: `${mastery.progress * 100}%` }" />
                    </div>
                    <p v-if="mastery.effect" class="mt-1 mb-0 text-xs text-(--gt-muted)">{{ mastery.effect }}</p>
                </div>
                <p class="mt-1 mb-0 leading-snug">{{ selectedTrait }}</p>
                <template v-if="canMove">
                    <button class="gt-btn gt-btn--small mt-2 w-full" :disabled="!swapFrom && shortOf(catalog.swapCost) > 0" aria-keyshortcuts="S"
                        @click="$emit(swapFrom ? 'cancel-swap' : 'start-swap', selected.id)">
                        {{ swapFrom ? '取消移動' : `跟餅乾牆換位置（${catalog.swapCost} 金）` }}<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">S</kbd>
                    </button>
                    <p v-if="!swapFrom && shortOf(catalog.swapCost)" class="mt-1 mb-0 text-(--gt-muted)">還差 {{ shortOf(catalog.swapCost) }} 金</p>
                </template>
            </template>
        </GemSection>
        <p v-if="swapFrom" class="m-0 text-(--gt-accent-ink)" :class="tabClass('place', 'tower')" role="status">點一塊餅乾牆，塔會移到那裡。</p>
        <!-- 出怪中沒有能做的事：告訴玩家右欄現在的用途，不留一整欄空白 -->
        <GemSection v-if="phase === 'wave' && !selected && !recipes.length" title="塔的資訊" :class="tabClass('place', 'tower')">
            <p class="m-0 mb-2 text-(--gt-muted)">點地圖上的塔，可以在這裡看它的傷害、射程和戰績。</p>
            <h3 class="gt-heading">本波怪物</h3>
            <GemWaveTips :view="view" :catalog="catalog" />
        </GemSection>

        <!-- 品質 -->
        <GemSection v-if="me && !me.out && phase === 'build'" title="甜點品質" :meta="`Lv ${me.quality} / ${catalog.qualityRates.length}`" :class="tabClass('shop')" aria-label="甜點品質">
            <h3 class="gt-heading">甜點品質 {{ me.quality }}／{{ catalog.qualityRates.length }}</h3>
            <div class="flex h-2.5 overflow-hidden rounded-sm bg-(--gt-track)" role="img" :aria-label="`目前機率：${rateText}`">
                <span v-for="(r, i) in rates" :key="i" :style="{ width: `${r}%`, background: RATE_COLORS[i] }" />
            </div>
            <p class="mt-1.5 mb-2 leading-snug">{{ rateText }}</p>
            <button v-if="qualityCost" class="gt-btn gt-btn--small w-full" :disabled="shortOf(qualityCost) > 0" aria-keyshortcuts="U" @click="$emit('upgrade')">
                提升品質（{{ qualityCost }} 金）<kbd v-if="keys" class="gt-kbd ml-2" aria-hidden="true">U</kbd>
            </button>
            <p v-if="qualityCost && shortOf(qualityCost)" class="mt-1 mb-0 text-(--gt-muted)">還差 {{ shortOf(qualityCost) }} 金</p>
        </GemSection>

        <!-- 商店：電腦版收成一張有分頁的卡片（許願池／甜點研究／補血）；手機與平板維持原本一塊一塊往下排 -->
        <section v-if="shopTabs.length" class="gt-shop" :class="tabClass('shop')" aria-label="商店">
        <div class="gt-seg hidden lg:flex" role="tablist" aria-label="商店分頁">
            <button v-for="t in shopTabs" :id="`gt-shop-tab-${t.id}`" :key="t.id" class="gt-seg-btn" role="tab"
                :aria-selected="shopTab === t.id" :aria-controls="`gt-shop-${t.id}`" :tabindex="shopTab === t.id ? 0 : -1"
                @click="pickedShop = t.id" @keydown.right.prevent="stepShop(1)" @keydown.left.prevent="stepShop(-1)">{{ t.label }}</button>
        </div>
        <!-- 許願池：先點甜點，再點機率，一次付清；已許的層數直接打勾，不用猜有沒有按到 -->
        <GemSection v-if="shopOn('wish')" id="gt-shop-wish" bare title="許願池" :class="shopPane('wish')" aria-label="許願池">
            <h3 class="gt-heading">許願池</h3>
            <p class="mt-0 mb-2 text-(--gt-muted)">下回合 1 顆變成指定甜點</p>
            <div class="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="選一種甜點">
                <button v-for="(c, id) in catalog.wish.categories" :key="id" class="gt-wish-pick" :class="{ 'gt-wish-pick--on': wishKind === id }"
                    role="radio" :aria-checked="wishKind === id" :aria-label="c.name" :title="c.name" :disabled="!!me.wish && me.wish.category !== id"
                    @click="pickedWish = id">
                    <GemIcon :kind="id" :size="30" />
                </button>
            </div>
            <div class="mt-2 grid grid-cols-3 gap-1.5">
                <button v-for="t in wishTiers" :key="t.stacks" class="gt-wish-tier" :class="{ 'gt-wish-tier--done': t.done }"
                    :disabled="t.done || !wishKind || shortOf(t.cost) > 0" :aria-label="t.aria" @click="$emit('wish', wishKind, t.stacks)">
                    <span class="font-bold text-(--gt-ink)">{{ t.label }}</span>
                    <span v-if="t.done" class="inline-flex items-center gap-1 text-(--gt-accent-ink)"><GemHeaderIcon name="check" :size="14" />已許</span>
                    <span v-else class="text-(--gt-muted) tabular-nums">{{ t.cost }} 金</span>
                </button>
            </div>
            <p class="mt-1.5 mb-0 leading-snug" :class="me.wish ? 'text-(--gt-ink)' : 'text-(--gt-muted)'" role="status">{{ wishStatus }}</p>
        </GemSection>

        <!-- 買命：金幣換血量，血量滿了或傷害測試（不扣血）就不顯示 -->
        <GemSection v-if="shopOn('life')" id="gt-shop-life" bare title="補血" :class="shopPane('life')" aria-label="買命">
            <h3 class="gt-heading">補血</h3>
            <button class="gt-btn gt-btn--small w-full" :disabled="!canBuyLife" @click="$emit('buy-life')">
                {{ me.lifeCost }} 金換 1 點血（{{ myLives }}／{{ view.maxLives }}）
            </button>
            <p v-if="myLives >= view.maxLives" class="mt-1 mb-0 text-(--gt-muted)">血量已滿</p>
            <p v-else class="mt-1 mb-0 text-xs text-(--gt-muted)">
                <template v-if="shortOf(me.lifeCost)">還差 {{ shortOf(me.lifeCost) }} 金・</template>價格隨波次上漲，最多 30 金，連續購買不會變貴
            </p>
        </GemSection>

        <!-- 研究：選項多，可收合 -->
        <GemSection v-if="shopOn('research')" id="gt-shop-research" bare title="甜點研究" fold :class="shopPane('research')" aria-label="甜點研究">
            <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                <li v-for="r in researchRows" :key="r.id" class="gt-row">
                    <span class="min-w-0 flex-1 leading-snug">
                        <b class="font-semibold text-(--gt-ink)">{{ r.name }} Lv{{ r.level }}／{{ catalog.researchCosts.length }}<span v-if="r.level > catalog.researchBaseLevels" class="ml-1 text-(--gt-muted)">匠心 +{{ r.level - catalog.researchBaseLevels }}</span></b><br />{{ r.desc }}
                        <template v-if="r.cost && shortOf(r.cost)"><br /><span class="text-(--gt-muted)">還差 {{ shortOf(r.cost) }} 金</span></template>
                    </span>
                    <button v-if="r.cost" class="gt-btn gt-btn--small shrink-0" :disabled="shortOf(r.cost) > 0" @click="$emit('research', r.id)">{{ r.cost }} 金</button>
                </li>
            </ul>
            <p class="mt-1.5 mb-0 leading-snug text-(--gt-muted)">過關利息：存款的 {{ catalog.interest.rate * 100 }}%，最多 {{ catalog.interest.cap }} 金</p>
        </GemSection>
        </section>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { isSpecial, HITS, HITS_SHORT } from '../data/gems.js'
import GemIcon from './GemIcon.vue'
import GemHeaderIcon from './GemHeaderIcon.vue'
import GemSection from './GemSection.vue'
import GemStatBars from './GemStatBars.vue'
import GemWaveTips from './GemWaveTips.vue'

const props = defineProps({
    view: { type: Object, required: true },
    catalog: { type: Object, required: true },
    selectedSlot: { type: Number, default: null },
    selectedId: { type: Number, default: null },
    swapFrom: { type: Number, default: null },
    myId: { type: String, default: '' },
    keys: { type: Boolean, default: false }, // 有實體鍵盤時顯示快捷鍵提示
    phoneTab: { type: String, default: '' }, // 手機分頁；只用 max-sm: 隱藏，電腦與平板不受影響
})

// 手機只顯示目前分頁的區塊；沒傳分頁（空字串）時全部顯示
const tabClass = (...tabs) => (props.phoneTab && !tabs.includes(props.phoneTab) ? 'max-sm:hidden' : '')
defineEmits(['select-slot', 'select-tower', 'keep', 'merge', 'combine', 'ready', 'upgrade', 'buy-life', 'reroll', 'wish', 'research', 'remove', 'start-swap', 'cancel-swap'])

const RATE_COLORS = ['#C9B2AD', '#9FB8C9', '#5FA8D3', '#3CCB72', '#F2B233', '#D6305A']

const me = computed(() => props.view.me)
const phase = computed(() => props.view.phase)
const mine = computed(() => props.view.watching === props.myId)
const towerMap = computed(() => new Map(props.view.towers.map(t => [t.id, t])))

const myLives = computed(() => props.view.players[props.myId]?.lives ?? 0)
const canBuyLife = computed(() => myLives.value < props.view.maxLives && shortOf(props.view.me?.lifeCost ?? Infinity) === 0)

// 買不起時還差多少金（0 表示買得起）
const shortOf = cost => Math.max(0, cost - (me.value?.gold ?? 0))

// 許願：先選甜點（本機狀態），再選要許到第幾層；已許的願鎖住甜點種類
const pickedWish = ref(null)
const wishKind = computed(() => me.value?.wish?.category ?? pickedWish.value)
const WISH_LABELS = ['60%', '80%', '必中＋品質']
const wishTiers = computed(() => {
    const from = me.value?.wish?.stacks ?? 0
    const costs = me.value?.wishCosts ?? []
    return props.catalog.wish.stackRates.map((rate, i) => {
        const stacks = i + 1
        const cost = costs.slice(from, stacks).reduce((a, b) => a + b, 0)
        const label = WISH_LABELS[i] ?? `${Math.round(rate * 100)}%`
        return { stacks, cost, done: stacks <= from, label, aria: `許到 ${label}，${cost} 金` }
    })
})
const wishStatus = computed(() => {
    const w = me.value?.wish
    const cats = props.catalog.wish.categories
    if (w) return `已許：${cats[w.category].name} ${WISH_LABELS[w.stacks - 1]}，下回合生效`
    if (!wishKind.value) return '先點一種甜點，再選機率'
    const short = shortOf(wishTiers.value[0].cost)
    return short ? `${cats[wishKind.value].name}：還差 ${short} 金` : `${cats[wishKind.value].name}：選機率，一次付清`
})

function gemName(kind, level) {
    const c = props.catalog
    if (isSpecial(kind)) return c.specials[kind].name
    return `Lv${level} ${c.levelNames[level - 1]}${c.gems[kind].name}`
}

// 電腦版主按鈕：還沒放完時說明還差哪一步
const readyLabel = computed(() => {
    const m = me.value
    if (m.ready) return '已準備，等待隊友'
    if (m.pending.length) return `還要放 ${m.pending.length} 顆甜點`
    if (m.choosing) return '先選 1 顆留下'
    return '準備好了，開始出怪'
})

// 商店分頁：只列出現在用得到的；選過的分頁消失時退回第一個
const SHOP = [
    { id: 'wish', label: '許願池' },
    { id: 'research', label: '甜點研究' },
    { id: 'life', label: '補血' },
]
const shopOn = (id) => {
    if (!me.value || me.value.out || phase.value !== 'build') return false
    if (id === 'wish') return !!props.catalog.wish
    if (id === 'life') return !props.view.nextWave?.test
    return true
}
const shopTabs = computed(() => SHOP.filter(t => shopOn(t.id)))
const pickedShop = ref('wish')
const shopTab = computed(() => (shopTabs.value.some(t => t.id === pickedShop.value) ? pickedShop.value : shopTabs.value[0]?.id))
// 不是目前分頁的內容只在電腦版藏起來；手機與平板全部照排
const shopPane = id => (shopTab.value === id ? '' : 'lg:hidden')
function stepShop(d) {
    const tabs = shopTabs.value
    const i = tabs.findIndex(t => t.id === shopTab.value)
    pickedShop.value = tabs[(i + d + tabs.length) % tabs.length].id
    document.getElementById(`gt-shop-tab-${pickedShop.value}`)?.focus()
}

// 本回合五格：還沒放的是手上的甜點，放下的換成那座塔（伺服器在 fresh 塔上附 slot）
const GEMS_PER_ROUND = 5
const slotRows = computed(() => {
    const m = me.value
    if (!m) return []
    const placed = new Map(m.towers.filter(t => t.fresh && t.slot != null).map(t => [t.slot, t]))
    return Array.from({ length: GEMS_PER_ROUND }, (_, slot) => {
        const g = m.pending.find(x => x.slot === slot)
        if (g) return { slot, kind: g.kind, level: g.level, placed: null }
        const t = placed.get(slot)
        return t ? { slot, kind: t.kind, level: t.level, placed: t } : null
    }).filter(Boolean)
})
const hoverSlot = ref(null)
const preview = computed(() => (
    slotRows.value.find(g => g.slot === hoverSlot.value)
    ?? slotRows.value.find(g => g.slot === props.selectedSlot && !g.placed)
    ?? slotRows.value.find(g => !g.placed)
    ?? null
))
const statsOf = (kind, level) => props.catalog.gems[kind].levels[level - 1]

const freshRows = computed(() => (me.value?.fresh ?? [])
    .map(f => ({ ...f, tower: me.value.towers.find(t => t.id === f.id) }))
    .filter(f => f.tower))

const recipes = computed(() => (me.value?.recipes ?? []).map((r) => {
    const def = props.catalog.recipes.find(x => x.id === r.id)
    const special = props.catalog.specials[def.result]
    return { id: r.id, result: def.result, name: special.name, trait: special.trait, stats: special.stats }
}))
const tipId = ref(null) // 手機點名字時打開的效果說明

const selected = computed(() => towerMap.value.get(props.selectedId) ?? null)
const selectedTitle = computed(() => (!selected.value ? '' : selected.value.kind === 'stone' ? '餅乾牆' : gemName(selected.value.kind, selected.value.level)))
const selectedStats = computed(() => {
    const t = selected.value
    if (!t || t.kind === 'stone') return null
    return isSpecial(t.kind) ? props.catalog.specials[t.kind].stats : props.catalog.gems[t.kind].levels[t.level - 1]
})
const mastery = computed(() => {
    const { kills: steps, damage, haste } = props.catalog.mastery
    const kills = selected.value?.kills ?? 0
    const rank = steps.filter(n => kills >= n).length
    const max = rank >= steps.length
    const from = rank ? steps[rank - 1] : 0
    return {
        rank,
        max,
        left: max ? 0 : steps[rank] - kills,
        progress: max ? 1 : (kills - from) / (steps[rank] - from),
        effect: rank ? `傷害 +${Math.round(rank * damage * 100)}%・攻速 +${Math.round(rank * haste * 100)}%` : '',
    }
})

// 大數字縮寫成「12.3萬」「1.2億」，完整數字放在 title
function compact(n) {
    if (n >= 1e8) return `${+(n / 1e8).toFixed(1)}億`
    if (n >= 1e4) return `${+(n / 1e4).toFixed(1)}萬`
    return String(Math.round(n))
}
const statTiles = computed(() => {
    const t = selected.value
    const s = selectedStats.value
    return [
        { label: '目標', value: HITS_SHORT[s.hits], title: HITS[s.hits] },
        { label: '擊殺', value: compact(t.kills), title: String(t.kills) },
        { label: '總傷', value: compact(t.damage), title: Math.round(t.damage).toLocaleString() },
        { label: 'DPS', value: s.cooldown ? compact(s.damage / s.cooldown) : '—', title: '傷害 ÷ 攻擊間隔（未含加成）' },
    ]
})
const selectedTrait = computed(() => {
    const t = selected.value
    return (isSpecial(t.kind) ? props.catalog.specials[t.kind] : props.catalog.gems[t.kind]).trait
})
const canMove = computed(() => {
    const t = selected.value
    return phase.value === 'build' && mine.value && me.value && t && !t.fresh
})

const researchRows = computed(() => Object.entries(props.catalog.research).map(([id, r]) => {
    const level = me.value?.research[id] ?? 0
    return { id, name: r.name, desc: r.desc, level, cost: props.catalog.researchCosts[level] ?? 0 }
}))

const rates = computed(() => props.catalog.qualityRates[(me.value?.quality ?? 1) - 1])
const rateText = computed(() => rates.value.flatMap((r, i) => (r ? [`Lv${i + 1} ${r}%`] : [])).join('、'))
const qualityCost = computed(() => props.catalog.qualityCosts[(me.value?.quality ?? 1) - 1] ?? 0)
</script>
