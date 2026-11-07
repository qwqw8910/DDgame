# 把舊 app 改成 v2

目前狀態（2026-11）：只有入口首頁（`apps/portal`）是 v2。其他 app 仍是舊的霓虹風格，使用者會逐一決定何時改。**一次只改一個 app**，不要順手改別的。

## 原則
- 舊 token 不刪：`--color-neon-*`、`--color-heading`、`--color-card`、`--neon-rose` 等別名、`.game-card`、`.btn-primary` 等舊 class 還有其他 app 在用。
- 改的是「這個 app 的元件用哪些 class」，不是改舊 class 的定義（改定義會連帶改到所有 app）。
- 遊戲本身的玩法視覺（棋盤、角色、特效、主題美術，例如山中別館的暖金磚紅、甜點守衛戰的美術）屬於內容，不必強制套 v2；外框（大廳、設定、按鈕、卡片、表單、提示）才套 v2。不確定時問使用者。

## 舊 → 新對照

| 舊 | 新 | 備註 |
|---|---|---|
| `bg-dark`／`--color-dark`／`body::before` 漸層 | `bg-canvas` | 在 app 根容器加 `bg-canvas`，蓋掉全站漸層底 |
| `--color-card`、`--color-card-solid`、`.game-card`、`.neon-card` | `bg-raised rounded-tile shadow-(--shadow-tile)` | 半透明改實色 |
| `--color-subtle`、`--color-surface`、`--color-input` | `bg-fill` | |
| `--color-border`、`--color-divider`、`--color-border-glow` | `border-hairline`／`bg-hairline` | 不發光 |
| `text-heading`／`--heading` | `text-ink` | |
| `text-label`／`--label` | `text-ink-muted` | |
| `text-body`／`--body` | `text-ink-muted`（說明）或 `text-ink-faint`（輔助） | |
| `neon-rose`、`neon-purple`、`neon-blue`、`neon-cyan`（裝飾用途） | 移除，改中性色 | 不用顏色區分項目 |
| `neon-rose`／`neon-purple`（表示選中、主要動作） | `bg-brand text-on-brand` | 一個畫面只一處 |
| `--color-accent`（強調文字） | `text-brand-ink` | |
| `.btn-primary` | 主色填色按鈕：`h-11 rounded-full bg-brand px-5 text-on-brand active:scale-[0.97]` ＋焦點框 | 按鈕統一用 `rounded-full` |
| `.btn-secondary`、`.btn-ghost` | `h-11 rounded-full bg-raised px-5 text-ink shadow-(--shadow-tile) hover:bg-fill` | |
| `.game-input` | `h-11 rounded-inset bg-fill px-4 text-ink placeholder:text-ink-faint` ＋焦點框 | 標籤要看得見，不只 placeholder |
| `.badge-*`、`.topic-badge` | 標籤或狀態徽章（見 components.md） | |
| `font-serif-tc` 標題、`font-sans`（Poppins） | `font-display font-normal`／`font-text` | |
| `--color-success`、`--color-lemon`、`--color-ruby`（狀態） | **v2 尚未定義** | 先依 tokens.md 新增 status token，不要直接沿用 |
| `.toast` | 暫時保留；改版時改成 raised＋描邊陰影 | |
| emoji 圖示按鈕（🌙 ☀️ ⬇️） | 線稿 SVG ＋ `aria-label` | |
| 進場 stagger、`animate-pop-in`、`float`、`neon-flash` 等外框動畫 | 移除 | 玩法回饋動畫可保留，但要有 reduced-motion 版本 |

## 單一 app 改版檢查表
1. 列出該 app 用到的舊 class／token（`grep -n "neon-\|game-card\|btn-primary\|text-heading\|text-body\|font-serif-tc" vue-app/src/apps/<app>`）。
2. 共用元件（`src/shared/`）若被該 app 使用：先搜尋其他引用處。只影響這個 app 就改；影響多個 app 就加 prop／slot 保持舊預設，或在該 app 內改用 composable。
3. 照對照表替換，結構照 components.md。
4. 跑 SKILL.md 的驗證流程（截圖 12 張、鍵盤、apple-design 審查、build）。
5. 改完後，若某個舊 token／class 已經沒有任何引用，記在回報裡（之後一起清），**這次不要刪**。

## 全部改完之後
所有 app 都是 v2 時，再開一個獨立的 PR 清除：舊 `--color-*` token、`:root` 的向下相容別名、`.portal`／`.portal--light` 舊樣式、`body::before` 漸層、舊元件 class。清完更新本檔。
