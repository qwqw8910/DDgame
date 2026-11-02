'use strict';

// ================================================================
//  分帳系統 — 純運算邏輯（無 I/O，可獨立測試）
//
//  金額一律為「最小貨幣單位的整數」（TWD=元、USD=分），不使用浮點數。
// ================================================================

const crypto = require('node:crypto');

const MAX_NAME_LEN = 20;
const MAX_AMOUNT   = 1e12;

class BillError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── 名稱即 Key ────────────────────────────────────────────────────

/** 顯示用名稱：全形轉半形(NFKC)、去頭尾空白、連續空白合併為一個 */
function normalizeName(name) {
  return String(name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

/** 比對用 Key：正規化後再轉小寫（Amy = amy = ＡＭＹ） */
function nameKey(name) {
  return normalizeName(name).toLowerCase();
}

function validateName(name) {
  const n = normalizeName(name);
  if (!n) throw new BillError('INVALID_NAME', '名稱不可為空');
  if ([...n].length > MAX_NAME_LEN) throw new BillError('INVALID_NAME', `名稱最多 ${MAX_NAME_LEN} 個字`);
  return n;
}

/**
 * 由「房號 + 名稱 Key」推導固定的 playerId（UUID 格式）。
 * 同一房間、同一名稱，無論哪台裝置進來都得到相同 id → 房間模組視為同一人（重連）。
 */
function memberPlayerId(roomId, name) {
  const hex = crypto.createHash('sha256').update(`${roomId}\n${nameKey(name)}`).digest('hex').slice(0, 32).split('');
  hex[12] = '5';                                         // version
  hex[16] = '89ab'[parseInt(hex[16], 16) % 4];           // variant
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

// ── 金額驗證 ──────────────────────────────────────────────────────

function assertAmount(n, label = '金額') {
  if (!Number.isSafeInteger(n) || n <= 0 || n > MAX_AMOUNT) {
    throw new BillError('INVALID_AMOUNT', `${label}必須是大於 0 的整數`);
  }
}

// ── 最大餘數法：依權重把 total 分給多人，總和恆等於 total ─────────────
//  餘數相同時，排在前面的人先多拿 1（呼叫端可調整順序決定誰拿零頭）
function allocateProportional(total, weights) {
  const T = BigInt(total);
  const W = weights.map(w => BigInt(w));
  const S = W.reduce((a, b) => a + b, 0n);
  if (S <= 0n) throw new BillError('INVALID_SPLIT', '分攤權重總和必須大於 0');

  const base = W.map(w => (T * w) / S);
  const rem  = W.map(w => (T * w) % S);
  let left   = Number(T - base.reduce((a, b) => a + b, 0n));

  const order = rem.map((r, i) => ({ r, i })).sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = base.map(b => Number(b));
  for (let k = 0; left > 0; k++, left--) out[order[k].i] += 1;
  return out;
}

/**
 * 計算每人應分攤金額。
 * @param {number} total 支出總額
 * @param {'equal'|'exact'|'percent'|'shares'|'adjust'} splitType
 * @param {{memberId:string, value?:number}[]} participants 順序 = 零頭分配優先順序
 * @returns {{memberId:string, amount:number, share:number|null}[]}
 */
function computeSplits(total, splitType, participants) {
  assertAmount(total);
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new BillError('INVALID_SPLIT', '至少要有一位分攤者');
  }
  const ids = participants.map(p => p?.memberId);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
    throw new BillError('INVALID_SPLIT', '分攤者不可重複');
  }
  const vals = participants.map(p => p.value);

  let amounts;
  switch (splitType) {
    case 'equal':
      amounts = allocateProportional(total, ids.map(() => 1));
      break;

    case 'exact':
      if (vals.some(v => !Number.isSafeInteger(v) || v < 0)) {
        throw new BillError('INVALID_SPLIT', '指定金額必須是 0 以上的整數');
      }
      if (vals.reduce((a, b) => a + b, 0) !== total) {
        throw new BillError('INVALID_SPLIT_SUM', '每人金額加總必須等於支出總額');
      }
      amounts = vals;
      break;

    case 'percent': {
      if (vals.some(v => typeof v !== 'number' || !(v > 0))) {
        throw new BillError('INVALID_SPLIT', '百分比必須大於 0');
      }
      const bp = vals.map(v => Math.round(v * 100));        // 以 0.01% 為單位
      if (bp.reduce((a, b) => a + b, 0) !== 10000) {
        throw new BillError('INVALID_SPLIT_SUM', '百分比加總必須等於 100%');
      }
      amounts = allocateProportional(total, bp);
      break;
    }

    case 'shares': {
      if (vals.some(v => typeof v !== 'number' || !(v > 0))) {
        throw new BillError('INVALID_SPLIT', '份數必須大於 0');
      }
      amounts = allocateProportional(total, vals.map(v => Math.max(1, Math.round(v * 100))));
      break;
    }

    case 'adjust': {
      const adj = vals.map(v => v ?? 0);
      if (adj.some(v => !Number.isSafeInteger(v))) {
        throw new BillError('INVALID_SPLIT', '調整金額必須是整數');
      }
      const base = total - adj.reduce((a, b) => a + b, 0);
      if (base < 0) throw new BillError('INVALID_SPLIT_SUM', '調整金額加總超過支出總額');
      const even = allocateProportional(base, ids.map(() => 1));
      amounts = even.map((e, i) => e + adj[i]);
      if (amounts.some(a => a < 0)) throw new BillError('INVALID_SPLIT', '調整後有人金額小於 0');
      break;
    }

    default:
      throw new BillError('INVALID_SPLIT', `不支援的分攤方式：${splitType}`);
  }

  const hasShare = splitType === 'percent' || splitType === 'shares';
  return ids.map((memberId, i) => ({
    memberId,
    amount: amounts[i],
    share:  hasShare ? vals[i] : null,
  }));
}

/** 驗證付款人：至少一人、不重複、金額為正整數、加總 = 總額 */
function validatePayers(total, payers) {
  if (!Array.isArray(payers) || payers.length === 0) {
    throw new BillError('INVALID_PAYERS', '至少要有一位付款人');
  }
  const ids = payers.map(p => p?.memberId);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
    throw new BillError('INVALID_PAYERS', '付款人不可重複');
  }
  payers.forEach(p => assertAmount(p.amount, '付款金額'));
  if (payers.reduce((a, p) => a + p.amount, 0) !== total) {
    throw new BillError('INVALID_PAYERS_SUM', '付款金額加總必須等於支出總額');
  }
  return payers.map(p => ({ memberId: p.memberId, amount: p.amount }));
}

// ── 幣別與匯率 ────────────────────────────────────────────────────
//  匯率 rate = 「1 單位外幣 = rate 單位結算幣別」（主單位，例如 1 JPY = 0.21 TWD）。
//  整個群組每個外幣只有一個匯率；費用只存原幣金額，換算結果一律即時計算。

// 與前端 money.js 的 CURRENCIES 保持一致；未列出的幣別視為 2 位小數
const ZERO_DIGITS = new Set(['TWD', 'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'PYG', 'UGX', 'RWF', 'XAF', 'XOF', 'XPF', 'KMF', 'GNF', 'DJF', 'BIF', 'VUV']);
const THREE_DIGITS = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
const digitsOf = (code) => (ZERO_DIGITS.has(code) ? 0 : THREE_DIGITS.has(code) ? 3 : 2);

const MAX_RATE = 1e6;
const RATE_DECIMALS = 8;

function validateRate(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > MAX_RATE) {
    throw new BillError('INVALID_RATE', '匯率必須是大於 0 的數字');
  }
  const r = Number(n.toFixed(RATE_DECIMALS));
  if (r <= 0) throw new BillError('INVALID_RATE', '匯率太小');
  return r;
}

/** 最小單位整數 → 另一幣別的最小單位整數（四捨五入） */
function convertMinor(amount, from, to, rate) {
  if (from === to) return amount;
  return Math.round((amount / 10 ** digitsOf(from)) * rate * 10 ** digitsOf(to));
}

// ── 誰該給誰（兩兩對沖）────────────────────────────────────────────

/**
 * 把每筆支出換算成結算幣別後，算出兩兩之間的淨額。
 *   - 每位分攤者的份額，依付款比例分給各付款人（A 欠 B 多少是可追溯到每筆支出的）。
 *   - A↔B 互相欠的金額抵銷，只留淨額。
 *   - 缺匯率的支出不計入，幣別列在 missingRates。
 * @param {object} p
 * @param {object[]} p.expenses
 * @param {string} p.baseCurrency
 * @param {Record<string,{rate:number}>} p.rates
 * @returns {{ transfers: {from:string,to:string,amount:number,details:{expenseId:string,amount:number}[]}[],
 *             simplified: {from:string,to:string,amount:number}[], balances: Record<string,number>,
 *             breakdown: Record<string,{expenseId:string,paid:number,share:number}[]>,
 *             missingRates: string[] }}
 *   breakdown[m]：m 在每筆支出付了多少(paid)、該分攤多少(share)；Σ(paid − share) = balances[m]
 *   details.amount 以 from 的角度：正數 = from 因此筆欠 to，負數 = 這筆讓債務減少
 */
function computeDebts({ expenses = [], baseCurrency = 'TWD', rates = {} }) {
  const pairs = new Map();      // `${a}|${b}`(a<b) → { a, b, net, byExpense: Map }
  const missing = new Set();

  // 每人每筆支出（換算成結算幣別後）實際付了多少、該分攤多少 → 解釋「為什麼最後要付/收這些錢」
  const ledger = new Map();     // memberId → Map(expenseId → { paid, share })
  const addLedger = (memberId, expenseId, key, amount) => {
    if (amount === 0) return;
    let rows = ledger.get(memberId);
    if (!rows) ledger.set(memberId, rows = new Map());
    let row = rows.get(expenseId);
    if (!row) rows.set(expenseId, row = { paid: 0, share: 0 });
    row[key] += amount;
  };

  const addDebt = (debtor, creditor, amount, expenseId) => {
    if (debtor === creditor || amount === 0) return;
    const flip = debtor > creditor;                 // 以字典序較小者為 a，net>0 代表 a 欠 b
    const [a, b] = flip ? [creditor, debtor] : [debtor, creditor];
    const key = `${a}|${b}`;
    let pair = pairs.get(key);
    if (!pair) pairs.set(key, pair = { a, b, net: 0, byExpense: new Map() });
    const signed = flip ? -amount : amount;
    pair.net += signed;
    pair.byExpense.set(expenseId, (pair.byExpense.get(expenseId) ?? 0) + signed);
  };

  for (const e of expenses) {
    if (e.deletedAt) continue;
    const rate = e.currency === baseCurrency ? 1 : rates[e.currency]?.rate;
    if (!rate) { missing.add(e.currency); continue; }

    const total  = convertMinor(e.amount, e.currency, baseCurrency, rate);
    if (total <= 0) continue;
    const owed   = allocateProportional(total, e.splits.map(s => s.amount));
    const payerWeights = e.payers.map(p => p.amount);

    e.splits.forEach((s, j) => {
      if (owed[j] === 0) return;
      const parts = allocateProportional(owed[j], payerWeights);
      addLedger(s.memberId, e.id, 'share', owed[j]);
      e.payers.forEach((p, i) => {
        addLedger(p.memberId, e.id, 'paid', parts[i]);
        addDebt(s.memberId, p.memberId, parts[i], e.id);
      });
    });
  }

  const transfers = [];
  for (const { a, b, net, byExpense } of pairs.values()) {
    if (net === 0) continue;
    const sign = net > 0 ? 1 : -1;
    transfers.push({
      from: net > 0 ? a : b,
      to:   net > 0 ? b : a,
      amount: Math.abs(net),
      details: [...byExpense].filter(([, v]) => v !== 0).map(([expenseId, v]) => ({ expenseId, amount: v * sign })),
    });
  }
  transfers.sort((x, y) => y.amount - x.amount || (x.from < y.from ? -1 : 1));
  const simple = simplifyTransfers(transfers);
  const breakdown = {};
  for (const id of Object.keys(simple.balances)) {
    breakdown[id] = [...(ledger.get(id) ?? [])].map(([expenseId, r]) => ({ expenseId, paid: r.paid, share: r.share }));
  }
  return { transfers, ...simple, breakdown, missingRates: [...missing].sort() };
}

// ── 簡化債務：最少轉帳次數 ──────────────────────────────────────────

/**
 * 把兩兩對沖後的轉帳，改成「每人只看最後淨收支」的最少轉帳。
 *   例：尼莫→甜甜 200、甜甜→螺旋 400、螺旋→尼莫 200
 *       淨額：尼莫 0、甜甜 −200、螺旋 +200 → 甜甜直接給螺旋 200。
 * 做法：每人淨額 = 收到 − 付出；反覆讓「欠最多的人」付給「該收最多的人」，
 *       每筆至少結清一人，所以最多 (有淨額的人數 − 1) 筆。每人最後的收支與原本完全一致。
 * @param {{from:string,to:string,amount:number}[]} transfers
 * @returns {{ simplified: {from:string,to:string,amount:number}[], balances: Record<string,number> }}
 *   balances：每人淨收支（正 = 最後會收到、負 = 最後要付出），已排除淨額 0 的人
 */
function simplifyTransfers(transfers) {
  const net = new Map();
  for (const t of transfers) {
    net.set(t.from, (net.get(t.from) ?? 0) - t.amount);
    net.set(t.to,   (net.get(t.to)   ?? 0) + t.amount);
  }
  const balances = {};
  const creditors = [];
  const debtors = [];
  for (const [id, v] of [...net].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (v === 0) continue;
    balances[id] = v;
    (v > 0 ? creditors : debtors).push({ id, amount: Math.abs(v) });
  }

  const simplified = [];
  const biggest = (list) => list.reduce((m, x) => (x.amount > m.amount ? x : m));
  while (creditors.length && debtors.length) {
    const c = biggest(creditors);
    const d = biggest(debtors);
    const amount = Math.min(c.amount, d.amount);
    simplified.push({ from: d.id, to: c.id, amount });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) creditors.splice(creditors.indexOf(c), 1);
    if (d.amount === 0) debtors.splice(debtors.indexOf(d), 1);
  }
  simplified.sort((x, y) => y.amount - x.amount || (x.from < y.from ? -1 : 1));
  return { simplified, balances };
}

module.exports = {
  BillError,
  MAX_NAME_LEN,
  MAX_AMOUNT,
  normalizeName,
  nameKey,
  validateName,
  memberPlayerId,
  assertAmount,
  allocateProportional,
  computeSplits,
  validatePayers,
  digitsOf,
  validateRate,
  convertMinor,
  computeDebts,
  simplifyTransfers,
};
