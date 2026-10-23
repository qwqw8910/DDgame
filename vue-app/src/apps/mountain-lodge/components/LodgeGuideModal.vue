<template>
    <Teleport to="body">
        <Transition name="toast">
            <div v-if="modelValue" class="guide-overlay" role="dialog" aria-modal="true" aria-label="遊戲說明"
                @click.self="close" @keydown.esc="close">
                <div ref="cardRef" class="guide-card" tabindex="-1">
                    <!-- 分頁列 + 關閉 -->
                    <div class="guide-tabs-row">
                        <div class="guide-tabs" role="tablist">
                            <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id"
                                :class="['guide-tab', { 'is-active': tab === t.id }]" @click="tab = t.id">
                                {{ t.label }}
                            </button>
                        </div>
                        <button class="guide-close" aria-label="關閉說明" @click="close">
                            <img :src="CLOSE_ICON" alt="" width="24" height="24" draggable="false" />
                        </button>
                    </div>

                    <div class="guide-panel">
                        <div class="guide-scroll">
                            <!-- 故事背景 -->
                            <div v-if="tab === 'story'" class="guide-story">
                                <p>故事發生在一座偏僻的山中別館。</p>
                                <p>你與幾位客人受主人邀請來到此地，<br>但當晚，別館的主人卻慘遭殺害 ——</p>
                                <p class="mt-4">別館與世隔絕，警察無法立即趕到<br>而殺人魔，就在<strong class="guide-em">你我之中</strong>。</p>
                                <p>在警察到達之前，大家決定先把最可疑的人關進地下的鍋爐室。</p>
                                <p>問題是，沒有人知道誰才是殺人魔。</p>
                                <p class="mt-4">所有人聚在一起，透過彼此的</p>
                                <p class="guide-em">
                                    <u>目擊情報</u> + <u>說詞</u> + <u>自身能力</u> + <u>推理</u>
                                </p>
                                <p>找出殺人魔躲在哪個地點。</p>
                            </div>

                            <!-- 遊戲簡介 -->
                            <div v-else-if="tab === 'rules'" class="guide-rules">
                                <section v-for="s in RULES" :key="s.title">
                                    <h3>{{ s.title }}</h3>
                                    <ul>
                                        <li v-for="line in s.lines" :key="line">{{ line }}</li>
                                    </ul>
                                </section>
                            </div>

                            <!-- 角色介紹 -->
                            <div v-else class="guide-roles">
                                <p class="guide-roles-note">每人只會拿到 1 張角色牌，其他人的牌在結算前都看不到。</p>
                                <ul>
                                    <li v-for="r in roles" :key="r.kind">
                                        <div class="guide-role-img">
                                            <img :src="r.img" :alt="r.name" draggable="false" />
                                        </div>
                                        <div class="guide-role-text">
                                            <div class="guide-role-head">
                                                <strong>{{ r.name }}</strong>
                                                <span>{{ TEAM_NAMES[r.team] }}</span>
                                            </div>
                                            <p><b>能力：</b>{{ r.ability }}</p>
                                            <p><b>勝利：</b>{{ r.win }}</p>
                                            <p class="guide-role-level">登場：{{ r.level }}</p>
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        <button class="guide-confirm" @click="close">關閉</button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { ROLES, ROLE_GUIDE, GUEST_COLORS, TEAM_NAMES, PASS_LOCK_SECONDS } from '../data/constants.js'

const props = defineProps({
    modelValue: { type: Boolean, default: false },
    // 開啟時預設的分頁：story | rules | roles
    initialTab: { type: String, default: 'story' },
})
const emit = defineEmits(['update:modelValue'])

const CLOSE_ICON = `${import.meta.env.BASE_URL}mountain-lodge/icons/close.svg`
const TABS = [
    { id: 'story', label: '故事背景' },
    { id: 'rules', label: '遊戲簡介' },
    { id: 'roles', label: '角色介紹' },
]

// 簡介內容對應 docs/design/game-background.md 第五章「遊戲流程」
const RULES = [
    { title: '準備', lines: ['每人分到一個地點與一組同色投票牌，客房與鍋爐室固定在盤面最後兩格。', '角色牌數量 = 玩家數 + 1，多出的 1 張最後進客房；本局出現哪些角色會公開。'] },
    { title: '傳牌', lines: [
        '第一位玩家抽 2 張，偷看後留 1 張，另 1 張傳給任一尚無角色的人，並口頭說出「目擊情報」，可以說謊。',
        '收到牌的人再抽 1 張，二選一留下，剩下的繼續傳；傳給誰不必是隔壁。',
        `最後一位玩家一張自留、一張放進客房。每次選牌有 ${PASS_LOCK_SECONDS} 秒閱牌時間才能確認。`,
    ] },
    { title: '討論', lines: ['大家用語音討論（約 3 分鐘），可以說任何話，包含「我剛才說謊」。', '把每個人的傳牌路徑串起來，找出矛盾。'] },
    { title: '投票與結算', lines: ['每人 1 票，投給你認為殺人魔所在的「地點」，可以投自己的地點與客房。', '得票最高地點的角色牌送進鍋爐室；平票時，同票最高的地點全部進去。', '殺人魔進鍋爐室 → 好人獲勝；沒進去 → 殺人魔陣營獲勝；炸彈客自己進去則單獨獲勝。'] },
]

const tab = ref(props.initialTab)
const cardRef = ref(null)

const roles = computed(() => ROLE_GUIDE.map(g => {
    const role = ROLES[g.kind]
    return { ...g, ...role, img: role.img ?? GUEST_COLORS.yellow.img }
}))

function close() {
    emit('update:modelValue', false)
}

watch(() => props.modelValue, (open) => {
    if (!open) return
    tab.value = props.initialTab
    nextTick(() => cardRef.value?.focus())
})
</script>

<style scoped>
/* 對應 Figma「01_首頁」(node 38:473) 的說明彈窗 */
.guide-overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(33, 33, 33, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.guide-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 640px;
    max-height: min(560px, 88dvh);
    height: 560px;
    outline: none;
    filter: drop-shadow(0 0 12px rgba(255, 255, 255, 0.8));
    font-family: 'Noto Serif TC', 'Songti TC', serif;
}

.guide-tabs-row { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
.guide-tabs { display: flex; min-width: 0; }

.guide-tab {
    padding: 12px 24px;
    border: 0;
    border-right: 1px solid #dddad7;
    background: #212121;
    color: #fff;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
}
.guide-tab:first-child { border-top-left-radius: 4px; }
.guide-tab:last-child { border-top-right-radius: 4px; border-right: 0; }
.guide-tab.is-active { background: #dddad7; color: #212121; }

.guide-close {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.guide-panel {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    padding: 24px;
    background: #dddad7;
    border-radius: 0 4px 4px 4px;
    color: #3c3c3c;
}

.guide-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: 12px;
    scrollbar-width: thin;
    scrollbar-color: #aea69c transparent;
}
.guide-scroll::-webkit-scrollbar { width: 8px; }
.guide-scroll::-webkit-scrollbar-thumb { background: #aea69c; border-radius: 40px; }

.guide-confirm {
    flex-shrink: 0;
    padding: 8px 12px;
    border: 0;
    background: #212121;
    color: #fff;
    font-family: inherit;
    font-size: 16px;
    line-height: 1.5;
    cursor: pointer;
    transition: background-color 0.15s;
}
.guide-confirm:hover { background: #333; }

/* 故事背景：置中 */
.guide-story { display: flex; min-height: 100%; flex-direction: column; justify-content: center; text-align: center; font-size: 16px; line-height: 1.7; }
.guide-story p { margin: 0; }
.guide-em { font-size: 18px; font-weight: 600; }

/* 遊戲簡介：左對齊分段 */
.guide-rules { display: flex; flex-direction: column; gap: 16px; font-size: 15px; line-height: 1.7; }
.guide-rules h3 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #212121; letter-spacing: 0; }
.guide-rules ul { margin: 0; padding-left: 20px; }

/* 角色介紹：圖 + 說明 */
.guide-roles { font-size: 14px; line-height: 1.6; }
.guide-roles-note { margin: 0 0 12px; }
.guide-roles ul { display: flex; flex-direction: column; gap: 12px; margin: 0; padding: 0; list-style: none; }
.guide-roles li { display: flex; gap: 12px; padding: 10px; background: #eee; border: 1px solid #d0cac4; }
.guide-role-img { flex-shrink: 0; width: 64px; height: 90px; overflow: hidden; background: #212121; }
.guide-role-img img { width: 100%; height: 100%; object-fit: cover; }
.guide-role-text { min-width: 0; }
.guide-role-text p { margin: 2px 0 0; }
.guide-role-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
.guide-role-head strong { font-size: 16px; color: #212121; }
.guide-role-head span, .guide-role-level { font-size: 12px; color: #6b6b6b; }

@media (max-width: 480px) {
    .guide-tab { padding: 10px 14px; font-size: 13px; }
    .guide-panel { padding: 16px; }
}
</style>
