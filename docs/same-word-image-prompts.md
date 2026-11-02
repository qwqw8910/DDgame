# 同詞相遇：GPT 生圖提示詞（3×3 拼圖版）

> 日期：2026-10-30 | 取代 [same-word-ui-assets-animation.md](same-word-ui-assets-animation.md) 第 2.3 節「一張一張生」的做法
> 做法：一次生成 9 格的拼圖，交給我用 Python 切開、去背、縮圖、轉 WebP。

## 輸入順序

| 順序 | 內容 | 檔案 | 說明 |
|---|---|---|---|
| 1 | 拼圖 A：9 個默契等級徽章 | `sheet-a.png` | 先做這張，確認風格 |
| 2 | 拼圖 B：4 個稱號徽章 + 5 個小特效 | `sheet-b.png` | **把 sheet-a 當參考圖附上**，風格才會一致 |
| 3 | 單張：與眾不同主角 | `hero-unique.png` | 尺寸較大，不放進拼圖 |
| 4 | 單張：大廳主視覺（橫） | `hero-lobby.png` | 3:2 橫圖 |
| 5 | 單張：詞卡背面（直） | `card-back.png` | 2:3 直圖 |

1、2 放同一個對話；3–5 可以開新對話，但貼同一份共用前綴，並附上 sheet-a 當風格參考。

## 共用前綴（每次都貼在最前面）

```
Cute flat vector sticker illustration, thick clean white sticker outline,
soft subtle shading, warm palette of coral pink (#FB7185), gold (#FBBF24),
cream white (#FFFDF5) with dark ink outlines (#1B1F2A), crisp edges.
No text, no letters, no numbers, no watermark, no logo.
```

## 背景：兩種做法擇一

**做法 1（先試）**：在每個提示詞最後加這行。

```
Fully transparent background, PNG with alpha channel, no checkerboard pattern.
```

**做法 2（做法 1 失敗時用，我比較推薦）**：改加這行，我用 Python 去掉洋紅色。

```
Flat solid pure magenta (#FF00FF) background everywhere, no gradient, no texture,
no shadow on the background. Do not use magenta on any object.
```

> 為什麼 3×3 更要小心：拼圖的底如果是假透明（棋盤格），切出來每張都是壞的。拿到圖先放在深色背景看，看到白框或棋盤格就改用做法 2。

## 拼圖通用規則（每張拼圖都要加）

```
Layout: a perfect 3 by 3 grid on a square 1:1 canvas, nine separate objects,
one object centered in each cell, reading order left-to-right then top-to-bottom.
Each object occupies about 70% of its cell with equal empty margin on all sides.
Objects must NOT touch, overlap, or cross cell borders. No grid lines, no
dividers, no frames, no numbers, no labels. All nine objects the same size and
the same sticker style as one matching set.
```

---

## 拼圖 A（`sheet-a.png`）：默契等級徽章

提示詞 = 共用前綴 + 拼圖通用規則 + 下面這段 + 背景那行。

```
Nine round badge emblems, each a different relationship-chemistry level.
Cell 1 (top-left): a glowing red heart made of two halves fitting perfectly together,
  golden sparkles around, a tiny red thread bow on top. Most radiant badge of the set.
Cell 2 (top-center): two small pink hearts connected by a glowing curved thread,
  tiny stars between them, dreamy telepathy feeling.
Cell 3 (top-right): two jigsaw puzzle pieces fitting together perfectly,
  coral pink and gold, small checkmark sparkle.
Cell 4 (middle-left): two overlapping round speech bubbles in warm orange and cream
  with a small smile mark between them, friendly and calm.
Cell 5 (center): a small green seedling with two leaves sprouting from a tiny pot,
  a little snail beside it, soft and slow mood.
Cell 6 (middle-right): two interlocking gears in muted blue-grey with a small wrench,
  slightly misaligned teeth, hardworking mood.
Cell 7 (bottom-left): two tin cans connected by a wobbly string (tin can telephone),
  muted dusty colors, slightly worn.
Cell 8 (bottom-center): a pastel pink heart with a band-aid across it,
  faded colors, shy and relieved mood.
Cell 9 (bottom-right): a heart snapped into two halves with a lightning bolt between,
  dark purple and grey with a hint of red, dramatic but cute, not scary.
```

切出後對應：

| 格 | 檔名 | 稱號 |
|---|---|---|
| 1 | `badge-t1` | 💘 天生一對 |
| 2 | `badge-t2` | ✨ 心有靈犀 |
| 3 | `badge-t3` | 🤝 默契十足 |
| 4 | `badge-t4` | 😊 還算合拍 |
| 5 | `badge-t5` | 🌱 慢熟型 |
| 6 | `badge-t6` | 🔧 需要磨合 |
| 7 | `badge-t7` | 😅 勉強同頻 |
| 8 | `badge-t8` | 🩹 差點錯過 |
| 9 | `badge-enemy` | 💔 死對頭 |

---

## 拼圖 B（`sheet-b.png`）：稱號徽章 + 小特效

提示詞 = 共用前綴 + 拼圖通用規則 + 下面這段 + 背景那行。附上 sheet-a 當風格參考圖。

```
Nine objects. The first four are round badge emblems, the last five are small icons.
Cell 1 (top-left): a cute sparkling unicorn head with a rainbow mane and golden horn,
  star-shaped sparkles, proud expression, round badge.
Cell 2 (top-center): a cute lone wolf howling at a small crescent moon,
  blue-grey fur, tiny stars, lonely but cool, round badge.
Cell 3 (top-right): a red horseshoe magnet with silver tips pulling several tiny
  gold stars toward it, round badge.
Cell 4 (middle-left): a cute flying saucer UFO wearing a small golden crown,
  light beam below, comedic and silly, round badge.
Cell 5 (center): a single glossy coral pink heart with a small white highlight, simple icon.
Cell 6 (middle-right): a single four-pointed gold sparkle star with soft white center, simple icon.
Cell 7 (bottom-left): a short curly red silk thread ending in a small bow, glossy highlights, simple icon.
Cell 8 (bottom-center): a single glossy cracked grey-purple heart with a small crack line, simple icon.
Cell 9 (bottom-right): a single small gold crown with three points, simple icon.
```

| 格 | 檔名 | 用途 |
|---|---|---|
| 1 | `badge-unique` | 🦄 與眾不同 |
| 2 | `badge-loner` | 🐺 孤狼 |
| 3 | `badge-magnet` | 🧲 磁鐵 |
| 4 | `badge-outlier` | 🛸 離譜王 |
| 5 | `fx-heart` | 配對成功飄出的愛心 |
| 6 | `fx-sparkle` | 閃光 |
| 7 | `fx-thread` | 結算裝飾紅線 |
| 8 | `fx-broken` | 死對頭用的裂心（新增） |
| 9 | `fx-crown` | 最佳拍檔頭上的皇冠（新增） |

---

## 單張 3：`hero-unique.png`（1:1）

共用前綴 + 下面 + 背景那行。

```
Large hero illustration: a cheerful rainbow-colored sparkling unicorn standing proudly,
one hoof raised, big golden star sparkles around, joyful victory pose.
Full body, square 1:1 composition, single character centered with at least 10% empty margin.
```

## 單張 4：`hero-lobby.png`（3:2 橫）

```
Wide 3:2 composition: two cute round characters (one coral pink, one cream) standing close,
connected by a long glowing red thread tied in a bow between their hands,
small hearts and sparkles floating, friendly and playful. Keep 8% empty margin on all sides.
```

## 單張 5：`card-back.png`（2:3 直）

```
Vertical 2:3 playing card back, rounded corners, cream white card with thin gold border
and a subtle repeating small heart-and-thread pattern in soft coral pink,
symmetrical, elegant. The card itself fills the canvas with a small transparent margin
at the corners so the rounded corners show. No drop shadow.
```

> 卡背若用做法 2（洋紅底），背景色和卡面無關，不影響；但圓角邊緣要檢查有沒有洋紅殘邊。

---

## 收圖後給我什麼

1. 把 5 張圖放到 `DDgame/vue-app/public/same-word/_raw/`，檔名照上表（`sheet-a.png`、`sheet-b.png`、`hero-unique.png`、`hero-lobby.png`、`card-back.png`）。
2. 告訴我用的是做法 1 還是做法 2。
3. 我會：按 3×3 等分切開 → 去洋紅（做法 2）或直接讀 alpha（做法 1）→ 裁掉多餘空白 → 縮成 256×256（主視覺 640、卡背 240×360）→ 存成 WebP（品質 80）→ 在深色與淺色底各產一張預覽圖給你檢查殘邊。

*最後更新：2026-10-30*
