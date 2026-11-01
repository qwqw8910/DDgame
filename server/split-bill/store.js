'use strict';

// ================================================================
//  分帳系統 — 資料存取層
//
//  內部模型一律 camelCase；DB 欄位 snake_case，轉換都在這裡完成。
//  介面（Supabase 與 Memory 兩種實作相同）：
//    loadAll(roomId)                     → { roomName, baseCurrency, rates, members, expenses, activities }
//    setBaseCurrency(roomId, currency)   同時清空該帳本所有匯率
//    saveRate(roomId, {currency, rate, source, updatedAt})
//    ensureMember(roomId, {name, nameKey, isVirtual}) → { member, created }
//    setMemberLeft(memberId, leftAt)     leftAt: ISO 字串 | null
//    saveExpense(expense)                新增或整筆覆寫（原子）
//    insertActivity(activity)            → 含 id 的完整紀錄
//    purgeRoom(roomId)                   Supabase 靠 ON DELETE CASCADE，不需動作
// ================================================================

const crypto = require('node:crypto');

const ACTIVITY_LIMIT = 200;
const DEFAULT_CURRENCY = 'TWD';

function must({ data, error }) {
  if (error) throw error;
  return data;
}

// ── 列 ↔ 物件 轉換 ──────────────────────────────────────────────

const toMember = r => ({
  id: r.id, roomId: r.room_id, name: r.name, nameKey: r.name_key,
  isVirtual: r.is_virtual, leftAt: r.left_at, createdAt: r.created_at,
});

const toExpense = r => ({
  id: r.id, roomId: r.room_id, title: r.title, amount: Number(r.amount),
  currency: r.currency, category: r.category, note: r.note, splitType: r.split_type,
  paidAt: r.paid_at, createdBy: r.created_by, createdAt: r.created_at,
  updatedAt: r.updated_at, deletedAt: r.deleted_at,
  payers: (r.bill_expense_payers ?? []).map(p => ({ memberId: p.member_id, amount: Number(p.paid_amount) })),
  splits: (r.bill_expense_splits ?? []).map(s => ({
    memberId: s.member_id, amount: Number(s.owed_amount), share: s.share == null ? null : Number(s.share),
  })),
});

const toRates = rows => Object.fromEntries(rows.map(r => [
  r.currency, { rate: Number(r.rate), source: r.source, updatedAt: r.updated_at },
]));

const toActivity = r => ({
  id: r.id, roomId: r.room_id, actor: r.actor, action: r.action,
  entityType: r.entity_type, entityId: r.entity_id,
  before: r.before_json, after: r.after_json, createdAt: r.created_at,
});

// ================================================================
//  Supabase 實作
// ================================================================

function createSupabaseStore(db) {
  async function findMember(roomId, key) {
    return must(await db.from('bill_members').select('*')
      .eq('room_id', roomId).eq('name_key', key).maybeSingle());
  }

  return {
    async loadAll(roomId) {
      const [m, e, a, n, cfg, r] = await Promise.all([
        db.from('bill_members').select('*').eq('room_id', roomId).order('created_at'),
        db.from('bill_expenses')
          .select('*, bill_expense_payers(member_id, paid_amount), bill_expense_splits(member_id, owed_amount, share)')
          .eq('room_id', roomId).order('paid_at'),
        db.from('bill_activities').select('*').eq('room_id', roomId)
          .order('id', { ascending: false }).limit(ACTIVITY_LIMIT),
        db.from('bill_room_names').select('name').eq('room_id', roomId).maybeSingle(),
        db.from('bill_room_settings').select('base_currency').eq('room_id', roomId).maybeSingle(),
        db.from('bill_rates').select('*').eq('room_id', roomId),
      ]);
      return {
        // 帳本名稱表（002）、幣別表（003）尚未建立時不影響其他功能
        roomName:     n.error ? '' : (n.data?.name ?? ''),
        baseCurrency: cfg.error ? DEFAULT_CURRENCY : (cfg.data?.base_currency ?? DEFAULT_CURRENCY),
        rates:        r.error ? {} : toRates(r.data ?? []),
        members:      (must(m) ?? []).map(toMember),
        expenses:     (must(e) ?? []).map(toExpense),
        activities:   (must(a) ?? []).map(toActivity).reverse(),   // 舊 → 新
      };
    },

    async setBaseCurrency(roomId, currency) {
      must(await db.from('bill_room_settings')
        .upsert({ room_id: roomId, base_currency: currency, updated_at: new Date().toISOString() }, { onConflict: 'room_id' }));
      must(await db.from('bill_rates').delete().eq('room_id', roomId));   // 換結算幣別後舊匯率全部失效
    },

    async saveRate(roomId, { currency, rate, source, updatedAt }) {
      must(await db.from('bill_rates').upsert(
        { room_id: roomId, currency, rate, source, updated_at: updatedAt },
        { onConflict: 'room_id,currency' },
      ));
    },

    async setRoomName(roomId, name) {
      must(await db.from('bill_room_names')
        .upsert({ room_id: roomId, name, updated_at: new Date().toISOString() }, { onConflict: 'room_id' }));
    },

    async ensureMember(roomId, { name, nameKey, isVirtual }) {
      let row = await findMember(roomId, nameKey);
      if (row) {
        const patch = {};
        if (row.left_at) patch.left_at = null;
        if (row.is_virtual && !isVirtual) patch.is_virtual = false;   // 真人登入後不再是虛擬成員
        if (Object.keys(patch).length) {
          row = must(await db.from('bill_members').update(patch).eq('id', row.id).select().single());
        }
        return { member: toMember(row), created: false };
      }

      const ins = await db.from('bill_members')
        .insert({ room_id: roomId, name, name_key: nameKey, is_virtual: !!isVirtual })
        .select().single();
      if (ins.error) {
        // 兩台裝置同時以同名首次加入 → 後到者撞 UNIQUE，改讀既有那筆
        if (ins.error.code === '23505') {
          const again = await findMember(roomId, nameKey);
          if (again) return { member: toMember(again), created: false };
        }
        throw ins.error;
      }
      return { member: toMember(ins.data), created: true };
    },

    async setMemberLeft(memberId, leftAt) {
      must(await db.from('bill_members').update({ left_at: leftAt }).eq('id', memberId).select().single());
    },

    async saveExpense(e) {
      const { error } = await db.rpc('bill_save_expense', {
        p_expense: {
          id: e.id, room_id: e.roomId, title: e.title, amount: e.amount, currency: e.currency,
          category: e.category, note: e.note, split_type: e.splitType, paid_at: e.paidAt,
          created_by: e.createdBy, created_at: e.createdAt, updated_at: e.updatedAt,
          deleted_at: e.deletedAt ?? '',
        },
        p_payers: e.payers.map(p => ({ member_id: p.memberId, paid_amount: p.amount })),
        p_splits: e.splits.map(s => ({ member_id: s.memberId, owed_amount: s.amount, share: s.share ?? '' })),
      });
      if (error) throw error;
    },

    async insertActivity(a) {
      const row = must(await db.from('bill_activities').insert({
        room_id: a.roomId, actor: a.actor, action: a.action,
        entity_type: a.entityType, entity_id: a.entityId,
        before_json: a.before ?? null, after_json: a.after ?? null,
      }).select().single());
      return toActivity(row);
    },

    async purgeRoom() { /* rooms 刪除時由 ON DELETE CASCADE 清除 */ },
  };
}

// ================================================================
//  Memory 實作（測試用，行為與 Supabase 實作一致）
// ================================================================

function createMemoryStore() {
  const t = { members: [], expenses: [], activities: [] };
  const roomNames = new Map();
  const baseCurrencies = new Map();
  const rateTable = new Map();    // roomId → { [currency]: {rate, source, updatedAt} }
  let actSeq = 0;
  const clone = o => structuredClone(o);

  return {
    _t: t,

    async loadAll(roomId) {
      const mine = r => r.roomId === roomId;
      return {
        roomName:     roomNames.get(roomId) ?? '',
        baseCurrency: baseCurrencies.get(roomId) ?? DEFAULT_CURRENCY,
        rates:        clone(rateTable.get(roomId) ?? {}),
        members:      clone(t.members.filter(mine)),
        expenses:     clone(t.expenses.filter(mine)),
        activities:   clone(t.activities.filter(mine).slice(-ACTIVITY_LIMIT)),
      };
    },

    async setBaseCurrency(roomId, currency) {
      baseCurrencies.set(roomId, currency);
      rateTable.delete(roomId);
    },

    async saveRate(roomId, { currency, rate, source, updatedAt }) {
      const rates = rateTable.get(roomId) ?? {};
      rates[currency] = { rate, source, updatedAt };
      rateTable.set(roomId, rates);
    },

    async ensureMember(roomId, { name, nameKey, isVirtual }) {
      const found = t.members.find(m => m.roomId === roomId && m.nameKey === nameKey);
      if (found) {
        found.leftAt = null;
        if (!isVirtual) found.isVirtual = false;
        return { member: clone(found), created: false };
      }
      const m = {
        id: crypto.randomUUID(), roomId, name, nameKey, isVirtual: !!isVirtual,
        leftAt: null, createdAt: new Date().toISOString(),
      };
      t.members.push(m);
      return { member: clone(m), created: true };
    },

    async setMemberLeft(memberId, leftAt) {
      const m = t.members.find(x => x.id === memberId);
      if (m) m.leftAt = leftAt;
    },

    async saveExpense(e) {
      const i = t.expenses.findIndex(x => x.id === e.id);
      if (i >= 0) t.expenses[i] = clone(e); else t.expenses.push(clone(e));
    },

    async insertActivity(a) {
      const row = { ...clone(a), id: ++actSeq, createdAt: new Date().toISOString() };
      t.activities.push(row);
      return clone(row);
    },

    async setRoomName(roomId, name) { roomNames.set(roomId, name); },

    async purgeRoom(roomId) {
      roomNames.delete(roomId);
      baseCurrencies.delete(roomId);
      rateTable.delete(roomId);
      for (const k of Object.keys(t)) t[k] = t[k].filter(r => r.roomId !== roomId);
    },
  };
}

module.exports = { createSupabaseStore, createMemoryStore, ACTIVITY_LIMIT };
