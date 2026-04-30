# 甜甜的小秘密 — 專案結構規範

> 本文件是所有開發者（與 AI Agent）必須遵守的結構規範。
> 每次新增 App、元件或資料時，請先確認符合本規範再動手。

---

## Mono-repo 根目錄

```
testdemo/                          ← 專案根目錄
├── vue-app/                       ← Vue 3 前端（唯一前端入口）
├── server/                        ← Node.js + Socket.io 後端
├── docs/                          ← 設計文件、構想筆記
├── admin.html                     ← 題庫管理（待遷移至 Vue）
├── logo.svg                       ← 品牌 Logo
├── README.md                      ← 專案說明
└── STRUCTURE.md                   ← 本規範文件（你在這裡）
```

### 根目錄規則
- **禁止** 在根目錄直接放 HTML / CSS / JS 業務邏輯檔案（歷史殘留已清除）
- 前端所有實作統一在 `vue-app/`
- 後端所有實作統一在 `server/`

---

## Vue 前端結構（`vue-app/src/`）

### 目標結構（需遷移完成）

```
vue-app/src/
│
├── apps/                          ← 各 App 自包含目錄（核心規則）
│   │
│   ├── know-me/                   ← App: 懂我再說
│   │   ├── pages/                 ← 該 App 的頁面元件
│   │   ├── components/            ← 該 App 專屬 UI 元件
│   │   ├── composables/           ← 該 App 專屬 composable（如 useSocket.js）
│   │   └── data/                  ← 該 App 專屬靜態資料
│   │
│   ├── dinner-picker/             ← App: 今晚吃什麼
│   │   └── pages/
│   │       └── DinnerPickerPage.vue
│   │
│   └── [未來新 App slug]/          ← 遵循相同結構
│       ├── pages/
│       ├── components/
│       ├── composables/
│       └── data/
│
├── portal/                        ← 平台入口（甜甜的小秘密首頁）
│   ├── pages/
│   │   └── PortalPage.vue
│   └── components/
│       └── ToolCard.vue
│
├── shared/                        ← 跨 App 共用邏輯
│   └── data/
│       ├── identity.js            ← localStorage UUID / 暱稱管理
│       ├── db.js                  ← Supabase client
│       └── tools.js               ← 所有工具清單（入口資料源）
│
├── router/
│   └── index.js                   ← 路由設定（import 指向 apps/ 或 portal/）
├── assets/
│   └── style.css                  ← 全域樣式
├── App.vue                        ← 根元件（只放 <RouterView />）
└── main.js                        ← app 初始化
```

---

## App 命名規範

| 項目 | 規則 | 範例 |
|------|------|------|
| **目錄名稱** | kebab-case，和 `tools.js` 的 `id` 一致 | `know-me`、`dinner-picker` |
| **路由 path** | 和目錄名稱一致 | `/game`（懂我再說例外，已建立）|
| **Page 元件** | PascalCase + `Page` 結尾 | `IndexPage.vue`、`RoomPage.vue` |
| **元件** | PascalCase + 功能描述 | `AnswerSection.vue`、`PlayerList.vue` |
| **Composable** | camelCase + `use` 前綴 | `useSocket.js`、`useGeolocation.js` |
| **資料檔** | camelCase | `questions.js`、`tools.js` |

---

## Import 依賴規則

```
┌─────────────────────────────────┐
│           apps/know-me/         │──→ shared/    ✅
│           apps/dinner-picker/   │──→ shared/    ✅
│           portal/               │──→ shared/    ✅
│                                 │
│  apps/know-me → apps/dinner-    │              ❌ 禁止跨 App import
│  picker                         │
└─────────────────────────────────┘
```

### Always（一律遵守）
- App 專屬邏輯放在 `apps/[slug]/` 內，不外洩
- 跨 App 共用邏輯放在 `shared/`
- `router/index.js` 是唯一可以 import 所有 App pages 的地方
- 每個 App 必須在 `shared/data/tools.js` 登記一筆資料

### Ask First（需先討論）
- 新增一個被多個 App 依賴的 `shared/` composable
- 修改 `shared/data/db.js` 或 `shared/data/identity.js`
- 調整路由結構

### Never（禁止）
- App 之間互相 import（`know-me` 引用 `dinner-picker` 的元件）
- 在 `App.vue` 放業務邏輯（只允許 `<RouterView />`）
- 在根目錄放前端 HTML / JS / CSS 業務邏輯檔案
- 將 API Key / 環境變數寫死在程式碼中（一律用 `VITE_*` 環境變數）

---

## 新增 App 標準流程

當需要新增第三個（或更多）App 時，按以下步驟執行：

### Step 1：在 `apps/` 建立目錄

```
apps/
└── my-new-app/           ← slug，kebab-case
    ├── pages/
    │   └── MyNewAppPage.vue
    ├── components/        ← 如有專屬元件
    ├── composables/       ← 如有專屬 composable
    └── data/              ← 如有專屬靜態資料
```

### Step 2：在 `shared/data/tools.js` 登記

```js
{
  id: 'my-new-app',           // 必須和目錄名稱一致
  name: '工具名稱',
  tagline: '一句話副標（15字以內）',
  description: '說明文字（30字以內）',
  emoji: '🎯',
  color: 'blue',              // purple | rose | blue | cyan | orange
  route: '/my-new-app',
  externalUrl: null,
  status: 'coming-soon',      // 上線前先設 coming-soon
  tags: ['標籤'],
}
```

### Step 3：在 `router/index.js` 新增路由

```js
import MyNewAppPage from '../apps/my-new-app/pages/MyNewAppPage.vue'

{ path: '/my-new-app', name: 'my-new-app', component: MyNewAppPage }
```

### Step 4：開發完成後將 status 改為 `'live'`

---

## 後端結構（`server/`）

```
server/
├── server.js              ← Express + Socket.io 主程式
├── package.json
├── railway.json           ← Railway 部署設定
└── README.md
```

- 目前後端只服務「懂我再說」的 Socket.io 即時通訊
- 「今晚吃什麼」為純前端，不經過此 server
- 未來若新 App 需要後端，優先評估能否在同一 `server.js` 加 namespace，避免多 server 管理成本

---

## 環境變數規範

所有敏感設定透過環境變數注入，永遠不寫死在程式碼中。

```env
# vue-app/.env（本地開發用，不 commit）
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_SOCKET_URL=http://localhost:3000
```

- `.env` 已在 `.gitignore` 中，commit 時只帶 `.env.example`
- 新增環境變數時，同步更新 `.env.example`

---

## 目前 App 清單

| slug | 名稱 | 狀態 | 路由 |
|------|------|------|------|
| `know-me` | 懂我再說 | 🟢 live | `/game`, `/room` |
| `dinner-picker` | 今晚吃什麼 | 🟢 live | `/dinner-picker` |
| `topic-generator` | 話題產生器 | 🟢 live | `/topic-generator` |

---

## 待辦（尚未完成的遷移）

- [ ] `vue-app/src/` 內部按本規範完成目錄重構（將 pages/components/composables/data 移入對應 `apps/` 目錄）
- [ ] `admin.html`（題庫管理）遷移至 Vue，放入 `apps/know-me/pages/AdminPage.vue`

---

*最後更新：2026-04-30*
