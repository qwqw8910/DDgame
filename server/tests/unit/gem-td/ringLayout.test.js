// ================================================================
//  環形接力排版 — 單元測試
//  執行（在 server/ 下）：node --test tests/unit/gem-td/ringLayout.test.js
// ================================================================
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ringLayout, pointAt } = require('../../../gem-td/ringLayout');
const C = require('../../../gem-td/config');

const rect = (layout, i) => ({ x0: layout.zones[i].origin.x, y0: layout.zones[i].origin.y, x1: layout.zones[i].origin.x + layout.size, y1: layout.zones[i].origin.y + layout.size });
const inside = (r, [x, y]) => x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1;

// 在折線每一段上取密集的取樣點
function sample(points, from = 0, to = points.length - 1, per = 40) {
  const out = [];
  for (let i = from; i < to; i++) {
    for (let k = 0; k <= per; k++) {
      const t = k / per;
      out.push([points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t]);
    }
  }
  return out;
}

test('區域數 1：沒有輸送帶，區域在原點', () => {
  const layout = ringLayout(1);
  assert.equal(layout.conveyors.length, 0);
  assert.equal(layout.zones.length, 1);
  assert.equal(layout.zones[0].cx, 0);
});

for (let n = 2; n <= C.MAX_ZONES; n++) {
  test(`區域數 ${n}：任何兩區都不重疊，相鄰中心距 ≥ 對角線 + 間距`, () => {
    const layout = ringLayout(n);
    const need = layout.diag + C.RELAY_ZONE_GAP - 0.1; // 座標四捨五入的容差
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const d = Math.hypot(layout.zones[i].cx - layout.zones[j].cx, layout.zones[i].cy - layout.zones[j].cy);
      assert.ok(d >= need, `區 ${i}-${j} 中心距 ${d} < ${need}`);
      for (let k = i + 1; k < n; k++) {
        const a = rect(layout, i);
        const b = rect(layout, k);
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        assert.equal(overlap, false, `區 ${i} 與 ${k} 重疊`);
      }
    }
  });

  test(`區域數 ${n}：外圈弧線不穿過任何區域；連接線不穿過別區`, () => {
    const layout = ringLayout(n);
    assert.equal(layout.conveyors.length, n);
    for (const c of layout.conveyors) {
      const arc = sample(c.points, c.arcFrom, c.arcTo);
      for (let z = 0; z < n; z++) {
        const r = rect(layout, z);
        assert.equal(arc.some(p => inside(r, p)), false, `輸送帶 ${c.from}→${c.to} 的弧線穿過區 ${z}`);
        // 連接線允許經過自己的區（出口那段）與目的區（入口那段），不可穿過其他區
        const head = sample(c.points, 0, c.arcFrom);
        const tail = sample(c.points, c.arcTo, c.points.length - 1);
        if (z !== c.from) assert.equal(head.some(p => inside(r, p)), false, `出口連接線 ${c.from}→${c.to} 穿過區 ${z}`);
        if (z !== c.to) assert.equal(tail.some(p => inside(r, p)), false, `入口連接線 ${c.from}→${c.to} 穿過區 ${z}`);
      }
    }
  });

  test(`區域數 ${n}：輸送帶首尾剛好接在出口與下一區入口`, () => {
    const layout = ringLayout(n);
    for (const c of layout.conveyors) {
      const exit = layout.zones[c.from].origin;
      const entry = layout.zones[c.to].origin;
      // 預設出口 (size-3, size-3)、入口 (2, 2)
      assert.deepEqual(c.points[0], [exit.x + layout.size - 3 + 0.5, exit.y + layout.size - 3 + 0.5].map(v => Math.round(v * 100) / 100));
      assert.deepEqual(c.points.at(-1), [entry.x + 2.5, entry.y + 2.5].map(v => Math.round(v * 100) / 100));
      assert.ok(c.length > 0);
    }
  });
}

test('區 1 在正上方，接著順時針', () => {
  const layout = ringLayout(4);
  assert.ok(layout.zones[0].cy < 0 && Math.abs(layout.zones[0].cx) < 0.01);
  assert.ok(layout.zones[1].cx > 0 && Math.abs(layout.zones[1].cy) < 0.01);
  assert.ok(layout.zones[2].cy > 0);
  assert.ok(layout.zones[3].cx < 0);
});

test('pointAt 沿折線取點，超出範圍停在兩端', () => {
  const c = ringLayout(3).conveyors[0];
  assert.deepEqual(pointAt(c, -5), { x: c.points[0][0], y: c.points[0][1] });
  const end = c.points.at(-1);
  assert.deepEqual(pointAt(c, c.length + 5), { x: end[0], y: end[1] });
  const mid = pointAt(c, c.length / 2);
  assert.ok(Number.isFinite(mid.x) && Number.isFinite(mid.y));
});
