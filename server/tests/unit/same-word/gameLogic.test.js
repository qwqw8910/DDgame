'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../../same-word/gameLogic');

const T0 = 1_000_000;
const ids = n => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const BANK = Array.from({ length: 20 }, (_, i) => `題目${i + 1}`);

function newGame(n, options = {}) {
  const g = L.createGame(options);
  L.startGame(g, ids(n), { now: T0, prompts: BANK });
  return g;
}

// 送出並揭曉一輪。words：{ p1: '西瓜', ... }，未列出者逾時未送出
function play(g, words) {
  const now = g.roundEndsAt;
  for (const [id, w] of Object.entries(words)) {
    if (w !== null && !g.leftIds.includes(id)) L.submitWord(g, id, w, { now: now - 1000 });
  }
  return L.settleRound(g, { now });
}
const next = g => L.nextRound(g, { now: g.roundEndsAt + 1 });
// 所有人寫同一個詞
const same = (n, w) => Object.fromEntries(ids(n).map(id => [id, w]));
// 每人各寫不同的詞
const letters = s => String(s).replace(/\d/g, d => 'ABCDEFGHIJ'[d]);
const diff = (n, tag = '') => Object.fromEntries(ids(n).map((id, i) => [id, `獨${'abcdefghijkl'[i]}${letters(tag)}`]));
const pair = (g, a, b) => L.pairStats(g, { includeLeft: true }).find(p => p.key === [a, b].sort().join('|'));

// ── 詞 ───────────────────────────────────────────────────────
test('正規化：中文與英文通過，數字／假名／注音／標點拒絕', () => {
  assert.equal(L.normalizeWord('蘋果'), '蘋果');
  assert.equal(L.normalizeWord('iPhone手機'), 'iPhone手機');
  for (const bad of ['123', 'かな', 'ㄅㄆ', 'a b!', '', '   ', '一二三四五六七八九十一二三', null, 5]) {
    assert.equal(L.normalizeWord(bad), null, String(bad));
  }
});

test('正規化：英文不分大小寫、全形轉半形、頭尾空白去掉；蘋果與苹果不同', () => {
  const key = s => L.wordKey(L.normalizeWord(s));
  assert.equal(key('Apple'), key('apple'));
  assert.equal(key('ＡＰＰＬＥ'), key('apple'));
  assert.equal(key('apple '), key('Apple'));
  assert.notEqual(key('蘋果'), key('苹果'));
});

// ── 設定與開局 ─────────────────────────────────────────────────
test('設定：預設值與範圍檢查', () => {
  assert.deepEqual(L.resolveOptions(), { mode: 'prompts', rounds: 5, timerSeconds: 30, converge: true, revealSeconds: 10, turnSeconds: 8, laps: 2 });
  assert.throws(() => L.resolveOptions({ mode: 'free' }), { code: 'BAD_OPTIONS' });
  assert.throws(() => L.resolveOptions({ rounds: 2 }), { code: 'BAD_OPTIONS' });
  assert.throws(() => L.resolveOptions({ rounds: 11 }), { code: 'BAD_OPTIONS' });
  assert.throws(() => L.resolveOptions({ timerSeconds: 10 }), { code: 'BAD_OPTIONS' });
  assert.throws(() => L.resolveOptions({ converge: 'yes' }), { code: 'BAD_OPTIONS' });
  assert.throws(() => L.resolveOptions({ revealSeconds: 1 }), { code: 'BAD_OPTIONS' });
});

test('開局：抽出不重複的題目，第 1 輪有題目與倒數', () => {
  const g = newGame(3, { rounds: 6 });
  assert.equal(g.phase, 'writing');
  assert.equal(g.kind, 'prompt');
  assert.equal(g.round, 1);
  assert.equal(g.prompts.length, 6);
  assert.equal(new Set(g.prompts).size, 6);
  assert.equal(g.prompt, g.prompts[0]);
  assert.equal(g.roundEndsAt, T0 + 30_000);
  assert.deepEqual(g.scores, { p1: 0, p2: 0, p3: 0 });
});

test('開局：人數與題庫檢查', () => {
  assert.throws(() => L.startGame(L.createGame(), ['a'], { now: T0, prompts: BANK }), { code: 'BAD_PLAYERS' });
  assert.throws(() => L.startGame(L.createGame(), ids(13), { now: T0, prompts: BANK }), { code: 'BAD_PLAYERS' });
  assert.throws(() => L.startGame(L.createGame(), ids(3), { now: T0, prompts: [] }), { code: 'NO_PROMPTS' });
});

test('題庫不足時循環補足', () => {
  assert.equal(L.drawPrompts(['a', 'b'], 5).length, 5);
});

// ── 計分 ───────────────────────────────────────────────────────
test('計分：同詞組 k 人，組內每人得 k-1 分；落單 0 分', () => {
  const g = newGame(5, { converge: false });
  const r = play(g, { p1: '西瓜', p2: '西瓜', p3: '西瓜', p4: '芒果', p5: '芒果' });
  assert.deepEqual(r.points, { p1: 2, p2: 2, p3: 2, p4: 1, p5: 1 });
  assert.deepEqual(g.scores, r.points);
  assert.equal(r.allSame, false);
});

test('計分：全員同詞再各加 3 分（心電感應）', () => {
  const g = newGame(4);
  const r = play(g, same(4, '西瓜'));
  assert.equal(r.allSame, true);
  assert.deepEqual(r.points, { p1: 6, p2: 6, p3: 6, p4: 6 });
});

test('計分：英文大小寫與全形視為同詞、空白不與空白相同', () => {
  const g = newGame(4);
  const r = play(g, { p1: 'Apple', p2: 'ａｐｐｌｅ', p3: null, p4: null });
  assert.deepEqual(r.groups, [['p1', 'p2']]);
  assert.deepEqual(r.points, { p1: 1, p2: 1, p3: 0, p4: 0 });
  assert.equal(r.allSame, false);
});

test('唯一徽章：3 人以上落單者記一次；2 人局不頒', () => {
  const g = newGame(3, { converge: false });
  const r = play(g, { p1: '海', p2: '海', p3: '山' });
  assert.deepEqual(r.lone, ['p3']);
  assert.equal(g.lones.p3, 1);

  const g2 = newGame(2, { converge: false });
  const r2 = play(g2, { p1: '海', p2: '山' });
  assert.deepEqual(r2.lone, []);
});

test('分數累計到多輪', () => {
  const g = newGame(3, { rounds: 3, converge: false });
  play(g, { p1: '海', p2: '海', p3: '山' });
  next(g);
  play(g, { p1: '貓', p2: '狗', p3: '狗' });
  assert.deepEqual(g.scores, { p1: 1, p2: 2, p3: 1 });
});

// ── 流程與終局 ───────────────────────────────────────────────────
test('流程：題目輪結束後進終局，終局第 1 次全員同詞 → +6 並結束', () => {
  const g = newGame(3, { rounds: 3 });
  for (let i = 0; i < 3; i++) { play(g, diff(3, i)); assert.equal(next(g).finished, false); }
  assert.equal(g.kind, 'converge');
  assert.equal(g.attempt, 1);
  assert.equal(g.prompt, null);
  play(g, same(3, '共同'));
  assert.deepEqual(g.converge, { success: true, attempt: 1 });
  assert.equal(L.nextStep(g), null);
  assert.deepEqual(next(g), { finished: true });
  assert.equal(g.phase, 'finished');
  assert.deepEqual(g.result.scores, { p1: 6, p2: 6, p3: 6 });
  assert.deepEqual(g.result.winners.sort(), ['p1', 'p2', 'p3']);
});

test('終局：第 2、3 次成功分別得 4、2 分；失敗 3 次不扣分', () => {
  const run = successAt => {
    const g = newGame(3, { rounds: 3 });
    for (let i = 0; i < 3; i++) { play(g, diff(3, i)); next(g); }
    for (let a = 1; a <= 3; a++) {
      play(g, a === successAt ? same(3, '共同') : { ...diff(3, 'x' + a) });
      if (a === successAt) break;
      if (a < 3) next(g);
    }
    return g;
  };
  assert.equal(run(2).scores.p1, 4);
  assert.equal(run(3).scores.p1, 2);
  const fail = run(99);
  assert.deepEqual(fail.converge, { success: false, attempt: 3 });
  assert.equal(fail.scores.p1, 0);
  next(fail);
  assert.equal(fail.phase, 'finished');
});

test('終局：失敗未滿 3 次可再試，終局中同詞不累積配對', () => {
  const g = newGame(3, { rounds: 3 });
  for (let i = 0; i < 3; i++) { play(g, diff(3, i)); next(g); }
  play(g, { p1: '甲', p2: '甲', p3: '乙' });
  assert.equal(L.nextStep(g), 'converge');
  assert.equal(g.scores.p1, 0);
  assert.equal(pair(g, 'p1', 'p2').count, 0);
  assert.equal(next(g).finished, false);
  assert.equal(g.attempt, 2);
});

test('converge 關閉：題目輪結束直接結算', () => {
  const g = newGame(3, { rounds: 3, converge: false });
  for (let i = 0; i < 2; i++) { play(g, diff(3, i)); next(g); }
  play(g, diff(3, 'z'));
  assert.equal(L.nextStep(g), null);
  assert.deepEqual(next(g), { finished: true });
});

test('揭曉階段：autoNextAt 依 revealSeconds；寫字階段清掉', () => {
  const g = newGame(2, { revealSeconds: 7 });
  play(g, same(2, '海'));
  assert.equal(g.autoNextAt, g.roundEndsAt + 7000);
  next(g);
  assert.equal(g.autoNextAt, null);
});

test('阻擋：階段不對、非參與者、時間到、違規詞', () => {
  const g = newGame(3);
  assert.throws(() => L.nextRound(g, { now: T0 }), { code: 'BAD_PHASE' });
  assert.throws(() => L.submitWord(g, 'zz', '海', { now: T0 }), { code: 'FORBIDDEN' });
  assert.throws(() => L.submitWord(g, 'p1', '123', { now: T0 }), { code: 'BAD_WORD' });
  assert.throws(() => L.submitWord(g, 'p1', '海', { now: g.roundEndsAt + 1 }), { code: 'TIME_UP' });
  assert.throws(() => L.settleRound(g, { now: T0 }), { code: 'TOO_EARLY' });
});

test('提交可覆蓋，全員送出才回報 allSubmitted', () => {
  const g = newGame(2);
  assert.equal(L.submitWord(g, 'p1', '海', { now: T0 }).allSubmitted, false);
  L.submitWord(g, 'p1', '山', { now: T0 });
  assert.equal(g.pending.p1, '山');
  assert.equal(L.submitWord(g, 'p2', '山', { now: T0 }).allSubmitted, true);
});

test('前幾輪的詞可以再寫（有題目後不再禁用）', () => {
  const g = newGame(2, { converge: false });
  play(g, same(2, '海'));
  next(g);
  assert.doesNotThrow(() => L.submitWord(g, 'p1', '海', { now: T0 }));
});

// ── 表情反應 ───────────────────────────────────────────────────
test('反應：貼、換、收回；只能對別人、對有詞的人', () => {
  const g = newGame(3);
  play(g, { p1: '海', p2: '山', p3: null });
  L.react(g, 'p1', 'p2', '🤣');
  L.react(g, 'p1', 'p2', '👏');
  assert.deepEqual(L.buildView(g, 'p1').myReactions, { p2: '👏' });
  assert.deepEqual(L.buildView(g, 'p2').rounds[0].reactions, { p2: { '👏': 1 } });
  L.react(g, 'p1', 'p2', null);
  assert.deepEqual(L.buildView(g, 'p1').myReactions, {});
  assert.throws(() => L.react(g, 'p1', 'p1', '🤣'), { code: 'BAD_TARGET' });
  assert.throws(() => L.react(g, 'p1', 'p3', '🤣'), { code: 'BAD_TARGET' });
  assert.throws(() => L.react(g, 'p3', 'p1', '🤣'), { code: 'NO_WORD' });
  assert.throws(() => L.react(g, 'p1', 'p2', '💩'), { code: 'BAD_REACTION' });
});

test('反應：書寫階段不能貼；視圖不洩漏是誰貼的', () => {
  const g = newGame(3);
  assert.throws(() => L.react(g, 'p1', 'p2', '🤣'), { code: 'BAD_PHASE' });
  play(g, diff(3));
  L.react(g, 'p1', 'p2', '🤣');
  L.react(g, 'p3', 'p2', '🤣');
  const shown = JSON.stringify(L.buildView(g, 'p2').rounds[0].reactions);
  assert.equal(shown.includes('p1') || shown.includes('p3'), false); // 只有被貼的人，看不到誰貼的
  assert.deepEqual(L.buildView(g, 'p2').rounds[0].reactions, { p2: { '🤣': 2 } });
});

// ── 默契與結算 ─────────────────────────────────────────────────
test('兩兩默契：同詞比例與稱號', () => {
  const g = newGame(3, { rounds: 4, converge: false });
  play(g, { p1: '海', p2: '海', p3: '山' }); next(g);
  play(g, { p1: '貓', p2: '貓', p3: '狗' }); next(g);
  play(g, { p1: '甲', p2: '乙', p3: '丙' }); next(g);
  play(g, { p1: '丁', p2: '丁', p3: '戊' });
  const p12 = pair(g, 'p1', 'p2');
  assert.equal(p12.count, 3);
  assert.equal(p12.total, 4);
  assert.equal(p12.value, 75);
  assert.equal(p12.tierId, 'telepathy');
  assert.equal(pair(g, 'p1', 'p3').value, 0);
  assert.equal(pair(g, 'p1', 'p3').tierId, 'rivals');
});

test('稱號門檻', () => {
  const t = v => L.tierForValue(v).id;
  assert.equal(t(100), 'soulmates');
  assert.equal(t(90), 'soulmates');
  assert.equal(t(89), 'telepathy');
  assert.equal(t(60), 'in-sync');
  assert.equal(t(45), 'compatible');
  assert.equal(t(30), 'slow-burn');
  assert.equal(t(20), 'needs-work');
  assert.equal(t(10), 'barely');
  assert.equal(t(1), 'near-miss');
  assert.equal(t(0), 'rivals');
});

test('結算：排行、最佳拍檔、死對頭、唯一、離譜王、個人指數', () => {
  const g = newGame(3, { rounds: 3, converge: false });
  play(g, { p1: '海', p2: '海', p3: '山' });
  L.react(g, 'p1', 'p3', '🤣'); L.react(g, 'p2', 'p3', '🤣');
  next(g);
  play(g, { p1: '貓', p2: '貓', p3: '狗' }); next(g);
  play(g, { p1: '甲', p2: '甲', p3: '丙' });
  next(g);
  const r = g.result;
  assert.equal(g.phase, 'finished');
  assert.deepEqual(r.scores, { p1: 3, p2: 3, p3: 0 });
  assert.deepEqual(r.winners.sort(), ['p1', 'p2']);
  assert.equal(r.ranking[2], 'p3');
  assert.equal(r.bestPairs.length, 1);
  assert.deepEqual([r.bestPairs[0].a, r.bestPairs[0].b], ['p1', 'p2']);
  assert.equal(r.bestPairs[0].value, 100);
  assert.equal(r.worstPairs.length, 2);
  assert.equal(r.worstPairs.every(p => p.value === 0), true);
  assert.deepEqual(r.unique, { playerIds: ['p3'], count: 3 });
  assert.deepEqual(r.laugh, { playerIds: ['p3'], count: 2 });
  assert.equal(r.chemistry.p1, 50);
  assert.equal(r.chemistry.p3, 0);
  assert.equal(r.matrix.length, 3);
});

test('結算：2 人局沒有死對頭榜；全員都沒配對時沒有最佳拍檔', () => {
  const g = newGame(2, { rounds: 3, converge: false });
  play(g, { p1: '海', p2: '山' }); next(g);
  play(g, { p1: '貓', p2: '狗' }); next(g);
  play(g, { p1: '甲', p2: '乙' });
  next(g);
  assert.deepEqual(g.result.worstPairs, []);
  assert.deepEqual(g.result.bestPairs, []);
  assert.deepEqual(g.result.winners, []);
});

test('結算：同分排序可重現', () => {
  const run = () => {
    const g = newGame(4, { rounds: 3, converge: false });
    for (let i = 0; i < 2; i++) { play(g, diff(4, i)); next(g); }
    play(g, diff(4, 'z')); next(g);
    return g.result.ranking;
  };
  assert.deepEqual(run(), run());
});

test('房主提前結算：本輪作廢、分數保留', () => {
  const g = newGame(3, { rounds: 4, converge: false });
  play(g, { p1: '海', p2: '海', p3: '山' }); next(g);
  L.submitWord(g, 'p1', '貓', { now: T0 });
  const r = L.finishNow(g);
  assert.equal(g.phase, 'finished');
  assert.equal(r.endReason, 'host');
  assert.deepEqual(r.scores, { p1: 1, p2: 1, p3: 0 });
  assert.equal(r.promptsDone, 1);
});

// ── 離開 ───────────────────────────────────────────────────────
test('離開：之後的輪次排除、分數保留、結算榜不含離場者', () => {
  const g = newGame(4, { rounds: 4, converge: false });
  play(g, same(4, '海')); next(g);
  assert.equal(L.leavePlayer(g, 'p4').remaining, 3);
  const r = play(g, { p1: '貓', p2: '貓', p3: '狗' });
  assert.equal(r.words.p4, undefined);
  assert.equal(g.scores.p4, 6);
  next(g);
  L.finishNow(g);
  assert.equal(g.result.ranking.includes('p4'), false);
  assert.deepEqual(g.result.leftIds, ['p4']);
  assert.equal(g.result.matrix.length, 3);
});

test('離開：最後沒送出的人離開 → allSubmitted；剩 1 人回報 remaining', () => {
  const g = newGame(3);
  L.submitWord(g, 'p1', '海', { now: T0 });
  L.submitWord(g, 'p2', '海', { now: T0 });
  const r = L.leavePlayer(g, 'p3');
  assert.equal(r.allSubmitted, true);
  assert.equal(L.leavePlayer(g, 'p2').remaining, 1);
  assert.equal(L.leavePlayer(g, 'p2').changed, false);
});

test('終局需要至少 2 人，剩 1 人時跳過', () => {
  const g = newGame(2, { rounds: 3 });
  play(g, diff(2, 0)); next(g);
  play(g, diff(2, 1)); next(g);
  L.leavePlayer(g, 'p2');
  play(g, { p1: '海' });
  assert.equal(L.nextStep(g), null);
});

// ── 視圖與資訊隱藏 ───────────────────────────────────────────────
test('視圖：書寫階段只有自己的詞與送出狀態，未來題目不外洩', () => {
  const g = newGame(3, { rounds: 5 });
  L.submitWord(g, 'p1', '祕密西瓜', { now: T0 });
  const v2 = L.buildView(g, 'p2');
  assert.equal(JSON.stringify(v2).includes('祕密西瓜'), false);
  assert.equal(v2.submitted.p1, true);
  assert.equal(v2.myWord, null);
  assert.equal(L.buildView(g, 'p1').myWord, '祕密西瓜');
  assert.equal(v2.prompt, g.prompts[0]);
  for (const future of g.prompts.slice(1)) assert.equal(JSON.stringify(v2).includes(future), false);
});

test('視圖：揭曉階段下發詞、分數與下一步', () => {
  const g = newGame(3, { rounds: 3 });
  play(g, { p1: '海', p2: '海', p3: '山' });
  const v = L.buildView(g, 'p3');
  assert.equal(v.rounds[0].words.p1, '海');
  assert.deepEqual(v.rounds[0].points, { p1: 1, p2: 1, p3: 0 });
  assert.equal(v.nextStep, 'prompt');
  assert.deepEqual(v.scores, { p1: 1, p2: 1, p3: 0 });
});

test('重玩：保留設定、清掉狀態', () => {
  const g = newGame(3, { rounds: 4, timerSeconds: 20 });
  play(g, same(3, '海'));
  L.resetGame(g);
  assert.equal(g.phase, 'waiting');
  assert.equal(g.options.rounds, 4);
  assert.equal(g.options.timerSeconds, 20);
  assert.deepEqual(g.rounds, []);
  assert.deepEqual(g.scores, {});
});

// ── 接龍模式 ───────────────────────────────────────────────────
const chainGame = n => newGame(n, { mode: 'chain' });

test('接龍：只有第 1 輪有題目，之後以上一輪的詞為線索，共 6 輪', () => {
  const g = chainGame(3);
  assert.equal(g.prompts.length, 1);
  assert.equal(g.kind, 'prompt');
  assert.ok(g.prompt);
  assert.equal(L.buildView(g, 'p1').promptTotal, 6);
  for (let i = 1; i <= 5; i++) {
    play(g, diff(3, i));
    assert.equal(L.nextStep(g), 'chain');
    next(g);
    assert.equal(g.kind, 'chain');
    assert.equal(g.prompt, null);
    assert.equal(g.promptIndex, i + 1);
  }
  play(g, diff(3, 6));
  assert.equal(L.nextStep(g), null);
  next(g);
  assert.equal(g.phase, 'finished');
  assert.equal(g.result.mode, 'chain');
  assert.equal(g.result.promptsDone, 6);
  assert.equal(g.result.converge, null);
});

test('接龍：前面出現過的詞不能再寫（第 1 輪起算）；題目輪模式不受限', () => {
  const g = chainGame(2);
  play(g, { p1: '海', p2: '山' });
  next(g);
  assert.throws(() => L.submitWord(g, 'p1', '山', { now: T0 }), { code: 'WORD_USED' });
  assert.doesNotThrow(() => L.submitWord(g, 'p1', '河', { now: T0 }));
});

test('接龍：每輪照樣計分（k-1），兩兩默契以 6 輪計', () => {
  const g = chainGame(3);
  play(g, { p1: '海', p2: '海', p3: '山' }); next(g);
  play(g, { p1: '貓', p2: '狗', p3: '狗' });
  assert.deepEqual(g.scores, { p1: 1, p2: 2, p3: 1 });
  assert.equal(pair(g, 'p2', 'p3').count, 1);
  assert.equal(pair(g, 'p2', 'p3').total, 2);
});

test('接龍：全員同詞 +3 並提早結束', () => {
  const g = chainGame(3);
  play(g, diff(3, 1)); next(g);
  play(g, diff(3, 2)); next(g);
  const r = play(g, same(3, '共同'));
  assert.equal(r.allSame, true);
  assert.equal(g.allSameAt, 3);
  assert.deepEqual(r.points, { p1: 5, p2: 5, p3: 5 });
  assert.equal(L.nextStep(g), null);
  next(g);
  assert.equal(g.result.allSameAt, 3);
  assert.equal(g.result.promptsDone, 3);
});

test('接龍：剩 1 人時結束', () => {
  const g = chainGame(2);
  play(g, diff(2, 1)); next(g);
  L.leavePlayer(g, 'p2');
  play(g, { p1: '海' });
  assert.equal(L.nextStep(g), null);
});

// ── 接句模式 ─────────────────────────────────────────────────
const THEMES = ['主題甲', '主題乙'];
function relayGame(n, options = {}) {
  const g = L.createGame({ mode: 'relay', ...options });
  L.startGame(g, ids(n), { now: T0, themes: THEMES, rng: () => 0.5 });
  return g;
}
const writeTurn = (g, text, dt = 1000) => L.submitSegment(g, L.relayWriter(g), text, { now: g.relay.turnEndsAt - g.options.turnSeconds * 1000 + dt });

test('接句：段落必須剛好三個字，標點不算', () => {
  assert.equal(L.normalizeSegment('我今天'), '我今天');
  assert.equal(L.normalizeSegment(' 去 吃 飯 '), '去吃飯');
  assert.equal(L.normalizeSegment('好,啦啦!'), '好，啦啦！');
  assert.equal(L.normalizeSegment('ＯＫ了'), 'OK了');
  for (const bad of ['我', '我今天去', '，，，', 'かなか', '', null, '好，，，，啦啦']) {
    assert.equal(L.normalizeSegment(bad), null, String(bad));
  }
});

test('接句：輪流寫，只有輪到的人看得到上一段，接完進入投票', () => {
  const g = relayGame(3, { laps: 2 });
  assert.equal(g.phase, 'relay');
  assert.equal(g.relay.total, 6);
  assert.ok(THEMES.includes(g.relay.theme));
  const first = L.relayWriter(g);
  const other = ids(3).find(id => id !== first);
  assert.throws(() => L.submitSegment(g, other, '我今天', { now: T0 + 100 }), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => L.submitSegment(g, first, '太長了吧', { now: T0 + 100 }), { code: 'BAD_SEGMENT' });
  writeTurn(g, '我今天');
  const second = L.relayWriter(g);
  assert.notEqual(second, first);
  assert.equal(L.buildView(g, second).relay.prev, '我今天');
  assert.equal(L.buildView(g, first).relay.prev, null);
  assert.equal(L.buildView(g, first).relay.segments, undefined, '接句中不下發內容');
  for (const t of ['去上班', '遇到鬼', '超可怕', '但是他', '很帥氣']) writeTurn(g, t);
  assert.equal(g.phase, 'voting');
  const v = L.buildView(g, first).relay;
  assert.equal(v.story, '我今天去上班遇到鬼超可怕但是他很帥氣');
  assert.equal(v.segments.length, 6);
});

test('接句：時間到記成卡住，跳過不進整段話', () => {
  const g = relayGame(2, { laps: 1 });
  assert.throws(() => L.timeoutTurn(g, { now: T0 + 1000 }), { code: 'TOO_EARLY' });
  const stuckId = L.relayWriter(g);
  L.timeoutTurn(g, { now: g.relay.turnEndsAt + L.TURN_GRACE_MS });
  writeTurn(g, '哈哈哈');
  assert.equal(g.phase, 'voting');
  L.endVoting(g);
  assert.equal(g.result.story, '哈哈哈');
  assert.deepEqual(g.result.stuck, { playerIds: [stuckId], count: 1 });
});

test('接句：投票不能投自己與卡住的段落，結算頒獎', () => {
  const g = relayGame(3, { laps: 1 });
  const [a, b, c] = g.relay.order;
  writeTurn(g, '從前有', 500);
  writeTurn(g, '一隻貓', 2000);
  writeTurn(g, '在放屁', 3000);
  assert.throws(() => L.voteSegment(g, a, 0, 'up'), { code: 'BAD_TARGET' });
  assert.throws(() => L.voteSegment(g, a, 9, 'up'), { code: 'BAD_TARGET' });
  assert.throws(() => L.voteSegment(g, a, 1, 'love'), { code: 'BAD_VOTE' });
  L.voteSegment(g, a, 2, 'up');
  L.voteSegment(g, b, 2, 'up');
  L.voteSegment(g, a, 1, 'poop');
  L.voteSegment(g, c, 1, 'poop');
  L.voteSegment(g, c, 0, 'up');
  L.voteSegment(g, c, 0, null); // 收回
  assert.equal(L.buildView(g, a).relay.voters, 3);
  L.endVoting(g);
  const r = g.result;
  assert.equal(r.mode, 'relay');
  assert.deepEqual(r.best, { playerIds: [c], count: 2 });
  assert.deepEqual(r.poop, { playerIds: [b], count: 2 });
  assert.deepEqual(r.bestSegments, [2]);
  assert.deepEqual(r.fastest, { playerIds: [a], ms: 500 });
  assert.equal(r.stuck, null);
});

test('接句：輪到的人離開，換下一位並重新計時', () => {
  const g = relayGame(3, { laps: 1 });
  const w = L.relayWriter(g);
  const r = L.leavePlayer(g, w, { now: T0 + 5000 });
  assert.equal(r.writerChanged, true);
  assert.notEqual(L.relayWriter(g), w);
  assert.equal(g.relay.turnEndsAt, T0 + 5000 + g.options.turnSeconds * 1000);
});

test('接句：設定驗證', () => {
  assert.throws(() => L.resolveOptions({ mode: 'relay', turnSeconds: 2 }), { code: 'BAD_OPTIONS' });
  assert.throws(() => L.resolveOptions({ mode: 'relay', laps: 9 }), { code: 'BAD_OPTIONS' });
  assert.equal(L.resolveOptions({ mode: 'relay' }).turnSeconds, 8);
});
