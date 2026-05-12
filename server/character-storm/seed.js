'use strict';

// ================================================================
//  默契傳聲筒 — 題庫建立 & 種子資料腳本
//  執行：cd server && node character-storm/seed.js
// ================================================================

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY，請確認 server/.env');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ── 建表 SQL（若資料表不存在時輸出供手動執行）────────────────
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS character_storm_words (
  id         BIGSERIAL    PRIMARY KEY,
  word       TEXT         NOT NULL,
  category   TEXT         NOT NULL,
  difficulty TEXT         NOT NULL DEFAULT 'normal',
  weekday_bank SMALLINT   NOT NULL DEFAULT 2 CHECK (weekday_bank BETWEEN 0 AND 6),
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 快速過濾用索引
CREATE INDEX IF NOT EXISTS idx_csw_active_category
  ON character_storm_words (is_active, category);

CREATE INDEX IF NOT EXISTS idx_csw_active_weekday
  ON character_storm_words (is_active, weekday_bank);
`.trim();

// ── 種子詞庫 ────────────────────────────────────────────────────
const WORDS = [

  // ── 台灣美食 ──────────────────────────────────────────────────
  { word: '臭豆腐', category: '台灣美食', difficulty: 'easy' },
  { word: '珍珠奶茶', category: '台灣美食', difficulty: 'easy' },
  { word: '滷肉飯', category: '台灣美食', difficulty: 'easy' },
  { word: '蚵仔煎', category: '台灣美食', difficulty: 'normal' },
  { word: '刈包', category: '台灣美食', difficulty: 'normal' },
  { word: '鳳梨酥', category: '台灣美食', difficulty: 'easy' },
  { word: '牛肉麵', category: '台灣美食', difficulty: 'easy' },
  { word: '小籠包', category: '台灣美食', difficulty: 'easy' },
  { word: '豬血糕', category: '台灣美食', difficulty: 'normal' },
  { word: '大腸包小腸', category: '台灣美食', difficulty: 'hard' },
  { word: '雞排', category: '台灣美食', difficulty: 'easy' },
  { word: '糖葫蘆', category: '台灣美食', difficulty: 'normal' },
  { word: '芒果冰', category: '台灣美食', difficulty: 'easy' },
  { word: '肉圓', category: '台灣美食', difficulty: 'normal' },
  { word: '碗粿', category: '台灣美食', difficulty: 'hard' },

  // ── 動物 ──────────────────────────────────────────────────────
  { word: '無尾熊', category: '動物', difficulty: 'easy' },
  { word: '北極熊', category: '動物', difficulty: 'easy' },
  { word: '企鵝', category: '動物', difficulty: 'easy' },
  { word: '火烈鳥', category: '動物', difficulty: 'normal' },
  { word: '獨角獸', category: '動物', difficulty: 'normal' },
  { word: '變色龍', category: '動物', difficulty: 'normal' },
  { word: '鴨嘴獸', category: '動物', difficulty: 'hard' },
  { word: '海龍王', category: '動物', difficulty: 'hard' },
  { word: '貓熊', category: '動物', difficulty: 'easy' },
  { word: '柴犬', category: '動物', difficulty: 'easy' },
  { word: '水母', category: '動物', difficulty: 'easy' },
  { word: '穿山甲', category: '動物', difficulty: 'normal' },
  { word: '翠鳥', category: '動物', difficulty: 'normal' },

  // ── 地名 ──────────────────────────────────────────────────────
  { word: '東京塔', category: '地名', difficulty: 'easy' },
  { word: '故宮', category: '地名', difficulty: 'easy' },
  { word: '墾丁', category: '地名', difficulty: 'easy' },
  { word: '日月潭', category: '地名', difficulty: 'easy' },
  { word: '阿里山', category: '地名', difficulty: 'easy' },
  { word: '九份', category: '地名', difficulty: 'normal' },
  { word: '太魯閣', category: '地名', difficulty: 'normal' },
  { word: '金門', category: '地名', difficulty: 'normal' },
  { word: '清境農場', category: '地名', difficulty: 'hard' },
  { word: '外婆的澎湖灣', category: '地名', difficulty: 'hard' },
  { word: '夜市', category: '地名', difficulty: 'easy' },

  // ── 職業 ──────────────────────────────────────────────────────
  { word: '魔術師', category: '職業', difficulty: 'easy' },
  { word: '潛水員', category: '職業', difficulty: 'easy' },
  { word: '太空人', category: '職業', difficulty: 'easy' },
  { word: '消防員', category: '職業', difficulty: 'easy' },
  { word: '外科醫生', category: '職業', difficulty: 'normal' },
  { word: '考古學家', category: '職業', difficulty: 'normal' },
  { word: '調酒師', category: '職業', difficulty: 'normal' },
  { word: '駭客', category: '職業', difficulty: 'normal' },
  { word: '說書人', category: '職業', difficulty: 'hard' },

  // ── 日常物品 ──────────────────────────────────────────────────
  { word: '雨傘', category: '日常物品', difficulty: 'easy' },
  { word: '鬧鐘', category: '日常物品', difficulty: 'easy' },
  { word: '溫度計', category: '日常物品', difficulty: 'easy' },
  { word: '放大鏡', category: '日常物品', difficulty: 'easy' },
  { word: '計算機', category: '日常物品', difficulty: 'easy' },
  { word: '吸塵器', category: '日常物品', difficulty: 'normal' },
  { word: '剪刀石頭布', category: '日常物品', difficulty: 'hard' },
  { word: '保溫杯', category: '日常物品', difficulty: 'normal' },
  { word: '捕夢網', category: '日常物品', difficulty: 'normal' },

  // ── 電影 / 卡通 ───────────────────────────────────────────────
  { word: '哈利波特', category: '電影卡通', difficulty: 'easy' },
  { word: '獅子王', category: '電影卡通', difficulty: 'easy' },
  { word: '鐵達尼號', category: '電影卡通', difficulty: 'easy' },
  { word: '蜘蛛人', category: '電影卡通', difficulty: 'easy' },
  { word: '神隱少女', category: '電影卡通', difficulty: 'easy' },
  { word: '玩具總動員', category: '電影卡通', difficulty: 'normal' },
  { word: '復仇者聯盟', category: '電影卡通', difficulty: 'normal' },
  { word: '魔戒', category: '電影卡通', difficulty: 'normal' },
  { word: '機器人總動員', category: '電影卡通', difficulty: 'hard' },

  // ── 台灣特色 ──────────────────────────────────────────────────
  { word: '捷運', category: '台灣特色', difficulty: 'easy' },
  { word: '便利商店', category: '台灣特色', difficulty: 'easy' },
  { word: '檳榔', category: '台灣特色', difficulty: 'normal' },
  { word: '廟會', category: '台灣特色', difficulty: 'normal' },
  { word: '媽祖', category: '台灣特色', difficulty: 'normal' },
  { word: '八家將', category: '台灣特色', difficulty: 'hard' },
  { word: '眷村', category: '台灣特色', difficulty: 'hard' },

  // ── 概念詞 ────────────────────────────────────────────────────
  { word: '失戀', category: '概念', difficulty: 'normal' },
  { word: '懶惰', category: '概念', difficulty: 'easy' },
  { word: '嫉妒', category: '概念', difficulty: 'normal' },
  { word: '秘密', category: '概念', difficulty: 'easy' },
  { word: '緣分', category: '概念', difficulty: 'normal' },
  { word: '默契', category: '概念', difficulty: 'easy' },
  { word: '後悔', category: '概念', difficulty: 'normal' },
  { word: '奇蹟', category: '概念', difficulty: 'normal' },
];

// ── 主程式 ──────────────────────────────────────────────────────
async function main() {
  console.log('========================================');
  console.log('  默契傳聲筒 — 題庫建立腳本');
  console.log('========================================\n');

  // Step 1：確認資料表是否存在
  console.log('📋 確認資料表狀態...');
  const { error: checkError } = await db
    .from('character_storm_words')
    .select('id')
    .limit(1);

  if (checkError) {
    if (checkError.code === '42P01') {
      // 資料表不存在
      console.log('\n❌ 資料表 character_storm_words 不存在。');
      console.log('\n請在 Supabase Dashboard > SQL Editor 貼上以下 SQL 建立資料表：');
      console.log('\n' + '─'.repeat(60));
      console.log(CREATE_TABLE_SQL);
      console.log('─'.repeat(60) + '\n');
      console.log('建立完成後，再次執行此腳本即可自動填入題目。');
      process.exit(1);
    } else {
      console.error('❌ 連線失敗：', checkError.message);
      process.exit(1);
    }
  }

  console.log('✅ 資料表存在\n');

  // Step 2：清空舊資料（可選，避免重複执行時重複塞入）
  console.log('🗑️  清空舊有題目（避免重複）...');
  const { error: delError } = await db
    .from('character_storm_words')
    .delete()
    .gte('id', 0); // 刪全部
  if (delError) {
    console.error('❌ 清空失敗：', delError.message);
    process.exit(1);
  }
  console.log('✅ 已清空\n');

  // Step 3：批次插入
  console.log(`📝 準備插入 ${WORDS.length} 筆題目...\n`);
  const CHUNK = 50;
  let done = 0;

  for (let i = 0; i < WORDS.length; i += CHUNK) {
    const chunk = WORDS.slice(i, i + CHUNK);
    const { error: insErr } = await db.from('character_storm_words').insert(chunk);
    if (insErr) {
      console.error(`❌ 插入失敗（第 ${i + 1} ~ ${i + chunk.length} 筆）：`, insErr.message);
      process.exit(1);
    }
    done += chunk.length;
    console.log(`   ✓ ${done} / ${WORDS.length} 筆`);
  }

  // Step 4：確認結果
  const { count } = await db
    .from('character_storm_words')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  console.log(`\n✅ 完成！資料庫共有 ${count} 筆有效題目`);
  console.log('\n分類統計：');

  const { data: cats } = await db
    .from('character_storm_words')
    .select('category')
    .eq('is_active', true);

  const catMap = {};
  for (const { category } of cats ?? []) {
    catMap[category] = (catMap[category] || 0) + 1;
  }
  for (const [cat, n] of Object.entries(catMap)) {
    console.log(`   ${cat.padEnd(12)}：${n} 題`);
  }

  console.log('\n🎉 題庫初始化完成！可以開始玩了。');
}

main().catch(err => {
  console.error('❌ 未預期錯誤：', err.message);
  process.exit(1);
});
