---
name: ddgame-design
description: 「甜甜的小秘密」（DDgame vue-app）的設計系統與 UI 開發流程：v2 設計 token（單一玫瑰紅主色＋石灰階中性色、Huninn 粉圓標題＋Noto Sans TC 內文、統一圓角與陰影）、共用元件寫法、三個參考 skill（apple-design、ui-ux-pro-max、design-taste-frontend）的分工與優先順序、驗證與審查流程。只要在這個專案裡新增 app／功能／頁面／元件、改任何畫面的樣式或版面、把舊 app 從霓虹風格改成新風格、或使用者提到「風格一致」「設計規範」「照首頁的樣式」「改 UI」，都要先用這個 skill，即使使用者沒有明說要用它。
---

# 甜甜的小秘密 — 設計系統 v2

這個 skill 的目的：讓每一個新功能、每一次改版都長得像同一個產品。
基準是 2026-11 重做的入口首頁（`vue-app/src/apps/portal/`）。它是目前唯一完全符合 v2 的畫面，有疑問時以它的實際寫法為準。

## 設計方向（一句話）

Apple 式的克制：大量留白、一個畫面一個重點、一個主色、靠一致的結構產生質感，而不是靠特效。

舊風格的問題（不要回到這裡）：深色底＋霓虹紫／玫瑰／藍／青四色並用＋半透明卡片＋發光陰影＝典型「AI 風格」。

## 開工前

1. **讀 token 與元件**：`references/tokens.md`（必讀）、`references/components.md`（要寫 UI 就讀）。
   改造舊 app 時再讀 `references/migration.md`。想知道某個決定為什麼這樣做，讀 `references/decisions.md`。
2. **依任務載入參考 skill**（見下一節的分工）。小改動（調一個按鈕、加一個欄位）不必三個都載入，直接照本 skill 的規範做即可。
   新 app、新頁面、整個 app 改版時三個都載入。
3. **確認範圍**：只動任務相關的 app。共用元件（`src/shared/`）被多個 app 使用，要改先搜尋所有引用處，或改用 composable 自己組。

## 三個參考 skill 的分工

這三個 skill 安裝在使用者層級（`~/.claude/skills/`），不在 repo 裡。若環境中找不到，本 skill 已把需要的原則內嵌，照本 skill 做即可。

| Skill | 管什麼 | 怎麼用 |
|---|---|---|
| **apple-design** | 版面、留白、層次、互動、可存取性；完成後的審查 | 依它的五個審查視角（Accessibility → Platform → Visual/Craft → Interaction → Content）審成品，引用 HIG 檔名與段落 |
| **ui-ux-pro-max** | 配色與字體的「候選」、UX 準則資料庫 | 需要新顏色或字體時，用 `python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<關鍵字>" --domain color\|typography\|google-fonts\|ux` 找候選，從中選一組並記下依據 |
| **design-taste-frontend** | 「不要像 AI 做的」的判斷 | 只取原則（見下），**不要**跑它的完整流程 |

**衝突時的優先順序**
- 版面、留白、層次、互動 → apple-design 優先
- 配色與字體的具體選擇 → ui-ux-pro-max 提供候選，再用本系統的 token 規則篩選（單一主色、禁紫）
- 「像不像 AI 做的」 → design-taste-frontend 優先
- 以上三者都輸給**本 skill 的既有 token 與規範**：已經定下的東西不重選，要改就先改本 skill（見「修改設計系統本身」）

**design-taste-frontend 不適用的部分**：它是為公司官網設計的，照片、文案規則、`gate.mjs` 檢查關卡、hero 抽選、moments、shader 等流程都不適用這個 PWA。只取這些原則：
- 一個畫面一個重點
- 左右內容邊距相等
- 不使用傾斜、視差、捲動才淡入的卡片
- 不使用紫色或薰衣草色
- 主色一個，其餘中性灰階
- hover 動效統一：卡片上浮 2px、按鈕有按下回饋、連結底線描繪

## 規範（實作時逐條遵守）

### 顏色
- 只用 v2 token（`bg-canvas`、`bg-raised`、`bg-fill`、`text-ink`、`text-ink-muted`、`text-ink-faint`、`border-hairline`、`bg-brand`、`text-on-brand`、`text-brand-ink`、`bg-brand-soft`）。不在元件裡寫死 hex，不新增舊的 `neon-*` 用法。
- 主色（brand）只用在：選中狀態、主要動作、焦點框、極少量強調文字。一個畫面上大面積出現主色就是用太多了。
- **主色文字用 `text-brand-ink`，不是 `text-brand`**：淺色模式 #E11D48 在 canvas 上只有 4.3:1，不到 4.5:1。
- 不用顏色區分項目（例如每張卡片一種顏色）。辨識靠圖示和文字。
- 不用紫色、薰衣草色、霓虹發光、漸層底、半透明毛玻璃卡片。
- 需要狀態色（成功／錯誤／警告）時，v2 還沒有定義：照 `references/tokens.md` 的「新增 token」流程加，不要直接拿舊的 `--color-success`。

### 字體
- 標題 `font-display`（Huninn 粉圓），內文 `font-text`（Noto Sans TC）。不再新增第三種字體。
- Huninn 只有 400 字重：標題一律 `font-normal`，絕對不要 `font-bold`（瀏覽器會硬加粗、變醜）。層次靠字級，不靠粗細。
- 全站規則：內容文字最小 16px（`main.css` 對 `p, span, a, li, label, button…` 有 `max(var(--text-base), 1em)`）。不要用 `text-sm`／`text-xs` 去對抗它。

### 形狀、陰影、動效
- 圓角只有兩級：卡片／面板 `rounded-tile`（20px），卡片內的小框 `rounded-inset`（12px）；膠囊按鈕與標籤用 `rounded-full`。不要出現其他圓角值。
- 卡片陰影 `shadow-(--shadow-tile)`，hover `hover:shadow-(--shadow-tile-hover)`。深色模式下陰影主要是 1px 描邊，不是發光。
- 動效只有三種：可點卡片 hover 上浮 2px（`hover:-translate-y-0.5`）、按鈕按下縮放（`active:scale-95` 或 `[0.97]`）、箭頭／連結底線的小位移。時間 150–200ms，`ease-soft`。
- 不做：進場 stagger、捲動淡入、傾斜、視差、彈跳、無限循環動畫（遊戲本身的玩法動畫除外）。
- 每個 transition 都要加 `motion-reduce:transition-none`；有位移的 hover 加 `motion-reduce:hover:translate-y-0`。

### 版面
- **電腦優先**：先以 1440 寬的電腦畫面設計和調整版面，確定電腦版好看。只有判斷是手機時，才切換成手機版面。
- **怎麼判斷「手機」**：寬度 < 640px，也就是 Tailwind 的 `max-sm:`。平板（820 等）沿用電腦版面，最多用 `max-lg:` 收窄欄數或邊距，不做第三套設計。
- **寫法**：不加前綴的 class 寫電腦版，手機差異用 `max-sm:` 覆寫，例如 `grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1`、`px-12 max-lg:px-8 max-sm:px-4`。
  既有程式碼（例如首頁）是 `px-4 sm:px-8 lg:px-12` 這種由小到大的寫法，效果相同，不必為了改寫法而重寫；新寫的程式碼用電腦優先的寫法。
- **不判斷裝置類型**：不要用 User-Agent 或 JS 去偵測手機。一律用寬度斷點，這樣縮小視窗、平板分割畫面都會正確切換。
- 手機版仍然是必要條件，不是附加：390px 寬不能有橫向捲動；可點擊目標至少 44×44px（`size-11`／`h-11`）。電腦版也用同樣尺寸，兩邊一致，觸控筆電也好按。
- 內容容器：`mx-auto max-w-[1280px] 2xl:max-w-[1440px] min-[1920px]:max-w-[1600px] px-12 max-lg:px-8 max-sm:px-4`，左右邊距相等，所有區塊對齊同一條邊。上限依螢幕分級放寬，避免大螢幕兩側空白過多；不要拿掉上限（超寬螢幕會讓卡片變扁、行長過長）。
- 頁面內的窄欄（例如表單、單一工具）可以在容器**裡面**再限制寬度，但外層容器仍用上面這組，讓標題與邊界跟其他頁對齊。
- 頂部不要另開一列只放圖示按鈕：按鈕和眉標（或頁面標題列）放同一列，header 上方不加 padding（只有容器的安全區 16px），下方 `pb-14 max-sm:pb-10`，和第一個區塊標題拉開距離，避免引言和區塊標題黏在一起。
- 頁面頂部尊重安全區：`pt-[max(16px,env(safe-area-inset-top))]`。
- 一個畫面一個重點：首屏只放一個大標題或一個主要動作，不要並排兩個搶眼的東西。
- 同類項目用同一個固定結構（像首頁卡片：圖示＋名稱 → 分隔線 → 一行說明 → 標籤），掃讀靠一致性。

### 可存取性與互動
- 每個可聚焦元素都要有 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`。
- 圖示按鈕必須有 `aria-label`（說明「按下會發生什麼」，例如「切換為淺色模式」）；裝飾性 SVG 加 `aria-hidden="true"`。
- 不用 emoji 當介面圖示；用線稿 SVG（`stroke="currentColor"`、`stroke-width` 1.7–1.8、圓角端點）。
- 單選、多選、分頁、對話框等互動用 reka-ui（已安裝），不要自己刻鍵盤與 ARIA 行為。
- 篩選或列表變動時，用 `role="status"` 的 `sr-only` 文字告知結果數。

### 主題
- 預設深色（`data-theme="mygame"`），淺色是 `data-theme="light"`。v2 token 兩套值都已定義，用 token 就會自動切換。
- 先確保淺色好看，再檢查深色。

### 依賴
- 不引入新的 UI 套件。可用的只有 Tailwind 4 與 reka-ui。要加任何依賴先問使用者。

## 修改設計系統本身

要新增或修改 token、改元件的標準寫法時：
1. 在 `vue-app/src/assets/main.css` 的 `@theme`（深色預設值）與 `[data-theme="light"]`（淺色值）**同時**加入，並在註解寫上對比度。
2. **只新增，不刪舊 token**：舊 app 還在用 `--color-neon-*`、`--color-heading` 等，刪了會壞。舊 token 等所有 app 都改完再一次清。
3. 更新本 skill 的 `references/tokens.md`（以及受影響的 `components.md`），讓下一次開發看到的規範是最新的。

## 驗證（做完要實際跑）

1. `cd vue-app && npm run dev`，打開改動的頁面。
2. 截圖並自動檢查：
   ```bash
   node .claude/skills/ddgame-design/scripts/shot.mjs --url http://localhost:5173/DDgame/<路由> --out <暫存資料夾>
   ```
   會輸出 1440、820、390 × 淺色／深色共 12 張圖（首屏＋全頁），並檢查橫向捲動、小於 44px 的可點擊目標、Huninn 是否載入。實際**看**每一張截圖，不要只看數字。
   看圖順序：先看 1440（主要設計），再看 820（平板沿用電腦版是否撐得住），最後看 390（手機版是否正確切換）。
   （port 以 dev server 印出的為準；`--widths`、`--themes` 可縮小範圍。）
3. 鍵盤走一遍：Tab 順序合理、焦點框看得見、Enter／空白鍵能操作。
4. 用 apple-design 的審查流程審一次（至少讀 `accessibility.md`、`layout.md`、`typography.md`、`color.md`、`dark-mode.md` 加上畫面上有的元件頁），列出剩餘問題與嚴重度。
5. `cd vue-app && npm run build` 必須通過。

## 回報格式

- 做了什麼、改了哪些檔案（區分「本任務的檔案」與「不得不碰的共用檔案」，後者說明原因）
- 用到哪些 token／元件；若新增 token，附對比度與 ui-ux-pro-max 依據
- 驗證結果：截圖路徑、橫向捲動與 44px 檢查結果、build 結果
- apple-design 審查：整體評級、沒修的項目與原因
- 與本規範不一致、需要使用者決定的地方
