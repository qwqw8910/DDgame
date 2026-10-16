<template>
    <!-- 角色圖示：有圖顯示圖、沒圖（或載入失敗）顯示 emoji；外框顏色依陣營 -->
    <span :class="['inline-flex items-center gap-1.5 align-middle', inline ? '' : 'flex-col']" :title="title">
        <span class="relative inline-flex shrink-0 items-center justify-center rounded-full border-2 bg-card-solid"
            :style="{ width: `${size}px`, height: `${size}px`, borderColor: color, fontSize: `${Math.round(size * 0.55)}px` }">
            <img v-if="src && !broken" :src="src" :alt="name" class="h-full w-full rounded-full object-cover" draggable="false"
                @error="broken = true" />
            <span v-else aria-hidden="true" class="leading-none">{{ icon }}</span>
        </span>
        <span v-if="showName" :class="['leading-tight text-heading', inline ? 'text-sm' : 'text-xs text-center']">{{ name }}</span>
    </span>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ROLE_ASSETS, TEAM_ASSETS, UI_ASSETS, resolveImg } from '../data/assets.js'
import { roleInfo } from '../composables/useClocktower.js'

const props = defineProps({
    roleId: { type: String, default: null },
    size: { type: Number, default: 36 },
    showName: { type: Boolean, default: false },
    inline: { type: Boolean, default: false },
})

const broken = ref(false)
watch(() => props.roleId, () => { broken.value = false })

const info = computed(() => (props.roleId ? roleInfo(props.roleId) : null))
const entry = computed(() => (props.roleId ? ROLE_ASSETS[props.roleId] : null))
const team = computed(() => info.value?.team ?? null)
const name = computed(() => info.value?.name ?? entry.value?.name ?? (props.roleId ? props.roleId : '未知角色'))
const title = computed(() => (info.value ? `${info.value.name}：${info.value.ability}` : name.value))
// 優先順序：assets.js 的 img → 劇本 image → emoji → 陣營預設 icon
const src = computed(() => resolveImg('roles', props.roleId, entry.value) ?? info.value?.image ?? null)
const icon = computed(() => entry.value?.icon ?? TEAM_ASSETS[team.value]?.icon ?? UI_ASSETS.tokenBack.icon)
const color = computed(() => TEAM_ASSETS[team.value]?.color ?? 'var(--color-border-glow)')
</script>
