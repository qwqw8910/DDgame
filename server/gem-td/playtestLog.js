'use strict';

// ================================================================
//  合作迷宮試玩紀錄：一局一行 JSON（JSON Lines），附加到
//    server/logs/gem-td-coop-playtest.jsonl
//  路徑可用環境變數 GEM_TD_PLAYTEST_LOG 覆寫。寫檔失敗只記 log，不影響遊戲。
//  紀錄內容由 gameLogic.buildPlaytestRecord 產生（不含暱稱與帳號）。
// ================================================================

const fs = require('fs');
const path = require('path');

const defaultFile = () => process.env.GEM_TD_PLAYTEST_LOG || path.join(__dirname, '..', 'logs', 'gem-td-coop-playtest.jsonl');

function appendPlaytest(record, file = defaultFile()) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`);
    console.log(`[GemTD] coop playtest record → ${file}`);
    return true;
  } catch (err) {
    console.error('[GemTD] playtest log failed:', err.message);
    return false;
  }
}

module.exports = { appendPlaytest, defaultFile };
