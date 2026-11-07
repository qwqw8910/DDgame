# 後端測試

所有後端測試都放在這裡，不放進遊戲模組資料夾。使用 Node 內建的 `node:test`，不需要另外安裝測試框架（需要 Node 21 以上，`npm test` 用到 glob）。

```
tests/
├── unit/<模組>/<被測檔>.test.js   ← 單元測試：只測純函式，不開 server、不連 DB
├── integration/<模組>.test.js     ← 整合測試：在記憶體開 Socket.io server + client，用假的 DB
└── manual/                        ← 手動腳本：要先啟動真的 server、要真的 Supabase，不會被 npm test 跑到
```

`<模組>` 和 `server/` 底下的資料夾同名（`room`、`same-word`、`gem-td`…）。

## 執行

在 `server/` 下執行：

```bash
npm test                    # 全部（先單元，後整合）
npm run test:unit
npm run test:integration    # 一次跑一個檔案，跑完強制結束（socket 計時器不會讓程序卡住）
node --test tests/unit/gem-td/gameLogic.test.js        # 單一檔案
node --test --test-force-exit tests/integration/room.test.js
```

## 新增測試

- 新遊戲模組 `server/<模組>/`：
  - 規則純邏輯 `gameLogic.js` → `tests/unit/<模組>/gameLogic.test.js`
  - Socket 事件流程 → `tests/integration/<模組>.test.js`，參考 `integration/same-word.test.js` 的寫法（`listen(0)` 取隨機 port，DB 用假的物件）
- 被測模組的路徑：單元測試用 `require('../../../<模組>/gameLogic')`，整合測試用 `require('../../<模組>/index')`。
- 放進對應資料夾就會自動被 `npm test` 跑到，不需要改 `package.json`。
- 不要依賴真的 Supabase 或 `.env`。需要真環境的流程放 `manual/`。

## 已知問題

`integration/room.test.js` 偶爾會出現 `waitFor("connect") timeout`，每次失敗的子測試不一樣，重跑通常會過。這個問題在測試搬到這裡之前就存在。
