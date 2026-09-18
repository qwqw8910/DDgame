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

### 現行結構（2026-09 完成遷移）

Portal 也是一個 app（`apps/portal/`），與其他工具一致，不再另外獨立於 `apps/` 之外——單一模式比「apps/ 用一種規則、portal/ 用另一種」更好維護。

```
vue-app/src/
│
├── apps/                          ← 各 App 自包含目錄（核心規則）
│   │
│   ├── portal/                    ← 平台入口（甜甜的小秘密首頁）
│   │   ├── pages/PortalPage.vue
│   │   ├── components/ToolCard.vue
│   │   └── data/tools.js          ← 所有工具清單（入口資料源）
│   │
│   ├── know-me/                   ← App: 懂我再說（含 AdminPage.vue 題庫管理，路由 /admin，不登記進 tools.js）
│   │   ├── pages/                 ← 該 App 的頁面元件
│   │   ├── components/            ← 該 App 專屬 UI 元件
│   │   ├── composables/           ← 該 App 專屬 composable（如 useSocket.js）
│   │   └── data/                  ← 該 App 專屬靜態資料
│   │
│   ├── dinner-picker/             ← App: 今晚吃什麼
│   ├── dinner-invite/             ← App: 晚餐邀請選擇器
│   ├── topic-generator/           ← App: 話題產生器
│   ├── character-storm/           ← App: 默契傳聲筒：字元風暴
│   ├── gender-score/              ← App: 十分男女
│   ├── story-canvas/              ← App: 故事關係圖
│   │
│   └── [未來新 App slug]/          ← 遵循相同結構
│       ├── pages/
│       ├── components/
│       ├── composables/
│       └── data/
│
├── shared/                        ← 跨 App 共用邏輯（目前被 2 個以上 App 使用才放這裡）
│   ├── data/identity.js           ← localStorage UUID / 暱稱管理
│   ├── composables/useRoom.js     ← Socket.io 房間狀態 composable 基底
│   └── components/RoomPlayerPanel.vue ← 房間玩家清單側欄
│
├── router/
│   └── index.js                   ← 路由設定（import 指向 apps/；AdminPage 用動態 import 獨立打包）
├── assets/
│   └── main.css                   ← Tailwind 4 入口：@theme token + @layer components（見下一節）
├── App.vue                        ← 根元件（只放 <RouterView />）
└── main.js                        ← app 初始化
```

---

## 樣式規範（Tailwind CSS 4）

專案全面採用 Tailwind CSS 4（`@tailwindcss/vite` 插件），唯一樣式入口是 `vue-app/src/assets/main.css`。

- **禁止使用 `<style scoped>`**：所有樣式一律用 Tailwind utility class 直接寫在 template 上。
- **設計 token**：顏色、字體家族定義在 `main.css` 的 `@theme` 區塊（如 `--color-neon-rose`、`--color-heading`、`--font-sans`），Tailwind 會自動產生對應的 `bg-*`／`text-*`／`border-*` utility class。新增顏色 token 時，避免把顏色用途的字重複塞進 token 名稱裡（例如不要命名成 `--color-bg-card`，因為那會產生 `bg-bg-card` 這種多餘前綴的 class；改用 `--color-card`，對應 `bg-card`）。
- **明暗主題**：沿用既有的 `<html data-theme="light">` / 預設（暗色）機制，`[data-theme="light"]` 選擇器覆寫 `@theme` 的同名 `--color-*` 變數即可讓所有已產生的 utility class 自動跟著換色，不需要另外寫 `dark:` variant。
- **共用元件樣式**：跨檔案重複使用的視覺樣式（按鈕、卡片、徽章等，例如 `.btn-primary`、`.game-card`、`.badge-host`）用 Tailwind 的 `@layer components` + `@apply` 定義在 `main.css`，template 上仍然用語意化 class 名稱引用，不要把同一組 utility 字串複製貼上到每個用到的地方。
- **單一元件才用到的樣式**：直接把 Tailwind utility class 寫在該元件的 template 上（可用 arbitrary value，如 `text-[15px]`、`bg-[rgba(...)]`），不要為了單一元件另外建立 class。
- **Vue `<Transition>` / `<TransitionGroup>` 的 class**：Vue 是依 `name` prop 自動注入 `xxx-enter-active`／`xxx-leave-to` 等 class，這些名稱必須存在於 `main.css` 的 `@layer components` 才會生效（不能只寫在 template 上），可參考 `.toast-enter-active`、`.wakeup-enter-active`、`.phase-flash-enter-active` 等既有寫法。
- **開源元件庫**：互動元件（對話框、下拉選單等）優先用 [Reka UI](https://reka-ui.com/)（headless，無預設樣式），樣式一樣用 Tailwind 表達，可參考 `apps/story-canvas/pages/StoryCanvasPage.vue` 和 `apps/know-me/pages/AdminPage.vue` 的 `DialogRoot`/`DialogContent` 用法。
- **RWD**：用 Tailwind 預設斷點（`sm` 640px 起），手機版（未加前綴的 class）優先設計，再用 `sm:`／`md:` 疊加桌機版樣式。

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
│           apps/portal/          │──→ shared/    ✅
│                                 │
│  apps/know-me → apps/dinner-    │              ❌ 禁止跨 App import
│  picker                         │
└─────────────────────────────────┘
```

### Always（一律遵守）
- App 專屬邏輯放在 `apps/[slug]/` 內，不外洩
- 跨 App 共用邏輯放在 `shared/`
- `router/index.js` 是唯一可以 import 所有 App pages 的地方
- 每個 App 必須在 `apps/portal/data/tools.js` 登記一筆資料（管理用的 AdminPage 例外，不登記）

### Ask First（需先討論）
- 新增一個被多個 App 依賴的 `shared/` composable 或 component
- 修改 `shared/data/identity.js`（多個 App 共用）
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
| `dinner-invite` | 晚餐邀請選擇器 | 🟢 live | `/dinner-invite` |
| `topic-generator` | 話題產生器 | 🟢 live | `/topic-generator` |
| `character-storm` | 默契傳聲筒：字元風暴 | 🟢 live | `/character-storm`, `/character-storm/room` |
| `gender-score` | 十分男女 | 🟢 live | `/gender-score` |
| `story-canvas` | 故事關係圖 | 🟢 live | `/story-canvas` |

另有 `apps/know-me/pages/AdminPage.vue`（題庫管理後台，路由 `/admin`）：不登記進 `tools.js`／Portal 首頁，知道網址才能到。

---

## 字元風暴 — 房間系統規範

### 後端架構（`server/character-storm/`）

```
server/character-storm/
├── index.js          ← Socket.io namespace /character-storm（主邏輯）
└── filterLogic.js    ← 提示字元過濾與符號代換（validateHint / processHints）
```

#### Socket 事件列表

| 方向 | 事件 | 說明 |
|------|------|------|
| C→S | `cs:create` | 建立房間（帶 roomId, nickname, playerId, maxPlayers）|
| C→S | `cs:join` | 加入房間（帶 roomId, nickname, playerId）|
| S→C | `cs:room-state` | 回傳完整房間狀態（加入/重連時）|
| S→C | `cs:error` | 錯誤通知（code: GAME_STARTED / ROOM_FULL / NICKNAME_TAKEN …）|
| C→S | `cs:start` | 房主開始遊戲 |
| S→C | `cs:round1-start` | 第一輪開始（角色分配）|
| S→C | `cs:role-assigned` | 個人角色通知（role / quota）|
| S→C | `cs:word-revealed` | 題目推送（僅提示者）|
| C→S | `cs:submit-hint` | 提示者送出提示（最多 4 字）|
| S→C | `cs:hint-progress` | 已送出提示的玩家 id 清單 |
| S→C | `cs:round1-result` | 第一輪結果（forGuesser / forProvider）|
| S→C | `cs:timer-tick` | 倒數秒數 |
| C→S | `cs:guess` | 猜題者送出猜測 |
| S→C | `cs:guess-result` | 猜題結果（correct / answer / a / b / wasRound2）|
| S→C | `cs:round2-start` | 第二輪開始 |
| S→C | `cs:round2-result` | 第二輪結果 |
| S→C | `cs:finished` | 本局結束 |

#### 重連機制
- 玩家斷線後重新進入同一房間（相同 playerId），後端自動識別為重連
- 重連時補發：角色、題目（若進行中）、上一階段結果（round1-result / round2-result）
- 遊戲已開始時，**新玩家（不同 playerId）無法加入**，收到 `GAME_STARTED` 錯誤
- 前端收到 `GAME_STARTED` 錯誤後，2.5 秒自動導回大廳

#### 暱稱規則
- 最多 **12 個字**，房間內暱稱不可重複

#### 提示規則
- 最多 **4 個中文字**（`maxlength="8"`，中文一字兩 byte）
- 不可包含題目本身的字
- 只能輸入中文字（不含數字、英文、標點）
- 不需填滿字數即可送出（≥ 1 字即可）
- 重複字元自動代換為固定符號（●▲■◆★✖✚⬢），衝突字元加底線標示

---

---

*最後更新：2026-09-18 — 完成 Tailwind CSS 4 + Reka UI 全面遷移、`apps/` 目錄重構、`admin.html` 遷入 Vue（詳見上方「樣式規範」與「目前 App 清單」）。*
