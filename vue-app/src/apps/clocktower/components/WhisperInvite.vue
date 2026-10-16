<template>
    <!-- 私聊邀請彈窗：30 秒沒回應自動過期 -->
    <CtDialog :open="!!invite" title="私聊邀請" :dismissable="false">
        <template v-if="invite">
            <p class="m-0 mb-2 text-heading">
                <GameIcon id="whisper" :size="18" /> <strong>{{ names[invite.from] ?? '?' }}</strong> 邀請你私聊
            </p>
            <p v-if="inGroup" class="m-0 mb-2 rounded-lg border border-lemon/40 bg-lemon/10 px-2 py-1 text-sm text-heading">
                <GameIcon id="warn" :size="14" /> 接受將離開目前的私聊
            </p>
            <p class="m-0 text-sm text-body">{{ Math.ceil(remaining) }} 秒後過期</p>
        </template>
        <template #footer>
            <div class="flex gap-2">
                <button class="btn-secondary flex-1" @click="$emit('respond', invite.id, false)">拒絕</button>
                <button class="btn-primary flex-1" @click="$emit('respond', invite.id, true)">加入</button>
            </div>
        </template>
    </CtDialog>
</template>

<script setup>
import { computed } from 'vue'
import CtDialog from './CtDialog.vue'
import GameIcon from './GameIcon.vue'

const props = defineProps({
    invite: { type: Object, default: null },
    names: { type: Object, default: () => ({}) },
    inGroup: { type: Boolean, default: false },
    now: { type: Number, default: () => Date.now() }, // 已校正為伺服器時間
})
defineEmits(['respond'])
const remaining = computed(() => (props.invite ? Math.max(0, (props.invite.expiresAt - props.now) / 1000) : 0))
</script>
