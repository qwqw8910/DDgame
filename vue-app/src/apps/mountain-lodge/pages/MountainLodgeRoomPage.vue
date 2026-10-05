<template>
    <div class="lodge-bg flex h-[100dvh] w-full flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]" :style="{ '--lodge-pattern': `url(${PATTERN_BG_IMG})` }">
        <!-- Header -->
        <header class="relative z-40 shrink-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2 border-b border-border bg-header backdrop-blur-md">
            <div class="flex items-center gap-1 min-w-0">
                <button class="header-back-btn" aria-label="離開房間" @click="goHome">
                    ←<span class="hidden sm:inline"> 離開</span>
                </button>
                <span class="font-bold text-heading truncate">山中別館 🏚️</span>
            </div>
            <div :class="['flex items-center gap-2 order-last w-full justify-center sm:order-none sm:w-auto', inGame ? 'max-sm:hidden' : '']">
                <span class="font-mono font-semibold tracking-[3px] text-neon-purple-light">{{ roomState.roomId }}</span>
                <span class="text-sm text-body">{{ roomState.players.length }}/{{ roomState.room?.max_players ?? '?' }} 人</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                    :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
                <button class="header-icon-btn" :title="sfxOn ? '音效：開' : '音效：關'" :aria-label="sfxOn ? '關閉音效' : '開啟音效'"
                    :aria-pressed="sfxOn" @click="toggleSfx">{{ sfxOn ? '🔊' : '🔇' }}</button>
                <button class="header-icon-btn" :title="ambientOn ? '雨聲：開' : '雨聲：關'" :aria-label="ambientOn ? '關閉雨聲' : '開啟雨聲'"
                    :aria-pressed="ambientOn" :class="ambientOn ? '' : 'opacity-50'" @click="toggleAmbient">🌧️</button>
                <button class="header-icon-btn" title="故事背景" aria-label="故事背景" @click="showStory = true">📜</button>
                <button class="header-icon-btn" title="角色介紹" aria-label="角色介紹" @click="showRoles = true">🎭</button>
                <button class="header-icon-btn" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink">🔗</button>
            </div>
        </header>

        <!-- 故事背景（開場說明用） -->
        <GameGuideModal v-model="showStory" title="📜 故事背景" confirm-text="關閉">
            <div class="flex flex-col gap-3 leading-relaxed text-body">
                <p class="m-0">故事發生在一座偏僻的山中別館。</p>
                <p class="m-0">賓客受主人邀請來到別館，當晚主人被殺。警察無法立刻趕到，而最恐怖的是：<strong class="text-heading">殺人魔就在賓客之中</strong>。</p>
                <p class="m-0">在警察到達之前，大家決定先把最可疑的人關進地下的鍋爐室。問題是，沒有人知道誰才是殺人魔。</p>
                <p class="m-0">玩家只能依靠：</p>
                <p class="m-0 text-center font-semibold text-heading">目擊情報 + 玩家說詞 + 角色能力 + 推理</p>
                <p class="m-0">找出殺人魔躲在哪個地點。</p>
            </div>
        </GameGuideModal>

        <!-- 角色介紹：圖片 + 能力 -->
        <LodgeRoleGuide v-model="showRoles" :active-roles="view?.levelRoles ?? []" />

        <!-- 載入中 -->
        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <div class="text-5xl mb-3">🏚️</div>
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <!-- 被踢出 / 無法加入 -->
        <div v-else-if="state.kicked || (state.error && !roomState.room)" class="overlay">
            <div class="overlay-card text-center">
                <div class="text-4xl mb-2">🚪</div>
                <p class="text-heading text-lg font-semibold mb-1">{{ state.kicked ? '你已離開房間' : '無法進入房間' }}</p>
                <p class="text-body mb-4">{{ state.kicked || state.error }}</p>
                <button class="btn-primary" @click="goLobby">回到入口</button>
            </div>
        </div>

        <!-- 暱稱遮罩 -->
        <div v-else-if="showNicknameOverlay" class="overlay">
            <div class="overlay-card">
                <div class="section-header mb-4">
                    <div class="section-icon">👤</div>
                    <h2 class="neon-heading text-xl">輸入你的暱稱</h2>
                    <p class="text-sm text-body m-0">讓朋友知道你是誰！</p>
                </div>
                <div class="input-wrapper mb-3">
                    <span class="input-icon">✏️</span>
                    <input v-model="overlayNickname" ref="overlayInputRef" class="game-input" type="text"
                        placeholder="你的暱稱…" maxlength="12" aria-label="暱稱" autocomplete="off"
                        @keydown.enter="joinWithNickname" />
                </div>
                <button class="btn-primary" @click="joinWithNickname">加入房間 🚀</button>
            </div>
        </div>

        <main v-else-if="roomState.room && view"
            :class="inGame
                ? 'flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3'
                : 'mx-auto w-full min-h-0 flex-1 max-w-3xl lg:max-w-6xl overflow-y-auto overflow-x-hidden px-3 sm:px-4 py-4 flex flex-col gap-4'">

            <!-- 開票階段：有能力的人醒目提示 -->
            <div v-if="canActNow" class="shrink-0 animate-ability-glow rounded-xl border border-amber-300/70 bg-amber-400/15 px-3 py-1.5 text-center text-sm font-bold text-amber-200" role="alert">
                ⚡ 你是{{ ROLES[abilityRole].name }}！現在可以發動能力，剩 {{ Math.ceil(remaining) }} 秒（在操作區按「公開身份」）
            </div>

            <!-- 觀戰提示 -->
            <div v-if="roomState.isSpectator" class="game-card shrink-0 flex flex-wrap items-center justify-between gap-2 py-3" role="status">
                <span class="text-label">👀 你正在觀戰（牌局進行中），看不到任何人的手牌。</span>
                <button v-if="roomState.spectatorCanJoin || phase === 'lobby'" class="btn-primary btn-full sm:w-auto"
                    @click="upgradeFromSpectator">加入下一局</button>
            </div>

            <!-- ═════════════ 大廳 ═════════════ -->
            <section v-if="phase === 'lobby'" class="game-card animate-slide-up flex flex-col gap-5 w-full lg:max-w-xl lg:mx-auto">
                <div class="section-header">
                    <div class="section-icon">🏠</div>
                    <h2 class="neon-heading text-[22px]">等待玩家加入</h2>
                    <p class="text-sm text-body m-0">需要 {{ needPlayers }} ～ {{ roomState.room.max_players }} 人才能開始</p>
                </div>

                <div class="flex items-center justify-center gap-3">
                    <div class="font-mono text-[28px] font-bold tracking-[6px] text-neon-purple-light">{{ roomState.roomId }}</div>
                    <button class="header-icon-btn text-lg" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink">🔗</button>
                </div>

                <!-- 玩家列表 -->
                <ul class="flex flex-col gap-2 m-0 p-0 list-none">
                    <li v-for="p in roomState.players" :key="p.id"
                        class="flex items-center justify-between px-3.5 py-2.5 rounded-[10px] bg-subtle border border-border">
                        <div class="flex items-center gap-2 min-w-0">
                            <span :class="['inline-block w-2.5 h-2.5 rounded-full shrink-0', p.is_online ? 'bg-success' : 'bg-ruby']"
                                :title="p.is_online ? '在線' : '離線'"></span>
                            <span class="font-medium text-heading truncate">{{ p.nickname }}</span>
                            <span v-if="p.id === roomState.room.host_player_id" class="badge badge-host">房主</span>
                            <span v-if="p.id === roomState.myPlayerId" class="badge badge-me">我</span>
                        </div>
                        <span class="text-sm text-body shrink-0" title="累計勝場">🏆 {{ p.score ?? 0 }}</span>
                    </li>
                </ul>

                <!-- 房間設定（房主可改，其他人唯讀） -->
                <fieldset class="rounded-xl border border-border p-3.5 m-0 flex flex-col gap-3" :disabled="!roomState.isHost">
                    <legend class="px-1.5 text-sm text-label">房間設定{{ roomState.isHost ? '' : '（由房主決定）' }}</legend>
                    <label class="flex flex-col gap-1 text-sm text-label">
                        難度
                        <select class="game-input cursor-pointer" :value="view.level"
                            @change="setSettings({ level: Number($event.target.value) })">
                            <option v-for="l in LEVEL_CHOICES" :key="l.value" :value="l.value">{{ l.label }}（{{ l.desc }}）</option>
                        </select>
                    </label>
                    <label class="flex flex-col gap-1 text-sm text-label">
                        討論時間
                        <select class="game-input cursor-pointer" :value="view.discussionSeconds"
                            @change="setSettings({ discussionSeconds: Number($event.target.value) })">
                            <option v-for="s in DISCUSSION_CHOICES" :key="s" :value="s">{{ s / 60 }} 分鐘</option>
                        </select>
                    </label>
                </fieldset>

                <p v-if="roomState.players.length < needPlayers" class="text-center text-sm text-body m-0">
                    還需要 {{ needPlayers - roomState.players.length }} 人才能開始
                </p>
                <button v-if="roomState.isHost" class="btn-primary btn-full"
                    :disabled="roomState.players.length < needPlayers" @click="startGame">開始遊戲 🚀</button>
                <p v-else class="text-center text-body m-0">等待房主開始遊戲…</p>

                <details class="text-sm text-body">
                    <summary class="cursor-pointer text-label">📖 玩法簡介</summary>
                    <ol class="mt-2 pl-5 leading-relaxed">
                        <li>每人拿到一個地點，角色牌蓋在自己的地點上；多出的一張會放進「客房」。</li>
                        <li>傳牌：抽 2 張、留 1 張，另一張傳給任一尚無角色的人，並用語音說出「目擊情報」（可以說謊）。</li>
                        <li>討論：{{ view.discussionSeconds / 60 }} 分鐘內互相指控、找矛盾（語音自行處理）。</li>
                        <li>投票：每人投 1 個地點，客房也可以投。得票最高的地點，其角色牌送進鍋爐室；殺人魔被關進去 → 好人贏。</li>
                        <li v-if="view.level >= 3">開票：票公開後有 {{ REVEAL_SECONDS }} 秒，律師 / 富商可自願公開身份發動能力；炸彈客被關進鍋爐室則單獨獲勝。</li>
                    </ol>
                </details>
            </section>

            <!-- ═════════════ 牌局進行中 / 結算 ═════════════ -->
            <template v-else>
                <!-- 狀態列 -->
                <div class="game-card shrink-0 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 !px-3 !py-1.5" aria-live="polite">
                    <Transition name="phase-fade" mode="out-in">
                        <div :key="phase + (view.actorId ?? '')" class="flex min-w-0 flex-col">
                            <span class="text-base sm:text-lg font-bold text-heading leading-tight">{{ phaseLabel }}</span>
                            <span class="text-xs sm:text-sm text-body truncate">{{ phaseHint }}</span>
                        </div>
                    </Transition>
                    <div v-if="phase === 'passing' && view.actorId && remaining > 0" class="flex flex-col items-end" role="timer">
                        <span class="text-xs text-label">{{ isMyTurn ? '你' : nameOf(view.actorId) }} 閱牌中</span>
                        <span :class="['font-mono text-2xl sm:text-3xl font-bold tabular-nums', remaining <= 3 ? 'text-ruby animate-timer-pulse' : 'text-neon-cyan']">{{ formatSeconds(remaining) }}</span>
                    </div>
                    <div v-else-if="phase === 'discussion'" class="font-mono text-2xl sm:text-3xl font-bold tabular-nums"
                        :class="remaining <= 30 ? 'text-ruby animate-timer-pulse' : 'text-neon-cyan'" role="timer">
                        {{ formatSeconds(remaining) }}
                    </div>
                    <div v-else-if="phase === 'voting'" class="text-sm text-label">
                        已投 {{ view.votedIds.length }}/{{ view.order.length }}
                    </div>
                    <div v-else-if="phase === 'reveal'" role="timer"
                        :class="['font-mono font-bold tabular-nums', canActNow ? 'text-3xl sm:text-5xl' : 'text-2xl sm:text-3xl', remaining <= 5 ? 'text-ruby animate-timer-pulse' : 'text-neon-cyan']">
                        {{ formatSeconds(remaining) }}
                    </div>
                    <div class="basis-full flex flex-nowrap items-center gap-1.5 overflow-x-auto whitespace-nowrap text-xs text-body [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="本局角色板塊">
                        <span class="text-label">本局角色：</span>
                        <span v-for="k in view.levelRoles" :key="k" class="badge" :title="ROLES[k].hint">
                            {{ ROLES[k].emoji }} {{ ROLES[k].name }}
                        </span>
                    </div>
                </div>

                <!-- 4×2 場地盤面（左／上）+ 我的操作區（右／下）：整塊固定在視窗內，不捲動 -->
                <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,42%)] gap-2 side:grid-cols-[minmax(0,1fr)_clamp(300px,32vw,400px)] side:grid-rows-1">

                <!-- 場地盤面：第 1–6 格＝玩家地點，第 7 格客房，第 8 格鍋爐室（位置固定，不隨人數變動） -->
                <section aria-label="場地盤面" class="grid min-h-0 min-w-0 grid-cols-4 grid-rows-2 gap-[clamp(4px,1vw,12px)]">
                    <template v-for="(p, i) in boardSlots" :key="p?.id ?? `empty-${i}`">
                        <LodgeSeat v-if="p"
                            :location="locationOf(p.id)" :player="p" :is-me="p.id === myId"
                            :has-card="p.id === myId ? !!view.me?.card : view.keptIds.includes(p.id)"
                            :revealed-card="result?.cards[p.id] ?? null"
                            :is-actor="view.actorId === p.id"
                            :selectable="isSeatSelectable(p.id)"
                            :selected="isSeatSelected(p.id)"
                            :voted="phase === 'voting' && view.votedIds.includes(p.id)"
                            :vote-count="result ? result.voteCounts[p.id] : null"
                            :boiler="!!result && result.boilerIds.includes(p.id)"
                            @select="selectSeat(p.id)" />
                        <div v-else class="rounded-xl border border-dashed border-border/40" aria-hidden="true"></div>
                    </template>
                    <LodgeSeat :location="LODGE_ROOM" :has-card="view.lodgeRoomFilled"
                        :revealed-card="result?.lodgeRoomCard ?? null"
                        :selectable="isSeatSelectable(LODGE_ROOM_ID)" :selected="isSeatSelected(LODGE_ROOM_ID)"
                        :vote-count="result ? result.voteCounts[LODGE_ROOM_ID] : null"
                        :boiler="!!result && result.boilerIds.includes(LODGE_ROOM_ID)"
                        @select="selectSeat(LODGE_ROOM_ID)" />
                    <LodgeBoiler :cards="result ? result.boilerIds.map(cardOf) : []"
                        :empty="!!result && !result.boilerIds.length" />
                </section>

                <!-- 我的操作區：內容多時僅此區內部捲動 -->
                <div class="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain pr-0.5">
                <!-- 結算橫幅 -->
                <div v-if="phase === 'result' && result"
                    :class="['game-card shrink-0 text-center animate-pop-in', result.winner === 'good' ? '[border-color:var(--color-success)]' : '[border-color:var(--color-neon-rose)]']"
                    role="status">
                    <div class="text-5xl mb-1">{{ { good: '🎉', killer: '😈', bomber: '💥' }[result.winner] }}</div>
                    <h2 class="neon-heading text-2xl m-0 mb-1">{{ TEAM_NAMES[result.winner] }}獲勝！</h2>
                    <p class="m-0 text-label">{{ resultReason }}</p>
                    <p v-if="!roomState.isSpectator" class="mt-2 mb-0 font-semibold"
                        :class="iWon ? 'text-success-text' : 'text-ruby'">
                        {{ iWon ? '你贏了 +1 勝場' : '這局你輸了' }}
                    </p>
                </div>

                <!-- 我的區域 -->
                <section v-if="view.me" class="game-card flex shrink-0 flex-col gap-4" aria-label="我的區域">
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="h-32 w-28 shrink-0">
                            <LodgeSeat :location="locationOf(myId)" :player="mySeatPlayer" is-me
                                :has-card="!!view.me.card" :revealed-card="result?.cards[myId] ?? null"
                                :is-actor="view.actorId === myId"
                                :vote-count="result ? result.voteCounts[myId] : null"
                                :boiler="!!result && result.boilerIds.includes(myId)" />
                        </div>
                        <div v-if="view.me.card && !result" class="flex flex-col items-center gap-1.5">
                            <LodgeCard :card="view.me.card" peekable toggle />
                            <span class="text-xs text-body">我的角色牌</span>
                        </div>
                    </div>

                    <!-- 傳牌：輪到我 -->
                    <div v-if="phase === 'passing' && isMyTurn" class="animate-slide-up flex flex-col gap-3 border-t border-divider pt-4">
                        <p class="m-0 font-semibold text-heading">
                            {{ myHand.length ? `輪到你了！先看清這兩張牌（${PASS_LOCK_SECONDS} 秒閱牌後才能傳牌），選一張留下` : '' }}
                        </p>
                        <div class="flex flex-wrap justify-center gap-4">
                            <div v-for="h in myHand" :key="h.id" class="flex flex-col items-center gap-2">
                                <!-- 別人傳來的牌直接開著（他傳牌時會口頭講傳了什麼，開牌才能比對有沒有說謊）；自己剛抽到的牌蓋著，點一下翻面 -->
                                <LodgeCard :card="h" :revealed="h.from === 'passed'" :peekable="h.from !== 'passed'" :toggle="h.from !== 'passed'" />
                                <span class="text-xs text-body">{{ h.from === 'passed' ? `來自 ${nameOf(h.fromPlayerId)}` : '剛抽到' }}</span>
                                <button type="button" :class="keepChoice === h.id ? 'btn-primary' : 'btn-secondary'"
                                    :aria-pressed="keepChoice === h.id" @click="keepChoice = h.id">
                                    {{ keepChoice === h.id ? '✓ 留下這張' : '留下這張' }}
                                </button>
                            </div>
                        </div>
                        <p v-if="isLastPlayer" class="m-0 text-sm text-body text-center">
                            你是最後一位：另一張牌會被放進客房。
                        </p>
                        <p v-else class="m-0 text-sm text-body text-center">
                            {{ keepChoice ? '接著點盤面上「還沒有角色」的地點，把另一張牌傳過去（可以口頭說謊 😈）' : '先選要留下的牌' }}
                        </p>
                        <button class="btn-primary btn-full" :disabled="!canConfirmPass || passLocked" @click="confirmPass">
                            {{ passLocked ? `🔒 閱牌中… ${Math.ceil(remaining)} 秒後才能傳牌` : isLastPlayer ? '留下這張，另一張放進客房' : '確認傳牌' }}
                        </button>
                    </div>
                    <p v-else-if="phase === 'passing'" class="m-0 text-center text-body border-t border-divider pt-4">
                        {{ view.me.card ? '你已經留下一張牌，等待其他人傳牌…' : `等待 ${nameOf(view.actorId)} 傳牌…` }}
                    </p>

                    <!-- 開票階段：律師 / 富商能力（自願公開，沒有操作就沒有能力） -->
                    <div v-if="phase === 'reveal' && abilityRole"
                        :class="['animate-slide-up flex flex-col gap-2 pt-4', view.me.canReveal ? 'animate-ability-glow rounded-xl border border-amber-300/70 bg-amber-400/10 p-3' : 'border-t border-divider']">
                        <p class="m-0 font-semibold text-heading">{{ ROLES[abilityRole].emoji }} 你是{{ ROLES[abilityRole].name }}{{ view.me.canReveal ? '：⚡ 你可以發動能力！' : '' }}</p>
                        <p v-if="!view.me.canReveal" class="m-0 text-success-text text-sm">已公開身份。</p>
                        <template v-else-if="abilityRole === 'lawyer'">
                            <p class="m-0 text-sm text-label">選一位玩家，作廢他投出的 1 票（不能選自己）。不選就不公開、沒有能力。</p>
                            <div class="flex flex-wrap gap-2">
                                <button v-for="id in lawyerTargets" :key="id" type="button"
                                    :class="voidChoice === id ? 'btn-primary' : 'btn-secondary'"
                                    :aria-pressed="voidChoice === id" @click="voidChoice = id">
                                    {{ nameOf(id) }}
                                </button>
                            </div>
                            <button class="btn-primary btn-full" :disabled="!voidChoice" @click="revealAbility(voidChoice)">
                                {{ voidChoice ? `公開身份，作廢 ${nameOf(voidChoice)} 的票` : '請先選擇玩家' }}
                            </button>
                        </template>
                        <template v-else>
                            <p class="m-0 text-sm text-label">公開身份後，你的票算 2 票；不公開則算 1 票。</p>
                            <button class="btn-primary btn-full" @click="revealAbility()">公開身份，票算 2 票</button>
                        </template>
                    </div>

                    <!-- 投票 -->
                    <div v-if="phase === 'voting'" class="animate-slide-up flex flex-col gap-2 border-t border-divider pt-4">
                        <template v-if="view.me.myVote">
                            <p class="m-0 text-center text-success-text font-semibold">
                                已投給「{{ locationOf(view.me.myVote).name }}」，等待其他人…
                            </p>
                        </template>
                        <template v-else>
                            <p class="m-0 text-center text-label">點選盤面上的地點（也可以投自己的，或投客房），確認後無法更改。</p>
                            <button class="btn-primary btn-full" :disabled="!voteChoice" @click="confirmVote">
                                {{ voteChoice ? `投給「${locationOf(voteChoice).name}」` : '請先選擇地點' }}
                            </button>
                        </template>
                    </div>
                </section>

                <!-- 房主控制 -->
                <section v-if="roomState.isHost && hostControlsVisible" class="flex flex-wrap gap-2 justify-center">
                    <button v-if="phase === 'passing' && actorOffline" class="btn-secondary" @click="autoPlay">
                        代 {{ nameOf(view.actorId) }}（離線）隨機傳牌
                    </button>
                    <button v-if="phase === 'discussion'" class="btn-secondary" @click="endDiscussion">提前進入投票 ⏭️</button>
                    <button v-if="phase === 'voting'" class="btn-secondary" @click="forceResult">強制開票</button>
                    <button v-if="phase === 'reveal'" class="btn-secondary" @click="forceResult">直接結算 ⏭️</button>
                </section>

                <!-- 開票階段：票全部公開，律師 / 富商的公開動作即時顯示 -->
                <section v-if="phase === 'reveal'" class="game-card animate-slide-up py-3" aria-label="開票結果">
                    <h3 class="m-0 mb-2 text-sm font-semibold text-label">🗳️ 投票明細</h3>
                    <ul class="m-0 p-0 list-none flex flex-col gap-1 text-sm text-body">
                        <li v-for="(id, i) in view.order" :key="id" class="animate-slide-up flex flex-wrap items-center gap-1.5"
                            :style="{ animationDelay: `${i * 150}ms` }">
                            <strong class="text-heading">{{ nameOf(id) }}</strong>
                            <template v-if="view.votes[id]">
                                → {{ locationOf(view.votes[id]).name }}
                                <span v-if="voidedIds.includes(id)" class="badge text-ruby">⚖️ 已作廢</span>
                                <span v-else-if="merchantIds.includes(id)" class="badge">💰 ×2</span>
                            </template>
                            <span v-else>未投票</span>
                        </li>
                    </ul>
                    <ul v-if="view.reveals.length" class="m-0 mt-2 pl-5 text-sm text-label leading-relaxed">
                        <li v-for="r in view.reveals" :key="r.playerId">
                            <template v-if="r.kind === 'lawyer'">⚖️ {{ nameOf(r.playerId) }} 公開了律師身份，作廢 {{ nameOf(r.targetId) }} 的 1 票</template>
                            <template v-else>💰 {{ nameOf(r.playerId) }} 公開了富商身份，票算 2 票</template>
                        </li>
                    </ul>
                    <p v-else class="m-0 mt-2 text-sm text-body">目前沒有人公開身份…</p>
                </section>

                <!-- 傳牌紀錄：進行中只顯示自己的動作，完整紀錄於結算時由回放公開 -->
                <section v-if="myPassLog.length && phase !== 'result'" class="game-card py-3">
                    <h3 class="m-0 mb-2 text-sm font-semibold text-label">我的傳牌紀錄</h3>
                    <ol class="m-0 pl-5 text-sm text-body leading-relaxed">
                        <li v-for="l in myPassLog" :key="l.step">
                            {{ nameOf(l.from) }} → {{ l.to === 'lodge-room' ? '客房' : nameOf(l.to) }}
                        </li>
                    </ol>
                </section>


                    <!-- 結算：真相回放（全螢幕面板）與再來一局 -->
                    <section v-if="phase === 'result' && result" class="flex shrink-0 flex-col gap-2">
                        <button class="btn-primary btn-full" @click="showReplay = true">🔍 真相回放</button>
                        <button v-if="roomState.isHost" class="btn-secondary btn-full" @click="playAgain">再來一局 🔄</button>
                        <p v-else class="m-0 text-center text-sm text-body">等待房主開啟下一局…</p>
                    </section>
                </div>
                </div>

                <!-- 真相回放：全螢幕面板，面板內部捲動 -->
                <div v-if="phase === 'result' && result && showReplay" class="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/70 p-2 sm:p-6"
                    role="dialog" aria-modal="true" aria-label="真相回放" @click.self="showReplay = false">
                    <section class="game-card flex w-full max-w-3xl flex-col overflow-hidden !p-0">
                        <div class="flex shrink-0 items-center justify-between border-b border-divider px-4 py-3">
                            <h3 class="m-0 text-lg font-bold text-heading">🔍 真相回放</h3>
                            <button type="button" class="header-icon-btn" aria-label="關閉真相回放" @click="showReplay = false">✕</button>
                        </div>
                        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            <p class="m-0 mb-3 text-sm text-body">這是唯一能看見所有牌的時刻 —— 看看誰在說謊！</p>
                            <ul v-if="result.reveals.length" class="m-0 mb-3 pl-5 text-sm text-label leading-relaxed">
                                <li v-for="r in result.reveals" :key="r.playerId">
                                    <template v-if="r.kind === 'lawyer'">⚖️ 律師 {{ nameOf(r.playerId) }} 作廢了 {{ nameOf(r.targetId) }} 的票</template>
                                    <template v-else>💰 富商 {{ nameOf(r.playerId) }} 公開身份，票算 2 票</template>
                                </li>
                            </ul>
                            <LodgeReplay :replay="result.replay" :players="roomState.players" :locations="view.locations" />
                        </div>
                    </section>
                </div>
            </template>
        </main>

        <!-- 能力公開彈窗（全員同步） -->
        <LodgeRevealModal :event="revealEvent" @close="nextReveal" />

        <!-- 備忘錄：開局到結算隨時可寫（只存在這個瀏覽器） -->
        <template v-if="phase !== 'lobby' && view?.me">
            <button v-if="!showNotes" type="button"
                class="fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full border border-border-glow bg-card-solid px-4 py-2.5 text-heading shadow-lg active:scale-95"
                aria-label="開啟備忘錄" @click="showNotes = true">
                📝 備忘<span v-if="notes" class="inline-block h-2 w-2 rounded-full bg-neon-cyan" aria-hidden="true"></span>
            </button>
            <section v-else class="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-border-glow bg-card-solid p-3 shadow-2xl animate-slide-up"
                aria-label="我的備忘錄">
                <div class="flex items-center justify-between">
                    <label for="lodge-notes" class="text-sm font-semibold text-label">📝 我的備忘（只有你看得到）</label>
                    <button type="button" class="header-icon-btn" aria-label="收起備忘錄" @click="showNotes = false">✕</button>
                </div>
                <textarea id="lodge-notes" v-model="notes" rows="6" class="game-input resize-y"
                    placeholder="記下誰說他看到什麼、誰傳給誰…"></textarea>
            </section>
        </template>

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMountainLodge } from '../composables/useMountainLodge.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import GameGuideModal from '@/shared/components/GameGuideModal.vue'
import LodgeCard from '../components/LodgeCard.vue'
import { useLodgeDarkTheme } from '../composables/useLodgeDarkTheme.js'
import { useSound } from '../composables/useSound.js'
import LodgeSeat from '../components/LodgeSeat.vue'
import LodgeBoiler from '../components/LodgeBoiler.vue'
import LodgeReplay from '../components/LodgeReplay.vue'
import LodgeRoleGuide from '../components/LodgeRoleGuide.vue'
import LodgeRevealModal from '../components/LodgeRevealModal.vue'
import {
    MIN_PLAYERS, minPlayersForLevel, PATTERN_BG_IMG, ROLES, LOCATIONS, LODGE_ROOM, LODGE_ROOM_ID, TEAM_NAMES,
    LEVEL_CHOICES, DISCUSSION_CHOICES, cardLabel, formatSeconds, PASS_LOCK_SECONDS, REVEAL_EVENTS,
} from '../data/constants.js'

const route = useRoute()
const router = useRouter()

const {
    state, roomState, connect, setSettings, startGame, keepCard, autoPlay, endDiscussion,
    vote, forceResult, playAgain, clearError, clearNotice, disconnect, copyInviteLink,
    kickPlayer, transferHost, leaveRoom, upgradeFromSpectator, revealAbility,
} = useMountainLodge()

// ── 主題（固定深色）──────────────────────────────────────────────
useLodgeDarkTheme()

// ── 故事背景 ──────────────────────────────────────────────────────
const showStory = ref(false)
const showRoles = ref(false)

// ── Toast ─────────────────────────────────────────────────────────
const toast = ref({ show: false, msg: '', type: '' })
let _toastTimer = null
function showToast(msg, type = '', duration = 3000) {
    toast.value = { show: true, msg, type }
    clearTimeout(_toastTimer)
    _toastTimer = setTimeout(() => { toast.value.show = false }, duration)
}

// ── 暱稱遮罩 ──────────────────────────────────────────────────────
const showNicknameOverlay = ref(false)
const overlayNickname = ref('')
const overlayInputRef = ref(null)

function joinWithNickname() {
    const nickname = overlayNickname.value.trim()
    if (!nickname) { showToast('請輸入暱稱！', 'error'); return }
    saveNickname(nickname)
    showNicknameOverlay.value = false
    connect((route.query.id || '').toUpperCase(), nickname, false)
}

// ── 視圖衍生資料 ──────────────────────────────────────────────────
const view = computed(() => state.view)
const phase = computed(() => view.value?.phase ?? 'lobby')
const result = computed(() => view.value?.result ?? null)
const myId = computed(() => roomState.myPlayerId)
const needPlayers = computed(() => minPlayersForLevel(view.value?.level ?? 1))
const REVEAL_SECONDS = 20 // 與 server REVEAL_SECONDS 對應（僅用於說明文字）

const playersById = computed(() => Object.fromEntries(roomState.players.map(p => [p.id, p])))
const nameOf = id => playersById.value[id]?.nickname ?? '（已離開）'
const locationOf = id => id === LODGE_ROOM_ID
    ? LODGE_ROOM
    : LOCATIONS[view.value?.locations?.[id]] ?? { name: '？', emoji: '❔' }
// 客房沒有玩家持有，牌要從 result.lodgeRoomCard 另外取
const cardOf = id => (id === LODGE_ROOM_ID ? result.value?.lodgeRoomCard : result.value?.cards?.[id])

// 座位：進入牌局的玩家（觀戰者看全部）
const inGamePlayers = computed(() =>
    roomState.players.filter(p => view.value?.locations?.[p.id]))
const mySeatPlayer = computed(() => playersById.value[myId.value] ?? null)
const myPassLog = computed(() => (view.value?.publicLog ?? []).filter(l => l.from === myId.value))

// 場地盤面第 1–6 格：依座位順序由左至右、由上而下，所有客戶端相同（不旋轉）；沒人的格子留空
const BOARD_PLAYER_SLOTS = 6
const boardSlots = computed(() =>
    Array.from({ length: BOARD_PLAYER_SLOTS }, (_, i) => inGamePlayers.value[i] ?? null))
const inGame = computed(() => !!view.value && phase.value !== 'lobby')
const showReplay = ref(false)
watch(phase, p => { if (p !== 'result') showReplay.value = false })

const isMyTurn = computed(() => phase.value === 'passing' && view.value?.actorId === myId.value)
const myHand = computed(() => view.value?.me?.hand ?? [])
const isLastPlayer = computed(() => isMyTurn.value && (view.value.me.passTargets?.length ?? 0) === 0)
const actorOffline = computed(() => {
    const a = playersById.value[view.value?.actorId]
    return !!a && !a.is_online
})
const hostControlsVisible = computed(() =>
    (phase.value === 'passing' && actorOffline.value) || ['discussion', 'voting', 'reveal'].includes(phase.value))

// 開票階段
const abilityRole = computed(() => {
    const k = view.value?.me?.card?.kind
    return k === 'lawyer' || k === 'merchant' ? k : null
})
const voidedIds = computed(() => (view.value?.reveals ?? []).filter(r => r.kind === 'lawyer').map(r => r.targetId))
const merchantIds = computed(() => (view.value?.reveals ?? []).filter(r => r.kind === 'merchant').map(r => r.playerId))
const lawyerTargets = computed(() =>
    (view.value?.order ?? []).filter(id => id !== myId.value && view.value.votes[id]))
const voidChoice = ref(null)
watch(phase, () => { voidChoice.value = null })

// 開票階段、我有能力且還沒發動：用於醒目提示
const canActNow = computed(() => phase.value === 'reveal' && !!view.value?.me?.canReveal && !!abilityRole.value)

const iWon = computed(() => !!result.value?.winnerIds.includes(myId.value))

const phaseLabel = computed(() => ({
    passing: '📨 傳牌階段', discussion: '💬 討論時間', voting: '🗳️ 投票', reveal: '📣 開票階段', result: '⚖️ 結算',
}[phase.value] ?? ''))
const phaseHint = computed(() => {
    switch (phase.value) {
        case 'passing': return view.value.actorId
            ? `輪到 ${nameOf(view.value.actorId)}（${locationOf(view.value.actorId).name}）閱牌、傳牌`
            : '傳牌完成'
        case 'discussion': return '用語音自由討論：可以說謊，也可以說「我剛才騙你們」'
        case 'voting': return '投票給你認為殺人魔所在的地點（客房也可以投）'
        case 'reveal': return '票已公開：律師 / 富商可在倒數內自願公開身份'
        case 'result': return `第 ${view.value.gameNo} 局結束`
        default: return ''
    }
})

const resultReason = computed(() => {
    const r = result.value
    if (!r) return ''
    const killerId = view.value.order.find(id => r.cards[id].kind === 'killer')
    const where = killerId
        ? `殺人魔是 ${nameOf(killerId)}（${locationOf(killerId).name}）`
        : '殺人魔其實躲在客房裡'
    const accompliceId = view.value.order.find(id => r.cards[id].kind === 'accomplice')
    const bomberId = view.value.order.find(id => r.cards[id].kind === 'bomber')
    const acc = (accompliceId ? `；共犯是 ${nameOf(accompliceId)}` : '')
        + (bomberId ? `；炸彈客是 ${nameOf(bomberId)}（${locationOf(bomberId).name}）` : '')
    if (r.winner === 'bomber') {
        return `炸彈客被送進了鍋爐室，單獨獲勝！好人與殺人魔陣營皆落敗。${where}${acc}。`
    }
    const boiler = r.boilerIds.length
        ? `鍋爐室裡關了：${r.boilerIds.map(id => `${locationOf(id).name}的${cardLabel(cardOf(id))}`).join('、')}`
        : '沒有人投票，鍋爐室是空的'
    return `${boiler}。${where}${acc}。`
})

// ── 倒數計時（以伺服器時間校正）────────────────────────────────────
const now = ref(Date.now())
let skew = 0
let _tick = null
watch(() => view.value?.serverNow, (sn) => { if (sn) skew = sn - Date.now() }, { immediate: true })
const remaining = computed(() => {
    const end = view.value?.endsAt
    return end ? Math.max(0, (end - (now.value + skew)) / 1000) : 0
})

// ── 音效 ──────────────────────────────────────────────────────────
const { sfxOn, ambientOn, play, setLoop, stopAll, toggleSfx, toggleAmbient } = useSound()
// 雨聲：進房間後常駐（是否出聲由「雨聲」開關決定）
setLoop('rain', true)
// 收到新牌（開局 / 輪到我傳牌）、結算翻牌
watch(() => myHand.value.map(h => h.id).join(), (ids, old) => { if (ids && ids !== old) play('flip') })
watch(result, (r) => { if (r) play('flip') })
// 有人傳牌（公開紀錄新增一筆）
watch(() => view.value?.publicLog?.length ?? 0, (n, old) => { if (n > old) play('pass') })
// 討論最後 30 秒：老鐘滴答
watch(() => phase.value === 'discussion' && remaining.value > 0 && remaining.value <= 30,
    (on) => setLoop('tick', on))

// ── 傳牌互動 ──────────────────────────────────────────────────────
const keepChoice = ref(null)
const passChoice = ref(null)
watch(() => `${view.value?.actorId}|${myHand.value.map(h => h.id).join()}`, () => {
    keepChoice.value = null
    passChoice.value = null
})
// 閱牌倒數未結束不能傳牌（伺服器也會擋）
const passLocked = computed(() => isMyTurn.value && remaining.value > 0)
const canConfirmPass = computed(() =>
    !!keepChoice.value && (isLastPlayer.value || !!passChoice.value))
function confirmPass() {
    if (!canConfirmPass.value) return
    keepCard(keepChoice.value, isLastPlayer.value ? null : passChoice.value)
    keepChoice.value = null
    passChoice.value = null
}

// ── 能力公開彈窗佇列（全員由 view.reveals 的新增偵測；重連 / 中途進入不補播）──
const seenReveals = new Set()
const revealQueue = ref([])
let revealsSeeded = false
watch(() => view.value?.reveals ?? [], (list) => {
    if (!view.value) return
    if (!list.length) { seenReveals.clear(); revealsSeeded = true; return }
    for (const r of list) {
        if (seenReveals.has(r.playerId)) continue
        seenReveals.add(r.playerId)
        if (!revealsSeeded) continue
        const make = REVEAL_EVENTS[r.kind]
        if (make) revealQueue.value.push({ kind: r.kind, ...make(nameOf(r.playerId), r.targetId ? nameOf(r.targetId) : '') })
    }
    revealsSeeded = true
}, { immediate: true, deep: true })
const revealEvent = computed(() => revealQueue.value[0] ?? null)
function nextReveal() { revealQueue.value.shift() }
watch(canActNow, (on) => {
    if (on) { showToast('⚡ 你可以發動能力！要不要公開身份？', 'info', 5000); play('pass') }
})

// ── 投票互動 ──────────────────────────────────────────────────────
const voteChoice = ref(null)
watch(phase, () => { voteChoice.value = null })
function confirmVote() {
    if (!voteChoice.value) return
    vote(voteChoice.value)
}

// ── 地點的互動狀態（傳牌 / 投票共用）──────────────────────────────
function isSeatSelectable(id) {
    if (isMyTurn.value && keepChoice.value && !isLastPlayer.value) {
        return view.value.me.passTargets.includes(id)
    }
    return phase.value === 'voting' && !!view.value?.me && !view.value.me.myVote
}
function isSeatSelected(id) {
    if (phase.value === 'passing') return passChoice.value === id
    if (phase.value === 'voting') return (view.value?.me?.myVote ?? voteChoice.value) === id
    return false
}
function selectSeat(id) {
    if (phase.value === 'passing') passChoice.value = id
    else if (phase.value === 'voting') voteChoice.value = id
}

// ── 私人備忘（只存在這個瀏覽器）──────────────────────────────────
const showNotes = ref(false)
const notes = ref('')
const notesKey = computed(() => `lodge-notes:${roomState.roomId}:${view.value?.gameNo ?? 0}`)
watch(notesKey, (key) => {
    try { notes.value = localStorage.getItem(key) ?? '' } catch { notes.value = '' }
}, { immediate: true })
watch(notes, (val) => {
    try { localStorage.setItem(notesKey.value, val) } catch { /* 無痕模式等情況略過 */ }
})

// ── 通知 / 錯誤 ───────────────────────────────────────────────────
watch(() => state.notice, (msg) => {
    if (msg) { showToast(msg, 'info', 4500); clearNotice() }
})
watch(() => state.error, (msg) => {
    if (msg && roomState.room) { showToast(msg, 'error'); clearError() }
})

function handleCopyLink() {
    copyInviteLink()
    showToast('邀請連結已複製 🔗', 'success')
}

// ── 離開 ──────────────────────────────────────────────────────────
function goLobby() {
    disconnect()
    router.push({ name: 'mountain-lodge' })
}
function goHome() {
    const inGame = phase.value !== 'lobby' && !!view.value?.me
    if (inGame && !confirm('離開房間會中止本局，確定要離開嗎？')) return
    leaveRoom()
    goLobby()
}

// ── 初始化 ────────────────────────────────────────────────────────
onMounted(() => {
    _tick = setInterval(() => { now.value = Date.now() }, 250)

    const roomId = (route.query.id || '').toUpperCase()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    const isCreating = route.query.create === '1'
    const maxPlayers = parseInt(route.query.max) || 4

    if (!roomId) { router.push({ name: 'mountain-lodge' }); return }

    if (!nickname) {
        showNicknameOverlay.value = true
        nextTick(() => overlayInputRef.value?.focus())
        return
    }

    // 建立房間後立刻把 create=1 從網址移除，避免 F5 重整時重建
    if (isCreating) {
        router.replace({ name: 'mountain-lodge-room', query: { id: roomId, nickname } })
    }
    connect(roomId, nickname, isCreating, maxPlayers)
})

onUnmounted(() => {
    clearInterval(_tick)
    clearTimeout(_toastTimer)
    stopAll()
    disconnect() // 瀏覽器返回鍵離開頁面時也要斷線，避免留下幽靈在線玩家
})
</script>
