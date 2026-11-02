'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { processHints, normalizeAnswer, isAnswerCorrect, buildCollisions } = require('./filterLogic');

describe('isAnswerCorrect', () => {
  test('完全相同', () => assert.equal(isAnswerCorrect('臭豆腐', '臭豆腐'), true));
  test('忽略半形／全形空白與標點', () => {
    assert.equal(isAnswerCorrect(' 臭豆腐 ', '臭豆腐'), true);
    assert.equal(isAnswerCorrect('臭　豆 腐', '臭豆腐'), true);
    assert.equal(isAnswerCorrect('臭豆腐！', '臭豆腐'), true);
  });
  test('英文大小寫與全形英文視為相同', () => {
    assert.equal(isAnswerCorrect('ＮＢＡ', 'nba'), true);
  });
  test('同義答案 aliases', () => {
    assert.equal(isAnswerCorrect('珍奶', '珍珠奶茶', ['珍奶']), true);
    assert.equal(isAnswerCorrect('波霸', '珍珠奶茶', ['珍奶']), false);
  });
  test('空白答案與沒有 aliases 欄位', () => {
    assert.equal(isAnswerCorrect('', '臭豆腐'), false);
    assert.equal(isAnswerCorrect('   ', '臭豆腐', undefined), false);
  });
  test('錯字不算對', () => assert.equal(isAnswerCorrect('臭豆富', '臭豆腐'), false));
});

describe('normalizeAnswer', () => {
  test('null／undefined 安全', () => {
    assert.equal(normalizeAnswer(null), '');
    assert.equal(normalizeAnswer(undefined), '');
  });
});

describe('buildCollisions', () => {
  test('彙整撞字與使用者（跨輪去重）', () => {
    const r1 = processHints([
      { id: 'a', text: '發酵' }, { id: 'b', text: '好臭' }, { id: 'c', text: '聞起來臭' },
    ]);
    const r2 = processHints([
      { id: 'a', text: '臭味' }, { id: 'b', text: '很香' },
    ], r1.symbolMap);
    const cols = buildCollisions([r1.forProvider, r2.forProvider], r2.symbolMap);
    assert.equal(cols.length, 1);
    assert.equal(cols[0].char, '臭');
    assert.deepEqual(cols[0].playerIds.sort(), ['a', 'b', 'c']);
    assert.equal(cols[0].symbol, r2.symbolMap['臭']);
  });
  test('沒有撞字回傳空陣列', () => {
    const r = processHints([{ id: 'a', text: '發酵' }, { id: 'b', text: '好吃' }]);
    assert.deepEqual(buildCollisions([r.forProvider], r.symbolMap), []);
  });
});
