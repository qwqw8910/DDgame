// ================================================================
//  甜點守衛戰 — 鍵盤快捷鍵
//  hasKeyboard：一開始用「有滑鼠＋可懸停」猜是電腦；平板接實體鍵盤時，
//  第一次按下非輸入框的按鍵也會切成 true。只用來決定要不要顯示按鍵提示，
//  快捷鍵本身任何時候都有效。
//
//  用 e.code（實體按鍵位置）判斷，開著注音輸入法時 e.key 會是 'Process'，
//  e.code 仍然是 'KeyR'、'Digit1'。
// ================================================================
import { ref, onMounted, onUnmounted } from 'vue'

const hasKeyboard = ref(
  typeof window !== 'undefined' && !!window.matchMedia?.('(any-hover: hover) and (any-pointer: fine)').matches,
)

function isTyping(target) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * @param {(code: string, e: KeyboardEvent) => boolean} handle  處理了就回傳 true（會 preventDefault）
 * @param {() => boolean} [enabled]  回傳 false 時整組快捷鍵暫停（例如說明彈窗開著）
 */
export function useGemTdKeys(handle, enabled = () => true) {
  function onKeydown(e) {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return
    if (isTyping(e.target)) return
    hasKeyboard.value = true
    if (e.repeat || !enabled()) return
    if (handle(e.code, e)) e.preventDefault()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown))

  return { hasKeyboard }
}

/** 說明頁與提示共用的按鍵清單 */
export const KEY_HELP = [
  { keys: ['1', '～', '5'], text: '選手上的甜點；五個都放完後，選要留下的那個' },
  { keys: ['K'], text: '保留選中的甜點' },
  { keys: ['M'], text: '合成選中的甜點（同種同級）' },
  { keys: ['R'], text: '準備好了，開始出怪' },
  { keys: ['U'], text: '提升甜點品質' },
  { keys: ['D'], text: '重骰手上的甜點（一個都還沒放時）' },
  { keys: ['S'], text: '選中的塔跟餅乾牆換位置／取消' },
  { keys: ['Del'], text: '拆除選中的餅乾牆' },
  { keys: ['B'], text: '打開／關閉合成表' },
  { keys: ['V'], text: '切換到下一位玩家的地圖' },
  { keys: ['F'], text: '切換 1／2 倍速（房主）' },
  { keys: ['H'], text: '打開怎麼玩' },
  { keys: ['Esc'], text: '取消選取、關閉合成表' },
]
