<template>
    <!-- 聊天側欄 / 手機分頁：公開、私聊（群組分頁）、說書人；未讀數字標在分頁上 -->
    <section class="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card" aria-label="聊天">
        <div v-if="!fixedTab" class="flex shrink-0 border-b border-divider" role="tablist">
            <button v-for="t in tabs" :key="t.key" type="button" role="tab" :aria-selected="tab === t.key"
                :class="['relative flex-1 px-2 py-2 text-sm font-semibold transition-colors', tab === t.key ? 'text-heading border-b-2 border-neon-purple' : 'text-body hover:text-label']"
                @click="tab = t.key">
                {{ t.label }}
                <span v-if="unread[t.key]" class="ml-1 rounded-full bg-ruby px-1.5 text-[10px] text-white">{{ unread[t.key] }}</span>
            </button>
        </div>

        <!-- 子分頁：私聊群組 / 說書人對話串 -->
        <div v-if="subTabs.length > 1" class="flex shrink-0 gap-1 overflow-x-auto border-b border-divider px-2 py-1.5 [scrollbar-width:none]">
            <button v-for="s in subTabs" :key="s.key" type="button"
                :class="['shrink-0 rounded-full border px-2.5 py-0.5 text-xs', currentSub === s.key ? 'border-neon-cyan text-heading bg-neon-cyan/10' : 'border-border text-body']"
                @click="sub[tab] = s.key">
                <span v-if="s.color" class="mr-1 inline-block h-2 w-2 rounded-full" :style="{ background: s.color }"></span>{{ s.label }}
                <span v-if="s.unread" class="ml-1 rounded-full bg-ruby px-1 text-[10px] text-white">{{ s.unread }}</span>
            </button>
        </div>

        <div ref="listRef" class="min-h-0 flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1.5" aria-live="polite">
            <p v-if="!messages.length" class="m-auto text-center text-sm text-body">{{ emptyText }}</p>
            <ChatMessage v-for="m in messages" :key="m.id" :message="m" :names="names" :seats="seats"
                :my-id="myId" :storyteller-id="view.storytellerId" />
        </div>

        <form class="flex shrink-0 items-end gap-1.5 border-t border-divider p-2" @submit.prevent="send">
            <RoleTagPicker :seats="seats" :names="names" :disabled="!canSend" @pick="insertTag" />
            <textarea ref="inputRef" v-model="draft" rows="1" :maxlength="CHAT_MAX_LEN" :disabled="!canSend"
                :placeholder="canSend ? placeholder : disabledReason" aria-label="訊息"
                class="game-input min-h-[40px] max-h-28 flex-1 resize-none py-2 text-sm"
                @keydown.enter.exact.prevent="send"></textarea>
            <button type="submit" class="btn-primary !w-auto shrink-0 !px-3 !py-2 text-sm" :disabled="!canSend || !draft.trim()">送出</button>
        </form>
    </section>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import ChatMessage from './ChatMessage.vue'
import RoleTagPicker from './RoleTagPicker.vue'
import { CHAT_MAX_LEN } from '../data/constants.js'

const props = defineProps({
    view: { type: Object, required: true },
    myId: { type: String, default: null },
    fixedTab: { type: String, default: null }, // 手機版由外層分頁列決定
})
const emit = defineEmits(['public', 'whisper', 'storyteller'])

const role = computed(() => props.view.viewer.role)
const isST = computed(() => role.value === 'storyteller')
const names = computed(() => props.view.names)
const seats = computed(() => props.view.seats)
const chat = computed(() => props.view.chat)

const tabs = computed(() => {
    const t = [{ key: 'public', label: '公開' }]
    if (Object.keys(chat.value.whispers).length || role.value === 'player') t.push({ key: 'whisper', label: '私聊' })
    if (role.value !== 'spectator') t.push({ key: 'storyteller', label: isST.value ? '私訊' : '說書人' })
    return t
})
const innerTab = ref('public')
const tab = computed({
    get: () => props.fixedTab ?? innerTab.value,
    set: v => { innerTab.value = v },
})

// ── 子分頁 ──
const sub = reactive({ whisper: null, storyteller: null })
const whisperGroups = computed(() => Object.values(chat.value.whispers).sort((a, b) => b.createdAt - a.createdAt))
const threads = computed(() => {
    if (!isST.value) return props.myId ? [props.myId] : []
    // 說書人：所有還在座位上的玩家（含測試機器人，方便單人測試）都有一個對話串，有訊息的排前面
    const ids = seats.value.filter(s => !s.hasLeft).map(s => s.playerId)
    return ids.sort((a, b) => (chat.value.storyteller[b]?.length ?? 0) - (chat.value.storyteller[a]?.length ?? 0))
})
const subTabs = computed(() => {
    if (tab.value === 'whisper') {
        return whisperGroups.value.map(g => ({
            key: g.id, color: g.color, unread: unreadOf(`w:${g.id}`, g.history.length),
            label: (g.participants ?? []).filter(id => id !== props.myId).map(id => names.value[id] ?? '?').join('、') || '私聊',
        }))
    }
    if (tab.value === 'storyteller' && isST.value) {
        return threads.value.map(id => ({ key: id, label: names.value[id] ?? '?', unread: unreadOf(`s:${id}`, chat.value.storyteller[id]?.length ?? 0) }))
    }
    return []
})
const currentSub = computed(() => {
    const keys = subTabs.value.map(s => s.key)
    const chosen = sub[tab.value]
    if (tab.value === 'storyteller' && !isST.value) return props.myId
    return keys.includes(chosen) ? chosen : keys[0] ?? null
})

const messages = computed(() => {
    if (tab.value === 'public') return chat.value.public
    if (tab.value === 'whisper') return chat.value.whispers[currentSub.value]?.history ?? []
    return chat.value.storyteller[currentSub.value] ?? []
})
const channelKey = computed(() => (tab.value === 'public' ? 'public' : tab.value === 'whisper' ? `w:${currentSub.value}` : `s:${currentSub.value}`))

// ── 未讀 ──
const seen = reactive({})
function unreadOf(key, len) { return Math.max(0, len - (seen[key] ?? 0)) }
watch([channelKey, () => messages.value.length], () => { seen[channelKey.value] = messages.value.length }, { immediate: true })
const unread = computed(() => ({
    public: tab.value === 'public' ? 0 : unreadOf('public', chat.value.public.length),
    whisper: whisperGroups.value.reduce((n, g) => n + (channelKey.value === `w:${g.id}` ? 0 : unreadOf(`w:${g.id}`, g.history.length)), 0),
    storyteller: threads.value.reduce((n, id) => n + (channelKey.value === `s:${id}` ? 0 : unreadOf(`s:${id}`, chat.value.storyteller[id]?.length ?? 0)), 0),
}))

// ── 可否發言 ──
const day = computed(() => props.view.phase === 'day')
const sp = computed(() => props.view.daySubPhase)
const myGroupId = computed(() => props.view.me?.whisperGroupId ?? null)
const canSend = computed(() => {
    if (tab.value === 'public') return role.value !== 'spectator' && day.value && ['free', 'nomination'].includes(sp.value)
    if (tab.value === 'whisper') return day.value && sp.value === 'free' && !!myGroupId.value && currentSub.value === myGroupId.value
    return role.value !== 'spectator' && !['lobby', 'paused'].includes(props.view.phase) && !!currentSub.value
})
const disabledReason = computed(() => {
    if (role.value === 'spectator') return '觀戰者不能發言'
    if (tab.value === 'public') return day.value ? '天亮公告中…' : '公開文字只在白天開放'
    if (tab.value === 'whisper') {
        if (!(day.value && sp.value === 'free')) return '私聊只在自由時間開放（可閱讀紀錄）'
        return myGroupId.value ? '這個私聊已結束' : '點座位 → 邀請私聊'
    }
    return '目前無法私訊'
})
const placeholder = computed(() => (tab.value === 'public' ? '公開文字（主要討論請用 Discord）' : tab.value === 'whisper' ? '私聊訊息…' : isST.value ? `私訊 ${names.value[currentSub.value] ?? ''}` : '私訊說書人（只有說書人看得到）'))
const emptyText = computed(() => (tab.value === 'whisper' && !whisperGroups.value.length ? '還沒有私聊。點座位 → 邀請私聊' : '還沒有訊息'))

// ── 輸入 ──
const draft = ref('')
const inputRef = ref(null)
const listRef = ref(null)
function insertTag(tag) {
    draft.value = `${draft.value}${draft.value && !draft.value.endsWith(' ') ? ' ' : ''}${tag} `
    nextTick(() => inputRef.value?.focus())
}
function send() {
    const text = draft.value.trim()
    if (!text || !canSend.value) return
    if (tab.value === 'public') emit('public', text)
    else if (tab.value === 'whisper') emit('whisper', text)
    else emit('storyteller', text, isST.value ? currentSub.value : null)
    draft.value = ''
}

watch(() => messages.value.length, () => nextTick(() => {
    const el = listRef.value
    if (el) el.scrollTop = el.scrollHeight
}), { immediate: true })

// 外部要求切到某個對話（例如說書人從玩家選單點「私訊」）
function openThread(tabKey, subKey = null) {
    innerTab.value = tabKey
    if (subKey) sub[tabKey] = subKey
}
defineExpose({ unread, openThread })
</script>
