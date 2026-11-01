# 甜甜的小秘密 — Vue 3 前端

多人互動工具平台的前端，收錄多款小遊戲與生活工具。目錄規範見 [`../docs/STRUCTURE.md`](../docs/STRUCTURE.md)。

## 技術棧

| 層級 | 技術 |
|------|------|
| 框架 | Vue 3 + Vite |
| 樣式 | Tailwind CSS 4（`@tailwindcss/vite`）+ Reka UI（headless 元件） |
| 路由 | Vue Router 4（Hash mode） |
| 即時通訊 | Socket.io-client |
| 資料庫 | Supabase JS |
| PWA | vite-plugin-pwa |
| 部署 | GitHub Pages |

## 專案結構

```
src/
├── apps/                  ← 各 App 自包含（pages / components / composables / data）
│   ├── portal/            ← 平台入口，工具清單在 data/tools.js
│   ├── know-me/           ← 懂我再說（含 /admin 題庫管理）
│   ├── dinner-picker/  dinner-invite/  topic-generator/  gender-score/  story-canvas/
│   ├── character-storm/   ← 默契字囊團：字元風暴
│   ├── mountain-lodge/    ← 山中別館殺人事件
│   └── clocktower/        ← 血染鐘樓
├── shared/                ← 跨 App 共用（api/config、identity、useRoom、RoomPlayerPanel、遊戲說明、PwaPrompt）
├── router/index.js        ← 路由設定（唯一可 import 所有 App pages 的地方）
├── assets/main.css        ← Tailwind 入口：@theme token + @layer components
├── App.vue                ← 根元件（只放 <RouterView />）
└── main.js
```

規則：App 之間禁止互相 import；樣式一律 Tailwind utility，不使用 `<style scoped>`（詳見 STRUCTURE.md）。

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

> 後端（`../server/`）維持部署於 Render，不受影響。

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
  shared/composables/useRoom.js 等 ←── Socket.io ──→  Node.js + Express (Render)
  apps/know-me/data/db.js       ←── REST ────────→  Supabase PostgreSQL
```

- **路由**：Hash mode（`/#/`、`/#/room`），無需 server 端設定即可在 GitHub Pages 運作
- **Socket 狀態**：各 App 的 composable 維護 reactive 狀態；房間邏輯共用 `shared/composables/useRoom.js`
- **環境變數**：所有設定透過 `VITE_*` 注入，不寫死在程式碼
