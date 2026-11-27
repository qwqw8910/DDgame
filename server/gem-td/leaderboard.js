'use strict';

// ================================================================
//  甜點守衛戰 — 排行榜（Supabase 表 gem_td_scores，見 sql/001_leaderboard.sql）
//  寫入：遊戲正常結束時，每位玩家一筆
//  讀取：GET /api/gem-td/leaderboard，15／30／50／無盡合成一個榜，前 50 名
//        GET /api/gem-td/leaderboard?mode=relay，環形接力 1～6 區合成一個榜，前 50 名
// ================================================================

const express = require('express');

const TABLE = 'gem_td_scores';
const RELAY_TABLE = 'gem_td_relay_scores'; // 環形接力：各區域數合成一個榜（2026-11-25 已在 Supabase 建立，欄位同 TABLE 但沒有 lives_mode、多了 zones）
const LIMIT = 50;
const FETCH_CAP = 2000; // 同一組最多撈這麼多筆再排序，避免全表掃描

const toRow = (roomId, names, rec) => ({
  room_id: roomId,
  player_id: rec.playerId,
  player_name: String(names?.[rec.playerId] ?? '玩家').slice(0, 8),
  waves: rec.waves,
  difficulty: rec.difficulty,
  lives_mode: rec.livesMode,
  player_count: rec.playerCount,
  reached_wave: rec.reachedWave,
  cleared: rec.cleared,
  clear_seconds: rec.clearSeconds,
  final_damage: rec.finalDamage,
  final_killed: rec.finalKilled,
  damage_ratio: rec.damageRatio,
  max_path_len: rec.maxPathLen ?? null,
  base_path_len: rec.basePathLen ?? null,
});

const toRelayRow = (roomId, names, rec) => {
  const { lives_mode, ...row } = toRow(roomId, names, rec);
  return { ...row, zones: rec.zones };
};

// 寫入失敗只記 log，不影響遊戲結算；環形接力寫進自己的表
async function saveRecords(db, roomId, records, names) {
  if (!db || !records?.length) return;
  const jobs = [
    [TABLE, records.filter(r => r.mode !== 'relay').map(r => toRow(roomId, names, r))],
    [RELAY_TABLE, records.filter(r => r.mode === 'relay').map(r => toRelayRow(roomId, names, r))],
  ];
  for (const [table, rows] of jobs) {
    if (!rows.length) continue;
    try {
      let { error } = await db.from(table).insert(rows);
      // 還沒執行 sql/002_path_len.sql 時缺欄位：去掉路徑欄位再寫一次，不讓成績掉
      if (error && /max_path_len|base_path_len/.test(error.message)) {
        ({ error } = await db.from(table).insert(rows.map(({ max_path_len, base_path_len, ...rest }) => rest)));
      }
      if (error) console.error('[GemTD leaderboard] insert', table, error.message);
    } catch (err) {
      console.error('[GemTD leaderboard] insert', table, err.message);
    }
  }
}

// 綜合分數 = (到達波數 × 100 + 最高傷害測試的傷害比率 × 100) × 難度倍率
// 15、30、50 波與無盡合成同一個榜，簡單與困難也一起比分數：挑戰越長、越難，分數越高
const WAVE_POINTS = 100;
const DAMAGE_POINTS = 100;
const DIFFICULTY_MULT = { easy: 1, normal: 1.5, hard: 2 };

// 舊紀錄沒有傷害比率，傷害分算 0
const score = r => Math.round(
  (r.reached_wave * WAVE_POINTS + (Number(r.damage_ratio) || 0) * DAMAGE_POINTS) * (DIFFICULTY_MULT[r.difficulty] ?? 1) * 10,
) / 10;

// 同分：傷害比率高的在前，再比通關時間（短的贏），最後比先來後到
const compare = (a, b) => score(b) - score(a)
  || (Number(b.damage_ratio) || 0) - (Number(a.damage_ratio) || 0)
  || (a.clear_seconds ?? Infinity) - (b.clear_seconds ?? Infinity)
  || String(a.created_at).localeCompare(String(b.created_at));

const pub = r => ({
  name: r.player_name,
  waves: r.waves,
  difficulty: r.difficulty,
  livesMode: r.lives_mode ?? 'team',
  zones: r.zones ?? null,
  playerCount: r.player_count,
  reachedWave: r.reached_wave,
  cleared: r.cleared,
  clearSeconds: r.clear_seconds,
  finalDamage: r.final_damage === null ? null : Number(r.final_damage),
  damageRatio: r.damage_ratio === null || r.damage_ratio === undefined ? null : Number(r.damage_ratio),
  pathRatio: r.max_path_len && r.base_path_len ? Math.round((r.max_path_len / r.base_path_len) * 100) / 100 : null,
  maxPathLen: r.max_path_len ?? null,
  score: score(r),
  at: r.created_at,
});

function rank(rows) {
  return [...rows].sort(compare).slice(0, LIMIT).map(pub);
}

// 15 / 30 / 50 / 無盡合成同一個榜；每筆的 waves 欄位標示是哪個模式
async function fetchBoard(db) {
  const { data, error } = await db.from(TABLE).select('*')
    .order('reached_wave', { ascending: false }).limit(FETCH_CAP);
  if (error) throw error;
  return rank(data ?? []);
}

// 環形接力：1～6 區合成一個榜（怪物血量本來就依區域數與人數換算），每筆的 zones 欄位標示幾區
async function fetchRelayBoard(db) {
  const { data, error } = await db.from(RELAY_TABLE).select('*')
    .order('reached_wave', { ascending: false }).limit(FETCH_CAP);
  if (error) throw error;
  return rank(data ?? []);
}

// 啟動時確認兩張表都在：表不存在時寫入會默默失敗（只記一行 log），玩家會以為沒上榜
async function checkTables(db) {
  for (const table of [TABLE, RELAY_TABLE]) {
    try {
      const { error } = await db.from(table).select('id').limit(1);
      if (error) console.error(`[GemTD leaderboard] 讀不到表 ${table}，成績不會寫入：${error.message}（請到 Supabase 確認表是否存在）`);
    } catch (err) {
      console.error(`[GemTD leaderboard] 檢查表 ${table} 失敗：${err.message}`);
    }
  }
}

function createRouter(db) {
  if (db) checkTables(db);
  const router = express.Router();
  router.get('/leaderboard', async (req, res) => {
    try {
      if (req.query.mode === 'relay') return res.json({ rows: await fetchRelayBoard(db) });
      res.json({ rows: await fetchBoard(db) });
    } catch (err) {
      console.error('[GemTD leaderboard] fetch', err.message);
      res.status(500).json({ error: '排行榜暫時無法讀取', rows: [] });
    }
  });
  return router;
}

module.exports = { saveRecords, createRouter, rank, score, toRelayRow };
