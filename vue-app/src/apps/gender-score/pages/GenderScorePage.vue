<template>
  <!-- html/body 是 overflow-hidden，捲動發生在這一層 -->
  <div class="h-dvh overflow-x-hidden overflow-y-auto bg-canvas font-text text-ink">
    <div
      class="mx-auto flex min-h-full max-w-[1280px] 2xl:max-w-[1440px] min-[1920px]:max-w-[1600px] flex-col px-12 pt-[max(16px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] max-lg:px-8 max-sm:px-4">

      <!-- 頂列：返回 ｜ 深淺色 -->
      <div class="flex items-center justify-between gap-2">
        <RouterLink to="/" :class="iconBtn" aria-label="返回首頁" title="返回首頁">
          <RoomIcon name="back" />
        </RouterLink>
        <button type="button" :class="iconBtn" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
          <!-- 顯示「按下去會變成的」模式，與首頁一致 -->
          <RoomIcon :name="isDark ? 'sun' : 'moon'" />
        </button>
      </div>

      <main class="mx-auto flex w-full max-w-[720px] flex-1 flex-col pt-12 max-sm:pt-6">
        <!-- 標題 -->
        <header>
          <p class="m-0 text-base font-medium text-brand-ink">共 {{ questions.length }} 題，隨機出題</p>
          <h1 class="mt-3 mb-0 font-display text-[clamp(40px,8vw,64px)] leading-[1.08] font-normal tracking-[0.01em] text-ink">
            十分男女</h1>
          <p class="mt-4 mb-0 text-xl leading-relaxed text-ink-muted max-sm:text-lg">
            對方滿分，只有一個缺點。你能接受嗎？各自喊出 1–10 分。</p>
        </header>

        <!-- 進度 -->
        <div class="mt-10 max-sm:mt-8">
          <div class="flex items-center justify-between gap-3 text-base text-ink-muted">
            <span class="tabular-nums">第 {{ currentIndex + 1 }} / {{ questions.length }} 題</span>
            <span v-if="currentQuestion.category"
              class="rounded-full bg-fill px-2.5 py-0.5 leading-snug text-ink-faint">{{ currentQuestion.category }}</span>
          </div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-fill" role="progressbar" aria-label="題目進度"
            :aria-valuenow="currentIndex + 1" :aria-valuemin="1" :aria-valuemax="questions.length">
            <div class="h-full rounded-full bg-ink transition-[width] duration-200 ease-soft motion-reduce:transition-none"
              :style="{ width: progressPct + '%' }"></div>
          </div>
        </div>

        <!-- 題目卡：前提 → 分隔線 → 缺點（重點） -->
        <section class="mt-6 rounded-tile bg-raised p-8 shadow-(--shadow-tile) max-sm:p-5" aria-live="polite"
          aria-atomic="true">
          <p class="m-0 text-base text-ink-faint">完美條件</p>
          <p class="mt-2 mb-0 text-lg leading-relaxed break-words text-ink-muted">{{ currentQuestion.setup }}，</p>

          <div class="my-6 flex items-center gap-4" aria-hidden="true">
            <hr class="h-px flex-1 border-0 bg-hairline" />
            <span class="font-display text-base tracking-[0.3em] text-ink-faint">BUT</span>
            <hr class="h-px flex-1 border-0 bg-hairline" />
          </div>

          <p class="m-0 text-base text-ink-faint">致命缺點</p>
          <p
            class="mt-2 mb-0 font-display text-[clamp(22px,3vw,28px)] leading-normal font-normal break-words text-ink">
            {{ currentQuestion.flaw }}</p>
        </section>

        <!-- 下一題 -->
        <div class="mt-6 flex justify-end max-sm:block">
          <button type="button"
            class="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border-0 bg-brand px-7 text-lg font-medium text-on-brand transition-[scale] duration-150 ease-soft active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none max-sm:w-full"
            @click="nextQuestion">
            {{ isLast ? '重新洗牌' : '下一題' }}
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round" class="size-5">
              <path v-if="isLast" d="M15.5 8A6 6 0 0 0 4.6 7M4.5 12a6 6 0 0 0 10.9 1M4.5 3.5V7H8M15.5 16.5V13H12" />
              <path v-else d="m8 5 5 5-5 5" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import RoomIcon from '@/shared/components/room/RoomIcon.vue'
import { useTheme } from '@/shared/composables/useTheme.js'
import questionsData from '../data/questions.json'

const { isDark, toggleTheme } = useTheme()
const themeLabel = computed(() => (isDark.value ? '切換為淺色模式' : '切換為深色模式'))

const iconBtn = 'grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-raised text-ink no-underline shadow-(--shadow-tile) transition-[background-color,scale] duration-150 ease-soft hover:bg-fill active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none'

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
