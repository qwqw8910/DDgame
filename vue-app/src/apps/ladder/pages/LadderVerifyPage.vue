<template>
  <div class="lv">
    <RouterLink to="/ladder" class="lv-back">爬樓梯抽籤</RouterLink>

    <main class="lv-card">
      <template v-if="pairs">
        <p class="lv-eyebrow">AMIDAKUJI — 驗證清單</p>
        <h1 class="lv-title">送禮配對總覽</h1>
        <p class="lv-note">給沒有參加抽籤的人核對用。勾選「已確認」「已寄出」只會記在這台裝置，不會同步給別人。</p>

        <p class="lv-sum">
          配對 {{ pairs.length }} 組 ·
          <span :class="selfCount ? 'bad' : 'ok'">{{ selfCount ? `有 ${selfCount} 人抽到自己 ✗` : '無人抽到自己 ✓' }}</span> ·
          <span :class="dupCount ? 'bad' : 'ok'">{{ dupCount ? '有人被重複抽中 ✗' : '每人恰被抽中一次 ✓' }}</span>
        </p>

        <ul class="lv-list">
          <li v-for="(p, i) in pairs" :key="i" :class="{ done: state[i]?.sent }">
            <div class="lv-pair"><b>{{ p.f }}</b><i>送給</i><b class="to">{{ p.t }}</b></div>
            <p v-if="p.a" class="lv-addr">{{ p.a }}</p>
            <div class="lv-checks">
              <label><input type="checkbox" v-model="state[i].ok" /> 已確認</label>
              <label><input type="checkbox" v-model="state[i].sent" /> 已寄出</label>
            </div>
          </li>
        </ul>
        <p class="lv-prog">已寄出 {{ sentCount }} / {{ pairs.length }}</p>
      </template>
      <template v-else>
        <h1 class="lv-title">連結無效</h1>
        <p class="lv-note">這條連結的內容不完整，請向舉辦人重新索取。</p>
      </template>
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import { decodePayload } from '../data/codec'

const route = useRoute()
const data = computed(() => decodePayload(route.query.d))
const pairs = computed(() => (Array.isArray(data.value?.p) ? data.value.p : null))

const KEY = 'ladder-verify:' + String(route.query.d || '').slice(0, 64)
let saved = []
try { saved = JSON.parse(localStorage.getItem(KEY) || '[]') } catch { /* 無法讀取就從空白開始 */ }
const state = reactive((pairs.value || []).map((_, i) => ({ ok: !!saved[i]?.ok, sent: !!saved[i]?.sent })))
watch(state, v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* 忽略 */ } }, { deep: true })

const selfCount = computed(() => (pairs.value || []).filter(p => p.f === p.t).length)
const dupCount = computed(() => {
  const t = (pairs.value || []).map(p => p.t)
  return new Set(t).size !== t.length
})
const sentCount = computed(() => state.filter(s => s.sent).length)
</script>

<style scoped>
.lv {
  --paper: #f3ede0; --ink: #1c1a17; --line: #b9ad98; --accent: #d9482b;
  height: 100vh; height: 100dvh; overflow-y: auto; box-sizing: border-box;
  padding: 72px 16px 64px; color: var(--ink);
  font-family: 'Zen Kaku Gothic New', 'Noto Sans TC', sans-serif;
  background:
    linear-gradient(rgba(185,173,152,.35) 1px, transparent 1px) 0 0 / 100% 40px,
    linear-gradient(90deg, rgba(185,173,152,.35) 1px, transparent 1px) 0 0 / 40px 100%,
    var(--paper);
}
.lv-back { position: fixed; top: 16px; left: 16px; font-size: 13px; color: var(--ink); text-decoration: none; padding: 6px 12px; border: 1px solid var(--ink); background: var(--paper); }
.lv-card { max-width: 640px; margin: 0 auto; border: 1px solid var(--ink); background: var(--paper); padding: 24px; box-shadow: 6px 6px 0 var(--ink); }
.lv-eyebrow { font-size: 11px; letter-spacing: .3em; margin: 0 0 8px; color: var(--accent); }
.lv-title { font-family: 'Shippori Mincho', serif; font-weight: 800; font-size: 30px; margin: 0 0 12px; }
.lv-note { font-size: 13px; line-height: 1.7; color: #5c5547; margin: 0 0 12px; }
.lv-sum { font-size: 14px; font-weight: 700; margin: 0 0 16px; padding: 8px 0; border-top: 1px solid var(--ink); border-bottom: 1px solid var(--ink); }
.ok { color: #2f7a46; }
.bad { color: var(--accent); }
.lv-list { list-style: none; padding: 0; margin: 0; }
.lv-list li { padding: 14px 0; border-bottom: 1px dashed var(--ink); }
.lv-list li.done { opacity: .55; }
.lv-pair { display: flex; align-items: baseline; gap: 10px; font-family: 'Shippori Mincho', serif; font-size: 20px; }
.lv-pair i { font-style: normal; font-size: 12px; color: #5c5547; }
.lv-pair .to { color: var(--accent); }
.lv-addr { margin: 8px 0; padding: 8px 12px; border-left: 4px solid var(--accent); background: rgba(255,255,255,.5); white-space: pre-wrap; word-break: break-all; font-size: 14px; line-height: 1.6; }
.lv-checks { display: flex; gap: 20px; font-size: 13px; margin-top: 6px; }
.lv-checks label { display: flex; gap: 6px; align-items: center; cursor: pointer; }
.lv-checks input { accent-color: var(--accent); }
.lv-prog { margin: 14px 0 0; font-weight: 700; }
</style>
