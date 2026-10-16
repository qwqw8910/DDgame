'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('./gameLogic');

const ST = 'st';
const ids = n => Array.from({ length: n }, (_, i) => `p${i + 1}`);

// 開到 setup 階段：n 位玩家依序入座
function setupGame(n) {
  const g = L.createLobby({ seatCount: n });
  ids(n).forEach((id, i) => { g.names[id] = id.toUpperCase(); L.claimSeat(g, id, i); });
  L.setStoryteller(g, ST);
  L.beginSetup(g);
  return g;
}

// 直接指定每個座位的角色並開始（drunkAs 給酒鬼）
function startWith(roles, { drunkAs = null, force = false } = {}) {
  const g = setupGame(roles.length);
  roles.forEach((r, i) => L.setSeatRole(g, i, r));
  if (drunkAs) L.setDrunkAs(g, drunkAs);
  L.startGame(g, { force });
  return g;
}

const ROLES7 = ['washerwoman', 'empath', 'monk', 'chef', 'fortuneteller', 'poisoner', 'imp']; // 7 人：5 鎮民 0 外來 1 爪牙 1 惡魔
const ROLES5 = ['washerwoman', 'empath', 'monk', 'poisoner', 'imp'];

// 一路推到白天提名階段
function toNomination(g) {
  L.toDawn(g);
  L.setDayPhase(g, 'free');
  L.setDayPhase(g, 'nomination');
}

// 投票：hands = 舉手的座位，指針跑完
function runVote(g, nominatorId, nominee, hands = []) {
  L.nominate(g, nominatorId, nominee);
  L.startVote(g);
  for (const s of hands) L.setHand(g, s, true);
  let r;
  while (!(r = L.voteTick(g)).done);
  return r.result;
}

// ── 大廳 ────────────────────────────────────────────────────────
test('大廳：入座、換座、說書人不入座、指定說書人時自動離座', () => {
  const g = L.createLobby({ seatCount: 6 });
  L.claimSeat(g, 'a', 0);
  L.claimSeat(g, 'b', 1);
  assert.throws(() => L.claimSeat(g, 'c', 0), { code: 'SEAT_TAKEN' });
  L.claimSeat(g, 'a', 3); // 換座：原座位釋出
  assert.equal(g.lobbySeats[0], null);
  assert.equal(g.lobbySeats[3], 'a');
  L.setStoryteller(g, 'a');
  assert.equal(g.lobbySeats.includes('a'), false);
  assert.throws(() => L.claimSeat(g, 'a', 0), { code: 'FORBIDDEN' });
  L.swapSeats(g, 1, 5);
  assert.equal(g.lobbySeats[5], 'b');
});

test('隨機抽說書人：從候選人中抽一位', () => {
  const g = L.createLobby();
  const id = L.pickRandomStoryteller(g, ['x', 'y', 'z'], () => 0.99);
  assert.equal(id, 'z');
  assert.equal(g.storytellerId, 'z');
});

test('開局條件：需要說書人、至少 5 人入座；空位被壓縮', () => {
  const g = L.createLobby({ seatCount: 8 });
  ['a', 'b', 'c', 'd'].forEach((id, i) => L.claimSeat(g, id, i * 2));
  assert.throws(() => L.beginSetup(g), { code: 'NO_STORYTELLER' });
  L.setStoryteller(g, ST);
  assert.throws(() => L.beginSetup(g), { code: 'NOT_ENOUGH' });
  L.claimSeat(g, 'e', 7);
  L.beginSetup(g);
  assert.deepEqual(g.seats.map(s => s.playerId), ['a', 'b', 'c', 'd', 'e']);
});

test('測試機器人：填滿空座位', () => {
  const g = L.createLobby({ seatCount: 6 });
  L.claimSeat(g, 'me', 2);
  assert.equal(L.addBots(g), 5);
  assert.ok(g.lobbySeats.every(Boolean));
  assert.equal(new Set(g.lobbySeats).size, 6);
  L.removeBots(g);
  assert.deepEqual(g.lobbySeats.filter(Boolean), ['me']);
});

// ── 配置合法性 ───────────────────────────────────────────────────
test('配置表：5～15 人的總數都等於人數', () => {
  for (let n = L.MIN_SEATS; n <= L.MAX_SEATS; n++) {
    const c = L.baseComposition(n);
    assert.equal(c.townsfolk + c.outsider + c.minion + c.demon, n);
    assert.equal(c.demon, 1);
  }
});

test('隨機配置：各人數都產生合法配置', () => {
  for (let n = 5; n <= 15; n++) {
    for (let k = 0; k < 10; k++) {
      const g = setupGame(n);
      L.randomRoles(g);
      L.randomAssign(g);
      assert.deepEqual(L.checkSetup(g), [], `n=${n}: ${L.checkSetup(g)}`);
      assert.equal(g.bluffs.length, 3);
      assert.ok(g.bluffs.every(b => L.isGoodRole(b) && !g.seats.some(s => s.roleId === b)));
    }
  }
});

test('配置檢查：人數不符、重複、缺角色會被擋；可強制開始並記錄', () => {
  const g = setupGame(5);
  ['washerwoman', 'empath', 'monk', 'chef', 'imp'].forEach((r, i) => L.setSeatRole(g, i, r));
  const errs = L.checkSetup(g);
  assert.ok(errs.some(e => e.includes('鎮民應為 3')));
  assert.ok(errs.some(e => e.includes('爪牙應為 1')));
  assert.throws(() => L.startGame(g), { code: 'INVALID_SETUP' });
  L.startGame(g, { force: true });
  assert.equal(g.phase, 'night');
  assert.ok(g.log.some(e => e.type === 'setup-forced'));

  const g2 = setupGame(5);
  L.setSeatRole(g2, 0, 'imp');
  assert.throws(() => L.startGame(g2), { code: 'INVALID_SETUP' }); // 有座位沒角色
});

test('男爵：外來者 +2、鎮民 −2', () => {
  const g = setupGame(7); // 基本 5/0/1/1 → 男爵 3/2/1/1
  ['washerwoman', 'empath', 'monk', 'saint', 'recluse', 'baron', 'imp'].forEach((r, i) => L.setSeatRole(g, i, r));
  assert.deepEqual(L.checkSetup(g), []);
  L.setSeatRole(g, 3, 'chef');
  assert.ok(L.checkSetup(g).some(e => e.includes('外來者應為 2')));
});

test('酒鬼：必須指定以為的鎮民，且不能在場', () => {
  const g = setupGame(6); // 3/1/1/1
  ['washerwoman', 'empath', 'monk', 'drunk', 'poisoner', 'imp'].forEach((r, i) => L.setSeatRole(g, i, r));
  assert.ok(L.checkSetup(g).some(e => e.includes('酒鬼')));
  assert.throws(() => L.setDrunkAs(g, 'monk'), { code: 'BAD_ROLE' });  // 在場
  assert.throws(() => L.setDrunkAs(g, 'saint'), { code: 'BAD_ROLE' }); // 不是鎮民
  L.setDrunkAs(g, 'chef');
  assert.deepEqual(L.checkSetup(g), []);
  L.startGame(g);
  assert.equal(g.seats[3].roleId, 'drunk');
  assert.equal(g.seats[3].shownRoleId, 'chef');
});

test('隨機分配可重複按：手動改角色或勾選數量不符時，以目前座位角色重新洗牌', () => {
  const g = setupGame(5);
  L.randomRoles(g);
  L.randomAssign(g);
  const before = [...g.seats.map(s => s.roleId)].sort();
  L.selectRoles(g, ['imp']); // 勾選清單被改到數量不符
  for (let k = 0; k < 5; k++) L.randomAssign(g);
  assert.deepEqual(g.seats.map(s => s.roleId).sort(), before, '角色組成不變，只是重新洗牌');
  L.swapSeatRoles(g, 0, 1);
  L.setSeatRole(g, 0, g.seats[0].roleId); // 手動指定後勾選清單同步
  assert.equal(g.setupRoles.length, 5);
  const g2 = setupGame(5);
  assert.throws(() => L.randomAssign(g2), { code: 'BAD_ROLE' }, '還沒分配過又沒選夠角色仍會被擋');
});

test('強制開始時酒鬼沒指定假角色：系統補一個不在場的鎮民，酒鬼看不到真身', () => {
  const g = setupGame(6);
  ['washerwoman', 'empath', 'monk', 'drunk', 'poisoner', 'imp'].forEach((r, i) => L.setSeatRole(g, i, r));
  L.startGame(g, { force: true });
  const shown = g.seats[3].shownRoleId;
  assert.equal(L.teamOf(shown), 'townsfolk');
  assert.ok(!g.seats.some(s => s.roleId === shown));
  assert.notEqual(L.buildView(g, 'p4').me.roleId, 'drunk');
});

test('setup：互換角色、修改都寫進日誌', () => {
  const g = setupGame(5);
  L.randomRoles(g);
  L.randomAssign(g);
  const [r0, r1] = [g.seats[0].roleId, g.seats[1].roleId];
  L.swapSeatRoles(g, 0, 1);
  assert.equal(g.seats[0].roleId, r1);
  assert.equal(g.seats[1].roleId, r0);
  assert.ok(['setup-random', 'setup-swap'].every(t => g.log.some(e => e.type === t)));
});

// ── 夜晚 ────────────────────────────────────────────────────────
test('首夜順序：7 人以上有邪惡互認；依 firstNight 排序；酒鬼依以為的角色排', () => {
  const g = startWith(ROLES7);
  const keys = g.nightQueue.map(e => e.roleId);
  assert.deepEqual(keys.slice(0, 3), ['minioninfo', 'demoninfo', 'poisoner']);
  assert.ok(!keys.includes('monk'), '僧侶首夜不行動');
  assert.ok(!keys.includes('imp'), '小惡魔首夜不行動');

  const g5 = startWith(ROLES5);
  assert.ok(!g5.nightQueue.some(e => e.roleId === 'minioninfo'), '5 人局沒有邪惡互認');

  const gd = startWith(['washerwoman', 'empath', 'monk', 'drunk', 'poisoner', 'imp'], { drunkAs: 'chef' });
  assert.ok(gd.nightQueue.some(e => e.roleId === 'chef' && e.seat === 3));
});

test('邪惡互認：爪牙得知惡魔，惡魔得知爪牙與偽裝', () => {
  const g = startWith(ROLES7);
  L.sendInfo(g, 'minioninfo');
  L.sendInfo(g, 'demoninfo');
  const minionMsg = g.messages.p6[0];
  assert.deepEqual(minionMsg.demons, [6]);
  const demonMsg = g.messages.p7[0];
  assert.deepEqual(demonMsg.minions, [5]);
  assert.equal(demonMsg.bluffs.length, 3);
  assert.ok(g.nightQueue.find(e => e.key === 'minioninfo').done);
});

test('夜晚順序自動完成：只選人的角色選完即完成；選人後要回資訊的角色要等資訊送出', () => {
  const g = startWith(ROLES7);
  const done = key => g.nightQueue.find(e => e.key === key).done;
  // 投毒者：選完就完成
  let p = L.wake(g, 5);
  L.replyPrompt(g, 'p6', p.id, [0]);
  assert.ok(done('poisoner:5'));
  // 占卜師：選完還沒完成，送出是/否資訊後才完成
  p = L.wake(g, 4);
  L.replyPrompt(g, 'p5', p.id, [0, 1]);
  assert.ok(!done('fortuneteller:4'));
  L.sendInfo(g, 4, { type: 'info-yes-no', yes: false, forRole: 'fortuneteller' });
  assert.ok(done('fortuneteller:4'));
  // 廚師：送出資訊即完成；沒標角色的資訊不影響
  L.sendInfo(g, 3, { type: 'custom', text: 'hi' });
  assert.ok(!done('chef:3'));
  L.sendInfo(g, 3, { type: 'info-number', number: 0, forRole: 'chef' });
  assert.ok(done('chef:3'));
});

test('自動提醒標記：投毒者下次行動前清除、僧侶 / 小惡魔天亮清除；不能選自己', () => {
  const g = startWith(ROLES7);
  // 首夜投毒者毒 p1
  let p = L.wake(g, 5);
  L.replyPrompt(g, 'p6', p.id, [0]);
  assert.ok(g.reminders.some(r => r.seat === 0 && r.reminderId === 'poisoner:poisoned'));
  assert.ok(L.isImpaired(g, 0));
  L.toDawn(g);
  assert.ok(g.reminders.some(r => r.reminderId === 'poisoner:poisoned'), '中毒在天亮後仍保留');
  L.setDayPhase(g, 'free');
  L.setDayPhase(g, 'nomination');
  L.endDay(g);
  assert.equal(g.phase, 'night');

  // 第二夜：投毒者改毒 p2 → p1 的中毒標記清除
  p = L.wake(g, 5);
  L.replyPrompt(g, 'p6', p.id, [1]);
  assert.deepEqual(g.reminders.filter(r => r.reminderId === 'poisoner:poisoned').map(r => r.seat), [1]);

  // 僧侶不能選自己
  p = L.wake(g, 2);
  assert.throws(() => L.replyPrompt(g, 'p3', p.id, [2]), { code: 'BAD_TARGET' });
  L.replyPrompt(g, 'p3', p.id, [3]);
  // 小惡魔攻擊：只放標記，不會自動死亡
  p = L.wake(g, 6);
  L.replyPrompt(g, 'p7', p.id, [0]);
  assert.ok(g.reminders.some(r => r.reminderId === 'imp:target' && r.seat === 0));
  assert.equal(g.seats[0].isDead, false);
  L.toDawn(g);
  assert.ok(!g.reminders.some(r => ['monk:protected', 'imp:target'].includes(r.reminderId)));
});

test('行動者中毒 / 醉酒時，自動標記標為 doubtful', () => {
  const g = startWith(ROLES7);
  L.toDawn(g); L.setDayPhase(g, 'free'); L.setDayPhase(g, 'nomination'); L.endDay(g);
  L.addReminder(g, 2, 'poisoner:poisoned');
  const p = L.wake(g, 2);
  L.replyPrompt(g, 'p3', p.id, [0]);
  assert.equal(g.reminders.find(r => r.reminderId === 'monk:protected').doubtful, true);
});

test('說書人可撤銷自動標記並寫進日誌；代斷線玩家回覆', () => {
  const g = startWith(ROLES7);
  L.wake(g, 5);
  L.actFor(g, 5, [1]);
  const r = g.reminders.find(x => x.reminderId === 'poisoner:poisoned');
  L.removeReminder(g, r.id);
  assert.equal(g.reminders.length, 0);
  assert.ok(g.log.some(e => e.type === 'act-for'));
  assert.ok(g.log.some(e => e.type === 'reminder-remove' && e.auto));
});

test('夜晚死亡天亮才公布；玩家視圖在夜晚看不到', () => {
  const g = startWith(ROLES7);
  L.setDead(g, 0, true);
  assert.equal(L.buildView(g, 'p2').seats[0].isDead, false);
  assert.equal(L.buildView(g, ST).seats[0].isDead, true);
  const deaths = L.toDawn(g);
  assert.deepEqual(deaths, [0]);
  assert.equal(L.buildView(g, 'p2').seats[0].isDead, true);
  assert.ok(g.chat.public.some(m => m.system && m.text.includes('P1')));
});

test('info-* 資訊：說書人填好送出，只進該玩家的訊息', () => {
  const g = startWith(ROLES7);
  L.sendInfo(g, 1, { type: 'info-number', number: 1 });
  L.sendInfo(g, 0, { type: 'info-players-role', players: [2, 3], showRole: 'monk' });
  assert.throws(() => L.sendInfo(g, 0, { type: 'info-number', number: 'x' }), { code: 'BAD_INFO' });
  assert.equal(g.messages.p2[0].number, 1);
  assert.deepEqual(L.buildView(g, 'p1').me.messages[0].players, [2, 3]);
  assert.equal(L.buildView(g, 'p3').me.messages.length, 0);
});

// ── 白天：提名與投票 ─────────────────────────────────────────────
test('提名限制：每人每天各一次；死亡玩家不能提名；要等說書人開放', () => {
  const g = startWith(ROLES7);
  L.toDawn(g);
  assert.throws(() => L.nominate(g, 'p1', 2), { code: 'BAD_PHASE' });
  L.setDayPhase(g, 'free');
  L.setDayPhase(g, 'nomination');
  runVote(g, 'p1', 2);
  assert.throws(() => L.nominate(g, 'p1', 3), { code: 'ALREADY_NOMINATED' });
  assert.throws(() => L.nominate(g, 'p2', 2), { code: 'ALREADY_NOMINATED' });
  L.setDead(g, 3, true);
  assert.throws(() => L.nominate(g, 'p4', 5), { code: 'FORBIDDEN' });
});

test('投票門檻 ⌈存活/2⌉、嚴格高於、同票不處決', () => {
  const g = startWith(ROLES7); // 7 人存活 → 門檻 4
  toNomination(g);
  assert.equal(L.voteThreshold(g), 4);
  let r = runVote(g, 'p1', 2, [0, 1, 3]);
  assert.equal(r.votes, 3);
  assert.equal(g.nominations.onTheBlock, null, '未達門檻');
  r = runVote(g, 'p2', 3, [0, 1, 2, 4]);
  assert.equal(r.votes, 4);
  assert.equal(g.nominations.onTheBlock, 3);
  runVote(g, 'p3', 4, [0, 1, 2, 3]);
  assert.equal(g.nominations.onTheBlock, null, '同票 → 都不處決');
  runVote(g, 'p4', 5, [0, 1, 2, 3]);
  assert.equal(g.nominations.onTheBlock, null, '同票仍需嚴格高於');
  runVote(g, 'p5', 6, [0, 1, 2, 3, 4]);
  assert.equal(g.nominations.onTheBlock, 6);
});

test('指針順序：從被提名者下一位開始，被提名者最後；指針經過後鎖定', () => {
  const g = startWith(ROLES7);
  toNomination(g);
  L.nominate(g, 'p1', 2);
  L.startVote(g);
  assert.deepEqual(g.voting.order, [3, 4, 5, 6, 0, 1, 2]);
  L.voteTick(g); // 經過座位 3
  assert.throws(() => L.setHand(g, 3, true), { code: 'LOCKED' });
  L.setHand(g, 2, true);
  L.setHand(g, 2, false);
  L.setHand(g, 2, true);
  let r; while (!(r = L.voteTick(g)).done);
  assert.deepEqual(r.result.voters, [2]);
});

test('幽靈票只能用一次；已離開座位跳過', () => {
  const g = startWith(ROLES7);
  toNomination(g);
  L.setDead(g, 0, true);
  L.playerLeft(g, 'p2');
  assert.equal(g.seats[1].hasLeft, true);
  assert.equal(g.seats[1].isDead, true);
  L.nominate(g, 'p3', 4);
  L.startVote(g);
  L.setHand(g, 0, true);
  assert.throws(() => L.setHand(g, 1, true), { code: 'FORBIDDEN' }); // 已離開
  let r; while (!(r = L.voteTick(g)).done);
  assert.deepEqual(r.result.voters, [0]);
  assert.equal(g.seats[0].ghostVoteUsed, true);
  L.nominate(g, 'p4', 5);
  L.startVote(g);
  assert.throws(() => L.setHand(g, 0, true), { code: 'FORBIDDEN' }); // 幽靈票用完
});

test('結束白天：處決 onTheBlock 後入夜', () => {
  const g = startWith(ROLES7);
  toNomination(g);
  runVote(g, 'p1', 2, [0, 1, 3, 4]);
  const res = L.endDay(g);
  assert.equal(res.executed, 2);
  assert.equal(g.seats[2].isDead, true);
  assert.equal(g.phase, 'night');
  assert.equal(g.dayNumber, 1);
  assert.ok(!g.nightQueue.some(e => e.seat === 2), '死亡玩家不再被喚醒');
  assert.ok(g.nightQueue.some(e => e.roleId === 'imp'));
});

// ── 勝負 ────────────────────────────────────────────────────────
test('勝負：惡魔死亡 → 善良勝（說書人確認）', () => {
  const g = startWith(ROLES7);
  toNomination(g);
  runVote(g, 'p1', 6, [0, 1, 2, 3]);
  const res = L.endDay(g);
  assert.equal(res.waiting, true);
  assert.equal(g.phase, 'day');
  assert.equal(g.pendingWinner.team, 'good');
  L.confirmWinner(g, true);
  assert.equal(g.phase, 'result');
  assert.equal(g.winner.team, 'good');
  assert.deepEqual(g.winner.winnerIds.sort(), ['p1', 'p2', 'p3', 'p4', 'p5']);
});

test('勝負：剩 2 人且惡魔存活 → 邪惡勝；說書人可先不要', () => {
  const g = startWith(ROLES5);
  L.setDead(g, 0, true); L.setDead(g, 1, true);
  L.toDawn(g);
  assert.equal(g.pendingWinner, null, '剩 3 人時還沒結束');
  L.setDead(g, 2, true);
  assert.equal(g.pendingWinner.team, 'evil');
  L.confirmWinner(g, false);
  assert.equal(g.phase, 'day');
  assert.equal(g.pendingWinner, null);
  L.declareWinner(g, 'evil', '說書人宣告');
  assert.deepEqual(g.winner.winnerIds.sort(), ['p4', 'p5']);
});

test('紅唇女郎在場時，惡魔死亡的判定附帶提示', () => {
  const g = startWith(['washerwoman', 'empath', 'monk', 'chef', 'fortuneteller', 'scarletwoman', 'imp']);
  L.toDawn(g);
  L.setDead(g, 6, true);
  assert.equal(g.pendingWinner.team, 'good');
  assert.ok(g.pendingWinner.note.includes('紅唇女郎'));
});

// ── 聊天 ────────────────────────────────────────────────────────
function dayFree() {
  const g = startWith(ROLES7);
  L.toDawn(g);
  L.setDayPhase(g, 'free');
  return g;
}
const T0 = 1_000_000;

test('私聊：接受才成立；同時只能在一個群組；接受新邀請自動離開原群組', () => {
  const g = dayFree();
  const [inv] = L.whisperInvite(g, 'p1', ['p2'], T0);
  assert.equal(L.buildView(g, 'p3', T0).whisperGroups.length, 0, '接受前不畫線');
  L.whisperRespond(g, 'p2', inv.id, true, T0);
  assert.deepEqual(L.groupOf(g, 'p1').members, ['p1', 'p2']);
  const [inv2] = L.whisperInvite(g, 'p3', ['p2'], T0);
  const { leftGroupId } = L.whisperRespond(g, 'p2', inv2.id, true, T0 + 10);
  assert.ok(leftGroupId);
  assert.deepEqual(L.groupOf(g, 'p2').members, ['p3', 'p2']);
  assert.equal(L.groupOf(g, 'p1'), null, '原群組剩 1 人自動結束');
  assert.ok(g.log.some(e => e.type === 'whisper' && e.public && e.participants.includes('p1')));
});

test('私聊：邀請 30 秒過期；群組成員可再邀請；離開剩 1 人結束', () => {
  const g = dayFree();
  const [inv] = L.whisperInvite(g, 'p1', ['p2'], T0);
  assert.throws(() => L.whisperRespond(g, 'p2', inv.id, true, T0 + L.INVITE_TTL_MS + 1), { code: 'EXPIRED' });
  const [a] = L.whisperInvite(g, 'p1', ['p2'], T0);
  L.whisperRespond(g, 'p2', a.id, true, T0);
  const [b] = L.whisperInvite(g, 'p2', ['p3'], T0);
  L.whisperRespond(g, 'p3', b.id, true, T0);
  assert.equal(L.groupOf(g, 'p1').members.length, 3);
  L.whisperLeave(g, 'p1', T0 + 5);
  L.whisperLeave(g, 'p2', T0 + 6);
  assert.equal(L.groupOf(g, 'p3'), null);
});

test('私聊：只能在自由時間送訊息；集合提名時全部解散，內容仍可閱讀', () => {
  const g = dayFree();
  const [inv] = L.whisperInvite(g, 'p1', ['p2'], T0);
  L.whisperRespond(g, 'p2', inv.id, true, T0);
  const { group } = L.whisperSend(g, 'p1', '我是共情者 [[role:empath]]', T0);
  L.setDayPhase(g, 'nomination', T0 + 100);
  assert.equal(group.endedAt, T0 + 100);
  assert.throws(() => L.whisperSend(g, 'p1', 'hi', T0 + 5000), { code: 'BAD_PHASE' });
  assert.equal(L.buildView(g, 'p2', T0).chat.whispers[group.id].history.length, 1);
});

test('聊天限制：300 字、1.5 秒一則、觀戰者不能發言', () => {
  const g = dayFree();
  L.setDayPhase(g, 'nomination', T0);
  L.chatPublic(g, 'p1', 'hello', T0);
  assert.throws(() => L.chatPublic(g, 'p1', 'again', T0 + 500), { code: 'TOO_FAST' });
  L.chatPublic(g, 'p1', 'again', T0 + 1600);
  assert.throws(() => L.chatPublic(g, 'p2', 'x'.repeat(301), T0), { code: 'TOO_LONG' });
  assert.throws(() => L.chatPublic(g, 'watcher', 'hi', T0), { code: 'FORBIDDEN' });
  assert.throws(() => L.chatStoryteller(g, 'watcher', 'hi', null, T0), { code: 'FORBIDDEN' });
});

test('私訊說書人：任何時間（含夜晚）；說書人回覆要帶玩家', () => {
  const g = startWith(ROLES7);
  L.chatStoryteller(g, 'p1', '我想問', null, T0);
  L.chatStoryteller(g, ST, '請說', 'p1', T0 + 2000);
  assert.throws(() => L.chatStoryteller(g, ST, 'x', null, T0 + 4000), { code: 'BAD_TARGET' });
  assert.equal(g.chat.storyteller.p1.length, 2);
});

// ── buildView 不洩漏 ─────────────────────────────────────────────
test('buildView：玩家 / 觀戰者看不到他人角色、提醒標記、酒鬼真身、別人的私聊與私訊；終局才公開', () => {
  const g = startWith(['washerwoman', 'empath', 'monk', 'drunk', 'poisoner', 'imp'], { drunkAs: 'chef' });
  L.sendInfo(g, 0, { type: 'info-players-role', players: [1, 4], showRole: 'empath' });
  L.wake(g, 4);
  L.replyPrompt(g, 'p5', null, [1]);
  L.chatStoryteller(g, 'p2', '秘密私訊', null, T0);
  L.toDawn(g);
  L.setDayPhase(g, 'free', T0);
  const [inv] = L.whisperInvite(g, 'p1', ['p2'], T0);
  L.whisperRespond(g, 'p2', inv.id, true, T0);
  L.whisperSend(g, 'p1', '悄悄話內容', T0);

  const roleWords = ['washerwoman', 'empath', 'monk', 'drunk', 'poisoner', 'imp', 'chef'];
  for (const viewer of ['p1', 'p3', 'p4', 'watcher', null]) {
    const v = L.buildView(g, viewer, T0);
    for (const s of v.seats) assert.equal(s.roleId, undefined, `${viewer} 看到座位角色`);
    assert.equal(v.grimoire, null);
    const { me, ...rest } = v;
    const json = JSON.stringify(rest);
    for (const w of roleWords) assert.ok(!json.includes(`"${w}"`), `${viewer} 視圖洩漏 ${w}`);
    assert.ok(!json.includes('poisoner:poisoned'), `${viewer} 看到提醒標記`);
    assert.ok(!json.includes('秘密私訊'), `${viewer} 看到別人的私訊說書人`);
    if (viewer !== 'p1') assert.ok(!json.includes('悄悄話內容'), `${viewer} 看到別人的私聊`);
    if (me) {
      assert.equal(me.messages.every(m => m.dayNumber !== undefined), true);
      assert.ok(!JSON.stringify(me).includes('"drunk"'), '酒鬼本人看到自己是酒鬼');
    }
  }
  assert.equal(L.buildView(g, 'p4').me.roleId, 'chef', '酒鬼看到假的鎮民');
  assert.equal(L.buildView(g, 'p1').me.roleId, 'washerwoman');
  assert.ok(JSON.stringify(L.buildView(g, 'p1', T0)).includes('悄悄話內容'), '群組成員看得到內容');
  // 說書人：魔典全部，但看不到私聊內容
  const st = L.buildView(g, ST, T0);
  assert.equal(st.seats[3].roleId, 'drunk');
  assert.ok(st.grimoire.reminders.length);
  assert.ok(!JSON.stringify(st).includes('悄悄話內容'), '說書人在終局前看不到私聊內容');

  L.declareWinner(g, 'good', 'test');
  for (const viewer of ['p3', 'watcher']) {
    const v = L.buildView(g, viewer, T0);
    assert.equal(v.seats[3].roleId, 'drunk');
    assert.ok(v.grimoire.reminders.length);
    assert.ok(JSON.stringify(v).includes('悄悄話內容'), '終局公開私聊內容');
    assert.ok(!JSON.stringify(v).includes('秘密私訊'), '私訊說書人終局也不公開');
    assert.ok(v.log.some(e => e.type === 'start'), '終局公開完整日誌');
  }
});

test('日誌：玩家只看到公開事件', () => {
  const g = startWith(ROLES7);
  L.wake(g, 5);
  L.replyPrompt(g, 'p6', null, [0]);
  const v = L.buildView(g, 'p1');
  assert.ok(v.log.every(e => e.public));
  assert.ok(L.buildView(g, ST).log.some(e => e.type === 'prompt-reply'));
});

// ── 暫停 / 離開 / 交接 / 重來 ────────────────────────────────────
test('說書人斷線暫停：所有操作被擋，回來後恢復原階段', () => {
  const g = startWith(ROLES7);
  L.toDawn(g);
  assert.equal(L.pause(g), true);
  assert.equal(g.phase, 'paused');
  assert.throws(() => L.setDayPhase(g, 'free'), { code: 'PAUSED' });
  L.resume(g);
  assert.equal(g.phase, 'day');
});

test('玩家離開：座位保留、視同死亡；說書人離開 → abort', () => {
  const g = startWith(ROLES7);
  assert.equal(L.playerLeft(g, 'p3'), 'seat');
  assert.equal(g.seats[2].hasLeft, true);
  assert.equal(L.buildView(g, 'p1').seats[2].isDead, true);
  assert.equal(L.identityOf(g, 'p3'), 'spectator', '離開的人重新進房只能觀戰');
  assert.equal(L.playerLeft(g, ST), 'abort');
});

test('交接說書人：只能交給觀戰者', () => {
  const g = startWith(ROLES7);
  assert.throws(() => L.transferStoryteller(g, ST, 'p1'), { code: 'BAD_TARGET' });
  assert.throws(() => L.transferStoryteller(g, 'p1', 'w'), { code: 'FORBIDDEN' });
  L.transferStoryteller(g, ST, 'watcher');
  assert.equal(g.storytellerId, 'watcher');
  assert.equal(L.identityOf(g, 'watcher'), 'storyteller');
});

test('回大廳：保留座位順序與說書人，清空遊戲資料', () => {
  const g = startWith(ROLES7);
  L.playerLeft(g, 'p2');
  L.declareWinner(g, 'good', 'x');
  L.resetToLobby(g);
  assert.equal(g.phase, 'lobby');
  assert.equal(g.storytellerId, ST);
  assert.deepEqual(g.lobbySeats.filter(Boolean), ['p1', 'p3', 'p4', 'p5', 'p6', 'p7']);
  assert.equal(g.seats.length, 0);
  assert.equal(g.log.length, 0);
  assert.equal(g.gameNo, 1);
});

// ── Phase 2：說書人輔助 ─────────────────────────────────────────
// ROLES7 座位：0 洗衣婦、1 共情者、2 僧侶、3 廚師、4 占卜師、5 投毒者、6 小惡魔

test('真實答案：廚師（鄰座邪惡對數）、共情者（跳過死亡鄰座）', () => {
  const g = startWith(ROLES7);
  assert.equal(L.computeTruth(g, 3, 'chef').number, 1, '5 投毒者 + 6 小惡魔相鄰 = 1 對');
  assert.equal(L.computeTruth(g, 1, 'empath').number, 0);
  L.setDead(g, 0, true);
  const t = L.computeTruth(g, 1, 'empath');
  assert.deepEqual(t.neighbors.sort(), [2, 6], '死亡的 0 號被跳過，左邊鄰居變成 6 號');
  assert.equal(t.number, 1);
});

test('真實答案：洗衣婦兩人之一是真角色、預填穩定不跳動；沒有外來者時圖書管理員給 0', () => {
  const g = startWith(ROLES7);
  const t = L.computeTruth(g, 0, 'washerwoman');
  assert.equal(t.type, 'info-players-role');
  assert.equal(t.players.length, 2);
  assert.equal(t.players.includes(0), false, '不會指到自己');
  assert.ok(t.players.some(p => g.seats[p].roleId === t.showRole));
  assert.equal(L.teamOf(t.showRole), 'townsfolk');
  assert.deepEqual(L.computeTruth(g, 0, 'washerwoman'), t, '同一夜重算結果相同');
  const lib = L.computeTruth(g, 0, 'librarian');
  assert.equal(lib.showRole, null);
  assert.deepEqual(lib.players, []);
});

test('真實答案：占卜師（含紅鯡魚）、送葬者、守鴉人；中毒時標示 impaired', () => {
  const g = startWith(ROLES7);
  assert.equal(L.computeTruth(g, 4, 'fortuneteller', null).yes, null, '還沒選人');
  assert.equal(L.computeTruth(g, 4, 'fortuneteller', [5, 6]).yes, true);
  assert.equal(L.computeTruth(g, 4, 'fortuneteller', [1, 2]).yes, false);
  L.addReminder(g, 2, 'fortuneteller:redherring');
  assert.equal(L.computeTruth(g, 4, 'fortuneteller', [1, 2]).yes, true, '紅鯡魚視為惡魔');
  assert.equal(L.computeTruth(g, 4, 'ravenkeeper', [6]).showRole, 'imp');
  L.addReminder(g, 4, 'poisoner:poisoned');
  assert.equal(L.computeTruth(g, 4, 'fortuneteller', [1, 2]).impaired, true);

  toNomination(g);
  runVote(g, 'p1', 5, [0, 1, 2, 3]);
  L.endDay(g);
  const u = L.computeTruth(g, 2, 'undertaker');
  assert.equal(u.player, 5);
  assert.equal(u.showRole, 'poisoner');
});

test('送資訊：系統依魔典判定真假寫進日誌，說書人不能自稱為真', () => {
  const g = startWith(ROLES7);
  L.sendInfo(g, 3, { type: 'info-number', number: 1, forRole: 'chef' });
  L.sendInfo(g, 3, { type: 'info-number', number: 0, forRole: 'chef', isTrue: true });
  L.sendInfo(g, 0, { type: 'info-players-role', players: [1, 4], showRole: 'empath', forRole: 'washerwoman' });
  L.sendInfo(g, 0, { type: 'info-players-role', players: [1, 4], showRole: 'imp', forRole: 'washerwoman' });
  L.sendInfo(g, 0, { type: 'custom', text: '隨便說說', forRole: 'washerwoman', isTrue: false });
  const infos = g.log.filter(e => e.type === 'info');
  assert.deepEqual(infos.map(e => e.isTrue), [true, false, true, false, false]);
  assert.deepEqual(infos.map(e => e.judged), [true, true, true, true, false]);
  assert.equal(infos[0].message.visibleAt, undefined, '日誌不含延遲時間');
});

test('夜晚隨機延遲：時間到之前玩家看不到 prompt / 資訊，說書人立即看得到', () => {
  const g = startWith(ROLES7);
  const p = L.wake(g, 5, { delayMs: 1000 }, 10_000);
  assert.equal(p.visibleAt, 11_000);
  assert.equal(L.buildView(g, 'p6', 10_500).me.prompt, null);
  assert.equal(L.buildView(g, 'p6', 11_000).me.prompt.id, p.id);
  assert.ok(L.buildView(g, ST, 10_500).grimoire.prompts.p6);

  L.sendInfo(g, 3, { type: 'info-number', number: 1 }, 20_000, 1500);
  assert.equal(L.buildView(g, 'p4', 21_000).me.messages.length, 0);
  assert.equal(L.buildView(g, 'p4', 21_500).me.messages.length, 1);
  for (let i = 0; i < 50; i++) {
    const d = L.randomDelay();
    assert.ok(d >= 0 && d <= L.NIGHT_DELAY_MAX_MS);
  }
});

test('說書人視圖：夜晚順序附上真實答案與平衡指標；玩家看不到', () => {
  const g = startWith(ROLES7);
  const st = L.buildView(g, ST);
  const chef = st.grimoire.nightQueue.find(e => e.roleId === 'chef');
  assert.equal(chef.truth.number, 1);
  assert.equal(st.grimoire.nightQueue.find(e => e.key === 'minioninfo').truth, null);
  assert.deepEqual(st.grimoire.balance.alive, { total: 7, good: 5, evil: 2 });
  assert.equal(st.grimoire.balance.heat, 'low');
  assert.equal(L.buildView(g, 'p1').grimoire, null);
});

test('平衡指標：惡魔被提名且過門檻 → 高度懷疑；邪惡追平善良時提醒', () => {
  const g = startWith(ROLES7);
  toNomination(g);
  runVote(g, 'p1', 6, [0, 1, 2, 3]);
  const b = L.balanceStats(g);
  assert.equal(b.demonNominated, 1);
  assert.equal(b.heat, 'high');
  [0, 1, 2].forEach(i => L.setDead(g, i, true));
  assert.ok(L.balanceStats(g).hints.some(h => h.includes('追平')));
});

test('私聊紀錄 whisperLog：所有人（含觀戰者）看得到成員與時間，看不到內容', () => {
  const g = startWith(ROLES7);
  L.toDawn(g);
  L.setDayPhase(g, 'free', 1000);
  const [inv] = L.whisperInvite(g, 'p1', ['p2'], 1000);
  L.whisperRespond(g, 'p2', inv.id, true, 2000);
  L.whisperSend(g, 'p1', '秘密', 3000);
  L.whisperLeave(g, 'p2', 5000);
  const v = L.buildView(g, 'watcher');
  assert.equal(v.whisperLog.length, 1);
  assert.deepEqual(v.whisperLog[0].memberLog.map(m => [m.playerId, m.joinAt, m.leaveAt]), [['p1', 2000, 5000], ['p2', 2000, 5000]]);
  assert.equal(JSON.stringify(v).includes('秘密'), false);
});

test('autoSetup：一鍵選角色＋分配＋酒鬼＋偽裝，各人數都直接合法', () => {
  for (let n = 5; n <= 15; n++) {
    for (let k = 0; k < 30; k++) {
      const g = setupGame(n);
      L.autoSetup(g, L.seededRng(n * 100 + k));
      assert.deepEqual(L.checkSetup(g), [], `${n} 人局 seed ${k}`);
      assert.equal(g.bluffs.length, 3);
    }
  }
});
