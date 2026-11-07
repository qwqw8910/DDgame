<template>
    <!--
      遊戲入口（所有多人遊戲同一套）：頂列 → 標題 → 建立／加入（分頁）→ 玩法重點。
      遊戲只提供文案、人數選項與兩個動作；欄位驗證、錯誤顯示、邀請連結帶入房號都在這裡統一。

      create(nickname, capacity) / join(code, nickname)：可以是 async，丟出 Error 時訊息會顯示在按鈕下方。
    -->
    <div class="h-dvh overflow-x-hidden overflow-y-auto bg-canvas font-text text-ink">
        <div class="mx-auto max-w-xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] sm:px-8">
            <!-- 頂列：左回首頁、右深淺色 -->
            <div class="flex items-center justify-between gap-2">
                <RouterLink to="/" :class="iconBtn" aria-label="回到首頁" title="回到首頁">
                    <RoomIcon name="back" />
                </RouterLink>
                <button type="button" :class="iconBtn" :aria-label="isDark ? '切換為淺色模式' : '切換為深色模式'"
                    :title="isDark ? '切換為淺色模式' : '切換為深色模式'" @click="toggleTheme">
                    <RoomIcon :name="isDark ? 'sun' : 'moon'" />
                </button>
            </div>

            <!-- 首屏重點：遊戲名 -->
            <header class="pt-8 pb-8 sm:pt-12 sm:pb-10">
                <p v-if="eyebrow" class="m-0 text-base font-medium text-brand-ink">{{ eyebrow }}</p>
                <h1 class="mt-2 mb-0 font-display text-[clamp(40px,9vw,64px)] leading-[1.1] font-normal tracking-[0.01em] text-ink">{{ title }}</h1>
                <p v-if="tagline" class="mt-4 mb-0 text-lg leading-relaxed text-ink-muted">{{ tagline }}</p>
            </header>

            <!-- 建立／加入 -->
            <TabsRoot v-model="tab" class="rounded-tile bg-raised p-5 shadow-(--shadow-tile) sm:p-6">
                <!-- 從邀請連結進來只會加入，不顯示分頁 -->
                <TabsList v-if="!fromInvite" aria-label="建立或加入房間" class="grid grid-cols-2 gap-1 rounded-full bg-fill p-1">
                    <TabsTrigger v-for="t in TABS" :key="t.value" :value="t.value"
                        class="h-11 cursor-pointer rounded-full border-0 bg-transparent text-base text-ink-muted transition-[background-color,color,scale] duration-150 ease-soft hover:text-ink active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none data-[state=active]:bg-raised data-[state=active]:text-ink data-[state=active]:shadow-(--shadow-tile)">
                        {{ t.label }}
                    </TabsTrigger>
                </TabsList>

                <!-- 建立 -->
                <TabsContent value="create" class="outline-none">
                    <form class="flex flex-col gap-4" :class="{ 'mt-5': !fromInvite }" novalidate @submit.prevent="submitCreate">
                        <p v-if="createNote" class="m-0 text-base leading-relaxed text-ink-muted">{{ createNote }}</p>
                        <div>
                            <label for="entry-create-nick" class="block text-base text-ink">你的暱稱</label>
                            <input id="entry-create-nick" ref="createNickRef" v-model="createNick" type="text" maxlength="12"
                                autocomplete="nickname" enterkeyhint="go" :placeholder="nicknamePlaceholder"
                                :aria-invalid="createErr.field === 'nick' ? 'true' : undefined"
                                :aria-describedby="createErr.field === 'nick' ? 'entry-create-err' : undefined"
                                :class="inputClass" @input="createErr = {}" />
                        </div>
                        <div v-if="capacityOptions.length">
                            <label for="entry-capacity" class="block text-base text-ink">{{ capacityLabel }}</label>
                            <select id="entry-capacity" v-model="capacity" :class="[inputClass, 'cursor-pointer']">
                                <option v-for="o in capacityOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                            </select>
                        </div>
                        <button type="submit" :disabled="!!busy" :class="primaryBtn">
                            {{ busy === 'create' ? '建立中…' : '建立房間' }}
                        </button>
                        <p v-if="createErr.msg" id="entry-create-err" class="m-0 -mt-1 text-base text-brand-ink" role="alert">{{ createErr.msg }}</p>
                    </form>
                </TabsContent>

                <!-- 加入 -->
                <TabsContent value="join" class="outline-none">
                    <form class="flex flex-col gap-4" :class="{ 'mt-5': !fromInvite }" novalidate @submit.prevent="submitJoin">
                        <div v-if="fromInvite">
                            <p class="m-0 text-base text-ink-muted">朋友邀請你加入房間</p>
                            <p class="m-0 mt-1 font-mono text-[28px] leading-tight font-semibold tracking-[0.15em] text-ink">{{ joinCode }}</p>
                        </div>
                        <div v-else>
                            <label for="entry-join-code" class="block text-base text-ink">房間代碼</label>
                            <input id="entry-join-code" ref="joinCodeRef" v-model="joinCode" type="text" maxlength="6"
                                autocomplete="off" autocapitalize="characters" spellcheck="false" enterkeyhint="next"
                                placeholder="6 碼，例如 AB12CD"
                                :aria-invalid="joinErr.field === 'code' ? 'true' : undefined"
                                :aria-describedby="joinErr.field === 'code' ? 'entry-join-err' : undefined"
                                :class="[inputClass, 'font-mono uppercase tracking-[0.2em] placeholder:font-text placeholder:normal-case placeholder:tracking-normal']"
                                @input="onCodeInput" />
                        </div>
                        <div>
                            <label for="entry-join-nick" class="block text-base text-ink">你的暱稱</label>
                            <input id="entry-join-nick" ref="joinNickRef" v-model="joinNick" type="text" maxlength="12"
                                autocomplete="nickname" enterkeyhint="go" :placeholder="nicknamePlaceholder"
                                :aria-invalid="joinErr.field === 'nick' ? 'true' : undefined"
                                :aria-describedby="joinErr.field === 'nick' ? 'entry-join-err' : undefined"
                                :class="inputClass" @input="joinErr = {}" />
                        </div>
                        <button type="submit" :disabled="!!busy" :class="primaryBtn">
                            {{ busy === 'join' ? '加入中…' : '加入房間' }}
                        </button>
                        <p v-if="joinErr.msg" id="entry-join-err" class="m-0 -mt-1 text-base text-brand-ink" role="alert">{{ joinErr.msg }}</p>
                    </form>
                </TabsContent>
            </TabsRoot>

            <!-- 玩法重點 -->
            <section v-if="rules.length" class="mt-10" aria-labelledby="entry-rules-title">
                <h2 id="entry-rules-title" class="m-0 font-display text-xl font-normal text-ink">{{ rulesTitle }}</h2>
                <ul class="m-0 mt-3 flex list-disc flex-col gap-1.5 pl-5 text-base leading-relaxed text-ink-muted">
                    <li v-for="r in rules" :key="r">{{ r }}</li>
                </ul>
            </section>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { TabsRoot, TabsList, TabsTrigger, TabsContent } from 'reka-ui'
import RoomIcon from './RoomIcon.vue'
import { useTheme } from '@/shared/composables/useTheme.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import { warmUpServer } from '@/shared/api/config.js'

const props = defineProps({
    title: { type: String, required: true },
    // 標題上方一小行：說一件真實的事（例如人數）
    eyebrow: { type: String, default: '' },
    tagline: { type: String, default: '' },
    createNote: { type: String, default: '' },
    nicknamePlaceholder: { type: String, default: '最多 12 個字' },
    capacityLabel: { type: String, default: '人數上限' },
    // [{ value, label }]；空陣列 = 不顯示人數選擇
    capacityOptions: { type: Array, default: () => [] },
    defaultCapacity: { type: [Number, String], default: null },
    rulesTitle: { type: String, default: '怎麼玩' },
    rules: { type: Array, default: () => [] },
    create: { type: Function, required: true },
    join: { type: Function, required: true },
})

const route = useRoute()
const { isDark, toggleTheme } = useTheme()

const TABS = [{ value: 'create', label: '建立房間' }, { value: 'join', label: '加入房間' }]

// 邀請連結：#/<遊戲>?room=XXXXXX（或 id=）
const inviteCode = String(route.query.room || route.query.id || '').toUpperCase().slice(0, 6)
const fromInvite = !!inviteCode
const tab = ref(fromInvite ? 'join' : 'create')

const saved = getSavedNickname()
const createNick = ref(saved)
const joinNick = ref(saved)
const joinCode = ref(inviteCode)
const capacity = ref(props.defaultCapacity ?? props.capacityOptions[0]?.value ?? null)

const busy = ref('')
const createErr = ref({})
const joinErr = ref({})

const createNickRef = ref(null)
const joinCodeRef = ref(null)
const joinNickRef = ref(null)

onMounted(() => {
    warmUpServer()
    // 邀請進來：游標直接放暱稱；否則放在第一個還沒填的欄位
    nextTick(() => {
        if (fromInvite) joinNickRef.value?.focus()
        else if (!createNick.value) createNickRef.value?.focus()
    })
})

function onCodeInput() {
    joinCode.value = joinCode.value.replace(/[^0-9a-z]/gi, '').toUpperCase()
    joinErr.value = {}
}

async function run(kind, errRef, fn) {
    busy.value = kind
    try {
        await fn()
    } catch (err) {
        errRef.value = { msg: err?.message || '發生錯誤，請再試一次' }
    } finally {
        busy.value = ''
    }
}

function submitCreate() {
    const nickname = createNick.value.trim()
    if (!nickname) {
        createErr.value = { field: 'nick', msg: '請輸入暱稱' }
        createNickRef.value?.focus()
        return
    }
    saveNickname(nickname)
    joinNick.value = nickname
    run('create', createErr, () => props.create(nickname, capacity.value))
}

function submitJoin() {
    const code = joinCode.value.trim().toUpperCase()
    const nickname = joinNick.value.trim()
    if (code.length !== 6) {
        joinErr.value = { field: 'code', msg: '房間代碼是 6 碼' }
        joinCodeRef.value?.focus()
        return
    }
    if (!nickname) {
        joinErr.value = { field: 'nick', msg: '請輸入暱稱' }
        joinNickRef.value?.focus()
        return
    }
    saveNickname(nickname)
    createNick.value = nickname
    run('join', joinErr, () => props.join(code, nickname))
}

// 44×44 圖示按鈕，與首頁同一套
const iconBtn = 'grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-raised text-ink no-underline shadow-(--shadow-tile) transition-[background-color,scale] duration-150 ease-soft hover:bg-fill active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none'
const inputClass = 'mt-2 h-12 w-full rounded-inset border-0 bg-fill px-4 text-lg text-ink shadow-[inset_0_0_0_1px_var(--color-hairline)] outline-none placeholder:text-ink-faint focus-visible:shadow-[inset_0_0_0_2px_var(--color-brand)] aria-invalid:shadow-[inset_0_0_0_2px_var(--color-brand)]'
const primaryBtn = 'flex h-12 w-full cursor-pointer items-center justify-center rounded-full border-0 bg-brand text-lg font-medium text-on-brand transition-[opacity,scale] duration-150 ease-soft active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-60 disabled:active:scale-100 motion-reduce:transition-none'
</script>
