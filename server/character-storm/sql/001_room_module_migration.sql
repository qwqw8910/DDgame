-- ================================================================
--  房間模組遷移腳本
--  版本：v1.0
--  說明：
--    1. 新增 rooms.app_id 欄位（區分不同遊戲）
--    2. 新增 character_storm_sessions 表（角色持久化，重啟伺服器後重連可還原角色）
--
--  執行方式：
--    在 Supabase SQL Editor 執行此腳本（可重複執行，使用 IF NOT EXISTS）
-- ================================================================

-- ── 1. rooms 表：新增 app_id 欄位 ──────────────────────────────
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS app_id TEXT NOT NULL DEFAULT 'know-me';

-- 將既有 rooms 標記為 know-me（若為另一遊戲可手動更新）
-- UPDATE rooms SET app_id = 'character-storm' WHERE id LIKE 'CS%';

-- ── 2. character_storm_sessions 表 ─────────────────────────────
--  用途：儲存每位玩家在特定房間的角色分配結果
--        伺服器重啟後，玩家重連時可從此表還原角色
--        每局開始時寫入，房間封存後自動清除（由封存流程決定）

CREATE TABLE IF NOT EXISTS character_storm_sessions (
  room_id    TEXT        NOT NULL,
  player_id  TEXT        NOT NULL,
  role       TEXT        NOT NULL,   -- 'guesser' | 'clue-2' | 'clue-4' | 'clue-6'
  quota      INT         NULL,       -- 2 / 4 / 6 / null（猜題者無 quota）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (room_id, player_id),

  -- 外鍵（optional，允許 rooms 已封存後 session 保留到 cleanup job 清除）
  CONSTRAINT fk_cs_sessions_room
    FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
);

-- 索引（依玩家查詢，用於重連還原角色）
CREATE INDEX IF NOT EXISTS idx_cs_sessions_player
  ON character_storm_sessions (player_id);

-- ── 3. RLS（依需求開啟）────────────────────────────────────────
-- 後端使用 service_role key，不受 RLS 限制。
-- 若需前端直接查詢（例如顯示歷史紀錄），可開啟以下 RLS：

-- ALTER TABLE character_storm_sessions ENABLE ROW LEVEL SECURITY;

-- 允許 service_role 全存取（預設）
-- CREATE POLICY "service_role_all" ON character_storm_sessions
--   FOR ALL USING (true) WITH CHECK (true);

-- ── 4. 既有資料補全（若 rooms 已有資料）────────────────────────
-- 若 rooms 有既有資料且需要區分 character-storm 房間：
-- UPDATE rooms SET app_id = 'character-storm'
--   WHERE id IN (
--     SELECT DISTINCT room_id FROM character_storm_sessions
--   );
