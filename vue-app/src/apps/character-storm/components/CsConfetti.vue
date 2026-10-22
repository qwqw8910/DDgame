<template>
    <div class="cs-confetti" aria-hidden="true">
        <i v-for="p in pieces" :key="p.id" :style="p.style"></i>
    </div>
</template>

<script setup>
// 彩帶：純 CSS 動畫，掛載時隨機產生一次
const props = defineProps({ count: { type: Number, default: 70 } })

const COLORS = ['#06B6D4', '#F59E0B', '#A855F7', '#EC4899', '#22C55E', '#FDE68A', '#F8FAFC']

const pieces = Array.from({ length: props.count }, (_, id) => {
    const w = 6 + Math.random() * 7
    return {
        id,
        style: {
            '--x': `${Math.random() * 100}%`,
            '--dx': `${(Math.random() - 0.5) * 220}px`,
            '--r': `${(Math.random() - 0.5) * 1080}deg`,
            '--d': `${Math.random() * 0.5}s`,
            '--t': `${1.8 + Math.random() * 1.4}s`,
            '--w': `${w}px`,
            '--h': `${Math.random() > 0.5 ? w * 0.45 : w}px`,
            '--c': COLORS[id % COLORS.length],
            borderRadius: Math.random() > 0.7 ? '50%' : '2px',
        },
    }
})
</script>
