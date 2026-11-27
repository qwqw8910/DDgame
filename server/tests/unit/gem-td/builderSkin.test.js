'use strict';
// 建造者外觀的像素換色（純函式，前端 ESM 用動態 import 載入）
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

let S;
before(async () => {
  S = await import(pathToFileURL(path.join(__dirname, '../../../../vue-app/src/apps/gem-td/composables/useGemBuilderSkin.js')).href);
});

const RED = { hue: 352, tol: 28, vMin: 0.45 };
const px = (...rgba) => new Uint8ClampedArray(rgba.flat());

test('換色：主色像素變成目標色相，膚色、白、灰、透明不動', () => {
  const data = px([220, 40, 50, 255], [250, 220, 200, 255], [255, 255, 255, 255], [150, 150, 150, 255], [220, 40, 50, 0]);
  const before = [...data];
  const n = S.recolorAccent(data, RED, '#2F7FD1');
  assert.equal(n, 1);
  const { h } = S.rgbToHsv(data[0], data[1], data[2]);
  assert.ok(Math.abs(h - S.rgbToHsv(0x2F, 0x7F, 0xD1).h) < 3, `色相 ${h}`);
  assert.deepEqual([...data].slice(4), before.slice(4), '其餘像素原封不動');
  assert.equal(data[3], 255, '透明度不變');
});

test('換色：保留明暗（深紅換色後仍比亮紅暗）', () => {
  const data = px([230, 40, 50, 255], [120, 20, 25, 255]);
  S.recolorAccent(data, RED, '#2E9E5B');
  const v1 = S.rgbToHsv(data[0], data[1], data[2]).v;
  const v2 = S.rgbToHsv(data[4], data[5], data[6]).v;
  assert.ok(v1 > v2);
});

test('換色：亮度門檻擋掉褐色握把；換成同色幾乎不變；壞輸入不丟例外', () => {
  const ORANGE = { hue: 18, tol: 12, vMin: 0.7 };
  const handle = px([140, 80, 40, 255]);
  assert.equal(S.recolorAccent(handle, ORANGE, '#7C4DCC'), 0);
  const same = px([214, 48, 90, 255]);
  S.recolorAccent(same, { hue: 345, tol: 20, vMin: 0.45 }, '#D6305A');
  assert.ok(Math.abs(same[0] - 214) < 25 && Math.abs(same[1] - 48) < 25 && Math.abs(same[2] - 90) < 25);
  assert.equal(S.recolorAccent(px([220, 40, 50, 255]), RED, 'not-a-color'), 0);
  assert.equal(S.recolorAccent(null, RED, '#2F7FD1'), 0);
  assert.equal(S.recolorAccent(px([1, 2, 3, 255]), null, '#2F7FD1'), 0);
});

test('外觀分配：第 i 位用第 i % 款數 款，負數與壞輸入不出錯', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(i => S.skinIndexOf(i, 5)), [0, 1, 2, 3, 4, 0, 1]);
  assert.equal(S.skinIndexOf(-1, 5), 4);
  assert.equal(S.skinIndexOf(undefined, 5), 0);
});
