// ================================================================
//  index.html 頁面邏輯
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  initSupabase();

  // Reset buttons when returning from bfcache (e.g. browser back)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      setLoading(document.getElementById('create-btn'), false);
      setLoading(document.getElementById('join-btn'), false);
    }
  });

  // Pre-fill saved nickname
  const saved = getSavedNickname();
  if (saved) {
    const cn = document.getElementById('create-nickname');
    const jn = document.getElementById('join-nickname');
    if (cn) cn.value = saved;
    if (jn) jn.value = saved;
  }

  // Handle room code passed via URL (e.g. shared link lands on index)
  const params   = new URLSearchParams(window.location.search);
  const roomCode = (params.get('room') || params.get('id') || '').toUpperCase();
  if (roomCode) {
    const jc = document.getElementById('join-code');
    if (jc) jc.value = roomCode;
    document.getElementById('join-nickname')?.focus();
    showToast('請輸入暱稱後加入房間 🎉', 'info');
  } else {
    document.getElementById('create-nickname')?.focus();
  }

  // Enter key shortcuts
  document.getElementById('create-nickname')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') handleCreateRoom(); });
  document.getElementById('join-code')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('join-nickname')?.focus(); });
  document.getElementById('join-nickname')
    ?.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoinRoom(); });

  // Show config warning if not set up
  if (!IS_CONFIGURED) {
    document.getElementById('config-warning')?.classList.remove('hidden');
  }
});

async function handleCreateRoom() {
  const nickname   = document.getElementById('create-nickname').value.trim();
  const maxPlayers = parseInt(document.getElementById('create-max-players').value);

  console.log('[handleCreateRoom] nickname:', nickname, 'maxPlayers:', maxPlayers);

  if (!nickname) { shakeAndToast('create-nickname', '請輸入你的暱稱！'); return; }

  if (!IS_CONFIGURED) {
    showToast('⚠️ 請先在 js/config.js 設定 Supabase！', 'error', 5000);
    return;
  }

  const btn = document.getElementById('create-btn');
  setLoading(btn, true, '建立中…');

  try {
    const playerId = getOrCreatePlayerId();
    const roomId   = generateRoomId();
    console.log('[handleCreateRoom] 建立房間中 roomId:', roomId, 'playerId:', playerId);
    await DB.createRoom(roomId, playerId, maxPlayers);
    console.log('[handleCreateRoom] ✅ 建立成功，跳轉到 room.html');
    saveNickname(nickname);
    window.location.href = `room.html?id=${roomId}&nickname=${encodeURIComponent(nickname)}`;
  } catch (err) {
    console.error('[handleCreateRoom] ❌ 建立失敗:', err);
    showToast('建立失敗：' + err.message, 'error');
    setLoading(btn, false);
  }
}

async function handleJoinRoom() {
  const code     = document.getElementById('join-code').value.trim().toUpperCase();
  const nickname = document.getElementById('join-nickname').value.trim();

  if (!code || code.length !== 6)  { shakeAndToast('join-code',     '請輸入6碼房間碼！'); return; }
  if (!nickname)                    { shakeAndToast('join-nickname', '請輸入你的暱稱！'); return; }

  if (!IS_CONFIGURED) {
    showToast('⚠️ 請先在 js/config.js 設定 Supabase！', 'error', 5000);
    return;
  }

  const btn = document.getElementById('join-btn');
  setLoading(btn, true, '加入中…');

  try {
    await DB.getRoom(code); // verify room exists
    saveNickname(nickname);
    window.location.href = `room.html?id=${code}&nickname=${encodeURIComponent(nickname)}`;
  } catch (err) {
    const isNotFound = err.code === 'PGRST116' || (err.message || '').includes('No rows');
    showToast(isNotFound ? '找不到這個房間！' : '加入失敗：' + err.message, 'error');
    setLoading(btn, false);
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function shakeAndToast(inputId, msg) {
  const el = document.getElementById(inputId);
  if (el) {
    el.classList.add('animate-shake');
    setTimeout(() => el.classList.remove('animate-shake'), 500);
  }
  showToast(msg, 'error');
}

function setLoading(btn, loading, text = '') {
  if (!btn) return;
  if (loading) {
    btn.dataset.orig = btn.innerHTML;
    btn.innerHTML    = `<span class="spinner spinner-sm"></span> ${text}`;
    btn.disabled     = true;
  } else {
    btn.innerHTML = btn.dataset.orig || btn.innerHTML;
    btn.disabled  = false;
  }
}
