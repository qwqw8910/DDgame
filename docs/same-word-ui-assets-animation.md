# 同詞相遇：UI、圖片素材、生圖提示詞、動畫與音效規劃

> 狀態：草案 | 日期：2026-10-30
> 對應規格：[same-word-spec.md](same-word-spec.md)
> 視覺方向（暫定，可改）：**「紅線配對」**。紅線把兩個人牽在一起，越早牽上越亮。沿用 `character-storm` 已有的色票（`--cs-hot #FB7185`、`--cs-gold #FBBF24`、`--cs-tile-face #FFFDF5`、`--cs-tile-ink #1B1F2A`），這樣素材與既有元件不會打架。

---

## 0. 結論先看

| 項目 | 決定 |
|---|---|
| 要請 GPT 生的圖 | 共 **19 張**：稱號徽章 13、主視覺 2、卡背 1、小元素 3 |
| 生成方式 | **6 次生成**（3 張多物件圖 + 3 張單圖），用 `slice_sheet.py` 切開，見 2.4 |
| 圖裡不放文字 | 中文字 AI 生圖很容易錯，所有字（稱號、玩家名、數字）一律用 HTML 疊上去 |
| 檔案格式 | 輸出 PNG（透明）→ 轉 **WebP（含 alpha）**，全部合計目標 ≤ 400 KB |
| 動畫原則 | **只動 `transform` 與 `opacity`**，預設零新增依賴（CSS + Vue `<Transition>`/`<TransitionGroup>` + 既有 `CsConfetti` 寫法） |
| 慶祝特效 | 預設用純 CSS 彩帶；若要更華麗，可選裝 `canvas-confetti`（見第 4 節） |
| 低階手機 | 自動進「輕量模式」，粒子減半、關掉裝飾動畫與裝飾音 |
| 音效 | 沿用既有的 **Web Audio 即時合成**（不下載音檔），16 個音效，等級越高越華麗（第 7 節） |
| UI 畫面 | 書寫／揭曉／結算／大廳草圖見第 6 節 |

---

## 1. 圖片素材清單

放置位置：`vue-app/public/same-word/`（與既有 `public/character-storm/` 一致，由 CSS／`<img>` 以絕對路徑引用）。

| # | 檔名 | 用途 | 生成尺寸 | 顯示尺寸（CSS px） | 輸出尺寸 |
|---|---|---|---|---|---|
| 1–9 | `badge-t1.webp` … `badge-t8.webp`、`badge-enemy.webp` | 9 個默契等級徽章（第 1 輪 … 第 8 輪以後、死對頭） | 1024×1024 | 96–160 | 256×256 |
| 10 | `badge-unique.webp` | 🦄 與眾不同 | 1024×1024 | 160 | 256×256 |
| 11 | `badge-loner.webp` | 🐺 孤狼 | 1024×1024 | 96 | 256×256 |
| 12 | `badge-magnet.webp` | 🧲 磁鐵 | 1024×1024 | 96 | 256×256 |
| 13 | `badge-outlier.webp` | 🛸 離譜王 | 1024×1024 | 96 | 256×256 |
| 14 | `hero-unique.webp` | 結算「與眾不同」全螢幕主角 | 1024×1024 | 280 | 640×640 |
| 15 | `hero-lobby.webp` | 大廳主視覺（兩個角色被紅線牽著） | 1536×1024（橫） | 360 寬 | 720×480 |
| 16 | `card-back.webp` | 詞卡背面（翻牌前） | 1024×1536（直，2:3） | 120×180 | 240×360 |
| 17 | `fx-heart.webp` | 配對成功飄出的愛心 | 512×512 | 24–48 | 96×96 |
| 18 | `fx-sparkle.webp` | 四芒星閃光 | 512×512 | 16–40 | 96×96 |
| 19 | `fx-thread.webp` | 一小段彎曲紅線／蝴蝶結（結算裝飾） | 1024×512 | 160 寬 | 320×160 |

**不需要生圖的東西**：彩帶（CSS）、倒數環（SVG）、玩家頭像（沿用 `character-storm/data/playerLook.js`）、背景（CSS 漸層）、紅線連線（SVG path）。

### 1.1 設計約束（先告訴 AI，後面所有圖才會一致）

- 風格：可愛、扁平向量貼紙風，粗白邊（sticker outline），輕微柔和陰影。
- 色調：珊瑚紅／粉紅為主（`#FB7185`），金色點綴（`#FBBF24`），奶油白（`#FFFDF5`），深墨色線稿（`#1B1F2A`）。
- 構圖：單一物件置中，四周留 10% 以上空白（避免被裁切，也方便做光暈動畫）。
- 每張圖不得出現任何文字、字母、數字、浮水印、棋盤格底。

---

## 2. 給 GPT 的提示詞

### 2.1 透明背景：先讀這段

1. **用 API（或有「透明背景」選項的介面）**：把 `background` 設成 `transparent`，輸出格式選 `png`（或 `webp`）。我不確定你使用的 "gpt image 2" 參數名稱是否與 `gpt-image-1` 相同，請以你實際介面為準。
2. **只能用聊天介面、沒有參數可選時**：提示詞裡的 `transparent background` **不保證**真的有 alpha 通道，常見失敗是把「棋盤格」或白底畫進圖裡。這時改用**備案**：
   - 把提示詞中的 `Fully transparent background` 換成 `Flat solid pure magenta #FF00FF background, no gradient, no shadow on the background`，
   - 拿到圖後用去背工具（Photopea／remove.bg／`rembg`）去掉洋紅色，再存成 PNG。
   - 洋紅色不要出現在主體上（所以本風格色票避開洋紅）。
3. **收圖後一定要檢查**：把圖放在深色與淺色兩種背景上看，邊緣不能有白色／洋紅色殘邊（halo）。粗白邊貼紙風可以大幅降低這個問題，這也是本風格選貼紙風的原因之一。

### 2.2 共用前綴（每一張都貼在最前面）

```
Cute flat vector sticker illustration, single object centered, thick clean white
sticker outline, soft subtle shading, warm palette of coral pink (#FB7185),
gold (#FBBF24), cream white (#FFFDF5) with dark ink outlines (#1B1F2A),
generous empty margin around the object (at least 10%), crisp edges.
Fully transparent background, PNG with alpha channel.
No text, no letters, no numbers, no watermark, no checkerboard pattern,
no background scenery, no floor shadow.
```

### 2.3 各張圖提示詞

貼法：`[共用前綴]` + 下面那一段。

**稱號徽章（圓形貼紙徽章，圖 1–13）** 每張再加：`Round badge emblem, 1:1 square, same sticker style as a matching set.`

| # | 檔名 | 提示詞（接在共用前綴之後） |
|---|---|---|
| 1 | badge-t1 天生一對 | `A glowing red heart made of two halves fitting perfectly together, golden sparkles around, a tiny red thread bow on top. Most radiant and luxurious badge of the set.` |
| 2 | badge-t2 心有靈犀 | `Two small pink hearts connected by a glowing curved thread, tiny stars floating between them, dreamy telepathy feeling.` |
| 3 | badge-t3 默契十足 | `Two jigsaw puzzle pieces fitting together perfectly, coral pink and gold, small checkmark sparkle.` |
| 4 | badge-t4 還算合拍 | `Two overlapping round speech bubbles in warm orange and cream with a small smile mark between them, friendly and calm.` |
| 5 | badge-t5 慢熟型 | `A small green seedling with two leaves sprouting from a tiny pot, a little snail beside it, soft and slow mood.` |
| 6 | badge-t6 需要磨合 | `Two interlocking gears in muted blue-grey with a small wrench, slightly misaligned teeth, hardworking mood.` |
| 7 | badge-t7 勉強同頻 | `Two tin cans connected by a wobbly string (tin can telephone), muted dusty colors, slightly worn.` |
| 8 | badge-t8 差點錯過 | `A pastel pink heart with a band-aid across it, faded colors, shy and relieved mood.` |
| 9 | badge-enemy 死對頭 | `A heart snapped in two halves with a lightning bolt between them, dark purple and grey tones with a hint of red, dramatic but still cute, not scary.` |
| 10 | badge-unique 與眾不同 | `A cute sparkling unicorn head with a rainbow mane and golden horn, star-shaped sparkles, proud expression. Looks special and unique.` |
| 11 | badge-loner 孤狼 | `A cute lone wolf howling at a small crescent moon, blue-grey fur, tiny stars, lonely but cool.` |
| 12 | badge-magnet 磁鐵 | `A red horseshoe magnet with silver tips pulling several tiny gold stars toward it.` |
| 13 | badge-outlier 離譜王 | `A cute flying saucer UFO wearing a small golden crown, light beam below, comedic and silly.` |

**主視覺與其他**

| # | 檔名 | 提示詞（接在共用前綴之後） |
|---|---|---|
| 14 | hero-unique | `Large hero illustration: a cheerful rainbow-colored sparkling unicorn standing proudly, one hoof raised, big golden star sparkles around, joyful victory pose. Full body, square 1:1 composition.` |
| 15 | hero-lobby | `Wide 3:2 composition: two cute round characters (one coral pink, one cream) standing close, connected by a long glowing red thread tied in a bow between their hands, small hearts and sparkles floating, friendly and playful.` |
| 16 | card-back | `Vertical 2:3 playing card back, rounded corners, cream white card with thin gold border and a subtle repeating small heart-and-thread pattern in soft coral pink, symmetrical, elegant, no text. Slight drop-shadow is NOT included.` |
| 17 | fx-heart | `A single glossy coral pink heart with a small white highlight, simple icon, 1:1.` |
| 18 | fx-sparkle | `A single four-pointed gold sparkle star with soft white center, simple icon, 1:1.` |
| 19 | fx-thread | `A short curly red silk thread ending in a small bow, horizontal 2:1 composition, glossy highlights.` |

> 所有「看起來不對」的圖，**不要在同一串對話一直修**（風格會漂移）。重新生成，並維持相同的共用前綴。徽章 1–13 盡量在同一個對話或同一批連續生成，風格較一致。

### 2.4 建議做法：整張生成，再用 Python 切

19 張分開生成要 19 次，風格也容易漂移。建議**同尺寸的物件放在同一張圖上生成**，再用腳本切開：

| 張數 | 內容 | 版型 | 切完輸出 |
|---|---|---|---|
| 圖 A | 徽章 1–6（天生一對 … 需要磨合） | 3 欄 × 2 列，1536×1024 | `badge-t1` … `badge-t6` |
| 圖 B | 徽章 7–12（勉強同頻、差點錯過、死對頭、與眾不同、孤狼、磁鐵） | 3 欄 × 2 列，1536×1024 | `badge-t7`、`badge-t8`、`badge-enemy`、`badge-unique`、`badge-loner`、`badge-magnet` |
| 圖 C | 離譜王徽章 + 愛心 + 閃光 + 紅線 | 2 欄 × 2 列，1024×1024 | `badge-outlier`、`fx-heart`、`fx-sparkle`、`fx-thread` |
| 圖 D | 與眾不同主角 | 單張 1024×1024 | `hero-unique` |
| 圖 E | 大廳主視覺 | 單張 1536×1024 | `hero-lobby` |
| 圖 F | 詞卡背面 | 單張 1024×1536 | `card-back` |

共 **6 次生成**，而不是 19 次。主視覺與卡背尺寸、比例都不同，單獨生成，同樣用腳本去透明邊與輸出。

**為什麼不直接切固定格線**：AI 畫不準格線，物件常常偏移或大小不一。腳本改成「用透明度找出彼此分離的物件」，不假設格線對齊。

**整張生成的風險（要先知道）**
- 生成的物件數量可能不是你要的（5 個或 7 個）。腳本數量對不上就會中止，並輸出 `_debug.png`（紅框是偵測結果），**不會默默切錯**。
- 物件黏在一起就切不開。提示詞已要求大間距，不行就重新生成。
- AI **不保證**照你列的順序擺放。切完看 `_preview.png`，若順序不對，改檔名對應即可，不必重新生成。
- 同一張上的物件，視覺重量要相近；若某個特別大或特別小，重新生成比較快。

**每張圖的提示詞**＝下面的「整張前綴」+ 該圖的物件清單。

整張前綴（把 `N`、`C`、`R` 換成物件數、欄數、列數）：

```
A sticker sheet containing exactly N separate illustrations arranged in a grid of
C columns by R rows. Cute flat vector sticker style, thick clean white sticker
outline on every item, soft subtle shading, warm palette of coral pink (#FB7185),
gold (#FBBF24), cream white (#FFFDF5) with dark ink outlines (#1B1F2A).
Every illustration is a round badge emblem of similar size and visual weight,
drawn as a matching set.
Each illustration is fully separated from the others by wide empty transparent
space (at least 20% of one item's width). No item touches, overlaps, or is cropped
by another item or by the image edge.
No grid lines, no frames, no dividers, no labels, no text, no letters, no numbers,
no watermark, no checkerboard pattern, no background scenery, no floor shadows.
Fully transparent background, PNG with alpha channel.
Items in reading order (left to right, top to bottom):
```

**圖 A**（N=6, C=3, R=2），接在前綴後：

```
1) A glowing red heart made of two halves fitting perfectly together, golden sparkles around, a tiny red thread bow on top. The most radiant and luxurious badge of the set.
2) Two small pink hearts connected by a glowing curved thread, tiny stars floating between them, dreamy telepathy feeling.
3) Two jigsaw puzzle pieces fitting together perfectly, coral pink and gold, small checkmark sparkle.
4) Two overlapping round speech bubbles in warm orange and cream with a small smile mark between them, friendly and calm.
5) A small green seedling with two leaves sprouting from a tiny pot, a little snail beside it, soft and slow mood.
6) Two interlocking gears in muted blue-grey with a small wrench, slightly misaligned teeth, hardworking mood.
```

**圖 B**（N=6, C=3, R=2）：

```
1) Two tin cans connected by a wobbly string (tin can telephone), muted dusty colors, slightly worn.
2) A pastel pink heart with a band-aid across it, faded colors, shy and relieved mood.
3) A heart snapped in two halves with a lightning bolt between them, dark purple and grey tones with a hint of red, dramatic but still cute, not scary.
4) A cute sparkling unicorn head with a rainbow mane and golden horn, star-shaped sparkles, proud expression. Looks special and unique.
5) A cute lone wolf howling at a small crescent moon, blue-grey fur, tiny stars, lonely but cool.
6) A red horseshoe magnet with silver tips pulling several tiny gold stars toward it.
```

**圖 C**（N=4, C=2, R=2；前綴中的 "round badge emblem" 這句改成 "Items are drawn as a matching set"）：

```
1) A cute flying saucer UFO wearing a small golden crown, light beam below, comedic and silly. Round badge emblem.
2) A single glossy coral pink heart with a small white highlight, simple icon.
3) A single four-pointed gold sparkle star with soft white center, simple icon.
4) A short curly red silk thread ending in a small bow, glossy highlights.
```

**圖 D / E / F**（單張）：沿用第 2.2 節的共用前綴 + 第 2.3 節的 #14（hero-unique）、#15（hero-lobby）、#16（card-back）提示詞。

**切圖腳本**：[assets/same-word/slice_sheet.py](assets/same-word/slice_sheet.py)，只需要 Pillow。我已用合成的測試圖驗證過：能依序切出物件、把脫離主體的閃光碎片併回去、沒有透明度或數量不符時中止。**還沒有拿真正的 AI 生成圖測試過**，第一次收到圖時要看 `_preview.png`。

```bash
# 圖 A（取自 docs/assets/same-word/ 目錄；輸出到 vue-app/public/same-word/）
python slice_sheet.py sheetA.png --cols 3 --size 256 --out ../../../vue-app/public/same-word \
  --names badge-t1,badge-t2,badge-t3,badge-t4,badge-t5,badge-t6

# 圖 B
python slice_sheet.py sheetB.png --cols 3 --size 256 --out ../../../vue-app/public/same-word \
  --names badge-t7,badge-t8,badge-enemy,badge-unique,badge-loner,badge-magnet

# 圖 C（統一輸出 256，CSS 縮小顯示；每張約 5 KB，不另外縮）
python slice_sheet.py sheetC.png --cols 2 --size 256 --out ../../../vue-app/public/same-word \
  --names badge-outlier,fx-heart,fx-sparkle,fx-thread

# 單張：去掉多餘透明邊並輸出
python slice_sheet.py heroUnique.png --cols 1 --size 640 --out ../../../vue-app/public/same-word --names hero-unique
python slice_sheet.py heroLobby.png  --cols 1 --size 720 --no-square --out ../../../vue-app/public/same-word --names hero-lobby
python slice_sheet.py cardBack.png   --cols 1 --size 360 --no-square --out ../../../vue-app/public/same-word --names card-back
```

若圖是洋紅底備案，每個指令加 `--chroma`。零碎閃光被切成獨立物件時，調大 `--merge`（預設 32 像素）。

### 2.5 收圖檢查表

- [ ] 有 alpha 通道（放在深色背景上沒有白框／洋紅框／棋盤格）
- [ ] 圖中沒有任何文字或數字
- [ ] 主體四周至少 10% 空白，沒有被裁切
- [ ] 徽章 1–13 風格一致（白邊粗細、色調、線稿）
- [ ] 轉成指定輸出尺寸與 WebP（品質 80，保留透明）後，邊緣仍乾淨
- [ ] 每張 ≤ 40 KB（主視覺 ≤ 80 KB，卡背 ≤ 30 KB），整包 ≤ 400 KB

---

## 3. 動畫設計

### 3.1 效能預算（「不能太 LAG」的具體數字）

| 項目 | 目標 |
|---|---|
| 可動的 CSS 屬性 | **只有 `transform` 與 `opacity`**。禁止動畫 `width/height/top/left/margin/box-shadow/filter: blur`（會觸發重排或大量重繪） |
| 同時進行的動畫元素 | 手機 ≤ 40、桌機 ≤ 80（粒子與彩帶都算） |
| 12 張詞卡同時翻牌 | 用 stagger（每張延遲 60–80 ms），不要同一幀 12 張一起翻 |
| `will-change` | 只加在「即將動」的元素，動畫結束移除；不要全域加 |
| 計時器倒數 | 不用 JS 每幀更新 DOM，用 SVG `stroke-dashoffset` + CSS `transition: linear`，每秒只更新一次數字 |
| 分頁隱藏時 | 暫停特效（`document.hidden`），回來不補播 |
| 測試基準 | Chrome DevTools Performance，CPU 4× slowdown，12 人揭曉 + 彩帶，FPS 維持 ≥ 50，沒有 Long Task > 50 ms |

**輕量模式**（符合任一條件就啟動）：`prefers-reduced-motion: reduce`、`navigator.hardwareConcurrency <= 4`、`navigator.deviceMemory <= 4`（若瀏覽器有提供）、連續 3 次量到 FPS < 30（用 `requestAnimationFrame` 簡單偵測）。輕量模式下：粒子數減半、不播彩帶、只保留翻牌與淡入、停掉循環裝飾動畫。專案已有 `prefers-reduced-motion` 的處理，沿用同一個判斷。

### 3.2 動畫清單

| # | 事件 | 效果 | 作法 | 成本 |
|---|---|---|---|---|
| A1 | 送出詞 | 輸入框輕微縮放後鎖定，頭像亮起 | CSS `transform: scale` + `opacity` | 極低 |
| A2 | 輸入不合法 | 左右抖動 + 紅色提示 | CSS keyframes `translateX` | 極低 |
| A3 | 倒數最後 5 秒 | 倒數環變紅、數字脈衝 | SVG `stroke-dashoffset` + CSS `scale` | 極低 |
| A4 | 揭曉翻牌 | 詞卡依序 3D 翻面（背面 `card-back`） | CSS `rotateY` + `backface-visibility`，stagger 70 ms | 低（12 張要 stagger） |
| A5 | 相同詞併成群組 | 卡片滑動靠攏成同色群組 | Vue `<TransitionGroup>` 的 move class（FLIP，內建） | 低 |
| A6 | 新配對成功 | 稱號卡由上方彈入，徽章「蓋章」（放大 1.6 → 1 + 輕微旋轉） | CSS `cubic-bezier` 彈性曲線，不引入 spring 函式庫 | 低 |
| A7 | 默契值數字 | 0% 滾到 85% | CSS `@property` 計數器（Safari 16.4+），不支援則直接顯示結果 | 極低 |
| A8 | 天生一對（第 1 輪） | 全螢幕彩帶 + 愛心飄升 + 光暈 | 彩帶用 `CsConfetti` 同款純 CSS；愛心用 `fx-heart` 20 顆 | 中（唯一重場面） |
| A9 | 第 2–3 輪配對 | 小型愛心飄出 + 閃光 | `fx-heart` / `fx-sparkle` 6–10 顆 | 低 |
| A10 | 第 4 輪以後 | 只有稱號卡淡入，無粒子 | `opacity` | 極低 |
| A11 | 死對頭（結算） | 徽章左右搖晃、裂開感（`badge-enemy` 輕微抖動一次） | CSS keyframes | 極低 |
| A12 | 紅線連線（若採用） | 兩個頭像間畫出紅線 | SVG `<path>` + `stroke-dashoffset`，只畫「本輪新配對」，一次最多 6 條 | 低~中 |
| A13 | 與眾不同登場 | 螢幕變暗、聚光燈、`hero-unique` 由上彈入並停留 | 暗幕用 `opacity`，聚光燈是靜態 radial-gradient 疊層（不動畫漸層本身） | 低 |
| A14 | 結算熱力圖 | 格子依對角線順序淡入 | `opacity` + stagger，上限 66 格，手機改為「點人看列表」不渲染整張 | 低 |
| A15 | 離譜王 | UFO 左右飄移循環 | CSS `translate` 循環（輕量模式關閉） | 極低 |

### 3.3 等級與動畫強度對應

| 等級 | 稱號 | 動畫 | 粒子數（桌機／手機） |
|---|---|---|---|
| 第 1 輪 | 天生一對 | A6 + A8 | 彩帶 70／40 + 愛心 20／12 |
| 第 2–3 輪 | 心有靈犀／默契十足 | A6 + A9 | 10／6 |
| 第 4–5 輪 | 還算合拍／慢熟型 | A6 | 0 |
| 第 6 輪以後 | 需要磨合 … 差點錯過 | A6 簡化（只淡入） | 0 |
| 未配對 | 死對頭 | A11（結算時） | 0 |

「越早配對越誇張」本身也是效能策略：最耗效能的場面只在第 1 輪出現。

### 3.4 實作慣例

- 沿用專案現況：不使用 `<style scoped>`，動畫寫在 `vue-app/src/apps/same-word/styles/same-word.css`（類似 `character-storm.css`），以 `sw-` 為前綴避免衝突。
- 動畫時間、緩動曲線抽成 CSS 變數（`--sw-ease-pop`、`--sw-dur-flip` 等），方便一次調整。
- 粒子元件（`SwConfetti.vue`、`SwHearts.vue`）掛載時隨機產生一次，動畫結束後由父層 `v-if` 卸載，不要常駐。

---

## 4. 開源參考與是否採用

> ⚠️ 以下授權與特性是我憑既有知識整理，**本次沒有連網逐一核對**。真的要安裝前，請查一次該專案的 README／授權與最新版本；LottieFiles 等素材站的圖檔授權是各素材個別標示，不能一概視為可商用。

| 專案 | 用途 | 授權（需再確認） | 建議 |
|---|---|---|---|
| Vue 內建 `<Transition>` / `<TransitionGroup>` | 進出場、卡片靠攏（FLIP） | Vue（MIT） | ✅ **採用**，不用新增依賴 |
| 專案內 `CsConfetti.vue` | 純 CSS 彩帶（隨機一次、CSS 動畫） | 專案自有 | ✅ **採用**，抽成共用寫法或複製成 `SwConfetti.vue` |
| `canvas-confetti`（catdad） | 單一 canvas 彩帶、愛心／星形粒子，可自動停用動畫 | ISC | 🟡 **可選**。想要更華麗的第 1 輪慶祝時再裝；它只在觸發時才建立 canvas，體積小 |
| `@formkit/auto-animate` | 列表增減自動動畫（一行指令） | MIT | 🟡 可選，用在玩家清單。`TransitionGroup` 已夠用，不是必要 |
| `motion`（motion.dev，前身 Framer Motion／Motion One） | WAAPI 為基礎的動畫、spring | MIT | 🟡 只有在需要複雜 spring／手勢時才考慮；本案不需要 |
| `lottie-web` / dotLottie | 播放設計師做的 Lottie 動畫 | MIT | ❌ **不採用**。包體大、CPU 吃重，且需要另外製作 Lottie 檔，與「不能太 LAG」衝突 |
| `tsParticles` | 大量粒子系統 | MIT | ❌ **不採用**。功能遠超需求，12 人手機場景太重 |
| `animate.css` | 現成 keyframes | 授權條款較特殊，需確認 | ❌ 不採用，這幾個動畫自己寫更省 |

**建議組合**：Vue `<Transition>` + 純 CSS keyframes + 沿用 `CsConfetti` 寫法，**零新增依賴**。若驗收時覺得第 1 輪慶祝不夠華麗，再單獨加 `canvas-confetti`（只在 A8 使用），其他動畫維持純 CSS。

---

## 5. 驗收清單

**素材**
- [ ] 19 張圖都有 alpha 通道，深／淺背景皆無殘邊
- [ ] 圖中無文字
- [ ] 整包 ≤ 400 KB（WebP）

**效能**
- [ ] CPU 4× slowdown，12 人揭曉 FPS ≥ 50
- [ ] 第 1 輪「天生一對」全場面不掉到 30 FPS 以下
- [ ] 分頁切到背景再回來沒有動畫堆積
- [ ] 輕量模式可用（用 DevTools 模擬 `prefers-reduced-motion`）
- [ ] 動畫只用 `transform` / `opacity`（Performance 面板看不到 Layout 紅條）

**體驗**
- [ ] 詞卡翻牌、群組靠攏、稱號蓋章順序清楚，不互相遮擋
- [ ] 12 人在 360 px 寬手機上不溢出、不需要橫向捲動
- [ ] 色彩對比符合深色／淺色兩種主題（沿用 `character-storm` 兩套 token）

---

## 6. UI 畫面草圖（討論稿）

手機優先（朋友各自用手機、同時在語音裡玩），輸入框與按鈕做大。沿用平台既有的 Tailwind 4、Reka UI 彈窗、字級 16px 以上。

### 6.1 書寫畫面

```
┌─────────────────────────────┐
│  第 3 輪 / 8         ⏱ 00:32 │
│  前幾輪 ▸（可展開）           │
│  R2  小明 夏天 · 小華 夏天 ✓  │
│         ┌───────────┐       │
│         │  輸入一個詞 │       │
│         └───────────┘       │
│          [   送出   ]        │
│   ● 小明  ● 小華  ○ 阿文     │
│   ● 小美  ○ 阿德  ● 小傑     │
│   （亮 = 已送出，不顯示內容）  │
└─────────────────────────────┘
```

- 「前幾輪」可展開，第 1 輪不顯示；人多時預設只顯示上一輪，12 人改用抽屜收起。
- 玩家頭像排成一圈，12 人放得下。亮起代表已送出，**不顯示送出時間**，避免洩漏誰先想到。
- 輸入不合法（數字、符號）時，輸入框抖動並提示（A2）。

### 6.2 揭曉畫面

```
┌─────────────────────────────┐
│  第 3 輪揭曉                 │
│  ┌ 3 人同心 ──────────┐     │
│  │ 夏天  小明 小華 小美 │     │
│  └────────────────────┘     │
│  ┌──────┐ ┌──────┐          │
│  │ 海邊  │ │ 冰淇淋│  …      │
│  │ 阿文  │ │ 小傑  │          │
│  └──────┘ └──────┘          │
│  ✨ 小明 × 小華  心有靈犀 85% │ ← 只在新配對時跳出
│  誰的詞最離譜？ 點一張卡投票   │
│  還沒配對：阿文、阿德          │
│            [ 下一輪 ]         │
└─────────────────────────────┘
```

- 詞卡依序翻開，相同詞併成同色群組；3 人以上顯示「N 人同心」。12 人時詞卡用網格排列。
- 底部列出「還沒配對」的人，製造緊張感：剩 2 人時大家都知道快結束了。

### 6.3 結算畫面

```
1. 🦄 與眾不同（全螢幕，若有）
2. 💘 最佳拍檔
3. 💔 頭號死對頭（前 3 組）
4. 🧲 磁鐵 / 🛸 離譜王
5. 📊 每人默契指數長條圖
6. 展開：N×N 默契熱力圖
          [再玩一局]
```

- 順序從最戲劇到最細節，方便邊看邊念給語音裡的朋友聽。
- 手機上 12 人的熱力圖有 66 格，改成「點一個人，列出他與每個人的稱號」；桌面版才顯示完整矩陣。

### 6.4 大廳

沿用既有 Lobby 流程：暱稱 + 建房（人數 2–12、計時、輪數上限）／輸入房間碼加入；房內等待區顯示玩家清單，房主按開始。右上角放音效開關（見第 7 節）。

---

## 7. 音效

### 7.1 現況與結論

專案裡 `character-storm` 已經有一套 **Web Audio 即時合成的音效引擎**（`useCharacterStormSfx.js`）：不需要任何音檔、單一 `AudioContext`、`master` 增益 + 壓縮器防爆音、靜音／音量偏好存在 `localStorage`。

**結論：本遊戲沿用「即時合成」，不下載音檔。** 理由：

| | 即時合成（採用） | 下載音檔 |
|---|---|---|
| 延遲 | 近 0，不用載入、不用解碼 | 需預載與解碼，行動裝置首播可能有延遲 |
| 體積 | 0 KB | 多個檔案，需壓縮 |
| 授權風險 | 無 | 每個檔都要確認授權與署名 |
| 依等級變化 | 參數化，同一函式改音高／音量就能做出「越早配對越華麗」 | 每個等級要各找一個檔 |
| 與現有遊戲一致 | 是 | 否 |

### 7.2 音效清單

| # | 事件 | 音效 | 合成配方（大略） |
|---|---|---|---|
| S1 | 點擊／送出 | 輕柔「嗒」 | 短 sine，約 880→660 Hz，60 ms |
| S2 | 輸入不合法 | 低沉「嗡」 | 方波 180 Hz，100 ms，低通 |
| S3 | 倒數最後 5 秒 | 每秒一聲「滴」，最後 1 秒更高 | sine 1000 Hz（最後一聲 1400 Hz），50 ms |
| S4 | 詞卡翻牌 | 紙牌「啪」 | 帶通雜訊 40 ms + 短 sine；與翻牌 stagger（70 ms）同步排程 |
| S5 | 群組併合 | 上揚「咻」 | sine 400→800 Hz 滑音 120 ms |
| S6 | 稱號蓋章 | 「咚」 | 低頻 sine 150→70 Hz + 短雜訊，90 ms |
| S7 | 第 1 輪 天生一對 | 華麗琶音 + 閃光 | C5-E5-G5-C6 琶音（步進 70 ms）+ 高頻雜訊閃光，約 900 ms |
| S8 | 第 2–3 輪 配對 | 雙音鈴聲 | E5-G5 兩音，約 350 ms |
| S9 | 第 4–5 輪 配對 | 單音「叮」 | 單一 sine，約 150 ms |
| S10 | 第 6 輪以後 配對 | 輕「噗」 | 短 sine 60 ms，音量降低 |
| S11 | 死對頭 | 下滑「哇～」+ 裂聲 | sine 400→150 Hz 滑音 300 ms + 短雜訊 |
| S12 | 與眾不同登場 | 號角 + 星星閃爍 | 三和弦長音 600 ms + 隨機高音點點（4–6 顆） |
| S13 | 孤狼 | 低沉長嚎 | sine 220→330→200 Hz，800 ms，低通 |
| S14 | 離譜王 | 滑稽「噗啾」 | 方波 300→900 Hz 快速滑音 150 ms |
| S15 | 回合開始 | 輕鈴 | 單音 C6，120 ms |
| S16 | 通關／結算起手 | 輕快小號 | 兩個和弦，約 700 ms |

等級與音效強度對應與動畫一致（第 3.3 節）：**越早配對越華麗，後段只有一聲輕響**。頻率與時長是起始值，實作後要用耳朵調整。

### 7.3 防 LAG 與相容性

- **單一 `AudioContext`**，全站共用，不要每次播放都新建。
- **自己排程**：用 `ctx.currentTime + offset` 預先排好翻牌音（與 CSS stagger 對齊），不要用多個 `setTimeout` 逐一觸發。
- **限制同時發聲數**（桌機 ≤ 12、手機 ≤ 8）；超過就略過最不重要的音（雜訊、閃光）。
- **每個振盪器一定 `stop()`**，且時長 < 1 秒，避免記憶體與 CPU 累積。
- 沿用 master → `DynamicsCompressor` 鏈，12 人同時翻牌也不爆音。
- **iOS 與自動播放限制**：`AudioContext` 要在使用者第一次點擊或觸控時建立並 `resume()`（大廳的「建立／加入房間」按鈕就是天然的解鎖點）。網路上的建議也是在第一次手勢中播放一段靜音，以確保解鎖。
- **iPhone 側邊靜音開關會讓 Web Audio 靜音**，要在設定面板放一句提示「若沒聲音，請檢查手機靜音開關」。
- 分頁切到背景就 `suspend()`，回來才 `resume()`，不補播過期的音效。
- 輕量模式下：砍掉雜訊閃光與裝飾音，只保留 S1、S4、S6、S8–S12。
- 靜音與音量偏好：key 用 `sw-sfx-v1`（避免與 `cs-sfx-v2` 衝突），預設音量 50%，與既有遊戲一致。

### 7.4 程式結構與邊界

```
vue-app/src/apps/same-word/composables/useSameWordSfx.js   playSfx('stamp'|'flip'|...)、靜音／音量 ref
vue-app/src/apps/same-word/components/SwSfxToggle.vue      右上角喇叭按鈕 + 音量滑桿（Reka UI）
```

- **App 之間不可互相 import**。所以第一版是把 `useCharacterStormSfx.js` 的引擎部分（`ensureContext`、`tone`、`noise`、`envelope`）複製進 `same-word`，音效表重寫。
- 日後若兩個遊戲都穩定，再把引擎抽到 `shared/audio/`。**這會動到既有 `character-storm`，屬於 STRUCTURE.md 的「Ask First」**，不在本案範圍內，待你同意再做。

### 7.5 如果之後想用現成音檔（選配）

我目前不下載。如果你想要某個音（例如更真實的紙牌聲或號角）可以走下面來源，但要先做授權確認：

| 來源 | 授權 | 備註 |
|---|---|---|
| [Kenney UI Audio](https://kenney.nl/assets/ui-audio)、[Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) | CC0（Kenney 頁面標示） | 介面點擊、紙牌、金屬碰撞，最適合本案；仍要看下載包內的 license 檔 |
| [ZzFX](https://github.com/KilledByAPixel/ZzFX) | MIT | 約 1 KB 的程式音效產生器，附線上設計器，可做出短音效後貼進程式；與「即時合成」相容，也是較輕量的選配 |
| Freesound | **逐檔不同**（CC0／署名／非商用都有） | 只挑 CC0，並記錄檔案連結 |
| OpenGameArt | 逐檔不同 | 同上 |
| BBC Sound Effects | 僅非商用 | 不要用 |
| Sonniss GDC 音效包 | 免版稅，但禁止用於 AI／ML 訓練 | 使用條款需確認 |

使用音檔時的做法（網路上較一致的建議）：
- 先在大廳 `fetch` + `decodeAudioData` 成 `AudioBuffer` 預載，播放時只建立一次性的 `AudioBufferSourceNode`（來源節點播完就不能重播，要每次新建）。
- 格式用 **WebM/Opus 或 OGG** 為主、MP3 當備援；每個檔 ≤ 30 KB、全部 ≤ 150 KB。
- 不要用 `<audio>` 標籤播短音效（會有延遲、無法重疊同一個音）。

> 我用網路搜尋整理了以上做法，但搜尋結果多是部落格與教學文章，不是官方文件。Kenney 的 CC0 來自它自己頁面與搜尋摘要，實際使用前請看下載包內的授權檔。

### 7.6 音效驗收

- [ ] 12 人同時揭曉，音效不爆音、不斷音、不破音
- [ ] 手機（iOS Safari／Android Chrome）第一次點擊後就有聲音
- [ ] 靜音與音量偏好重新整理後保留
- [ ] 分頁切到背景再回來沒有聲音堆積
- [ ] 同時發聲數超過上限時，會優先保留重要音效
- [ ] 輕量模式下的音效數量符合 7.3 的規定

---

## 8. 本文件適用的實作順序

| 步驟 | 內容 |
|---|---|
| 1 | 規格 P1（`gameLogic.js` + 測試），不涉及圖片與音效 |
| 2 | 規格 P2（Socket 與房間） |
| 3 | 前端骨架：大廳、書寫、揭曉、結算（用 emoji 與色塊占位，先不放圖片） |
| 4 | 音效（第 7 節）與動畫（第 3 節）：不需要素材，先做 |
| 5 | 收到 GPT 生的 19 張圖後替換占位 |

---

## 9. 待你決定

1. **視覺方向**：目前暫定「紅線配對」。若想沿用默契字囊團的「字牌」外觀，圖片只需要 #1–13 與 #16（卡背），其餘可省。
2. **是否做紅線連線（A12）**：好看，但人多時會亂。建議先只做「本輪新配對」的短暫連線，結算改用熱力圖。
3. **是否同意可選裝 `canvas-confetti`**：預設不裝，驗收後再決定。
4. **音效走即時合成還是下載音檔？** 建議合成（零檔案、零延遲、與默契字囊團一致）。若你想要更真實的聲音，我可以下載 Kenney 的 CC0 音效包放進獨立資料夾，確認授權後挑幾個用。
5. **要不要把音效引擎抽成 `shared/audio/`？** 會動到既有的 `character-storm`（Ask First）。建議第一版先複製，不動舊遊戲。

---

*最後更新：2026-10-30*
