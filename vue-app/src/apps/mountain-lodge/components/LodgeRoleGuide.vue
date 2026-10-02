<template>
    <GameGuideModal :model-value="modelValue" title="🎭 角色介紹" confirm-text="關閉"
        @update:model-value="v => emit('update:modelValue', v)">
        <p class="m-0 text-sm text-body">每人只會拿到 1 張角色牌，其他人的牌在結算前都看不到。標示「本局出現」的是這一局牌組裡有的角色。</p>
        <ul class="list-none m-0 p-0 flex flex-col gap-3">
            <li v-for="r in entries" :key="r.kind"
                :class="['flex gap-3 p-2.5 rounded-xl border bg-card', r.active ? 'border-border-glow' : 'border-border opacity-80']">
                <div class="relative shrink-0 w-[72px] h-[100px] rounded-lg overflow-hidden border border-border bg-card-solid flex items-center justify-center">
                    <img v-if="r.img" :src="r.img" :alt="r.name" draggable="false" class="w-full h-full object-cover" />
                    <span v-else class="text-3xl" aria-hidden="true">{{ r.emoji }}</span>
                </div>
                <div class="min-w-0 flex flex-col gap-1 text-[13px] leading-snug text-body">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span class="text-base font-bold text-heading">{{ r.emoji }} {{ r.name }}</span>
                        <span class="text-xs text-label">{{ TEAM_NAMES[r.team] }}</span>
                        <span v-if="r.active" class="text-xs px-1.5 rounded-full bg-neon-purple/20 text-neon-purple-light">本局出現</span>
                    </div>
                    <p class="m-0"><strong class="text-heading">能力：</strong>{{ r.ability }}</p>
                    <p class="m-0"><strong class="text-heading">勝利：</strong>{{ r.win }}</p>
                    <p class="m-0 text-xs text-label">登場：{{ r.level }}</p>
                </div>
            </li>
        </ul>
    </GameGuideModal>
</template>

<script setup>
import { computed } from 'vue'
import GameGuideModal from '@/shared/components/GameGuideModal.vue'
import { ROLES, ROLE_GUIDE, GUEST_COLORS, TEAM_NAMES } from '../data/constants.js'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    // 本局牌組出現的角色（view.levelRoles）；大廳時為空
    activeRoles: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const entries = computed(() => ROLE_GUIDE.map(g => {
    const role = ROLES[g.kind]
    return {
        ...g,
        ...role,
        img: role.img ?? GUEST_COLORS.yellow.img,
        active: props.activeRoles.includes(g.kind),
    }
}))
</script>
