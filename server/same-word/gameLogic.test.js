'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./gameLogic');

const T0 = 1_000_000;
const ids = n => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const SOLO = 'abcdefghijkl';

function newGame(n, options = {}) {
  const g = L.createGame(options);
  L.startGame(g, ids(n), { now: T0 });
  return g;
}

// 每人預設寫一個彼此不同的詞；overrides 指定誰寫什麼（值為 null 代表逾時未送出）
function wordsFor(n, overrides = {}) {
  const w = {};
  ids(n).forEach((id, i) => { w[id] = `solo${SOLO[i]}`; });
  return { ...w, ...overrides };
}

// 送出並揭曉一輪
function play(g, n, overrides = {}) {
  const now = g.roundEndsAt;
  for (const [id, word] of Object.entries(wordsFor(n, overrides))) {
    if (word !== null && !g.leftIds.includes(id)) L.submitWord(g, id, word, { now: now - 1000 });
  }
  return L.settleRound(g, { now });
}
const next = g => L.nextRound(g, { now: g.roundEndsAt });
// 揭曉一輪，還沒結束就進下一輪
function step(g, n, overrides) {
  const r = play(g, n, overrides);
  if (!L.checkEnd(g)) next(g);
  return r;
}
const pair = (g, a, b) => L.pairStats(g, { includeLeft: true }).find(p => p.key === [a, b].sort().join('|'));

test('正規化：中文與英文通過，數字／假名／注音／標點拒絕', () => {
  assert.equal(L.normalizeWord('蘋果'), '蘋果');
  assert.equal(L.normalizeWord('iPhone手機'), 'iPhone手機');
  for (const bad of ['123', 'かな', 'ㄅㄆ', 'a b!', '', '   ', '一二三四五六七八九十一二三', null, 5]) {
    assert.equal(L.normalizeWord(bad), null, String(bad));
  }
});

test('正規化：英文不分大小寫、全形轉半形、頭尾空白去掉', () => {
  const key = s => L.wordKey(L.normalizeWord(s));
  assert.equal(key('Apple'), key('apple'));
  assert.equal(key('ＡＰＰＬＥ'), key('apple'));
  assert.equal(key('apple '), key('Apple'));
  assert.notEqual(key('蘋果'), key('apple'));
});

test('蘋果與苹果：都通過檢查，但視為不同的詞', () => {
  assert.equal(L.normalizeWord('苹果'), '苹果');
  const g = newGame(3);
  play(g, 3, { p1: '蘋果', p2: '苹果' });
  assert.equal(g.pairs['p1|p2'], undefined);
});

test('Apple／apple／蘋果：前兩者相同，第三者不同', () => {
  const g = newGame(3);
  const r = play(g, 3, { p1: 'Apple', p2: 'apple ', p3: '蘋果' });
  assert.deepEqual(r.groups, [['p1', 'p2'], ['p3']]);
  assert.equal(L.checkEnd(g), 'allPaired');
});

test('3 人同輪寫西瓜：3 對皆第 1 輪天生一對 100%，無人落單', () => {
  const g = newGame(3);
  play(g, 3, { p1: '西瓜', p2: '西瓜', p3: '西瓜' });
  const stats = L.pairStats(g);
  assert.equal(stats.length, 3);
  for (const p of stats) {
    assert.equal(p.firstMatch, 1);
    assert.equal(p.tierId, 'soulmates');
    assert.equal(p.value, 100);
  }
  next(g);
  assert.equal(g.phase, 'finished');
  assert.equal(g.result.unique, null);
  assert.deepEqual(g.result.loners, []);
});

test('4 人：第 1 輪 A=B；第 2 輪 A=C=B → A-B 不重複宣告，剩 D 與眾不同', () => {
  const g = newGame(4);
  const r1 = step(g, 4, { p1: '海', p2: '海' });
  assert.deepEqual(r1.newPairs, [{ a: 'p1', b: 'p2', tierId: 'soulmates' }]);
  assert.equal(g.phase, 'writing');
  const r2 = play(g, 4, { p1: '山', p2: '山', p3: '山' });
  assert.deepEqual(r2.newPairs.map(p => `${p.a}|${p.b}|${p.tierId}`), ['p1|p3|telepathy', 'p2|p3|telepathy']);
  assert.equal(pair(g, 'p1', 'p2').value, 100);
  assert.equal(pair(g, 'p1', 'p3').value, 85);
  assert.equal(L.checkEnd(g), 'allPaired');
  next(g);
  assert.equal(g.result.unique, 'p4');
  assert.deepEqual(g.result.loners, []);
});

test('8 輪都沒配對完：A-C 從未相同為 ∞，死對頭 0%；兩個落單者為孤狼', () => {
  const g = newGame(4);
  step(g, 4, { p1: '海', p2: '海' });
  for (let r = 2; r <= 8; r++) step(g, 4);
  assert.equal(g.round, 8);
  assert.equal(g.phase, 'revealed');
  assert.equal(L.checkEnd(g), 'maxRounds');
  assert.equal(pair(g, 'p1', 'p3').firstMatch, Infinity);
  assert.equal(pair(g, 'p1', 'p3').value, 0);
  next(g);
  assert.equal(g.result.endReason, 'maxRounds');
  assert.deepEqual(g.result.loners, ['p3', 'p4']);
  assert.equal(g.result.unique, null);
  assert.equal(g.result.matrix.find(c => c.a === 'p1' && c.b === 'p3').firstMatch, null);
});

test('2 人第 3 輪同詞：默契十足 70%，立刻結束，無最差榜', () => {
  const g = newGame(2);
  step(g, 2);
  step(g, 2);
  play(g, 2, { p1: '茶', p2: '茶' });
  assert.equal(L.checkEnd(g), 'allPaired');
  next(g);
  const res = g.result;
  assert.equal(res.bestPairs.length, 1);
  assert.equal(res.bestPairs[0].tierId, 'in-sync');
  assert.equal(res.bestPairs[0].value, 70);
  assert.deepEqual(res.worstPairs, []);
  assert.equal(res.unique, null);
  assert.equal(res.chemistry.p1, 70);
});

test('2 人玩到回合上限都沒配對：兩人皆孤狼、死對頭 0%、無最差榜、無與眾不同', () => {
  const g = newGame(2, { maxRounds: 3 });
  for (let r = 1; r <= 3; r++) step(g, 2);
  assert.equal(L.checkEnd(g), 'maxRounds');
  next(g);
  const res = g.result;
  assert.equal(res.endReason, 'maxRounds');
  assert.deepEqual(res.loners, ['p1', 'p2']);
  assert.equal(res.unique, null);
  assert.deepEqual(res.bestPairs, []);
  assert.deepEqual(res.worstPairs, []);
  assert.equal(res.matrix[0].value, 0);
  assert.equal(res.chemistry.p1, 0);
});

test('12 人第 1 輪 5 人同詞：10 對 100%，揭曉為單一 5 人群組', () => {
  const g = newGame(12);
  const same = Object.fromEntries(ids(5).map(id => [id, '西瓜']));
  const r = play(g, 12, same);
  assert.equal(r.newPairs.length, 10);
  assert.ok(r.newPairs.every(p => p.tierId === 'soulmates'));
  assert.deepEqual(r.groups.filter(m => m.length > 1), [['p1', 'p2', 'p3', 'p4', 'p5']]);
  assert.equal(L.checkEnd(g), null);
  L.finishNow(g);
  assert.equal(g.result.matrix.length, 66);
  assert.equal(g.result.matrix.filter(c => c.value === 100).length, 10);
});

test('首次相同在第 7／8／9 輪：20%／10%／10%（第 8 輪以後同值）', () => {
  for (const [round, tierId, value] of [[7, 'barely', 20], [8, 'near-miss', 10], [9, 'near-miss', 10]]) {
    const g = newGame(3, { maxRounds: 0 });
    for (let r = 1; r < round; r++) step(g, 3);
    play(g, 3, { p1: '茶', p2: '茶' });
    const p = pair(g, 'p1', 'p2');
    assert.equal(p.firstMatch, round);
    assert.equal(p.tierId, tierId);
    assert.equal(p.value, value);
  }
});

test('死對頭並列：先比互投離譜票，再比總配對數，最後固定雜湊（重跑相同）', () => {
  const run = voteFor => {
    const g = newGame(4, { maxRounds: 2 });
    step(g, 4, { p1: '海', p2: '海' });
    play(g, 4);
    if (voteFor) L.voteOutlier(g, voteFor[0], voteFor[1], { now: g.roundEndsAt });
    next(g);
    return g.result.worstPairs.map(p => `${p.a}|${p.b}`);
  };
  // 無票：p3-p4 雙方都沒配對過（總數 0），最糟
  const base = run(null);
  assert.equal(base[0], 'p3|p4');
  assert.equal(base.length, 3);
  assert.deepEqual(run(null), base);
  // p2 投 p4：p2-p4 有 1 票，排最前
  assert.equal(run(['p2', 'p4'])[0], 'p2|p4');
});

test('3 人第 1 輪 A=B≠C：結束，C 與眾不同，A-C／B-C 死對頭 0%', () => {
  const g = newGame(3);
  play(g, 3, { p1: '海', p2: '海' });
  assert.equal(L.checkEnd(g), 'allPaired');
  next(g);
  assert.equal(g.result.unique, 'p3');
  assert.equal(pair(g, 'p1', 'p2').tierId, 'soulmates');
  for (const x of ['p1', 'p2']) {
    assert.equal(pair(g, x, 'p3').value, 0);
    assert.equal(pair(g, x, 'p3').tierId, 'rivals');
  }
  assert.equal(g.result.chemistry.p3, 0);
  assert.equal(g.result.chemistry.p1, 50);
});

test('12 人第 3 輪後只剩 1 人未配對：與眾不同，無孤狼', () => {
  const g = newGame(12);
  step(g, 12, Object.fromEntries(ids(5).map(id => [id, '一'])));
  step(g, 12, { p6: '二', p7: '二', p8: '二' });
  assert.equal(L.unpairedOf(g).length, 4);
  play(g, 12, { p9: '三', p10: '三', p11: '三' });
  assert.equal(g.round, 3);
  assert.deepEqual(L.unpairedOf(g), ['p12']);
  next(g);
  assert.equal(g.result.unique, 'p12');
  assert.deepEqual(g.result.loners, []);
});

test('達上限仍有 2 人未配對：兩人皆孤狼，無與眾不同，指數 0%', () => {
  const g = newGame(3, { maxRounds: 3 });
  for (let r = 1; r <= 3; r++) step(g, 3);
  next(g);
  assert.equal(g.result.endReason, 'maxRounds');
  assert.deepEqual(g.result.loners, ['p1', 'p2', 'p3']);
  assert.equal(g.result.unique, null);
  assert.ok(Object.values(g.result.chemistry).every(v => v === 0));
});

test('達上限恰剩 1 人未配對：該人與眾不同', () => {
  const g = newGame(3, { maxRounds: 2 });
  step(g, 3);
  play(g, 3, { p1: '海', p2: '海' });
  assert.equal(g.round, 2);
  next(g);
  assert.equal(g.result.unique, 'p3');
  assert.deepEqual(g.result.loners, []);
});

test('最後一個未配對者在同一輪與他人配對：0 人落單，無與眾不同', () => {
  const g = newGame(3);
  step(g, 3);
  play(g, 3, { p1: '海', p2: '海', p3: '海' });
  next(g);
  assert.equal(g.result.unique, null);
  assert.deepEqual(g.result.loners, []);
  assert.equal(L.pairStats(g).every(p => p.firstMatch === 2), true);
});

test('逾時空白：不等於任何詞（包含另一個空白）', () => {
  const g = newGame(2);
  const r = play(g, 2, { p1: null, p2: null });
  assert.deepEqual(r.words, { p1: '', p2: '' });
  assert.deepEqual(r.groups, []);
  assert.equal(L.checkEnd(g), null);
  next(g);
  assert.equal(g.phase, 'writing');
  assert.equal(g.round, 2);
});

test('玩家離開：之後不產生新配對，已成立的配對保留，結算榜不含該玩家', () => {
  const g = newGame(5);
  step(g, 5, { p1: '海', p3: '海' });
  const left = L.leavePlayer(g, 'p3');
  assert.deepEqual(left, { changed: true, remaining: 4, allSubmitted: false });
  assert.throws(() => L.submitWord(g, 'p3', '山', { now: g.roundEndsAt - 1 }), e => e.code === 'FORBIDDEN');
  const r = play(g, 5, { p3: '山', p4: '山' });
  assert.equal(r.words.p3, undefined);
  assert.equal(g.pairs['p1|p3'], 1); // 保留
  assert.equal(L.unpairedOf(g).includes('p3'), false);
  L.finishNow(g);
  assert.ok(g.result.matrix.every(c => c.a !== 'p3' && c.b !== 'p3'));
  assert.deepEqual(g.result.leftIds, ['p3']);
  assert.equal(g.result.chemistry.p3, undefined);
});

test('離開者是最後一個沒送出的人：回報全員已送出；離開讓未配對者 ≤ 1 時揭曉後結束', () => {
  const h = newGame(4);
  step(h, 4, { p1: '海', p2: '海' });
  L.submitWord(h, 'p1', '甲', { now: h.roundEndsAt - 1 });
  L.submitWord(h, 'p2', '乙', { now: h.roundEndsAt - 1 });
  L.submitWord(h, 'p4', '丙', { now: h.roundEndsAt - 1 });
  assert.equal(L.leavePlayer(h, 'p3').allSubmitted, true);
  L.settleRound(h, { now: h.roundEndsAt - 1 });
  assert.deepEqual(L.unpairedOf(h), ['p4']);
  assert.equal(L.checkEnd(h), 'allPaired');
  next(h);
  assert.equal(h.result.unique, 'p4');
});

test('房主提前結算：書寫中的本輪作廢，未配對 ≥ 2 人皆孤狼', () => {
  const g = newGame(3);
  L.submitWord(g, 'p1', '海', { now: T0 });
  const res = L.finishNow(g);
  assert.equal(g.phase, 'finished');
  assert.equal(res.endReason, 'host');
  assert.deepEqual(res.loners, ['p1', 'p2', 'p3']);
  assert.deepEqual(g.pending, {});
});

test('磁鐵與離譜王：累計次數最多者', () => {
  const g = newGame(4, { maxRounds: 0 });
  step(g, 4, { p1: '西瓜' });
  play(g, 4, { p2: '西瓜', p3: '西瓜' });
  L.voteOutlier(g, 'p1', 'p4', { now: g.roundEndsAt });
  L.voteOutlier(g, 'p2', 'p4', { now: g.roundEndsAt });
  L.voteOutlier(g, 'p3', 'p1', { now: g.roundEndsAt });
  L.voteOutlier(g, 'p3', 'p4', { now: g.roundEndsAt }); // 改投
  const res = L.finishNow(g);
  assert.deepEqual(res.magnet, { playerIds: ['p1'], count: 2 });
  assert.deepEqual(res.outlier, { playerIds: ['p4'], count: 3 });
});

test('離譜票限制：不能投自己／空白，窗口過了關閉，可收回', () => {
  const g = newGame(3);
  play(g, 3, { p3: null });
  const now = g.roundEndsAt;
  assert.throws(() => L.voteOutlier(g, 'p1', 'p1', { now }), e => e.code === 'BAD_TARGET');
  assert.throws(() => L.voteOutlier(g, 'p1', 'p3', { now }), e => e.code === 'BAD_TARGET');
  assert.throws(() => L.voteOutlier(g, 'p3', 'p1', { now }), e => e.code === 'NO_WORD');
  assert.throws(() => L.voteOutlier(g, 'p1', 'p2', { now: now + L.OUTLIER_VOTE_MS + 1 }), e => e.code === 'VOTE_CLOSED');
  L.voteOutlier(g, 'p1', 'p2', { now });
  assert.equal(g.rounds[0].outlierVotes.p1, 'p2');
  L.voteOutlier(g, 'p1', null, { now });
  assert.deepEqual(g.rounds[0].outlierVotes, {});

  const off = newGame(3, { outlierVote: false });
  play(off, 3);
  assert.throws(() => L.voteOutlier(off, 'p1', 'p2', { now: off.roundEndsAt }), e => e.code === 'DISABLED');
});

test('違規一律丟 GameError', () => {
  const code = c => e => e instanceof L.GameError && e.code === c;
  const w = L.createGame();
  assert.throws(() => L.submitWord(w, 'p1', '海', { now: T0 }), code('BAD_PHASE'));
  assert.throws(() => L.startGame(w, ids(1), { now: T0 }), code('BAD_PLAYERS'));
  assert.throws(() => L.startGame(w, ids(13), { now: T0 }), code('BAD_PLAYERS'));
  assert.throws(() => L.startGame(w, ['p1', 'p1'], { now: T0 }), code('BAD_PLAYERS'));
  assert.throws(() => L.startGame(w, ids(3)), code('BAD_ARG'));
  assert.throws(() => L.createGame({ timerSeconds: 10 }), code('BAD_OPTIONS'));
  assert.throws(() => L.createGame({ timerSeconds: 181 }), code('BAD_OPTIONS'));
  assert.throws(() => L.createGame({ maxRounds: -1 }), code('BAD_OPTIONS'));
  assert.throws(() => L.createGame({ starterMode: 'x' }), code('BAD_OPTIONS'));

  const g = newGame(3);
  assert.throws(() => L.submitWord(g, 'zz', '海', { now: T0 }), code('FORBIDDEN'));
  assert.throws(() => L.submitWord(g, 'p1', '123', { now: T0 }), code('BAD_WORD'));
  assert.throws(() => L.submitWord(g, 'p1', '海', { now: g.roundEndsAt + 1 }), code('TIME_UP'));
  assert.throws(() => L.submitWord(g, 'p1', '海'), code('BAD_ARG'));
  assert.throws(() => L.settleRound(g, { now: T0 }), code('TOO_EARLY'));
  assert.throws(() => L.nextRound(g, { now: T0 }), code('BAD_PHASE'));
  assert.throws(() => L.voteOutlier(g, 'p1', 'p2', { now: T0 }), code('BAD_PHASE'));
});

test('送出可覆蓋；全員送出後可提前揭曉', () => {
  const g = newGame(2);
  assert.equal(L.submitWord(g, 'p1', '海', { now: T0 }).allSubmitted, false);
  L.submitWord(g, 'p1', '山', { now: T0 });
  assert.equal(L.submitWord(g, 'p2', '山', { now: T0 }).allSubmitted, true);
  const r = L.settleRound(g, { now: T0 + 1000 });
  assert.equal(r.words.p1, '山');
});

test('seed 模式：用注入的 rng 抽種子詞；沒有種子池就拒絕', () => {
  const g = L.createGame({ starterMode: 'seed' });
  assert.throws(() => L.startGame(g, ids(2), { now: T0 }), e => e.code === 'NO_SEED');
  L.startGame(g, ids(2), { now: T0, rng: () => 0.99, seedPairs: [['海', '夏天'], ['山', '雪']] });
  assert.deepEqual(g.seed, ['山', '雪']);
});

test('buildView：書寫中只看得到自己的詞與誰已送出；揭曉後才有詞', () => {
  const g = newGame(3);
  L.submitWord(g, 'p1', '祕密', { now: T0 });
  const mine = L.buildView(g, 'p1');
  const other = L.buildView(g, 'p2');
  assert.equal(mine.myWord, '祕密');
  assert.equal(other.myWord, null);
  assert.deepEqual(other.submitted, { p1: true, p2: false, p3: false });
  assert.equal(JSON.stringify(other).includes('祕密'), false);
  assert.deepEqual(other.rounds, []);

  play(g, 3, { p1: '祕密', p2: null });
  const v = L.buildView(g, 'p2');
  assert.equal(v.rounds[0].words.p1, '祕密');
  assert.equal(v.submitted, undefined);
  assert.equal(v.myOutlierVote, null);
  assert.equal(v.endsAfterThis, null);
});

test('buildView：離譜票揭曉期間只給自己看，結算前不公開他人票', () => {
  const g = newGame(3);
  play(g, 3);
  L.voteOutlier(g, 'p1', 'p2', { now: g.roundEndsAt });
  assert.equal(L.buildView(g, 'p1').myOutlierVote, 'p2');
  assert.equal(L.buildView(g, 'p3').myOutlierVote, null);
  assert.equal('outlierVotes' in L.buildView(g, 'p3').rounds[0], false);
});

test('resetGame：回到大廳並保留設定', () => {
  const g = newGame(2, { timerSeconds: 30 });
  play(g, 2, { p1: '海', p2: '海' });
  next(g);
  L.resetGame(g);
  assert.equal(g.phase, 'waiting');
  assert.equal(g.options.timerSeconds, 30);
  assert.deepEqual(g.pairs, {});
  assert.equal(g.result, null);
});

test('free 模式（預設）：不給開局詞，seed 為 null，也不需要種子池', () => {
  const g = L.createGame();
  assert.equal(g.options.starterMode, 'free');
  L.startGame(g, ids(2), { now: T0, seedPairs: [['海', '夏天']] });
  assert.equal(g.seed, null);
  assert.equal(L.buildView(g, 'p1').seed, null);
});
