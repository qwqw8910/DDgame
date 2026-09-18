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
  <div class="min-h-screen overflow-x-hidden font-sans bg-dark">

    <!-- 浮動背景 emoji -->
    <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[52px] top-[3%] left-[3%] [animation-delay:0s]">🥺</span>
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[38px] top-[7%] right-[6%] [animation-delay:1.4s]">🍜</span>
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[34px] top-[20%] left-[8%] [animation-delay:0.7s]">💖</span>
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[44px] top-[15%] right-[16%] [animation-delay:2.1s]">🍣</span>
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[40px] top-[44%] left-[1%] [animation-delay:1.1s]">🍕</span>
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[34px] top-[53%] right-[3%] [animation-delay:0.4s]">✨</span>
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[46px] bottom-[20%] left-[5%] [animation-delay:1.7s]">🎀</span>
      <span class="float-emoji opacity-[0.12] [animation:float_7s_ease-in-out_infinite] text-[42px] bottom-[6%] right-[9%] [animation-delay:0.2s]">🍔</span>
    </div>

    <!-- 返回入口 -->
    <RouterLink to="/"
      class="fixed top-4 left-4 z-50 flex items-center gap-1.5 text-[13px] font-medium no-underline px-3 py-1.5 rounded-lg border backdrop-blur-sm transition-colors duration-150 text-body border-border bg-card hover:text-heading hover:border-border-rose">
      ← 甜甜的小秘密
    </RouterLink>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 1：邀請互動                                        -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-if="step === 'invite'" class="relative z-10 min-h-screen flex flex-col items-center justify-start sm:justify-center px-3 sm:px-4 pt-20 pb-12 sm:pb-[60px]">

      <div class="dinner-invite-card animate-slide-up max-w-[480px] text-center">

        <!-- 標題區 -->
        <div class="text-7xl mb-4 [filter:drop-shadow(0_0_24px_rgba(244,114,182,0.5))]">🥺</div>
        <h1 class="text-[clamp(24px,8vw,42px)] sm:text-[clamp(28px,7vw,42px)] font-bold m-0 mb-3 bg-clip-text text-transparent [-webkit-text-fill-color:transparent] [background-image:linear-gradient(135deg,#F472B6_0%,#E11D48_60%,#FB7185_100%)]">晚餐邀請</h1>
        <p class="text-base sm:text-lg leading-[1.7] mb-6 text-label">嗨，<span class="font-bold [color:var(--color-neon-rose-light)] [-webkit-text-fill-color:var(--color-neon-rose-light)]">{{ guestName }}</span>！<br>今晚想跟我一起吃晚餐嗎？🥺</p>

        <!-- 彩蛋訊息（5次後） -->
        <div v-if="easterEgg" class="animate-slide-up rounded-xl py-3 px-4 text-base mb-5 [color:var(--color-neon-rose-light)] [background:rgba(244,114,182,0.12)] [border:1px_solid_rgba(244,114,182,0.3)]">
          😏 好啦別堅持了，你其實肚子很餓對吧？
        </div>

        <!-- 按鈕區：同意在上，拒絕在下方固定容器內 -->
        <div class="flex flex-col items-center gap-0 mt-4">
          <!-- 同意永遠在頂部，絕對不被拒絕蓋住 -->
          <button @click="acceptInvite"
            class="py-3.5 px-9 sm:px-9 text-lg font-bold text-white rounded-2xl border-0 cursor-pointer transition-[transform,box-shadow] duration-150 z-[2] [background:linear-gradient(135deg,#E11D48,#F472B6)] [box-shadow:0_4px_20px_rgba(225,29,72,0.35)] hover:scale-105 hover:[box-shadow:0_6px_28px_rgba(225,29,72,0.5)] max-[480px]:px-12 max-[480px]:text-[17px]">
            同意 💖
          </button>

          <!-- 拒絕按鈕容器（固定高度，overflow:hidden 防止撐大視窗） -->
          <div class="relative w-full h-40 overflow-hidden flex items-center justify-center">
            <button
              v-if="!rejectHidden"
              :style="rejectStyle"
              @click="runRejectButton"
              class="py-3 px-7 text-base font-semibold rounded-xl cursor-pointer whitespace-nowrap border border-border bg-subtle text-body hover:text-label max-[480px]:py-[11px] max-[480px]:px-6 max-[480px]:text-[15px]"
            >
              拒絕 😭
            </button>
          </div>
        </div>

        <!-- 逃跑計數提示 -->
        <p v-if="rejectCount > 0 && !easterEgg" class="text-[13px] mt-2 opacity-70 text-body">
          按鈕已逃跑 {{ rejectCount }} 次…逃不掉的 😏
        </p>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 2a：大類別選擇                                     -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'category'" class="relative z-10 min-h-screen flex flex-col items-center justify-start sm:justify-center px-3 sm:px-4 pt-20 pb-12 sm:pb-[60px]">

      <div class="dinner-invite-card animate-slide-up max-w-[520px]">

        <div class="text-center mb-7">
          <div class="text-5xl mb-2.5">🎉</div>
          <h2 class="text-xl max-[480px]:text-lg font-bold m-0 mb-1.5 text-heading">太好了！那今晚想吃什麼？</h2>
          <p class="text-[15px] m-0 text-body">選個大方向，再決定細項</p>
        </div>

        <!-- 類別卡片 -->
        <div class="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-3">
          <button
            v-for="cat in CATEGORIES"
            :key="cat.id"
            @click="pickCategory(cat)"
            class="py-5 px-2.5 pb-4 rounded-2xl cursor-pointer text-center transition-[transform,border-color,box-shadow] duration-150 border border-border bg-subtle hover:-translate-y-1 hover:border-border-rose hover:[box-shadow:0_6px_24px_var(--color-shadow-rose)]"
          >
            <span class="text-4xl block mb-2">{{ cat.emoji }}</span>
            <span class="text-sm font-semibold text-label">{{ cat.name }}</span>
          </button>
        </div>

        <!-- 盲選按鈕 -->
        <div class="mt-6 text-center">
          <button @click="startSlot" :disabled="isSlotting" class="dinner-invite-slot-btn max-w-full sm:max-w-[340px] max-[480px]:text-[15px] max-[480px]:py-[13px] max-[480px]:px-4">
            <span v-if="!isSlotting">🎰 幫我盲選 / 我都想吃</span>
            <span v-else class="dinner-invite-slot-text">{{ slotDisplay }}</span>
          </button>
          <p v-if="isSlotting" class="text-sm mt-2 text-center text-body">
            命運正在滾動中…🎲
          </p>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 2b：具體食物選擇                                   -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'item'" class="relative z-10 min-h-screen flex flex-col items-center justify-start sm:justify-center px-3 sm:px-4 pt-20 pb-12 sm:pb-[60px]">

      <div class="dinner-invite-card animate-slide-up max-w-[520px]">

        <button @click="step = 'category'" class="text-[13px] bg-transparent border-0 cursor-pointer p-0 mb-4 transition-colors duration-150 text-body hover:text-heading">← 換個類別</button>

        <div class="text-center mb-6">
          <div class="text-[44px] mb-2">{{ selectedCat?.emoji }}</div>
          <h2 class="text-xl max-[480px]:text-lg font-bold m-0 mb-1.5 text-heading">{{ selectedCat?.name }}</h2>
          <p class="text-[15px] m-0 text-body">點擊選定今晚的主角！</p>
        </div>

        <!-- 食物品項清單 -->
        <div class="flex flex-wrap gap-2.5">
          <button
            v-for="food in FOOD_ITEMS[selectedCat?.id]"
            :key="food"
            @click="pickFood(food)"
            class="py-2.5 px-[18px] max-[480px]:py-[9px] max-[480px]:px-3.5 text-[15px] max-[480px]:text-sm font-medium rounded-[10px] cursor-pointer transition-all duration-150 border border-border bg-subtle text-label hover:-translate-y-0.5 hover:text-heading hover:border-border-rose hover:[background:rgba(225,29,72,0.08)]"
          >
            {{ food }}
          </button>
        </div>

        <!-- 盲選 -->
        <div class="mt-5 text-center">
          <button @click="startSlot" :disabled="isSlotting" class="dinner-invite-slot-btn max-w-full sm:max-w-[340px] max-[480px]:text-[15px] max-[480px]:py-[13px] max-[480px]:px-4">
            <span v-if="!isSlotting">🎰 幫我盲選 / 我都想吃</span>
            <span v-else class="dinner-invite-slot-text">{{ slotDisplay }}</span>
          </button>
        </div>

      </div>
    </div>

    <!-- ════════════════════════════════════════════════════════ -->
    <!-- 階段 3：結果 — 晚餐通行證                               -->
    <!-- ════════════════════════════════════════════════════════ -->
    <div v-else-if="step === 'result'" class="relative z-10 min-h-screen flex flex-col items-center justify-start sm:justify-center px-3 sm:px-4 pt-20 pb-12 sm:pb-[60px]">

      <div class="dinner-invite-card animate-slide-up max-w-[500px]">

        <!-- 通行證卡片 -->
        <div class="relative overflow-hidden text-center rounded-[18px] py-7 px-5 pb-6 mb-5 [background:linear-gradient(135deg,rgba(225,29,72,0.08)_0%,rgba(244,114,182,0.08)_100%)] [border:1.5px_solid_rgba(225,29,72,0.35)]">
          <div class="pointer-events-none absolute inset-0 [background:repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(225,29,72,0.03)_6px,rgba(225,29,72,0.03)_12px)]"></div>
          <div class="inline-block text-[13px] font-bold [letter-spacing:1.5px] uppercase rounded-md py-1 px-3 mb-3.5 [color:var(--color-neon-rose-light)] [background:rgba(225,29,72,0.15)] [border:1px_solid_rgba(225,29,72,0.3)]">🍜 晚餐通行證</div>
          <p class="text-[clamp(20px,7vw,36px)] sm:text-[clamp(24px,6vw,36px)] font-extrabold m-0 mb-1.5 text-heading">{{ guestName }}</p>
          <p class="text-base m-0 mb-4.5 text-label">已同意今晚的晚餐邀約！</p>
          <div class="flex items-center justify-center max-[360px]:flex-col flex-wrap gap-2 mb-3.5">
            <span class="text-[15px] rounded-lg py-1.5 px-3 text-body bg-subtle">{{ selectedCat?.emoji }} {{ selectedCat?.name }}</span>
            <span class="text-lg max-[360px]:rotate-90 inline-block [color:var(--color-neon-rose-light)]">➔</span>
            <span class="text-[18px] max-[480px]:text-lg font-extrabold rounded-lg py-1.5 px-3.5 [color:var(--color-neon-rose-light)] [background:rgba(225,29,72,0.1)]">{{ selectedFood }}</span>
          </div>
          <p class="text-[15px] m-0 [color:var(--color-success-text)]">✅ 不准賴皮，今晚見！</p>
        </div>

        <!-- 一鍵複製 -->
        <button @click="copyResult"
          class="w-full py-3.5 text-base font-bold text-white rounded-2xl border-0 cursor-pointer mb-5 transition-[transform,box-shadow] duration-150 [background:linear-gradient(135deg,#E11D48,#F472B6)] [box-shadow:0_4px_16px_rgba(225,29,72,0.3)] hover:scale-[1.02] hover:[box-shadow:0_6px_24px_rgba(225,29,72,0.45)]">
          <span v-if="!copyMsg">📋 一鍵複製邀請訊息</span>
          <span v-else>{{ copyMsg }}</span>
        </button>

        <!-- 分隔線 -->
        <div class="flex items-center gap-2.5 text-[13px] mb-4 text-body">
          <span class="flex-1 h-px bg-border"></span>
          <span>生成下一份邀請</span>
          <span class="flex-1 h-px bg-border"></span>
        </div>

        <!-- 邀請連結產生器 -->
        <div class="flex flex-col sm:flex-row gap-2 mb-3">
          <input
            v-model="newInviteeName"
            type="text"
            placeholder="輸入朋友的名字…"
            maxlength="20"
            @keydown.enter="generateAndCopy"
            class="flex-1 py-3 px-3.5 text-[15px] rounded-[10px] outline-none transition-colors duration-150 border border-border bg-input text-heading placeholder:text-body focus:border-border-rose font-sans"
          />
          <button @click="generateAndCopy" :disabled="!newInviteeName.trim()"
            class="w-full sm:w-auto py-3 sm:py-3 max-[480px]:py-[13px] px-[18px] text-sm max-[480px]:text-[15px] font-bold text-white rounded-[10px] border-0 cursor-pointer whitespace-nowrap transition-[background,opacity] duration-150 disabled:opacity-40 disabled:cursor-not-allowed bg-[color:var(--color-neon-rose)] hover:enabled:bg-[color:var(--color-neon-rose-hover)]">
            生成連結 🔗
          </button>
        </div>

        <!-- 產生好的連結預覽 -->
        <div v-if="inviteLink" class="rounded-[10px] py-3 px-3.5 mb-3 border border-border bg-subtle">
          <p class="text-[13px] mb-1.5 text-body">連結預覽：</p>
          <p class="text-xs break-all m-0 font-mono text-body">{{ inviteLink }}</p>
          <p v-if="copyLinkMsg" class="text-[13px] mt-1.5 mb-0 [color:var(--color-success-text)]">{{ copyLinkMsg }}</p>
        </div>

        <!-- 再玩一次 -->
        <button @click="restart"
          class="w-full py-3 text-[15px] font-semibold rounded-xl cursor-pointer transition-colors duration-150 border border-border bg-transparent text-body hover:text-heading hover:border-border-rose">
          🔄 再邀請一次
        </button>

      </div>
    </div>

  </div>
</template>
