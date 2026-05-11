'use strict';

// ================================================================
//  默契傳聲筒 — 字元重複判定與符號代換
// ================================================================

const SYMBOLS = ['●', '▲', '■', '◆', '★', '✖', '✚', '⬢'];

/**
 * 處理一輪提示：判定重複字元並產出雙視角結果
 *
 * @param {Array<{id:string, text:string}>} hints          - 本輪提示
 * @param {Object}                          inheritedMap   - 上一輪已建立的映射（第一輪傳 {}）
 * @returns {{ forProvider, forGuesser, symbolMap }}
 *
 * forProvider (提示者視角): Array<{ playerId, chars:[{char, isConflict}] }>
 * forGuesser  (猜題者視角): Array<{ playerId, maskedText }>
 * symbolMap   : { '字': '●' }  跨輪共用，下一輪繼承此物件
 */
function processHints(hints, inheritedMap = {}) {
  // Step 1：統計每個字出現在幾位「不同玩家」的提示中
  const charPlayerMap = {}; // { '字': Set<playerId> }
  for (const { id, text } of hints) {
    for (const char of [...text]) {
      if (!charPlayerMap[char]) charPlayerMap[char] = new Set();
      charPlayerMap[char].add(id);
    }
  }

  // Step 2：建立 symbolMap（繼承上輪 + 補充本輪新發現的重複字）
  const symbolMap  = { ...inheritedMap };
  const usedSet    = new Set(Object.values(symbolMap));
  const symbolPool = SYMBOLS.filter(s => !usedSet.has(s));
  let poolIdx      = 0;

  // 依字元首次出現順序穩定排序（Object.keys 在 V8 中對非整數 key 保持插入順序）
  for (const [char, playerSet] of Object.entries(charPlayerMap)) {
    if (playerSet.size >= 2 && !symbolMap[char]) {
      symbolMap[char] = symbolPool[poolIdx++] ?? '?';
    }
  }

  // Step 3：產出雙視角
  const forProvider = hints.map(({ id, text }) => ({
    playerId: id,
    chars: [...text].map(char => ({ char, isConflict: !!symbolMap[char] })),
  }));

  const forGuesser = hints.map(({ id, text }) => ({
    playerId: id,
    maskedText: [...text].map(c => symbolMap[c] ?? c).join(''),
  }));

  return { forProvider, forGuesser, symbolMap };
}

/**
 * 驗證提示文字是否符合規則
 *
 * @param {string} text    - 玩家輸入（已 trim）
 * @param {number} quota   - 分配字數
 * @returns {{ valid:boolean, reason?:string }}
 */
function validateHint(text, quota, wordChars = null) {
  if (!text || typeof text !== 'string') {
    return { valid: false, reason: '提示不得為空' };
  }

  const stripped = text.replace(/\s/g, '');

  // 禁止字元：數字、英文、半形/全形標點、Emoji
  // 只允許 CJK 統一漢字 (U+4E00–U+9FFF) 與 CJK 擴充 A (U+3400–U+4DBF)
  const cjkOnly = /^[\u4e00-\u9fff\u3400-\u4dbf]+$/;
  if (!cjkOnly.test(stripped)) {
    return { valid: false, reason: '只能輸入中文字，不可含數字、英文、標點或 Emoji' };
  }

  // 不可含有題目本身的字
  if (wordChars && wordChars.size > 0) {
    const forbidden = [...stripped].filter(c => wordChars.has(c));
    if (forbidden.length > 0) {
      const unique = [...new Set(forbidden)].join('、');
      return { valid: false, reason: `提示中不可含有題目的字「${unique}」` };
    }
  }

  const charCount = [...stripped].length;
  if (charCount < 1 || charCount > quota) {
    return { valid: false, reason: `請輸入 1 ～ ${quota} 個中文字，目前輸入了 ${charCount} 個` };
  }

  return { valid: true };
}

module.exports = { processHints, validateHint };
