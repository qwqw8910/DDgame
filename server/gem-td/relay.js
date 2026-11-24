'use strict';

// ================================================================
//  環形接力 — 蟲在區與區之間的流動（純函式，不碰 socket / 計時器）
//  每區仍是一張獨立的 waveSim；本檔負責：
//  - 蟲離開一區：傳給下一區（上輸送帶）或離場扣血
//  - 輸送帶：只加移動時間（長度 ÷ 蟲自己的速度），蟲在上面打不到、也不尋路
//  - 分區統計、事件紀錄、整圈的快照
// ================================================================

const C = require('./config');
const { monsterFlags, typeIndex } = require('./waveSim');
const { pointAt } = require('./ringLayout');

const zoneLabel = index => `P${index + 1}`;

// 輸送帶上的蟲不再受緩速、中毒、破甲影響（也避免毒傷記到別區的塔上）
const CLEAN = { slowPct: 0, slowUntil: 0, poisonDps: 0, poisonUntil: 0, poisonBy: null, shredAmount: 0, shredUntil: 0 };

// 一波一份：整圈共用的蟲編號、輸送帶上的蟲、這一刻的視覺事件
function createHub(ring) {
  const hub = {
    n: ring.layout.n,
    layout: ring.layout,
    nextId: 1,
    transit: [], // { m, from, d }：d 是在輸送帶上已走的距離（格）
    fx: [], // [種類, 區, 數值]：0 = 傳給後援（出口閃箭頭）、1 = 扣血（出口閃紅並跳數字）
    onExit(sim, m) {
      const zone = sim.relay.zone;
      if (m.hop >= m.hops - 1) {
        // 最後一區的出口：離場，扣隊伍血量
        sim.leaked += 1;
        sim.rs.leaks += 1;
        sim.pool.lives = Math.max(0, sim.pool.lives - m.leak);
        hub.fx.push([1, zone, m.leak]);
        return;
      }
      sim.rs.handoff += 1;
      hub.transit.push({ m: { ...m, ...CLEAN, dead: false, hop: m.hop + 1 }, from: zone, d: 0 });
      hub.fx.push([0, zone, 0]);
    },
  };
  return hub;
}

// 傳送：漏出去的蟲直接出現在下一區的入口（沒有移動時間）；有 delay 的測試才會留在 transit 裡。sims 依區的順序排列
function stepTransit(hub, sims, dt) {
  if (!hub.transit.length) return;
  const keep = [];
  for (const t of hub.transit) {
    t.d += t.m.speed * dt;
    const conveyor = hub.layout.conveyors[t.from];
    if (hub.delay && t.d < conveyor.length) {
      keep.push(t);
      continue;
    }
    const dest = sims[conveyor.to];
    const { start } = dest.board;
    Object.assign(t.m, { pos: 0, x: start.x, y: start.y });
    dest.monsters.push(t.m);
  }
  hub.transit = keep;
}

// 這一波是否全部結束：每一區都出完怪、場上沒有蟲、輸送帶也空了
const waveClear = (hub, sims) => hub.transit.length === 0 && sims.every(s => s.spawned >= s.def.count && s.monsters.length === 0);

// ── 統計 ────────────────────────────────────────────────────────
const blankStats = () => ({ kills: 0, handoff: 0, relief: 0, leaks: 0, damage: 0 });

// 把一波的成績加進區域的累計
function bankStats(p, sim) {
  const s = (p.rstats ??= blankStats());
  s.kills += sim.rs.kills;
  s.handoff += sim.rs.handoff;
  s.relief += sim.rs.relief;
  s.leaks += sim.rs.leaks;
  s.damage += sim.damage;
}

// 累計 + 進行中的這一波（波次中就能即時看到）
function liveStats(p) {
  const s = p.rstats ?? blankStats();
  const sim = p.sim && !p.sim.banked ? p.sim : null;
  return {
    kills: s.kills + (sim?.rs.kills ?? 0),
    handoff: s.handoff + (sim?.rs.handoff ?? 0),
    relief: s.relief + (sim?.rs.relief ?? 0),
    leaks: s.leaks + (sim?.rs.leaks ?? 0),
    damage: Math.round(s.damage + (sim?.damage ?? 0)),
  };
}

// ── 事件紀錄 ────────────────────────────────────────────────────
function pushEvent(ring, wave, text) {
  ring.events.push({ wave, text });
  if (ring.events.length > C.RELAY_EVENT_KEEP) ring.events.splice(0, ring.events.length - C.RELAY_EVENT_KEEP);
}

// 一波打完，把各區的傳遞與補救寫成幾句話。label：第幾波；test：傷害測試
function recordWaveEvents(ring, sims, label, { test = false, bossAt = null } = {}) {
  const n = ring.layout.n;
  const boss = sims.some(s => s.def.groups.some(g => C.MONSTERS[g.type]?.boss));
  const prefix = test ? `傷害測試（第 ${label} 波後）` : `第 ${label} 波`;
  if (boss) {
    const killer = sims.findIndex(s => s.bossDownAt !== null);
    const leaks = sims.reduce((a, s) => a + s.rs.leaks, 0);
    const route = Array.from({ length: n }, (_, i) => zoneLabel(i)).join('→');
    if (killer >= 0) {
      pushEvent(ring, label, `${prefix}：${test ? '巨獸' : '首領'}繞圈（${route}），由 ${zoneLabel(killer)} 擊倒`);
    } else {
      pushEvent(ring, label, `${prefix}：${test ? '巨獸' : '首領'}繞完整圈（${route}）${leaks ? `，從 ${zoneLabel(n - 1)} 漏出` : ''}`);
    }
    return;
  }
  let any = false;
  for (let i = 0; i < n; i++) {
    const handoff = sims[i].rs.handoff;
    if (!handoff) continue;
    any = true;
    const j = (i + 1) % n;
    const relief = sims[j].rs.relief;
    const leaks = sims[j].rs.leaks;
    pushEvent(ring, label, `${prefix}：${zoneLabel(i)} 傳 ${handoff} 隻給 ${zoneLabel(j)}，${zoneLabel(j)} 補救 ${relief} 隻${leaks ? `，漏 ${leaks} 隻` : ''}`);
  }
  if (!any) pushEvent(ring, label, `${prefix}：全部都在主防區解決，沒有傳給後援`);
}

// ── 快照 ────────────────────────────────────────────────────────
// m 的每一筆：[編號, 怪物型別索引, 世界 x×10, 世界 y×10, 血量%, 旗標, 出生區, 已傳給後援(0/1), 所在區（輸送帶上 = -1）]
// 世界座標：區域原點 + 區內座標 + 0.5（格子中心），前端直接乘上縮放就能畫
function buildRingFrame(game) {
  const { ring } = game;
  const { hub, layout } = ring;
  const ids = game.playerIds.filter(id => game.players[id].sim);
  const m = [];
  const s = [];
  const players = {};
  ids.forEach((id, zone) => {
    const p = game.players[id];
    const { sim } = p;
    const o = layout.zones[zone].origin;
    for (const mon of sim.monsters) {
      m.push([
        mon.id, typeIndex[mon.type],
        Math.round((o.x + mon.x + 0.5) * 10), Math.round((o.y + mon.y + 0.5) * 10),
        Math.ceil((mon.hp / mon.maxHp) * 100), monsterFlags(sim, mon), mon.born, mon.hop >= 1 ? 1 : 0, zone,
      ]);
    }
    for (const shot of sim.shots) s.push(shot);
    sim.shots = [];
    const { earned, killed, leaked, done, damage } = sim;
    players[id] = { lives: game.lives, earned, killed, leaked, done, damage: Math.round(damage) };
  });
  for (const t of hub.transit) {
    const pt = pointAt(layout.conveyors[t.from], t.d);
    const mon = t.m;
    m.push([
      mon.id, typeIndex[mon.type], Math.round(pt.x * 10), Math.round(pt.y * 10),
      Math.ceil((mon.hp / mon.maxHp) * 100), monsterFlags({ time: 0 }, mon), mon.born, 1, -1,
    ]);
  }
  const e = hub.fx;
  hub.fx = [];
  const lead = game.players[ids[0]].sim;
  // zs：各區的累計統計（分區統計表在波次中即時更新）
  const zs = ids.map(id => liveStats(game.players[id]));
  return { ring: true, owner: null, zs, wave: lead.wave, total: ids.reduce((n, id) => n + game.players[id].sim.def.count + game.players[id].sim.splits, 0), players, m, s, e };
}

module.exports = { createHub, stepTransit, waveClear, bankStats, liveStats, blankStats, recordWaveEvents, buildRingFrame, zoneLabel };
