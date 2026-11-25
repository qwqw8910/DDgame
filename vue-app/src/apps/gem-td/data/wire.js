// gt:state 的傳輸格式解碼：伺服器 server/gem-td/wire.js 的 packView 會把塔的清單壓成陣列、去掉重複，
// 這裡還原成 buildView 原本的樣子，元件照舊讀 view.towers / me.towers / relay.zones[].towers。
// 兩邊要一起改。

export const WIRE_VERSION = 1 // 連線時放在 auth.gtWire，告訴伺服器看得懂這個格式

// [id, x, y, kind, level, fresh, kills, damage, slot, owner?]
function unpackTowers({ o, r }) {
  return r.map(([id, x, y, kind, level, fresh, kills, damage, slot, owner]) => {
    const t = { id, x, y, kind, level, owner: owner === undefined ? o : owner, fresh: !!fresh, kills, damage }
    if (fresh && slot !== null) t.slot = slot
    return t
  })
}

export function unpackView(packed) {
  if (packed?.wire !== WIRE_VERSION) return packed
  const { wire, ...view } = packed
  void wire
  view.towers = unpackTowers(packed.towers)
  const flat = packed.path
  view.path = Array.from({ length: flat.length / 2 }, (_, i) => ({ x: flat[i * 2], y: flat[i * 2 + 1] }))
  if (view.me) view.me = { ...view.me, towers: view.me.towers === 0 ? view.towers : unpackTowers(view.me.towers) }
  if (view.relay) {
    const compact = view.towers.map(t => [t.id, t.x, t.y, t.kind, t.level, t.fresh ? 1 : 0, t.kills])
    view.relay = { ...view.relay, zones: view.relay.zones.map(z => (z.towers === null ? { ...z, towers: compact, path: flat } : z)) }
  }
  return view
}
