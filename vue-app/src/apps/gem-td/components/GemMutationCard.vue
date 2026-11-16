<template>
    <component :is="interactive ? 'button' : 'div'" class="gt-mut" :class="{ 'gt-mut--picked': picked, 'gt-mut--column': column }"
        :type="interactive ? 'button' : undefined" :aria-pressed="interactive ? picked : undefined" @click="interactive && $emit('pick')">
        <span class="gt-mut__art" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg>
        </span>
        <span class="gt-mut__body">
            <span class="gt-mut__tags">
                <span class="gt-mut__tag">取捨</span>
                <span v-if="waveLabel" class="gt-mut__wave">{{ waveLabel }}</span>
                <span v-if="votes !== null" class="gt-mut__votes">{{ votes }} 票</span>
            </span>
            <span class="gt-mut__title">{{ mutation.name }}</span>
            <span class="gt-mut__line gt-mut__line--pro"><b aria-hidden="true">＋</b><span class="sr-only">好處：</span>{{ mutation.pro }}</span>
            <span class="gt-mut__line gt-mut__line--con"><b aria-hidden="true">－</b><span class="sr-only">代價：</span>{{ mutation.con }}</span>
        </span>
    </component>
</template>

<script setup>
// 突變卡片：視覺對照 Figma「甜點守衛戰 突變卡片」，文字由伺服器型錄帶入
defineProps({
    mutation: { type: Object, required: true },
    waveLabel: { type: String, default: '' },
    votes: { type: Number, default: null },
    interactive: { type: Boolean, default: false },
    picked: { type: Boolean, default: false },
    column: { type: Boolean, default: false }, // 電腦版並排用的直式排版；手機不受影響
})
defineEmits(['pick'])
</script>

<style scoped>
.gt-mut {
    --mut: #c98a12;
    --mut-soft: #fff1cf;
    display: flex;
    width: 100%;
    gap: 12px;
    align-items: flex-start;
    padding: 10px 12px;
    border: 2px solid var(--mut);
    border-radius: 16px;
    background: var(--gt-surface, #fff);
    color: var(--gt-ink, #4a2c2a);
    font: inherit;
    text-align: left;
}
button.gt-mut { cursor: pointer; }
button.gt-mut:hover { background: var(--mut-soft); }
button.gt-mut:hover .gt-mut__art, .gt-mut--picked .gt-mut__art { background: var(--gt-surface, #fff); }
button.gt-mut:focus-visible { outline: 3px solid var(--mut); outline-offset: 2px; }
.gt-mut--picked { background: var(--mut-soft); box-shadow: 0 0 0 3px var(--mut); }
.gt-mut__art {
    display: inline-flex;
    width: 44px;
    height: 44px;
    flex: none;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--mut-soft);
    color: var(--mut);
}
.gt-mut__body { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.gt-mut__tags { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.gt-mut__tag, .gt-mut__wave, .gt-mut__votes {
    padding: 1px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.5;
}
.gt-mut__tag { background: var(--mut); color: #fff; }
.gt-mut__wave { background: var(--mut-soft); color: var(--mut); }
.gt-mut__votes { background: var(--gt-line, #eac8cf); color: var(--gt-ink, #4a2c2a); }
.gt-mut__title { font-size: 16px; font-weight: 700; line-height: 1.3; }
.gt-mut__line { display: flex; gap: 6px; font-size: 13px; line-height: 1.45; }
.gt-mut__line b { flex: none; font-weight: 700; }
/* column：電腦版三張並排（左中右）時，卡片改成直式，圖示在上、文字在下 */
@media (min-width: 1024px) {
    .gt-mut--column { flex-direction: column; gap: 6px; padding: 8px; border-radius: 12px; }
    .gt-mut--column .gt-mut__art { width: 32px; height: 32px; }
    .gt-mut--column .gt-mut__art svg { width: 20px; height: 20px; }
    .gt-mut--column .gt-mut__body { width: 100%; gap: 3px; }
    .gt-mut--column .gt-mut__title { font-size: 14px; }
    .gt-mut--column .gt-mut__line { font-size: 12px; line-height: 1.4; }
}
.gt-mut__line--pro b { color: #2e9e77; }
.gt-mut__line--con b { color: #6b3f8c; }
</style>
