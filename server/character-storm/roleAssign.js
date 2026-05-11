'use strict';

// ================================================================
//  默契傳聲筒 — 角色分配邏輯
// ================================================================

/**
 * 角色分配表
 * 第一位：猜題者（依 currentGuesserIndex 輪轉）
 * 其餘依序：2字、4字、6字 提示者
 *
 * 總人數  猜題者  2字  4字  6字
 *   4       1     2    1    0
 *   5       1     2    2    0
 *   6       1     2    2    1
 *   7       1     2    2    2
 *  8+       1     3    3    剩餘
 */
const ROLE_TABLE = {
  4: { clue2: 2, clue4: 1, clue6: 0 },
  5: { clue2: 2, clue4: 2, clue6: 0 },
  6: { clue2: 2, clue4: 2, clue6: 1 },
  7: { clue2: 2, clue4: 2, clue6: 2 },
};

/**
 * 根據玩家總數取得各角色數量
 * @param {number} total
 * @returns {{ clue2: number, clue4: number, clue6: number }}
 */
function getRoleCounts(total) {
  if (ROLE_TABLE[total]) return ROLE_TABLE[total];
  // 8 人以上：3 + 3 + 剩餘全部給 6字
  const providers = total - 1; // 扣掉猜題者
  const clue6 = providers - 3 - 3;
  return { clue2: 3, clue4: 3, clue6: Math.max(0, clue6) };
}

/**
 * 為一局分配角色
 *
 * @param {Array<{id:string}>} players          - 依 join_order 排列的玩家陣列
 * @param {number}             guesserIndex     - 本局猜題者在 players 中的 index
 * @returns {Array<{id, role, quota}>}
 *   role:  'guesser' | 'clue-2' | 'clue-4' | 'clue-6'
 *   quota: null | 2 | 4 | 6
 */
function assignRoles(players, guesserIndex) {
  const total     = players.length;
  const counts    = getRoleCounts(total);

  // 建立提示者序列（猜題者排除後，從 guesserIndex+1 開始循環）
  const providers = [];
  for (let i = 1; i < total; i++) {
    providers.push(players[(guesserIndex + i) % total]);
  }

  const assignments = [];

  // 猜題者
  assignments.push({
    id:    players[guesserIndex].id,
    role:  'guesser',
    quota: null,
  });

  // 提示者（依 providers 順序分配字數）
  let pIdx = 0;
  const slots = [
    ...Array(counts.clue2).fill(['clue-2', 2]),
    ...Array(counts.clue4).fill(['clue-4', 4]),
    ...Array(counts.clue6).fill(['clue-6', 6]),
  ];

  for (const [role, quota] of slots) {
    if (pIdx >= providers.length) break;
    assignments.push({ id: providers[pIdx].id, role, quota });
    pIdx++;
  }

  return assignments;
}

module.exports = { assignRoles, getRoleCounts };
