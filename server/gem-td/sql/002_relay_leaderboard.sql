-- ================================================================
--  甜點守衛戰（gem-td）環形接力排行榜
--  版本：v1.0
--  說明：
--    - 環形接力的成績是整隊的（一隻巨獸繞完整圈，各區傷害加總），依「區域數」各開一個榜，
--      不與單人榜（gem_td_scores）混合，所以另開一張表，單人榜的表完全不動
--    - 遊戲正常結束時，每位在場的真人寫入一筆（內容相同：隊伍的到達波數與隊伍傷害）
--    - 寫入失敗只記 log，不影響結算
--
--  執行方式：在 Supabase SQL Editor 手動執行（可重複執行）
--  前置條件：無
-- ================================================================

CREATE TABLE IF NOT EXISTS gem_td_relay_scores (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  room_id        TEXT        NOT NULL,
  player_id      TEXT        NOT NULL,
  player_name    TEXT        NOT NULL,
  zones          SMALLINT    NOT NULL CHECK (zones BETWEEN 1 AND 6),  -- 區域數：每個區域數各一個榜
  waves          INTEGER     NOT NULL,                                -- 波數設定（0 = 無盡）
  difficulty     TEXT        NOT NULL,
  player_count   SMALLINT    NOT NULL,                                -- 真人數（其餘區域是假人）
  reached_wave   INTEGER     NOT NULL,
  cleared        BOOLEAN     NOT NULL DEFAULT FALSE,
  clear_seconds  INTEGER     NULL,
  final_damage   NUMERIC     NULL,                                    -- 隊伍在最高那場傷害測試的總傷害
  final_killed   BOOLEAN     NULL,
  damage_ratio   NUMERIC     NULL                                     -- 隊伍總傷害 ÷ 巨獸血量（上限 1）
);

-- 讀榜：依區域數篩選，再依到達波數排序
CREATE INDEX IF NOT EXISTS idx_gem_td_relay_scores_zones
  ON gem_td_relay_scores (zones, reached_wave DESC);
