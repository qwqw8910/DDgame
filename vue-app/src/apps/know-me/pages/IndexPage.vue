<template>
    <RoomEntry title="懂我再說" eyebrow="2 ～ 12 人" tagline="輪流當被猜的人，看看朋友有多了解你。"
        create-note="誰才是最懂你的人？建好房間後把連結傳給朋友。"
        :capacity-options="capacityOptions" :default-capacity="8"
        :rules="RULES" :create="createRoom" :join="joinRoom" />
</template>

<script setup>
import { useRouter } from 'vue-router'
import RoomEntry from '@/shared/components/room/RoomEntry.vue'
import { getOrCreatePlayerId, generateRoomId } from '@/shared/data/identity.js'
import { DB } from '../data/db.js'

const router = useRouter()

const capacityOptions = Array.from({ length: 11 }, (_, i) => ({ value: i + 2, label: `最多 ${i + 2} 人` }))

const RULES = [
    '每回合抽一位被猜的人，他先選一個主題，再悄悄選下自己的答案。',
    '其他人猜他會選哪一個，猜中就得分。',
    '全部揭曉後換下一位，看誰最懂誰。',
]

// 懂我再說的房間先寫進資料庫，再進房間頁連線
async function createRoom(nickname, maxPlayers) {
    const roomId = generateRoomId()
    try {
        await DB.createRoom(roomId, getOrCreatePlayerId(), maxPlayers)
    } catch (err) {
        throw new Error(`建立失敗：${err.message}`)
    }
    router.push({ name: 'room', query: { id: roomId, nickname } })
}

async function joinRoom(code, nickname) {
    try {
        await DB.getRoom(code)
    } catch (err) {
        const notFound = (err.message || '').includes('No rows') || err.code === 'PGRST116'
        throw new Error(notFound ? '找不到這個房間，請確認房間代碼' : `加入失敗：${err.message}`)
    }
    router.push({ name: 'room', query: { id: code, nickname } })
}
</script>
