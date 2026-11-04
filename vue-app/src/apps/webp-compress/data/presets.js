/**
 * 輸出格式與壓縮預設。options 直接傳給對應的編碼器：
 * - webp → @jsquash/webp（libwebp）。共通：method 6（最慢但最清晰）、use_sharp_yuv（保留邊緣色彩，避免色邊暈開）。
 *   lossless 模式下 quality 代表壓縮力度（越高越小、越慢），不是畫質。
 * - jpeg → @jsquash/jpeg（mozjpeg），quality 為畫質。
 * - png  → @jsquash/oxipng（無損最佳化），level 越高越小、越慢；PNG 沒有「畫質」。
 */
export const FORMATS = [
  { id: 'webp', label: 'WebP', ext: 'webp', mime: 'image/webp', inputRe: /\.webp$/i },
  { id: 'jpeg', label: 'JPEG', ext: 'jpg', mime: 'image/jpeg', inputRe: /\.jpe?g$/i },
  { id: 'png', label: 'PNG', ext: 'png', mime: 'image/png', inputRe: /\.png$/i },
]

export const PRESETS = {
  webp: [
    {
      id: 'high',
      label: '高畫質',
      hint: '肉眼幾乎看不出差異',
      options: { quality: 90, method: 6, use_sharp_yuv: 1, alpha_quality: 100 },
    },
    {
      id: 'balanced',
      label: '平衡',
      hint: '推薦：照片、一般圖片',
      options: { quality: 82, method: 6, use_sharp_yuv: 1, alpha_quality: 100 },
    },
    {
      id: 'small',
      label: '小檔案',
      hint: '細節略損，體積最小',
      options: { quality: 70, method: 6, use_sharp_yuv: 1, alpha_quality: 100 },
    },
    {
      id: 'near',
      label: '近無損',
      hint: '插畫、UI、遊戲美術',
      options: { lossless: 1, near_lossless: 60, quality: 100, method: 6 },
    },
    {
      id: 'lossless',
      label: '無損',
      hint: '像素風、文字截圖',
      options: { lossless: 1, quality: 100, method: 6 },
    },
  ],
  jpeg: [
    { id: 'high', label: '高畫質', hint: '肉眼幾乎看不出差異', options: { quality: 92 } },
    { id: 'balanced', label: '平衡', hint: '推薦：照片、一般圖片', options: { quality: 82 } },
    { id: 'small', label: '小檔案', hint: '細節略損，體積最小', options: { quality: 68 } },
  ],
  png: [
    { id: 'fast', label: '快速', hint: '無損最佳化，速度快', options: { level: 2 } },
    { id: 'standard', label: '標準', hint: '推薦：無損最佳化', options: { level: 4 } },
    { id: 'max', label: '極致', hint: '最小，但大圖會比較慢', options: { level: 6 } },
  ],
}

export const DEFAULT_PRESET = { webp: 'balanced', jpeg: 'balanced', png: 'standard' }

// 長邊上限（0 = 維持原尺寸，預設不縮圖）
export const MAX_EDGES = [
  { value: 0, label: '原尺寸' },
  { value: 3840, label: '長邊 3840' },
  { value: 2560, label: '長邊 2560' },
  { value: 1920, label: '長邊 1920' },
  { value: 1280, label: '長邊 1280' },
]

// JPEG 沒有透明度，透明區域要鋪底色
export const JPEG_BACKGROUNDS = [
  { value: '#ffffff', label: '白色' },
  { value: '#000000', label: '黑色' },
]
