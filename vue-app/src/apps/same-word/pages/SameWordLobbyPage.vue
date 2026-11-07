<template>
    <RoomEntry title="同詞相遇" :eyebrow="`${MIN_PLAYERS} ～ ${MAX_PLAYERS} 人`"
        tagline="每題同時寫下第一個想到的詞，看誰跟誰最有默契。"
        create-note="計時與題目數量進房間後再調整。"
        :capacity-options="capacityOptions" :default-capacity="8"
        :rules="RULES" :create="createRoom" :join="joinRoom" />
</template>

<script setup>
import { useRouter } from 'vue-router'
import RoomEntry from '@/shared/components/room/RoomEntry.vue'
import { getOrCreatePlayerId, generateRoomId } from '@/shared/data/identity.js'
import { MIN_PLAYERS, MAX_PLAYERS } from '../data/constants.js'

const router = useRouter()

const capacityOptions = Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => ({
    value: MIN_PLAYERS + i, label: `最多 ${MIN_PLAYERS + i} 人`,
}))

const RULES = [
    '大家同時寫一個中文或英文詞，時間到一起揭曉。',
    '越早和別人寫出同一個詞，默契越高；始終沒配上的就是死對頭。',
    '最後只剩一人沒配對，就是「與眾不同」。',
]

// 依房間系統統一規範：入口只做輸入驗證 + 路由跳轉，不碰 DB / Socket
function createRoom(nickname, max) {
    getOrCreatePlayerId()
    router.push({ name: 'same-word-room', query: { id: generateRoomId(), nickname, create: '1', max } })
}

function joinRoom(code, nickname) {
    router.push({ name: 'same-word-room', query: { id: code, nickname } })
}
</script>
