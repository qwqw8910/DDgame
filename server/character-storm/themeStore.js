'use strict';

// ================================================================
//  默契字囊團 — 題庫主題存取
//
//  主題名稱存於 character_storm_themes；題目以 character_storm_words.weekday_bank
//  作為主題 id。尚未執行 002_theme_management.sql 時，回退為依題目推算主題。
// ================================================================

const FALLBACK_NAMES = {
  0: '原始題庫',
  1: '綜合主題包',
  2: 'Covercooked餓',
  3: '深海底撈',
  4: '百鬼夜行',
};

const PAGE_SIZE = 1000; // Supabase 預設單次最多回傳 1000 筆

/** 資料表不存在（Postgres 42P01 / PostgREST PGRST205） */
function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

/** 分頁讀取全部資料，避免超過 1000 筆被截斷 */
async function selectAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

async function countWords(db, themeId) {
  const { count, error } = await db.from('character_storm_words')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true).eq('weekday_bank', themeId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * 取得主題清單（含啟用中的題目數）
 * @param {{ includeEmpty?: boolean }} opts includeEmpty=false 時排除沒有題目的主題
 * @returns {Promise<Array<{ id: number, name: string, count: number }>>}
 */
async function listThemes(db, { includeEmpty = false } = {}) {
  let themes;
  const { data, error } = await db.from('character_storm_themes')
    .select('id, name').order('id');

  if (isMissingTable(error)) {
    // 主題表尚未建立：從題目推算
    const rows = await selectAll(() => db.from('character_storm_words')
      .select('weekday_bank').eq('is_active', true));
    const ids = [...new Set(rows.map(r => r.weekday_bank))].sort((a, b) => a - b);
    themes = ids.map(id => ({ id, name: FALLBACK_NAMES[id] ?? `主題 ${id}` }));
  } else if (error) {
    throw error;
  } else {
    themes = data ?? [];
  }

  const counts = await Promise.all(themes.map(t => countWords(db, t.id)));
  const result = themes.map((t, i) => ({ id: t.id, name: t.name, count: counts[i] }));
  return includeEmpty ? result : result.filter(t => t.count > 0);
}

module.exports = { listThemes, selectAll, isMissingTable };
