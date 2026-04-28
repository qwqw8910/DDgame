# 懂我再說 — Vue 3 前端

# Terminal 1：後端
cd server && node server.js

# Terminal 2：Vue 前端
cd vue-app && npm run dev

多人互動網頁遊戲「懂我再說」的 Vue 3 版本前端。

## 技術棧

| 層級 | 技術 |
|------|------|
| 框架 | Vue 3 + Vite |
| 路由 | Vue Router 4（Hash mode） |
| 即時通訊 | Socket.io-client |
| 資料庫 | Supabase JS |
| 部署 | GitHub Pages |

## 專案結構

```
src/
├── pages/
│   ├── IndexPage.vue       ← 首頁：建立 / 加入房間
│   └── RoomPage.vue        ← 房間主控制器
├── components/
│   ├── PlayerList.vue      ← 玩家列表
│   ├── ChoiceCards.vue     ← A/B 選擇卡片
│   ├── LobbySection.vue    ← 大廳畫面
│   ├── TopicSection.vue    ← 選主題畫面
│   ├── PreviewSection.vue  ← 換題預覽畫面
│   ├── AnswerSection.vue   ← 被猜者選答畫面
│   ├── GuessSection.vue    ← 猜測畫面
│   ├── RevealSection.vue   ← 揭曉結果畫面
│   └── FinishedSection.vue ← 遊戲結束排行
├── composables/
│   └── useSocket.js        ← Socket.io 全域狀態與所有遊戲動作
├── data/
│   ├── identity.js         ← localStorage UUID / 暱稱管理
│   ├── questions.js        ← 主題 UI 映射（emoji / 漸層）
│   └── db.js               ← Supabase client（建立/查詢房間）
└── router/index.js         ← Vue Router 路由設定
```

## 環境變數

複製 `.env.example` 為 `.env` 並填入：

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SOCKET_URL=http://localhost:3000
```

## 本機開發

```bash
# Terminal 1：啟動後端
cd ../server
node server.js          # http://localhost:3000

# Terminal 2：啟動 Vue 前端
npm run dev             # http://localhost:5173
```

## 建置與部署

```bash
npm run build           # 產生 dist/
```

### 部署到 GitHub Pages

1. `vite.config.js` 已設定：
   ```js
   base: '/DDgame/'
   ```
2. 將 `dist/` 內容推送到 `gh-pages` branch，或使用 GitHub Actions 自動部署。

   GitHub Repo：https://github.com/qwqw8910/DDgame

> 後端（`../server/`）維持部署於 Railway / Render，不受影響。

## 架構說明

```
Vue 前端 (GitHub Pages)
  useSocket.js  ←──── Socket.io ────→  Node.js + Express (Railway)
  db.js         ←──── REST ─────────→  Supabase PostgreSQL
```

- **路由**：Hash mode（`/#/`、`/#/room`），無需 server 端設定即可在 GitHub Pages 運作
- **Socket 狀態**：`useSocket.js` 維護全域 reactive 狀態，所有元件透過 composable 共享
- **環境變數**：所有敏感設定透過 `VITE_*` 環境變數注入，不寫死在程式碼
