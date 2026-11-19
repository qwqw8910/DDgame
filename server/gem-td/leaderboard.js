'use strict';

// ================================================================
//  甜點守衛戰 — 排行榜（Supabase 表 gem_td_scores，見 sql/001_leaderboard.sql）
//  寫入：遊戲正常結束時，每位玩家一筆
//  讀取：GET /api/gem-td/leaderboard，15／30／50／無盡合成一個榜，前 50 名
// ================================================================

const express = require('express');
const C = require('./config');

const TABLE = 'gem_td_scores';
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
});

// 寫入失敗只記 log，不影響遊戲結算
async function saveRecords(db, roomId, records, names) {
  if (!db || !records?.length) return;
  try {
    const { error } = await db.from(TABLE).insert(records.map(r => toRow(roomId, names, r)));
    if (error) console.error('[GemTD leaderboard] insert', error.message);
  } catch (err) {
    console.error('[GemTD leaderboard] insert', err.message);
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
  livesMode: r.lives_mode,
  playerCount: r.player_count,
  reachedWave: r.reached_wave,
  cleared: r.cleared,
  clearSeconds: r.clear_seconds,
  finalDamage: r.final_damage === null ? null : Number(r.final_damage),
  damageRatio: r.damage_ratio === null || r.damage_ratio === undefined ? null : Number(r.damage_ratio),
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

function createRouter(db) {
  const router = express.Router();
  router.get('/leaderboard', async (req, res) => {
    try {
      res.json({ rows: await fetchBoard(db) });
    } catch (err) {
      console.error('[GemTD leaderboard] fetch', err.message);
      res.status(500).json({ error: '排行榜暫時無法讀取', rows: [] });
    }
  });
  return router;
}

module.exports = { saveRecords, createRouter, rank, score };
