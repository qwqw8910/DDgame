<template>
    <GameGuideModal :model-value="modelValue" title="📖 默契字囊團玩法說明"
        @update:model-value="emit('update:modelValue', $event)">

        <GameGuideSection title="🎯 遊戲目標">
            <p>每回合一人擔任<b>猜題者</b>，其他人是<b>提示者</b>。提示者用有限的中文字給線索，猜題者要猜出「題目」是什麼詞。</p>
            <p>提示者看得到題目，猜題者看不到（只知道字數）。全員輪流當一次猜題者，一局結束。</p>
        </GameGuideSection>

        <GameGuideSection title="✍️ 每人可以輸入幾個字？">
            <p>第一輪依人數分配<b>字數上限</b>（至少要輸入 1 字），畫面上的提示框也會顯示你的上限：</p>
            <table class="gg-table">
                <thead>
                    <tr>
                        <th>總人數</th>
                        <th>猜題者</th>
                        <th>2 字</th>
                        <th>4 字</th>
                        <th>6 字</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in roleRows" :key="row.total">
                        <td>{{ row.total }}</td>
                        <td>1</td>
                        <td>{{ row.c2 }}</td>
                        <td>{{ row.c4 }}</td>
                        <td>{{ row.c6 }}</td>
                    </tr>
                </tbody>
            </table>
            <p class="gg-note">※ 8 人以上：2 字 3 人、4 字 3 人，其餘都是 6 字。</p>
            <p>第二輪所有提示者<b>統一最多 4 字</b>。</p>
        </GameGuideSection>

        <GameGuideSection title="🔁 遊戲流程">
            <ol class="gg-list">
                <li><b>第一輪提示：</b>每位提示者依分配到的字數輸入線索，限時 90 秒。</li>
                <li><b>第一輪作答：</b>猜題者根據線索猜答案（限時 90 秒），系統回報 <b>A／B</b>。</li>
                <li><b>第二輪提示：</b>沒猜中就進入第二輪，每位提示者最多再給 4 個字。</li>
                <li><b>第二輪作答：</b>猜題者根據兩輪線索做最終作答。</li>
                <li><b>揭曉：</b>公布答案，房主按「下一位」換人當猜題者。</li>
            </ol>
        </GameGuideSection>

        <GameGuideSection title="🚫 提示規則（不能犯規！）" warn>
            <ul class="gg-list">
                <li><b>不能含有題目中的字</b>：題目是「發酵」，提示就不能出現「發」或「酵」。</li>
                <li><b>不能諧音、近音、同音字</b>：不可用發音相近的字來暗示題目中的字。</li>
                <li><b>只能輸入中文字</b>：不可用數字、英文、標點、Emoji。</li>
                <li><b>不能私下講話或比手勢</b>：線索只能透過輸入的字傳達。</li>
            </ul>
            <p class="gg-note">
                ※ 系統會自動擋下題目中的字與非中文字元；諧音屬於<b>君子協定</b>，請大家自律。
            </p>
        </GameGuideSection>

        <GameGuideSection title="🔣 重複字會變符號">
            <p>如果<b>兩位以上</b>的提示者用了<b>同一個字</b>，猜題者看到的會是符號（● ▲ ■ ◆ ★…）而不是原字。
                提示者則會在自己的字下方看到波浪線。</p>
            <p>所以要有默契：想想別人可能會寫什麼，太「大眾」的字反而會被遮住！</p>
        </GameGuideSection>

        <GameGuideSection title="🅰️🅱️ A／B 是什麼？">
            <p><b>A</b>：字對、位置也對。<b>B</b>：字有出現在題目中，但位置不對。</p>
            <p>例如題目「發酵」，猜「酵母」→ 0A1B（「酵」在題目裡，但位置錯）。</p>
        </GameGuideSection>

        <GameGuideSection title="💡 小技巧">
            <ul class="gg-list">
                <li>用「聯想」而不是「拆字」：想它的用途、場景、感覺。</li>
                <li>字少的人負責關鍵字，字多的人補充細節。</li>
                <li>猜題者時間到會自動交卷，寧可先猜一個。</li>
                <li>可以對別人的提示丟 🔥 或 🥚 互動一下！</li>
            </ul>
        </GameGuideSection>
    </GameGuideModal>
</template>

<script setup>
import GameGuideModal from '@/shared/components/GameGuideModal.vue'
import GameGuideSection from '@/shared/components/GameGuideSection.vue'

defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

// 對應 server/character-storm/roleAssign.js 的 ROLE_TABLE
const roleRows = [
    { total: 4, c2: 2, c4: 1, c6: 0 },
    { total: 5, c2: 2, c4: 2, c6: 0 },
    { total: 6, c2: 2, c4: 2, c6: 1 },
    { total: 7, c2: 2, c4: 2, c6: 2 },
]
</script>
