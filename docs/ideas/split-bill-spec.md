# 分帳系統規格書（Split Bill System Spec）

> 狀態：v0.3 — **後端已實作**（`server/split-bill/`，測試通過）；前端尚未實作
> 已實作範圍：名稱即 Key、DB 持久化、支出／分攤（5 種）／餘額／簡化債務／結算／活動紀錄／虛擬成員／房主刪房。
> 尚未實作：前端畫面、兩兩原始債務明細(F-B2)、收款確認(F-S4)、成員改名／合併、多幣別匯率、附件、匯出、通知。
> 日期：2026-10-21
> 變更：v0.2 改為沿用平台現有「房間系統」，**不做註冊／登入**
> 相關文件：[房間系統_統一規範](../design/房間系統_統一規範.md)、[server/room/README.md](../../server/room/README.md)

## 1. 目標與範圍

### 1.1 目標
讓一群人（朋友、室友、旅伴）進入同一個房間記錄共同花費，系統自動計算「誰欠誰多少錢」，並以最少的轉帳次數結清。

### 1.2 設計原則
- **沿用現有房間系統**：建立／加入房間、房間碼、分享連結、暱稱、斷線重連、踢人、房主轉移，全部直接使用 `server/room/` 的 `registerRoomHandlers()` 與前端統一 Lobby 流程，不自行重做。
- **不需要註冊登入**：**身分 = 房間內的名稱（暱稱）**。名稱是該房間成員的唯一 Key；同一個人換手機／換瀏覽器，只要輸入相同名稱就會被辨識為同一人，自動接回原本的帳務身分。
- **房間碼即存取憑證**：知道房間碼才能進入，沒有帳號權限系統。
- **資料長久保存**：所有帳務資料以資料庫（Supabase）為唯一真實來源，房間**永不封存**；in-memory 快取只是加速用，遺失可隨時由 DB 重建。

### 1.3 MVP 範圍（先做）
- 房間管理（沿用房間系統：建立／加入／分享連結／踢人／轉移房主）
- 新增／編輯／刪除支出
- 多種分攤方式
- 餘額計算與簡化債務
- 結算（還款）紀錄
- 歷史紀錄查詢

### 1.4 非 MVP（之後再做）
多幣別即時匯率、收據 OCR、推播通知、匯出報表、第三方支付串接、離線模式、跨房間的個人總帳。

### 1.5 名詞定義
| 名詞 | 說明 |
|------|------|
| 房間 (Room) | 一起分帳的一組人，如「日本旅行」；即現有房間系統的 room，`app_id = 'split-bill'` |
| 玩家／成員 (Player) | 房間內的參與者，以暱稱顯示；沿用房間系統的 players |
| 虛擬成員 (Virtual member) | 沒有裝置／不上線的人（如長輩），由他人代為建立，僅有暱稱，見 3.2 |
| 支出 (Expense) | 一筆由某人先墊付、需分攤給多人的花費 |
| 分攤 (Split) | 一筆支出中每位參與者應負擔的金額 |
| 結算 (Settlement) | 成員間實際還款的紀錄 |
| 餘額 (Balance) | 某成員「應收 − 應付」的淨額 |

---

## 2. 角色與權限

沿用房間系統的角色，不另建帳號權限。

| 角色 | 來源 | 權限 |
|------|------|------|
| 房主 (Host) | 房間系統 | 踢人、轉移房主、刪除／封存房間、可管理虛擬成員、覆寫他人支出 |
| 成員 (Player) | 房間系統 | 新增支出、編輯／刪除**自己建立**的支出、記錄結算、檢視全部紀錄 |
| 觀戰者 (Spectator) | 房間系統 | **本 App 不使用**，`canJoinAsPlayer` 一律回傳 `true` |

> 待決定：成員是否可編輯「他人」建立的支出？（建議：預設否，房主可編輯所有人的）
> 沒有帳號，也沒有密碼，因此**任何拿到房間碼的人只要輸入某成員的名稱，就能以該成員身分操作**；信任模型為「拿到房間碼的人都是自己人」。如需防冒用，日後可加選配的「成員 PIN 碼」（見 13）。

---

## 3. 功能需求

### 3.1 身分（沿用房間系統）
- F-A1 進入 Lobby 輸入名稱即可，名稱存 localStorage（`saveNickname`）方便下次自動帶入
- F-A2 **名稱即 Key**：同房間內名稱唯一；比對時做 NFKC 正規化（全形→半形）、去除前後空白、合併連續空白、忽略英文大小寫（例：`Amy` = `amy` = `ＡＭＹ`）；名稱最多 20 字
- F-A2b **實作方式**：後端以「房號 + 名稱 Key」雜湊出固定的 `playerId`（`memberPlayerId`），房間模組新增 `resolvePlayerId` hook 由後端覆寫前端傳來的 id。因此同名者換裝置時，房間模組直接走既有的「重連」路徑，不需要額外的綁定表。**前端必須以 `room:join-ack.myPlayerId` 為準，不可自己產生 id**
- F-A3 加入房間時依名稱查 `BillMember`：
  - 名稱已存在 → **視為同一人**，將本次連線的 `playerId` 綁定到該成員（換手機、清除快取、重新整理都適用），不回 `NICKNAME_TAKEN`
  - 名稱不存在 → 建立新成員
- F-A4 同一名稱可同時多裝置在線（例如手機＋電腦），視為同一成員，事件廣播給所有該成員的連線
- F-A5 房主建房時輸入的名稱同樣成為房主成員的 Key
- F-A6 暫不提供改名：名稱是推導 `playerId` 的來源，改名需重新綁定 players 列，留待後續設計（帳目依 `member_id` 綁定，技術上可行）

### 3.2 房間與成員
由房間系統提供，不重複實作：
- F-G1 建立房間（暱稱、人數上限）→ `room:create`，`appId = 'split-bill'`
- F-G2 加入房間：房間碼或分享連結 `https://[host]/#/split-bill?room=XXXXXX`
- F-G3 踢人、轉移房主、主動離開 → `room:kick` / `room:transfer-host` / `room:leave`
- F-G4 斷線保留在名單（`room:player-offline`）；**分帳房間永不封存**：全員離線 30 分鐘後只釋放記憶體快取（`idleAction: 'evict'`），DB 資料不動，之後用房間碼進房會自動從 DB 重建
- F-G4b **房主可手動刪除房間**（`bill:room-delete`）：刪除 `rooms` 列，帳務與成員資料由 `ON DELETE CASCADE` 一併永久清除，不可復原

本 App 額外需求：
- F-G5 ~~認領暱稱~~：已由 F-A3「名稱即 Key」取代，不需額外流程
- F-G6 **虛擬成員**：任何成員可新增只有名稱的虛擬成員參與分帳；之後有人用相同名稱加入，就自動成為該成員（同 F-A3）
- F-G7 成員離開／被踢時，若餘額 ≠ 0：預設**轉為「已離開成員」保留在帳務中**，不從帳目刪除（`onPlayerLeft` hook 實作）；餘額為 0 才可完全隱藏
- F-G8 房間列表（我最近進過的房間）：以 localStorage 記錄 `roomId` 與暱稱，不需帳號

### 3.3 支出 (Expense)
- F-E1 新增支出，欄位：
  - 標題（必填）、金額（必填，> 0）、幣別
  - 付款人（可單人，進階：多人共同付款）
  - 參與分攤的成員
  - 分攤方式（見 3.4）
  - 日期、分類、備註、附件（收據圖片，選配）
- F-E2 編輯支出（保留修改紀錄）
- F-E3 刪除支出（軟刪除，可復原）
- F-E4 支出列表：依日期排序，可依分類／付款人／參與者篩選與搜尋
- F-E5 支出分類：餐飲、交通、住宿、娛樂、購物、日用品、其他（可自訂）
- F-E6 即時同步：任一成員新增／修改支出，房間內其他人立即看到（Socket 廣播）

### 3.4 分攤方式 (Split Types)
| 方式 | 說明 | 驗證 |
|------|------|------|
| 平均分攤 | 勾選參與者後均分 | 零頭歸屬規則見 4.2 |
| 指定金額 | 每人輸入確切金額 | 總和 = 支出總額 |
| 百分比 | 每人輸入百分比 | 總和 = 100% |
| 份數 (Shares) | 如 2 大人 1 小孩 = 2:2:1 | 份數 > 0 |
| 調整式 | 先平分，再對個別人加減金額 | 調整後總和 = 總額 |

### 3.5 餘額與債務簡化 (Balance & Debt Simplification)
- F-B1 即時計算每位成員淨餘額（應收為正、應付為負）
- F-B2 顯示「兩兩之間」誰欠誰（原始債務）
- F-B3 **簡化債務**：最小化轉帳筆數（見 4.4 演算法），並可開關此功能
- F-B4 個人視角：「我總共欠 / 被欠多少」、「我該付給誰」

### 3.6 結算 (Settlement)
- F-S1 記錄還款：付款人、收款人、金額、日期、備註
- F-S2 一鍵帶入建議還款金額（來自簡化後債務）
- F-S3 結算紀錄計入餘額（等同一筆「反向支出」）
- F-S4 收款人確認機制（選配）：待確認 → 已確認
- F-S5 全部結清後可標示房間為「已結清」

### 3.7 歷史與稽核 (Activity Log)
- F-L1 房間活動紀錄：誰在何時新增／修改／刪除了什麼
- F-L2 支出編輯保留前後差異
- F-L3 結算與支出以時間軸統一呈現

### 3.8 通知（選配，MVP 後）
- 被加入支出、收到還款、提醒還款（無帳號，僅能使用房間內即時提示或 PWA 推播，見 [pwa-support](pwa-support.md)）

### 3.9 匯出（選配）
- 匯出房間帳目為 CSV / PDF
- 分享唯讀的帳目摘要連結

---

## 4. 核心規則與演算法

### 4.1 金額表示
- 一律以**最小貨幣單位的整數**儲存（例：TWD 以「元」、USD 以「分」），避免浮點誤差。
- 每種幣別定義小數位數 (minor unit)。

### 4.2 零頭處理（Rounding）
平均分攤時 `總額 ÷ 人數` 可能除不盡，規則：
1. 先每人分配 `floor(總額 / 人數)`。
2. 剩餘的零頭（單位為最小單位）依固定順序（如：付款人優先，或依 `join_order`）逐一多分 1。
3. 保證 **各人分攤總和 = 支出總額**（不可差一分）。

### 4.3 餘額計算
對每位成員 `m`：
```
balance(m) = Σ 已付金額(m) − Σ 應分攤金額(m) + Σ 付出的還款(m) − Σ 收到的還款(m)
```
- 全房間所有人餘額總和必為 0（系統不變量，需有測試與資料檢查）。
- 餘額一律由後端依 DB 紀錄計算，前端只顯示，不自行累加。

### 4.4 簡化債務演算法
1. 將成員分成債權人（balance > 0）與債務人（balance < 0）。
2. 貪婪法：每次取最大債務人與最大債權人，轉 `min(|欠|, 應收)`，直到全部為 0。
3. 結果轉帳筆數 ≤ 成員數 − 1。
> 註：最少筆數是 NP-hard 問題，貪婪法在實務上足夠；若日後需要可改為子集和分組優化。

### 4.5 多幣別（MVP 後）
- 每筆支出記錄原幣別與當下匯率；房間有「結算幣別」。
- 匯率於記錄時固定，不隨後續匯率波動改變歷史帳目。

---

## 5. 與房間系統的整合

### 5.1 後端 `server/split-bill/index.js`
依 [房間系統_統一規範](../design/房間系統_統一規範.md) 的 Checklist 建立 namespace `/split-bill`，呼叫 `registerRoomHandlers(namespace, db, hooks)`：

| Hook | 本 App 行為 |
|------|-------------|
| `minPlayers` | `1`（單人也能先建房記帳） |
| `canJoinAsPlayer(roomId)` | 永遠 `true`（隨時可加入，不使用觀戰席） |
| `spectatorCanUpgrade` | 不實作 |
| `buildGameState(roomId)` | 回傳完整帳務：成員、支出、結算、餘額，供加入／重連時還原 |
| `onPlayerJoined(..., isReconnect)` | 補發最新帳務狀態 |
| `onPlayerLeft(roomId, playerId, reason)` | 不刪帳；將該成員標為「已離開」，保留於帳目（F-G7） |

- 帳務資料放在 `roomCache.setGameData(roomId, …)` 做 in-memory 快取，**每次變更先寫入 DB、成功後才更新快取並廣播**（server 重啟後可由 DB 還原）。
- `room:ready` 準備機制本 App 不使用。

**對共用房間模組 `server/room/` 做的調整**（皆為選項，未設定時行為與原本完全相同，既有遊戲測試全數通過）：
1. `idleAction: 'evict'` / `idleMs`：全員離線逾時後只釋放記憶體，不把 `rooms.status` 設為 archived（預設仍是 `'archive'`、30 分鐘）。
2. `resolvePlayerId({ roomId, nickname, playerId })`：由後端決定實際 `playerId`。分帳用它讓「同房同名 = 同一個 id」，因此不需要修改 `NICKNAME_TAKEN` 的邏輯。
3. 斷線判斷：同一 `playerId` 仍有其他連線在房內時（例如手機＋電腦同名登入），不標記為離線。
4. 冷啟動載入：`roomCache.get` 本來就會從 DB 重建 `rooms`／`players`；帳務資料由分帳模組在第一次使用時從 DB 載入（`getState`）。

### 5.2 前端 `vue-app/src/apps/split-bill/`
- `pages/SplitBillLobbyPage.vue`：建立／加入房間（暱稱 + 房間碼），只做驗證與路由，不碰 DB／Socket
- `pages/SplitBillRoomPage.vue`：Tab — 支出 / 餘額 / 結算 / 成員 / 活動
- `composables/useSplitBill.js`：`connect(roomId, nickname, isCreating, maxPlayers)` 統一入口 + 帳務事件處理
- 在 `shared/data/tools.js` 註冊 `id: 'split-bill'`（需與 `rooms.app_id` 一致）、`router/index.js` 加入路由
- UI 遵守字體規範：任何可見文字 ≥ 16px，使用 `--fs-base` ～ `--fs-2xl`

---

## 6. 資料模型（概念）

**直接沿用**現有 `rooms`、`players` 表（`app_id = 'split-bill'`），不建立 User 表。以下為新增表：

```
Expense         (id, room_id, title, amount, currency, paid_at, category,
                 note, created_by_player, created_at, updated_at, deleted_at?)
ExpensePayer    (expense_id, member_id, paid_amount)          -- 支援多人付款
ExpenseSplit    (expense_id, member_id, owed_amount, share?)  -- 每人應負擔
Settlement      (id, room_id, from_member, to_member, amount, currency,
                 settled_at, status, note, created_by_player)
BillMember      (id, room_id, name, name_key, is_host, is_virtual, left_at?, created_at)
                -- UNIQUE (room_id, name_key)；name_key = trim + lower-case 後的名稱
                -- 名稱即 Key：同房間同名 = 同一成員
                -- 不需要 PlayerBinding：playerId 由 (room_id, name_key) 雜湊推導，不必儲存
ActivityLog     (id, room_id, actor_player_id, action, entity_type, entity_id,
                 before_json, after_json, created_at)
Attachment      (id, expense_id, url, mime_type)              -- 選配
```

**關聯重點**
- `BillMember` 是帳務層的成員，以 `(room_id, name_key)` 唯一；帳目一律綁 `BillMember`，**不直接綁 `players`**，這樣玩家離開／換裝置時帳目不受影響。
- 多裝置同名登入共用同一個 `playerId`，因此天然對應同一個成員。
- 實際 SQL 見 `server/split-bill/sql/001_split_bill.sql`（需在 Supabase SQL Editor 執行）；寫入支出以 RPC `bill_save_expense` 在單一交易內完成。
- 所有帳務表（Expense、Settlement、ActivityLog…）都必須落地在 DB，且以 `room_id` 建索引；不依賴任何 in-memory 狀態。
- `ExpensePayer` / `ExpenseSplit` 拆開，使「多人付款」與「各種分攤」統一表示。
- 一律軟刪除 (`deleted_at`)，餘額只計算未刪除資料。
- 後端使用 `service_role` 寫入，前端不直接對 Supabase 做 INSERT（依房間規範）。

---

## 7. Socket 事件草案

房間管理事件（`room:*`）沿用房間系統，不重複列出。本 App 新增 `bill:*`：

### Client → Server
| 事件 | Payload | 說明 |
|------|---------|------|
| `bill:expense-add` | `{ title, amount, currency, payers, splits, splitType, category, paidAt, note }` | 新增支出 |
| `bill:expense-update` | `{ expenseId, ...fields, baseUpdatedAt }` | 編輯（樂觀鎖） |
| `bill:expense-delete` | `{ expenseId }` | 軟刪除 |
| `bill:expense-restore` | `{ expenseId }` | 復原 |
| `bill:settlement-add` | `{ fromMember, toMember, amount, note }` | 記錄還款 |
| `bill:settlement-confirm` | `{ settlementId }` | 收款人確認（選配） |
| `bill:member-add-virtual` | `{ displayName }` | 新增虛擬成員 |
| `bill:member-claim` | `{ memberId }` | 認領既有成員（F-G5） |
| `bill:state-request` | — | 要求完整帳務狀態 |

### Server → Client
| 事件 | Payload | 說明 |
|------|---------|------|
| `bill:state` | `{ members, expenses, settlements, balances, suggestedTransfers }` | 完整狀態（加入／重連） |
| `bill:expense-changed` | `{ expense, action }` | 新增／更新／刪除，廣播全房 |
| `bill:settlement-changed` | `{ settlement }` | 結算變動 |
| `bill:balances-updated` | `{ balances, suggestedTransfers }` | 餘額重算結果 |
| `bill:activity` | `{ log }` | 新增一筆活動紀錄 |
| `bill:error` | `{ code, message }` | 例：`INVALID_SPLIT_SUM`、`EXPENSE_CONFLICT`、`FORBIDDEN` |

---

## 8. 主要畫面（Wireframe 清單）

1. Lobby：建立房間／加入房間（沿用統一 Lobby 流程，自動讀取 `?room=`）
2. 房間首頁：Tab — 支出 / 餘額 / 結算 / 成員 / 活動
3. 新增／編輯支出（分攤方式切換、即時顯示每人金額與驗證）
4. 餘額頁（誰欠誰、建議還款、一鍵結算）
5. 成員頁（房間成員、虛擬成員、認領、分享連結、踢人）
6. 「我最近的房間」列表（localStorage）

---

## 9. 非功能需求

| 項目 | 要求 |
|------|------|
| 正確性 | 金額使用整數；餘額總和恆為 0；分攤總和恆等於支出總額 |
| 一致性 | 新增／編輯支出的 DB 寫入需在單一交易內完成，成功後才廣播 |
| 安全 | 房間碼夠長且不易猜（沿用 `generateRoomId()`）；所有寫入由後端驗證該 socket 是否屬於該房間；無密碼系統 |
| 效能 | 單房間 1,000 筆支出內，餘額計算 < 500 ms |
| 可用性 | 手機優先；新增一筆支出 ≤ 3 步；字體 ≥ 16px |
| 可稽核 | 所有變更留下 ActivityLog |
| 持久性 | 帳務資料不得因 server 重啟或房間無人而遺失（見 12） |
| 國際化 | 先支援繁體中文 |

---

## 10. 邊界情況

- 付款人不在參與分攤名單內（代墊）——允許
- 支出編輯後使過去的結算金額不再合理——僅提示，不自動改動結算
- 成員離開／被踢時仍有未結清餘額——保留為「已離開成員」，帳目不刪除（F-G7）
- 金額為 0 或負數——禁止（退款以「結算」或獨立「退款」類型處理）
- 同一時間多人編輯同一筆支出——以 `updated_at` 做樂觀鎖，衝突時提示
- 刪除已被後續結算引用的支出——允許軟刪除，餘額重算並提示
- 有人輸入別人的名稱——系統無法分辨，會視為同一人（無驗證，見 2 的信任模型）
- 名稱拼寫不同（`Amy` vs `Amy `／`amy`）——正規化後視為同名；全形／半形、錯字則視為不同人，房主可用「合併成員」處理（選配）
- 同名成員已離開（`left_at` 有值）後又以該名稱加入——復原該成員，帳目接續
- 房主離線——房間系統既有的房主轉移機制處理；帳務操作不依賴房主在線
- 房間長期無人使用——不封存、不刪除，隨時用房間碼可回來

---

## 11. 測試重點

- 各分攤方式的總和驗證與零頭處理（含 1 元分 3 人等極端值）
- 餘額總和不變量（隨機產生大量支出／結算後驗證 = 0）
- 簡化債務結果套用後，所有人餘額歸零
- 權限：非房間成員的 socket 不可讀寫帳務；成員不可編輯他人支出（依設定）
- 軟刪除與還原後餘額正確
- 斷線重連後 `bill:state` 與離線期間他人新增的支出一致
- 玩家離開／被踢後帳目與餘額不變
- server 重啟後由 DB 還原帳務
- 後端整合測試比照 `room.integration.test.js` 的方式撰寫

---

## 12. 里程碑建議

| 階段 | 內容 |
|------|------|
| M1 | 註冊 `split-bill` App、Lobby／Room 頁骨架，接上 `registerRoomHandlers`，可建立／加入房間 |
| M2 | 支出 CRUD + 平均／指定金額分攤 + DB 持久化 + 即時同步 |
| M3 | 餘額計算、簡化債務、結算 |
| M4 | 百分比／份數／調整式分攤、活動紀錄、搜尋篩選 |
| M5 | 虛擬成員、離開成員處理、最近房間列表 |
| M6 | 匯出、多幣別、收據附件、PWA 通知 |

---

## 13. 待確認問題

已決定：
- ✅ 房間**永不封存、DB 長久保存**；房主可手動刪除房間
- ✅ **名稱即 Key**，換裝置輸入同名即可接回；**不加 PIN 碼**
- ✅ 以「選項」方式修改共用房間模組，不影響其他遊戲

待確認：
3. 是否需要多幣別？（旅遊場景幾乎必要）
4. 成員能否編輯他人建立的支出？
5. 人數上限預設多少？（房間系統目前有 `maxPlayers`）
6. 是否需要金流整合，還是僅「記帳」不處理實際轉帳？
