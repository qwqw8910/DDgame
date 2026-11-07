<template>
    <RoomEntry title="血染鐘樓" :eyebrow="`${MIN_SEATS} ～ ${MAX_SEATS} 位玩家＋1 位說書人`"
        tagline="暗流湧動劇本，線上魔典，真人說書人主持。"
        create-note="建立的人是房主，可以指定或隨機抽出說書人。"
        nickname-placeholder="和 Discord 相同的暱稱"
        capacity-label="座位數" :capacity-options="capacityOptions" :default-capacity="10"
        rules-title="開始前請注意" :rules="RULES" :create="createRoom" :join="joinRoom" />
</template>

<script setup>
import { useRouter } from 'vue-router'
import RoomEntry from '@/shared/components/room/RoomEntry.vue'
import { getOrCreatePlayerId, generateRoomId } from '@/shared/data/identity.js'
import { MIN_SEATS, MAX_SEATS } from '../data/constants.js'

const router = useRouter()

const capacityOptions = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => ({
    value: MIN_SEATS + i, label: `${MIN_SEATS + i} 位玩家（另加 1 位說書人）`,
}))

const RULES = [
    '公開討論在 Discord 語音，私聊與所有操作在這個網頁上。',
    '請使用和 Discord 相同的暱稱，方便大家對上座位。',
    '夜晚請關麥克風。',
    '不可出示角色牌或截圖。',
]

// 依房間系統統一規範：入口只做輸入驗證 + 路由跳轉，不碰 DB / Socket
function createRoom(nickname, seats) {
    getOrCreatePlayerId()
    router.push({ name: 'clocktower-room', query: { id: generateRoomId(), nickname, create: '1', seats } })
}

function joinRoom(code, nickname) {
    router.push({ name: 'clocktower-room', query: { id: code, nickname } })
}
</script>
