'use strict';

// ================================================================
//  甜點守衛戰 — gt:state 的傳輸格式
//  buildView 產生的視圖裡，塔的清單最多重複三份（view.towers、me.towers、relay.zones[].towers），
//  後期環形接力一份視圖可達 100KB 以上，而且每次操作都推給每個人。送出前在這裡壓縮：
//    - view.towers / me.towers 改成陣列列：鍵名不重複送，擁有者只在跟第一座塔不同時才附上
//    - me.towers 跟 view.towers 是同一張地圖（看自己）時送 0，前端直接共用
//    - view.path 改成攤平的 [x0, y0, x1, y1, …]
//    - relay.zones 裡「正在看的那一區」的塔與路線不送（null），前端由 view.towers / view.path 轉回
//  前端在 vue-app/src/apps/gem-td/data/wire.js 有一份相同的 unpackView，兩邊要一起改。
// ================================================================

const WIRE_VERSION = 1;

// [id, x, y, kind, level, fresh, kills, damage, slot, owner?]
function packTowers(list) {
  const owner = list[0]?.owner ?? null;
  return {
    o: owner,
    r: list.map((t) => {
      const row = [t.id, t.x, t.y, t.kind, t.level, t.fresh ? 1 : 0, t.kills, t.damage, t.slot ?? null];
      if (t.owner !== owner) row.push(t.owner);
      return row;
    }),
  };
}

function unpackTowers({ o, r }) {
  return r.map(([id, x, y, kind, level, fresh, kills, damage, slot, owner]) => {
    const t = { id, x, y, kind, level, owner: owner === undefined ? o : owner, fresh: !!fresh, kills, damage };
    if (fresh && slot !== null) t.slot = slot;
    return t;
  });
}

const sameIds = (a, b) => a.length === b.length && a.every((t, i) => t.id === b[i].id);

function packView(view) {
  const out = { ...view, wire: WIRE_VERSION, towers: packTowers(view.towers), path: view.path.flatMap(c => [c.x, c.y]) };
  if (view.me) {
    // 塔的 id 全局唯一：id 序列相同就是同一張地圖、內容也相同
    out.me = { ...view.me, towers: sameIds(view.me.towers, view.towers) ? 0 : packTowers(view.me.towers) };
  }
  if (view.relay) {
    out.relay = { ...view.relay, zones: view.relay.zones.map(z => (z.id === view.watching ? { ...z, towers: null, path: null } : z)) };
  }
  return out;
}

function unpackView(packed) {
  if (packed?.wire !== WIRE_VERSION) return packed;
  const { wire, ...view } = packed;
  void wire;
  view.towers = unpackTowers(packed.towers);
  const flat = packed.path;
  view.path = Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[i * 2], y: flat[i * 2 + 1] }));
  if (view.me) view.me = { ...view.me, towers: view.me.towers === 0 ? view.towers : unpackTowers(view.me.towers) };
  if (view.relay) {
    const compact = view.towers.map(t => [t.id, t.x, t.y, t.kind, t.level, t.fresh ? 1 : 0, t.kills]);
    view.relay = { ...view.relay, zones: view.relay.zones.map(z => (z.towers === null ? { ...z, towers: compact, path: flat } : z)) };
  }
  return view;
}

module.exports = { WIRE_VERSION, packView, unpackView };
