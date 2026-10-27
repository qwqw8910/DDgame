'use strict';

// ================================================================
//  默契字囊團 — 間諜機制（純函式，無 socket / 狀態依賴）
//
//  規則：
//   - 房主開房時選擇是否加入間諜（options.spyEnabled）；啟用後每個猜題回合隨機指派 1 位提示者為間諜
//   - 間諜只在第一輪提示階段可發動一次，指定一位提示者
//   - 被指定者第一輪提示中「隨機一個字」對其他人遮成 SPY_MARK，被指定者自己仍看得到
//   - 不通知任何人有人發動；結果翻開時遮擋字以特殊樣式顯示，全員一起猜
// ================================================================

const SPY_MARK = '？';

/** 間諜需要有其他提示者可以指定，所以至少要 2 位提示者 */
function canHaveSpy(providerCount) {
  return providerCount >= 2;
}

/** 從候選提示者 id 中隨機挑 1 位間諜；沒有候選時回傳 null */
function pickSpyId(candidateIds, rand = Math.random) {
  if (!candidateIds.length) return null;
  return candidateIds[Math.floor(rand() * candidateIds.length)];
}

function createSpyState(spyId = null) {
  return { spyId, targetId: null, used: false, mask: null };
}

/**
 * 驗證間諜發動請求
 * @returns {{ ok:boolean, reason?:string }}
 */
function validateSpyUse(spy, { playerId, targetId, roundPhase, providerIds }) {
  if (!spy?.spyId || spy.spyId !== playerId) return { ok: false, reason: '你不是間諜' };
  if (roundPhase !== 'round1')               return { ok: false, reason: '只有第一輪提示階段可以發動' };
  if (spy.used)                              return { ok: false, reason: '本回合已發動過' };
  if (targetId === playerId)                 return { ok: false, reason: '不能指定自己' };
  if (!providerIds.includes(targetId))       return { ok: false, reason: '只能指定其他提示者' };
  return { ok: true };
}

/**
 * 依被指定者的提示決定遮擋哪一個字
 * @param {Array<{id:string,text:string}>} hints
 * @returns {{ playerId:string, index:number, char:string } | null}  被指定者沒出牌時回傳 null（技能作廢）
 */
function rollSpyMask(hints, targetId, rand = Math.random) {
  if (!targetId) return null;
  const hint = hints.find(h => h.id === targetId);
  const chars = hint ? [...hint.text] : [];
  if (!chars.length) return null;
  const index = Math.floor(rand() * chars.length);
  return { playerId: targetId, index, char: chars[index] };
}

/** 猜題者視角：被遮的字換成 SPY_MARK */
function maskGuesserHints(forGuesser, mask) {
  if (!mask) return forGuesser;
  return forGuesser.map(h => {
    if (h.playerId !== mask.playerId) return h;
    const chars = [...h.maskedText];
    chars[mask.index] = SPY_MARK;
    return { ...h, maskedText: chars.join('') };
  });
}

/**
 * 提示者視角（依觀看者客製）：被指定者自己看得到原字，其他人看到 SPY_MARK。
 * 兩種視角都帶 isSpyMasked 旗標，前端據此套特殊樣式。
 */
function maskProviderHints(forProvider, mask, viewerId) {
  if (!mask) return forProvider;
  return forProvider.map(h => {
    if (h.playerId !== mask.playerId) return h;
    const chars = h.chars.map((c, i) => {
      if (i !== mask.index) return c;
      return viewerId === mask.playerId
        ? { ...c, isSpyMasked: true }
        : { char: SPY_MARK, isConflict: false, isSpyMasked: true };
    });
    return { ...h, chars };
  });
}

/** 對外公開的遮擋位置（不含原字、不含間諜身分） */
function publicMask(mask) {
  return mask ? { playerId: mask.playerId, index: mask.index } : null;
}

module.exports = {
  SPY_MARK,
  canHaveSpy, pickSpyId, createSpyState, validateSpyUse,
  rollSpyMask, maskGuesserHints, maskProviderHints, publicMask,
};
