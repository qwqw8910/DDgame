import { ref, watch } from 'vue'

/**
 * 玩法說明彈窗狀態：第一次呼叫 autoOpen() 時自動開啟，關閉後記住（localStorage）。
 * 每個遊戲用自己的 storageKey，例如 'cs-guide-seen'。
 */
export function useGameGuide(storageKey) {
    const show = ref(false)

    watch(show, (open) => {
        if (open) return
        try { localStorage.setItem(storageKey, '1') } catch { /* ignore */ }
    })

    function autoOpen() {
        try { show.value = !localStorage.getItem(storageKey) } catch { /* ignore */ }
    }

    return { show, open: () => { show.value = true }, autoOpen }
}
