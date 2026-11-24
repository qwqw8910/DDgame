// ================================================================
//  環形接力排版（橫排）— 單元測試
//  執行（在 server/ 下）：node --test tests/unit/gem-td/ringLayout.test.js
// ================================================================
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ringLayout, pointAt } = require('../../../gem-td/ringLayout');
const C = require('../../../gem-td/config');

test('區域數 1：沒有傳送線，區域在原點', () => {
  const layout = ringLayout(1);
  assert.equal(layout.conveyors.length, 0);
  assert.equal(layout.zones.length, 1);
  assert.equal(layout.zones[0].cx, 0);
});

for (let n = 2; n <= C.MAX_ZONES; n++) {
  test(`區域數 ${n}：由左到右橫排、等距、不重疊，畫面範圍包住全部`, () => {
    const layout = ringLayout(n);
    assert.equal(layout.zones.length, n);
    for (let i = 0; i < n; i++) {
      const z = layout.zones[i];
      assert.equal(z.cy, 0);
      assert.ok(z.origin.x >= layout.bounds.minX && z.origin.x + layout.size <= layout.bounds.maxX);
      if (i) {
        const prev = layout.zones[i - 1];
        assert.ok(Math.abs(z.cx - prev.cx - layout.pitch) < 0.02, '等距');
        assert.ok(z.origin.x - (prev.origin.x + layout.size) >= C.RELAY_ZONE_GAP - 0.02, '區與區之間有間距');
      }
    }
  });

  test(`區域數 ${n}：每區的出口對到下一區入口，最後一區回到第一區`, () => {
    const layout = ringLayout(n);
    assert.equal(layout.conveyors.length, n);
    layout.conveyors.forEach((c, i) => {
      assert.equal(c.from, i);
      assert.equal(c.to, (i + 1) % n);
      const exit = layout.zones[c.from].origin;
      const entry = layout.zones[c.to].origin;
      const r2 = v => Math.round(v * 100) / 100;
      assert.deepEqual(c.points[0], [exit.x + layout.size - 3 + 0.5, exit.y + layout.size - 3 + 0.5].map(r2));
      assert.deepEqual(c.points.at(-1), [entry.x + 2.5, entry.y + 2.5].map(r2));
      assert.ok(c.length > 0);
    });
  });
}

test('pointAt 沿線段取點，超出範圍停在兩端', () => {
  const c = ringLayout(3).conveyors[0];
  assert.deepEqual(pointAt(c, -5), { x: c.points[0][0], y: c.points[0][1] });
  const end = c.points.at(-1);
  assert.deepEqual(pointAt(c, c.length + 5), { x: end[0], y: end[1] });
  const mid = pointAt(c, c.length / 2);
  assert.ok(Number.isFinite(mid.x) && Number.isFinite(mid.y));
});
