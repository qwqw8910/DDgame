<template>
    <RoomEntry title="點格棋" eyebrow="2 人對戰"
        tagline="輪流畫線，圍成一格就是你的。可以選 4×4 或 5×5，普通或進階計分。"
        create-note="盤面大小與計分模式進房間後再選。"
        :rules="RULES" :create="createRoom" :join="joinRoom" />
</template>

<script setup>
import { useRouter } from 'vue-router'
import RoomEntry from '@/shared/components/room/RoomEntry.vue'
import { getOrCreatePlayerId, generateRoomId } from '@/shared/data/identity.js'

const router = useRouter()

const RULES = [
    '兩人輪流在相鄰兩點之間畫一條線。',
    '畫下某一格的最後一條邊，就拿下那一格，而且可以再畫一條。',
    '畫出第 3 條邊等於把格子送給對手，盡量避開。',
    '普通模式一格一分；進階模式每格有 1–5 分，總分最高的人獲勝。',
]

// 依房間系統統一規範：入口只做輸入驗證 + 路由跳轉，不碰 DB / Socket
function createRoom(nickname) {
    getOrCreatePlayerId()
    router.push({ name: 'dots-boxes-room', query: { id: generateRoomId(), nickname, create: '1' } })
}

function joinRoom(code, nickname) {
    router.push({ name: 'dots-boxes-room', query: { id: code, nickname } })
}
</script>
