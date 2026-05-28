<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// ── 食物資料 ──────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'noodle',  name: '麵食類',     emoji: '🍜' },
  { id: 'rice',    name: '飯食類',     emoji: '🍚' },
  { id: 'hotpot',  name: '鍋物/湯品類', emoji: '🍲' },
  { id: 'foreign', name: '異國料理類', emoji: '🌏' },
  { id: 'light',   name: '輕食/小吃類', emoji: '🥗' },
]

const FOOD_ITEMS = {
  noodle:  ['牛肉麵','陽春麵','拉麵','烏龍麵','越南河粉','義大利麵','炸醬麵','肉燥乾麵','涼麵','炒泡麵'],
  rice:    ['排骨便當','雞腿便當','燒臘飯','炒飯','咖哩飯','親子丼','滷肉飯','海南雞飯'],
  hotpot:  ['小火鍋','吃到飽火鍋','壽喜燒','酸菜白肉鍋','廣東粥','鹹粥','藥膳排骨','牛肉湯','酸辣湯'],
  foreign: ['壽司','生魚片丼飯','韓式烤肉','部隊鍋','石鍋拌飯','漢堡','披薩','墨西哥捲餅','泰式酸辣湯','印度咖哩與烤餅'],
  light:   ['水餃','牛肉捲餅','滷味','鹹酥雞','麵線','雞胸肉沙拉','地瓜餐','Poke（夏威夷波奇飯）'],
}

// 全部食物的扁平陣列（盲選用）
const ALL_FOODS = Object.entries(FOOD_ITEMS).flatMap(([catId, items]) =>
  items.map(item => ({ catId, item }))
)

// ── URL 名稱 ──────────────────────────────────────────────────
const guestName = ref('神秘嘉賓')

onMounted(() => {
  const raw = new URLSearchParams(window.location.search).get('name')
    || new URLSearchParams(window.location.hash.includes('?')
        ? window.location.hash.split('?')[1]
        : '').get('name')
  if (raw) {
    try { guestName.value = decodeURIComponent(raw) }
    catch { guestName.value = raw }
  }
})

// ── 階段狀態 ──────────────────────────────────────────────────
// 'invite' | 'category' | 'item' | 'result'
const step = ref('invite')

// ── 階段 1：邀請互動 ──────────────────────────────────────────
const rejectCount   = ref(0)
const easterEgg     = ref(false)   // 5 次後顯示彩蛋訊息
const rejectHidden  = ref(false)   // 彩蛋後隱藏拒絕按鈕

// 第一次點擊後才進入逃跑模式
const hasEscaped = computed(() => rejectCount.value > 0)

// 拒絕按鈕位置：初始 relative 居中，第一次點擊後改 absolute 在 arena 內移動
const rejectStyle = ref({
  position: 'relative',
})

function randomPct(min, max) {
  return `${Math.floor(Math.random() * (max - min) + min)}%`
}

function runRejectButton() {
  if (rejectHidden.value) return
  rejectCount.value++

  if (rejectCount.value >= 5) {
    easterEgg.value  = true
    rejectHidden.value = true
    return
  }

  // arena 固定高 160px，按鈕約 44px → top 最多 ~60%；left 限制讓按鈕不超出右邊
  rejectStyle.value = {
    position: 'absolute',
    top:  randomPct(5, 55),
    left: randomPct(5, 60),
    transition: 'all 0.2s ease',
  }
}

function acceptInvite() {
  step.value = 'category'
}

// ── 階段 2：食物選擇 ──────────────────────────────────────────
const selectedCat   = ref(null)   // 已選類別物件
const selectedFood  = ref(null)   // 已選食物文字

function pickCategory(cat) {
  selectedCat.value  = cat
  selectedFood.value = null
  step.value = 'item'
}

function pickFood(food) {
  selectedFood.value = food
  step.value = 'result'
}

// 盲選：拉霸特效
const isSlotting     = ref(false)
const slotDisplay    = ref('')
let   slotTimer      = null
let   slotStopTimer  = null

function startSlot() {
  if (isSlotting.value) return
  isSlotting.value = true
  selectedCat.value = null

  let i = 0
  slotTimer = setInterval(() => {
    const rand  = ALL_FOODS[Math.floor(Math.random() * ALL_FOODS.length)]
    slotDisplay.value = rand.item
    i++
  }, 80)

  slotStopTimer = setTimeout(() => {
    clearInterval(slotTimer)
    isSlotting.value = false
    const winner = ALL_FOODS[Math.floor(Math.random() * ALL_FOODS.length)]
    slotDisplay.value    = winner.item
    selectedCat.value    = CATEGORIES.find(c => c.id === winner.catId)
    selectedFood.value   = winner.item
    step.value = 'result'
  }, 3000)
}

onUnmounted(() => {
  clearInterval(slotTimer)
  clearTimeout(slotStopTimer)
})

// ── 階段 3：結果 ──────────────────────────────────────────────
const copyMsg          = ref('')
const newInviteeName   = ref('')
const inviteLink       = ref('')
const copyLinkMsg      = ref('')

function getCopyText() {
  return `我同意跟你一起吃晚餐了！我想吃${selectedFood.value}。不准賴皮，今晚見！🍜`
}

async function copyResult() {
  try {
    await navigator.clipboard.writeText(getCopyText())
    copyMsg.value = '已複製 ✓'
  } catch {
    // fallback
    const el = document.createElement('textarea')
    el.value = getCopyText()
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    copyMsg.value = '已複製 ✓'
  }
  setTimeout(() => { copyMsg.value = '' }, 2000)
}

function buildInviteLink(name) {
  // 相容 GitHub Pages hash mode（/DDgame/#/dinner-invite）
  const base = `${window.location.origin}${window.location.pathname}`
  return `${base}#/dinner-invite?name=${encodeURIComponent(name)}`
}

async function generateAndCopy() {
  const name = newInviteeName.value.trim()
  if (!name) return
  inviteLink.value = buildInviteLink(name)
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    copyLinkMsg.value = '連結已複製 ✓'
  } catch {
    const el = document.createElement('textarea')
    el.value = inviteLink.value
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
    copyLinkMsg.value = '連結已複製 ✓'
  }
  setTimeout(() => { copyLinkMsg.value = '' }, 2500)
}

function restart() {
  step.value          = 'invite'
  rejectCount.value   = 0
  easterEgg.value     = false
  rejectHidden.value  = false
  selectedCat.value   = null
  selectedFood.value  = null
  inviteLink.value    = ''
  newInviteeName.value = ''
  rejectStyle.value = {
    position: 'relative',
  }
}
</script>

<template>
  <div class="page-root">

    <!-- 浮動背景 emoji -->
    <div class="bg-emojis" aria-hidden="true">
      <span class="float-emoji" style="font-size:52px;top:3%;left:3%;animation-delay:0s">🥺</span>
      <span class="float-emoji" style="font-size:38px;top:7%;right:6%;animation-delay:1.4s">🍜</span>
      <span class="float-emoji" style="font-size:34px;top:20%;left:8%;animation-delay:0.7s">💖</span>
      <span class="float-emoji" style="font-size:44px;top:15%;right:16%;animation-delay:2.1s">🍣</span>
      <span class="float-emoji" style="font-size:40px;top:44%;left:1%;animation-delay:1.1s">🍕</span>
      <span class="float-emoji" style="font-size:34px;top:53%;right:3%;animation-delay:0.4s">✨</span>
      <span class="float-emoji" style="font-size:46px;bottom:20%;left:5%;animation-delay:1.7s">🎀</span>
      <span class="float-emoji" style="font-size:42px;bottom:6%;right:9%;animation-delay:0.2s">🍔</span>
    </div>

    <!-- 返回入口 -->
    <RouterLink to="/" class="back-btn">← 甜甜的小秘密</RouterLink>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 1：邀請互動                                        -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-if="step === 'invite'" class="center-wrap">

      <div class="card animate-slide-up" style="max-width:480px;text-align:center">

        <!-- 標題區 -->
        <div style="font-size:72px;margin-bottom:16px;filter:drop-shadow(0 0 24px rgba(244,114,182,0.5))">🥺</div>
        <h1 class="invite-heading">晚餐邀請</h1>
        <p class="invite-sub">嗨，<span class="name-highlight">{{ guestName }}</span>！<br>今晚想跟我一起吃晚餐嗎？🥺</p>

        <!-- 彩蛋訊息（5次後） -->
        <div v-if="easterEgg" class="easter-box">
          😏 好啦別堅持了，你其實肚子很餓對吧？
        </div>

        <!-- 按鈕區：同意在上，拒絕在下方固定容器內 -->
        <div class="btn-stack">
          <!-- 同意永遠在頂部，絕對不被拒絕蓋住 -->
          <button class="btn-agree" @click="acceptInvite">同意 💖</button>

          <!-- 拒絕按鈕容器（固定高度，overflow:hidden 防止撐大視窗） -->
          <div class="reject-arena">
            <button
              v-if="!rejectHidden"
              class="btn-reject"
              :style="rejectStyle"
              @click="runRejectButton"
            >
              拒絕 😭
            </button>
          </div>
        </div>

        <!-- 逃跑計數提示 -->
        <p v-if="rejectCount > 0 && !easterEgg" class="reject-hint">
          按鈕已逃跑 {{ rejectCount }} 次…逃不掉的 😏
        </p>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 2a：大類別選擇                                     -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'category'" class="center-wrap">

      <div class="card animate-slide-up" style="max-width:520px">

        <div style="text-align:center;margin-bottom:28px">
          <div style="font-size:48px;margin-bottom:10px">🎉</div>
          <h2 class="section-title">太好了！那今晚想吃什麼？</h2>
          <p class="section-sub">選個大方向，再決定細項</p>
        </div>

        <!-- 類別卡片 -->
        <div class="cat-grid">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.id"
            class="cat-card"
            @click="pickCategory(cat)"
          >
            <span style="font-size:40px;display:block;margin-bottom:8px">{{ cat.emoji }}</span>
            <span class="cat-name">{{ cat.name }}</span>
          </button>
        </div>

        <!-- 盲選按鈕 -->
        <div style="margin-top:24px;text-align:center">
          <button class="btn-slot" @click="startSlot" :disabled="isSlotting">
            <span v-if="!isSlotting">🎰 幫我盲選 / 我都想吃</span>
            <span v-else class="slot-text">{{ slotDisplay }}</span>
          </button>
          <p v-if="isSlotting" style="font-size:14px;color:var(--body);margin-top:8px;text-align:center">
            命運正在滾動中…🎲
          </p>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 2b：具體食物選擇                                   -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'item'" class="center-wrap">

      <div class="card animate-slide-up" style="max-width:520px">

        <button class="back-to-cat" @click="step = 'category'">← 換個類別</button>

        <div style="text-align:center;margin-bottom:24px">
          <div style="font-size:44px;margin-bottom:8px">{{ selectedCat?.emoji }}</div>
          <h2 class="section-title">{{ selectedCat?.name }}</h2>
          <p class="section-sub">點擊選定今晚的主角！</p>
        </div>

        <!-- 食物品項清單 -->
        <div class="food-grid">
          <button
            v-for="food in FOOD_ITEMS[selectedCat?.id]"
            :key="food"
            class="food-item"
            @click="pickFood(food)"
          >
            {{ food }}
          </button>
        </div>

        <!-- 盲選 -->
        <div style="margin-top:20px;text-align:center">
          <button class="btn-slot" @click="startSlot" :disabled="isSlotting">
            <span v-if="!isSlotting">🎰 幫我盲選 / 我都想吃</span>
            <span v-else class="slot-text">{{ slotDisplay }}</span>
          </button>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 3：結果 — 晚餐通行證                               -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'result'" class="center-wrap">

      <div class="card animate-slide-up" style="max-width:500px">

        <!-- 通行證卡片 -->
        <div class="passport-card">
          <div class="passport-badge">🍜 晚餐通行證</div>
          <p class="passport-name">{{ guestName }}</p>
          <p class="passport-msg">已同意今晚的晚餐邀約！</p>
          <div class="passport-food">
            <span class="food-cat-label">{{ selectedCat?.emoji }} {{ selectedCat?.name }}</span>
            <span class="food-arrow">➔</span>
            <span class="food-choice">{{ selectedFood }}</span>
          </div>
          <p class="passport-stamp">✅ 不准賴皮，今晚見！</p>
        </div>

        <!-- 一鍵複製 -->
        <button class="btn-copy" @click="copyResult">
          <span v-if="!copyMsg">📋 一鍵複製邀請訊息</span>
          <span v-else>{{ copyMsg }}</span>
        </button>

        <!-- 分隔線 -->
        <div class="divider"><span>生成下一份邀請</span></div>

        <!-- 邀請連結產生器 -->
        <div class="invite-gen">
          <input
            v-model="newInviteeName"
            class="invite-input"
            type="text"
            placeholder="輸入朋友的名字…"
            maxlength="20"
            @keydown.enter="generateAndCopy"
          />
          <button class="btn-gen" @click="generateAndCopy" :disabled="!newInviteeName.trim()">
            生成連結 🔗
          </button>
        </div>

        <!-- 產生好的連結預覽 -->
        <div v-if="inviteLink" class="link-preview">
          <p style="font-size:13px;color:var(--body);margin-bottom:6px">連結預覽：</p>
          <p class="link-text">{{ inviteLink }}</p>
          <p v-if="copyLinkMsg" class="link-copied">{{ copyLinkMsg }}</p>
        </div>

        <!-- 再玩一次 -->
        <button class="btn-restart" @click="restart">🔄 再邀請一次</button>

      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── 全域容器 ──────────────────────────────────────────────── */
.page-root {
  min-height: 100vh;
  background: var(--bg-dark);
  overflow-x: hidden;
  font-family: var(--font-ui);
}

/* ── 浮動背景 emoji ─────────────────────────────────────────── */
.bg-emojis {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}
.float-emoji {
  position: absolute;
  opacity: 0.12;
  animation: float 7s ease-in-out infinite;
  user-select: none;
}
@keyframes float {
  0%,100% { transform: translateY(0) rotate(0deg); }
  50%      { transform: translateY(-18px) rotate(6deg); }
}

/* ── 返回按鈕 ──────────────────────────────────────────────── */
.back-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--body);
  text-decoration: none;
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  backdrop-filter: blur(8px);
  transition: color 0.15s, border-color 0.15s;
}
.back-btn:hover {
  color: var(--heading);
  border-color: var(--border-rose);
}

/* ── 置中容器 ──────────────────────────────────────────────── */
.center-wrap {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 16px 60px;
}

/* ── 卡片 ──────────────────────────────────────────────────── */
.card {
  width: 100%;
  background: var(--bg-card);
  border: 1px solid var(--border-rose);
  border-radius: 24px;
  padding: 36px 28px;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  box-shadow: 0 0 40px var(--shadow-rose);
  box-sizing: border-box;
}

/* ── 動畫：滑入 ─────────────────────────────────────────────── */
@keyframes slideUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-slide-up {
  animation: slideUp 0.45s ease both;
}

/* ── 階段 1：邀請 ───────────────────────────────────────────── */
.invite-heading {
  font-size: clamp(28px, 7vw, 42px);
  font-weight: 700;
  margin: 0 0 12px;
  background: linear-gradient(135deg, #F472B6 0%, #E11D48 60%, #FB7185 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
.invite-sub {
  font-size: 18px;
  color: var(--label);
  line-height: 1.7;
  margin-bottom: 24px;
}
.name-highlight {
  font-weight: 700;
  color: var(--neon-rose-light);
  -webkit-text-fill-color: var(--neon-rose-light);
}

/* 彩蛋訊息 */
.easter-box {
  background: rgba(244,114,182,0.12);
  border: 1px solid rgba(244,114,182,0.3);
  border-radius: 12px;
  padding: 12px 16px;
  font-size: 16px;
  color: var(--neon-rose-light);
  margin-bottom: 20px;
  animation: slideUp 0.3s ease;
}

/* 上下布局：同意在上，拒絕在下 */
.btn-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  margin-top: 16px;
}

/* 拒絕按鈕專屬區：固定高度，不會撐大視窗 */
.reject-arena {
  position: relative;
  width: 100%;
  height: 160px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-agree {
  padding: 14px 36px;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #E11D48, #F472B6);
  border: none;
  border-radius: 14px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(225,29,72,0.35);
  transition: transform 0.15s, box-shadow 0.15s;
  z-index: 2;
}
.btn-agree:hover {
  transform: scale(1.05);
  box-shadow: 0 6px 28px rgba(225,29,72,0.5);
}

.btn-reject {
  padding: 12px 28px;
  font-size: 16px;
  font-weight: 600;
  color: var(--body);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  white-space: nowrap;
  /* transition 由 style 動態設定 */
}
.btn-reject:hover {
  color: var(--label);
}

.reject-hint {
  font-size: 13px;
  color: var(--body);
  margin-top: 8px;
  opacity: 0.7;
}

/* ── 階段 2：類別選擇 ───────────────────────────────────────── */
.section-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--heading);
  margin: 0 0 6px;
}
.section-sub {
  font-size: 15px;
  color: var(--body);
  margin: 0;
}

.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 12px;
}
.cat-card {
  padding: 20px 10px 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-subtle);
  cursor: pointer;
  text-align: center;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.cat-card:hover {
  transform: translateY(-4px);
  border-color: var(--border-rose);
  box-shadow: 0 6px 24px var(--shadow-rose);
}
.cat-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--label);
}

/* 盲選按鈕 */
.btn-slot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 340px;
  padding: 14px 24px;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #F59E0B, #F97316);
  border: none;
  border-radius: 14px;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(249,115,22,0.35);
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
  box-sizing: border-box;
}
.btn-slot:hover:not(:disabled) {
  transform: scale(1.04);
  box-shadow: 0 6px 28px rgba(249,115,22,0.5);
}
.btn-slot:disabled {
  opacity: 0.8;
  cursor: default;
}
.slot-text {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 1px;
  animation: slotFlash 0.08s step-start infinite;
}
@keyframes slotFlash {
  0%  { opacity: 1; }
  50% { opacity: 0.7; }
}

/* ── 階段 2b：食物品項 ──────────────────────────────────────── */
.back-to-cat {
  font-size: 13px;
  color: var(--body);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-bottom: 16px;
  transition: color 0.15s;
}
.back-to-cat:hover { color: var(--heading); }

.food-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.food-item {
  padding: 10px 18px;
  font-size: 15px;
  font-weight: 500;
  color: var(--label);
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
}
.food-item:hover {
  color: var(--heading);
  border-color: var(--border-rose);
  background: rgba(225,29,72,0.08);
  transform: translateY(-2px);
}

/* ── 階段 3：結果 ────────────────────────────────────────────── */
.passport-card {
  background: linear-gradient(135deg, rgba(225,29,72,0.08) 0%, rgba(244,114,182,0.08) 100%);
  border: 1.5px solid rgba(225,29,72,0.35);
  border-radius: 18px;
  padding: 28px 20px 24px;
  text-align: center;
  margin-bottom: 20px;
  position: relative;
  overflow: hidden;
}
.passport-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 6px,
    rgba(225,29,72,0.03) 6px,
    rgba(225,29,72,0.03) 12px
  );
  pointer-events: none;
}
.passport-badge {
  display: inline-block;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--neon-rose-light);
  background: rgba(225,29,72,0.15);
  border: 1px solid rgba(225,29,72,0.3);
  border-radius: 6px;
  padding: 4px 12px;
  margin-bottom: 14px;
}
.passport-name {
  font-size: clamp(24px, 6vw, 36px);
  font-weight: 800;
  color: var(--heading);
  margin: 0 0 6px;
}
.passport-msg {
  font-size: 16px;
  color: var(--label);
  margin: 0 0 18px;
}
.passport-food {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.food-cat-label {
  font-size: 15px;
  color: var(--body);
  background: var(--bg-subtle);
  border-radius: 8px;
  padding: 6px 12px;
}
.food-arrow {
  font-size: 18px;
  color: var(--neon-rose-light);
}
.food-choice {
  font-size: 22px;
  font-weight: 800;
  color: var(--neon-rose-light);
  background: rgba(225,29,72,0.1);
  border-radius: 8px;
  padding: 6px 14px;
}
.passport-stamp {
  font-size: 15px;
  color: var(--success-text);
  margin: 0;
}

/* 操作按鈕 */
.btn-copy {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(135deg, #E11D48, #F472B6);
  border: none;
  border-radius: 14px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(225,29,72,0.3);
  transition: transform 0.15s, box-shadow 0.15s;
  margin-bottom: 20px;
}
.btn-copy:hover {
  transform: scale(1.02);
  box-shadow: 0 6px 24px rgba(225,29,72,0.45);
}

.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--body);
  font-size: 13px;
  margin-bottom: 16px;
}
.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.invite-gen {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.invite-input {
  flex: 1;
  padding: 12px 14px;
  font-size: 15px;
  color: var(--heading);
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  outline: none;
  transition: border-color 0.15s;
  font-family: var(--font-ui);
}
.invite-input::placeholder {
  color: var(--body);
}
.invite-input:focus {
  border-color: var(--border-rose);
}
.btn-gen {
  padding: 12px 18px;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  background: var(--neon-rose);
  border: none;
  border-radius: 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, opacity 0.15s;
}
.btn-gen:hover:not(:disabled) { background: var(--neon-rose-hover); }
.btn-gen:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.link-preview {
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 12px;
}
.link-text {
  font-size: 12px;
  color: var(--body);
  word-break: break-all;
  margin: 0;
  font-family: 'Source Code Pro', monospace;
}
.link-copied {
  font-size: 13px;
  color: var(--success-text);
  margin: 6px 0 0;
}

.btn-restart {
  width: 100%;
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  color: var(--body);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-restart:hover {
  color: var(--heading);
  border-color: var(--border-rose);
}

/* ── RWD：手機版 (≤480px) ─────────────────────────────────── */
@media (max-width: 480px) {
  /* 卡片縮小內距 */
  .card {
    padding: 24px 16px;
    border-radius: 18px;
  }

  /* 置中容器上下留白縮小，避免內容被壓縮 */
  .center-wrap {
    padding: 72px 12px 48px;
    justify-content: flex-start;
    padding-top: 80px;
  }

  /* 邀請標題縮小 */
  .invite-heading {
    font-size: clamp(24px, 8vw, 32px);
  }
  .invite-sub {
    font-size: 16px;
  }

  /* 類別卡片：手機改 2 列 */
  .cat-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  /* 盲選按鈕：手機全寬 */
  .btn-slot {
    max-width: 100%;
    font-size: 15px;
    padding: 13px 16px;
  }

  /* 同意/拒絕按鈕加寬 */
  .btn-agree {
    padding: 14px 48px;
    font-size: 17px;
  }
  .btn-reject {
    padding: 11px 24px;
    font-size: 15px;
  }

  /* 邀請連結產生器：改為上下堆疊 */
  .invite-gen {
    flex-direction: column;
  }
  .btn-gen {
    width: 100%;
    padding: 13px;
    font-size: 15px;
  }

  /* 結果標題通行證 */
  .section-title {
    font-size: 18px;
  }
  .passport-name {
    font-size: clamp(20px, 7vw, 28px);
  }
  .food-choice {
    font-size: 18px;
  }

  /* 食物品項標籤 */
  .food-item {
    font-size: 14px;
    padding: 9px 14px;
  }
}

/* ── RWD：極小螢幕 (≤360px) ──────────────────────────────── */
@media (max-width: 360px) {
  .card {
    padding: 20px 12px;
  }
  .btn-agree {
    padding: 13px 32px;
  }
  .passport-food {
    flex-direction: column;
    align-items: center;
  }
  .food-arrow {
    transform: rotate(90deg);
    display: inline-block;
  }
}
</style>
