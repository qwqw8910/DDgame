<template>
  <div class="min-h-screen flex items-center justify-center px-4 pt-16 pb-12 relative overflow-x-hidden">
    <!-- 浮動背景 emoji -->
    <div class="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      <span class="float-emoji text-[52px] top-[4%] left-[4%] [animation-delay:0s]">♂️</span>
      <span class="float-emoji text-[44px] top-[6%] right-[8%] [animation-delay:1.3s]">♀️</span>
      <span class="float-emoji text-4xl top-[22%] left-[6%] [animation-delay:0.6s]">💯</span>
      <span class="float-emoji text-[40px] top-[18%] right-[14%] [animation-delay:2s]">🔟</span>
      <span class="float-emoji text-[48px] bottom-[22%] left-[3%] [animation-delay:1.6s]">💘</span>
      <span class="float-emoji text-[38px] bottom-[8%] right-[5%] [animation-delay:0.3s]">✨</span>
    </div>

    <!-- 返回按鈕 -->
    <RouterLink to="/" aria-label="返回首頁"
      class="fixed top-4 left-4 z-50 inline-flex items-center rounded-lg px-3.5 py-2 text-base font-medium no-underline border transition-[color,border-color,box-shadow] duration-200 bg-card text-label border-border-glow hover:text-heading hover:border-neon-purple [box-shadow:0_2px_8px_var(--color-shadow-dark)]">
      ← 返回
    </RouterLink>

    <!-- 主卡片 -->
    <main role="main"
      class="animate-slide-up relative z-10 w-full max-w-[500px] flex flex-col gap-[18px] rounded-[20px] p-6 pb-7 backdrop-blur-lg bg-card sm:p-8 sm:pb-7"
      style="border:1px solid var(--color-border-glow); box-shadow: 0 12px 48px rgba(0,0,0,0.4), 0 0 40px rgba(139,92,246,0.08)">

      <!-- 標題 + 性別切換 -->
      <header class="text-center">
        <div class="mb-3">
          <span class="gradient-text neon-heading text-[clamp(28px,7vw,42px)] font-extrabold leading-none">十分男女</span>
        </div>
        <p class="text-base font-normal m-0 text-body">你能接受嗎？給 1–10 分</p>
      </header>

      <!-- 進度 -->
      <div class="flex justify-between items-center mb-1.5" aria-label="題目進度">
        <span class="text-base font-normal text-body">第 {{ currentIndex + 1 }} 題</span>
        <span class="text-base font-medium rounded-md px-2.5 py-0.5 [color:var(--color-neon-purple-light)] [background:rgba(139,92,246,0.1)] [border:1px_solid_rgba(139,92,246,0.2)]">{{ currentQuestion.category }}</span>
        <span class="text-base font-normal text-body">共 {{ questions.length }} 題</span>
      </div>
      <div class="progress-track" role="progressbar" :aria-valuenow="currentIndex + 1" :aria-valuemin="1"
        :aria-valuemax="questions.length">
        <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>

      <!-- 題目卡 -->
      <div :key="currentIndex" class="rounded-2xl overflow-hidden flex flex-col border border-border">

        <!-- 上半：完美前提 -->
        <div class="flex flex-col gap-2 px-5 pt-[18px] pb-3.5 [background:rgba(139,92,246,0.07)]">
          <span class="inline-flex items-center gap-1 text-base font-semibold [letter-spacing:0.3px] [color:var(--color-neon-purple-light)]">✨ 完美條件</span>
          <p class="text-[clamp(16px,3.5vw,20px)] font-semibold leading-relaxed m-0 break-words text-heading">{{ renderedSetup }}，</p>
        </div>

        <!-- 分隔線 -->
        <div class="flex items-center justify-center relative bg-subtle border-t border-b border-border">
          <span class="text-base font-extrabold [letter-spacing:4px] px-4 py-1.5 bg-clip-text text-transparent [-webkit-text-fill-color:transparent] [background-image:linear-gradient(135deg,var(--color-neon-rose),#F472B6)]">BUT</span>
        </div>

        <!-- 下半：致命缺點 -->
        <div class="flex flex-col gap-2 px-5 pt-3.5 pb-[18px] [background:rgba(225,29,72,0.07)]">
          <span class="inline-flex items-center gap-1 text-base font-semibold [letter-spacing:0.3px] [color:var(--color-neon-rose-light)]">💀 致命缺點</span>
          <p class="text-[clamp(16px,3.5vw,20px)] font-bold leading-relaxed m-0 break-words text-heading">{{ renderedFlaw }}</p>
        </div>
      </div>

      <!-- 下一題 -->
      <div class="flex">
        <button @click="nextQuestion"
          class="w-full py-3.5 px-6 text-lg font-semibold font-sans [letter-spacing:0.5px] border-0 rounded-[10px] cursor-pointer text-white transition-[transform,box-shadow] duration-200 [background:linear-gradient(135deg,var(--color-neon-purple)_0%,var(--color-neon-rose)_100%)] [box-shadow:0_4px_16px_rgba(139,92,246,0.3)] hover:-translate-y-0.5 hover:[box-shadow:0_8px_24px_rgba(139,92,246,0.4)] active:translate-y-0">
          {{ isLast ? '重新開始 🔄' : '下一題 →' }}
        </button>
      </div>

    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
// gender toggle removed — questions use neutral pronouns (對方/對象)
import { RouterLink } from 'vue-router'
import questionsData from '../data/questions.json'

// ── 題目清單 ─────────────────────────────────────────────────
const questions = ref([])

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function initQuestions() {
  questions.value = shuffle(questionsData)
}

onMounted(initQuestions)

// ── 當前題目 ──────────────────────────────────────────────────
const currentIndex = ref(0)

const currentQuestion = computed(() =>
  questions.value[currentIndex.value] ?? { id: 0, setup: '', flaw: '載入中…', category: '' }
)

const renderedSetup = computed(() => currentQuestion.value.setup)
const renderedFlaw  = computed(() => currentQuestion.value.flaw)

const isLast = computed(() => currentIndex.value === questions.value.length - 1)

const progressPct = computed(() =>
  questions.value.length
    ? ((currentIndex.value + 1) / questions.value.length) * 100
    : 0
)

// ── 下一題 ────────────────────────────────────────────────────
function nextQuestion() {
  if (isLast.value) {
    initQuestions()
    currentIndex.value = 0
  } else {
    currentIndex.value++
  }
}
</script>
