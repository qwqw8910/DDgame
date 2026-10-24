<template>
  <div class="ld">
    <RouterLink to="/" class="ld-back">← 甜甜的小秘密</RouterLink>

    <header class="ld-head">
      <p class="ld-eyebrow">AMIDAKUJI — 阿彌陀籤</p>
      <h1 class="ld-title">爬樓梯抽籤</h1>
      <p class="ld-sub">每個人都有一個配對，<br class="sp" />順著線往下走，遇到岔路就轉彎。</p>
      <span class="ld-vertical" aria-hidden="true">運命の階段</span>
    </header>

    <!-- ① 設定 -->
    <section v-if="phase === 'setup'" class="ld-card">
      <div class="ld-row">
        <span class="ld-label">人數</span>
        <div class="ld-stepper">
          <button @click="setCount(count - 1)" :disabled="count <= MIN" aria-label="減少">−</button>
          <b>{{ count }}</b>
          <button @click="setCount(count + 1)" :disabled="count >= MAX" aria-label="增加">＋</button>
        </div>
      </div>

      <div class="ld-grid">
        <div v-for="i in count" :key="i" class="ld-slot" :style="{ '--c': colorOf(i - 1) }">
          <span class="ld-no">{{ String(i).padStart(2, '0') }}</span>
          <input v-model="names[i - 1]" :placeholder="`人名 ${i}`" maxlength="8" />
          <span class="ld-arrow">↓</span>
          <input v-model="prizes[i - 1]" :placeholder="`結果 ${i}`" maxlength="10" />
        </div>
      </div>

      <button class="ld-primary" @click="build">建立樓梯</button>
    </section>

    <!-- ② 樓梯 -->
    <section v-else class="ld-stage">
      <div class="ld-scroll">
        <div class="ld-board" :style="{ width: boardW + 'px' }">
          <div class="ld-names">
            <button v-for="i in count" :key="i" class="ld-name"
              :class="{ on: selected.has(i - 1), done: results[i - 1] != null }"
              :style="{ '--c': colorOf(i - 1), width: colW + 'px' }"
              :disabled="running" @click="toggle(i - 1)">
              {{ label(names, i - 1, '人') }}
            </button>
          </div>

          <svg :viewBox="`0 0 ${boardW} ${H}`" :width="boardW" :height="H" class="ld-svg">
            <line v-for="c in count" :key="'v' + c" :x1="x(c - 1)" :y1="PAD" :x2="x(c - 1)" :y2="H - PAD"
              class="ld-rail" />
            <line v-for="(r, k) in rungs" :key="'r' + k" :x1="x(r.col)" :x2="x(r.col + 1)" :y1="y(r.row)"
              :y2="y(r.row)" class="ld-rung" />
            <g v-for="p in paths" :key="'p' + p.id">
              <path :d="p.d" fill="none" :stroke="colorOf(p.id)" stroke-width="5" stroke-linecap="round"
                stroke-linejoin="round" :ref="el => setPathEl(p.id, el)" :stroke-dasharray="p.len"
                :stroke-dashoffset="p.len - p.shown" />
              <circle v-if="p.shown > 0" :cx="p.dot[0]" :cy="p.dot[1]" r="9" :fill="colorOf(p.id)" class="ld-dot" />
            </g>
          </svg>

          <div class="ld-prizes">
            <div v-for="i in count" :key="i" class="ld-prize" :style="{ width: colW + 'px' }"
              :class="{ hit: hitSet.has(i - 1) }">
              {{ label(prizes, i - 1, '結果') }}
              <small v-if="owner[i - 1] != null" :style="{ color: colorOf(owner[i - 1]) }">
                ← {{ label(names, owner[i - 1], '人') }}
              </small>
            </div>
          </div>
        </div>
      </div>

      <!-- 底部操作：選擇人數 -->
      <div class="ld-dock">
        <p class="ld-dock-t">點上方名字選擇要爬的人（可多選），再按開始：</p>
        <div class="ld-dock-row">
          <button class="ld-chip" :disabled="running" @click="selectAll">全選</button>
          <button class="ld-chip" :disabled="running" @click="selected = new Set()">清除</button>
          <button class="ld-chip" :disabled="running" @click="shuffleRungs">重新生成樓梯</button>
          <button class="ld-chip" :disabled="running" @click="backToSetup">修改設定</button>
        </div>
        <button class="ld-primary" :disabled="running || !selected.size" @click="go">
          {{ running ? '爬樓梯中…' : `開始爬（${selected.size} 人）` }}
        </button>
      </div>

      <div v-if="doneList.length" class="ld-result">
        <h2>配對結果</h2>
        <ul>
          <li v-for="id in doneList" :key="id" :style="{ '--c': colorOf(id) }">
            <b>{{ label(names, id, '人') }}</b><i>→</i><span>{{ label(prizes, results[id], '結果') }}</span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onBeforeUnmount } from 'vue'

const MIN = 2, MAX = 12
const PAD = 16, ROWS = 12, ROW_H = 34
const H = PAD * 2 + (ROWS + 1) * ROW_H
const COLORS = ['#d9482b', '#2f5d8a', '#c79a1d', '#4f7a54', '#8a4f7d', '#d9779a', '#2b8a8a', '#7a5a3a', '#5a5ad9', '#8a8a2b', '#d97a2b', '#444444']
const colorOf = i => COLORS[i % COLORS.length]

const phase = ref('setup')
const count = ref(4)
const names = reactive(Array(MAX).fill(''))
const prizes = reactive(Array(MAX).fill(''))
const rungs = ref([])
const selected = ref(new Set())
const results = reactive({}) // playerId -> prize index
const paths = ref([])
const running = ref(false)
const pathEls = {}
let raf = 0

const colW = computed(() => Math.max(72, Math.min(120, Math.floor(340 / count.value) + 40)))
const boardW = computed(() => colW.value * count.value)
const x = c => colW.value * c + colW.value / 2
const y = r => PAD + (r + 1) * ROW_H

const label = (arr, i, fb) => (arr[i] || '').trim() || `${fb} ${i + 1}`
const setCount = n => { count.value = Math.min(MAX, Math.max(MIN, n)) }
const setPathEl = (id, el) => { if (el) pathEls[id] = el }

const owner = computed(() => {
  const o = {}
  for (const id in results) o[results[id]] = Number(id)
  return o
})
const hitSet = computed(() => new Set(Object.values(results)))
const doneList = computed(() => Object.keys(results).map(Number).sort((a, b) => a - b))

function genRungs() {
  const n = count.value
  const out = []
  for (let r = 0; r < ROWS; r++) {
    let c = 0
    while (c < n - 1) {
      if (Math.random() < 0.4) { out.push({ row: r, col: c }); c += 2 } else c++
    }
  }
  // 每個間隔至少一條橫線，避免有人直直走到底
  for (let c = 0; c < n - 1; c++) {
    if (out.some(o => o.col === c)) continue
    const ok = []
    for (let r = 0; r < ROWS; r++) {
      if (!out.some(o => o.row === r && Math.abs(o.col - c) <= 1)) ok.push(r)
    }
    if (ok.length) out.push({ row: ok[Math.floor(Math.random() * ok.length)], col: c })
  }
  return out
}

function trace(start) {
  const pts = [[x(start), PAD]]
  let col = start
  for (let r = 0; r < ROWS; r++) {
    const right = rungs.value.some(o => o.row === r && o.col === col)
    const left = rungs.value.some(o => o.row === r && o.col === col - 1)
    const t = right ? col + 1 : left ? col - 1 : col
    if (t !== col) {
      pts.push([x(col), y(r)], [x(t), y(r)])
      col = t
    }
  }
  pts.push([x(col), H - PAD])
  return { end: col, d: 'M' + pts.map(p => p.join(' ')).join(' L') }
}

function resetRun() {
  cancelAnimationFrame(raf)
  Object.keys(results).forEach(k => delete results[k])
  paths.value = []
  selected.value = new Set()
  running.value = false
}
function build() {
  resetRun()
  rungs.value = genRungs()
  phase.value = 'play'
}
function shuffleRungs() {
  resetRun()
  rungs.value = genRungs()
}
function backToSetup() {
  resetRun()
  phase.value = 'setup'
}
function toggle(i) {
  if (running.value || results[i] != null) return
  const s = new Set(selected.value)
  if (s.has(i)) s.delete(i)
  else s.add(i)
  selected.value = s
}
function selectAll() {
  selected.value = new Set([...Array(count.value).keys()].filter(i => results[i] == null))
}

function go() {
  const ids = [...selected.value].filter(i => results[i] == null)
  if (!ids.length) return
  running.value = true
  const traced = ids.map(id => ({ id, ...trace(id) }))
  paths.value = [
    ...paths.value.filter(p => !ids.includes(p.id)),
    ...traced.map(t => ({ id: t.id, d: t.d, len: 1, shown: 0, dot: [x(t.id), PAD] })),
  ]
  // 等 DOM 渲染出 path 後再量長度
  requestAnimationFrame(() => {
    for (const p of paths.value) {
      if (ids.includes(p.id) && pathEls[p.id]) p.len = pathEls[p.id].getTotalLength()
    }
    const SPEED = 260 // px / sec
    const t0 = performance.now()
    const tick = now => {
      const dist = ((now - t0) / 1000) * SPEED
      let alive = false
      for (const p of paths.value) {
        if (!ids.includes(p.id)) continue
        p.shown = Math.min(dist, p.len)
        const pt = pathEls[p.id].getPointAtLength(p.shown)
        p.dot = [pt.x, pt.y]
        if (p.shown < p.len) alive = true
      }
      if (alive) raf = requestAnimationFrame(tick)
      else {
        for (const t of traced) results[t.id] = t.end
        selected.value = new Set()
        running.value = false
      }
    }
    raf = requestAnimationFrame(tick)
  })
}

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<style>
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');
</style>

<style scoped>
.ld {
  --paper: #f3ede0; --ink: #1c1a17; --line: #b9ad98; --accent: #d9482b;
  min-height: 100vh; padding: 72px 16px 64px; color: var(--ink);
  font-family: 'Zen Kaku Gothic New', 'Noto Sans TC', sans-serif;
  background:
    linear-gradient(rgba(185,173,152,.35) 1px, transparent 1px) 0 0 / 100% 40px,
    linear-gradient(90deg, rgba(185,173,152,.35) 1px, transparent 1px) 0 0 / 40px 100%,
    var(--paper);
  position: relative; overflow-x: hidden;
}
.ld-back { position: fixed; top: 16px; left: 16px; z-index: 10; font-size: 13px; color: var(--ink); text-decoration: none; padding: 6px 12px; border: 1px solid var(--ink); background: var(--paper); }
.ld-head { max-width: 760px; margin: 0 auto 32px; position: relative; }
.ld-eyebrow { font-size: 11px; letter-spacing: .3em; margin: 0 0 8px; color: var(--accent); }
.ld-title { font-family: 'Shippori Mincho', serif; font-weight: 800; font-size: clamp(40px, 9vw, 72px); line-height: 1.05; margin: 0 0 12px; letter-spacing: .04em; }
.ld-sub { margin: 0; font-size: 14px; line-height: 1.9; }
.ld-vertical { position: absolute; right: 0; top: 0; writing-mode: vertical-rl; font-family: 'Shippori Mincho', serif; font-size: 20px; letter-spacing: .4em; border-right: 2px solid var(--accent); padding-right: 10px; }
.sp { display: none; }

.ld-card, .ld-stage { max-width: 760px; margin: 0 auto; }
.ld-card { border: 1px solid var(--ink); background: var(--paper); padding: 24px; box-shadow: 6px 6px 0 var(--ink); }
.ld-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.ld-label { font-family: 'Shippori Mincho', serif; font-weight: 700; font-size: 18px; }
.ld-stepper { display: flex; align-items: center; gap: 14px; }
.ld-stepper b { font-family: 'Shippori Mincho', serif; font-size: 32px; min-width: 40px; text-align: center; }
.ld-stepper button { width: 36px; height: 36px; border: 1px solid var(--ink); background: transparent; color: var(--ink); font-size: 18px; cursor: pointer; }
.ld-stepper button:hover:not(:disabled) { background: var(--ink); color: var(--paper); }
button:disabled { opacity: .35; cursor: not-allowed; }

.ld-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px; }
.ld-slot { border: 1px solid var(--ink); border-top: 4px solid var(--c); padding: 8px; display: flex; flex-direction: column; gap: 4px; background: rgba(255,255,255,.4); }
.ld-no { font-family: 'Shippori Mincho', serif; font-size: 11px; color: var(--c); letter-spacing: .15em; }
.ld-slot input { border: none; border-bottom: 1px dashed var(--ink); background: transparent; padding: 6px 2px; font: inherit; font-size: 14px; color: var(--ink); outline: none; width: 100%; box-sizing: border-box; }
.ld-slot input:focus { border-bottom: 1px solid var(--accent); }
.ld-arrow { text-align: center; font-size: 12px; color: var(--line); }

.ld-primary { width: 100%; padding: 14px; border: 1px solid var(--ink); background: var(--ink); color: var(--paper); font-family: 'Shippori Mincho', serif; font-weight: 700; font-size: 17px; letter-spacing: .3em; cursor: pointer; transition: background .2s, transform .2s; }
.ld-primary:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); transform: translateY(-2px); }

.ld-scroll { overflow-x: auto; border: 1px solid var(--ink); background: var(--paper); padding: 12px 0; }
.ld-board { margin: 0 auto; min-width: 100%; }
.ld-names, .ld-prizes { display: flex; }
.ld-name { border: none; border-bottom: 3px solid var(--c); background: transparent; padding: 8px 4px; font-family: 'Shippori Mincho', serif; font-weight: 700; font-size: 15px; color: var(--ink); cursor: pointer; transition: all .2s; word-break: break-all; }
.ld-name.on { background: var(--c); color: #fff; }
.ld-name.done { opacity: .55; }
.ld-svg { display: block; }
.ld-rail { stroke: var(--ink); stroke-width: 2; }
.ld-rung { stroke: var(--ink); stroke-width: 2; }
.ld-dot { stroke: var(--paper); stroke-width: 3; }
.ld-prize { text-align: center; padding: 8px 4px; font-size: 14px; font-weight: 500; border-top: 3px solid var(--ink); word-break: break-all; transition: all .3s; display: flex; flex-direction: column; gap: 2px; box-sizing: border-box; }
.ld-prize small { font-size: 11px; font-weight: 700; }
.ld-prize.hit { background: var(--ink); color: var(--paper); }

.ld-dock { margin-top: 20px; border: 1px solid var(--ink); padding: 16px; background: var(--paper); box-shadow: 6px 6px 0 var(--ink); }
.ld-dock-t { margin: 0 0 10px; font-size: 13px; }
.ld-dock-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.ld-chip { border: 1px solid var(--ink); background: transparent; color: var(--ink); padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; border-radius: 999px; }
.ld-chip:hover:not(:disabled) { background: var(--ink); color: var(--paper); }

.ld-result { margin-top: 28px; }
.ld-result h2 { font-family: 'Shippori Mincho', serif; font-size: 22px; margin: 0 0 12px; border-left: 4px solid var(--accent); padding-left: 10px; }
.ld-result ul { list-style: none; padding: 0; margin: 0 0 12px; }
.ld-result li { display: flex; gap: 12px; align-items: baseline; padding: 10px 0; border-bottom: 1px dashed var(--ink); animation: ld-in .5s both; }
.ld-result li b { color: var(--c); font-family: 'Shippori Mincho', serif; font-size: 18px; }
.ld-result li i { font-style: normal; color: var(--line); }
@keyframes ld-in { from { opacity: 0; transform: translateX(-12px); } }

@media (max-width: 560px) {
  .sp { display: inline; }
  .ld-vertical { display: none; }
}
</style>
