import { ref, computed, onBeforeUnmount } from 'vue'
import { FORMATS, PRESETS, DEFAULT_PRESET, JPEG_BACKGROUNDS } from '../data/presets.js'
import { buildZip } from '../utils/zip.js'

const SETTINGS_KEY = 'webp-compress-settings'
const POOL_SIZE = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1))

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {} } catch { return {} }
}

function saveSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* storage unavailable */ }
}

function toOutputPath(relPath, ext) {
  return relPath.replace(/\.[^./]+$/, '') + '.' + ext
}

let nextId = 1

export function useWebpCompress() {
  const saved = loadSettings()
  const format = ref(FORMATS.some((f) => f.id === saved.format) ? saved.format : 'webp')
  // 每種格式各記一個預設，切換格式時不用重選
  const presetIds = ref(Object.fromEntries(
    FORMATS.map((f) => [f.id, PRESETS[f.id].some((p) => p.id === saved.presetIds?.[f.id]) ? saved.presetIds[f.id] : DEFAULT_PRESET[f.id]]),
  ))
  const maxEdge = ref(Number(saved.maxEdge) || 0)
  const background = ref(JPEG_BACKGROUNDS.some((b) => b.value === saved.background) ? saved.background : JPEG_BACKGROUNDS[0].value)
  const items = ref([])

  const formatInfo = computed(() => FORMATS.find((f) => f.id === format.value))
  const presets = computed(() => PRESETS[format.value])
  const presetId = computed(() => presetIds.value[format.value])
  const preset = computed(() => presets.value.find((p) => p.id === presetId.value))
  // 底色只影響 JPEG，其他格式不該因為它而被判定為「舊設定」
  const settingsKey = computed(() =>
    `${format.value}|${presetId.value}|${maxEdge.value}|${format.value === 'jpeg' ? background.value : ''}`)

  // ── Worker 池（第一次加入圖片時才建立，載入 WASM 較重） ──
  const pool = []
  function ensurePool() {
    while (pool.length < POOL_SIZE) {
      pool.push({ worker: new Worker(new URL('../workers/compress.worker.js', import.meta.url), { type: 'module' }), busy: false })
    }
  }

  function pump() {
    for (const slot of pool) {
      if (slot.busy) continue
      const item = items.value.find((i) => i.status === 'queued')
      if (!item) return
      dispatch(slot, item)
    }
  }

  function dispatch(slot, item) {
    const token = ++item.token
    item.status = 'working'
    item.key = settingsKey.value
    item.outFormat = format.value
    slot.busy = true
    const release = () => { slot.busy = false; pump() }
    slot.worker.onmessage = ({ data }) => {
      // token 不符 = 這張在處理途中被移除或重新排隊，結果作廢
      if (item.token === token && item.status === 'working') finish(item, data)
      release()
    }
    slot.worker.onerror = (e) => {
      if (item.token === token && item.status === 'working') fail(item, e.message || '壓縮失敗')
      release()
    }
    slot.worker.postMessage({
      file: item.file,
      format: format.value,
      options: { ...preset.value.options },
      maxEdge: maxEdge.value,
      background: background.value,
    })
  }

  function setResult(item, blob) {
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
    item.outBlob = blob
    item.resultUrl = URL.createObjectURL(blob)
  }

  function finish(item, data) {
    if (!data.ok) return fail(item, data.error)
    const info = FORMATS.find((f) => f.id === item.outFormat)
    const encoded = new Blob([data.buffer], { type: info.mime })
    // 原檔格式和輸出相同、且重壓後反而更大：保留原檔，不倒退（跨格式轉換是使用者要的，不保留）
    const keepOriginal = info.inputRe.test(item.file.name) && encoded.size >= item.file.size
    item.keptOriginal = keepOriginal
    item.width = data.width
    item.height = data.height
    item.srcWidth = data.srcWidth
    item.srcHeight = data.srcHeight
    item.error = ''
    setResult(item, keepOriginal ? item.file : encoded)
    item.status = 'done'
  }

  function fail(item, message) {
    item.error = message
    item.status = 'error'
  }

  // ── 加入／移除 ──
  function addFiles(entries) {
    if (!entries.length) return
    ensurePool()
    for (const { file, relPath } of entries) {
      items.value.push({
        id: nextId++,
        file,
        relPath,
        srcUrl: URL.createObjectURL(file),
        resultUrl: '',
        outBlob: null,
        status: 'queued',
        key: '',
        outFormat: 'webp',
        token: 0,
        keptOriginal: false,
        width: 0,
        height: 0,
        srcWidth: 0,
        srcHeight: 0,
        error: '',
      })
    }
    pump()
  }

  function disposeItem(item) {
    item.token++
    item.status = 'removed'
    URL.revokeObjectURL(item.srcUrl)
    if (item.resultUrl) URL.revokeObjectURL(item.resultUrl)
  }

  function removeItem(id) {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx < 0) return
    disposeItem(items.value[idx])
    items.value.splice(idx, 1)
  }

  function clearAll() {
    items.value.forEach(disposeItem)
    items.value = []
  }

  // ── 設定 ──
  function persist() {
    saveSettings({ format: format.value, presetIds: presetIds.value, maxEdge: maxEdge.value, background: background.value })
  }

  function setPreset(id) { presetIds.value[format.value] = id; persist() }
  function setFormat(id) { format.value = id; persist() }
  function setBackground(value) { background.value = value; persist() }
  function setMaxEdge(value) { maxEdge.value = Number(value); persist() }

  // 設定改變不會自動重壓（大量圖片會很慢），由使用者按「套用設定重新壓縮」
  const staleCount = computed(() => items.value.filter((i) => i.status === 'done' && i.key !== settingsKey.value).length)

  function recompressAll() {
    for (const item of items.value) {
      if (item.status === 'working') item.token++
      item.status = 'queued'
    }
    pump()
  }

  // ── 輸出路徑（同資料夾內不同副檔名同名時加 -2、-3） ──
  const outPaths = computed(() => {
    const used = new Set()
    const map = new Map()
    for (const item of items.value) {
      const ext = FORMATS.find((f) => f.id === (item.status === 'done' ? item.outFormat : format.value)).ext
      const path = item.keptOriginal ? item.relPath : toOutputPath(item.relPath, ext)
      let candidate = path
      for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = path.replace(/(\.[^./]+)?$/, `-${n}$1`)
      used.add(candidate.toLowerCase())
      map.set(item.id, candidate)
    }
    return map
  })

  const doneItems = computed(() => items.value.filter((i) => i.status === 'done'))
  const pendingCount = computed(() => items.value.filter((i) => i.status === 'queued' || i.status === 'working').length)
  const totals = computed(() => {
    const original = doneItems.value.reduce((sum, i) => sum + i.file.size, 0)
    const compressed = doneItems.value.reduce((sum, i) => sum + i.outBlob.size, 0)
    return { original, compressed, saved: original ? 1 - compressed / original : 0 }
  })

  // ── 輸出 ──
  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  async function downloadZip() {
    const entries = doneItems.value.map((i) => ({ path: outPaths.value.get(i.id), blob: i.outBlob }))
    triggerDownload(await buildZip(entries), 'webp-compressed.zip')
  }

  const canSaveToFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window

  /** 寫進使用者選的資料夾內的 compressed/，不覆蓋原檔。回傳寫入數量，取消則回傳 -1。 */
  async function saveToFolder() {
    let root
    try {
      root = await window.showDirectoryPicker({ mode: 'readwrite' })
    } catch (e) {
      if (e?.name === 'AbortError') return -1
      throw e
    }
    const base = await root.getDirectoryHandle('compressed', { create: true })
    let count = 0
    for (const item of doneItems.value) {
      const segments = outPaths.value.get(item.id).split('/')
      const filename = segments.pop()
      let dir = base
      for (const seg of segments) dir = await dir.getDirectoryHandle(seg, { create: true })
      const handle = await dir.getFileHandle(filename, { create: true })
      const writable = await handle.createWritable()
      await writable.write(item.outBlob)
      await writable.close()
      count++
    }
    return count
  }

  onBeforeUnmount(() => {
    clearAll()
    pool.forEach((slot) => slot.worker.terminate())
    pool.length = 0
  })

  return {
    items, format, formatInfo, presets, presetId, maxEdge, background, preset, staleCount, pendingCount, totals, doneItems, outPaths, canSaveToFolder,
    addFiles, removeItem, clearAll, setFormat, setPreset, setMaxEdge, setBackground, recompressAll, downloadZip, saveToFolder, triggerDownload,
  }
}
