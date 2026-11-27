'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { appendPlaytest } = require('../../../gem-td/playtestLog');

test('試玩紀錄檔：一局一行 JSON，附加寫入，資料夾不存在會建', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-playtest-'));
  const file = path.join(dir, 'sub', 'p.jsonl');
  assert.equal(appendPlaytest({ schema: 1, wave: 3 }, file), true);
  assert.equal(appendPlaytest({ schema: 1, wave: 7 }, file), true);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.deepEqual(lines.map(l => l.wave), [3, 7]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('試玩紀錄檔：寫不進去只回 false，不丟例外', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-playtest-'));
  assert.equal(appendPlaytest({ a: 1 }, dir), false); // 目標是資料夾
  fs.rmSync(dir, { recursive: true, force: true });
});
