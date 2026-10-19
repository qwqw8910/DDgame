# DDgame 支援 PWA（任務）

> 狀態：待實作（2026-10-19 建立）
> 關聯：[bill-splitter.md](bill-splitter.md) 第 8、13.5 節。拆帳系統的 PWA 功能依賴本任務，本任務不依賴拆帳。

## 1. 目標

讓 DDgame 整站可被「安裝到主畫面」，開啟時為全螢幕（standalone），並且**不改變任何現有遊戲的行為**。

## 2. 現況

| 項目 | 現況 |
|---|---|
| 框架 | Vue 3 + Vite 8 + Tailwind 4，`vue-app/` |
| 路由 | Hash mode，所有頁面路徑皆為 `/DDgame/`（同一個 PWA scope） |
| 部署 | GitHub Pages，`base: '/DDgame/'`，由 `.github/workflows/deploy.yml` 建置 `vue-app/dist` |
| `public/` | 只有 `favicon.svg`、`icons.svg`、`mountain-lodge/` |
| `index.html` | 無 manifest、無 theme-color、viewport 無 `viewport-fit=cover` |
| 即時連線 | 其他遊戲用 Socket.io（`VITE_SOCKET_URL`）；`know-me` 用 Supabase |

## 3. 範圍決策

- **整站可安裝**：因為 Hash 路由讓所有頁面共用一個 scope，無法只讓單一工具成為獨立 App
- **Service Worker 採保守策略**：只快取自家靜態檔案，**不攔截** Socket.io、Supabase、任何跨來源請求
- 各工具若需要自己的圖示或啟動頁（如拆帳的 `#/split`），之後在其任務內處理，本任務只提供基礎

## 4. 實作項目

### 4.1 安裝 `vite-plugin-pwa`

- `npm i -D vite-plugin-pwa`，加入 `vite.config.js` 的 `plugins`
- 模式：`registerType: 'prompt'`（有新版本時提示使用者，不自動重新整理，避免打斷遊戲中的玩家）
- 確認 `base: '/DDgame/'` 下，Service Worker 註冊路徑與 scope 皆為 `/DDgame/`

### 4.2 Manifest

```js
manifest: {
  name: '甜甜的小秘密',
  short_name: '甜甜小秘密',
  description: '多人互動小遊戲與日常工具',
  lang: 'zh-TW',
  start_url: '/DDgame/',
  scope: '/DDgame/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0a0a1a',
  theme_color: '#0a0a1a',
  icons: [
    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
    { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
```

- `orientation: 'portrait'` 是否鎖定需確認：血染鐘樓圓桌或故事關係圖在橫向可能更好用，**建議不鎖**，此處移除或改為 `any`
- 淺色主題下的 `theme_color` 無法靠 manifest 動態切換，先採深色，之後可用 `<meta name="theme-color">` 動態更新

### 4.3 圖示素材

- 需要一張 **512×512 原圖**（正方形、四周留約 10% 安全邊距，供 maskable 裁切）
- 產生：`pwa-192x192.png`、`pwa-512x512.png`、`pwa-maskable-512x512.png`、`apple-touch-icon.png`（180×180）
- 可用 `@vite-pwa/assets-generator` 從單一 SVG 產出；目前 `public/favicon.svg` 可暫作來源
- **待使用者提供正式圖示**；未提供前使用佔位圖示並在 PR／文件註明

### 4.4 `index.html` 調整

- `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">`
- `<meta name="theme-color" content="#0a0a1a">`
- `<link rel="apple-touch-icon" href="/DDgame/apple-touch-icon.png">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-title" content="甜甜小秘密">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`（採用後需檢查頂部是否被狀態列遮住，必要時在 `main.css` 補 `env(safe-area-inset-top)`）

### 4.5 Service Worker 快取規則（Workbox）

| 請求 | 策略 |
|---|---|
| 建置產生的 JS／CSS／圖片（有 hash 檔名） | precache（隨版本更新） |
| `index.html`（導覽請求） | NetworkFirst，離線才用快取，避免卡舊版 |
| Google Fonts（`fonts.googleapis.com`、`fonts.gstatic.com`） | StaleWhileRevalidate，限制數量與天數 |
| Socket.io（`/socket.io/`）與 `VITE_SOCKET_URL` 來源 | **不處理**（NetworkOnly 或不註冊 route） |
| Supabase（`*.supabase.co`） | **不處理** |
| 其他跨來源請求 | 不處理 |

- `navigateFallbackDenylist` 排除 `/socket.io/`
- 不快取 API 回應，避免遊戲狀態或房間資料過期
- `mountain-lodge/` 的音效等大型資源：先不 precache（避免首次安裝下載量暴增），改用 runtime cache 並設上限

### 4.6 更新提示與安裝按鈕

- **更新提示**：偵測到新版 Service Worker 時顯示 Toast「有新版本，點此更新」，點擊後 `updateSW(true)` 並重新整理；遊戲進行中不自動更新
- **安裝元件** `PwaInstallButton.vue`（`src/shared/components/`）：
  - Android／桌面 Chrome：攔截 `beforeinstallprompt`，按鈕觸發 `prompt()`
  - iOS Safari：偵測後顯示引導：「分享 → 加入主畫面」
  - 已以 standalone 開啟（`display-mode: standalone` 或 `navigator.standalone`）時隱藏
  - 使用者按「不用了」後記住（`localStorage`，包 try/catch），一段時間內不再打擾
- 放置位置：Portal 首頁頁尾或設定區；**不放進遊戲房間**，避免干擾
- 之後各工具（如拆帳）可重用同一個元件

### 4.7 部署

- `deploy.yml` 的建置步驟不需改動，`vite build` 會輸出 `sw.js`、`manifest.webmanifest`、`workbox-*.js` 到 `dist/`
- GitHub Pages 為 HTTPS，符合 Service Worker 要求
- 確認 `dist/` 內 `sw.js` 路徑為 `/DDgame/sw.js`，且回應標頭不被長期快取（GitHub Pages 預設約 10 分鐘，可接受）

## 5. 驗收標準

- [ ] `npm run build` 成功，`dist/` 含 `manifest.webmanifest` 與 `sw.js`
- [ ] Chrome DevTools → Application：Manifest 無錯誤、Service Worker 已啟用、可通過「可安裝」檢查
- [ ] Android Chrome 可安裝，開啟為全螢幕且從 `/DDgame/` 啟動
- [ ] iOS Safari 可「加入主畫面」，圖示與名稱正確
- [ ] 安裝後各遊戲（懂我再說、血染鐘樓、山中別館、默契字囊團）建立房間、加入、即時同步**行為與未安裝時一致**
- [ ] Socket.io 連線與 Supabase 請求未被 Service Worker 攔截（DevTools Network 中無 "from ServiceWorker"）
- [ ] 發布新版後，已安裝的使用者會看到更新提示，點擊後取得新版；不會卡在舊版
- [ ] 離線開啟時顯示 App 外殼，不是瀏覽器錯誤頁（遊戲功能本身不要求離線可用）
- [ ] Lighthouse PWA 檢查通過
- [ ] 淺色／深色主題切換不受影響

## 6. 風險與注意事項

| 風險 | 對策 |
|---|---|
| Service Worker 快取到舊版，使用者看不到更新 | `registerType: 'prompt'`；`index.html` 用 NetworkFirst；每次部署檢查 hash 檔名是否變動 |
| 攔截到 Socket.io 導致連線異常 | 明確排除 `/socket.io/` 與後端來源；驗收時逐一測試各遊戲 |
| precache 過大，首次安裝慢、佔空間 | 排除 `mountain-lodge/` 大型資源與非必要圖片；檢查 precache 清單大小 |
| iOS 狀態列遮住頂部 | 使用 `viewport-fit=cover` 搭配 `safe-area-inset-top`，實機測試 |
| 安裝後無法自動移除圖示 | 網頁沒有解除安裝 API；文件與提示中說明需手動長按移除 |
| 全站安裝，使用者以為只有單一遊戲 | 名稱使用整站名稱「甜甜的小秘密」；各工具另行處理自己的入口 |
| 開發環境 Service Worker 干擾 | `devOptions.enabled` 預設關閉；除錯時才開啟 |

## 7. 之後的延伸（不屬於本任務）

- 拆帳等工具專屬的啟動頁與名稱（`start_url` 指向 `#/split`）
- Background Sync（Android）：拆帳「待送出」離線補送
- 推播通知
- 離線可玩的單人工具（如今晚吃什麼）

## 8. 待確認

- [ ] 是否鎖定直向（建議不鎖）
- [ ] 正式圖示素材由誰提供、何時提供
- [ ] 安裝按鈕放置位置（建議 Portal 首頁）
- [ ] 是否要在 `localStorage` 記錄使用者拒絕安裝的時間，以及多久後再提示
