<template>
    <!-- 角色 / 座位標籤選單：點一下插入 [[role:id]] 或 [[seat:n]] -->
    <PopoverRoot v-model:open="open">
        <PopoverTrigger class="header-icon-btn shrink-0" aria-label="插入角色或座位標籤" title="插入角色 / 座位標籤" :disabled="disabled">
            <GameIcon id="roleSheet" :size="18" />
        </PopoverTrigger>
        <PopoverPortal>
            <PopoverContent side="top" align="start" :side-offset="6"
                class="z-[95] max-h-[50dvh] w-[min(92vw,340px)] overflow-y-auto rounded-xl border border-border-glow bg-card-solid p-2 shadow-2xl outline-none">
                <div v-for="t in TEAMS" :key="t" class="mb-2">
                    <p class="m-0 mb-1 text-xs font-semibold text-label">{{ TEAM_NAMES[t] }}</p>
                    <div class="flex flex-wrap gap-1">
                        <button v-for="r in rolesOf(t)" :key="r.id" type="button"
                            class="rounded-lg border border-border px-1.5 py-1 hover:border-border-glow hover:bg-subtle"
                            @click="pick(`[[role:${r.id}]]`)">
                            <RoleToken :role-id="r.id" :size="18" inline show-name />
                        </button>
                    </div>
                </div>
                <div v-if="seats.length">
                    <p class="m-0 mb-1 text-xs font-semibold text-label">座位</p>
                    <div class="flex flex-wrap gap-1">
                        <button v-for="s in seats" :key="s.index" type="button"
                            class="rounded-lg border border-border px-2 py-1 text-xs text-heading hover:border-border-glow hover:bg-subtle"
                            @click="pick(`[[seat:${s.index + 1}]]`)">{{ s.index + 1 }}號 {{ names[s.playerId] ?? '' }}</button>
                    </div>
                </div>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>

<script setup>
import { ref } from 'vue'
import { PopoverRoot, PopoverTrigger, PopoverPortal, PopoverContent } from 'reka-ui'
import RoleToken from './RoleToken.vue'
import GameIcon from './GameIcon.vue'
import { TEAMS } from '../data/constants.js'
import { TEAM_NAMES } from '../data/labels.js'
import { scriptState } from '../composables/useClocktower.js'

defineProps({
    seats: { type: Array, default: () => [] },
    names: { type: Object, default: () => ({}) },
    disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['pick'])
const open = ref(false)
const rolesOf = t => (scriptState.script?.roles ?? []).filter(r => r.team === t)
function pick(tag) {
    emit('pick', tag)
    open.value = false
}
</script>
