-- ================================================================
--  分帳 — 結算幣別與群組匯率
--  在 Supabase SQL Editor 執行（可重複執行）；需先執行 001_split_bill.sql。
--
--  - bill_room_settings：每個帳本的結算幣別（預設 TWD）
--  - bill_rates：每個外幣一列，整個帳本共用一個匯率
--      rate = 1 單位外幣 = rate 單位結算幣別（主單位，例如 1 JPY = 0.21 TWD）
--      source = 'auto'（系統抓取）| 'manual'（使用者修改）
--  費用本身只存原幣金額，換算結果由匯率即時計算。
-- ================================================================

CREATE TABLE IF NOT EXISTS bill_room_settings (
  room_id       TEXT        PRIMARY KEY REFERENCES rooms (id) ON DELETE CASCADE,
  base_currency TEXT        NOT NULL DEFAULT 'TWD',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bill_rates (
  room_id    TEXT        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  currency   TEXT        NOT NULL,
  rate       NUMERIC     NOT NULL CHECK (rate > 0),
  source     TEXT        NOT NULL DEFAULT 'auto',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, currency)
);

NOTIFY pgrst, 'reload schema';
