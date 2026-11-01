-- ================================================================
--  分帳系統（split-bill）資料表
--  版本：v1.0
--  說明：
--    - 沿用既有 rooms / players 表（rooms.app_id = 'split-bill'）
--    - 帳務資料全部落地 DB，房間不封存；刪除 rooms 會連帶清除所有帳務（ON DELETE CASCADE）
--    - 金額一律為最小貨幣單位的整數（BIGINT）
--    - 成員以「房間內名稱」為唯一 Key：UNIQUE (room_id, name_key)
--
--  執行方式：在 Supabase SQL Editor 執行（可重複執行）
--  前置條件：已執行 character-storm/sql/001_room_module_migration.sql（rooms.app_id）
-- ================================================================

-- ── 1. 成員（帳務層，獨立於 players）──────────────────────────────
CREATE TABLE IF NOT EXISTS bill_members (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     TEXT        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,                 -- 顯示名稱（首次建立時的寫法）
  name_key    TEXT        NOT NULL,                 -- 比對用：NFKC + trim + lower
  is_virtual  BOOLEAN     NOT NULL DEFAULT FALSE,   -- 由他人代建、尚無人以此名稱登入
  left_at     TIMESTAMPTZ NULL,                     -- 離開／被踢；以同名重新加入會清空
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, name_key)
);

-- ── 2. 支出 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_expenses (
  id          UUID        PRIMARY KEY,              -- 由後端產生
  room_id     TEXT        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  amount      BIGINT      NOT NULL CHECK (amount > 0),
  currency    TEXT        NOT NULL DEFAULT 'TWD',
  category    TEXT        NOT NULL DEFAULT 'other',
  note        TEXT        NOT NULL DEFAULT '',
  split_type  TEXT        NOT NULL DEFAULT 'equal', -- equal | exact | percent | shares | adjust
  paid_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID        NOT NULL REFERENCES bill_members (id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ NULL                      -- 軟刪除
);
CREATE INDEX IF NOT EXISTS idx_bill_expenses_room ON bill_expenses (room_id, paid_at);

-- 付款人（支援多人共同付款）
CREATE TABLE IF NOT EXISTS bill_expense_payers (
  expense_id  UUID   NOT NULL REFERENCES bill_expenses (id) ON DELETE CASCADE,
  member_id   UUID   NOT NULL REFERENCES bill_members (id),
  paid_amount BIGINT NOT NULL CHECK (paid_amount > 0),
  PRIMARY KEY (expense_id, member_id)
);

-- 每人應分攤金額（後端計算，不信任前端）
CREATE TABLE IF NOT EXISTS bill_expense_splits (
  expense_id  UUID    NOT NULL REFERENCES bill_expenses (id) ON DELETE CASCADE,
  member_id   UUID    NOT NULL REFERENCES bill_members (id),
  owed_amount BIGINT  NOT NULL CHECK (owed_amount >= 0),
  share       NUMERIC NULL,                         -- 百分比／份數的原始輸入
  PRIMARY KEY (expense_id, member_id)
);

-- ── 3. 結算（還款）────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_settlements (
  id           UUID        PRIMARY KEY,
  room_id      TEXT        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  from_member  UUID        NOT NULL REFERENCES bill_members (id),
  to_member    UUID        NOT NULL REFERENCES bill_members (id),
  amount       BIGINT      NOT NULL CHECK (amount > 0),
  currency     TEXT        NOT NULL DEFAULT 'TWD',
  note         TEXT        NOT NULL DEFAULT '',
  settled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID        NOT NULL REFERENCES bill_members (id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ NULL,
  CHECK (from_member <> to_member)
);
CREATE INDEX IF NOT EXISTS idx_bill_settlements_room ON bill_settlements (room_id, settled_at);

-- ── 4. 活動紀錄 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bill_activities (
  id          BIGSERIAL   PRIMARY KEY,
  room_id     TEXT        NOT NULL REFERENCES rooms (id) ON DELETE CASCADE,
  actor       UUID        NULL REFERENCES bill_members (id),
  action      TEXT        NOT NULL,                 -- expense.add / expense.update / expense.delete ...
  entity_type TEXT        NOT NULL,
  entity_id   TEXT        NULL,
  before_json JSONB       NULL,
  after_json  JSONB       NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bill_activities_room ON bill_activities (room_id, id DESC);

-- ── 5. 原子寫入支出：支出本體＋付款人＋分攤 在同一個交易內完成 ─────
--  supabase-js 無法跨多次呼叫做 transaction，因此以單一 RPC 包起來。
CREATE OR REPLACE FUNCTION bill_save_expense(
  p_expense JSONB,
  p_payers  JSONB,
  p_splits  JSONB
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_id UUID := (p_expense ->> 'id')::UUID;
BEGIN
  INSERT INTO bill_expenses (
    id, room_id, title, amount, currency, category, note, split_type,
    paid_at, created_by, created_at, updated_at, deleted_at
  ) VALUES (
    v_id,
    p_expense ->> 'room_id',
    p_expense ->> 'title',
    (p_expense ->> 'amount')::BIGINT,
    p_expense ->> 'currency',
    p_expense ->> 'category',
    p_expense ->> 'note',
    p_expense ->> 'split_type',
    (p_expense ->> 'paid_at')::TIMESTAMPTZ,
    (p_expense ->> 'created_by')::UUID,
    (p_expense ->> 'created_at')::TIMESTAMPTZ,
    (p_expense ->> 'updated_at')::TIMESTAMPTZ,
    NULLIF(p_expense ->> 'deleted_at', '')::TIMESTAMPTZ
  )
  ON CONFLICT (id) DO UPDATE SET
    title      = EXCLUDED.title,
    amount     = EXCLUDED.amount,
    currency   = EXCLUDED.currency,
    category   = EXCLUDED.category,
    note       = EXCLUDED.note,
    split_type = EXCLUDED.split_type,
    paid_at    = EXCLUDED.paid_at,
    updated_at = EXCLUDED.updated_at,
    deleted_at = EXCLUDED.deleted_at;

  DELETE FROM bill_expense_payers WHERE expense_id = v_id;
  DELETE FROM bill_expense_splits WHERE expense_id = v_id;

  INSERT INTO bill_expense_payers (expense_id, member_id, paid_amount)
  SELECT v_id, (e ->> 'member_id')::UUID, (e ->> 'paid_amount')::BIGINT
  FROM jsonb_array_elements(p_payers) AS e;

  INSERT INTO bill_expense_splits (expense_id, member_id, owed_amount, share)
  SELECT v_id, (e ->> 'member_id')::UUID, (e ->> 'owed_amount')::BIGINT,
         NULLIF(e ->> 'share', '')::NUMERIC
  FROM jsonb_array_elements(p_splits) AS e;
END;
$$;

-- ── 6. RLS ─────────────────────────────────────────────────────────
-- 後端使用 service_role key，不受 RLS 限制。前端不直接讀寫這些表。
-- 若要保險，可對所有 bill_* 表開啟 RLS 且不建立任何 policy（等於 anon 全拒絕）：
-- ALTER TABLE bill_members          ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bill_expenses         ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bill_expense_payers   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bill_expense_splits   ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bill_settlements      ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bill_activities       ENABLE ROW LEVEL SECURITY;
