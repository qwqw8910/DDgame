# 甜點守衛戰：美術素材進度

用 Figma MCP 的 `generate_image` 分多天產圖。每次開工先讀這份，收工前更新。

## 額度規則

- Figma Starter 方案：每月 500 額度、每天上限 150，每月重置不累積
- 額度用完就停，隔天再繼續，不加購
- `gemini-3.1-flash-lite-image` 約每張 6 額度（2026-10-31：3 張用掉 18）

## 省額度原則

1. 用 `gemini-3.1-flash-lite-image`，不要用預設模型，目前品質已夠用
2. 一張圖最多放 5～8 個物件；10 個會出現文字和重複
3. 地圖上一格只有 14～28px，造型要剪影清楚、少細節
4. 下載連結 7 天後失效，生成後要馬上存到 `docs/assets/gem-td-art/`

## 現況

- Figma 檔案：<https://www.figma.com/design/pySWLG2aW3YCMztSsmjz9e>
- 主題：甜點守衛戰（害蟲入侵烘焙坊）
- 目前階段：全部完成，已接進遊戲
- 下一步：等試玩回饋，有想換的圖再補

## 階段

- [x] 階段 1：比較風格樣張，選定甜點主題
- [x] 階段 2：6 種蟲子（直接用樣張 `style-candy.jpg`）
- [x] 階段 3：大廳主視覺
- [x] 階段 4：地圖桌布與餅乾牆（程式繪製，不花額度，見 `GemBoard.vue`）
- [x] 階段 5：去背、縮圖，存到 `vue-app/public/gem-td/`
- [x] 階段 6：接進 `GemBoard.vue` 與大廳頁，已看過桌機與手機畫面

## 素材對照

原圖在 `docs/assets/gem-td-art/`，遊戲用的是 120px 透明 WebP。

| 原圖 | 輸出 |
|------|------|
| `style-candy.jpg` | `monsters/`：normal 工蟻、fast 疾行甲蟲、swarm 碎屑蟲、armored 犀牛甲蟲、air 胡蜂、boss 女王蟻 |
| `towers-base.jpg` | `towers/`：B 藍莓果凍、D 方糖、E 抹茶馬卡龍、G 薄荷糖、O 棉花糖、Q 檸檬軟糖、R 草莓塔、P 葡萄棒棒糖 |
| `towers-t1.jpg` | `towers/`：silver 銀糖珠、malachite 開心果泡芙、bloodstone 紅絲絨杯子蛋糕、gold 金箔松露巧克力、paraiba 汽水冰棒 |
| `towers-t2.jpg` | `towers/`：starsilver 星星銀蛋糕、peacock 開心果千層、crimson 雙層紅絲絨、royalgold 皇家巧克力塔、paraibaheart 汽水聖代 |
| `towers-extra.jpg` | `towers/`：mintchoc 薄荷巧克力餅、mintking 薄荷巧克力聖代、rainbow 彩虹馬卡龍塔、prism 彩虹千層酥 |
| `towers-t3.jpg` | `towers/`：galaxy 銀河慕斯、opera 翡翠歌劇院蛋糕、souffle 火焰舒芙蕾、emperor 帝王金箔蛋糕、aurora 極光芭菲 |
| `hero.jpg` | `hero.webp` |

未採用：`style-mine.jpg`、`style-sea.jpg`（風格候選）。

## 提示詞寫法

共通：`Bold thick dark outlines, flat saturated colors, chunky simple shapes, sticker style, no faces`

- 要加 `Absolutely no words, no captions, no letters, no labels, no grid lines`
- 每項加 `appears only once`，並指定每列幾個（例如 3 個加 2 個）

## 去背方式

從每格邊緣往內填色，移除接近白色的背景，只留最大連通區塊；碎屑蟲是多隻一組，全部保留。

## 生成紀錄

| 日期 | 內容 | 模型 | 尺寸 | 扣額度 | 結果 |
|------|------|------|------|--------|------|
| 2026-10-31 | 甜點風蟲子合集 | gemini-3.1-flash-lite-image | 1024 | 約 6 | 採用 |
| 2026-10-31 | 礦坑風怪物合集 | gemini-3.1-flash-lite-image | 1024 | 約 6 | 未採用 |
| 2026-10-31 | 深海風怪物合集 | gemini-3.1-flash-lite-image | 1024 | 約 6 | 未採用 |
| 2026-10-31 | 8 種基礎塔 | gemini-3.1-flash-lite-image | 1024 | 未確認 | 採用 |
| 2026-10-31 | 10 種特殊塔 | gemini-3.1-flash-lite-image | 1024 | 未確認 | 失敗：有文字、物件重複 |
| 2026-10-31 | 大廳主視覺 | gemini-3.1-flash-lite-image | 1536×864 | 未確認 | 採用 |
| 2026-10-31 | 5 種特殊塔（第一階） | gemini-3.1-flash-lite-image | 1024 | 未確認 | 採用 |
| 2026-10-31 | 5 種特殊塔（第二階） | gemini-3.1-flash-lite-image | 1024 | 未確認 | 採用 |
| 2026-10-31 | 4 種新路線特殊塔 | gemini-3.1-flash-lite-image | 1024 | 未確認 | 採用 |
| 2026-10-31 | 5 種第三階特殊塔 | gemini-3.1-flash-lite-image | 1024 | 未確認 | 採用 |
