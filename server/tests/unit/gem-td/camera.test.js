'use strict';
// 前端相機純函式（vue-app 是 ESM、沒有自己的測試框架，這裡用動態 import 載入）
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

let Cam;
before(async () => {
  Cam = await import(pathToFileURL(path.join(__dirname, '../../../../vue-app/src/apps/gem-td/composables/useGemCamera.js')).href);
});

const board = { width: 40, height: 40 };
const VIEW = 800; // 每格 20px（zoom 1）
const zoomed = z => Cam.zoomAt(Cam.createCamera(), z, 0, 0, board, VIEW);

test('normalizePoint：只收有限數字，其餘 null', () => {
  assert.deepEqual(Cam.normalizePoint({ x: 3, y: '4.5' }), { x: 3, y: 4.5 });
  for (const bad of [null, undefined, {}, { x: NaN, y: 1 }, { x: 1, y: Infinity }, { x: 'a', y: 1 }, 5]) assert.equal(Cam.normalizePoint(bad), null);
});

test('cellToScreen 與 screenToCell 互為反向', () => {
  const cam = Cam.centerOn(zoomed(3), 10, 12, board, VIEW);
  const p = Cam.cellToScreen(cam, 10.5, 12.5, board, VIEW);
  assert.deepEqual(Cam.screenToCell(cam, p, board, VIEW), { x: 10, y: 12 });
});

test('offscreenMarker：看全圖時永遠在畫面內，不出箭頭', () => {
  assert.equal(Cam.offscreenMarker(Cam.createCamera(), { x: 0.5, y: 0.5 }, board, VIEW), null);
  assert.equal(Cam.offscreenMarker(Cam.createCamera(), { x: 39.5, y: 39.5 }, board, VIEW), null);
});

test('offscreenMarker：放大後目標在畫面內不出箭頭，置中時一定在內', () => {
  const cam = Cam.centerOn(zoomed(4), 20, 20, board, VIEW);
  assert.equal(Cam.offscreenMarker(cam, { x: 20.5, y: 20.5 }, board, VIEW), null);
  assert.equal(Cam.offscreenMarker(cam, { x: 21, y: 21 }, board, VIEW), null);
});

test('offscreenMarker：目標在畫面外 → 箭頭貼邊、指向目標、帶距離', () => {
  const cam = Cam.centerOn(zoomed(4), 30, 30, board, VIEW); // 看右下角
  const m = Cam.offscreenMarker(cam, { x: 2.5, y: 2.5 }, board, VIEW, { inset: 30 });
  assert.ok(m);
  assert.ok(m.x >= 30 - 1e-6 && m.x <= VIEW - 30 + 1e-6 && m.y >= 30 - 1e-6 && m.y <= VIEW - 30 + 1e-6, '在邊緣內縮範圍');
  assert.ok(Math.abs(m.x - 30) < 1e-6 || Math.abs(m.y - 30) < 1e-6 || Math.abs(m.x - (VIEW - 30)) < 1e-6 || Math.abs(m.y - (VIEW - 30)) < 1e-6, '貼著邊');
  assert.ok(m.angle < -Math.PI / 2 && m.angle > -Math.PI, '指向左上');
  assert.ok(m.distance > 20, `離畫面中心很遠 (${m.distance})`);
  // 正左方：箭頭貼左邊、角度 π
  const left = Cam.offscreenMarker(Cam.centerOn(zoomed(4), 30, 20, board, VIEW), { x: 5.5, y: 20 }, board, VIEW, { inset: 30 });
  assert.ok(Math.abs(left.x - 30) < 1e-6 && Math.abs(left.y - VIEW / 2) < 1e-6);
  assert.ok(Math.abs(Math.abs(left.angle) - Math.PI) < 1e-6);
});

test('offscreenMarker：輸入不正確回傳 null，不丟例外', () => {
  const cam = zoomed(3);
  assert.equal(Cam.offscreenMarker(cam, null, board, VIEW), null);
  assert.equal(Cam.offscreenMarker(cam, { x: NaN, y: 1 }, board, VIEW), null);
  assert.equal(Cam.offscreenMarker(cam, { x: 1, y: 1 }, board, 0), null);
});

test('followToward：逐幀靠近置中、到位後不抖動、範圍照常夾住', () => {
  let cam = zoomed(4);
  const target = { x: 30.5, y: 25.5 };
  const goal = Cam.centerOn(cam, target.x, target.y, board, VIEW);
  let last = Infinity;
  for (let i = 0; i < 80; i++) {
    cam = Cam.followToward(cam, target, board, VIEW, 0.25);
    const d = Math.hypot(goal.panX - cam.panX, goal.panY - cam.panY);
    assert.ok(d <= last + 1e-9, '每幀只會更近');
    last = d;
  }
  assert.deepEqual(cam, goal);
  assert.deepEqual(Cam.followToward(cam, target, board, VIEW, 0.25), goal, '到位後再走一步不變');
  // 地圖邊緣：置中被夾住
  const edge = Cam.followToward(zoomed(4), { x: 0.5, y: 0.5 }, board, VIEW, 1);
  assert.equal(edge.panX, 0);
  assert.equal(edge.panY, 0);
  // 壞輸入：原樣回傳
  const same = zoomed(2);
  assert.equal(Cam.followToward(same, { x: NaN, y: 0 }, board, VIEW), same);
});

test('控制器：followToward 會觸發 onChange，centerOn 之後在畫面內', () => {
  let changes = 0;
  const ctl = Cam.createCameraController({ ctx: () => ({ board, viewSize: VIEW }), onChange: () => { changes++; } });
  ctl.zoomBy(3);
  const before = changes;
  ctl.followToward({ x: 35, y: 35 }, 1);
  assert.ok(changes > before);
  assert.equal(Cam.offscreenMarker(ctl.camera, { x: 35, y: 35 }, board, VIEW), null);
});
