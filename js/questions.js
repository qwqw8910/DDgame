// ================================================================
//  主題 UI 映射 — 從 DB 取得主題名稱後對應 emoji 與漸層色
//  新增主題只需在 Supabase topics 表插入資料，無需修改此檔
// ================================================================

const TOPIC_UI_MAP = {
  '事業':     { emoji: '💼', gradient: 'linear-gradient(135deg,#667eea,#764ba2)' },
  '愛情':     { emoji: '💕', gradient: 'linear-gradient(135deg,#f093fb,#f5576c)' },
  '獵奇':     { emoji: '🕵️', gradient: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
  '友情':     { emoji: '🤝', gradient: 'linear-gradient(135deg,#43e97b,#38f9d7)' },
  '家庭':     { emoji: '🏠', gradient: 'linear-gradient(135deg,#fa709a,#fee140)' },
  '人生難題': { emoji: '🤔', gradient: 'linear-gradient(135deg,#f7971e,#ffd200)' },
  '_default': { emoji: '🎲', gradient: 'linear-gradient(135deg,#a8edea,#fed6e3)' },
};

/** 取得主題的 UI 設定（emoji + gradient） */
function getTopicUi(name) {
  return TOPIC_UI_MAP[name] ?? TOPIC_UI_MAP['_default'];
}

/**
 * 將 DB 題目格式 { option_a, option_b } 正規化為前端格式 { a, b }
 */
function normalizeQuestion(q) {
  if (!q) return null;
  return { id: q.id, a: q.option_a, b: q.option_b };
}

// 舊版 hardcoded 資料已移除，所有題目由 Supabase DB 提供
// 舊版函式已停用，改由 DB.getRandomQuestion / DB.getQuestionById 取代
