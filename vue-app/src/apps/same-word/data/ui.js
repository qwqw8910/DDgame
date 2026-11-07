// 同詞相遇 v2 按鈕樣式（照設計系統的膠囊按鈕寫法）
const base = 'inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-0 px-6 text-base font-medium transition-[background-color,scale,opacity] duration-150 ease-soft active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none'

export const primaryBtn = `${base} bg-brand text-on-brand`
export const secondaryBtn = `${base} bg-raised text-ink shadow-(--shadow-tile) enabled:hover:bg-fill`
export const tile = 'rounded-tile bg-raised p-6 shadow-(--shadow-tile) max-sm:p-5'
