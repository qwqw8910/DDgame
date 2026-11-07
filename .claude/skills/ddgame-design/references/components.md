# v2 元件寫法

以下都取自入口首頁的實際程式碼：
- `vue-app/src/apps/portal/pages/PortalPage.vue`
- `vue-app/src/apps/portal/components/ToolCard.vue`
- `vue-app/src/apps/portal/components/ToolIcon.vue`

寫新畫面時直接照抄結構與 class。以下程式碼一律用**電腦優先**寫法：不加前綴的 class 是電腦版，`max-lg:`、`max-sm:` 覆寫平板與手機。首頁原始碼是由小到大的寫法（`px-4 sm:px-8 lg:px-12`），兩者畫出來一樣。若同一個元件在第二個 app 也要用，就抽到 `vue-app/src/shared/components/`（建議名稱：`IconButton`、`FilterChips`、`Tile`），不要複製第三份。

## 目錄
- 頁面骨架
- 圖示按鈕
- 篩選膠囊（單選）
- 卡片（Tile）
- 標籤與狀態徽章
- 線稿圖示
- 彈出提示
- 頁尾

## 頁面骨架

```vue
<template>
  <!-- html/body 是 overflow-hidden，捲動發生在這一層 -->
  <div class="h-dvh overflow-x-hidden overflow-y-auto bg-canvas font-text text-ink">
    <!-- 容器上限分級：1280（一般筆電/桌機）→ 1440（≥1536）→ 1600（≥1920） -->
    <div class="mx-auto max-w-[1280px] 2xl:max-w-[1440px] min-[1920px]:max-w-[1600px] px-12 pt-[max(16px,env(safe-area-inset-top))] pb-[max(48px,env(safe-area-inset-bottom))] max-lg:px-8 max-sm:px-4">
      <!-- 首屏：一個重點。圖示按鈕和眉標同一列，不要另開一列只放按鈕 -->
      <header class="pb-14 max-sm:pb-10">
        <div class="flex items-center justify-between gap-4">
          <p class="m-0 text-base font-medium text-brand-ink">眉標（說一件真實的事，例如數量）</p>
          <div class="flex shrink-0 items-center gap-2">…圖示按鈕</div>
        </div>
        <h1 class="mt-3 mb-0 font-display text-[clamp(44px,10vw,88px)] leading-[1.08] font-normal tracking-[0.01em] text-ink">標題</h1>
        <p class="mt-5 mb-0 max-w-[26em] text-xl leading-relaxed text-ink-muted max-sm:text-lg">一到兩句引言。</p>
      </header>

      <section aria-labelledby="xxx-heading">…</section>

      <footer class="mt-16 border-t border-hairline pt-6 text-base text-ink-faint">…</footer>
    </div>
  </div>
</template>
```

遊戲進行中的畫面（房間、對局）首屏不需要大標題，但同樣用 `bg-canvas`、同樣的容器寬度與邊距。

## 圖示按鈕

44px 圓形、raised 底、描邊陰影、按下縮放、焦點框。

```js
const iconBtn = 'grid size-11 cursor-pointer place-items-center rounded-full border-0 bg-raised text-ink shadow-(--shadow-tile) transition-[background-color,scale] duration-150 ease-soft hover:bg-fill active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none'
```

```vue
<button type="button" :class="iconBtn" :aria-label="isDark ? '切換為淺色模式' : '切換為深色模式'" :title="同 aria-label">
  <svg aria-hidden="true" viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">…</svg>
</button>
```

- `aria-label` 描述按下的結果。
- 主題切換鈕顯示「按下去會變成的」模式圖示（深色時顯示太陽）。
- 首頁的主題切換邏輯（`toggleTheme`）與 PWA 安裝（`usePwaInstall` composable）可直接照抄。

## 篩選膠囊（單選）

用 reka-ui `ToggleGroup`：一個 Tab 停點、方向鍵切換、ARIA 正確。

```vue
<ToggleGroupRoot type="single" :model-value="filter" aria-label="依類型篩選" :loop="false"
  class="mb-6 flex flex-wrap gap-2" @update:model-value="v => { if (v) filter = v }">
  <ToggleGroupItem v-for="c in categories" :key="c.value" :value="c.value"
    class="group inline-flex h-11 cursor-pointer items-center gap-1.5 rounded-full border-0 bg-raised px-4 text-base text-ink shadow-(--shadow-tile) transition-[background-color,color,scale] duration-150 ease-soft hover:bg-fill active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none data-[state=on]:bg-brand data-[state=on]:hover:bg-brand data-[state=on]:text-on-brand data-[state=on]:shadow-none">
    {{ c.label }}
    <span class="tabular-nums opacity-70 group-data-[state=on]:opacity-100">{{ c.count }}</span>
  </ToggleGroupItem>
</ToggleGroupRoot>
<p class="sr-only" role="status">顯示 {{ visible.length }} 個</p>
```

注意：
- `@update:model-value` 的 `if (v)`：reka 的單選再點一次會取消選取，這裡擋掉，永遠有一個選中。
- 選中狀態的數字不能留 `opacity-70`（白字 70% 在玫瑰紅上不到 4.5:1），所以有 `group-data-[state=on]:opacity-100`。
- 選中狀態要同時寫 `data-[state=on]:hover:bg-brand`，否則 hover 會蓋成 `bg-fill`。
- 分類旁標數量（cacopy 式資訊設計）；數量為 0 的分類不顯示。
- 選項建議 ≤ 5 個（HIG segmented controls）；390px 寬會換行，可接受，但不要做水平捲動。

## 卡片（Tile）

固定結構：**圖示＋名稱＋箭頭 → 分隔線 → 一行說明 → 標籤（＋狀態徽章）**。所有卡片同一樣式，不用顏色區分。

```vue
<component :is="tag" v-bind="linkProps"
  class="group flex h-full flex-col rounded-tile bg-raised p-5 text-inherit no-underline shadow-(--shadow-tile) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
  :class="isClickable
    ? 'cursor-pointer transition-[translate,box-shadow] duration-200 ease-soft hover:-translate-y-0.5 hover:shadow-(--shadow-tile-hover) active:translate-y-0 active:duration-75 motion-reduce:transition-none motion-reduce:hover:translate-y-0'
    : 'opacity-60'"
  :aria-disabled="isClickable ? undefined : 'true'">
  <div class="flex items-center gap-3.5">
    <span aria-hidden="true" class="grid size-11 shrink-0 place-items-center rounded-inset bg-fill p-2.5 text-ink"><ToolIcon :id="…" /></span>
    <h3 class="m-0 min-w-0 flex-1 font-display text-xl leading-snug font-normal text-ink">名稱</h3>
    <svg v-if="isClickable" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
      class="size-5 shrink-0 text-ink-faint transition-[translate,color] duration-200 ease-soft group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transition-none"><path d="m8 5 5 5-5 5" /></svg>
  </div>
  <hr class="my-4 h-px border-0 bg-hairline" />
  <p class="m-0 text-base leading-relaxed text-ink-muted">一行說明</p>
  <div class="mt-auto flex items-start gap-3 pt-4">
    <ul class="m-0 flex min-w-0 flex-1 list-none flex-wrap gap-1.5 p-0" aria-label="標籤">…</ul>
    <span v-if="statusLabel" class="…狀態徽章…">Beta</span>
  </div>
</component>
```

- 列表外層用 `<ul class="grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">` ＋ `<li>`，卡片 `h-full` 讓同列等高。
- 內部連結用 `RouterLink`（元件物件），外部連結用 `<a target="_blank" rel="noopener noreferrer">`，不可點用 `div` ＋ `aria-disabled`。
- 名稱列不要再塞徽章，長名稱（如「山中別館殺人事件」）在三欄時會被擠成兩行；狀態徽章放在標籤列尾端。

## 標籤與狀態徽章

```html
<!-- 分類標籤：填色 -->
<li class="rounded-full bg-fill px-2.5 py-0.5 text-base leading-snug text-ink-faint">多人</li>
<!-- 狀態徽章：外框，與標籤區分 -->
<span class="shrink-0 rounded-full px-2.5 py-0.5 text-base leading-snug text-ink-muted shadow-[inset_0_0_0_1px_var(--color-hairline)]">Beta</span>
```

狀態文字：`beta` → 「Beta」、`coming-soon` → 「即將推出」（卡片同時降為 `opacity-60`、不可點）。

## 線稿圖示

- 24×24 viewBox、`fill="none" stroke="currentColor" stroke-width="1.7~1.8" stroke-linecap="round" stroke-linejoin="round"`。
- 顏色跟著文字（`currentColor`），預設 `text-ink`，不上主色。
- 首頁工具圖示集中在 `ToolIcon.vue` 的 `PATHS`；新增工具時在那裡補一個同 `id` 的圖示，沒有的話會顯示 fallback 星形。
- 不用 emoji 當介面圖示。

## 彈出提示（非模態）

```html
<p role="status" class="absolute top-[calc(100%+8px)] right-0 z-10 m-0 w-64 rounded-tile bg-raised px-4 py-3 text-base leading-relaxed text-ink shadow-(--shadow-tile-hover)">…</p>
```

需要真正的對話框、選單、Popover 時用 reka-ui 對應元件，套同樣的 `rounded-tile bg-raised shadow-(--shadow-tile-hover)`。

## 頁尾

`<footer class="mt-16 border-t border-hairline pt-6 text-base text-ink-faint">`
