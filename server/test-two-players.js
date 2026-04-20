// ================================================================
//  懂我再說 — 兩人流程模擬測試（3 輪）
//
//  使用方式：
//    1. 確認 server/.env 已設定 SUPABASE_URL / SUPABASE_SERVICE_KEY
//    2. 啟動後端：node server.js
//    3. 另開終端執行：node test-two-players.js
//
//  流程：加入 → 準備 → 開始 → 跑 N_ROUNDS 輪
//        每輪：選主題 → 選答 → 猜測 → 揭曉 → (房主) 下一回合
// ================================================================

const N_ROUNDS = 3; // ← 想跑幾輪改這裡
// 每輪交替答案與猜測，讓測試涵蓋猜對與猜錯兩種情境
const ANSWERS = ['A', 'B', 'A'];  // 被猜者各輪選的答案
const GUESSES = ['A', 'A', 'B'];  // 猜測者各輪的猜測（第1輪猜對、第2輪猜錯、第3輪猜對）

'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { io: ioClient } = require('socket.io-client');

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3000';

// ── Supabase（用 service_role 直接操作 DB，模擬前端對 DB 的寫入）─
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── 工具函式 ─────────────────────────────────────────────────────

function genRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function genPlayerId() {
  // crypto.randomUUID() 是 Node 19+，往下相容用 fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

const COLORS = { ALICE: '\x1b[36m', BOB: '\x1b[33m', SERVER: '\x1b[32m', ERROR: '\x1b[31m', RESET: '\x1b[0m' };

function log(tag, msg, data) {
  const color = COLORS[tag] ?? COLORS.SERVER;
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`${color}[${ts}][${tag}]${COLORS.RESET} ${msg}`);
  if (data !== undefined) {
    console.log('       ', JSON.stringify(data));
  }
}

/**
 * 等待 socket 上的指定事件，超時則 reject。
 * onError 選項：若 server 在等待期間送來 'error' 事件，也視為失敗。
 */
function waitFor(socket, event, timeout = 6000) {
  return new Promise((resolve, reject) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`⏰ 等待 "${event}" 超時（${timeout}ms）`));
      }
    }, timeout);

    const handler = (data) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.off('error', errHandler);
        resolve(data);
      }
    };

    const errHandler = (errData) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        socket.off(event, handler);
        reject(new Error(`Server error: ${errData?.message ?? JSON.stringify(errData)}`));
      }
    };

    socket.once(event, handler);
    socket.once('error', errHandler);
  });
}

// ── 清除測試資料 ──────────────────────────────────────────────────
async function cleanup(alice, bob, roomId) {
  alice?.disconnect();
  bob?.disconnect();
  try {
    // 刪除 guesses → rounds → players → rooms（有 FK cascade，順序保險起見）
    const rounds = await db.from('rounds').select('id').eq('room_id', roomId);
    if (rounds.data?.length) {
      const ids = rounds.data.map(r => r.id);
      await db.from('guesses').delete().in('round_id', ids);
      await db.from('rounds').delete().in('id', ids);
    }
    await db.from('players').delete().eq('room_id', roomId);
    await db.from('rooms').delete().eq('id', roomId);
    log('SERVER', `🧹 測試資料已清除（roomId=${roomId}）`);
  } catch (e) {
    log('ERROR', '清除資料失敗：' + e.message);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────
async function main() {
  const roomId  = genRoomId();
  const aliceId = genPlayerId();
  const bobId   = genPlayerId();

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║      懂我再說 — 兩人流程模擬測試              ║');
  console.log('╚══════════════════════════════════════════════╝');
  log('SERVER', `伺服器: ${SERVER_URL}`);
  log('SERVER', `房間 ID: ${roomId}`);
  log('ALICE',  `Alice ID: ${aliceId}`);
  log('BOB',    `Bob   ID: ${bobId}`);

  // ────────────────────────────────────────────────────────────────
  // STEP 1：在 Supabase 建立房間（模擬 index.html 的 handleCreateRoom）
  // ────────────────────────────────────────────────────────────────
  log('SERVER', '\n[1/7] 建立房間（寫入 Supabase）...');
  const { data: room, error: roomErr } = await db.from('rooms').insert({
    id:             roomId,
    host_player_id: aliceId,
    max_players:    6,
    status:         'waiting',
  }).select().single();
  if (roomErr) throw new Error('建立房間失敗：' + roomErr.message);
  log('SERVER', `✅ 房間建立成功，host=${aliceId}`);

  // ────────────────────────────────────────────────────────────────
  // STEP 2：兩個玩家建立 Socket.io 連線
  // ────────────────────────────────────────────────────────────────
  log('SERVER', '\n[2/7] 建立 Socket.io 連線...');
  const opts = { transports: ['websocket'], reconnection: false };
  const alice = ioClient(SERVER_URL, opts);
  const bob   = ioClient(SERVER_URL, opts);

  await Promise.all([
    new Promise((res, rej) => { alice.once('connect', res); alice.once('connect_error', e => rej(new Error('Alice 連線失敗：' + e.message))); }),
    new Promise((res, rej) => { bob.once('connect',   res); bob.once('connect_error',   e => rej(new Error('Bob 連線失敗：'   + e.message))); }),
  ]);
  log('SERVER', `✅ Alice socket.id=${alice.id}`);
  log('SERVER', `✅ Bob   socket.id=${bob.id}`);

  // ────────────────────────────────────────────────────────────────
  // STEP 3：Alice（房主）加入房間
  // ────────────────────────────────────────────────────────────────
  log('ALICE', '\n[3/7] Alice 加入房間...');
  const aliceStateP = waitFor(alice, 'room_state');
  alice.emit('join_room', { roomId, playerId: aliceId, nickname: 'Alice' });
  const aliceState = await aliceStateP;
  log('ALICE', `✅ room_state 收到`, {
    players: aliceState.players.map(p => p.nickname),
    topics:  (aliceState.topics ?? []).map(t => t.name),
    roomStatus: aliceState.room.status,
  });

  const topics = aliceState.topics ?? [];
  if (topics.length === 0) {
    throw new Error('❌ topics 資料表無任何主題，請先 INSERT 主題資料！');
  }

  // ────────────────────────────────────────────────────────────────
  // STEP 4：Bob 加入 + Alice 收到 players_updated
  // ────────────────────────────────────────────────────────────────
  log('BOB', '\n[4/7] Bob 加入房間...');
  const bobStateP          = waitFor(bob,   'room_state');
  const alicePlayersUpdP   = waitFor(alice, 'players_updated');
  bob.emit('join_room', { roomId, playerId: bobId, nickname: 'Bob' });
  const [bobState] = await Promise.all([bobStateP, alicePlayersUpdP]);
  log('BOB', `✅ room_state 收到`, {
    players: bobState.players.map(p => p.nickname),
  });

  // ────────────────────────────────────────────────────────────────
  // STEP 5：Bob 準備好
  // ────────────────────────────────────────────────────────────────
  log('BOB', '\n[5/7] Bob 切換準備狀態...');
  const readyP = waitFor(alice, 'players_updated');
  bob.emit('toggle_ready');
  const readyState = await readyP;
  const bobPlayer = readyState.players.find(p => p.id === bobId);
  log('BOB', `✅ Bob is_ready=${bobPlayer?.is_ready}`);

  // ────────────────────────────────────────────────────────────────
  // STEP 6：Alice（房主）開始遊戲
  // ────────────────────────────────────────────────────────────────
  log('ALICE', '\n[6/7] Alice 開始遊戲...');
  const gameStartedAliceP = waitFor(alice, 'game_started');
  const gameStartedBobP   = waitFor(bob,   'game_started');
  alice.emit('start_game');
  const [gameEvt] = await Promise.all([gameStartedAliceP, gameStartedBobP]);
  const round = gameEvt.currentRound;
  log('SERVER', `✅ game_started！第 ${round.round_number} 回合`, {
    status:    round.status,
    subjectId: round.subject_player_id,
  });

  // ────────────────────────────────────────────────────────────────
  // STEP 7：跑 N_ROUNDS 回合
  // ────────────────────────────────────────────────────────────────
  let currentRound = round;
  const roundResults = []; // 收集每輪結果，最後統整顯示

  for (let i = 0; i < N_ROUNDS; i++) {
    const roundNo      = i + 1;
    const isAliceSubject = currentRound.subject_player_id === aliceId;
    const subjectSocket  = isAliceSubject ? alice : bob;
    const guesserSocket  = isAliceSubject ? bob   : alice;
    const subjectTag     = isAliceSubject ? 'ALICE' : 'BOB';
    const guesserTag     = isAliceSubject ? 'BOB'   : 'ALICE';
    const answer         = ANSWERS[i] ?? 'A';
    const guess          = GUESSES[i] ?? 'B';

    console.log(`\n${'─'.repeat(50)}`);
    log('SERVER', `第 ${roundNo}/${N_ROUNDS} 輪開始，被猜者=${subjectTag}，猜測者=${guesserTag}`);

    // ── 7a 選主題 ──────────────────────────────────────────────────
    // 每輪輪流換主題，避免題庫用盡
    const topic = topics[i % topics.length];
    log(subjectTag, `[R${roundNo}-a] 選主題：「${topic.name}」...`);
    const rnd1AliceP = waitFor(alice, 'round_updated');
    const rnd1BobP   = waitFor(bob,   'round_updated');
    subjectSocket.emit('select_topic', { topicId: topic.id });
    const [rndUpd1] = await Promise.all([rnd1AliceP, rnd1BobP]);
    log(subjectTag, `✅ 題目取得`, {
      question: rndUpd1.currentQuestion
        ? `A: ${rndUpd1.currentQuestion.a}  /  B: ${rndUpd1.currentQuestion.b}`
        : '(null)',
    });

    // ── 7b 被猜者選答案 ────────────────────────────────────────────
    log(subjectTag, `[R${roundNo}-b] 私下選答案 "${answer}"...`);
    const answerAcceptedP   = waitFor(subjectSocket, 'answer_accepted');
    const rnd2GuesserP      = waitFor(guesserSocket, 'round_updated');
    subjectSocket.emit('submit_answer', { answer });
    const [answerEvt] = await Promise.all([answerAcceptedP, rnd2GuesserP]);
    log(subjectTag, `✅ answer_accepted: ${answerEvt.answer}`);

    // ── 7c 猜測 → 自動揭曉 ────────────────────────────────────────
    log(guesserTag, `[R${roundNo}-c] 提交猜測 "${guess}"...`);
    const revAliceP = waitFor(alice, 'round_revealed', 10000);
    const revBobP   = waitFor(bob,   'round_revealed', 10000);
    guesserSocket.emit('submit_guess', { guess });
    const [revealEvt] = await Promise.all([revAliceP, revBobP]);

    const correctAnswer = revealEvt.currentRound.subject_answer;
    const guesserGuess  = revealEvt.guesses.find(
      g => g.player_id === (isAliceSubject ? bobId : aliceId)
    );
    const isCorrect = guesserGuess?.is_correct ?? false;

    log('SERVER', `✅ 揭曉結果`, {
      correctAnswer,
      guess,
      result:  isCorrect ? '🎉 猜對了！' : `😅 猜錯了（正解: ${correctAnswer}）`,
      scores:  revealEvt.players.map(p => `${p.nickname}:${p.score}分`).join('  '),
    });
    roundResults.push({ roundNo, subjectTag, guesserTag, answer: correctAnswer, guess, isCorrect });

    // ── 7d 下一回合（最後一輪跳過）────────────────────────────────
    if (i < N_ROUNDS - 1) {
      log('ALICE', `[R${roundNo}-d] 房主進入下一回合...`);
      const nextAliceP = waitFor(alice, 'round_updated');
      const nextBobP   = waitFor(bob,   'round_updated');
      alice.emit('next_round');
      const [nextEvt] = await Promise.all([nextAliceP, nextBobP]);
      currentRound = nextEvt.currentRound;
      log('SERVER', `✅ 第 ${currentRound.round_number} 回合已建立，status=${currentRound.status}`);
    }
  }

  // ── 最終統計 ───────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(50)}`);
  console.log('  最終統計');
  console.log('─'.repeat(50));
  for (const r of roundResults) {
    const icon = r.isCorrect ? '✅' : '❌';
    console.log(`  第 ${r.roundNo} 輪 | 被猜: ${r.subjectTag.padEnd(5)} | 正解: ${r.answer} | ${r.guesserTag} 猜 ${r.guess} ${icon}`);
  }
  const correctCount = roundResults.filter(r => r.isCorrect).length;
  console.log('─'.repeat(50));
  console.log(`  猜對 ${correctCount}/${N_ROUNDS} 輪`);
  console.log(`${'═'.repeat(50)}\n`);

  console.log('╔══════════════════════════════════════════════╗');
  console.log(`║   ✅  ${N_ROUNDS} 輪流程模擬測試全部通過！         ║`);
  console.log('╚══════════════════════════════════════════════╝\n');
  await cleanup(alice, bob, roomId);
}

main().catch(async err => {
  console.error('\n\x1b[31m[FAIL]\x1b[0m', err.message);
  process.exit(1);
});
