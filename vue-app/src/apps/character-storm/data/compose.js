// 輸入欄共用工具（提示輸入、猜題輸入）

export const isHanChar = c => /[一-鿿㐀-䶿]/.test(c)

// 注音／拼音等輸入法選字時的 Enter 只是確認組字，不可當成送出（Mac Safari 的 keyCode 為 229）
export function isComposingEnter(e) {
    return e.isComposing || e.keyCode === 229
}

export function previewTileClass(t) {
    if (!t.char) return ['cs-tile', 'cs-tile--sm', 'cs-tile--slot']
    return ['cs-tile', 'cs-tile--sm', t.bad ? 'cs-tile--bad' : 'cs-tile--pop']
}
