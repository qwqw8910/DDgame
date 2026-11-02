# 甜甜的小秘密

多人互動工具平台，收錄多款小遊戲與生活工具，和朋友一起玩。

## 專案結構

```
vue-app/   ← Vue 3 + Tailwind 4 前端（GitHub Pages）  → vue-app/README.md
server/    ← Node.js + Socket.io 後端（Render）      → server/README.md
docs/      ← 設計文件、規格與目錄規範                  → docs/STRUCTURE.md
```

新增 App、元件或資料前，請先閱讀 [`docs/STRUCTURE.md`](docs/STRUCTURE.md)。

## 快速啟動

```bash
npm install                       # 根目錄（concurrently）
npm install --prefix server && npm install --prefix vue-app

npm run dev                       # 一鍵同時啟動前後端
npm run dev:server                # 只啟動後端  http://localhost:3000
npm run dev:web                   # 只啟動前端  http://localhost:5173
```

環境變數見 `server/.env.example`、`vue-app/.env.example`。

## 目前工具

| 工具 | 說明 | 狀態 |
|------|------|------|
| 懂我再說 | 多人互動猜測遊戲 | live |
| 今晚吃什麼 | 附近餐廳隨機抽籤 | live |
| 話題產生器 | 隨機抽出聊天話題 | live |
| 默契字囊團：字元風暴 | 多人提示、字元代換、協力猜題 | live |
| 晚餐邀請選擇器 | 惡搞版晚餐邀請，強迫同意 | live |
| 十分男女 | 抽題、評分、互評（1–10 分） | live |
| 故事關係圖 | 拖拉節點的視覺化故事白板 | live |
| 爬樓梯抽籤 | 阿彌陀籤動畫抽籤，私人結果連結與驗證清單 | live |
| 山中別館殺人事件 | 傳牌、說謊、推理 | beta |
| 血染鐘樓 | 真人說書人的線上魔典 | beta |
| 甜點守衛戰 | 1～4 人塔防：蓋迷宮、合成甜點、守住蛋糕（致敬寶石 TD） | beta |
| 同詞相遇 | 2–12 人同時寫一個詞，依配對輪次排出默契榜 | beta |
| 分帳 | 房間記帳、多種分攤、簡化債務；不用註冊，同名即同人 | beta |

## 各工具技術與文件

多人房間類遊戲共用 `server/room` 房間模組（建房、加入、重連、房主轉移），各遊戲在 `server/<app>/` 以獨立 Socket.io namespace 註冊；前端在 `vue-app/src/apps/<app>/`。

| 工具 | 前端路由 | 後端 | 規格／設計文件 |
|------|----------|------|----------------|
| 懂我再說 | `/game`、`/room` | `server/server.js` | [設計文件](docs/design/終極二選一_設計文件.md) |
| 默契字囊團 | `/character-storm` | `server/character-storm/` | [設計文件](docs/design/默契字囊團_設計文件.md)、[UI 修正規格](docs/character-storm-ui-fixes-spec.md)、[詞庫](docs/character-storm-word-list.md)、[詞庫審查](docs/character-storm-word-audit.md) |
| 山中別館殺人事件 | `/mountain-lodge` | `server/mountain-lodge/` | — |
| 血染鐘樓 | `/clocktower` | `server/clocktower/` | [規格](docs/clocktower-spec.md)（Phase 1、2 已實作，尚未真人多人實測） |
| 甜點守衛戰 | `/gem-td` | `server/gem-td/`（數值在 `config.js`，含平衡模擬） | [規格](docs/gem-td-spec.md)、[美術計畫](docs/gem-td-art-plan.md) |
| 同詞相遇 | `/same-word` | `server/same-word/` | [規格](docs/same-word-spec.md)、[UI／素材／動畫](docs/same-word-ui-assets-animation.md)、[生圖提示詞](docs/same-word-image-prompts.md) |
| 分帳 | `/split-bill` | `server/split-bill/`（Supabase 持久化） | [規格](docs/ideas/split-bill-spec.md) |
| 爬樓梯抽籤 | `/ladder` | 純前端 | — |
| 今晚吃什麼 | `/dinner-picker` | 純前端 | [構想](docs/ideas/dinner-picker.md) |
| 晚餐邀請選擇器 | `/dinner-invite` | 純前端 | [設計文件](docs/design/晚餐邀請選擇器_設計文件.md) |

其他文件：[房間系統統一規範](docs/design/房間系統_統一規範.md)、[房間模組規格](docs/design/房間模組_規格文件.md)、[PWA 構想](docs/ideas/pwa-support.md)、[女巫獵人規格草案（尚未實作）](docs/witch-hunter-spec.md)、[暗號臥底設計文件（草案）](docs/design/暗號臥底_設計文件.md)。

## 近期更新

- 新增「甜點守衛戰」、「同詞相遇」、「分帳」、「爬樓梯抽籤」。
- 新增 PWA 支援（可安裝、更新提示）。
- 新增「血染鐘樓」與「山中別館殺人事件」。
- 前端全面改用 Tailwind CSS 4 + Reka UI，`vue-app/src/` 依 `docs/STRUCTURE.md` 重構為 `apps/`；題庫管理後台遷入 Vue（`/admin`）。
- 字元風暴房間頁 UX 強化、角色辨識與提示提交流程修正、新增音效管理。
