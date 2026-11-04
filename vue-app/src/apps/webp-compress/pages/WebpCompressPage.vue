<template>
  <div class="h-screen overflow-y-auto overflow-x-hidden font-sans text-heading"
    @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">

    <!-- 拖曳中的全頁提示 -->
    <div v-if="dragging"
      class="pointer-events-none fixed inset-0 z-40 grid place-items-center border-4 border-dashed border-neon-purple bg-overlay">
      <p class="text-2xl font-bold text-accent">放開即可加入圖片或資料夾</p>
    </div>

    <div class="mx-auto flex max-w-3xl flex-col gap-5 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-16">
      <header class="flex items-center justify-between gap-3">
        <RouterLink to="/" class="text-label no-underline hover:text-heading">← 甜甜的小秘密</RouterLink>
        <PwaInstallButton
          button-class="grid size-10 cursor-pointer place-items-center rounded-full border border-border bg-surface"
          hint-class="fixed top-16 right-4 z-50 max-w-64 rounded-xl border border-border bg-card-solid px-4 py-3 text-sm" />
      </header>

      <div>
        <h1 class="m-0 text-3xl font-black">WebP 圖片壓縮</h1>
        <p class="mt-1 mb-0 text-body">拖入圖片或整個資料夾，在瀏覽器本機壓成 WebP。圖片不會上傳到任何地方。</p>
      </div>

      <!-- 設定 -->
      <section class="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
        <div>
          <p class="m-0 mb-2 font-semibold text-label">壓縮品質</p>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <button v-for="p in PRESETS" :key="p.id" type="button" @click="setPreset(p.id)"
              class="cursor-pointer rounded-xl border px-2 py-2 transition-colors"
              :class="presetId === p.id
                ? 'border-neon-purple bg-accent-tint font-bold text-heading'
                : 'border-border bg-transparent text-body hover:border-border-glow'">
              {{ p.label }}
            </button>
          </div>
          <p class="mt-2 mb-0 text-body">{{ preset.hint }}</p>
        </div>

        <label class="flex flex-wrap items-center gap-3">
          <span class="font-semibold text-label">縮小尺寸</span>
          <select :value="maxEdge" @change="setMaxEdge($event.target.value)"
            class="cursor-pointer rounded-lg border border-border bg-input px-3 py-2 text-heading">
            <option v-for="m in MAX_EDGES" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
          <span class="text-body">預設維持原尺寸；只會縮小，不會放大。</span>
        </label>

        <div v-if="staleCount" class="flex flex-wrap items-center gap-3 rounded-xl bg-accent-tint px-3 py-2">
          <span>有 {{ staleCount }} 張是用舊設定壓的</span>
          <button type="button" @click="recompressAll"
            class="cursor-pointer rounded-lg border-0 bg-neon-purple px-3 py-1.5 font-semibold text-white hover:bg-neon-purple-hover">
            套用設定重新壓縮
          </button>
        </div>
      </section>

      <!-- 拖放區 -->
      <section class="rounded-2xl border-2 border-dashed border-border-glow bg-subtle p-6 text-center">
        <p class="m-0 text-xl font-bold">把圖片或資料夾拖到這裡</p>
        <p class="mt-1 mb-4 text-body">支援 PNG、JPG、WebP、AVIF、BMP；資料夾會連子資料夾一起處理。</p>
        <div class="flex flex-wrap justify-center gap-3">
          <button type="button" @click="fileInput.click()" :class="btnClass">選擇圖片</button>
          <button type="button" @click="folderInput.click()" :class="btnClass">選擇資料夾</button>
        </div>
        <input ref="fileInput" type="file" multiple accept="image/png,image/jpeg,image/webp,image/avif,image/bmp"
          class="hidden" @change="onPick" />
        <input ref="folderInput" type="file" webkitdirectory class="hidden" @change="onPick" />
      </section>

      <p v-if="notice" role="status" class="m-0 rounded-xl bg-accent-tint px-3 py-2 text-accent">{{ notice }}</p>

      <!-- 結果 -->
      <section v-if="items.length" class="flex flex-col gap-3">
        <div class="sticky top-0 z-10 flex flex-col gap-3 rounded-2xl border border-border bg-card-solid p-4">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <p class="m-0 font-bold">
              {{ doneItems.length }} / {{ items.length }} 張完成
              <span v-if="pendingCount" class="font-normal text-body">（壓縮中…）</span>
            </p>
            <p v-if="doneItems.length" class="m-0 text-body">
              {{ formatBytes(totals.original) }} → <b class="text-success-text">{{ formatBytes(totals.compressed) }}</b>
              （省 {{ percent(totals.saved) }}）
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" :disabled="!doneItems.length || busy" @click="run(downloadZip)" :class="btnClass">
              下載 ZIP
            </button>
            <button v-if="canSaveToFolder" type="button" :disabled="!doneItems.length || busy" @click="onSaveToFolder"
              :class="btnClass">
              存到資料夾
            </button>
            <button type="button" @click="clearAll"
              class="cursor-pointer rounded-xl border border-border bg-transparent px-4 py-2 text-body hover:border-border-glow">
              清空
            </button>
          </div>
          <p v-if="canSaveToFolder" class="m-0 text-body">「存到資料夾」會寫進你選的資料夾裡的 compressed/，不會動到原檔。</p>
        </div>

        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          <li v-for="item in items" :key="item.id"
            class="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
            <!-- 縮圖：按住看原圖 -->
            <div class="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface select-none"
              :title="item.status === 'done' ? '按住看原圖' : ''"
              @pointerdown="peekId = item.id" @pointerup="peekId = null" @pointerleave="peekId = null"
              @pointercancel="peekId = null">
              <img :src="peekId === item.id || !item.resultUrl ? item.srcUrl : item.resultUrl" alt="" loading="lazy"
                decoding="async" draggable="false" class="size-full object-contain" />
              <span v-if="item.status === 'queued' || item.status === 'working'"
                class="absolute inset-0 grid place-items-center bg-overlay text-sm">
                {{ item.status === 'working' ? '壓縮中' : '等待' }}
              </span>
            </div>

            <div class="min-w-0 flex-1">
              <p class="m-0 truncate font-semibold" :title="outPaths.get(item.id)">{{ outPaths.get(item.id) }}</p>
              <p v-if="item.status === 'done'" class="m-0 text-body">
                {{ formatBytes(item.file.size) }} → <b class="text-heading">{{ formatBytes(item.outBlob.size) }}</b>
                <span :class="item.outBlob.size < item.file.size ? 'text-success-text' : 'text-lemon'">
                  （{{ item.outBlob.size < item.file.size ? '省 ' + percent(1 - item.outBlob.size / item.file.size) : '+' + percent(item.outBlob.size / item.file.size - 1) }}）
                </span>
                · {{ item.width }}×{{ item.height }}
                <span v-if="item.width !== item.srcWidth" class="text-lemon">（原 {{ item.srcWidth }}×{{ item.srcHeight }}）</span>
              </p>
              <p v-else-if="item.status === 'error'" class="m-0 text-error-fg">失敗：{{ item.error }}</p>
              <p v-else class="m-0 text-body">{{ formatBytes(item.file.size) }}</p>
              <p v-if="item.keptOriginal" class="m-0 text-lemon">重壓後反而更大，已保留原檔</p>
            </div>

            <div class="flex shrink-0 gap-1">
              <a v-if="item.status === 'done'" :href="item.resultUrl" :download="outPaths.get(item.id).split('/').pop()"
                title="下載" aria-label="下載"
                class="grid size-10 place-items-center rounded-lg border border-border text-heading no-underline hover:border-border-glow">⬇</a>
              <button type="button" title="移除" aria-label="移除" @click="removeItem(item.id)"
                class="grid size-10 cursor-pointer place-items-center rounded-lg border border-border bg-transparent text-body hover:border-border-glow">✕</button>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import PwaInstallButton from '@/shared/components/PwaInstallButton.vue'
import { PRESETS, MAX_EDGES } from '../data/presets.js'
import { useWebpCompress } from '../composables/useWebpCompress.js'
import { incoming } from '../composables/useIncomingImages.js'
import { collectFromDrop, collectFromFileList } from '../utils/collect.js'

const {
  items, presetId, maxEdge, preset, staleCount, pendingCount, totals, doneItems, outPaths, canSaveToFolder,
  addFiles, removeItem, clearAll, setPreset, setMaxEdge, recompressAll, downloadZip, saveToFolder,
} = useWebpCompress()

const btnClass = 'cursor-pointer rounded-xl border-0 bg-neon-purple px-4 py-2 font-semibold text-white transition-colors hover:bg-neon-purple-hover disabled:cursor-not-allowed disabled:opacity-40'

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
