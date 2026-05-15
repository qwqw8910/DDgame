'use strict';

// ================================================================
//  統一房間模組 — 事件名稱常數
//  所有後端 handler 與前端 composable 必須從此匯入，禁止硬寫字串
// ================================================================

module.exports = {
  // ── Client → Server ─────────────────────────────────────────
  ROOM_CREATE:         'room:create',
  ROOM_JOIN:           'room:join',
  ROOM_LEAVE:          'room:leave',
  ROOM_KICK:           'room:kick',
  ROOM_READY:          'room:ready',
  ROOM_TRANSFER_HOST:  'room:transfer-host',
  ROOM_SPECTATOR_JOIN: 'room:spectator-join',

  // ── Server → Client ─────────────────────────────────────────
  ROOM_JOIN_ACK:            'room:join-ack',
  ROOM_PLAYER_JOINED:       'room:player-joined',
  ROOM_PLAYER_RECONNECTED:  'room:player-reconnected',
  ROOM_PLAYER_OFFLINE:      'room:player-offline',
  ROOM_PLAYER_LEFT:         'room:player-left',
  ROOM_PLAYERS_UPDATED:     'room:players-updated',
  ROOM_SPECTATOR_JOINED:    'room:spectator-joined',
  ROOM_SPECTATOR_CAN_JOIN:  'room:spectator-can-join',
  ROOM_SPECTATORS_UPDATED:  'room:spectators-updated',
  ROOM_HOST_CHANGED:        'room:host-changed',
  ROOM_KICKED:              'room:kicked',
  ROOM_ERROR:               'room:error',
  ROOM_CLOSED:              'room:closed',

  // ── Error codes ──────────────────────────────────────────────
  ERR_ROOM_NOT_FOUND:   'ROOM_NOT_FOUND',
  ERR_ROOM_FULL:        'ROOM_FULL',
  ERR_ROOM_ARCHIVED:    'ROOM_ARCHIVED',
  ERR_WRONG_APP:        'ROOM_WRONG_APP',
  ERR_NICKNAME_TAKEN:   'NICKNAME_TAKEN',
  ERR_FORBIDDEN:        'FORBIDDEN',
  ERR_CANNOT_KICK_SELF: 'CANNOT_KICK_SELF',
  ERR_KICK_BELOW_MIN:   'KICK_BELOW_MIN',
  ERR_CREATE_FAILED:    'CREATE_FAILED',
  ERR_JOIN_FAILED:      'JOIN_FAILED',
};
