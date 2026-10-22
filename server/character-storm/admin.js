'use strict';

// ================================================================
//  默契字囊團 — 題庫管理 API（/api/cs/admin）
//
//  密碼由環境變數 CS_ADMIN_PASSWORD 設定（Render / Railway 後台），
//  未設定時整個管理功能停用。前端每次請求以 x-admin-password header 帶入。
// ================================================================

const crypto  = require('crypto');
const express = require('express');
const { listThemes, selectAll, isMissingTable } = require('./themeStore');

const MAX_WORD_LENGTH  = 20;
const MAX_THEME_NAME   = 20;
const MAX_AUTHOR       = 20;
const MAX_WORDS_PER_REQ = 500;

// 密碼錯誤次數限制：每個 IP 15 分鐘內最多錯 10 次
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const FAIL_LIMIT     = 10;
const failures = new Map(); // ip → { count, resetAt }

function clientIp(req) {
  return (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress;
}

function sha256(s) {
  return crypto.createHash('sha256').update(String(s)).digest();
}

function passwordMatches(input) {
  const expected = process.env.CS_ADMIN_PASSWORD;
  return crypto.timingSafeEqual(sha256(input ?? ''), sha256(expected));
}

function requireAdmin(req, res, next) {
  if (!process.env.CS_ADMIN_PASSWORD)
    return res.status(503).json({ error: '題庫管理尚未啟用（伺服器未設定 CS_ADMIN_PASSWORD）' });

  const ip  = clientIp(req);
  const now = Date.now();
  let f = failures.get(ip);
  if (f && f.resetAt < now) { failures.delete(ip); f = null; }
  if (f && f.count >= FAIL_LIMIT)
    return res.status(429).json({ error: '密碼錯誤次數過多，請 15 分鐘後再試' });

  if (!passwordMatches(req.get('x-admin-password'))) {
    failures.set(ip, { count: (f?.count ?? 0) + 1, resetAt: f?.resetAt ?? now + FAIL_WINDOW_MS });
    return res.status(401).json({ error: '密碼錯誤' });
  }
  failures.delete(ip);
  next();
}

function parseId(raw) {
  const id = Number(raw);
  return Number.isInteger(id) && id >= 0 ? id : null;
}

function cleanName(raw) {
  const name = String(raw ?? '').trim();
  return name && [...name].length <= MAX_THEME_NAME ? name : null;
}

function cleanWord(raw) {
  const word = String(raw ?? '').trim();
  return word && [...word].length <= MAX_WORD_LENGTH ? word : null;
}

// 出題者：未填存空字串（author 欄位為 NOT NULL）；超過長度回傳 undefined（不合格）
function cleanAuthor(raw) {
  const author = String(raw ?? '').trim();
  if (!author) return '';
  return [...author].length <= MAX_AUTHOR ? author : undefined;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {() => void} onThemesChanged 主題 / 題目異動後呼叫（刷新遊戲可用主題）
 */
function createAdminRouter(db, onThemesChanged = () => {}) {
  const router = express.Router();
  router.use(requireAdmin);

  // wrap：統一錯誤處理
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (err) {
      console.error('[CS admin]', err);
      const hint = isMissingTable(err) ? '（請先執行 002_theme_management.sql）' : '';
      res.status(500).json({ error: (err?.message ?? '伺服器錯誤') + hint });
    }
  };

  async function getTheme(id) {
    const { data, error } = await db.from('character_storm_themes')
      .select('id, name').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  }

  // 驗證密碼
  router.post('/login', (_, res) => res.json({ ok: true }));

  // ── 主題 ─────────────────────────────────────────────────
  router.get('/themes', wrap(async (_, res) => {
    res.json({ themes: await listThemes(db, { includeEmpty: true }) });
  }));

  router.post('/themes', wrap(async (req, res) => {
    const name = cleanName(req.body?.name);
    if (!name) return res.status(400).json({ error: `主題名稱需為 1～${MAX_THEME_NAME} 字` });

    const { data: last, error: lE } = await db.from('character_storm_themes')
      .select('id').order('id', { ascending: false }).limit(1);
    if (lE) throw lE;
    const id = (last?.[0]?.id ?? -1) + 1;

    const { data, error } = await db.from('character_storm_themes')
      .insert({ id, name }).select('id, name').single();
    if (error) throw error;
    onThemesChanged();
    res.json({ theme: { ...data, count: 0 } });
  }));

  router.patch('/themes/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    const name = cleanName(req.body?.name);
    if (id === null) return res.status(400).json({ error: '主題 id 錯誤' });
    if (!name) return res.status(400).json({ error: `主題名稱需為 1～${MAX_THEME_NAME} 字` });

    const { data, error } = await db.from('character_storm_themes')
      .update({ name }).eq('id', id).select('id, name').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: '主題不存在' });
    // 同主題題目的分類名稱一併更新
    await db.from('character_storm_words').update({ category: name }).eq('weekday_bank', id);
    res.json({ theme: data });
  }));

  // 刪除主題（連同其所有題目）
  router.delete('/themes/:id', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: '主題 id 錯誤' });

    const { error: wE } = await db.from('character_storm_words').delete().eq('weekday_bank', id);
    if (wE) throw wE;
    const { error } = await db.from('character_storm_themes').delete().eq('id', id);
    if (error) throw error;
    onThemesChanged();
    res.json({ ok: true });
  }));

  // ── 題目 ─────────────────────────────────────────────────
  router.get('/themes/:id/words', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: '主題 id 錯誤' });

    const words = await selectAll(() => db.from('character_storm_words')
      .select('id, word, author').eq('is_active', true).eq('weekday_bank', id).order('id'));
    res.json({ words });
  }));

  // 新增：{ words: Array<string | { word, author }> }，自動略過重複與不合格的詞
  router.post('/themes/:id/words', wrap(async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return res.status(400).json({ error: '主題 id 錯誤' });
    const raw = Array.isArray(req.body?.words) ? req.body.words : [];
    if (raw.length > MAX_WORDS_PER_REQ)
      return res.status(400).json({ error: `一次最多新增 ${MAX_WORDS_PER_REQ} 個詞` });

    const theme = await getTheme(id);
    if (!theme) return res.status(404).json({ error: '主題不存在' });

    const existing = await selectAll(() => db.from('character_storm_words')
      .select('word').eq('is_active', true).eq('weekday_bank', id));
    const seen = new Set(existing.map(r => r.word));

    const toInsert = [];
    let invalid = 0;
    for (const item of raw) {
      const isObj  = item && typeof item === 'object';
      const word   = cleanWord(isObj ? item.word : item);
      const author = isObj ? cleanAuthor(item.author) : '';
      if (!word || author === undefined) { invalid++; continue; }
      if (seen.has(word)) continue;
      seen.add(word);
      toInsert.push({ word, author, category: theme.name, weekday_bank: id });
    }

    let inserted = [];
    if (toInsert.length) {
      const { data, error } = await db.from('character_storm_words')
        .insert(toInsert).select('id, word, author');
      if (error) throw error;
      inserted = data ?? [];
      onThemesChanged();
    }
    res.json({ inserted, duplicates: raw.length - invalid - toInsert.length, invalid });
  }));

  router.patch('/words/:wordId', wrap(async (req, res) => {
    const wordId = parseId(req.params.wordId);
    const word = cleanWord(req.body?.word);
    const author = cleanAuthor(req.body?.author);
    if (wordId === null) return res.status(400).json({ error: '題目 id 錯誤' });
    if (!word) return res.status(400).json({ error: `題目需為 1～${MAX_WORD_LENGTH} 字` });
    if (author === undefined) return res.status(400).json({ error: `出題者最多 ${MAX_AUTHOR} 字` });

    const { data, error } = await db.from('character_storm_words')
      .update({ word, author }).eq('id', wordId).select('id, word, author').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: '題目不存在' });
    res.json({ word: data });
  }));

  router.delete('/words/:wordId', wrap(async (req, res) => {
    const wordId = parseId(req.params.wordId);
    if (wordId === null) return res.status(400).json({ error: '題目 id 錯誤' });

    const { error } = await db.from('character_storm_words').delete().eq('id', wordId);
    if (error) throw error;
    onThemesChanged();
    res.json({ ok: true });
  }));

  return router;
}

module.exports = { createAdminRouter };
