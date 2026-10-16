<template>
    <!-- 玩家收到「請選擇目標」（choose-player）或「你得知…」彈窗。夜晚所有人畫面相同，彈窗疊在入夜畫面上 -->
    <CtDialog :open="!!prompt" title="說書人喚醒了你" :dismissable="false">
        <div v-if="prompt" class="flex flex-col gap-3">
            <div class="flex items-center gap-2">
                <RoleToken :role-id="prompt.roleId" :size="40" />
                <p class="m-0 text-heading">請選擇 <strong>{{ prompt.count }}</strong> 位玩家{{ prompt.notSelf ? '（不能選自己）' : '' }}</p>
            </div>
            <p v-if="prompt.text" class="m-0 whitespace-pre-wrap rounded-lg bg-subtle px-2 py-1 text-sm text-heading">{{ prompt.text }}</p>
            <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                <button v-for="s in options" :key="s.index" type="button" :disabled="s.disabled"
                    :class="['rounded-lg border px-2 py-2 text-sm font-semibold', picked.includes(s.index) ? 'border-neon-cyan bg-neon-cyan/15 text-heading' : 'border-border text-label', s.disabled ? 'opacity-40' : 'hover:border-border-glow']"
                    @click="toggle(s.index)">{{ s.index + 1 }}. {{ names[s.playerId] ?? '' }}</button>
            </div>
        </div>
        <template #footer>
            <button class="btn-primary btn-full" :disabled="picked.length !== prompt?.count" @click="submit">確定（{{ picked.length }}/{{ prompt?.count }}）</button>
        </template>
    </CtDialog>

    <CtDialog :open="!prompt && !!info" title="你得知…" @close="$emit('close-info')">
        <InfoMessage v-if="info" :message="info" :seats="seats" :names="names" />
        <template #footer>
            <button class="btn-primary btn-full" @click="$emit('close-info')">知道了</button>
        </template>
    </CtDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import CtDialog from './CtDialog.vue'
import RoleToken from './RoleToken.vue'
import InfoMessage from './InfoMessage.vue'

const props = defineProps({
    prompt: { type: Object, default: null },
    info: { type: Object, default: null },
    seats: { type: Array, default: () => [] },
    names: { type: Object, default: () => ({}) },
})
const emit = defineEmits(['reply', 'close-info'])

const picked = ref([])
watch(() => props.prompt?.id, () => { picked.value = [] })
const options = computed(() => props.seats.map(s => ({
    ...s, disabled: s.hasLeft || (props.prompt?.notSelf && s.index === props.prompt.seat),
})))
function toggle(i) {
    if (picked.value.includes(i)) picked.value = picked.value.filter(x => x !== i)
    else if (picked.value.length < props.prompt.count) picked.value = [...picked.value, i]
}
function submit() {
    emit('reply', props.prompt.id, [...picked.value])
}
</script>
