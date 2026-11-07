<template>
  <!-- html/body 是 overflow-hidden，捲動發生在這一層 -->
  <div class="h-dvh overflow-x-hidden overflow-y-auto bg-canvas font-text text-ink"
    @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">

    <!-- 拖曳中的全頁提示 -->
    <div v-if="dragging" aria-hidden="true"
      class="pointer-events-none fixed inset-4 z-40 grid place-items-center rounded-tile border-2 border-dashed border-brand bg-canvas">
      <p class="m-0 px-4 text-center font-display text-3xl font-normal text-ink">放開即可加入圖片或資料夾</p>
    </div>

    <div
      class="mx-auto max-w-[1280px] 2xl:max-w-[1440px] min-[1920px]:max-w-[1600px] px-12 pt-[max(16px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] max-lg:px-8 max-sm:px-4">

      <!-- 頂列：返回 ｜ 安裝、深淺色 -->
      <div class="flex items-center justify-between gap-2">
        <RouterLink to="/" :class="iconBtn" aria-label="返回首頁" title="返回首頁">
          <RoomIcon name="back" />
        </RouterLink>
        <div class="flex items-center gap-2">
          <div v-if="canInstall" class="relative">
            <button type="button" :class="iconBtn" aria-label="安裝成 App" title="安裝成 App"
              :aria-expanded="installEvent ? undefined : String(showIosHint)" @click="onInstall">
              <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor"
                stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
              </svg>
            </button>
            <p v-if="showIosHint" role="status"
              class="absolute top-[calc(100%+8px)] right-0 z-10 m-0 w-64 rounded-tile bg-raised px-4 py-3 text-base leading-relaxed text-ink shadow-(--shadow-tile-hover)">
              點 Safari 的「分享」→「加入主畫面」即可安裝
            </p>
          </div>
          <button type="button" :class="iconBtn" :aria-label="themeLabel" :title="themeLabel" @click="toggleTheme">
            <!-- 顯示「按下去會變成的」模式，與首頁一致 -->
            <RoomIcon :name="isDark ? 'sun' : 'moon'" />
          </button>
        </div>
      </div>

      <!-- 標題 -->
      <header class="pt-12 pb-10 max-sm:pt-6 max-sm:pb-8">
        <p class="m-0 text-base font-medium text-brand-ink">在瀏覽器本機處理，圖片不會上傳</p>
        <h1
          class="mt-3 mb-0 font-display text-[clamp(40px,8vw,64px)] leading-[1.08] font-normal tracking-[0.01em] text-ink">
          圖片壓縮</h1>
        <p class="mt-4 mb-0 max-w-[34em] text-xl leading-relaxed text-ink-muted max-sm:text-lg">
          拖入圖片或整個資料夾，壓成 WebP、JPEG 或 PNG，一次打包下載。</p>
      </header>

      <div class="grid grid-cols-[340px_minmax(0,1fr)] items-start gap-6 max-lg:grid-cols-1">
        <!-- 設定 -->
        <section aria-labelledby="settings-heading"
          class="sticky top-6 flex flex-col gap-6 rounded-tile bg-raised p-6 shadow-(--shadow-tile) max-lg:static max-sm:p-5">
          <h2 id="settings-heading" class="m-0 font-display text-xl leading-snug font-normal text-ink">設定</h2>

          <div>
            <p id="format-label" class="m-0 mb-2 text-base font-medium text-ink">輸出格式</p>
            <ToggleGroupRoot type="single" :model-value="format" aria-labelledby="format-label" :loop="false"
              class="grid grid-cols-3 gap-2" @update:model-value="v => { if (v) setFormat(v) }">
              <ToggleGroupItem v-for="f in FORMATS" :key="f.id" :value="f.id" :class="chip">{{ f.label }}
              </ToggleGroupItem>
            </ToggleGroupRoot>
            <p v-if="format === 'png'" class="mt-3 mb-0 text-base leading-relaxed text-ink-muted">
              PNG 是無損格式，沒有畫質選項；照片轉成 PNG 通常會比原檔更大。</p>
          </div>

          <div>
            <p id="preset-label" class="m-0 mb-2 text-base font-medium text-ink">
              {{ format === 'png' ? '最佳化力度' : '壓縮品質' }}</p>
            <ToggleGroupRoot type="single" :model-value="presetId" aria-labelledby="preset-label" :loop="false"
              class="flex flex-wrap gap-2" @update:model-value="v => { if (v) setPreset(v) }">
              <ToggleGroupItem v-for="p in presets" :key="p.id" :value="p.id" :class="chip">{{ p.label }}
              </ToggleGroupItem>
            </ToggleGroupRoot>
            <p class="mt-3 mb-0 text-base leading-relaxed text-ink-muted">{{ preset.hint }}</p>
          </div>

          <hr class="m-0 h-px border-0 bg-hairline" />

          <div v-if="format === 'jpeg'">
            <label for="bg-select" class="m-0 mb-2 block text-base font-medium text-ink">透明處底色</label>
            <select id="bg-select" :value="background" :class="selectClass" aria-describedby="bg-hint"
              @change="setBackground($event.target.value)">
              <option v-for="b in JPEG_BACKGROUNDS" :key="b.value" :value="b.value">{{ b.label }}</option>
            </select>
            <p id="bg-hint" class="mt-2 mb-0 text-base leading-relaxed text-ink-muted">JPEG 不支援透明，透明處會填上這個顏色。</p>
          </div>

          <div>
            <label for="edge-select" class="m-0 mb-2 block text-base font-medium text-ink">縮小尺寸</label>
            <select id="edge-select" :value="maxEdge" :class="selectClass" aria-describedby="edge-hint"
              @change="setMaxEdge($event.target.value)">
              <option v-for="m in MAX_EDGES" :key="m.value" :value="m.value">{{ m.label }}</option>
            </select>
            <p id="edge-hint" class="mt-2 mb-0 text-base leading-relaxed text-ink-muted">只會縮小，不會放大。</p>
          </div>

          <div v-if="staleCount" class="flex flex-col gap-3 rounded-inset bg-brand-soft p-4">
            <p class="m-0 text-base leading-relaxed text-ink">有 {{ staleCount }} 張是用舊設定壓的</p>
            <button type="button" :class="secondaryBtn" @click="recompressAll">套用設定重新壓縮</button>
          </div>
        </section>

        <div class="flex min-w-0 flex-col gap-6 max-lg:order-first">
          <!-- 拖放區 -->
          <section aria-labelledby="drop-heading"
            class="flex flex-col items-center rounded-tile border-2 border-dashed border-hairline bg-raised px-6 text-center"
            :class="items.length ? 'py-8' : 'py-16 max-sm:py-10'">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
              stroke-linecap="round" stroke-linejoin="round" class="size-10 text-ink-faint">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="m3.5 16 4.5-4.5 3.5 3.5 3-3 6 6" />
              <circle cx="15.5" cy="9" r="1.5" />
            </svg>
            <h2 id="drop-heading" class="mt-4 mb-0 font-display text-2xl leading-snug font-normal text-ink">
              把圖片或資料夾拖到這裡</h2>
            <p class="mt-2 mb-0 text-base leading-relaxed text-ink-muted">
              支援 PNG、JPG、WebP、AVIF、BMP；資料夾會連子資料夾一起處理。</p>
            <div class="mt-6 flex flex-wrap justify-center gap-3 max-sm:w-full max-sm:flex-col">
              <!-- 還沒有圖片時「選擇圖片」是主要動作；有結果後主要動作讓給「下載 ZIP」 -->
              <button type="button" :class="items.length ? secondaryBtn : primaryBtn" @click="fileInput.click()">
                選擇圖片</button>
              <button type="button" :class="secondaryBtn" @click="folderInput.click()">選擇資料夾</button>
            </div>
            <input ref="fileInput" type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
              class="hidden" @change="onPick" />
            <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="onPick" />
          </section>

          <p v-if="notice" role="status"
            class="m-0 rounded-inset bg-brand-soft px-4 py-3 text-base leading-relaxed text-ink">{{ notice }}</p>

          <!-- 結果 -->
          <section v-if="items.length" aria-labelledby="result-heading" class="flex flex-col gap-4">
            <div class="sticky top-4 z-10 flex flex-col gap-4 rounded-tile bg-raised p-5 shadow-(--shadow-tile-hover)">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="result-heading" class="m-0 font-display text-xl leading-snug font-normal text-ink tabular-nums">
                  {{ doneItems.length }} / {{ items.length }} 張完成
                  <span v-if="pendingCount" class="ml-1 font-text text-base text-ink-muted">壓縮中…</span>
                </h2>
                <p v-if="doneItems.length" class="m-0 text-base text-ink-muted tabular-nums">
                  {{ formatBytes(totals.original) }} → <span class="font-medium text-ink">{{
                    formatBytes(totals.compressed) }}</span>・省 {{ percent(totals.saved) }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2 max-sm:flex-col">
                <button type="button" :class="primaryBtn" :disabled="!doneItems.length || busy"
                  @click="run(downloadZip)">下載 ZIP</button>
                <button v-if="canSaveToFolder" type="button" :class="secondaryBtn"
                  :disabled="!doneItems.length || busy" aria-describedby="save-hint" @click="onSaveToFolder">
                  存到資料夾</button>
                <button type="button" :class="[secondaryBtn, 'ml-auto max-sm:ml-0']" @click="clearAll">清空</button>
              </div>
              <p v-if="canSaveToFolder" id="save-hint" class="m-0 text-base leading-relaxed text-ink-faint">
                「存到資料夾」會寫進所選資料夾裡的 compressed/，不會動到原檔。</p>
            </div>

            <ul class="m-0 list-none divide-y divide-hairline rounded-tile bg-raised p-0 shadow-(--shadow-tile)">
              <li v-for="item in items" :key="item.id"
                class="flex items-center gap-4 px-5 py-4 max-sm:gap-3 max-sm:px-4">
                <!-- 縮圖：按住看原圖 -->
                <div class="size-16 shrink-0 overflow-hidden rounded-inset bg-fill select-none"
                  :title="item.status === 'done' ? '按住看原圖' : ''"
                  @pointerdown="peekId = item.id" @pointerup="peekId = null" @pointerleave="peekId = null"
                  @pointercancel="peekId = null">
                  <img :src="peekId === item.id || !item.resultUrl ? item.srcUrl : item.resultUrl" alt=""
                    loading="lazy" decoding="async" draggable="false" class="size-full object-contain"
                    :class="item.status === 'queued' || item.status === 'working' ? 'opacity-50' : ''" />
                </div>

                <div class="min-w-0 flex-1">
                  <p class="m-0 truncate text-base font-medium text-ink" :title="outPaths.get(item.id)">
                    {{ outPaths.get(item.id) }}</p>
                  <p v-if="item.status === 'done'"
                    class="mt-0.5 mb-0 text-base leading-relaxed text-ink-muted tabular-nums">
                    {{ formatBytes(item.file.size) }} → <span class="font-medium text-ink">{{
                      formatBytes(item.outBlob.size) }}</span>
                    <span v-if="item.outBlob.size < item.file.size">・省 {{ percent(1 - item.outBlob.size /
                      item.file.size) }}</span>
                    <span v-else class="text-warning-ink">・變大 {{ percent(item.outBlob.size / item.file.size - 1)
                      }}</span>
                    ・{{ item.width }}×{{ item.height }}
                    <span v-if="item.width !== item.srcWidth" class="text-ink-faint">（原 {{ item.srcWidth }}×{{
                      item.srcHeight }}）</span>
                  </p>
                  <p v-else-if="item.status === 'error'" class="mt-0.5 mb-0 text-base text-danger-ink">
                    失敗：{{ item.error }}</p>
                  <p v-else class="mt-0.5 mb-0 text-base text-ink-muted tabular-nums">
                    {{ formatBytes(item.file.size) }}・{{ item.status === 'working' ? '壓縮中…' : '等待中' }}</p>
                  <p v-if="item.keptOriginal" class="mt-0.5 mb-0 text-base text-warning-ink">重壓後反而更大，已保留原檔</p>
                </div>

                <div class="flex shrink-0 gap-2 max-sm:gap-1">
                  <a v-if="item.status === 'done'" :href="item.resultUrl"
                    :download="outPaths.get(item.id).split('/').pop()" :class="iconBtn"
                    :aria-label="`下載 ${outPaths.get(item.id)}`" title="下載">
                    <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor"
                      stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
                    </svg>
                  </a>
                  <button type="button" :class="iconBtn" :aria-label="`移除 ${outPaths.get(item.id)}`" title="移除"
                    @click="removeItem(item.id)">
                    <RoomIcon name="close" />
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ToggleGroupRoot, ToggleGroupItem } from 'reka-ui'
import RoomIcon from '@/shared/components/room/RoomIcon.vue'
import { usePwaInstall } from '@/shared/composables/usePwaInstall.js'
import { useTheme } from '@/shared/composables/useTheme.js'
import { FORMATS, MAX_EDGES, JPEG_BACKGROUNDS } from '../data/presets.js'
import { useWebpCompress } from '../composables/useWebpCompress.js'
import { incoming } from '../composables/useIncomingImages.js'
import { collectFromDrop, collectFromFileList } from '../utils/collect.js'

const {
  items, format, presets, presetId, maxEdge, background, preset, staleCount, pendingCount, totals, doneItems, outPaths, canSaveToFolder,
  addFiles, removeItem, clearAll, setFormat, setPreset, setMaxEdge, setBackground, recompressAll, downloadZip, saveToFolder,
} = useWebpCompress()

const { isDark, toggleTheme } = useTheme()
const themeLabel = computed(() => (isDark.value ? '切換為淺色模式' : '切換為深色模式'))

// PWA 安裝：Chromium 直接跳安裝框；iOS Safari 沒有 API，改顯示手動步驟（與首頁同一套）
const { installEvent, canInstall, install } = usePwaInstall()
const showIosHint = ref(false)
function onInstall() {
  if (installEvent.value) install()
  else showIosHint.value = !showIosHint.value
}

// v2 樣式
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const iconBtn = `grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-raised text-ink no-underline shadow-(--shadow-tile) transition-[background-color,scale] duration-150 ease-soft hover:bg-fill active:scale-95 ${focusRing} motion-reduce:transition-none`
const btnBase = `inline-flex h-11 cursor-pointer items-center justify-center rounded-full border-0 px-5 font-text text-base font-medium transition-[background-color,scale] duration-150 ease-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${focusRing} motion-reduce:transition-none`
const primaryBtn = `${btnBase} bg-brand text-on-brand`
const secondaryBtn = `${btnBase} bg-raised text-ink shadow-(--shadow-tile) hover:bg-fill disabled:hover:bg-raised`
const chip = `inline-flex h-11 cursor-pointer items-center justify-center rounded-full border-0 bg-fill px-4 font-text text-base text-ink transition-[background-color,color,scale] duration-150 ease-soft hover:bg-hairline active:scale-[0.97] ${focusRing} motion-reduce:transition-none data-[state=on]:bg-brand data-[state=on]:text-on-brand data-[state=on]:hover:bg-brand`
const selectClass = `h-11 w-full font-text cursor-pointer rounded-inset border-0 bg-fill px-4 text-base text-ink ${focusRing}`

const fileInput = ref(null)
const folderInput = ref(null)
const dragging = ref(false)
const peekId = ref(null)
const notice = ref('')
const busy = ref(false)

// dragenter/dragleave 會在子元素間反覆觸發，用計數才不會閃爍
let dragDepth = 0
function onDragEnter() { dragDepth++; dragging.value = true }
function onDragLeave() { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dragging.value = false }

function accept(found) {
  if (!found.length) {
    notice.value = '沒有找到可壓縮的圖片（支援 PNG、JPG、WebP、AVIF、BMP）'
    return
  }
  notice.value = ''
  addFiles(found)
}

async function onDrop(e) {
  dragDepth = 0
  dragging.value = false
  accept(await collectFromDrop(e.dataTransfer))
}

function onPick(e) {
  accept(collectFromFileList(e.target.files))
  e.target.value = '' // 允許再次選同一批檔案
}

async function run(fn) {
  busy.value = true
  try { await fn() } finally { busy.value = false }
}

async function onSaveToFolder() {
  busy.value = true
  try {
    const count = await saveToFolder()
    if (count >= 0) notice.value = `已寫入 ${count} 個檔案到所選資料夾的 compressed/`
  } catch (err) {
    notice.value = `存檔失敗：${err.message}`
  } finally {
    busy.value = false
  }
}

// PWA「開啟檔案」帶進來的圖片（見 useIncomingImages.js）
watch(incoming, (list) => {
  if (!list.length) return
  addFiles(list)
  incoming.value = []
}, { immediate: true })

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function percent(ratio) {
  return `${Math.round(ratio * 100)}%`
}
</script>
