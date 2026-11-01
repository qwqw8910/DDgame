-- ================================================================
--  分帳 — 帳本名稱（例如「日本旅行」）
--  在 Supabase SQL Editor 執行；需先執行 001_split_bill.sql。
--  沒執行也不影響其他功能，只是帳本名稱無法儲存。
-- ================================================================

CREATE TABLE IF NOT EXISTS bill_room_names (
  room_id    TEXT        PRIMARY KEY REFERENCES rooms (id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
Margin 