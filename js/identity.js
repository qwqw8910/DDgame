// ================================================================
//  玩家身份識別 — localStorage + UUID
// ================================================================

const PLAYER_ID_KEY = 'udc_player_id';
const NICKNAME_KEY  = 'udc_nickname';

const PLAYER_EMOJIS = ['🦊','🐱','🐻','🐼','🐸','🦁','🐯','🦄','🐧','🐨','🦝','🐺'];
const PLAYER_COLORS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#a18cd1,#fbc2eb)',
  'linear-gradient(135deg,#ffecd2,#fcb69f)',
  'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
  'linear-gradient(135deg,#d4fc79,#96e6a1)',
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#89f7fe,#66a6ff)',
  'linear-gradient(135deg,#fddb92,#d1fdff)',
];

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = (typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

function getSavedNickname() { return localStorage.getItem(NICKNAME_KEY) || ''; }
function saveNickname(n)     { localStorage.setItem(NICKNAME_KEY, n); }

function getPlayerEmoji(joinOrder) { return PLAYER_EMOJIS[joinOrder % PLAYER_EMOJIS.length]; }
function getPlayerColor(joinOrder) { return PLAYER_COLORS[joinOrder % PLAYER_COLORS.length]; }

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1 ambiguity
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
