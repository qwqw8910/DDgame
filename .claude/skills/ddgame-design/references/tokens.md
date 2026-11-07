# v2 設計 token

定義位置：`vue-app/src/assets/main.css`
- 深色（預設）值：`@theme { … }` 區塊內「新設計系統 v2」那一段
- 淺色值：`[data-theme="light"] { … }` 區塊尾端「設計系統 v2 淺色值」
- 陰影：`@theme` 外的 `:root` 與 `[data-theme="light"]`（放在 `@theme` 外才能在執行期隨主題切換）

Tailwind 4 會依 `@theme` 自動產生 utility，例如 `--color-ink` → `text-ink`／`bg-ink`／`border-ink`。

## 顏色

| Token | Utility 範例 | 深色 | 淺色 | 用途 | 對比 |
|---|---|---|---|---|---|
| `--color-canvas` | `bg-canvas` | #0C0A09 | #F6F5F4 | 頁面底 | — |
| `--color-raised` | `bg-raised` | #1C1917 | #FFFFFF | 卡片、按鈕、膠囊底 | — |
| `--color-fill` | `bg-fill` | #292524 | #F0EFEE | 圖示框、標籤底、hover 底 | — |
| `--color-hairline` | `border-hairline`、`bg-hairline` | #2E2A27 | #E7E5E4 | 分隔線、描邊（非文字） | — |
| `--color-ink` | `text-ink` | #F5F5F4 | #1C1917 | 主要文字、標題 | 18.1 / 16.1 :1 on canvas |
| `--color-ink-muted` | `text-ink-muted` | #A8A29E | #57534E | 次要文字、說明 | 6.9 on raised / 7.0 on canvas |
| `--color-ink-faint` | `text-ink-faint` | #938C87 | #6B6560 | 輔助文字、標籤、頁尾 | 深 5.3 on raised、4.6 on fill；淺 5.3 on canvas、5.0 on fill |
| `--color-brand` | `bg-brand`、`outline-brand` | #FB7185 | #E11D48 | 主色**填色**：選中、主要按鈕、焦點框 | — |
| `--color-on-brand` | `text-on-brand` | #1C1917 | #FFFFFF | 主色填色上的文字 | 6.5 / 4.7 :1 |
| `--color-brand-ink` | `text-brand-ink` | #FB7185 | #BE123C | 主色**文字** | 7.3 on canvas / 6.3 on white |
| `--color-brand-soft` | `bg-brand-soft` | rose 14% | rose 8% | 主色淡底（提示、選中列背景） | 上面的文字用 ink |
| `--color-warning-ink` | `text-warning-ink` | #FBBF24 | #B45309 | 警告**文字**（例：壓縮後變大） | 深 10.5 on raised；淺 5.0 on white、4.6 on canvas，**淺色不要放在 fill 上**（4.4） |
| `--color-danger-ink` | `text-danger-ink` | #F87171 | #B91C1C | 錯誤**文字**（例：處理失敗） | 深 6.3 on raised、5.5 on fill；淺 6.5 on white、5.6 on fill |

狀態色只有文字版（2026-11 由圖片壓縮加入，Tailwind amber／red 的 400 與 700；ui-ux-pro-max 的候選只給 destructive #EF4444，在白底只有 3.8:1 不採用）。成功狀態不另設顏色：成功是預期結果，用 `text-ink` 即可。需要狀態底色或圖示色時再依下方流程新增。

**規則**
- 文字只能用 `ink`、`ink-muted`、`ink-faint`、`brand-ink`、`on-brand`。`ink-faint` 不要放在比 `fill` 更深（淺色）或更亮（深色）的底上。
- `brand` 不用在文字上（淺色模式在 canvas 上只有 4.3:1）。
- 半透明：只有 `brand-soft` 是半透明；其餘一律實色，不做毛玻璃。

## 字體

| Token | Utility | 字體 | 用途 |
|---|---|---|---|
| `--font-display` | `font-display` | Huninn（justfont 粉圓）→ Noto Sans TC | 頁面標題、卡片名稱、區塊標題 |
| `--font-text` | `font-text` | Noto Sans TC → 系統字 | 內文、按鈕、標籤 |

- 載入方式：`vue-app/index.html` 的 Google Fonts `<link>`（已含 `family=Huninn`）。新增字體也加在這裡，不用 `@import`。
- Huninn 只有 400：`font-display` 一律配 `font-normal`。
- 字級參考（首頁實作）：
  - 頁面主標 `text-[clamp(44px,10vw,88px)] leading-[1.08] tracking-[0.01em]`
  - 卡片／區塊標題 `text-xl leading-snug`
  - 引言 `text-xl max-sm:text-lg leading-relaxed text-ink-muted`
  - 內文 `text-base leading-relaxed`
  - Eyebrow（標題上方一小行）`text-base font-medium text-brand-ink`
- 數字欄位（計數、分數）加 `tabular-nums`。

## 圓角

| Token | Utility | 值 | 用途 |
|---|---|---|---|
| `--radius-tile` | `rounded-tile` | 1.25rem（20px） | 卡片、面板、彈出提示 |
| `--radius-inset` | `rounded-inset` | 0.75rem（12px） | 卡片內的圖示框等（= tile 圓角 − 內距的同心圓角） |
| Tailwind 內建 | `rounded-full` | — | 圖示按鈕、篩選膠囊、標籤 |

## 陰影

| 變數 | 用法 | 深色 | 淺色 |
|---|---|---|---|
| `--shadow-tile` | `shadow-(--shadow-tile)` | 1px hairline 描邊 | 1px 描邊＋極淡投影 |
| `--shadow-tile-hover` | `hover:shadow-(--shadow-tile-hover)` | 較亮描邊＋深投影 | 較深描邊＋10px/28px 淡投影 |

## 動效

| Token | Utility | 值 |
|---|---|---|
| `--ease-soft` | `ease-soft` | cubic-bezier(0.2, 0.8, 0.2, 1) |

時間：hover 200ms（`duration-200`），按下 75–150ms。

## 新增 token 的流程

1. 確定真的需要（現有 token 組不出來）。狀態文字色 `warning-ink`、`danger-ink` 已有；狀態底色、success 仍未定義。
2. 用 ui-ux-pro-max 找候選：`python ~/.claude/skills/ui-ux-pro-max/scripts/search.py "<用途>" --domain color`，排除紫色系。
3. 算對比度（文字 ≥ 4.5:1，18px 以上或粗體 ≥ 3:1），深淺兩套都要算。可用：
   ```bash
   node -e 'const L=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};const[a,b]=process.argv.slice(1);console.log(((Math.max(L(a),L(b))+.05)/(Math.min(L(a),L(b))+.05)).toFixed(2))' "#E11D48" "#FFFFFF"
   ```
4. 在 `@theme`（深色）與 `[data-theme="light"]`（淺色）同時加入，註解寫對比度。
5. 更新本檔的表格。
