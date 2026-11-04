import encode from '@jsquash/webp/encode'

// 一次處理一張：解碼 → （選用）縮圖 → WebP 編碼。放 Worker 避免大量圖片時卡住畫面。
self.onmessage = async ({ data: { file, options, maxEdge } }) => {
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
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const buffer = await encode(ctx.getImageData(0, 0, width, height), options)
    self.postMessage({ ok: true, buffer, width, height, srcWidth, srcHeight }, [buffer])
  } catch (err) {
    self.postMessage({ ok: false, error: err?.message || String(err) })
  }
}
