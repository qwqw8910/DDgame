// 一次處理一張：解碼 → （選用）縮圖 → 依輸出格式編碼。放 Worker 避免大量圖片時卡住畫面。
// 編碼器用動態 import，只有選到該格式才會載入對應的 WASM。

async function encodeWebp(imageData, options) {
  const { default: encode } = await import('@jsquash/webp/encode')
  return encode(imageData, options)
}

async function encodeJpeg(imageData, options) {
  const { default: encode } = await import('@jsquash/jpeg/encode')
  return encode(imageData, options)
}

async function encodePng(imageData, options) {
  // 直接用單執行緒版：多執行緒版需要 SharedArrayBuffer（跨來源隔離），GitHub Pages 無法提供
  const { default: init, optimise_raw } = await import('@jsquash/oxipng/codec/pkg/squoosh_oxipng.js')
  await init()
  const out = optimise_raw(imageData.data, imageData.width, imageData.height, options.level, false, false)
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength)
}

const ENCODERS = { webp: encodeWebp, jpeg: encodeJpeg, png: encodePng }

self.onmessage = async ({ data: { file, format, options, maxEdge, background } }) => {
  try {
    const bitmap = await createImageBitmap(file) // 預設會套用 EXIF 方向
    const { width: srcWidth, height: srcHeight } = bitmap
    const longEdge = Math.max(srcWidth, srcHeight)
    const scale = maxEdge && longEdge > maxEdge ? maxEdge / longEdge : 1
    const width = Math.max(1, Math.round(srcWidth * scale))
    const height = Math.max(1, Math.round(srcHeight * scale))

    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingQuality = 'high'
    if (format === 'jpeg') {
      ctx.fillStyle = background
      ctx.fillRect(0, 0, width, height)
    }
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const buffer = await ENCODERS[format](ctx.getImageData(0, 0, width, height), options)
    self.postMessage({ ok: true, buffer, width, height, srcWidth, srcHeight }, [buffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err?.message || String(err) })
  }
}
