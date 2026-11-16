<template>
    <div class="gt-root flex h-[100dvh] w-full flex-col overflow-hidden pb-[env(safe-area-inset-bottom)]">
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />

        <header class="flex shrink-0 items-center justify-between gap-2 border-b border-(--gt-line) px-3 py-1.5">
            <div class="flex min-w-0 items-center gap-2">
                <button class="gt-chip" :class="showGame && 'max-sm:hidden'" @click="goHome">離開</button>
                <span class="truncate font-sans font-bold text-(--gt-ink) max-[400px]:hidden" :class="showGame && 'max-sm:hidden'">甜點守衛戰</span>
                <span class="hidden text-(--gt-muted) tabular-nums sm:inline">{{ roomState.roomId }}</span>
                <!-- 手機：血量、金幣、波次、倒數併進標題列，整個畫面最上面只有這一排 -->
                <div v-if="showGame" class="hidden min-w-0 items-center gap-3 font-bold text-(--gt-ink) tabular-nums max-sm:flex max-[360px]:gap-2 max-[360px]:text-sm">
                    <span class="inline-flex items-center gap-1" :title="view.options.livesMode === 'team' ? '隊伍血量' : '我的血量'">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--gt-accent)" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z" /></svg>
                        <span class="sr-only">血量</span>{{ lives }}
                    </span>
                    <span v-if="view.me" class="inline-flex items-center gap-1">
                        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="var(--gt-gold)" stroke="var(--gt-ink)" stroke-width="1.6" /><path d="M12 7.5v9M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" fill="none" stroke="var(--gt-ink)" stroke-width="1.4" stroke-linecap="round" /></svg>
                        <span class="sr-only">金幣</span>{{ gold }}
                    </span>
                    <span class="whitespace-nowrap">
                        <span class="sr-only">{{ view.nextWave?.test ? '傷害測試，' : '' }}第 {{ waveNumber }} 波，共 {{ view.options.waves }} 波</span>
                        <span aria-hidden="true">{{ view.nextWave?.test ? '加賽' : `${waveNumber}/${view.options.waves}` }}</span>
                    </span>
                    <span v-if="secondsLeft !== null" class="whitespace-nowrap" :class="secondsLeft <= 10 && 'text-(--gt-accent-ink)'" role="timer" aria-label="建造剩餘秒數">{{ secondsLeft }}秒</span>
                </div>
            </div>
            <div class="flex shrink-0 items-center gap-1">
                <button v-if="inGame && roomState.isHost" class="gt-chip mr-1 gap-1.5 max-sm:hidden" title="提早結束這局" @click="handleFinish">
                    <GemHeaderIcon name="flag" />提早結束
                </button>
                <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                    :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
                <PwaInstallButton :button-class="showGame ? 'header-icon-btn max-sm:hidden' : 'header-icon-btn'" hint-class="gt-install-hint" />
                <GemVolumePanel :class="showGame && 'max-sm:hidden'" />
                <GemDockMenu v-if="inGame && isWide" />
                <button v-if="inGame" class="header-icon-btn max-sm:hidden" :title="hasKeyboard ? '合成表（B）' : '合成表'" aria-label="合成表" aria-keyshortcuts="B" :aria-pressed="showRecipes" @click="showRecipes = !showRecipes"><GemHeaderIcon name="book" /></button>
                <button class="header-icon-btn max-sm:hidden" :title="hasKeyboard ? '怎麼玩（H）' : '怎麼玩'" aria-label="怎麼玩" aria-keyshortcuts="H" @click="guide.open"><GemHeaderIcon name="help" /></button>
                <button class="header-icon-btn max-sm:hidden" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink"><GemHeaderIcon name="link" /></button>

                <!-- 手機：怎麼玩、邀請連結、提早結束收進「更多」，標題列才排得下 -->
                <div class="relative hidden max-sm:block">
                    <button class="header-icon-btn" aria-label="更多選項" aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><GemHeaderIcon name="more" /></button>
                    <template v-if="menuOpen">
                        <div class="fixed inset-0 z-40" aria-hidden="true" @click="menuOpen = false" />
                        <div role="menu" aria-label="更多選項"
                            class="absolute right-0 top-full z-50 mt-2 flex w-56 flex-col gap-1 rounded-[10px] border border-(--gt-line) bg-(--gt-surface) p-2 shadow-(--gt-shadow)">
                            <button v-if="showGame" role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(toggleSfxMute)">音效：{{ isSfxMuted ? '關' : '開' }}</button>
                            <button role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(guide.open)">怎麼玩</button>
                            <button role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(handleCopyLink)">複製邀請連結</button>
                            <button v-if="inGame && roomState.isHost" role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(handleFinish)">提早結束這局</button>
                            <button v-if="showGame" role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(goHome)">離開房間</button>
                        </div>
                    </template>
                </div>
            </div>
        </header>

        <GemGuide v-model="guide.show.value" :catalog="state.catalog" :keys="hasKeyboard" />
        <!-- 電腦版：彈出成浮動視窗的區塊會送到這一層 -->
        <div :ref="el => dockTargets.float = el" class="gt-float-host" />
        <!-- 平板：合成表維持浮動面板；電腦版停靠在左欄、手機是「合成表」分頁（見下方） -->
        <GemRecipes v-if="inGame && !isWide && !isPhone" v-model="showRecipes" :view="view" :catalog="state.catalog" @combine="onCombine" />

        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <div v-else-if="state.kicked || (state.error && !roomState.room)" class="overlay">
            <div class="overlay-card text-center">
                <p class="mb-1 text-lg font-semibold text-heading">{{ state.kicked ? '你已離開房間' : '無法進入房間' }}</p>
                <p class="mb-4 text-body">{{ state.kicked || state.error }}</p>
                <button class="btn-primary" @click="goLobby">回到入口</button>
            </div>
        </div>

        <div v-else-if="showNickname" class="overlay">
            <div class="overlay-card">
                <h2 class="neon-heading mb-3 text-xl">輸入暱稱</h2>
                <input v-model="overlayNickname" class="game-input mb-3" type="text" placeholder="你的暱稱" maxlength="8"
                    aria-label="暱稱" autocomplete="off" @keydown.enter="joinWithNickname" />
                <button class="btn-primary" @click="joinWithNickname">加入房間</button>
            </div>
        </div>

        <!-- 等待大廳 -->
        <main v-else-if="view?.phase === 'waiting'" class="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
            <div>
                <h1 class="m-0 font-sans text-3xl font-bold text-(--gt-ink)">等待玩家</h1>
                <button class="mt-2 cursor-pointer border-0 bg-transparent p-0 text-3xl font-bold tabular-nums text-(--gt-accent-ink)"
                    title="複製邀請連結" @click="handleCopyLink">{{ roomState.roomId }}</button>
                <p class="mt-1 mb-0 text-(--gt-muted)">點房號複製邀請連結</p>
            </div>

            <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="(p, i) in roomState.players" :key="p.id" class="gt-row">
                    <span class="size-2.5 shrink-0 rounded-full" :style="{ background: p.is_online ? PLAYER_MARKS[i % PLAYER_MARKS.length] : 'var(--gt-faint)' }" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate text-(--gt-ink)">{{ p.nickname }}</span>
                    <span v-if="p.id === roomState.room?.host_player_id" class="text-(--gt-muted)">房主</span>
                    <span v-if="p.id === roomState.myPlayerId" class="text-(--gt-muted)">我</span>
                </li>
            </ul>

            <fieldset class="m-0 flex flex-col gap-3 border-0 p-0" :disabled="!roomState.isHost">
                <label class="flex flex-col gap-1 text-(--gt-muted)">
                    難度{{ roomState.isHost ? '' : '（房主決定）' }}
                    <select class="gt-input cursor-pointer" :value="view.options.difficulty" @change="setOptions({ difficulty: $event.target.value })">
                        <option v-for="c in DIFFICULTY_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-(--gt-muted)">
                    血量模式{{ roomState.isHost ? '' : '（房主決定）' }}
                    <select class="gt-input cursor-pointer" :value="view.options.livesMode" @change="setOptions({ livesMode: $event.target.value })">
                        <option v-for="c in LIVES_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
                <label class="flex flex-col gap-1 text-(--gt-muted)">
                    波數{{ roomState.isHost ? '' : '（房主決定）' }}
                    <select class="gt-input cursor-pointer" :value="view.options.waves" @change="setOptions({ waves: Number($event.target.value) })">
                        <option v-for="c in WAVE_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
                <label class="flex items-center gap-2 text-(--gt-muted)">
                    <input type="checkbox" class="size-4 cursor-pointer" :checked="view.options.damageTest" @change="setOptions({ damageTest: $event.target.checked })" />
                    傷害測試（每 15 波與最後一波加賽，巨獸不扣血）
                </label>
                <label class="flex flex-col gap-1 text-(--gt-muted)">
                    每回合建造時間
                    <select class="gt-input cursor-pointer" :value="view.options.buildSeconds" @change="setOptions({ buildSeconds: Number($event.target.value) })">
                        <option v-for="c in BUILD_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
            </fieldset>

            <button v-if="roomState.isHost" class="gt-btn gt-btn--lamp" @click="startGame">開始遊戲</button>
            <p v-else-if="roomState.isSpectator" class="m-0 text-(--gt-muted)">你正在觀戰。
                <button class="gt-btn gt-btn--small" @click="upgradeFromSpectator">加入遊戲</button></p>
            <p v-else class="m-0 text-(--gt-muted)">等房主開始遊戲。</p>
        </main>

        <!-- 遊戲畫面：電腦三欄（左 戰況、中 地圖、右 操作），窄螢幕由 CSS 改成上下堆疊 -->
        <main v-else-if="view?.board && state.catalog" class="gt-game" :style="colStyle">
            <aside class="gt-rail" aria-label="戰況">
                <div class="gt-resizer gt-resizer--rail" role="separator" aria-orientation="vertical" aria-label="拖拉調整左欄寬度（雙擊還原）" @pointerdown="startCol($event, 'rail')" @dblclick="resetCol('rail')" />
                <!-- 電腦版：戰況與合成表分成上下兩塊，各自捲動 -->
                <div :ref="el => dockTargets.left = el" class="gt-rail-top">
                    <GemDock id="status" title="血量與波次" class="gt-card max-sm:hidden" aria-label="血量、金幣與波次">
                      <div class="flex flex-col gap-3">
                        <div class="flex items-end justify-between gap-2">
                            <!-- 標籤和數字分兩行：兩位數的波次＋秒數也排得下，不會換行跑版 -->
                            <p class="m-0 min-w-0 whitespace-nowrap">
                                <template v-if="view.nextWave?.test">
                                    <span class="block text-xs font-semibold text-(--gt-accent-ink)">傷害測試</span>
                                    <span class="sr-only">傷害測試，第 {{ view.nextWave.number }} 波後</span>
                                    <span aria-hidden="true"><span class="text-(--gt-muted)">第 </span><b class="text-2xl leading-none font-extrabold text-(--gt-ink) tabular-nums">{{ view.nextWave.number }}</b><span class="text-(--gt-muted)"> 波後</span></span>
                                </template>
                                <template v-else>
                                    <span class="block text-xs text-(--gt-muted)">波次</span>
                                    <span class="sr-only">第 {{ waveNumber }} 波，共 {{ view.options.waves }} 波</span>
                                    <span aria-hidden="true"><b class="text-2xl leading-none font-extrabold text-(--gt-ink) tabular-nums">{{ waveNumber }}</b><span class="text-(--gt-muted) tabular-nums">／{{ view.options.waves }}</span></span>
                                </template>
                            </p>
                            <p v-if="secondsLeft !== null" class="m-0 shrink-0 text-right whitespace-nowrap" role="timer" aria-label="建造剩餘秒數">
                                <span class="block text-xs text-(--gt-muted)">建造剩餘</span>
                                <span class="gt-timer" :class="{ 'gt-timer--low': secondsLeft <= 10 }">{{ secondsLeft }}<span class="ml-0.5 text-sm font-bold">秒</span></span>
                            </p>
                        </div>
                        <div class="flex flex-wrap gap-x-5 gap-y-1">
                            <p class="gt-stat" :title="view.options.livesMode === 'team' ? '隊伍血量' : '我的血量'">
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--gt-accent)" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z" /></svg>
                                <span class="sr-only">{{ view.options.livesMode === 'team' ? '隊伍血量' : '我的血量' }}</span><span>{{ lives }}<span class="font-normal text-(--gt-muted)">／{{ view.maxLives }}</span></span>
                            </p>
                            <p v-if="view.me" class="gt-stat" title="金幣">
                                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="var(--gt-gold)" stroke="var(--gt-ink)" stroke-width="1.6" /><path d="M12 7.5v9M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" fill="none" stroke="var(--gt-ink)" stroke-width="1.4" stroke-linecap="round" /></svg>
                                <span class="sr-only">金幣</span><span>{{ gold }} <span class="font-normal text-(--gt-muted)">金</span></span>
                            </p>
                        </div>
                      </div>
                    </GemDock>

                    <GemDock v-if="view.playerIds.length > 1" id="players" title="玩家" :class="phoneShow('status')" aria-label="玩家">
                        <GemPlayerTabs vertical :view="view" :catalog="state.catalog" :frame="frame" :my-id="roomState.myPlayerId" @watch="watchMap" />
                    </GemDock>
                    <!-- 看別人的地圖：提示放在左欄，不疊在地圖上 -->
                    <div v-if="!mine" class="gt-card flex flex-col gap-2" :class="phoneShow('place', 'tower')" role="status">
                        <p class="m-0">正在看 <b class="text-(--gt-ink)">{{ watchingName }}</b> 的地圖，不能操作。</p>
                        <button v-if="view.me" class="gt-btn gt-btn--small w-full" @click="watchMap(roomState.myPlayerId)">回到我的地圖</button>
                    </div>

                    <GemWaveInfo :class="phoneShow('status')" :view="view" :catalog="state.catalog" :frame="frame" :my-id="roomState.myPlayerId"
                        :is-host="roomState.isHost" :keys="hasKeyboard" @speed="setSpeed" />
                    <button v-if="isSolo && (view.phase === 'build' || view.phase === 'wave')" class="gt-btn gt-btn--small w-full" :class="phoneShow('status')" aria-keyshortcuts="P" @click="setPaused(true)">
                        暫停<kbd v-if="hasKeyboard" class="gt-kbd ml-2" aria-hidden="true">P</kbd>
                    </button>
                    <GemDock v-if="view.testLog" id="testlog" title="傷害測試紀錄" class="gt-card" :class="phoneShow('status')"><GemTestBoard :test="view.testLog" :names="view.names" /></GemDock>
                    <!-- 手機：合成表是一個分頁，直接排在內容區，不再浮在地圖上 -->
                    <GemRecipes v-if="inGame && isPhone && phoneTab === 'recipes'" :model-value="true" inline :view="view" :catalog="state.catalog" @combine="onCombine" />
                </div>
                <GemDock v-if="isWide && showRecipes" id="recipes" title="合成表" external-close aria-label="合成表" @close="showRecipes = false">
                    <GemRecipes :model-value="true" inline :view="view" :catalog="state.catalog" @combine="onCombine" />
                </GemDock>
            </aside>

            <section class="gt-stage" aria-label="地圖">
                <GemBoard :view="view" :frame="frame" :catalog="state.catalog" :my-id="roomState.myPlayerId"
                    :pending-gem="pendingGem" :selected-id="selectedId"
                    @cell="onCell" @tower="onTower" @clear="clearSelection" />
            </section>

            <!-- 手機專用分頁列：電腦與平板不顯示 -->
            <nav class="gt-tabbar hidden max-sm:flex" aria-label="操作分頁">
                <button v-for="t in PHONE_TABS" :key="t.id" class="gt-phonetab" :aria-pressed="phoneTab === t.id" @click="phoneTab = t.id">{{ t.label }}</button>
            </nav>

            <aside :ref="el => dockTargets.right = el" class="gt-side" aria-label="操作">
                <div class="gt-resizer gt-resizer--side" role="separator" aria-orientation="vertical" aria-label="拖拉調整右欄寬度（雙擊還原）" @pointerdown="startCol($event, 'side')" @dblclick="resetCol('side')" />
                <p v-if="roomState.isSpectator" class="m-0 text-(--gt-muted)" :class="phoneShow('place')">你正在觀戰。</p>
                <GemPanel :phone-tab="phoneTab" :view="view" :catalog="state.catalog" :selected-slot="activeSlot" :selected-id="selectedId"
                    :swap-from="swapFrom" :my-id="roomState.myPlayerId" :keys="hasKeyboard"
                    @select-slot="onSelectSlot" @select-tower="onTower"
                    @keep="id => { keep(id); clearSelection() }" @merge="id => { merge(id); clearSelection() }"
                    @combine="onCombine" @ready="ready" @upgrade="upgradeQuality" @buy-life="buyLife" @reroll="reroll" @wish="makeWish" @vote-mutation="voteMutation" @research="upgradeResearch"
                    @remove="id => { removeStone(id); clearSelection() }"
                    @start-swap="id => swapFrom = id" @cancel-swap="swapFrom = null" />
            </aside>
        </main>

        <!-- 暫停（單人） -->
        <div v-if="view?.paused && view.phase !== 'finished'" class="overlay">
            <div class="flex w-full max-w-[360px] flex-col gap-4 border border-(--gt-line) bg-(--gt-surface) p-6 text-center text-(--gt-text)">
                <h2 class="m-0 font-sans text-3xl font-black text-(--gt-ink)">已暫停</h2>
                <button class="gt-btn gt-btn--lamp" @click="setPaused(false)">繼續遊戲<kbd v-if="hasKeyboard" class="gt-kbd ml-2" aria-hidden="true">P</kbd></button>
            </div>
        </div>

        <!-- 結算 -->
        <div v-if="view?.phase === 'finished' && view.result" class="overlay">
            <div class="flex max-h-full w-full max-w-[460px] flex-col gap-4 overflow-y-auto border border-(--gt-line) bg-(--gt-surface) p-6 text-(--gt-text)">
                <img :src="view.result.win ? RESULT_WIN_IMAGE : RESULT_LOSE_IMAGE" alt="" class="mx-auto block h-auto max-h-36 w-auto max-w-full object-contain" />
                <h2 class="m-0 font-sans text-4xl font-black text-(--gt-ink)">{{ resultTitle }}</h2>
                <p class="m-0">{{ resultText }}</p>
                <ul class="m-0 flex list-none flex-col gap-1 p-0">
                    <li v-for="s in view.result.scores" :key="s.id" class="flex justify-between gap-3">
                        <span class="truncate">{{ view.names?.[s.id] ?? '玩家' }}</span>
                        <span class="shrink-0 tabular-nums">{{ scoreText(s) }}</span>
                    </li>
                </ul>
                <p v-if="view.result.topTower && state.catalog" class="m-0 flex items-center gap-2">
                    <GemIcon :kind="view.result.topTower.kind" :level="view.result.topTower.level" :size="32" />
                    <span>最強的塔：{{ nameOf(view.result.topTower.owner) }} 的{{ topTowerName }}，打出 {{ view.result.topTower.damage.toLocaleString() }} 傷害</span>
                </p>

                <GemTestBoard :test="view.result.test" :names="view.names" />

                <section v-if="awardRows.length" aria-label="本局指標">
                    <h3 class="gt-heading">本局指標</h3>
                    <ul class="m-0 flex list-none flex-col gap-1 p-0">
                        <li v-for="a in awardRows" :key="a.label" class="flex justify-between gap-3">
                            <span class="shrink-0 text-(--gt-muted)">{{ a.label }}</span>
                            <span class="min-w-0 truncate text-right">{{ a.text }}</span>
                        </li>
                    </ul>
                </section>
                <button v-if="roomState.isHost" class="gt-btn gt-btn--lamp" @click="restart">回大廳再來一局</button>
                <p v-else class="m-0 text-(--gt-muted)">等房主開新的一局。</p>
                <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="gt-btn" @click="upgradeFromSpectator">加入下一局</button>
            </div>
        </div>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import { useGameGuide } from '@/shared/composables/useGameGuide.js'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import PwaInstallButton from '@/shared/components/PwaInstallButton.vue'
import { useGemTd } from '../composables/useGemTd.js'
import { useGemTdCues, useGemTdSfx } from '../composables/useGemTdSfx.js'
import { useGemTdKeys } from '../composables/useGemTdKeys.js'
import { WAVE_CHOICES, BUILD_CHOICES, LIVES_CHOICES, DIFFICULTY_CHOICES, nextSpeed, PLAYER_MARKS, isSpecial, RESULT_WIN_IMAGE, RESULT_LOSE_IMAGE } from '../data/gems.js'
import GemBoard from '../components/GemBoard.vue'
import GemPanel from '../components/GemPanel.vue'
import GemPlayerTabs from '../components/GemPlayerTabs.vue'
import GemGuide from '../components/GemGuide.vue'
import GemRecipes from '../components/GemRecipes.vue'
import GemHeaderIcon from '../components/GemHeaderIcon.vue'
import GemIcon from '../components/GemIcon.vue'
import GemVolumePanel from '../components/GemVolumePanel.vue'
import GemWaveInfo from '../components/GemWaveInfo.vue'
import GemTestBoard from '../components/GemTestBoard.vue'
import GemDock from '../components/GemDock.vue'
import GemDockMenu from '../components/GemDockMenu.vue'
import { targets as dockTargets, desktop as dockDesktop } from '../composables/useGemDock.js'

const route = useRoute()
const router = useRouter()
const {
    state, frame, roomState, connect, setOptions, watch: watchMap, startGame, place, keep, merge, combine,
    upgradeQuality, buyLife, reroll, makeWish, voteMutation, upgradeResearch, removeStone, swap, ready, setSpeed, setPaused, finishNow, restart,
    clearError, clearNotice, disconnect, copyInviteLink,
    kickPlayer, transferHost, leaveRoom, upgradeFromSpectator,
} = useGemTd()
const { playSfx, isSfxMuted, toggleSfxMute } = useGemTdSfx()

const guide = useGameGuide('gem-td-guide-seen')
const view = computed(() => state.view)
const inGame = computed(() => !!state.catalog && ['build', 'wave'].includes(view.value?.phase))
// 電腦版（≥1024px）合成表停靠在左欄，預設打開；開關狀態記在本機
const wideQuery = window.matchMedia('(min-width: 1024px)')
const isWide = ref(wideQuery.matches)
const isSolo = computed(() => (view.value?.playerIds?.length ?? 0) === 1 && !roomState.isSpectator)
dockDesktop.value = isWide.value
const onWideChange = (e) => { isWide.value = e.matches; dockDesktop.value = e.matches }
wideQuery.addEventListener('change', onWideChange)
const RECIPES_KEY = 'gem-td-recipes-open'
const showRecipes = ref((() => {
    try { return isWide.value && localStorage.getItem(RECIPES_KEY) !== '0' } catch { return isWide.value }
})())
watch(showRecipes, (open) => {
    if (!isWide.value) return
    try { localStorage.setItem(RECIPES_KEY, open ? '1' : '0') } catch { /* 略過 */ }
})

// 手機（<640px，同 Tailwind 的 max-sm）：地圖固定在上方，下面用分頁切換操作區。
// 分頁只靠 max-sm: 的 class 隱藏，電腦與平板的畫面不受影響
const phoneQuery = window.matchMedia('(max-width: 639px)')
const isPhone = ref(phoneQuery.matches)
const onPhoneChange = (e) => { isPhone.value = e.matches }
phoneQuery.addEventListener('change', onPhoneChange)
const PHONE_TABS = [
    { id: 'place', label: '放置' },
    { id: 'tower', label: '塔' },
    { id: 'recipes', label: '合成表' },
    { id: 'shop', label: '商店' },
    { id: 'status', label: '戰況' },
]
const phoneTab = ref('place')
const phoneShow = (...tabs) => (tabs.includes(phoneTab.value) ? '' : 'max-sm:hidden')
const menuOpen = ref(false)

// 左右欄寬度：拖把手調整，雙擊還原，記在本機（只影響電腦版的三欄格線）
const COLS_KEY = 'gem-td-col-widths'
const COL_RANGE = { rail: [200, 480], side: [280, 560] }
const MIN_MAP = 320
const colW = ref((() => {
    try {
        const v = JSON.parse(localStorage.getItem(COLS_KEY))
        return { rail: Number.isFinite(v?.rail) ? v.rail : null, side: Number.isFinite(v?.side) ? v.side : null }
    } catch { return { rail: null, side: null } }
})())
const colStyle = computed(() => ({
    ...(colW.value.rail ? { '--gt-rail-w': `${colW.value.rail}px` } : {}),
    ...(colW.value.side ? { '--gt-side-w': `${colW.value.side}px` } : {}),
}))
function saveCols() {
    try { localStorage.setItem(COLS_KEY, JSON.stringify(colW.value)) } catch { /* 略過 */ }
}
function resetCol(which) {
    colW.value = { ...colW.value, [which]: null }
    saveCols()
}
function startCol(e, which) {
    e.preventDefault()
    const el = e.currentTarget.parentElement
    const game = el.parentElement
    const sx = e.clientX
    const w0 = el.offsetWidth
    const other = (which === 'rail' ? game.querySelector('.gt-side') : game.querySelector('.gt-rail')).offsetWidth
    const [lo, hi] = COL_RANGE[which]
    const max = Math.max(lo, Math.min(hi, game.clientWidth - other - MIN_MAP))
    const move = (ev) => {
        const dx = ev.clientX - sx
        const w = Math.round(Math.min(max, Math.max(lo, w0 + (which === 'rail' ? dx : -dx))))
        colW.value = { ...colW.value, [which]: w }
    }
    const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        document.body.style.userSelect = ''
        saveCols()
    }
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
}
// 遊戲畫面（地圖）是否正在顯示；條件跟 template 的 <main class="gt-game"> 一致
const showGame = computed(() => !state.loading && !state.kicked && !(state.error && !roomState.room)
    && !showNickname.value && view.value?.phase !== 'waiting' && !!view.value?.board && !!state.catalog)
function menuAction(fn) {
    menuOpen.value = false
    fn()
}

const showNickname = ref(false)
const overlayNickname = ref('')

// ── 選取狀態 ─────────────────────────────────────────────────────
const selectedSlot = ref(null)
const selectedId = ref(null)
const swapFrom = ref(null)

const pending = computed(() => view.value?.me?.pending ?? [])
const activeSlot = computed(() => (
    pending.value.some(g => g.slot === selectedSlot.value) ? selectedSlot.value : pending.value[0]?.slot ?? null
))
// 只有在自己的地圖上才能放甜點；看別人的地圖時是唯讀
const mine = computed(() => view.value?.watching === roomState.myPlayerId)
const watchingName = computed(() => view.value?.names?.[view.value.watching] ?? '玩家')
const pendingGem = computed(() => (
    view.value?.phase === 'build' && mine.value ? pending.value.find(g => g.slot === activeSlot.value) ?? null : null
))

function clearSelection() {
    selectedId.value = null
    swapFrom.value = null
}

function onCell(x, y) {
    if (activeSlot.value === null || !mine.value) return
    place(activeSlot.value, x, y)
}

function onSelectSlot(slot) {
    selectedSlot.value = slot
    playSfx('click')
}

function onTower(tower) {
    if (swapFrom.value && tower.kind === 'stone') {
        swap(swapFrom.value, tower.id)
        clearSelection()
        return
    }
    selectedId.value = tower.id
    playSfx('click')
}

function onCombine(recipeId) {
    // 選中的塔是材料時，特殊塔就出現在那裡
    combine(recipeId, selectedId.value ?? undefined)
    clearSelection()
}

// ── 抬頭資訊 ─────────────────────────────────────────────────────
// 血量顯示自己的；觀戰者顯示正在看的玩家
const livesOwner = computed(() => (view.value?.me ? roomState.myPlayerId : view.value?.watching))
const lives = computed(() => frame.value?.players[livesOwner.value]?.lives ?? view.value?.players[livesOwner.value]?.lives ?? 0)
const gold = computed(() => (view.value?.me?.gold ?? 0) + (frame.value?.players[roomState.myPlayerId]?.earned ?? 0))
const waveNumber = computed(() => view.value?.nextWave?.number ?? view.value?.wave ?? 0)

const topTowerName = computed(() => {
    const t = view.value?.result?.topTower
    if (!t) return ''
    if (isSpecial(t.kind)) return state.catalog.specials[t.kind].name
    return `Lv${t.level} ${state.catalog.levelNames[t.level - 1]}${state.catalog.gems[t.kind].name}`
})

// ── 結算文字 ─────────────────────────────────────────────────────
const nameOf = id => view.value?.names?.[id] ?? '玩家'

const resultTitle = computed(() => {
    const r = view.value?.result
    if (!r) return ''
    if (!r.versus) return r.win ? '蛋糕守住了' : '蛋糕被搬光了'
    if (!r.win) return '沒有贏家'
    if (r.winnerIds.length > 1) return `${r.winnerIds.map(nameOf).join('、')} 並列第一`
    return r.winnerIds[0] === roomState.myPlayerId ? '你贏了' : `${nameOf(r.winnerIds[0])} 獲勝`
})

const resultText = computed(() => {
    const r = view.value?.result
    if (!r) return ''
    if (r.versus) return r.win ? `打到第 ${r.wave} 波，最高還剩 ${r.lives} 點血。` : `撐到第 ${r.wave} 波。`
    return r.win ? `撐過全部 ${view.value.options.waves} 波，還剩 ${r.lives} 點血。` : `撐到第 ${r.wave} 波。`
})

// 結算的本局指標：沒有人得獎的項目不顯示
const awardRows = computed(() => {
    const a = view.value?.result?.awards
    if (!a) return []
    const rows = []
    if (a.saver) rows.push({ label: '最會存錢', text: `${nameOf(a.saver.id)}（峰值 ${a.saver.value.toLocaleString()} 金）` })
    if (a.leaker) rows.push({ label: '漏怪王', text: `${nameOf(a.leaker.id)}（漏 ${a.leaker.value} 隻）` })
    if (a.killer) rows.push({ label: '擊殺王', text: `${nameOf(a.killer.id)}（${a.killer.value.toLocaleString()} 殺）` })
    if (a.dealer) rows.push({ label: '輸出王', text: `${nameOf(a.dealer.id)}（${a.dealer.value.toLocaleString()} 傷）` })
    if (a.lifeBuyer) rows.push({ label: '最愛買命', text: `${nameOf(a.lifeBuyer.id)}（${a.lifeBuyer.value} 次）` })
    if (a.perfectIds.length) rows.push({ label: '完美防守', text: `${a.perfectIds.map(nameOf).join('、')}（零漏怪）` })
    return rows
})

function scoreText(s) {
    const score = `${s.kills} 殺，${s.damage.toLocaleString()} 傷，漏 ${s.leaked}`
    if (!view.value?.result?.versus) return score
    return `${s.out ? `第 ${s.outWave} 波出局` : `♥ ${s.lives}`}，${score}`
}

// 只在有倒數時更新時間：波次中不必每 250ms 重繪整頁
const nowTick = ref(Date.now())
const clock = setInterval(() => { if (view.value?.buildEndsAt) nowTick.value = Date.now() }, 250)
const secondsLeft = computed(() => {
    const ends = view.value?.buildEndsAt
    if (!ends) return null
    return Math.max(0, Math.ceil((ends - (nowTick.value + state.clockOffset)) / 1000))
})

useGemTdCues({ view: () => state.view, frame, myId: () => roomState.myPlayerId, secondsLeft })

// ── 通知 ─────────────────────────────────────────────────────────
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '', duration = 2600) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

watch(() => state.error, (message) => {
    if (!message || !roomState.room) return
    showToast(message, 'error')
    playSfx('error')
    clearError()
})
watch(() => state.notice, (message) => {
    if (!message) return
    showToast(message, 'info')
    playSfx('notice')
    clearNotice()
})
watch(() => view.value?.watching, clearSelection)
// 手機：點到塔就切到「塔」分頁，取消選取就回「放置」；挑選保留的甜點時留在「放置」
watch(selectedId, (id) => {
    if (!isPhone.value) return
    if (id !== null && !view.value?.me?.choosing) phoneTab.value = 'tower'
    else if (id === null && phoneTab.value === 'tower') phoneTab.value = 'place'
})
watch(() => view.value?.phase, (phase, before) => {
    if (isPhone.value) {
        if (phase === 'build') phoneTab.value = 'place'
        else if (phase === 'wave') phoneTab.value = 'status'
    }
    clearSelection()
    if (phase === 'build' && before === 'waiting') guide.autoOpen()
})

// ── 鍵盤快捷鍵（按鍵表見 useGemTdKeys.js 的 KEY_HELP）────────────
// 每個按鍵只在對應按鈕看得到、按得下去時才動作，條件跟 GemPanel 一致
const DIGITS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4 }

function freshRows() {
    const me = view.value?.me
    return (me?.fresh ?? []).map(f => ({ ...f, tower: me.towers.find(t => t.id === f.id) })).filter(f => f.tower)
}

function handleKey(code) {
    const v = view.value
    const me = v.me
    const catalog = state.catalog
    const building = v.phase === 'build' && mine.value && me && !me.out
    const selected = v.towers.find(t => t.id === selectedId.value)

    if (code in DIGITS) {
        if (!building) return false
        const i = DIGITS[code]
        if (me.pending.length) {
            const g = me.pending[i]
            if (g) onSelectSlot(g.slot)
            return true
        }
        if (me.choosing) {
            const f = freshRows()[i]
            if (f) onTower(f.tower)
            return true
        }
        return false
    }

    switch (code) {
    case 'KeyK':
    case 'KeyM': {
        if (!building || !me.choosing) return false
        const f = freshRows().find(r => r.id === selectedId.value)
        if (!f) return false
        if (code === 'KeyK') keep(f.id)
        else if (f.mergeGain) merge(f.id)
        else return false
        clearSelection()
        return true
    }
    case 'KeyR':
        if (!building || !me.resolved || me.ready) return false
        ready()
        return true
    case 'KeyU': {
        if (!building) return false
        const cost = catalog.qualityCosts[me.quality - 1]
        if (cost && me.gold >= cost) upgradeQuality()
        return true
    }
    case 'KeyD':
        if (!building || !me.canReroll) return false
        if (me.gold >= me.rerollCost) reroll()
        return true
    case 'KeyS':
        if (swapFrom.value) { swapFrom.value = null; return true }
        if (!building || !selected || selected.kind === 'stone' || selected.fresh) return false
        if (me.gold >= catalog.swapCost) swapFrom.value = selected.id
        return true
    case 'Delete':
    case 'Backspace':
        if (!building || selected?.kind !== 'stone' || swapFrom.value) return false
        removeStone(selected.id)
        clearSelection()
        return true
    case 'KeyB':
        if (!inGame.value) return false
        if (isPhone.value) phoneTab.value = phoneTab.value === 'recipes' ? 'place' : 'recipes'
        else showRecipes.value = !showRecipes.value
        return true
    case 'KeyV': {
        const ids = v.playerIds ?? []
        if (ids.length < 2) return false
        watchMap(ids[(ids.indexOf(v.watching) + 1) % ids.length])
        return true
    }
    case 'KeyF':
        if (!roomState.isHost || v.phase !== 'wave') return false
        setSpeed(nextSpeed(v.speed))
        return true
    case 'KeyP':
        if (!isSolo.value || (v.phase !== 'build' && v.phase !== 'wave')) return false
        setPaused(!v.paused)
        return true
    case 'KeyH':
        guide.open()
        return true
    case 'Escape':
        if (showRecipes.value) { showRecipes.value = false; return true }
        if (swapFrom.value || selectedId.value !== null) { clearSelection(); return true }
        return false
    default:
        return false
    }
}

const { hasKeyboard } = useGemTdKeys(handleKey, () => (
    !guide.show.value && !!state.catalog && ['build', 'wave'].includes(view.value?.phase)
))

// ── 進出房間 ─────────────────────────────────────────────────────
function enter(nickname) {
    saveNickname(nickname)
    connect(
        String(route.query.id).toUpperCase(),
        nickname,
        route.query.create === '1',
        Number(route.query.max) || 4,
    )
}

function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { showToast('請輸入暱稱', 'error'); return }
    showNickname.value = false
    enter(nickname)
}

function goLobby() {
    disconnect()
    router.push({ name: 'gem-td' })
}

async function goHome() {
    if (!confirm('確定要離開房間嗎？離開後再進來會是全新的人。')) return
    await leaveRoom()
    goLobby()
}

function handleCopyLink() {
    copyInviteLink()
    showToast('邀請連結已複製', 'success')
}

function handleFinish() {
    if (confirm('確定要提早結束這局嗎？')) finishNow()
}

onMounted(() => {
    if (!route.query.id) { router.replace({ name: 'gem-td' }); return }
    const nickname = route.query.nickname || getSavedNickname()
    if (nickname) enter(String(nickname))
    else showNickname.value = true
})

onUnmounted(() => {
    wideQuery.removeEventListener('change', onWideChange)
    phoneQuery.removeEventListener('change', onPhoneChange)
    clearInterval(clock)
    clearTimeout(_toastTimer)
})
</script>
