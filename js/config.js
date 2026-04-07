// ================================================================
//  終極二選一 — Supabase 設定
//  到 https://supabase.com 建立免費專案後，
//  在 Settings > API 取得以下兩個值並填入：
// ================================================================

const SUPABASE_URL      = 'https://hviugzavsvpewgmoejkl.supabase.co';   // 例: https://abcdefgh.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2aXVnemF2c3ZwZXdnbW9lamtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MjQ5OTQsImV4cCI6MjA5MTEwMDk5NH0.7GLkLBS4cJPDcQojED5gi98XmURe4v9QVaJ8vJcTYwM';   // 例: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

const IS_CONFIGURED = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
