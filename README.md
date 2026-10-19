# 甜甜的小秘密

多人互動工具平台，收錄多款小遊戲與生活工具，和朋友一起玩。

## 專案結構

```
vue-app/   ← Vue 3 + Tailwind 4 前端（GitHub Pages）  → vue-app/README.md
server/    ← Node.js + Socket.io 後端（Railway）      → server/README.md
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
| 山中別館殺人事件 | 傳牌、說謊、推理 | beta |
| 血染鐘樓 | 真人說書人的線上魔典 | beta |

## 近期更新

- 新增 PWA 支援（可安裝、更新提示）。
- 新增「血染鐘樓」與「山中別館殺人事件」。
- 前端全面改用 Tailwind CSS 4 + Reka UI，`vue-app/src/` 依 `docs/STRUCTURE.md` 重構為 `apps/`；題庫管理後台遷入 Vue（`/admin`）。
- 字元風暴房間頁 UX 強化、角色辨識與提示提交流程修正、新增音效管理。
