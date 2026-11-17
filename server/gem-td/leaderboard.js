'use strict';

// ================================================================
//  甜點守衛戰 — 排行榜（Supabase 表 gem_td_scores，見 sql/001_leaderboard.sql）
//  寫入：遊戲正常結束時，每位玩家一筆
//  讀取：GET /api/gem-td/leaderboard?waves=30&difficulty=easy
//  三個榜：reach（到達波數）、time（通關時間）、damage（最終傷害）
// ================================================================

const express = require('express');
const C = require('./config');

const TABLE = 'gem_td_scores';
const LIMIT = 10;
const FETCH_CAP = 500; // 同一組最多撈這麼多筆再排序，避免全表掃描

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

const SORTS = {
  // 打得越遠越前面；同波先比通關，再比通關時間（短的贏），最後比最終傷害
  reach: (a, b) => b.reached_wave - a.reached_wave
    || Number(b.cleared) - Number(a.cleared)
    || (a.clear_seconds ?? Infinity) - (b.clear_seconds ?? Infinity)
    || (b.final_damage ?? -1) - (a.final_damage ?? -1),
  time: (a, b) => a.clear_seconds - b.clear_seconds || (b.final_damage ?? -1) - (a.final_damage ?? -1),
  damage: (a, b) => (b.final_damage ?? -1) - (a.final_damage ?? -1) || (a.clear_seconds ?? Infinity) - (b.clear_seconds ?? Infinity),
};
const FILTERS = {
  reach: () => true,
  time: r => r.cleared && r.clear_seconds !== null,
  damage: r => r.final_damage !== null,
};

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
  finalKilled: r.final_killed,
  at: r.created_at,
});

function rank(rows, board) {
  return rows.filter(FILTERS[board]).sort(SORTS[board]).slice(0, LIMIT).map(pub);
}

async function fetchBoards(db, waves, difficulty) {
  const { data, error } = await db.from(TABLE).select('*')
    .eq('waves', waves).eq('difficulty', difficulty)
    .order('created_at', { ascending: false }).limit(FETCH_CAP);
  if (error) throw error;
  const rows = data ?? [];
  return { reach: rank(rows, 'reach'), time: rank(rows, 'time'), damage: rank(rows, 'damage') };
}

function createRouter(db) {
  const router = express.Router();
  router.get('/leaderboard', async (req, res) => {
    const waves = Number(req.query.waves ?? C.DEFAULT_OPTIONS.waves);
    const difficulty = String(req.query.difficulty ?? C.DEFAULT_OPTIONS.difficulty);
    if (!C.WAVE_CHOICES.includes(waves) || !C.DIFFICULTY_IDS.includes(difficulty)) {
      return res.status(400).json({ error: '參數錯誤' });
    }
    try {
      res.json({ waves, difficulty, boards: await fetchBoards(db, waves, difficulty) });
    } catch (err) {
      console.error('[GemTD leaderboard] fetch', err.message);
      res.status(500).json({ error: '排行榜暫時無法讀取', boards: { reach: [], time: [], damage: [] } });
    }
  });
  return router;
}

module.exports = { saveRecords, createRouter, rank };
