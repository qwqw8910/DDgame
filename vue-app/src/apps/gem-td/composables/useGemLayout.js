// 電腦版（≥1024px）由頁面設成 true：GemSection 會畫成帶標題列的固定卡片。
// 手機與平板維持原本的普通區塊（版面靠分頁與上下堆疊）。
import { ref } from 'vue'

export const desktop = ref(false)
// ≥1024px：地圖旁有左右欄，數值預覽放得進操作列。直放的平板（寬版但 <1024px）沒有這個空間，選留下的甜點改排進操作列
export const lgLayout = ref(false)
