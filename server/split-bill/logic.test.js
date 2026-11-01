'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./logic');

const sum = arr => arr.reduce((a, b) => a + b, 0);
const ids = n => Array.from({ length: n }, (_, i) => ({ memberId: `m${i + 1}` }));

describe('名稱即 Key', () => {
  test('大小寫、全形、前後空白視為同名', () => {
    assert.equal(L.nameKey('Amy'), L.nameKey('  amy '));
    assert.equal(L.nameKey('Amy'), L.nameKey('ＡＭＹ'));
    assert.equal(L.nameKey('小   明'), L.nameKey('小 明'));
  });

  test('同房間同名 → 同一個 playerId；不同房間或不同名 → 不同', () => {
    const a = L.memberPlayerId('ROOM01', 'Amy');
    assert.equal(a, L.memberPlayerId('ROOM01', ' amy'));
    assert.notEqual(a, L.memberPlayerId('ROOM02', 'Amy'));
    assert.notEqual(a, L.memberPlayerId('ROOM01', 'Bob'));
    assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('validateName 擋空白與過長', () => {
    assert.throws(() => L.validateName('   '), { code: 'INVALID_NAME' });
    assert.throws(() => L.validateName('x'.repeat(21)), { code: 'INVALID_NAME' });
    assert.equal(L.validateName('  Amy  '), 'Amy');
  });
});

describe('computeSplits', () => {
  test('平均分攤：100 元分 3 人 = 34/33/33，總和不變', () => {
    const r = L.computeSplits(100, 'equal', ids(3));
    assert.deepEqual(r.map(x => x.amount), [34, 33, 33]);
  });

  test('平均分攤：1 元分 3 人，總和恆等於總額', () => {
    const r = L.computeSplits(1, 'equal', ids(3));
    assert.equal(sum(r.map(x => x.amount)), 1);
  });

  test('指定金額：加總需等於總額', () => {
    const ok = L.computeSplits(100, 'exact', [{ memberId: 'a', value: 70 }, { memberId: 'b', value: 30 }]);
    assert.deepEqual(ok.map(x => x.amount), [70, 30]);
    assert.throws(
      () => L.computeSplits(100, 'exact', [{ memberId: 'a', value: 70 }, { memberId: 'b', value: 20 }]),
      { code: 'INVALID_SPLIT_SUM' }
    );
  });

  test('百分比：加總需為 100，零頭以最大餘數法分配', () => {
    const r = L.computeSplits(100, 'percent', [
      { memberId: 'a', value: 33.33 }, { memberId: 'b', value: 33.33 }, { memberId: 'c', value: 33.34 },
    ]);
    assert.equal(sum(r.map(x => x.amount)), 100);
    assert.throws(
      () => L.computeSplits(100, 'percent', [{ memberId: 'a', value: 50 }, { memberId: 'b', value: 40 }]),
      { code: 'INVALID_SPLIT_SUM' }
    );
  });

  test('份數：2 大人 1 小孩 = 2:2:1', () => {
    const r = L.computeSplits(500, 'shares', [
      { memberId: 'a', value: 2 }, { memberId: 'b', value: 2 }, { memberId: 'c', value: 1 },
    ]);
    assert.deepEqual(r.map(x => x.amount), [200, 200, 100]);
  });

  test('調整式：先平分扣掉調整額，再加回各自的調整', () => {
    // 總額 100，a 多付 10 → 其餘 90 平分(45/45)，a = 45+10
    const r = L.computeSplits(100, 'adjust', [{ memberId: 'a', value: 10 }, { memberId: 'b', value: 0 }]);
    assert.deepEqual(r.map(x => x.amount), [55, 45]);
    assert.equal(sum(r.map(x => x.amount)), 100);
  });

  test('各種輸入錯誤', () => {
    assert.throws(() => L.computeSplits(0, 'equal', ids(2)), { code: 'INVALID_AMOUNT' });
    assert.throws(() => L.computeSplits(10.5, 'equal', ids(2)), { code: 'INVALID_AMOUNT' });
    assert.throws(() => L.computeSplits(100, 'equal', []), { code: 'INVALID_SPLIT' });
    assert.throws(() => L.computeSplits(100, 'equal', [{ memberId: 'a' }, { memberId: 'a' }]), { code: 'INVALID_SPLIT' });
    assert.throws(() => L.computeSplits(100, 'weird', ids(2)), { code: 'INVALID_SPLIT' });
  });

  test('隨機輸入：任何分攤方式的總和都恆等於總額', () => {
    for (let i = 0; i < 300; i++) {
      const total = 1 + Math.floor(Math.random() * 100000);
      const n = 1 + Math.floor(Math.random() * 8);
      const shares = Array.from({ length: n }, (_, k) => ({ memberId: `m${k}`, value: 1 + Math.floor(Math.random() * 5) }));
      assert.equal(sum(L.computeSplits(total, 'equal', ids(n)).map(x => x.amount)), total);
      assert.equal(sum(L.computeSplits(total, 'shares', shares).map(x => x.amount)), total);
    }
  });
});

describe('validatePayers', () => {
  test('加總需等於總額', () => {
    assert.deepEqual(L.validatePayers(100, [{ memberId: 'a', amount: 100 }]), [{ memberId: 'a', amount: 100 }]);
    assert.throws(() => L.validatePayers(100, [{ memberId: 'a', amount: 60 }]), { code: 'INVALID_PAYERS_SUM' });
    assert.throws(() => L.validatePayers(100, []), { code: 'INVALID_PAYERS' });
  });
});

describe('匯率換算', () => {
  test('JPY → TWD（皆 0 位小數）、USD → TWD（2 → 0 位小數）', () => {
    assert.equal(L.convertMinor(3000, 'JPY', 'TWD', 0.21), 630);
    assert.equal(L.convertMinor(1050, 'USD', 'TWD', 32), 336);      // 10.50 USD × 32
    assert.equal(L.convertMinor(630, 'TWD', 'USD', 1 / 32), 1969);  // 630 TWD → 19.69 USD
    assert.equal(L.convertMinor(500, 'TWD', 'TWD', 99), 500, '同幣別不套匯率');
  });

  test('validateRate 擋掉非正數、非數字、過大', () => {
    for (const bad of [0, -1, NaN, Infinity, '0.2', null, 1e7]) {
      assert.throws(() => L.validateRate(bad), { code: 'INVALID_RATE' });
    }
    assert.equal(L.validateRate(0.2123456789), 0.21234568);
  });
});

describe('誰該給誰（兩兩對沖）', () => {
  const expense = (id, payers, splits, extra = {}) => ({
    id, currency: 'TWD', deletedAt: null, amount: payers.reduce((a, p) => a + p[1], 0),
    payers: payers.map(([memberId, amount]) => ({ memberId, amount })),
    splits: splits.map(([memberId, amount]) => ({ memberId, amount })),
    ...extra,
  });
  const debts = (expenses, rates = {}) => L.computeDebts({ expenses, baseCurrency: 'TWD', rates });

  test('A 墊 300 三人均分：B、C 各給 A 100，明細指向該筆支出', () => {
    const { transfers } = debts([expense('e1', [['A', 300]], [['A', 100], ['B', 100], ['C', 100]])]);
    assert.equal(transfers.length, 2);
    for (const who of ['B', 'C']) {
      const t = transfers.find(x => x.from === who);
      assert.equal(t.to, 'A');
      assert.equal(t.amount, 100);
      assert.deepEqual(t.details, [{ expenseId: 'e1', amount: 100 }]);
    }
  });

  test('互相欠的會抵銷：A 墊 100 兩人分、B 墊 60 兩人分 → B 給 A 20', () => {
    const { transfers } = debts([
      expense('e1', [['A', 100]], [['A', 50], ['B', 50]]),
      expense('e2', [['B', 60]], [['A', 30], ['B', 30]]),
    ]);
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].from, 'B');
    assert.equal(transfers[0].to, 'A');
    assert.equal(transfers[0].amount, 20);
    assert.deepEqual(transfers[0].details, [{ expenseId: 'e1', amount: 50 }, { expenseId: 'e2', amount: -30 }]);
  });

  test('完全抵銷就不出現；已刪除的支出不計', () => {
    assert.deepEqual(debts([
      expense('e1', [['A', 100]], [['A', 50], ['B', 50]]),
      expense('e2', [['B', 100]], [['A', 50], ['B', 50]]),
    ]).transfers, []);
    assert.deepEqual(debts([expense('e1', [['A', 100]], [['A', 50], ['B', 50]], { deletedAt: 'x' })]).transfers, []);
  });

  test('外幣依群組匯率換算；改匯率後同一筆支出的金額跟著變', () => {
    const jpy = expense('e1', [['A', 3000]], [['A', 1500], ['B', 1500]], { currency: 'JPY' });
    assert.equal(debts([jpy], { JPY: { rate: 0.2 } }).transfers[0].amount, 300);
    assert.equal(debts([jpy], { JPY: { rate: 0.25 } }).transfers[0].amount, 375);
  });

  test('缺匯率的支出不計入，並回報缺的幣別', () => {
    const r = debts([expense('e1', [['A', 3000]], [['A', 1500], ['B', 1500]], { currency: 'JPY' })]);
    assert.deepEqual(r.transfers, []);
    assert.deepEqual(r.missingRates, ['JPY']);
  });

  test('多人付款、除不盡：明細加總 = 淨額，且總和不多不少', () => {
    for (let round = 0; round < 200; round++) {
      const cents = 100 + Math.floor(Math.random() * 100000);
      const half  = Math.floor(cents / 2);
      const e = expense('e', [['A', half], ['B', cents - half]], []);
      e.splits = L.computeSplits(cents, 'equal', ['A', 'B', 'C'].map(memberId => ({ memberId })));
      const { transfers } = debts([e]);
      for (const t of transfers) assert.equal(sum(t.details.map(d => d.amount)), t.amount);
      // 每人淨額(收 − 付) 加總為 0
      const net = {};
      for (const t of transfers) { net[t.from] = (net[t.from] ?? 0) - t.amount; net[t.to] = (net[t.to] ?? 0) + t.amount; }
      assert.equal(sum(Object.values(net)), 0);
    }
  });
});
