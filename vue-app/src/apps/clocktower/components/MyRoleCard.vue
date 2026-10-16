<template>
    <!-- 我的角色 + 說書人給我的資訊紀錄（只有本人看得到；酒鬼看到的是假的鎮民） -->
    <component :is="collapsible ? 'details' : 'section'" class="w-full max-w-md rounded-xl border border-border bg-card p-3 text-left" :open="collapsible ? undefined : true">
        <component :is="collapsible ? 'summary' : 'div'" class="flex cursor-pointer items-center gap-2 text-sm font-semibold text-label">
            <RoleToken :role-id="me.roleId" :size="collapsible ? 24 : 48" /> 我的角色：{{ role?.name ?? '?' }}
            <span v-if="me.messages.length" class="text-xs font-normal text-body">（收到 {{ me.messages.length }} 則資訊）</span>
        </component>
        <p class="m-0 mt-2 text-sm leading-relaxed text-body">{{ role?.ability }}</p>
        <ol v-if="me.messages.length" class="m-0 mt-2 flex list-none flex-col gap-2 border-t border-divider p-0 pt-2">
            <li v-for="m in [...me.messages].reverse()" :key="m.id" class="rounded-lg bg-subtle px-2 py-1.5">
                <p class="m-0 mb-1 text-[11px] text-body">第 {{ m.dayNumber + (m.phase === 'night' ? 1 : 0) }} {{ m.phase === 'night' ? '夜' : '天' }}</p>
                <InfoMessage :message="m" :seats="view.seats" :names="view.names" />
            </li>
        </ol>
    </component>
</template>

<script setup>
import { computed } from 'vue'
import RoleToken from './RoleToken.vue'
import InfoMessage from './InfoMessage.vue'
import { roleInfo } from '../composables/useClocktower.js'

const props = defineProps({
    view: { type: Object, required: true },
    collapsible: { type: Boolean, default: false },
})
const me = computed(() => props.view.me)
const role = computed(() => roleInfo(me.value?.roleId))
</script>
