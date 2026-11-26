<template>
    <div class="gt-root flex h-[100dvh] w-full flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />

        <header class="flex shrink-0 items-center justify-between gap-3 border-b border-(--gt-line) px-3 py-1.5">
            <!-- 遊戲中：標題列左邊只放自己的血量、金幣、波次、倒數；離開與房號收進「更多」 -->
            <div v-if="showGame" class="gt-hud min-w-0">
                <span class="gt-hud-item" :class="{ 'gt-hud-item--low': livesLow, 'gt-hud-item--hurt': hurt }" :title="view.options.livesMode === 'team' ? '隊伍血量' : '我的血量'">
                    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="var(--gt-accent)" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.6 1.2 5.4 3.1 1.8-1.9 3.3-3.1 5.4-3.1 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z" /></svg>
                    <span class="sr-only">{{ view.options.livesMode === 'team' ? '隊伍血量' : '我的血量' }}</span>{{ lives }}<span class="gt-hud-sub max-sm:hidden">／{{ view.maxLives }}</span>
                </span>
                <span v-if="view.me" class="gt-hud-item" title="金幣">
                    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="var(--gt-gold)" stroke="var(--gt-ink)" stroke-width="1.6" /><path d="M12 7.5v9M9.5 10h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" fill="none" stroke="var(--gt-ink)" stroke-width="1.4" stroke-linecap="round" /></svg>
                    <span class="sr-only">金幣</span>{{ gold }}
                </span>
                <span class="gt-hud-item">
                    <span class="sr-only">{{ view.nextWave?.test ? '傷害測試，' : '' }}第 {{ waveNumber }} 波{{ view.options.waves ? `，共 ${view.options.waves} 波` : '（無盡）' }}</span>
                    <span v-if="view.nextWave?.test" class="text-(--gt-accent-ink)" aria-hidden="true">傷害測試</span>
                    <span v-else aria-hidden="true"><span class="gt-hud-sub max-sm:hidden">第 </span>{{ waveNumber }}<span v-if="view.options.waves" class="gt-hud-sub">／{{ view.options.waves }}</span><span class="gt-hud-sub max-sm:hidden"> 波</span></span>
                </span>
                <span v-if="waveBrief" class="gt-hud-next" :title="waveBrief.text">
                    <b>下一波：</b>{{ waveBrief.body }}<b v-if="waveBrief.warn" class="ml-2 !text-(--gt-accent-ink)">{{ waveBrief.warn }}</b>
                </span>
                <span v-if="secondsLeft !== null" class="gt-hud-item" :class="secondsLeft <= 10 && 'text-(--gt-accent-ink)'" role="timer" aria-label="建造剩餘秒數">
                    <span class="gt-hud-sub max-sm:hidden">建造 </span>{{ secondsLeft }}<span class="gt-hud-sub">秒</span>
                </span>
            </div>
            <div v-else class="flex min-w-0 items-center gap-2">
                <button class="gt-chip" @click="goHome">離開</button>
                <span class="truncate font-sans font-bold text-(--gt-ink) max-[400px]:hidden">甜點守衛戰</span>
                <span class="hidden text-(--gt-muted) tabular-nums sm:inline">{{ roomState.roomId }}</span>
            </div>

            <!-- 現在該做什麼：寬螢幕放在標題列正中間，一眼看到目前的步驟 -->
            <p v-if="showGame && phaseHint" class="gt-phase max-xl:hidden" role="status">
                <span class="gt-phase-tag">{{ phaseHint.tag }}</span><span class="truncate">{{ phaseHint.text }}</span>
            </p>

            <div class="flex shrink-0 items-center gap-1">
                <!-- 單人的暫停、房主的倍速：電腦與平板在標題列；手機在「戰況」分頁 -->
                <template v-if="inGame">
                    <button v-if="isSolo" class="gt-hud-btn max-sm:hidden" :title="hasKeyboard ? '暫停（P）' : '暫停'" aria-keyshortcuts="P" @click="setPaused(true)">
                        <GemHeaderIcon name="pause" />暫停
                    </button>
                    <button v-if="roomState.isHost" class="gt-hud-btn mr-1 max-sm:hidden" :title="hasKeyboard ? '切換倍速（F）' : '切換倍速'"
                        :aria-label="`目前 ${view.speed} 倍速，切換為 ${nextSpeed(view.speed)} 倍`" aria-keyshortcuts="F" @click="setSpeed(nextSpeed(view.speed))">
                        <GemHeaderIcon name="speed" /><span class="tabular-nums">{{ view.speed }}×</span>
                    </button>
                </template>
                <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                    :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
                <PwaInstallButton v-if="!showGame" button-class="header-icon-btn" hint-class="gt-install-hint" />
                <GemVolumePanel v-if="!showGame" />
                <button v-if="inGame && !isWide" class="header-icon-btn relative max-sm:hidden" :title="hasKeyboard ? '圖鑑（B）' : '圖鑑'" aria-label="圖鑑" aria-keyshortcuts="B" :aria-pressed="showRecipes" @click="showRecipes = !showRecipes"><GemHeaderIcon name="book" /><span v-if="readyFavs" class="gt-dot gt-dot--corner" aria-hidden="true" /><span v-if="readyFavs" class="sr-only">最愛有 {{ readyFavs }} 種可以合成</span></button>
                <template v-if="!showGame">
                    <button class="header-icon-btn max-sm:hidden" :title="hasKeyboard ? '怎麼玩（H）' : '怎麼玩'" aria-label="怎麼玩" aria-keyshortcuts="H" @click="guide.open"><GemHeaderIcon name="help" /></button>
                    <button class="header-icon-btn max-sm:hidden" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink"><GemHeaderIcon name="link" /></button>
                </template>

                <!-- 「更多」：遊戲中所有寬度都有（怎麼玩、邀請、提早結束、離開）；遊戲外只有手機才收進來 -->
                <div class="relative" :class="!showGame && 'hidden max-sm:block'">
                    <button class="header-icon-btn" aria-label="更多選項" title="更多選項" aria-haspopup="menu" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen"><GemHeaderIcon name="more" /></button>
                    <template v-if="menuOpen">
                        <div class="fixed inset-0 z-40" aria-hidden="true" @click="menuOpen = false" />
                        <div role="menu" aria-label="更多選項"
                            class="absolute right-0 top-full z-50 mt-2 flex w-60 flex-col gap-1 rounded-[10px] border border-(--gt-line) bg-(--gt-surface) p-2 shadow-(--gt-shadow)">
                            <div v-if="showGame" class="border-b border-(--gt-line-soft) pb-2"><GemVolumePanel inline /></div>
                            <button role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(guide.open)">怎麼玩<kbd v-if="hasKeyboard" class="gt-kbd ml-2" aria-hidden="true">H</kbd></button>
                            <button role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(handleCopyLink)">複製邀請連結<span class="ml-2 font-normal text-(--gt-muted) tabular-nums">{{ roomState.roomId }}</span></button>
                            <button v-if="showGame && view.testLog" role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(() => showTestLog = true)">傷害測試紀錄</button>
                            <button v-if="inGame && roomState.isHost" role="menuitem" class="gt-btn border-0 text-left" @click="menuAction(handleFinish)">提早結束這局</button>
                            <button v-if="showGame" role="menuitem" class="gt-btn border-0 text-left text-(--gt-accent-ink)" @click="menuAction(goHome)">離開房間</button>
                        </div>
                    </template>
                </div>
            </div>
        </header>

        <GemGuide v-model="guide.show.value" :catalog="state.catalog" :keys="hasKeyboard" />
        <!-- 傷害測試紀錄：每場測試打完自動跳出，看完關掉；之後要看從「更多」打開 -->
        <GameGuideModal v-model="showTestLog" root-class="gt-modal" title="傷害測試紀錄" confirm-text="關閉">
            <GemTestBoard :test="view?.testLog" :names="view?.names" :heading="false" />
        </GameGuideModal>
        <GemConfirm :dialog="confirmDlg" @confirm="confirmYes" @cancel="confirmNo" />

        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur gt-modal">
            <span class="spinner mb-3.5"></span>
            <p class="text-base text-(--gt-muted)">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <div v-else-if="state.kicked || (state.error && !roomState.room)" class="overlay gt-modal">
            <div class="overlay-card text-center">
                <p class="mb-1 text-lg font-bold text-(--gt-ink)">{{ state.kicked ? '你已離開房間' : '無法進入房間' }}</p>
                <p class="mb-4 text-(--gt-muted)">{{ state.kicked || state.error }}</p>
                <button class="btn-primary" @click="goLobby">回到入口</button>
            </div>
        </div>

        <div v-else-if="showNickname" class="overlay gt-modal">
            <div class="overlay-card">
                <h2 class="neon-heading mb-3 text-xl">輸入暱稱</h2>
                <input v-model="overlayNickname" class="gt-input mb-3" type="text" placeholder="你的暱稱" maxlength="8"
                    aria-label="暱稱" autocomplete="off" @keydown.enter="joinWithNickname" />
                <button class="btn-primary" @click="joinWithNickname">加入房間</button>
            </div>
        </div>

        <!-- 等待大廳 -->
        <main v-else-if="view?.phase === 'waiting'" class="mx-auto flex w-full max-w-[520px] flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
            <div>
                <h1 class="m-0 font-sans text-3xl font-bold text-(--gt-ink)">等待玩家</h1>
                <p class="mt-2 mb-0 text-3xl font-bold tabular-nums text-(--gt-accent-ink)" aria-label="房號">{{ roomState.roomId }}</p>
                <button class="gt-btn mt-3 w-full sm:w-auto" :class="copied && 'gt-btn--on'" @click="handleCopyLink">{{ copied ? '已複製 ✓' : '複製邀請連結' }}</button>
            </div>

            <ul class="m-0 flex list-none flex-col gap-2 p-0">
                <li v-for="(p, i) in roomState.players" :key="p.id" class="gt-row">
                    <span class="size-2.5 shrink-0 rounded-full" :style="{ background: p.is_online ? PLAYER_MARKS[i % PLAYER_MARKS.length] : 'var(--gt-faint)' }" aria-hidden="true" />
                    <span class="min-w-0 flex-1 truncate text-(--gt-ink)">{{ p.nickname }}</span>
                    <span v-if="p.id === roomState.room?.host_player_id" class="text-(--gt-muted)">房主</span>
                    <span v-if="p.id === roomState.myPlayerId" class="text-(--gt-muted)">我</span>
                </li>
            </ul>

            <!-- 房主：先挑一組快速設定，要細調再展開進階；其他人只看目前的設定 -->
            <section v-if="roomState.isHost" class="flex flex-col gap-3" aria-label="房間設定">
                <div>
                    <p class="m-0 mb-1.5 text-(--gt-muted)">快速設定</p>
                    <div class="grid grid-cols-3 gap-2" role="group" aria-label="快速設定">
                        <button v-for="p in PRESETS" :key="p.id" class="gt-btn flex flex-col items-center justify-center !px-2 !py-2 leading-tight"
                            :class="activePreset === p.id && 'gt-btn--on'" :aria-pressed="activePreset === p.id" @click="setOptions(p.options)">
                            <span>{{ p.label }}</span>
                            <span class="text-sm font-normal text-(--gt-muted)">{{ p.hint }}</span>
                        </button>
                    </div>
                    <p class="mt-2 mb-0 text-(--gt-muted)">{{ activePreset ? '' : '自訂：' }}{{ settingsLine }}</p>
                </div>
                <label class="flex flex-col gap-1 text-(--gt-muted)">
                    模式
                    <select class="gt-input cursor-pointer" :value="view.options.mode" @change="setOptions({ mode: $event.target.value })">
                        <option v-for="c in MODE_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
                <label v-if="view.options.mode === 'single'" class="flex flex-col gap-1 text-(--gt-muted)">
                    地圖
                    <select class="gt-input cursor-pointer" :value="view.options.map ?? 0"
                        @change="setOptions({ map: $event.target.value === 'random' ? 'random' : Number($event.target.value) })">
                        <option v-for="c in mapChoices" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                </label>
                <label v-if="view.options.mode === 'relay'" class="flex flex-col gap-1 text-(--gt-muted)">
                    區域數
                    <select class="gt-input cursor-pointer" :value="roomState.players.length > 1 ? roomState.players.length : view.options.zones" :disabled="roomState.players.length > 1"
                        @change="setOptions({ zones: Number($event.target.value) })">
                        <option v-for="c in ZONE_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                    </select>
                    <span class="text-sm">{{ roomState.players.length > 1 ? `多位真人時，區域數 = 玩家數（${roomState.players.length} 區）。` : '只有一位真人時，其餘區域由電腦控制；單人可切換到任何一區操作。' }}強制共用血量。</span>
                </label>
                <p v-if="coop" class="m-0 text-sm" :class="coopCountOk ? 'text-(--gt-muted)' : 'text-(--gt-accent-ink)'" role="status">
                    合作迷宮需要 {{ coopLimits.minPlayers }}～{{ coopLimits.maxPlayers }} 位玩家（目前 {{ roomState.players.length }} 位）；{{ coopLimits.minPlayers }} 人 35×35、{{ coopLimits.maxPlayers }} 人 40×40 的大地圖，全隊共用血量，每人各自的金幣與研究。僅限電腦遊玩。
                </p>
                <details class="gt-fold">
                    <summary class="gt-heading !mb-0">進階設定<GemHeaderIcon name="chevron" class="gt-fold-arrow text-(--gt-muted)" /></summary>
                    <div class="flex flex-col gap-3 pt-2">
                        <label class="flex flex-col gap-1 text-(--gt-muted)">
                            難度
                            <select class="gt-input cursor-pointer" :value="view.options.difficulty" @change="setOptions({ difficulty: $event.target.value })">
                                <option v-for="c in DIFFICULTY_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                            </select>
                        </label>
                        <label v-if="view.options.mode === 'single'" class="flex flex-col gap-1 text-(--gt-muted)">
                            血量模式
                            <select class="gt-input cursor-pointer" :value="view.options.livesMode" @change="setOptions({ livesMode: $event.target.value })">
                                <option v-for="c in LIVES_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                            </select>
                        </label>
                        <label class="flex flex-col gap-1 text-(--gt-muted)">
                            波數
                            <select class="gt-input cursor-pointer" :value="view.options.waves" @change="setOptions({ waves: Number($event.target.value) })">
                                <option v-for="c in WAVE_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                            </select>
                        </label>
                        <label class="flex flex-col gap-1 text-(--gt-muted)">
                            每回合建造時間
                            <select class="gt-input cursor-pointer" :value="view.options.buildSeconds" @change="setOptions({ buildSeconds: Number($event.target.value) })">
                                <option v-for="c in BUILD_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                            </select>
                        </label>
                    </div>
                </details>
            </section>
            <section v-else class="flex flex-col gap-2" aria-label="房間設定">
                <h2 class="gt-heading !mb-0">房間設定<span class="ml-2 font-normal text-(--gt-muted)">房主決定</span></h2>
                <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                    <template v-for="r in settingRows" :key="r[0]">
                        <dt class="text-(--gt-muted)">{{ r[0] }}</dt>
                        <dd class="m-0 text-(--gt-ink)">{{ r[1] }}</dd>
                    </template>
                </dl>
            </section>

            <p v-if="coop && isPhone" class="m-0 text-(--gt-accent-ink)" role="status">合作迷宮的大地圖請用電腦遊玩。</p>
            <button v-if="roomState.isHost" class="gt-btn gt-btn--lamp" :disabled="coop && !coopCountOk" @click="startGame">{{ coop && !coopCountOk ? `合作迷宮需要 ${coopLimits.minPlayers}～${coopLimits.maxPlayers} 位玩家` : '開始遊戲' }}</button>
            <p v-else-if="roomState.isSpectator" class="m-0 text-(--gt-muted)">你正在觀戰。
                <button class="gt-btn gt-btn--small" @click="upgradeFromSpectator">加入遊戲</button></p>
            <p v-else class="m-0 text-(--gt-muted)">等房主開始遊戲。</p>
        </main>

        <!-- 合作迷宮的大地圖沒有手機版：顯示提示而不是壞掉的畫面 -->
        <main v-else-if="isCoop && isPhone && view?.board" class="mx-auto flex w-full max-w-[420px] flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
            <h1 class="m-0 font-sans text-2xl font-bold text-(--gt-ink)">請用電腦遊玩</h1>
            <p class="m-0 text-(--gt-muted)">合作迷宮的共用大地圖還沒有手機版，請改用電腦（或較大的螢幕）加入這個房間。</p>
            <button class="gt-btn" @click="goHome">離開房間</button>
        </main>

        <!-- 遊戲畫面：電腦三欄固定版面（左 波次預告與合成表、中 地圖、右 操作），窄螢幕由 CSS 改成上下堆疊 -->
        <main v-else-if="view?.board && state.catalog" class="gt-game gt-game--tabs" :class="view.relay && 'gt-game--relay'">
            <aside class="gt-rail" aria-label="戰況">
                <!-- 電腦版：上面是玩家與波次（依內容高度），下面的合成表吃掉剩下的高度，各自捲動 -->
                <div class="gt-rail-top">

                    <!-- 環形接力：左欄只放隊伍血量與玩家（電腦版統計與事件在右上「戰況」頁籤）；一般模式是玩家分頁 -->
                    <GemRelayInfo v-if="view.relay && !isLg" :class="phoneShow('status')" :part="isWide ? 'rail' : 'all'" :view="view" :catalog="state.catalog" :frame="frame" :my-id="myId"
                        :is-host="roomState.isHost" :keys="hasKeyboard" @watch="watchMap" @boss-wave="bossWave" />
                    <Teleport v-else-if="!view.relay" :to="sideTopEl" :disabled="!isTray || !sideTopEl">
                    <GemSection v-if="isCoop" title="隊伍" :meta="`${view.playerIds.length} 人`" :class="phoneShow('status')" aria-label="隊伍">
                        <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
                            <li v-for="r in teamRows" :key="r.id" class="flex items-center gap-1.5">
                                <span class="size-2.5 shrink-0 rounded-full" :style="{ background: r.mark }" aria-hidden="true" />
                                <span class="min-w-0 truncate font-semibold text-(--gt-ink)">{{ r.name }}</span>
                                <span class="ml-auto shrink-0" :class="r.alert ? 'text-(--gt-accent-ink)' : 'text-(--gt-muted)'">{{ r.status }}</span>
                            </li>
                        </ul>
                    </GemSection>
                    <GemSection v-else-if="view.playerIds.length > 1" title="玩家" :meta="`${view.playerIds.length} 人`" :class="phoneShow('status')" aria-label="玩家">
                        <GemPlayerTabs vertical :view="view" :catalog="state.catalog" :frame="frame" :my-id="roomState.myPlayerId" @watch="watchMap" />
                    </GemSection>
                    </Teleport>
                    <!-- 看別人的地圖：提示放在左欄，不疊在地圖上 -->
                    <div v-if="!mine" class="gt-card flex flex-col gap-2" :class="phoneShow('place', 'tower')" role="status">
                        <p class="m-0">正在看 <b class="text-(--gt-ink)">{{ watchingName }}</b> 的地圖，不能操作。</p>
                        <button v-if="view.me" class="gt-btn gt-btn--small w-full" @click="watchMap(roomState.myPlayerId)">回到我的地圖</button>
                    </div>

                    <p v-if="view.breaches?.length && view.phase === 'build'" class="gt-card m-0 text-(--gt-accent-ink)" :class="phoneShow('place', 'status')" role="status">
                        路被堵死了：怪物會停在紅色標記的牆前拆牆通過。想擋住就補洞，或把牆加厚。
                    </p>
                    <Teleport :to="sideTopEl" :disabled="!isTray || !sideTopEl || !view.relay">
                    <!-- 環形接力電腦版：預告只留一行摘要在標題列波次後面（waveBrief），進度看底部戰況列 -->
                    <GemWaveInfo v-if="!relayCodexLeft" :class="phoneShow('status')" :view="view" :catalog="state.catalog" :frame="frame" :my-id="myId"
                        :is-host="roomState.isHost" :keys="hasKeyboard" @speed="setSpeed" />
                    </Teleport>
                    <!-- 手機標題列放不下暫停，留在「戰況」分頁；電腦與平板在標題列 -->
                    <button v-if="isSolo && (view.phase === 'build' || view.phase === 'wave')" class="gt-btn gt-btn--small w-full sm:hidden" :class="phoneShow('status')" aria-keyshortcuts="P" @click="setPaused(true)">
                        暫停<kbd v-if="hasKeyboard" class="gt-kbd ml-2" aria-hidden="true">P</kbd>
                    </button>
                    <!-- 手機：合成表是一個分頁，直接排在內容區，不再浮在地圖上 -->
                    <GemCodex v-if="inGame && isPhone && phoneTab === 'recipes'" :view="view" :catalog="state.catalog" @combine="onCombine" />
                </div>
                <!-- 環形接力：左下角放整體地圖，合成表搬到右上頁籤 -->
                <GemRingMini v-if="view.relay && isWide && !isLg" :view="view" :catalog="state.catalog" :frame="frame" :camera="mapCamera" @goto="onMiniGoto" />
                <!-- 環形接力（電腦版）：合成表固定在左欄，玩家抽屜打開時蓋在它上面 -->
                <GemCodex v-if="relayCodexLeft" :view="view" :catalog="state.catalog" :meta="recipeMeta" @combine="onCombine" />
            </aside>

            <div class="gt-center">
                <section class="gt-stage" aria-label="地圖">
                    <GemRingBoard v-if="view.relay" ref="boardRef" :view="view" :frame="frame" :catalog="state.catalog" :my-id="myId"
                        :pending-gem="pendingGem" :selected-id="selectedId" :highlight-ids="combinePick?.ids ?? []" :keys="hasKeyboard"
                        @cell="onCell" @tower="onTower" @clear="clearSelection" @arm="c => armedCell = c" @zone="watchMap" @camera="c => mapCamera = c" />
                    <GemBoard v-else ref="boardRef" :view="view" :frame="frame" :catalog="state.catalog" :my-id="roomState.myPlayerId"
                        :pending-gem="pendingGem" :selected-id="selectedId" :highlight-ids="combinePick?.ids ?? []"
                        :builders="builders" :builder-mode="builderMode && mine" @move="c => moveBuilder(c.x, c.y)"
                        @cell="onCell" @tower="onTower" @clear="clearSelection" @arm="c => armedCell = c" @step="stepPlayer" />
                    <!-- 合成選位置：浮在地圖上方 -->
                    <div v-if="combinePick" class="gt-combine-pick" role="dialog" aria-label="選擇合成位置">
                        <p class="m-0 font-bold">合成「{{ combinePick.name }}」：點地圖上金框的塔，決定它出現在哪裡</p>
                        <div class="flex flex-wrap items-center justify-center gap-1.5">
                            <button v-for="t in combineChoices" :key="t.id" class="gt-chip" @click="chooseCombineAt(t.id)">
                                <GemIcon :kind="t.kind" :level="t.level" :size="26" />第 {{ t.x + 1 }} 欄・第 {{ t.y + 1 }} 列
                            </button>
                            <button class="gt-chip" @click="cancelCombinePick">取消<kbd v-if="hasKeyboard" class="gt-kbd ml-1.5" aria-hidden="true">Esc</kbd></button>
                        </div>
                    </div>
                </section>
                <!-- 電腦版托盤：本回合甜點、還原、準備搬到地圖正下方（GemPanel 用 Teleport 放進來） -->
                <div class="gt-tray" aria-label="本回合操作">
                    <!-- 環形接力：最下面這一列左邊是整體地圖，右邊是放塔資訊、還原、開始 -->
                    <div v-if="view.relay && isLg" class="gt-tray-map">
                        <GemRingMini compact :view="view" :catalog="state.catalog" :frame="frame" :camera="mapCamera" @goto="onMiniGoto" />
                    </div>
                    <div ref="trayHandEl" class="gt-tray-hand" />
                    <div ref="trayPrevEl" class="gt-tray-prev" />
                    <div ref="trayActEl" class="gt-tray-act" />
                    <!-- 出怪中：建造用的欄位都是空的，換成全隊戰況（血量、擊殺、各區傳出） -->
                    <GemWaveBar v-if="view.phase === 'wave'" :view="view" :catalog="state.catalog" :frame="frame" :is-host="roomState.isHost" :is-solo="isSolo" :keys="hasKeyboard"
                        @speed="setSpeed" @pause="setPaused(true)" @skill="castSkill" :can-cast="!!mine && !view.me?.out" />
                </div>
            </div>

            <!-- 手機專用分頁列：電腦與平板不顯示 -->
            <nav class="gt-tabbar hidden max-sm:flex" aria-label="操作分頁">
                <button v-for="t in PHONE_TABS" :key="t.id" class="gt-phonetab" :aria-pressed="phoneTab === t.id" @click="phoneTab = t.id">{{ t.label }}<span v-if="t.id === 'shop' && shopAfford" class="gt-dot gt-dot--corner" aria-hidden="true" /><span v-if="t.id === 'shop' && shopAfford" class="sr-only">，有東西買得起</span><span v-if="t.id === 'recipes' && readyFavs" class="gt-dot ml-1" aria-hidden="true" /><span v-if="t.id === 'recipes' && readyFavs" class="sr-only">，最愛有 {{ readyFavs }} 種可以合成</span></button>
            </nav>

            <nav ref="dockEl" class="gt-dock" aria-label="商店" />

            <!-- 環形接力（電腦版）：隊伍血量與玩家平常收起來，Tab 或左上按鈕從左側滑出，再按一次收回 -->
            <template v-if="view.relay && isLg">
                <button class="gt-chip gt-drawer-toggle" :aria-expanded="playersOpen" aria-controls="gt-players-drawer" :aria-keyshortcuts="'Tab'" @click="playersOpen = !playersOpen">
                    玩家<span class="gt-drawer-arrow" :class="playersOpen && 'gt-drawer-arrow--open'" aria-hidden="true">▸</span><kbd v-if="hasKeyboard" class="gt-kbd ml-1.5" aria-hidden="true">Tab</kbd>
                </button>
                <aside id="gt-players-drawer" class="gt-drawer" :class="playersOpen && 'gt-drawer--open'" :inert="!playersOpen" aria-label="隊伍血量與玩家">
                    <GemRelayInfo part="rail" :view="view" :catalog="state.catalog" :frame="frame" :my-id="myId"
                        :is-host="roomState.isHost" :keys="hasKeyboard" @watch="id => { watchMap(id); boardRef?.focusZone?.(view.relay.zones.findIndex(z => z.id === id)) }" />
                </aside>
            </template>
            <aside ref="sideEl" class="gt-side" :class="sideScroll.can && 'gt-side--scroll'" aria-label="操作" @scroll.passive="measureSide">
                <!-- 環形接力（電腦版）：右上頁籤，一次只看一頁，不再往現有畫面疊東西 -->
                <div v-if="isWide" class="gt-seg gt-rtabs flex" role="tablist" aria-label="右側頁籤">
                    <button v-for="t in relayTabs" :key="t.id" class="gt-seg-btn relative" role="tab" :aria-selected="relayPanelTab === t.id"
                        :tabindex="relayPanelTab === t.id ? 0 : -1" @click="relayTab = t.id">{{ t.label }}<span v-if="t.dot" class="gt-dot gt-dot--corner" aria-hidden="true" /></button>
                </div>
                <div ref="sideTopEl" v-show="relayPanelTab === '' || relayPanelTab === 'build'" class="gt-side-top" />
                <p v-if="roomState.isSpectator" class="m-0 text-(--gt-muted)" :class="phoneShow('place')">你正在觀戰。</p>
                <GemPanel :phone-tab="phoneTab" :view="view" :my-job="myJob" @cancel-job="cancelJob" :catalog="state.catalog" :selected-slot="activeSlot" :selected-id="selectedId"
                    :swap-from="swapFrom" :my-id="myId" :keys="hasKeyboard" :ready-stat="readyStat"
                    :hand-target="isTray ? trayHandEl : null" :preview-target="isTray && isLg ? trayPrevEl : null" :act-target="isTray ? trayActEl : null" :dock-target="null" :ring="ring" :armed-cell="armedCell" :relay-tab="relayPanelTab"
                    @place-armed="placeArmed" @cancel-armed="boardRef?.disarm()"
                    @select-slot="onSelectSlot" @select-tower="onTower"
                    @keep="id => { keep(id); clearSelection() }" @merge="id => { merge(id); clearSelection() }"
                    @combine="onCombine" @ready="ready" @undo="() => { undo(); clearSelection() }" @upgrade="upgradeQuality" @buy-life="buyLife" @reroll="reroll" @wish="makeWish" @research="upgradeResearch"
                    @remove="id => { builderMode ? demolish(id) : removeStone(id); clearSelection() }"
                    @start-swap="id => swapFrom = id" @cancel-swap="swapFrom = null" />
                <GemRelayInfo v-if="relayPanelTab === 'stats'" part="stats" :view="view" :catalog="state.catalog" :frame="frame" :my-id="myId"
                    :is-host="roomState.isHost" :keys="hasKeyboard" @watch="watchMap" @boss-wave="bossWave" />
                <GemCodex v-if="relayPanelTab === 'codex'" :view="view" :catalog="state.catalog" :meta="recipeMeta" @combine="onCombine" />
                <!-- 平板：合成表由標題列的書本按鈕打開，排在操作區最下面（不再浮在地圖上） -->
                <GemCodex v-if="inGame && !isWide && !isPhone && showRecipes" :view="view" :catalog="state.catalog" @combine="onCombine" />
                <!-- 電腦版：右欄下面還有內容時，提示往下捲（點一下捲到底） -->
                <button v-if="isLg && sideScroll.more" class="gt-chip gt-side-more" @click="sideEl?.scrollBy({ top: sideEl.clientHeight * 0.8, behavior: 'smooth' })">往下還有 ↓</button>
            </aside>
        </main>

        <!-- 暫停（單人） -->
        <div v-if="view?.paused && view.phase !== 'finished'" class="overlay gt-modal">
            <div class="flex w-full max-w-[360px] flex-col gap-4 border border-(--gt-line) bg-(--gt-surface) p-6 text-center text-(--gt-text)">
                <h2 class="m-0 font-sans text-3xl font-black text-(--gt-ink)">已暫停</h2>
                <button class="gt-btn gt-btn--lamp" @click="setPaused(false)">繼續遊戲<kbd v-if="hasKeyboard" class="gt-kbd ml-2" aria-hidden="true">P</kbd></button>
            </div>
        </div>

        <!-- 結算：內容在中間捲動，主按鈕固定在卡片底部，不用捲到最下面才找得到 -->
        <div v-if="view?.phase === 'finished' && view.result" class="overlay gt-modal">
            <div class="flex max-h-full w-full max-w-[460px] flex-col border border-(--gt-line) bg-(--gt-surface) text-(--gt-text)">
                <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
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

                    <details v-if="awardRows.length" class="gt-fold" open>
                        <summary class="gt-heading !mb-1">本局指標<GemHeaderIcon name="chevron" class="gt-fold-arrow text-(--gt-muted)" /></summary>
                        <ul class="m-0 flex list-none flex-col gap-1 p-0">
                            <li v-for="a in awardRows" :key="a.label" class="flex justify-between gap-3">
                                <span class="shrink-0 text-(--gt-muted)">{{ a.label }}</span>
                                <span class="min-w-0 truncate text-right">{{ a.text }}</span>
                            </li>
                        </ul>
                    </details>

                    <details v-if="view.result.relay" class="gt-fold">
                        <summary class="gt-heading !mb-1">分區統計<GemHeaderIcon name="chevron" class="gt-fold-arrow text-(--gt-muted)" /></summary>
                        <table class="w-full border-collapse text-center text-sm tabular-nums">
                            <thead><tr class="text-(--gt-muted)"><th class="py-1 text-left font-normal">區</th><th class="font-normal">擊殺</th><th class="font-normal">傳後援</th><th class="font-normal">補救</th><th class="font-normal">漏怪</th><th class="font-normal">傷害</th></tr></thead>
                            <tbody>
                                <tr v-for="z in view.result.relay.zones" :key="z.id" class="border-t border-(--gt-line-soft)">
                                    <th scope="row" class="py-1 text-left font-semibold">P{{ z.index + 1 }} {{ nameOf(z.id) }}</th>
                                    <td v-for="k in ['kills', 'handoff', 'relief', 'leaks', 'damage']" :key="k" :class="z[k] > 0 && z[k] === relayMax[k] ? 'font-black text-(--gt-ink)' : ''">{{ z[k].toLocaleString() }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </details>
                </div>
                <div class="flex flex-col gap-2 border-t border-(--gt-line-soft) p-4">
                    <button v-if="roomState.isHost" class="gt-btn gt-btn--lamp" @click="restart">回大廳再來一局</button>
                    <p v-else class="m-0 text-center text-(--gt-muted)">等房主開新的一局。</p>
                    <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="gt-btn" @click="upgradeFromSpectator">加入下一局</button>
                </div>
            </div>
        </div>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import { useGameGuide } from '@/shared/composables/useGameGuide.js'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import PwaInstallButton from '@/shared/components/PwaInstallButton.vue'
import { useGemTd } from '../composables/useGemTd.js'
import { useGemTdCues, useGemTdSfx } from '../composables/useGemTdSfx.js'
import { useGemTdKeys } from '../composables/useGemTdKeys.js'
import { canHitAir, COOP_LIMITS, PRESETS, WAVE_CHOICES, BUILD_CHOICES, LIVES_CHOICES, DIFFICULTY_CHOICES, MODE_CHOICES, ZONE_CHOICES, nextSpeed, PLAYER_MARKS, isSpecial, RESULT_WIN_IMAGE, RESULT_LOSE_IMAGE } from '../data/gems.js'
import GemBoard from '../components/GemBoard.vue'
import GemRingBoard from '../components/GemRingBoard.vue'
import GemRelayInfo from '../components/GemRelayInfo.vue'
import GemRingMini from '../components/GemRingMini.vue'
import GemWaveBar from '../components/GemWaveBar.vue'
import GemPanel from '../components/GemPanel.vue'
import GemPlayerTabs from '../components/GemPlayerTabs.vue'
import GemGuide from '../components/GemGuide.vue'
import { useGemFavs } from '../composables/useGemFavs.js'
import GemCodex from '../components/GemCodex.vue'
import GemHeaderIcon from '../components/GemHeaderIcon.vue'
import GemIcon from '../components/GemIcon.vue'
import GemVolumePanel from '../components/GemVolumePanel.vue'
import GemWaveInfo from '../components/GemWaveInfo.vue'
import GameGuideModal from '@/shared/components/GameGuideModal.vue'
import GemTestBoard from '../components/GemTestBoard.vue'
import GemConfirm from '../components/GemConfirm.vue'
import GemSection from '../components/GemSection.vue'
import { desktop as layoutDesktop, lgLayout } from '../composables/useGemLayout.js'

const route = useRoute()
const router = useRouter()
const {
    state, frame, builders, roomState, connect, setOptions, watch: watchMap, startGame, place, keep, merge, combine,
    moveBuilder, buildAt, demolish, cancelJob,
    upgradeQuality, buyLife, reroll, makeWish, upgradeResearch, removeStone, swap, undo, ready, setSpeed, setPaused, bossWave, finishNow, restart, castSkill,
    clearError, clearNotice, disconnect, copyInviteLink,
    kickPlayer, transferHost, leaveRoom, upgradeFromSpectator,
} = useGemTd()
const { playSfx } = useGemTdSfx()

const guide = useGameGuide('gem-td-guide-seen')
const view = computed(() => state.view)
const inGame = computed(() => !!state.catalog && ['build', 'wave'].includes(view.value?.phase))
// 寬版：電腦（≥1024px）和直放的平板（≥640px、高比寬長）。地圖下方有操作列、右邊有圖示列，合成表一直排在左欄。
// 跟 main.css 的寬版 media query 一致；窄版（手機、橫放的小平板）是上下堆疊
const wideQuery = window.matchMedia('(min-width: 1024px), (min-width: 640px) and (orientation: portrait)')
const isWide = ref(wideQuery.matches)
const isTray = isWide
// 數值預覽放進操作列要 ≥1024px 才放得下；直放的平板排在右邊那塊
const lgQuery = window.matchMedia('(min-width: 1024px)')
const isLg = ref(lgQuery.matches)
lgLayout.value = isLg.value
lgQuery.addEventListener('change', (e) => { isLg.value = e.matches; lgLayout.value = e.matches })
// 目前操作的區：一般模式是自己；單一真人的環形接力是正在看的那一區（伺服器在 me.zoneId 帶回來）
const myId = computed(() => view.value?.me?.zoneId ?? roomState.myPlayerId)
// 只有一位真人才能暫停：一般模式是單人局；環形接力是真人只有一位（其餘區域是電腦）
const isSolo = computed(() => {
    if (roomState.isSpectator || !view.value) return false
    const relay = view.value.relay
    if (relay) return relay.zones.filter(z => !z.bot).length === 1
    return (view.value.playerIds?.length ?? 0) === 1
})
layoutDesktop.value = isWide.value
const onWideChange = (e) => { isWide.value = e.matches; layoutDesktop.value = e.matches }
wideQuery.addEventListener('change', onWideChange)
// 平板：合成表的開關；打開時捲到它的位置
const showRecipes = ref(false)
const trayHandEl = ref(null)
const trayActEl = ref(null)
const dockEl = ref(null)
const trayPrevEl = ref(null)
const sideTopEl = ref(null)
// 電腦版右欄：內容超出高度時整欄接收滑鼠（否則滾輪落在卡片間的空隙會變成縮放地圖），還沒捲到底時顯示「往下還有」
const sideEl = ref(null)
const sideScroll = ref({ can: false, more: false })
function measureSide() {
    const el = sideEl.value
    if (!el) return
    const can = el.scrollHeight > el.clientHeight + 2
    const more = can && el.scrollTop + el.clientHeight < el.scrollHeight - 24
    if (can !== sideScroll.value.can || more !== sideScroll.value.more) sideScroll.value = { can, more }
}
let sideObserver = null
watch(sideEl, (el) => {
    sideObserver?.disconnect()
    sideObserver = null
    if (!el) return
    sideObserver = new MutationObserver(() => nextTick(measureSide))
    sideObserver.observe(el, { childList: true, subtree: true, characterData: true })
    nextTick(measureSide)
})
window.addEventListener('resize', measureSide)
watch(showRecipes, (open) => {
    if (open) nextTick(() => document.getElementById('gt-recipes')?.scrollIntoView({ block: 'start' }))
})
const { readyFavCount } = useGemFavs()
const readyFavs = computed(() => readyFavCount(view.value, state.catalog))
const recipeMeta = computed(() => {
    const n = view.value?.me?.recipes?.length ?? 0
    return n ? `${n} 種可合成` : ''
})

// 電腦版（所有模式）：右上頁籤（操作／商店／圖鑑；環形接力多一個戰況）；沒有的頁籤（例：出怪中沒有商店）自動退回「操作」
const playersOpen = ref(false) // 環形接力：左側玩家抽屜
// 環形接力（電腦版）：合成表放左欄，右上頁籤就不再有「圖鑑」
const relayCodexLeft = computed(() => !!view.value?.relay && isLg.value && !!view.value?.board)
// 環形接力（電腦版）沒有完整預告卡：建造時在標題列波次後面寫一句下一波是什麼，例「螞蟻 10・胡蜂 5（會飛）」
const waveBrief = computed(() => {
    const v = view.value
    const n = v?.nextWave
    if (!relayCodexLeft.value || v.phase !== 'build' || !n || !state.catalog) return null
    const info = type => state.catalog.monsters.find(m => m.id === type)
    const groups = n.groups ?? []
    const body = n.test ? '巨獸（不扣血，盡量打滿傷害）' : groups.map(g => `${info(g.type)?.name ?? g.type} ${g.count}${info(g.type)?.flying ? '（會飛）' : ''}`).join('・')
    const towers = v.me?.towers ?? []
    const warn = groups.some(g => info(g.type)?.flying) && towers.length && !towers.some(t => canHitAir(t.kind, state.catalog)) ? '塔都打不到空中！' : ''
    return { body, warn, text: `下一波：${body}${warn ? `　${warn}` : ''}` }
})
const relayTab = ref('build')
const relayTabs = computed(() => {
    const me = view.value?.me
    const canShop = view.value?.phase === 'build' && !!me && !me.out
    return [
        { id: 'build', label: '操作' },
        ...(canShop ? [{ id: 'shop', label: '商店', dot: shopAfford.value }] : []),
        ...(relayCodexLeft.value ? [] : [{ id: 'codex', label: '圖鑑', dot: readyFavs.value > 0 }]),
        ...(view.value?.relay ? [{ id: 'stats', label: '戰況' }] : []),
    ]
})
const relayPanelTab = computed(() => {
    if (!view.value?.board || !isWide.value) return ''
    return relayTabs.value.some(t => t.id === relayTab.value) ? relayTab.value : 'build'
})
// 整體地圖（左下角）：主地圖目前看到的範圍；點小地圖跳過去
const mapCamera = ref(null)
function onMiniGoto({ zone, x, y }) {
    if (zone === undefined) { boardRef.value?.panTo(x, y); return }
    const id = view.value.relay.zones[zone]?.id
    if (id && id !== view.value.watching) watchMap(id)
    boardRef.value?.focusZone(zone)
}

// 合作迷宮：全隊一張圖。人數限制、隊伍名單（顏色與地圖上塔的顏色一致）
const coop = computed(() => view.value?.options?.mode === 'coop')
const isCoop = computed(() => coop.value && !!view.value?.board)
// 建造者模式：點地圖叫建造者走過去蓋；我的建造者正在做的工作（進度用即時串流，沒有就用狀態裡的）
const builderMode = computed(() => !!view.value?.builders)
const myJob = computed(() => {
    const mineView = view.value?.builders?.find(b => b.id === roomState.myPlayerId)
    if (!mineView?.job) return null
    const live = builders.value?.builders?.find(b => b.id === roomState.myPlayerId)
    return { ...mineView.job, p: mineView.job.started ? (live?.p ?? mineView.job.p) : 0 }
})
const coopLimits = computed(() => state.catalog?.coop ?? COOP_LIMITS)
const coopCountOk = computed(() => {
    const n = roomState.players.length
    return n >= coopLimits.value.minPlayers && n <= coopLimits.value.maxPlayers
})
const teamRows = computed(() => {
    const v = view.value
    if (!v) return []
    return v.playerIds.map((id, i) => {
        const p = v.players[id]
        const status = v.phase === 'build'
            ? (p.ready ? '已準備' : p.resolved ? '還在調整' : `放置 ${p.placed}／${state.catalog.gemsPerRound}`)
            : `擊殺金 ${(frame.value?.players[id]?.earned ?? 0)}`
        return { id, mark: PLAYER_MARKS[i % PLAYER_MARKS.length], name: `${nameOf(id)}${id === roomState.myPlayerId ? '（我）' : ''}`, status, alert: false }
    })
})

// 一般多人模式：‹ › 切換看誰的地圖
function stepPlayer(d) {
    const ids = view.value?.playerIds ?? []
    if (ids.length < 2 || isCoop.value) return
    watchMap(ids[(ids.indexOf(view.value.watching) + d + ids.length) % ids.length])
}

// 手機（<640px，同 Tailwind 的 max-sm）：地圖固定在上方，下面用分頁切換操作區。
// 分頁只靠 max-sm: 的 class 隱藏，電腦與平板的畫面不受影響
const phoneQuery = window.matchMedia('(max-width: 639px)')
const isPhone = ref(phoneQuery.matches)
const onPhoneChange = (e) => { isPhone.value = e.matches }
phoneQuery.addEventListener('change', onPhoneChange)
const PHONE_TABS = [
    { id: 'place', label: '放置' },
    { id: 'tower', label: '塔' },
    { id: 'recipes', label: '圖鑑' },
    { id: 'shop', label: '商店' },
    { id: 'status', label: '戰況' },
]
const phoneTab = ref('place')
const phoneShow = (...tabs) => (tabs.includes(phoneTab.value) ? '' : 'max-sm:hidden')
const menuOpen = ref(false)
// 商店分頁的提示點：品質升級或補血買得起（跟電腦版右欄「商店」頁簽的點同一個條件）
const shopAfford = computed(() => {
    const me = view.value?.me
    if (view.value?.phase !== 'build' || !me || me.out) return false
    const quality = state.catalog.qualityCosts[me.quality - 1]
    const lives = view.value.players[roomState.myPlayerId]?.lives ?? 0
    const life = !view.value.nextWave?.test && lives < view.value.maxLives && me.gold >= me.lifeCost
    return (!!quality && me.gold >= quality) || life
})

// 傷害測試紀錄彈窗：加賽打完、回到建造階段時，有新的紀錄就自動打開一次
// （最後一場直接看結算畫面，不另外跳）。中途加入的人不補跳已經打完的紀錄
const showTestLog = ref(false)
let testLogSeen = null
watch(() => [view.value?.testLog?.rounds?.length ?? 0, view.value?.phase], ([count, phase]) => {
    if (testLogSeen === null && phase) testLogSeen = count
    if (phase === 'build' && count > testLogSeen) showTestLog.value = true
    if (phase === 'build' || phase === 'finished') testLogSeen = Math.max(testLogSeen ?? 0, count)
})

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
const mine = computed(() => view.value?.watching === myId.value)
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
    if (builderMode.value) buildAt(activeSlot.value, x, y)
    else place(activeSlot.value, x, y)
}

const boardRef = ref(null)
const armedCell = ref(null)
function placeArmed() {
    const c = armedCell.value
    boardRef.value?.disarm()
    if (c) onCell(c.x, c.y)
}

function onSelectSlot(slot) {
    selectedSlot.value = slot
    playSfx('click')
}

function onTower(tower) {
    if (combinePick.value) {
        if (combinePick.value.ids.includes(tower.id)) chooseCombineAt(tower.id)
        else playSfx('click')
        return
    }
    if (swapFrom.value && tower.kind === 'stone') {
        swap(swapFrom.value, tower.id)
        clearSelection()
        return
    }
    selectedId.value = tower.id
    playSfx('click')
}

// 合成：材料不只一座時，讓玩家選「合成後的塔出現在哪一座材料的位置」（點地圖上金框的塔，或點上方的按鈕）
const combinePick = ref(null) // { recipeId, ids, name }
const combineChoices = computed(() => {
    const cp = combinePick.value
    if (!cp) return []
    return cp.ids.map(id => view.value?.towers.find(t => t.id === id)).filter(Boolean)
})
function onCombine(recipeId) {
    const r = view.value?.me?.recipes?.find(x => x.id === recipeId)
    const ids = r?.towerIds ?? []
    if (ids.length <= 1) {
        combine(recipeId, ids[0])
        clearSelection()
        return
    }
    selectedId.value = null
    combinePick.value = { recipeId, ids, name: state.catalog?.specials?.[state.catalog.recipes.find(x => x.id === recipeId)?.result]?.name ?? '特殊塔' }
}
function chooseCombineAt(towerId) {
    const cp = combinePick.value
    if (!cp) return
    combinePick.value = null
    combine(cp.recipeId, towerId)
    clearSelection()
}
function cancelCombinePick() { combinePick.value = null }
// 材料變了（回合結束、還原、別人的地圖）就取消選位置
watch(() => view.value?.me?.recipes, (rs) => {
    const cp = combinePick.value
    if (cp && !rs?.some(r => r.id === cp.recipeId)) combinePick.value = null
})
watch(() => view.value?.phase, () => { combinePick.value = null })

// ── 抬頭資訊 ─────────────────────────────────────────────────────
// 血量顯示自己的；觀戰者顯示正在看的玩家
const livesOwner = computed(() => (view.value?.me ? roomState.myPlayerId : view.value?.watching))
const lives = computed(() => frame.value?.players[livesOwner.value]?.lives ?? view.value?.players[livesOwner.value]?.lives ?? 0)
// 血量剩 30% 以下：愛心變色並跳動；每次扣血閃一下（動畫在 prefers-reduced-motion 時關掉，顏色變化仍在）
const livesLow = computed(() => lives.value > 0 && !!view.value?.maxLives && lives.value / view.value.maxLives <= 0.3)
const hurt = ref(false)
let hurtTimer = null
watch(lives, (now, before) => {
    if (before === undefined || now >= before) return
    hurt.value = true
    clearTimeout(hurtTimer)
    hurtTimer = setTimeout(() => { hurt.value = false }, 700)
})
// 建造階段：還沒按準備的真人有幾位（電腦控制的區域與已出局的不算）
const readyStat = computed(() => {
    const v = view.value
    if (!v || v.phase !== 'build') return { done: 0, total: 0 }
    const skip = new Set((v.relay?.zones ?? []).filter(z => z.bot || z.left).map(z => z.id))
    const ids = (v.playerIds ?? []).filter(id => !skip.has(id) && !v.players[id]?.out)
    return { done: ids.filter(id => v.players[id]?.ready).length, total: ids.length }
})
const gold = computed(() => (view.value?.me?.gold ?? 0) + (frame.value?.players[myId.value]?.earned ?? 0))
// 標題列正中間的步驟提示
const phaseHint = computed(() => {
    const v = view.value
    const me = v?.me
    if (v?.phase === 'wave') return { tag: v.nextWave?.test ? '傷害測試' : '出怪中', text: '點地圖上的塔看傷害與戰績' }
    if (v?.phase !== 'build') return null
    if (!me) return { tag: '觀戰', text: '建造階段，等玩家準備' }
    if (me.out) return { tag: '已出局', text: '可以切換看其他人的地圖' }
    if (me.pending.length && builderMode.value) return { tag: '建造階段', text: `選一顆、點地圖，建造者會走過去蓋（右鍵移動）；還剩 ${me.pending.length} 顆` }
    if (me.pending.length) return { tag: '建造階段', text: `點地圖放下 ${me.pending.length} 顆甜點，最後選 1 顆留下` }
    if (me.choosing) return { tag: '建造階段', text: '選 1 顆留下，其餘變成餅乾牆' }
    const tail = readyStat.value.total > 1 ? `（${readyStat.value.done}／${readyStat.value.total} 已準備）` : ''
    if (me.ready) return { tag: '已準備', text: `等待其他玩家${tail}` }
    return { tag: '建造完成', text: `逛逛商店，準備好就開始出怪${tail}` }
})
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

// 結算的分區統計：每欄最高的格子加粗
const relayMax = computed(() => {
    const zones = view.value?.result?.relay?.zones ?? []
    return Object.fromEntries(['kills', 'handoff', 'relief', 'leaks', 'damage'].map(k => [k, Math.max(0, ...zones.map(z => z[k]))]))
})

// 結算的本局指標：沒有人得獎的項目不顯示
const awardRows = computed(() => {
    const a = view.value?.result?.awards
    if (!a) return []
    const rows = []
    if (a.saver) rows.push({ label: '最會存錢', text: `${nameOf(a.saver.id)}（峰值 ${a.saver.value.toLocaleString()} 金）` })
    if (a.killer) rows.push({ label: '擊殺王', text: `${nameOf(a.killer.id)}（${a.killer.value.toLocaleString()} 殺）` })
    if (a.dealer) rows.push({ label: '輸出王', text: `${nameOf(a.dealer.id)}（${a.dealer.value.toLocaleString()} 傷）` })
    if (a.lifeBuyer) rows.push({ label: '最愛買命', text: `${nameOf(a.lifeBuyer.id)}（${a.lifeBuyer.value} 次）` })
    if (a.perfectIds.length) rows.push({ label: '完美防守', text: `${a.perfectIds.map(nameOf).join('、')}（零漏怪）` })
    if (a.leaker) rows.push({ label: '漏怪王', text: `${nameOf(a.leaker.id)}（漏 ${a.leaker.value} 隻）` })
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

// 準備鈕外圈：建造倒數剩下的比例；沒有倒數時為 null（整圈）
const ring = computed(() => {
    const total = view.value?.options?.buildSeconds
    return secondsLeft.value !== null && total ? Math.min(1, secondsLeft.value / total) : null
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
    showToast(state.errorCode === 'CELL_TAKEN' ? '這格剛被隊友搶先放了，換一格吧' : message, 'error')
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
    if (id !== null && relayPanelTab.value) relayTab.value = 'build' // 點了塔，回到「操作」頁才看得到它的資訊
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

function handleKey(code, e) {
    const v = view.value
    const me = v.me
    const catalog = state.catalog
    const building = v.phase === 'build' && mine.value && me && !me.out
    const selected = v.towers.find(t => t.id === selectedId.value)

    if (code in DIGITS) {
        if (!building) return false
        const i = DIGITS[code]
        if (me.pending.length) {
            // 五格位置固定（放下的格子留著顯示「已放」），按鍵對應格子位置
            const g = me.pending.find(p => p.slot === i)
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
    case 'KeyZ':
        if (!building || !me.canUndo) return false
        undo()
        clearSelection()
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
        if (!building || !selected || selected.kind === 'stone' || selected.fresh || (selected.owner && selected.owner !== myId.value)) return false
        if (me.gold >= catalog.swapCost) swapFrom.value = selected.id
        return true
    case 'Delete':
    case 'Backspace':
        if (!building || selected?.kind !== 'stone' || swapFrom.value || (!builderMode.value && selected.owner && selected.owner !== myId.value)) return false
        if (builderMode.value) demolish(selected.id)
        else removeStone(selected.id)
        clearSelection()
        return true
    case 'KeyB':
        if (relayCodexLeft.value) return false // 合成表一直開在左欄
        if (inGame.value && relayPanelTab.value) { relayTab.value = relayPanelTab.value === 'codex' ? 'build' : 'codex'; return true }
        if (!inGame.value || isWide.value) return false
        if (isPhone.value) phoneTab.value = phoneTab.value === 'recipes' ? 'place' : 'recipes'
        else showRecipes.value = !showRecipes.value
        return true
    case 'KeyV': {
        const ids = v.playerIds ?? []
        if (ids.length < 2 || isCoop.value) return false
        watchMap(ids[(ids.indexOf(v.watching) + 1) % ids.length])
        return true
    }
    case 'KeyF':
        // 環形接力：F 是整圈視角（倍速用標題列的按鈕）
        if (v.relay) { boardRef.value?.fit?.(); return true }
        if (!roomState.isHost) return false
        setSpeed(nextSpeed(v.speed))
        return true
    case 'KeyQ':
    case 'KeyW': {
        if (v.phase !== 'wave' || v.relay || !mine.value || me?.out) return false
        castSkill(code === 'KeyQ' ? 'freeze' : 'stun')
        return true
    }
    case 'KeyP':
        if (!isSolo.value || (v.phase !== 'build' && v.phase !== 'wave')) return false
        setPaused(!v.paused)
        return true
    case 'Tab': {
        // 環形接力（電腦版）：開關左側的玩家列；窄螢幕沒有抽屜，維持依序切換區域
        if (!v.relay) return false
        if (isLg.value) { playersOpen.value = !playersOpen.value; return true }
        const ids = v.playerIds ?? []
        if (ids.length < 2) return false
        watchMap(ids[(ids.indexOf(v.watching) + (e.shiftKey ? ids.length - 1 : 1)) % ids.length])
        return true
    }
    case 'KeyH':
        guide.open()
        return true
    case 'Escape':
        if (playersOpen.value) { playersOpen.value = false; return true }
        if (showRecipes.value) { showRecipes.value = false; return true }
        if (combinePick.value) { cancelCombinePick(); return true }
        if (myJob.value) { cancelJob(); return true }
        if (swapFrom.value || selectedId.value !== null) { clearSelection(); return true }
        return false
    default:
        return false
    }
}

const { hasKeyboard } = useGemTdKeys(handleKey, () => (
    !guide.show.value && !showTestLog.value && !confirmDlg.value && !!state.catalog && ['build', 'wave'].includes(view.value?.phase)
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

// 遊戲內的確認視窗（取代瀏覽器的 confirm）
const confirmDlg = ref(null)
let confirmAction = null
function ask(dialog, action) {
    confirmDlg.value = dialog
    confirmAction = action
}
function confirmYes() {
    const action = confirmAction
    confirmNo()
    action?.()
}
function confirmNo() {
    confirmDlg.value = null
    confirmAction = null
}

function goHome() {
    ask({
        title: '離開房間？',
        text: showGame.value ? '離開後無法回到這局。' : '離開後要用房號重新加入。',
        confirmText: '離開', cancelText: '留下來', danger: true,
    }, async () => { await leaveRoom(); goLobby() })
}

const copied = ref(false)
let copiedTimer = null
function handleCopyLink() {
    copyInviteLink()
    showToast('邀請連結已複製', 'success')
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
}

function handleFinish() {
    ask({
        title: '提早結束這局？', text: '所有玩家會直接進入結算畫面。',
        confirmText: '結束這局', cancelText: '繼續玩', danger: true,
    }, finishNow)
}

// 地圖選項：清單由伺服器型錄提供，最前面是原本的經典圖（0 號），最後加「隨機」
const mapChoices = computed(() => [
    ...(state.catalog?.maps ?? [{ id: 0, name: '經典對角' }]).map(m => ({ value: m.id, label: m.name })),
    { value: 'random', label: '隨機（每局抽一張）' },
])

// ── 等待大廳：目前設定的摘要（房主看一行，其他人看清單）與快速設定 ──
const shortLabel = (choices, value) => (choices.find(c => c.value === value)?.label ?? '').replace(/（.*$/, '')
const settingRows = computed(() => {
    const o = view.value?.options
    if (!o) return []
    const relay = o.mode === 'relay'
    const zones = roomState.players.length > 1 ? roomState.players.length : o.zones
    return [
        ['模式', shortLabel(MODE_CHOICES, o.mode)],
        ...(o.mode === 'coop' ? [['人數', `${coopLimits.value.minPlayers}～${coopLimits.value.maxPlayers} 人`]] : relay ? [['區域數', `${zones} 區`]] : [['地圖', shortLabel(mapChoices.value, o.map ?? 0)], ['血量', shortLabel(LIVES_CHOICES, o.livesMode)]]),
        ['難度', shortLabel(DIFFICULTY_CHOICES, o.difficulty)],
        ['波數', shortLabel(WAVE_CHOICES, o.waves)],
        ['建造時間', shortLabel(BUILD_CHOICES, o.buildSeconds)],
    ]
})
const settingsLine = computed(() => settingRows.value.map(r => r[1]).join('・'))
const activePreset = computed(() => {
    const o = view.value?.options
    return PRESETS.find(p => Object.entries(p.options).every(([k, v]) => o?.[k] === v))?.id ?? null
})

onMounted(() => {
    if (!route.query.id) { router.replace({ name: 'gem-td' }); return }
    const nickname = route.query.nickname || getSavedNickname()
    if (nickname) enter(String(nickname))
    else showNickname.value = true
})

onUnmounted(() => {
    sideObserver?.disconnect()
    window.removeEventListener('resize', measureSide)
    wideQuery.removeEventListener('change', onWideChange)
    phoneQuery.removeEventListener('change', onPhoneChange)
    clearInterval(clock)
    clearTimeout(_toastTimer)
    clearTimeout(hurtTimer)
    clearTimeout(copiedTimer)
})
</script>
