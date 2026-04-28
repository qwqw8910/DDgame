// ================================================================
//  主題 UI 映射
// ================================================================
export const TOPIC_UI_MAP = {
  '事業':     { emoji: '💼', gradient: 'linear-gradient(135deg,#667eea,#764ba2)' },
  '愛情':     { emoji: '💕', gradient: 'linear-gradient(135deg,#f093fb,#f5576c)' },
  '獵奇':     { emoji: '🕵️', gradient: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
  '友情':     { emoji: '🤝', gradient: 'linear-gradient(135deg,#43e97b,#38f9d7)' },
  '家庭':     { emoji: '🏠', gradient: 'linear-gradient(135deg,#fa709a,#fee140)' },
  '人生難題': { emoji: '🤔', gradient: 'linear-gradient(135deg,#f7971e,#ffd200)' },
  '_default': { emoji: '🎲', gradient: 'linear-gradient(135deg,#a8edea,#fed6e3)' },
}

export function getTopicUi(name) {
  return TOPIC_UI_MAP[name] ?? TOPIC_UI_MAP['_default']
}

export function normalizeQuestion(q) {
  if (!q) return null
  return { id: q.id, a: q.option_a, b: q.option_b, title: q.title || null }
}
