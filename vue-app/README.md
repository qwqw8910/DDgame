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

## PWA（可安裝成 App）

使用 `vite-plugin-pwa`（設定在 `vite.config.js`），可「加入主畫面」並以獨立視窗開啟，部分靜態資源可離線載入。

| 項目 | 說明 |
|------|------|
| 更新方式 | `registerType: 'prompt'`：有新版本時顯示提示，由使用者按「更新」才重新載入，不會中斷進行中的遊戲 |
| 快取 | 建置產物 precache；頁面導覽 NetworkFirst；Google Fonts、`mountain-lodge/` 大型資源於使用時才快取 |
| 不快取 | Socket.io、Supabase 與所有 API 請求（遊戲狀態需即時，離線時仍無法進房） |
| 提示元件 | `src/shared/components/PwaPrompt.vue`（更新提示、Android 安裝按鈕、iOS 加入主畫面說明） |
| 圖示 | 來源 `assets-src/pwa-icon.svg`（目前為佔位圖），輸出於 `public/` |

### 測試

開發模式 (`npm run dev`) 不啟用 Service Worker，需用建置版本測試：

```bash
npm run build
npm run preview         # http://localhost:4173/DDgame/
```

Chrome DevTools → Application 檢查 Manifest 與 Service Workers；Network 勾選 Offline 驗證離線。
PWA 實機測試需 HTTPS（`localhost` 除外），建議部署到 GitHub Pages 後測試。

### 更換圖示

替換 `assets-src/pwa-icon.svg`（正方形 512×512，四周留約 10% 安全邊距），再執行：

```bash
npm run generate-pwa-assets
```

產生的 PNG 會輸出到 `assets-src/`，需手動移到 `public/`（`pwa-192x192.png`、`pwa-512x512.png`、`maskable-icon-512x512.png`、`apple-touch-icon-180x180.png`）。

## 架構說明

```
Vue 前端 (GitHub Pages)
  useSocket.js  ←──── Socket.io ────→  Node.js + Express (Railway)
  db.js         ←──── REST ─────────→  Supabase PostgreSQL
```

- **路由**：Hash mode（`/#/`、`/#/room`），無需 server 端設定即可在 GitHub Pages 運作
- **Socket 狀態**：`useSocket.js` 維護全域 reactive 狀態，所有元件透過 composable 共享
- **環境變數**：所有敏感設定透過 `VITE_*` 環境變數注入，不寫死在程式碼
