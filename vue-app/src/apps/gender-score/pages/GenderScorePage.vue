<template>
  <div class="gs-page">
    <!-- 浮動背景 emoji -->
    <div class="gs-bg-emojis" aria-hidden="true">
      <span class="float-emoji" style="font-size:52px;top:4%;left:4%;animation-delay:0s">♂️</span>
      <span class="float-emoji" style="font-size:44px;top:6%;right:8%;animation-delay:1.3s">♀️</span>
      <span class="float-emoji" style="font-size:36px;top:22%;left:6%;animation-delay:0.6s">💯</span>
      <span class="float-emoji" style="font-size:40px;top:18%;right:14%;animation-delay:2s">🔟</span>
      <span class="float-emoji" style="font-size:48px;bottom:22%;left:3%;animation-delay:1.6s">💘</span>
      <span class="float-emoji" style="font-size:38px;bottom:8%;right:5%;animation-delay:0.3s">✨</span>
    </div>

    <!-- 返回按鈕 -->
    <RouterLink to="/" class="gs-back-btn" aria-label="返回首頁">← 返回</RouterLink>

    <!-- 主卡片 -->
    <main class="gs-card animate-slide-up" role="main">

      <!-- 標題 + 性別切換 -->
      <header class="gs-header">
        <div class="gs-title-row">
          <span class="gs-title-score gradient-text neon-heading">十分男女</span>
        </div>
        <div class="gs-gender-toggle" role="group" aria-label="選擇性別">
          <button
            class="gs-gender-btn"
            :class="{ 'gs-gender-btn--active--male': gender === 'male' }"
            @click="gender = 'male'"
            :aria-pressed="gender === 'male'"
          >♂ 他</button>
          <button
            class="gs-gender-btn"
            :class="{ 'gs-gender-btn--active--female': gender === 'female' }"
            @click="gender = 'female'"
            :aria-pressed="gender === 'female'"
          >♀ 她</button>
        </div>
        <p class="gs-subtitle">你能接受嗎？給 1–10 分</p>
      </header>

      <!-- 進度 -->
      <div class="gs-progress-row" aria-label="題目進度">
        <span class="gs-progress-label">第 {{ currentIndex + 1 }} 題</span>
        <span class="gs-progress-label gs-category-tag">{{ currentQuestion.category }}</span>
        <span class="gs-progress-label">共 {{ questions.length }} 題</span>
      </div>
      <div class="progress-track" role="progressbar"
        :aria-valuenow="currentIndex + 1"
        :aria-valuemin="1"
        :aria-valuemax="questions.length">
        <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
      </div>

      <!-- 題目卡 -->
      <div class="gs-question-card" :key="currentIndex">
        <!-- 上半：完美前提 -->
        <div class="gs-setup">
          <span class="gs-setup-badge">✨ 完美條件</span>
          <p class="gs-setup-text">{{ renderedSetup }}，</p>
        </div>

        <!-- 分隔線 -->
        <div class="gs-divider">
          <span class="gs-divider-label">BUT</span>
        </div>

        <!-- 下半：致命缺點 -->
        <div class="gs-flaw">
          <span class="gs-flaw-badge">💀 致命缺點</span>
          <p class="gs-flaw-text">{{ renderedFlaw }}</p>
        </div>
      </div>

      <!-- 下一題 -->
      <div class="gs-actions">
        <button class="gs-btn-next" @click="nextQuestion">
          {{ isLast ? '重新開始 🔄' : '下一題 →' }}
        </button>
      </div>

    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import questionsData from '../data/questions.json'

// ── 性別 ─────────────────────────────────────────────────────
const gender = ref('male')   // 'male' | 'female'

// 替換題目中的 {他}、{男/女} token
function applyGender(str) {
  const pronoun  = gender.value === 'male' ? '他' : '她'
  const genderWord = gender.value === 'male' ? '男' : '女'
  return str
    .replace(/\{他\}/g, pronoun)
    .replace(/\{男\/女\}/g, genderWord)
}

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

const renderedSetup = computed(() => applyGender(currentQuestion.value.setup))
const renderedFlaw  = computed(() => applyGender(currentQuestion.value.flaw))

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

<style scoped>
/* ── 頁面 ── */
.gs-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 16px 48px;
  position: relative;
  overflow-x: hidden;
}

.gs-bg-emojis {
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}

/* ── 返回 ── */
.gs-back-btn {
  position: fixed;
  top: 16px;
  left: 16px;
  z-index: 50;
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 16px;
  font-weight: 500;
  color: var(--label);
  text-decoration: none;
  transition: color 0.2s, border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 2px 8px var(--shadow-dark);
  display: inline-flex;
  align-items: center;
}
.gs-back-btn:hover {
  color: var(--heading);
  border-color: var(--neon-purple);
}

/* ── 主卡片 ── */
.gs-card {
  position: relative;
  z-index: 10;
  width: 100%;
  max-width: 500px;
  background: var(--bg-card);
  border: 1px solid var(--border-glow);
  border-radius: 20px;
  padding: 32px 28px 28px;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 12px 48px rgba(0,0,0,0.4), 0 0 40px rgba(139,92,246,0.08);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* ── Header ── */
.gs-header { text-align: center; }

.gs-title-row {
  margin-bottom: 12px;
}

.gs-title-score {
  font-size: clamp(28px, 7vw, 42px);
  font-weight: 800;
  line-height: 1;
}

/* 性別切換 */
.gs-gender-toggle {
  display: inline-flex;
  background: var(--bg-subtle);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 3px;
  gap: 3px;
  margin-bottom: 10px;
}

.gs-gender-btn {
  padding: 7px 22px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: var(--body);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, box-shadow 0.18s;
  line-height: 1;
}

/* 男：藍紫漸層 */
.gs-gender-btn--active--male {
  background: linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%);
  color: #fff;
  box-shadow: 0 2px 10px rgba(59,130,246,0.4);
}

/* 女：玫瑰漸層 */
.gs-gender-btn--active--female {
  background: linear-gradient(135deg, var(--neon-rose) 0%, #F472B6 100%);
  color: #fff;
  box-shadow: 0 2px 10px rgba(225,29,72,0.4);
}

.gs-subtitle {
  font-size: 16px;
  color: var(--body);
  font-weight: 400;
  margin: 0;
}

/* ── 進度 ── */
.gs-progress-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.gs-progress-label {
  font-size: 16px;
  color: var(--body);
  font-weight: 400;
}

.gs-category-tag {
  font-size: 16px;
  color: var(--neon-purple-light);
  background: rgba(139,92,246,0.1);
  border: 1px solid rgba(139,92,246,0.2);
  border-radius: 6px;
  padding: 2px 10px;
  font-weight: 500;
}

/* ── 題目卡 ── */
.gs-question-card {
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
}

/* 上半：完美條件 */
.gs-setup {
  padding: 18px 20px 14px;
  background: rgba(139,92,246,0.07);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gs-setup-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--neon-purple-light);
  letter-spacing: 0.3px;
}

.gs-setup-text {
  font-size: clamp(16px, 3.5vw, 20px);
  font-weight: 600;
  color: var(--heading);
  line-height: 1.6;
  margin: 0;
  word-break: break-word;
}

/* 分隔線 */
.gs-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  position: relative;
  background: var(--bg-subtle);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.gs-divider-label {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 4px;
  padding: 6px 16px;
  color: var(--neon-rose-light);
  background: linear-gradient(135deg, var(--neon-rose), #F472B6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* 下半：致命缺點 */
.gs-flaw {
  padding: 14px 20px 18px;
  background: rgba(225,29,72,0.07);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gs-flaw-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 16px;
  font-weight: 600;
  color: var(--neon-rose-light);
  letter-spacing: 0.3px;
}

.gs-flaw-text {
  font-size: clamp(16px, 3.5vw, 20px);
  font-weight: 700;
  color: var(--heading);
  line-height: 1.6;
  margin: 0;
  word-break: break-word;
}

/* ── 下一題按鈕 ── */
.gs-actions { display: flex; }

.gs-btn-next {
  width: 100%;
  padding: 14px 24px;
  font-size: 18px;
  font-weight: 600;
  font-family: var(--font-ui);
  letter-spacing: 0.5px;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  background: linear-gradient(135deg, var(--neon-purple) 0%, var(--neon-rose) 100%);
  color: #fff;
  box-shadow: 0 4px 16px rgba(139,92,246,0.3);
  transition: transform 0.15s ease, box-shadow 0.2s ease;
}
.gs-btn-next:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(139,92,246,0.4);
}
.gs-btn-next:active { transform: translateY(0); }

/* ── 手機 ── */
@media (max-width: 480px) {
  .gs-card {
    padding: 24px 16px 22px;
    gap: 14px;
    border-radius: 16px;
  }
  .gs-setup, .gs-flaw {
    padding: 14px 16px;
  }
}
</style>
