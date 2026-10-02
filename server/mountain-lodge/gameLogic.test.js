'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./gameLogic');

const ids = n => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// 一路隨機打完傳牌階段
function playPassing(game) {
  while (game.actorId) L.autoPlay(game);
  L.beginDiscussion(game);
  L.beginVoting(game);
}

test('牌數 = 玩家數 + 1，Level 1 = 殺人魔 + 全客人', () => {
  for (let n = 3; n <= 6; n++) {
    const deck = L.buildDeck(1, n);
    assert.equal(deck.length, n + 1);
    assert.equal(deck.filter(c => c.kind === 'killer').length, 1);
    assert.equal(deck.filter(c => c.kind === 'guest').length, n);
    assert.equal(new Set(deck.map(c => c.id)).size, n + 1);
  }
});

test('Level 2 加入 1 位共犯', () => {
  const deck = L.buildDeck(2, 4);
  assert.equal(deck.length, 5);
  assert.equal(deck.filter(c => c.kind === 'accomplice').length, 1);
  assert.equal(deck.filter(c => c.kind === 'guest').length, 3);
});

test('4 人局客人顏色為 黃×2、藍×1、紅×1', () => {
  const colors = L.buildDeck(1, 4).filter(c => c.kind === 'guest').map(c => c.color).sort();
  assert.deepEqual(colors, ['blue', 'red', 'yellow', 'yellow']);
});

test('開局：地點不重複且不含客房/鍋爐室；首位抽 2 張', () => {
  const g = L.createLobby();
  L.startGame(g, ids(5));
  assert.equal(g.phase, 'passing');
  assert.equal(new Set(Object.values(g.locations)).size, 5);
  assert.ok(Object.values(g.locations).every(l => L.PLAYER_LOCATIONS.includes(l)));
  assert.equal(g.hand.length, 2);
  assert.equal(g.deck.length, 6 - 2);
});

test('人數不足 / 過多 / 重複開始會被拒絕', () => {
  assert.throws(() => L.startGame(L.createLobby(), ids(L.MIN_PLAYERS - 1)), { code: 'NOT_ENOUGH' });
  assert.throws(() => L.startGame(L.createLobby(), ids(7)), { code: 'TOO_MANY' });
  const g = L.createLobby();
  L.startGame(g, ids(3));
  assert.throws(() => L.startGame(g, ids(3)), { code: 'GAME_IN_PROGRESS' });
});

test('傳牌：每人恰好留 1 張，最後一張進客房，所有牌守恆', () => {
  for (let n = 3; n <= 6; n++) {
    for (const level of [1, 2]) {
      const g = L.createLobby({ level });
      L.startGame(g, ids(n));
      const all = [...g.deck, ...g.hand.map(h => h.card)].map(c => c.id).sort();
      playPassing(g);
      assert.equal(Object.keys(g.kept).length, n);
      assert.ok(g.lodgeRoomCard);
      const after = [...Object.values(g.kept), g.lodgeRoomCard].map(c => c.id).sort();
      assert.deepEqual(after, all);
      assert.equal(g.deck.length, 0);
      assert.equal(g.history.length, n);
    }
  }
});

test('傳牌驗證：非本人回合、傳給已有角色者、傳給自己、拿不在手上的牌', () => {
  const g = L.createLobby();
  L.startGame(g, ids(4));
  const actor = g.actorId;
  const other = ids(4).find(p => p !== actor);
  const [c1] = g.hand;
  assert.throws(() => L.keepCard(g, other, c1.card.id, actor), { code: 'NOT_YOUR_TURN' });
  assert.throws(() => L.keepCard(g, actor, 'nope', other), { code: 'BAD_CARD' });
  assert.throws(() => L.keepCard(g, actor, c1.card.id, actor), { code: 'BAD_TARGET' });
  assert.throws(() => L.keepCard(g, actor, c1.card.id, null), { code: 'BAD_TARGET' });

  L.keepCard(g, actor, c1.card.id, other);
  // actor 已留牌，不能再被傳牌
  const next = g.actorId;
  const keepNext = g.hand[0].card.id;
  assert.throws(() => L.keepCard(g, next, keepNext, actor), { code: 'BAD_TARGET' });
});

test('第二位起手上 = 收到的牌 + 抽 1 張', () => {
  const g = L.createLobby();
  L.startGame(g, ids(4));
  const actor = g.actorId;
  const target = ids(4).find(p => p !== actor);
  L.keepCard(g, actor, g.hand[0].card.id, target);
  assert.equal(g.actorId, target);
  assert.deepEqual(g.hand.map(h => h.from), ['passed', 'deck']);
});

test('投票：只能投玩家地點；結算取最高票；平票全進鍋爐室', () => {
  const g = L.createLobby();
  L.startGame(g, ids(4));
  playPassing(g);
  assert.throws(() => L.castVote(g, 'p1', 'zzz'), { code: 'BAD_TARGET' });
  assert.throws(() => L.castVote(g, 'ghost', 'p1'), { code: 'FORBIDDEN' });
  L.castVote(g, 'p1', 'p2');
  L.castVote(g, 'p2', 'p2');
  L.castVote(g, 'p3', 'p3');
  L.castVote(g, 'p4', 'p3');
  const r = L.resolveGame(g);
  assert.deepEqual(r.boilerIds.sort(), ['p2', 'p3']);
  assert.equal(g.phase, 'result');
});

test('勝負：殺人魔進鍋爐室 → 好人贏；否則殺人魔陣營贏', () => {
  const g = L.createLobby({ level: 2 });
  L.startGame(g, ids(4));
  playPassing(g);
  const killerId = g.order.find(id => g.kept[id].kind === 'killer');

  if (killerId) {
    for (const v of g.order) L.castVote(g, v, killerId);
    const r = L.resolveGame(g);
    assert.equal(r.winner, 'good');
    assert.ok(r.winnerIds.every(id => g.kept[id].kind === 'guest'));
  }

  // 重新開一局：送客人進鍋爐室
  const g2 = L.createLobby({ level: 2 });
  L.startGame(g2, ids(4));
  playPassing(g2);
  const guest2 = g2.order.find(id => g2.kept[id].kind === 'guest');
  for (const v of g2.order) L.castVote(g2, v, guest2);
  assert.equal(L.resolveGame(g2).winner, 'killer');

});

test('共犯單獨進鍋爐室，殺人魔陣營仍獲勝', () => {
  let found = false;
  for (let i = 0; i < 200 && !found; i++) {
    const g = L.createLobby({ level: 2 });
    L.startGame(g, ids(4));
    playPassing(g);
    const acc = g.order.find(id => g.kept[id].kind === 'accomplice');
    if (!acc) continue; // 共犯在客房
    found = true;
    for (const v of g.order) L.castVote(g, v, acc);
    assert.equal(L.resolveGame(g).winner, 'killer');
  }
  assert.ok(found);
});

test('無人投票 → 鍋爐室為空，殺人魔陣營獲勝', () => {
  const g = L.createLobby();
  L.startGame(g, ids(3));
  playPassing(g);
  const r = L.resolveGame(g);
  assert.deepEqual(r.boilerIds, []);
  assert.equal(r.winner, 'killer');
});

test('隱藏資訊：結算前他人視圖不含任何他人 / 客房的角色牌', () => {
  const g = L.createLobby({ level: 2 });
  L.startGame(g, ids(5));
  // 傳牌途中與結束後（討論 / 投票）都檢查
  const check = () => {
    for (const viewer of [...ids(5), null, 'spectator']) {
      const view = L.buildView(g, viewer);
      const json = JSON.stringify(view);
      const own = view.me?.card?.id;
      const handIds = (view.me?.hand ?? []).map(c => c.id);
      for (const card of [...Object.values(g.kept), g.lodgeRoomCard].filter(Boolean)) {
        if (card.id === own || handIds.includes(card.id)) continue;
        assert.ok(!json.includes(`"${card.id}"`), `${viewer} 的視圖洩漏了牌 ${card.id}`);
      }
      assert.equal(view.result, null);
    }
  };
  while (g.actorId) { check(); L.autoPlay(g); }
  check();
  L.beginDiscussion(g);
  check();
  L.beginVoting(g);
  check();
});

test('只有輪到的玩家看得到手牌與可傳對象；觀戰者沒有 me', () => {
  const g = L.createLobby();
  L.startGame(g, ids(4));
  const actor = g.actorId;
  const other = ids(4).find(p => p !== actor);
  assert.equal(L.buildView(g, actor).me.hand.length, 2);
  assert.equal(L.buildView(g, actor).me.passTargets.length, 3);
  assert.equal(L.buildView(g, other).me.hand.length, 0);
  assert.equal(L.buildView(g, 'spectator').me, null);
});

test('結算視圖：揭露所有牌與傳牌回放', () => {
  const g = L.createLobby();
  L.startGame(g, ids(4));
  playPassing(g);
  L.resolveGame(g);
  const v = L.buildView(g, 'p1');
  assert.equal(Object.keys(v.result.cards).length, 4);
  assert.ok(v.result.lodgeRoomCard);
  assert.equal(v.result.replay.length, 4);
  assert.equal(v.result.replay.at(-1).passedTo, 'lodge-room');
});

test('設定正規化與回到大廳', () => {
  assert.deepEqual(L.normalizeSettings({ level: 9, discussionSeconds: 7 }), { level: 1, discussionSeconds: 180 });
  assert.deepEqual(L.normalizeSettings({ level: 2, discussionSeconds: 300 }), { level: 2, discussionSeconds: 300 });
  const g = L.createLobby({ level: 2, discussionSeconds: 60 });
  L.startGame(g, ids(3));
  L.resetToLobby(g);
  assert.equal(g.phase, 'lobby');
  assert.equal(g.level, 2);
  assert.equal(g.discussionSeconds, 60);
  assert.equal(g.gameNo, 1);
});

// ── Level 3–5 ────────────────────────────────────────────────────
// 手動指定每人角色，直接進入投票階段
function rigged(level, kinds, votes) {
  const n = kinds.length;
  const g = L.createLobby({ level });
  L.startGame(g, ids(n));
  g.phase = 'voting';
  g.order = ids(n);
  g.kept = Object.fromEntries(kinds.map((k, i) => [`p${i + 1}`, { id: `k${i}`, kind: k }]));
  g.lodgeRoomCard = { id: 'room', kind: 'guest', color: 'red' };
  g.votes = votes;
  return g;
}

test('Level 3–5 牌組配置與牌數', () => {
  const kinds = (lv, n) => L.buildDeck(lv, n).map(c => c.kind).sort();
  assert.deepEqual(kinds(3, 4), ['accomplice', 'guest', 'guest', 'killer', 'lawyer']);
  assert.deepEqual(kinds(4, 3), ['bomber', 'guest', 'guest', 'killer']);
  assert.deepEqual(kinds(5, 4), ['bomber', 'guest', 'guest', 'killer', 'merchant']);
  for (const lv of [3, 4, 5]) for (let n = 4; n <= 6; n++) assert.equal(L.buildDeck(lv, n).length, n + 1);
});

test('Level 3、5 至少 4 人，Level 4 三人可開（SOLO_TEST 時不限）', { skip: L.SOLO_TEST }, () => {
  assert.throws(() => L.startGame(L.createLobby({ level: 3 }), ids(3)), { code: 'NOT_ENOUGH' });
  assert.throws(() => L.startGame(L.createLobby({ level: 5 }), ids(3)), { code: 'NOT_ENOUGH' });
  assert.doesNotThrow(() => L.startGame(L.createLobby({ level: 4 }), ids(3)));
});

test('律師作廢指定玩家的票；不能選自己、不能選沒投票的人、不能重複公開', () => {
  const g = rigged(3, ['lawyer', 'killer', 'guest', 'guest'], { p1: 'p3', p2: 'p3', p3: 'p2' });
  L.beginReveal(g);
  assert.throws(() => L.revealAbility(g, 'p1', 'p1'), { code: 'BAD_TARGET' });
  assert.throws(() => L.revealAbility(g, 'p1', 'p4'), { code: 'BAD_TARGET' });
  assert.throws(() => L.revealAbility(g, 'p2', 'p3'), { code: 'FORBIDDEN' });
  L.revealAbility(g, 'p1', 'p2'); // p2 投給 p3 的票作廢
  assert.throws(() => L.revealAbility(g, 'p1', 'p3'), { code: 'ALREADY_REVEALED' });
  const r = L.resolveGame(g);
  assert.equal(r.voteCounts.p3, 1);
  assert.equal(r.voteCounts.p2, 1);
  assert.deepEqual(r.voidedVoterIds, ['p2']);
  assert.deepEqual(r.boilerIds.sort(), ['p2', 'p3']); // 平票全進
});

test('富商公開後票算 2 票；不公開算 1 票', () => {
  const votes = { p1: 'p2', p2: 'p3', p3: 'p3', p4: 'p2' };
  const g1 = rigged(5, ['merchant', 'killer', 'guest', 'bomber'], votes);
  L.beginReveal(g1);
  L.revealAbility(g1, 'p1');
  assert.equal(L.resolveGame(g1).voteCounts.p2, 3);

  const g2 = rigged(5, ['merchant', 'killer', 'guest', 'bomber'], votes);
  L.beginReveal(g2);
  const r = L.resolveGame(g2);
  assert.equal(r.voteCounts.p2, 2);
  assert.equal(r.voteCounts.p3, 2);
});

test('律師可作廢已公開的富商的票（先作廢、後加權）', () => {
  const g = rigged(5, ['merchant', 'killer', 'guest', 'bomber'], { p1: 'p2', p3: 'p4' });
  g.kept.p3 = { id: 'x', kind: 'lawyer' };
  L.beginReveal(g);
  L.revealAbility(g, 'p1');
  L.revealAbility(g, 'p3', 'p1');
  assert.equal(L.resolveGame(g).voteCounts.p2, 0);
});

test('炸彈客進鍋爐室 → 單獨獲勝，即使殺人魔同時進鍋爐室', () => {
  const g = rigged(4, ['bomber', 'killer', 'guest', 'guest'], { p1: 'p1', p2: 'p2', p3: 'p1', p4: 'p2' });
  const r = L.resolveGame(g);
  assert.equal(r.winner, 'bomber');
  assert.deepEqual(r.winnerIds, ['p1']);
});

test('炸彈客沒進鍋爐室：照殺人魔勝負判定，炸彈客不算贏', () => {
  const good = rigged(4, ['bomber', 'killer', 'guest', 'guest'], { p1: 'p2', p2: 'p2', p3: 'p2', p4: 'p2' });
  const r1 = L.resolveGame(good);
  assert.equal(r1.winner, 'good');
  assert.deepEqual(r1.winnerIds, ['p3', 'p4']);

  const bad = rigged(4, ['bomber', 'killer', 'guest', 'guest'], { p1: 'p3', p2: 'p3', p3: 'p3', p4: 'p3' });
  const r2 = L.resolveGame(bad);
  assert.equal(r2.winner, 'killer');
  assert.deepEqual(r2.winnerIds, ['p2']);
});

test('開票階段視圖：能力資格只給持有者；票與公開能力全員可見', () => {
  const g = rigged(3, ['lawyer', 'killer', 'accomplice', 'guest'], { p1: 'p2', p2: 'p3', p3: 'p2' });
  L.beginReveal(g);
  assert.equal(L.buildView(g, 'p1').me.canReveal, true);
  assert.equal(L.buildView(g, 'p2').me.canReveal, false);
  assert.equal(L.buildView(g, null).votes.p1, 'p2');
  L.revealAbility(g, 'p1', 'p2');
  assert.equal(L.buildView(g, 'p1').me.canReveal, false);
  assert.deepEqual(L.buildView(g, 'p3').reveals, [{ playerId: 'p1', kind: 'lawyer', targetId: 'p2' }]);
  assert.equal(JSON.stringify(L.buildView(g, 'p3')).includes('"kind":"killer"'), false);
});

test('單人試玩：1 人可完整跑完傳牌 → 投票 → 結算', { skip: !L.SOLO_TEST }, () => {
  for (const level of L.LEVELS) {
    const g = L.createLobby({ level });
    L.startGame(g, ['p1']);
    const { done } = L.keepCard(g, 'p1', g.hand[0].card.id, null);
    assert.equal(done, true);
    L.beginDiscussion(g);
    L.beginVoting(g);
    L.castVote(g, 'p1', 'p1');
    L.beginReveal(g);
    const r = L.resolveGame(g);
    assert.equal(r.boilerIds[0], 'p1');
  }
});
