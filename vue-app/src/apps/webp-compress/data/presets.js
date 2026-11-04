/**
 * WebP 壓縮預設。options 直接傳給 @jsquash/webp 的 encode（libwebp 參數）。
 * 共通：method 6（最慢但最清晰）、use_sharp_yuv（保留邊緣色彩，避免色邊暈開）。
 * lossless 模式下 quality 代表壓縮力度（越高越小、越慢），不是畫質。
 */
export const PRESETS = [
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
]

// 長邊上限（0 = 維持原尺寸，預設不縮圖）
export const MAX_EDGES = [
  { value: 0, label: '原尺寸' },
  { value: 3840, label: '長邊 3840' },
  { value: 2560, label: '長邊 2560' },
  { value: 1920, label: '長邊 1920' },
  { value: 1280, label: '長邊 1280' },
]
