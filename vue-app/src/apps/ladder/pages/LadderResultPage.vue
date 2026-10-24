<template>
  <div class="lr">
    <RouterLink to="/ladder" class="lr-back">爬樓梯抽籤</RouterLink>

    <main class="lr-card">
      <template v-if="data">
        <p class="lr-eyebrow">AMIDAKUJI — 私人結果</p>
        <h1 class="lr-title">{{ data.f }}，<br />你抽到的是</h1>

        <button v-if="!open" class="lr-cover" @click="open = true">
          <span>點一下打開</span>
          <small>請確認旁邊沒有別人在看</small>
        </button>

        <div v-else class="lr-reveal">
          <p class="lr-label">要送給</p>
          <p class="lr-to">{{ data.t }}</p>
          <template v-if="data.a">
            <p class="lr-label">地址／備註</p>
            <p class="lr-addr">{{ data.a }}</p>
            <button class="lr-btn" @click="copy">{{ copied ? '已複製 ✓' : '複製地址' }}</button>
          </template>
          <button class="lr-btn ghost" @click="open = false">蓋起來</button>
        </div>
      </template>
      <template v-else>
        <h1 class="lr-title">連結無效</h1>
        <p class="lr-label">這條連結的內容不完整，請向舉辦人重新索取。</p>
      </template>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { decodePayload } from '../data/codec'

const route = useRoute()
const open = ref(false)
const copied = ref(false)

const data = computed(() => {
  const o = decodePayload(route.query.d)
  return o && o.t && o.f ? o : null
})

async function copy() {
  try {
    await navigator.clipboard.writeText(data.value.a)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1500)
  } catch {
    /* 不支援剪貼簿時，使用者可手動選取 */
  }
}
</script>

<style scoped>
.lr {
  --paper: #f3ede0; --ink: #1c1a17; --line: #b9ad98; --accent: #d9482b;
  height: 100vh; height: 100dvh; overflow-y: auto; box-sizing: border-box;
  padding: 72px 16px 48px; color: var(--ink);
  font-family: 'Zen Kaku Gothic New', 'Noto Sans TC', sans-serif;
  background:
    linear-gradient(rgba(185,173,152,.35) 1px, transparent 1px) 0 0 / 100% 40px,
    linear-gradient(90deg, rgba(185,173,152,.35) 1px, transparent 1px) 0 0 / 40px 100%,
    var(--paper);
}
.lr-back { position: fixed; top: 16px; left: 16px; font-size: 13px; color: var(--ink); text-decoration: none; padding: 6px 12px; border: 1px solid var(--ink); background: var(--paper); }
.lr-card { max-width: 480px; margin: 0 auto; border: 1px solid var(--ink); background: var(--paper); padding: 28px 24px; box-shadow: 6px 6px 0 var(--ink); }
.lr-eyebrow { font-size: 11px; letter-spacing: .3em; margin: 0 0 8px; color: var(--accent); }
.lr-title { font-family: 'Shippori Mincho', serif; font-weight: 800; font-size: 30px; line-height: 1.3; margin: 0 0 24px; }
.lr-cover { width: 100%; padding: 36px 12px; border: 1px dashed var(--ink); background: repeating-linear-gradient(45deg, var(--ink) 0 6px, #2c2924 6px 12px); color: var(--paper); font-family: 'Shippori Mincho', serif; font-size: 22px; font-weight: 700; letter-spacing: .3em; cursor: pointer; display: flex; flex-direction: column; gap: 8px; align-items: center; }
.lr-cover small { font-family: inherit; font-size: 12px; letter-spacing: .1em; font-weight: 500; }
.lr-label { font-size: 12px; letter-spacing: .2em; color: #5c5547; margin: 16px 0 4px; }
.lr-to { font-family: 'Shippori Mincho', serif; font-weight: 800; font-size: 40px; margin: 0; color: var(--accent); word-break: break-all; }
.lr-addr { margin: 0 0 16px; font-size: 18px; line-height: 1.7; padding: 12px; border-left: 4px solid var(--accent); background: rgba(255,255,255,.5); word-break: break-all; white-space: pre-wrap; }
.lr-btn { display: block; width: 100%; padding: 12px; margin-top: 10px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font: inherit; font-weight: 700; letter-spacing: .2em; cursor: pointer; }
.lr-btn.ghost { background: transparent; color: var(--ink); }
</style>
