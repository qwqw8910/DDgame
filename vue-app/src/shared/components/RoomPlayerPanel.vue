<template>
    <div class="rpp-wrap">
        <!-- Header 觸發按鈕 -->
        <!-- 新外殼（RoomHeader）傳入 triggerClass：線稿圖示 + 中性色人數；未傳則維持舊樣式 -->
        <button v-if="triggerClass" type="button" :class="[triggerClass, '!flex !w-auto gap-1 px-2.5']"
            :aria-expanded="open" :aria-label="`玩家列表，${players.length} 人`" title="玩家列表"
            @click.stop="open = !open">
            <RoomIcon name="users" />
            <span class="text-base tabular-nums">{{ players.length }}</span>
        </button>
        <button v-else class="header-icon-btn rpp__trigger" :aria-expanded="open" aria-label="玩家列表"
            @click.stop="open = !open">
            👥<span class="rpp__count">{{ players.length }}</span>
        </button>

        <Teleport to="body">
            <!-- 遮罩 -->
            <div v-if="open" class="rpp__backdrop" @click="open = false" />

            <!-- 面板 -->
            <Transition name="rpp-slide">
                <!-- 新外殼樣式（設計系統 v2） -->
                <div v-if="open && triggerClass" role="dialog" aria-labelledby="rpp-v2-title"
                    class="fixed top-[calc(env(safe-area-inset-top)+70px)] right-3 z-[201] w-[min(340px,calc(100vw-24px))] overflow-hidden rounded-tile bg-raised font-text text-ink shadow-(--shadow-tile-hover)"
                    @keydown.esc="open = false">
                    <div class="flex items-center justify-between gap-2 border-b border-hairline py-1 pr-1.5 pl-5">
                        <h2 id="rpp-v2-title" class="m-0 font-display text-xl font-normal">
                            玩家 <span class="text-base tabular-nums text-ink-faint">{{ players.length }} 人</span>
                        </h2>
                        <button ref="closeRef" type="button" :class="triggerClass" aria-label="關閉玩家列表" @click="open = false">
                            <RoomIcon name="close" />
                        </button>
                    </div>
                    <ul class="m-0 max-h-[60vh] list-none overflow-y-auto p-2">
                        <li v-for="p in players" :key="p.id" class="flex min-h-12 items-center gap-3 rounded-inset py-1 pr-1 pl-3">
                            <span aria-hidden="true" class="size-2 shrink-0 rounded-full"
                                :class="playerOnline(p) ? 'bg-success' : 'bg-ink-faint/50'" />
                            <span class="min-w-0 truncate text-base" :class="playerOnline(p) ? 'text-ink' : 'text-ink-faint'">{{ p.nickname }}</span>
                            <span v-if="!playerOnline(p)" class="shrink-0 text-base text-ink-faint">離線</span>
                            <span v-if="p.id === myId" class="shrink-0 text-base text-brand-ink">你</span>
                            <span v-if="p.id === hostId" class="grid shrink-0 place-items-center text-ink-muted" title="房主">
                                <RoomIcon name="crown" /><span class="sr-only">（房主）</span>
                            </span>
                            <span v-if="isHost && p.id !== myId" class="ml-auto flex shrink-0 items-center">
                                <button type="button" :class="triggerClass" :aria-label="`把房主移交給 ${p.nickname}`" title="移交房主"
                                    @click="onTransfer(p)">
                                    <RoomIcon name="crown" />
                                </button>
                                <button type="button"
                                    class="h-11 cursor-pointer rounded-full border-0 bg-transparent px-3 text-base text-brand-ink transition-[background-color] duration-150 hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                                    :aria-label="`踢出 ${p.nickname}`" @click="onKick(p)">
                                    踢出
                                </button>
                            </span>
                        </li>
                    </ul>
                </div>
                <div v-else-if="open" class="rpp__panel" role="dialog" aria-label="玩家列表">
                    <div class="rpp__panel-header">
                        <span style="font-weight:600;font-size:16px">👥 玩家（{{ players.length }} 人）</span>
                        <button class="header-icon-btn" aria-label="關閉" @click="open = false">✕</button>
                    </div>

                    <div class="rpp__list">
                        <div v-for="p in players" :key="p.id" class="rpp__row">
                            <!-- 在線狀態 -->
                            <span :class="['rpp__dot', playerOnline(p) ? 'rpp__dot--on' : 'rpp__dot--off']" />

                            <!-- 暱稱 + 標籤 -->
                            <div class="rpp__info">
                                <span class="rpp__name">{{ p.nickname }}</span>
                                <span v-if="p.id === myId" class="badge badge-me"
                                    style="font-size:11px;padding:1px 7px">我</span>
                                <span v-if="p.id === hostId" class="badge badge-host"
                                    style="font-size:11px;padding:1px 7px">👑</span>
                            </div>

                            <!-- 房主操作 -->
                            <div v-if="isHost && p.id !== myId" class="rpp__actions">
                                <button class="btn-ghost-sm" title="移交房主"
                                    @click="onTransfer(p)">👑</button>
                                <button class="btn-danger-sm" title="踢出"
                                    @click="onKick(p)">踢</button>
                            </div>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import RoomIcon from './room/RoomIcon.vue'

const props = defineProps({
    players: { type: Array, default: () => [] },
    myId:    { type: String, default: '' },
    hostId:  { type: String, default: '' },
    isHost:  { type: Boolean, default: false },
    triggerClass: { type: String, default: '' },
})

const emit = defineEmits(['kick', 'transfer-host'])

const open = ref(false)

// v2 面板開啟時把焦點移進面板（鍵盤 / 讀屏使用者才找得到），Esc 可關閉
const closeRef = ref(null)
watch(open, (isOpen) => {
    if (isOpen && props.triggerClass) nextTick(() => closeRef.value?.focus())
})

// 相容兩個遊戲的不同欄位名稱（is_online vs connected）
function playerOnline(p) {
    if (p.is_online !== undefined) return p.is_online
    if (p.connected !== undefined) return p.connected
    return true
}

function onKick(p) {
    if (!confirm(`確定要踢出 ${p.nickname}？`)) return
    emit('kick', p.id, p.nickname)
    open.value = false
}

function onTransfer(p) {
    if (!confirm(`將房主移交給 ${p.nickname}？`)) return
    emit('transfer-host', p.id, p.nickname)
    open.value = false
}
</script>
