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

  // ── 深海底撈（作者：阿賢・阿琳・曉・陌蓮）weekday_bank: 3 ──────

  // 阿賢 — 科技 / 概念 / 成語
  { word: '區塊鏈技術',       category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '大規模語言模型',   category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '自動駕駛系統',     category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '量子位元',         category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '增強實境技術',     category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '初生之犢不畏虎',   category: '成語', difficulty: 'normal', weekday_bank: 3 },
  { word: '船到橋頭自然直',   category: '成語', difficulty: 'normal', weekday_bank: 3 },
  { word: '不經一事不長一智', category: '成語', difficulty: 'normal', weekday_bank: 3 },
  { word: '人工智慧',         category: '概念', difficulty: 'normal', weekday_bank: 3 },
  { word: '天生我材必有用',   category: '成語', difficulty: 'normal', weekday_bank: 3 },
  { word: '綠色環保',         category: '概念', difficulty: 'easy',   weekday_bank: 3 },
  { word: '萬事俱備只欠東風', category: '成語', difficulty: 'normal', weekday_bank: 3 },
  { word: '紙包不住火',       category: '成語', difficulty: 'easy',   weekday_bank: 3 },
  { word: '絕對不可能',       category: '概念', difficulty: 'normal', weekday_bank: 3 },
  { word: '數位化轉型',       category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '生物識別',         category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '神經網路',         category: '概念', difficulty: 'hard',   weekday_bank: 3 },
  { word: '生態系統',         category: '概念', difficulty: 'normal', weekday_bank: 3 },
  { word: '自動化流程',       category: '概念', difficulty: 'normal', weekday_bank: 3 },
  { word: '雲端',             category: '概念', difficulty: 'easy',   weekday_bank: 3 },

  // 阿琳 — 電影卡通 / 日常物品 / 職業
  { word: '明日之後',   category: '電影卡通', difficulty: 'normal', weekday_bank: 3 },
  { word: '楓之谷',     category: '電影卡通', difficulty: 'normal', weekday_bank: 3 },
  { word: '皮卡丘',     category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '小小兵',     category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '捷運',       category: '台灣特色', difficulty: 'easy',   weekday_bank: 3 },
  { word: '電腦',       category: '日常物品', difficulty: 'easy',   weekday_bank: 3 },
  { word: '夜市',       category: '台灣特色', difficulty: 'easy',   weekday_bank: 3 },
  { word: '電影院',     category: '日常物品', difficulty: 'easy',   weekday_bank: 3 },
  { word: '星巴克',     category: '概念',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '醫師',       category: '職業',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '護理師',     category: '職業',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '史迪奇',     category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '行李箱',     category: '日常物品', difficulty: 'easy',   weekday_bank: 3 },
  { word: '迪士尼',     category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '鋼鐵人',     category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '站務員',     category: '職業',     difficulty: 'normal', weekday_bank: 3 },
  { word: '空服員',     category: '職業',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '巧克力',     category: '日常物品', difficulty: 'easy',   weekday_bank: 3 },
  { word: '啤酒',       category: '日常物品', difficulty: 'easy',   weekday_bank: 3 },
  { word: '漫畫',       category: '日常物品', difficulty: 'easy',   weekday_bank: 3 },

  // 曉 — 遊戲 / 地名景點 / 電影 / 職業 / 外國品牌
  { word: '寶可夢',     category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '麥塊',       category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '魔物獵人',   category: '電影卡通', difficulty: 'normal', weekday_bank: 3 },
  { word: '英雄聯盟',   category: '電影卡通', difficulty: 'normal', weekday_bank: 3 },
  { word: '擎天崗',     category: '地名',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '台北車站',   category: '地名',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '白沙屯',     category: '地名',     difficulty: 'normal', weekday_bank: 3 },
  { word: '金門大橋',   category: '地名',     difficulty: 'normal', weekday_bank: 3 },
  { word: '心齋橋',     category: '地名',     difficulty: 'normal', weekday_bank: 3 },
  { word: '奪魂鋸',     category: '電影卡通', difficulty: 'normal', weekday_bank: 3 },
  { word: '你的名字',   category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '汽車總動員', category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '花木蘭',     category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '冰原歷險記', category: '電影卡通', difficulty: 'easy',   weekday_bank: 3 },
  { word: '法官',       category: '職業',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '實況主',     category: '職業',     difficulty: 'normal', weekday_bank: 3 },
  { word: '電信業',     category: '職業',     difficulty: 'normal', weekday_bank: 3 },
  { word: '外送員',     category: '職業',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '保險業務員', category: '職業',     difficulty: 'normal', weekday_bank: 3 },
  { word: '三星',       category: '概念',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '輝達',       category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '蘋果',       category: '概念',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '固力果',     category: '概念',     difficulty: 'normal', weekday_bank: 3 },

  // 陌蓮 — 成語 / 人物 / 古典文化 / 樂器 / 神獸
  { word: '洞潛',         category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '香水',         category: '日常物品', difficulty: 'easy',   weekday_bank: 3 },
  { word: '一生一世',     category: '概念',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '學富五車',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '花式滑冰',     category: '概念',     difficulty: 'normal', weekday_bank: 3 },
  { word: '甄環傳',       category: '電影卡通', difficulty: 'normal', weekday_bank: 3 },
  { word: '華燈初上',     category: '電影卡通', difficulty: 'normal', weekday_bank: 3 },
  { word: '錦衣玉食',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '一葉知秋',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '不分軒輊',     category: '成語',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '火樹銀花',     category: '成語',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '孤掌難鳴',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '泥牛入海',     category: '成語',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '青黃不接',     category: '成語',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '曹操',         category: '概念',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '曹丕',         category: '概念',     difficulty: 'normal', weekday_bank: 3 },
  { word: '曹植',         category: '概念',     difficulty: 'normal', weekday_bank: 3 },
  { word: '洛神賦',       category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '柳如煙',       category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '蜀繡',         category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '繡花鞋',       category: '日常物品', difficulty: 'normal', weekday_bank: 3 },
  { word: '旗袍',         category: '日常物品', difficulty: 'normal', weekday_bank: 3 },
  { word: '蔻丹',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '琉璃盞',       category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '牡丹',         category: '動物',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '月季',         category: '動物',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '蓮花',         category: '動物',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '荷花',         category: '動物',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '黃口小兒',     category: '成語',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '禮記',         category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '論語',         category: '概念',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '六書',         category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '說文解字',     category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '風花雪月',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '魯班尺',       category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '呂式春秋',     category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '魯班經',       category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '曲笛',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '梆笛',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '枇杷',         category: '台灣美食', difficulty: 'normal', weekday_bank: 3 },
  { word: '古箏',         category: '日常物品', difficulty: 'normal', weekday_bank: 3 },
  { word: '古琴',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '小阮',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '中阮',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '大阮',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '山海經',       category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '麒麟',         category: '動物',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '朱雀',         category: '動物',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '鳳凰',         category: '動物',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '青龍',         category: '動物',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '白虎',         category: '動物',     difficulty: 'normal', weekday_bank: 3 },
  { word: '揚琴',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '嗩吶',         category: '日常物品', difficulty: 'normal', weekday_bank: 3 },
  { word: '編鐘',         category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '葫蘆絲',       category: '日常物品', difficulty: 'hard',   weekday_bank: 3 },
  { word: '鳳毛麟角',     category: '成語',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '寥寥無幾',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '絕無僅有',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '寡聞少見',     category: '成語',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '井底之蛙',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '人面獸心',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '豬狗不如',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '雞飛狗跳',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '魚目混珠',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '聊勝於無',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '雞肋',         category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '臨陣脫逃',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '虎頭蛇尾',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '天崩地裂',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '天南地北',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '生生不息',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '螳臂擋車',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '豁然開朗',     category: '成語',     difficulty: 'easy',   weekday_bank: 3 },
  { word: '飛流直下',     category: '成語',     difficulty: 'normal', weekday_bank: 3 },
  { word: '一樹梨花壓海棠', category: '成語',   difficulty: 'hard',   weekday_bank: 3 },
  { word: '蘇軾',         category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '蘇轍',         category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
  { word: '蘇洵',         category: '概念',     difficulty: 'hard',   weekday_bank: 3 },
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
