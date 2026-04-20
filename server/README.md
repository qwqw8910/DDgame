# 懂我再說 — 後端伺服器

Socket.io + Express 即時遊戲伺服器，搭配 Supabase 作為資料庫。

---

## 本機開發

```bash
cd server
cp .env.example .env   # 填入 Supabase 設定
npm install
npm run dev            # 使用 node --watch 自動重啟
```

伺服器預設在 `http://localhost:3000` 啟動。

---

## 環境變數說明

| 變數 | 說明 |
|------|------|
| `SUPABASE_URL` | Supabase 專案 URL |
| `SUPABASE_SERVICE_KEY` | Service Role Key（Settings → API → service_role）|
| `CORS_ORIGIN` | 前端來源，多個用逗號分隔 |
| `PORT` | 伺服器 Port（預設 3000，Railway 會自動注入）|

> ⚠️ **使用 `service_role` key**，可繞過 RLS，請勿在前端使用。

---

## 部署到 Railway（免費）

1. 前往 [railway.app](https://railway.app) 並登入 GitHub
2. 點選 **New Project → Deploy from GitHub repo**
3. 選擇 `testdemo` repo
4. 設定 **Root Directory** 為 `server`
5. 在 **Variables** 頁面加入環境變數：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `CORS_ORIGIN`（填入你的 GitHub Pages URL）
6. Railway 自動執行 `npm install && npm start`
7. 取得部署 URL（例如 `https://dongwo.up.railway.app`）

---

## 部署到 Render（免費備選）

1. 前往 [render.com](https://render.com) → **New Web Service**
2. 連結 GitHub repo，設定：
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
3. 加入環境變數（同上）

> ⚠️ Render 免費方案有 **冷啟動**（閒置 15 分鐘後第一次請求約等 30 秒）

---

## Socket.io 事件總覽

### 前端 → 伺服器

| 事件 | 資料 | 說明 |
|------|------|------|
| `join_room` | `{ roomId, playerId }` | 加入房間頻道 |
| `toggle_ready` | — | 切換準備狀態 |
| `start_game` | — | 房主開始遊戲 |
| `select_topic` | `{ topicId }` | 被猜者選主題 |
| `submit_answer` | `{ answer }` | 被猜者提交答案（私下） |
| `submit_guess` | `{ guess }` | 其他玩家提交猜測 |
| `reveal_round` | — | 房主手動觸發揭曉 |
| `next_round` | — | 房主進行下一回合 |
| `end_game` | — | 房主結束遊戲 |
| `restart_game` | — | 房主重新開始 |
| `kick_player` | `{ targetPlayerId }` | 房主踢人 |
| `set_online` | `{ isOnline }` | 更新上線狀態 |

### 伺服器 → 前端

| 事件 | 資料 | 說明 |
|------|------|------|
| `room_state` | `{ room, players, topics, currentRound, currentQuestion, guesses, myPlayerId }` | 加入房間後的完整狀態 |
| `players_updated` | `{ players }` | 玩家列表有變動 |
| `game_started` | `{ room, currentRound }` | 遊戲開始 |
| `round_updated` | `{ currentRound, currentQuestion? }` | 回合狀態變更（subject_answer 遮蔽） |
| `guess_progress` | `{ submitted, total }` | 猜測進度更新 |
| `round_revealed` | `{ currentRound, guesses, players }` | 揭曉結果（含答案）|
| `game_finished` | `{ room, players }` | 遊戲結束 |
| `game_restarted` | `{ room, players }` | 重新開始 |
| `answer_accepted` | `{ answer }` | 告知被猜者答案已收到 |
| `you_were_kicked` | — | 告知被踢玩家 |
| `error` | `{ message }` | 錯誤訊息 |
