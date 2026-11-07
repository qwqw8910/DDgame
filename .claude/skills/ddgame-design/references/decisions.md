# 設計決策紀錄

記錄「為什麼這樣做」，讓之後要改的人知道代價。新決策往下加，標日期。

## 2026-11-07 入口首頁 v2 改版

### 主色：玫瑰紅單色
- 來源：ui-ux-pro-max `--domain color` 搜尋 "social party game warm"，第 1 筆「Social Media App」：Primary #E11D48。
- 只取它的主色，捨棄它的 Secondary #FB7185 與 Accent 藍 #2563EB：設計原則是「主色一個，其餘中性」。
- `--design-system` 的第一推薦是「Casual Puzzle Game」（粉 #EC4899 ＋ 紫 #8B5CF6 ＋ 金），因含紫色（design-taste-frontend 禁用）而不採用。
- 為什麼是玫瑰紅：品牌名「甜甜的小秘密」，且舊版已有 rose，保留品牌記憶。
- 中性色選石灰階（stone，略帶暖）而不是純灰或冷灰：與玫瑰紅相容，又避開「奶油底＋襯線＋赤陶色」這種常見模板。
- 淺色主色文字對比不足（#E11D48 在 #F6F5F4 上 4.31:1），所以拆出 `brand-ink` #BE123C 專給文字用。

### 字體：Huninn ＋ Noto Sans TC
- ui-ux-pro-max `--domain typography` "playful rounded friendly display" → 「Playful Creative」（Fredoka ＋ Nunito）圓體方向，但兩者都沒有中文。
- 再查 `--domain google-fonts` "rounded chinese traditional"，選 Huninn（justfont 粉圓，有繁中字集）。圓潤筆畫呼應「甜甜」，個性只放在標題。
- 內文保留 Noto Sans TC（可讀性）。
- 代價：Huninn 只有 400 字重，標題不能加粗，層次只能靠字級。

### 版面與資訊設計
- 參考 cacopy.com（日文廣告標語收藏站）的資訊設計，不是視覺：每張卡片同一固定結構、分類旁標數量、版面克制。
- 取消 tools.js 的 `color` 欄位在 UI 上的作用（欄位保留不刪）；卡片辨識改用 ToolIcon 線稿圖示。
- 分類篩選取自 tags，分類清單在 `PortalPage.vue` 的 `FILTER_TAGS`。
- 移除舊版的糖果 SVG（傾斜）與卡片進場 stagger 動畫。

### apple-design 審查時沒修的項目（之後可處理）
1. **Medium**：站內有主題切換鈕（HIG `dark-mode.md › Best practices`「Avoid offering an app-specific appearance setting」）。使用者要求保留。另外，沒存過偏好時預設深色，不跟系統 `prefers-color-scheme`；要改得動 `index.html` 的全站邏輯。
2. **Medium**：篩選有 6 個選項，且「遊戲」與人數分類混在同一排（HIG `segmented-controls.md` 建議 iPhone 約 5 個以內）。可拆兩排或移除「遊戲」。
3. **Low**：全站 16px 最小字級讓「小標籤」偏大，視覺上與說明文字競爭。
4. **Low**：沒有 `prefers-contrast` 高對比模式（目前所有文字已 ≥ 4.6:1）；`theme-color` meta 固定深色。
5. **Low**：部分 tagline 重複名稱（如「今晚吃什麼」），屬 tools.js 文案。

### 版面策略：電腦優先（2026-11-07 使用者指定）
- 設計以 1440 電腦版為主，只有寬度 < 640px（`max-sm:`）判斷為手機時才切換手機版面；平板沿用電腦版。
- 用寬度斷點，不用 User-Agent 偵測，讓縮小視窗、分割畫面也能正確切換。
- 手機版仍須通過 390 寬無橫向捲動、44px 點擊目標。
- 首頁原始碼保留由小到大的 class 寫法（效果相同）；新程式碼與 skill 範例改用 `max-*` 電腦優先寫法。

### 容器寬度分級與首屏留白（2026-11-07 使用者指定）
- 原本 `max-w-[1120px]` 在 1440 螢幕兩側各約 160px、1920 各約 400px，使用者覺得太空。
- 改為分級上限：預設 1280px，`2xl`（≥1536）1440px，≥1920 1600px。小於 1280 的螢幕不受影響（本來就滿版）。
- 不採用「拿掉上限」：超寬螢幕會讓固定欄數的卡片變扁、文字行長過長。
- 首頁原本頂列只有圖示按鈕獨佔一列（44px）再加 header `pt-20`，標題上方空了約 140px。改為按鈕與眉標同列，header 上方不加 padding（使用者實測全拿掉最好看）。下方保留 `pb-14`（手機 `pb-10`），因為全拿掉時引言會和「和朋友一起玩」區塊標題黏在一起。

### 共用元件的處理
- `PwaInstallButton.vue`（shared）把 ⬇️ emoji 寫死，且被 4 個 app 使用。首頁改為直接用 `usePwaInstall` composable 自己畫按鈕，沒有改共用元件。之後要統一時，給它加 slot 並保留 emoji 為預設內容。
