# 今晚吃什麼 (Dinner Picker)

## Problem Statement

> **如何讓「今晚吃什麼」這個決策變得有趣、去除選擇焦慮，同時基於使用者位置給出真正有用的建議？**

---

## Recommended Direction

**純拉霸 + 命理台詞**：取得使用者 GPS 座標後，透過 OpenStreetMap Overpass API 抓取附近餐廳，以拉霸視覺動效隨機選出一間，並附上一句隨機廢話命理台詞。

操作路徑極短（定位 → 一鍵抽 → 結果），核心假設是：使用者最大的痛點是「啟動決策」，而不是「精細篩選」。隨機感本身就是儀式，降低心理負擔。

---

## 技術架構

```
瀏覽器 Geolocation API
    ↓
Overpass API (OpenStreetMap)
https://overpass-api.de/api/interpreter
    ↓
amenity=restaurant、fast_food、food_court
    ↓
Vue 3 前端 — 拉霸動畫 (CSS + setTimeout)
    ↓
顯示結果 + 隨機命理台詞
```

### 資料來源

| 項目 | 說明 |
|------|------|
| 來源 | OpenStreetMap Overpass API |
| 費用 | **完全免費**，無需 API Key |
| 查詢類型 | `amenity=restaurant` / `fast_food` / `food_court` |
| 搜尋半徑 | 300m / 500m / 1000m（使用者可切換） |
| 回傳格式 | JSON，包含名稱、座標、餐廳類型 |

---

## 頁面狀態機

```
idle → locating → fetching → ready → spinning → result
                                  ↑________________________↓ (再抽)
         ↓
       error（定位拒絕 / 無餐廳 / 網路失敗）
```

| 狀態 | 說明 |
|------|------|
| `idle` | 距離選擇 + 取得位置按鈕 |
| `locating` | 等待 GPS 授權，顯示 spinner |
| `fetching` | 呼叫 Overpass API，顯示 spinner |
| `ready` | 顯示餐廳數量，可切換距離並重抽 |
| `spinning` | 拉霸鼓輪動畫（高速模糊 → 逐漸減速） |
| `result` | 結果卡片 + 命理台詞 + 再抽 / 重設 |
| `error` | 友善錯誤提示，區分三種失敗場景 |

---

## MVP Scope

### ✅ 已實作

- [x] GPS 定位（`navigator.geolocation.getCurrentPosition`）
- [x] Overpass API 搜尋附近餐廳（含距離計算 Haversine 公式）
- [x] 距離切換：300m / 500m / 1km
- [x] 拉霸動畫：高速模糊 → 逐漸減速 → 定格
- [x] 隨機命理台詞（12 句）
- [x] 三種錯誤狀態的友善提示
- [x] 結果頁：顯示餐廳名稱 + 距離 + 命理台詞
- [x] 入口工具卡片整合至「甜甜的小秘密」首頁

### 檔案清單

| 檔案 | 說明 |
|------|------|
| `vue-app/src/pages/DinnerPickerPage.vue` | 主頁面（新建） |
| `vue-app/src/router/index.js` | 新增路由 `/dinner-picker` |
| `vue-app/src/data/tools.js` | 新增工具卡片定義 |

---

## Key Assumptions to Validate

- [ ] **附近餐廳密度足夠** — OpenStreetMap 在台北市區資料完整，但郊區可能只有 0-3 筆。測試方式：實際在不同地點啟動，觀察 `fetching → error（0 間）` 的觸發頻率。
- [ ] **使用者願意授權定位** — 若拒絕則功能完全失效。驗證方式：觀察錯誤頁觸發率，必要時加入「手動輸入地址」降級路徑。
- [ ] **抽一次不夠就繼續抽** — 「再抽」按鈕設計預設使用者會反覆使用。驗證：觀察每次 session 平均抽幾次。

---

## Not Doing（及原因）

- **Google Maps 評分顯示** — 需付費 API Key，MVP 驗證概念前不必要
- **候選清單手動勾選** — 增加操作步驟，破壞「一鍵抽」的核心快感
- **黑名單 / 最愛學習機制** — 需要 localStorage 持久化，複雜度不符合 MVP 階段
- **社群分享功能** — 目前定位單人使用，分享是 v2 優化項目
- **餐廳照片 / 詳細資訊** — Overpass API 不提供照片，取 Google 照片需 API 費用
- **倒數計時強制接受** — 娛樂性功能，MVP 不影響核心體驗

---

## Open Questions

- 如果 Overpass API 伺服器高峰期回應慢（> 5 秒），是否要做 timeout 中斷並給使用者提示？
- 是否需要「只抽有名稱且資料完整的餐廳」過濾邏輯（目前已過濾無名稱節點）？
- 下一步：升級為 Google Maps Places API（需信用卡綁定），以取得評分、營業時間、照片？

---

## 升級路徑（v2 建議）

1. **Google Maps Places API** — 評分 + 照片 + 是否營業中
2. **手動加入候選池** — 點選地圖上的餐廳手動加入抽籤名單
3. **黑名單封印** — 長按結果可「封印這間」，下次排除
4. **分享功能** — 抽到結果後生成分享卡片（Canvas API）
