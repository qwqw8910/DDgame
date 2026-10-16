<template>
    <!-- 劇本角色一覽（所有人可看） -->
    <CtDialog :open="open" :title="`${script?.name ?? '劇本'}・角色一覽`" wide @close="$emit('close')">
        <div v-if="script" class="flex flex-col gap-4">
            <section v-for="t in TEAMS" :key="t">
                <h3 class="m-0 mb-2 flex items-center gap-1 text-base font-bold text-heading"><GameIcon kind="team" :id="t" :size="18" /> {{ TEAM_NAMES[t] }}</h3>
                <ul class="m-0 flex list-none flex-col gap-2 p-0">
                    <li v-for="r in script.roles.filter(x => x.team === t)" :key="r.id"
                        :class="['flex items-start gap-2 rounded-lg px-2 py-1.5', r.id === myRoleId ? 'bg-neon-cyan/10 ring-1 ring-neon-cyan' : 'bg-subtle']">
                        <RoleToken :role-id="r.id" :size="34" />
                        <div class="min-w-0">
                            <p class="m-0 font-semibold text-heading">{{ r.name }}<span v-if="r.id === myRoleId" class="ml-1 text-xs text-neon-cyan">（你）</span></p>
                            <p class="m-0 text-sm leading-relaxed text-body">{{ r.ability }}</p>
                        </div>
                    </li>
                </ul>
            </section>
            <p class="m-0 text-xs text-body">＊ 表示「首夜除外」。角色譯名以集石官方中譯為準。</p>
        </div>
    </CtDialog>
</template>

<script setup>
import CtDialog from './CtDialog.vue'
import RoleToken from './RoleToken.vue'
import GameIcon from './GameIcon.vue'
import { TEAMS } from '../data/constants.js'
import { TEAM_NAMES } from '../data/labels.js'

defineProps({
    open: { type: Boolean, default: false },
    script: { type: Object, default: null },
    myRoleId: { type: String, default: null },
})
defineEmits(['close'])
</script>
