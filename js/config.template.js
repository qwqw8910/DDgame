// ================================================================
//  懂我再說 — Supabase 設定（範本檔）
//
//  ⚠️  此檔案為佔位符範本，由 GitHub Actions 自動替換。
//  本機開發請複製此檔案為 config.js 並填入真實金鑰：
//
//    cp js/config.template.js js/config.js
//
//  然後在 config.js 中把以下佔位符換成你的 Supabase 值：
//    - __SUPABASE_URL__      ← Settings > API > Project URL
//    - __SUPABASE_ANON_KEY__ ← Settings > API > anon public key
// ================================================================

const SUPABASE_URL      = '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';

// Socket.io 後端伺服器 URL（部署後填入 Railway / Render URL）
// 本機開發：http://localhost:3000
const SOCKET_SERVER_URL = '__SOCKET_SERVER_URL__';

const IS_CONFIGURED = !!(
  SUPABASE_URL      && SUPABASE_URL.startsWith('https://') &&
  SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 20
);
