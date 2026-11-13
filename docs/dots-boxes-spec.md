# 點格棋（`dots-boxes`）規格 v1

> 狀態：v1 已實作（伺服器純邏輯 + socket + 前端 + 音效），已用兩個瀏覽器完整對局驗證 | 日期：2026-11-13
> 房間：沿用 `server/room`（`registerRoomHandlers`），不修改共用模組
> 前端路由：`/dots-boxes`（入口）、`/dots-boxes/room`（房間）

---

## 1. 規則

| 項目 | 規則 |
|---|---|
| 人數 | 固定 2 人對戰；第 3 人起自動成為觀戰者（看得到盤面、不能下棋） |
| 盤面 | 4×4 格（25 點、40 線）或 5×5 格（36 點、60 線），房主在等待室選 |
| 行動 | 輪流在相鄰兩點之間畫一條線 |
| 拿格 | 畫下某格的第 4 條邊就拿下該格；**拿到格子要再畫一條**（一條線可同時封兩格），沒拿到才換人 |
| 結束 | 所有格子被拿下，或有人投降／離開 |
| 勝負 | 分數高者勝，同分平手；投降或中途離開判對手獲勝 |
| 先手 | 第一局為房主；每次「回大廳再玩一局」交換先手 |

### 計分模式

| 模式 | 每格分值 | 說明 |
|---|---|---|
| 普通 `classic` | 1 | 拿最多格的人獲勝 |
| 進階 `advanced` | 1–5，顯示在格子中央 | 拿下格子得到格內分數，總分高者勝 |

進階模式的分值分配：
- 從 `[1,1,1,2,2,2,3,3,4,5]` 隨機抽樣（小分多、5 分稀有）。
- **180° 點對稱**：格子 *i* 與格子 *n²−1−i* 同分，所以兩邊盤面完全對等，不會有一方角落全是高分。
- 開局時由伺服器產生，整局固定，所有人看到同一份。

---

## 2. 房間與狀態

```
waiting ─房主開始（需 2 人）→ playing ─全部拿完／投降／離開→ finished ─任一玩家→ waiting
```

- `rooms.app_id = 'dots-boxes'`，`max_players = 2`。
- 等待室：房主可改 `size`（4／5）與 `mode`（classic／advanced）；非房主唯讀。
- 對局中新加入者、或座位已滿時加入者成為觀戰者；玩家離開後觀戰者收到「可入座」通知。
- 斷線：座位保留，重連後補發視圖；對手頭像旁顯示「離線」。**沒有行動計時器**（避免朋友間對局被逼著秒下），對手離線太久可選擇投降或請房主中止。
- 主動離開房間（`leave`／`kick`）在進行中視為認輸。
- 遊戲狀態只存在記憶體；server 重啟後回到大廳。

### 線段編號（前後端共用）

```
橫線 h(r,c) = r*size + c               r∈[0,size]、c∈[0,size-1]
直線 v(r,c) = H + r*(size+1) + c       r∈[0,size-1]、c∈[0,size]，H = (size+1)*size
格子 (r,c) 編號 = r*size + c；四邊 = 上 h(r,c)、下 h(r+1,c)、左 v(r,c)、右 v(r,c+1)
```

---

## 3. Socket 事件（namespace `/dots-boxes`）

房間事件（`room:*`）見 [房間模組規格](design/房間模組_規格文件.md)。遊戲事件：

| 事件 | 方向 | 載荷 | 說明 |
|---|---|---|---|
| `db:sync` | C→S | `{ roomId }` | 索取目前視圖（進房後、切回前景時） |
| `db:set-options` | C→S | `{ roomId, options:{size,mode} }` | 房主、等待室限定 |
| `db:start` | C→S | `{ roomId }` | 房主，需 2 位玩家 |
| `db:move` | C→S | `{ roomId, edge }` | 畫線；非自己的回合會被退回 |
| `db:resign` | C→S | `{ roomId }` | 投降 |
| `db:restart` | C→S | `{ roomId }` | 結算後任一玩家回大廳；房主可在對局中途中止 |
| `db:state` | S→C | 視圖 | 每次變動全員推送（盤面沒有隱藏資訊） |
| `db:notice` | S→C | `{ message }` | 一般通知（對手離開等） |
| `db:error` | S→C | `{ code, message }` | `NOT_YOUR_TURN`、`EDGE_TAKEN`、`BAD_EDGE`、`FORBIDDEN`、`NEED_TWO`… |

視圖欄位：`phase, options, players[座位順序], mySeat(-1=觀戰), turn, lines[], boxes[], values[], scores[], counts[], total, moveCount, last{edge,seat,claimed[]}, winner(0|1|'draw'), endReason('complete'|'resign'|'leave'), startSeq, names, hostId, online`。

---

## 4. 介面（沿用設計系統 v2）

- 入口 `RoomEntry`、等待室 `RoomLobby`、頂列 `RoomHeader`，與其他多人遊戲同一套；不新增顏色、字體或圓角。
- **兩位玩家的區分**：設計系統只有一個主色，所以座位 0 用主色玫瑰紅、座位 1 用中性墨色；格子內另放字（普通模式＝拿下者暱稱首字，進階模式＝分值），不單靠顏色辨識。
- 棋盤是 SVG：線段有加粗的透明點擊區（手機好點）；可鍵盤操作（Tab 到線段、Enter／空白鍵畫線）。
- 提示：已有 3 條邊的格子畫虛線框（下一條線就能拿下）；最後一步的線有光暈；拿下的格子從中心彈出（尊重 `prefers-reduced-motion`）。
- 計分卡：色點＋名稱＋分數，輪到的人有外框；進階模式另顯示格數與「還剩幾分未被拿下」。

### 音效（Web Audio 即時合成，不需音檔）

`useDotsBoxesSfx`，偏好存 `localStorage['dots-boxes-sfx']`，頂列有開關。

| 名稱 | 觸發 | 聲音 |
|---|---|---|
| `line` | 任何人畫線沒拿格 | 短促木頭輕敲 |
| `claim` | 拿下格子 | 兩音上行，分值越高音越高 |
| `turn` | 換成我下 | 輕柔兩音提示 |
| `win`／`lose`／`draw` | 對局結束 | 上行琶音／下行／平音 |
| `join` | 等待室對手加入 | 兩音短鈴 |
| `click` | 打開音效 | 短點 |

首次進房／重新整理收到的狀態不出聲，避免突然響一串。

---

## 5. 檔案

```
server/dots-boxes/gameLogic.js      純規則（幾何、分值、畫線、結算、視圖）
server/dots-boxes/index.js          Socket 轉接、房間 hooks
server/tests/unit/dots-boxes/       規則單元測試
server/tests/integration/dots-boxes.test.js   真 socket.io + 假 DB 的整局流程
vue-app/src/apps/dots-boxes/        pages / components（DbBoard、DbScoreCard、DbSoundButton）/ composables / data
```

## 6. 之後可以做

- 行動計時器（可選）與「對手離線超過 N 秒可宣告勝利」。
- 單機對 AI（目前只有線上雙人）。
- 對局回放／戰績。
