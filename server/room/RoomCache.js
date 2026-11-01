'use strict';

// ================================================================
//  統一房間模組 — In-Memory 快取（含 Supabase DB fallback）
//
//  結構：
//    cache[roomId] = {
//      room:       { id, host_player_id, max_players, status, app_id, ... }
//      players:    [{ id, nickname, is_online, join_order, ... }]
//      spectators: [{ id, nickname }]
//      gameData:   any   ← 各遊戲自行存放的遊戲狀態
//      _archiveTimer: NodeJS.Timeout | null
//    }
// ================================================================

const ARCHIVE_TIMEOUT_MS = 30 * 60 * 1000; // 30 分鐘

class RoomCache {
  /**
   * @param {object} db
   * @param {object} [opts]
   * @param {'archive'|'evict'} [opts.idleAction='archive']
   *        全員離線逾時後的動作。'archive'：DB 標記 archived 並清快取（預設）；
   *        'evict'：只清記憶體快取，DB 不動，之後仍可用房間碼重新載入（長期保存的房間用）
   * @param {number} [opts.idleMs=30 分鐘] 全員離線多久後觸發 idleAction
   */
  constructor(db, opts = {}) {
    this._db         = db;
    this._cache      = {};
    this._idleAction = opts.idleAction ?? 'archive';
    this._idleMs     = opts.idleMs ?? ARCHIVE_TIMEOUT_MS;
  }

  // ── 初始化（建立房間時）─────────────────────────────────────
  init(roomId, { room, players = [], spectators = [] }) {
    this._clearArchiveTimer(roomId);
    this._cache[roomId] = {
      room,
      players:   [...players],
      spectators: [...spectators],
      gameData:  null,
      _archiveTimer: null,
    };
    return this._cache[roomId];
  }

  // ── 取得（cache hit or DB 重建）─────────────────────────────
  async get(roomId) {
    if (this._cache[roomId]) return this._cache[roomId];

    // DB fallback
    const { data: room } = await this._db
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .maybeSingle();

    if (!room) return null;
    if (room.status === 'archived') return null;

    const { data: players } = await this._db
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('join_order');

    this.init(roomId, { room, players: players ?? [] });
    return this._cache[roomId];
  }

  // ── 刪除 ─────────────────────────────────────────────────────
  delete(roomId) {
    this._clearArchiveTimer(roomId);
    delete this._cache[roomId];
  }

  // ── 房間更新 ─────────────────────────────────────────────────
  updateRoom(roomId, updates) {
    const entry = this._cache[roomId];
    if (!entry) return;
    entry.room = { ...entry.room, ...updates };
  }

  // ── 正式玩家 ─────────────────────────────────────────────────
  addPlayer(roomId, player) {
    const entry = this._cache[roomId];
    if (!entry) return;
    const existing = entry.players.findIndex(p => p.id === player.id);
    if (existing >= 0) {
      entry.players[existing] = { ...entry.players[existing], ...player };
    } else {
      entry.players.push(player);
    }
    this._clearArchiveTimer(roomId);
  }

  updatePlayer(roomId, playerId, updates) {
    const entry = this._cache[roomId];
    if (!entry) return;
    const idx = entry.players.findIndex(p => p.id === playerId);
    if (idx >= 0) entry.players[idx] = { ...entry.players[idx], ...updates };
  }

  removePlayer(roomId, playerId) {
    const entry = this._cache[roomId];
    if (!entry) return;
    entry.players = entry.players.filter(p => p.id !== playerId);
    this._checkAllOffline(roomId);
  }

  setPlayerOnline(roomId, playerId, isOnline) {
    this.updatePlayer(roomId, playerId, { is_online: isOnline });
    if (!isOnline) this._checkAllOffline(roomId);
    else           this._clearArchiveTimer(roomId);
  }

  getPlayers(roomId) {
    return this._cache[roomId]?.players ?? [];
  }

  // ── 觀戰者 ───────────────────────────────────────────────────
  addSpectator(roomId, spectator) {
    const entry = this._cache[roomId];
    if (!entry) return;
    const existing = entry.spectators.findIndex(s => s.id === spectator.id);
    if (existing >= 0) {
      entry.spectators[existing] = spectator;
    } else {
      entry.spectators.push(spectator);
    }
  }

  removeSpectator(roomId, spectatorId) {
    const entry = this._cache[roomId];
    if (!entry) return;
    entry.spectators = entry.spectators.filter(s => s.id !== spectatorId);
    this._checkAllOffline(roomId);
  }

  getSpectators(roomId) {
    return this._cache[roomId]?.spectators ?? [];
  }

  // ── 同步快速讀取（適用於已入 cache 的 active 房間）──────────
  /**
   * 返回目前記憶體中的 entry（不做 DB fallback）。
   * 適合在確定房間已載入的 game handler 中使用。
   */
  getEntry(roomId) {
    return this._cache[roomId] ?? null;
  }

  // ── 遊戲資料（各遊戲自行管理）───────────────────────────────
  setGameData(roomId, data) {
    const entry = this._cache[roomId];
    if (entry) entry.gameData = data;
  }

  getGameData(roomId) {
    return this._cache[roomId]?.gameData ?? null;
  }

  // ── 封存計時器 ───────────────────────────────────────────────

  /**
   * 當所有人（玩家+觀戰）都離線，啟動 30 分鐘封存倒數
   */
  _checkAllOffline(roomId) {
    const entry = this._cache[roomId];
    if (!entry) return;

    const anyOnline =
      entry.players.some(p => p.is_online) ||
      entry.spectators.length > 0;

    if (!anyOnline && !entry._archiveTimer) {
      entry._archiveTimer = setTimeout(
        () => this._archiveRoom(roomId),
        this._idleMs
      );
      entry._archiveTimer.unref?.(); // 不讓排程中的封存撐住程序（測試結束、關機時）
      const verb = this._idleAction === 'evict' ? '釋放記憶體' : '封存';
      console.log(`[RoomCache] 房間 ${roomId} 全員離線，${this._idleMs / 60000} 分鐘後${verb}`);
    }
  }

  _clearArchiveTimer(roomId) {
    const entry = this._cache[roomId];
    if (!entry) return;
    if (entry._archiveTimer) {
      clearTimeout(entry._archiveTimer);
      entry._archiveTimer = null;
    }
  }

  async _archiveRoom(roomId) {
    if (this._idleAction === 'evict') {
      console.log(`[RoomCache] 釋放房間快取 ${roomId}（DB 資料保留）`);
      this.delete(roomId);
      return;
    }
    console.log(`[RoomCache] 封存房間 ${roomId}`);
    try {
      await this._db
        .from('rooms')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', roomId);
    } catch (err) {
      console.error('[RoomCache] 封存失敗：', err.message);
    } finally {
      this.delete(roomId);
    }
  }
}

module.exports = { RoomCache };
