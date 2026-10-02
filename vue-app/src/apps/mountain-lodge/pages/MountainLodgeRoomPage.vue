<template>
    <div class="lodge-bg h-[100dvh] overflow-x-hidden overflow-y-auto" :style="{ '--lodge-pattern': `url(${PATTERN_BG_IMG})` }">
        <!-- Header -->
        <header class="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2 border-b border-border bg-header backdrop-blur-md">
            <div class="flex items-center gap-1 min-w-0">
                <button class="header-back-btn" aria-label="離開房間" @click="goHome">
                    ←<span class="hidden sm:inline"> 離開</span>
                </button>
                <span class="font-bold text-heading truncate">山中別館 🏚️</span>
            </div>
            <div class="flex items-center gap-2 order-last w-full justify-center sm:order-none sm:w-auto">
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

        <main v-else-if="roomState.room && view" class="mx-auto w-full max-w-3xl lg:max-w-6xl px-3 sm:px-4 py-4 flex flex-col gap-4">

            <!-- 觀戰提示 -->
            <div v-if="roomState.isSpectator" class="game-card flex flex-wrap items-center justify-between gap-2 py-3" role="status">
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
                        <li>投票：每人投 1 個地點。得票最高的地點，其角色牌送進鍋爐室；殺人魔被關進去 → 好人贏。</li>
                        <li v-if="view.level >= 3">開票：票公開後有 {{ REVEAL_SECONDS }} 秒，律師 / 富商可自願公開身份發動能力；炸彈客被關進鍋爐室則單獨獲勝。</li>
                    </ol>
                </details>
            </section>

            <!-- ═════════════ 牌局進行中 / 結算 ═════════════ -->
            <template v-else>
                <!-- 狀態列 -->
                <div class="game-card flex flex-wrap items-center justify-between gap-2 py-3" aria-live="polite">
                    <Transition name="phase-fade" mode="out-in">
                        <div :key="phase + (view.actorId ?? '')" class="flex flex-col">
                            <span class="text-lg font-bold text-heading">{{ phaseLabel }}</span>
                            <span class="text-sm text-body">{{ phaseHint }}</span>
                        </div>
                    </Transition>
                    <div v-if="phase === 'discussion'" class="font-mono text-3xl font-bold tabular-nums"
                        :class="remaining <= 30 ? 'text-ruby animate-timer-pulse' : 'text-neon-cyan'" role="timer">
                        {{ formatSeconds(remaining) }}
                    </div>
                    <div v-else-if="phase === 'voting'" class="text-sm text-label">
                        已投 {{ view.votedIds.length }}/{{ view.order.length }}
                    </div>
                    <div v-else-if="phase === 'reveal'" class="font-mono text-3xl font-bold tabular-nums text-neon-cyan" role="timer">
                        {{ formatSeconds(remaining) }}
                    </div>
                    <div class="basis-full flex flex-wrap items-center gap-1.5 text-xs text-body" aria-label="本局角色板塊">
                        <span class="text-label">本局角色：</span>
                        <span v-for="k in view.levelRoles" :key="k" class="badge" :title="ROLES[k].hint">
                            {{ ROLES[k].emoji }} {{ ROLES[k].name }}
                        </span>
                    </div>
                </div>

                <!-- 結算橫幅 -->
                <div v-if="phase === 'result' && result"
                    :class="['game-card text-center animate-pop-in', result.winner === 'good' ? '[border-color:var(--color-success)]' : '[border-color:var(--color-neon-rose)]']"
                    role="status">
                    <div class="text-5xl mb-1">{{ { good: '🎉', killer: '😈', bomber: '💥' }[result.winner] }}</div>
                    <h2 class="neon-heading text-2xl m-0 mb-1">{{ TEAM_NAMES[result.winner] }}獲勝！</h2>
                    <p class="m-0 text-label">{{ resultReason }}</p>
                    <p v-if="!roomState.isSpectator" class="mt-2 mb-0 font-semibold"
                        :class="iWon ? 'text-success-text' : 'text-ruby'">
                        {{ iWon ? '你贏了 +1 勝場' : '這局你輸了' }}
                    </p>
                </div>

                <!-- 桌機：左＝場地盤面、右＝我的操作區（固定在視窗內不用捲動）；手機：單欄 -->
                <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
                <div class="flex flex-col gap-4 min-w-0">

                <!-- 其他玩家的地點 -->
                <section aria-label="其他玩家的地點">
                    <div class="grid grid-cols-3 gap-2 sm:gap-3">
                        <LodgeSeat v-for="p in otherSeats" :key="p.id"
                            :location="locationOf(p.id)" :player="p"
                            :has-card="view.keptIds.includes(p.id)"
                            :revealed-card="result?.cards[p.id] ?? null"
                            :is-actor="view.actorId === p.id"
                            :selectable="isSeatSelectable(p.id)"
                            :selected="isSeatSelected(p.id)"
                            :voted="phase === 'voting' && view.votedIds.includes(p.id)"
                            :vote-count="result ? result.voteCounts[p.id] : null"
                            :boiler="!!result && result.boilerIds.includes(p.id)"
                            @select="selectSeat(p.id)" />
                    </div>
                </section>

                <!-- 中央：客房、鍋爐室 -->
                <section aria-label="客房與鍋爐室" class="grid grid-cols-2 gap-3 max-w-md w-full mx-auto">
                    <LodgeSeat :location="LODGE_ROOM" :has-card="view.lodgeRoomFilled"
                        :revealed-card="result?.lodgeRoomCard ?? null" />
                    <div class="rounded-xl border border-neon-rose/40 bg-[rgba(225,29,72,0.08)] p-3 flex flex-col items-center gap-1.5 text-center">
                        <div class="w-full aspect-[3/2] rounded-lg overflow-hidden bg-card-solid">
                            <img :src="BOILER.img" alt="" draggable="false" loading="lazy" class="w-full h-full object-cover" />
                        </div>
                        <span class="font-bold text-heading text-base">{{ BOILER.name }}</span>
                        <div class="flex flex-wrap justify-center gap-1.5 min-h-[96px] items-center">
                            <template v-if="result && result.boilerIds.length">
                                <LodgeCard v-for="id in result.boilerIds" :key="id" :card="result.cards[id]" revealed compact />
                            </template>
                            <LodgeCard v-else compact empty class="opacity-30" />
                        </div>
                        <span v-if="result && !result.boilerIds.length" class="text-xs text-body">沒有人被送進來</span>
                    </div>
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

                </div>

                <div class="flex flex-col gap-4 min-w-0 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto lg:pr-1">
                <!-- 我的區域 -->
                <section v-if="view.me" class="game-card flex flex-col gap-4" aria-label="我的區域">
                    <div class="flex flex-wrap items-center gap-4">
                        <div class="w-[150px] max-w-full">
                            <LodgeSeat :location="locationOf(myId)" :player="mySeatPlayer" is-me
                                :has-card="!!view.me.card" :revealed-card="result?.cards[myId] ?? null"
                                :is-actor="view.actorId === myId"
                                :selectable="isSeatSelectable(myId)" :selected="isSeatSelected(myId)"
                                :vote-count="result ? result.voteCounts[myId] : null"
                                :boiler="!!result && result.boilerIds.includes(myId)"
                                @select="selectSeat(myId)" />
                        </div>
                        <div v-if="view.me.card && !result" class="flex flex-col items-center gap-1.5">
                            <LodgeCard :card="view.me.card" peekable toggle />
                            <span class="text-xs text-body">我的角色牌</span>
                        </div>
                    </div>

                    <!-- 傳牌：輪到我 -->
                    <div v-if="phase === 'passing' && isMyTurn" class="animate-slide-up flex flex-col gap-3 border-t border-divider pt-4">
                        <p class="m-0 font-semibold text-heading">
                            {{ myHand.length ? '輪到你了！看看這兩張牌，選一張留下' : '' }}
                        </p>
                        <div class="flex flex-wrap justify-center gap-4">
                            <div v-for="h in myHand" :key="h.id" class="flex flex-col items-center gap-2">
                                <LodgeCard :card="h" peekable toggle />
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
                            {{ keepChoice ? '接著點上方「還沒有角色」的地點，把另一張牌傳過去（可以口頭說謊 😈）' : '先選要留下的牌' }}
                        </p>
                        <button class="btn-primary btn-full" :disabled="!canConfirmPass" @click="confirmPass">
                            {{ isLastPlayer ? '留下這張，另一張放進客房' : '確認傳牌' }}
                        </button>
                    </div>
                    <p v-else-if="phase === 'passing'" class="m-0 text-center text-body border-t border-divider pt-4">
                        {{ view.me.card ? '你已經留下一張牌，等待其他人傳牌…' : `等待 ${nameOf(view.actorId)} 傳牌…` }}
                    </p>

                    <!-- 討論 -->
                    <div v-if="phase === 'discussion'" class="animate-slide-up flex flex-col gap-2 border-t border-divider pt-4">
                        <label for="lodge-notes" class="text-sm font-semibold text-label">📝 我的備忘（只有你看得到）</label>
                        <textarea id="lodge-notes" v-model="notes" rows="4" class="game-input resize-y"
                            placeholder="記下誰說他看到什麼、誰傳給誰…"></textarea>
                    </div>

                    <!-- 開票階段：律師 / 富商能力（自願公開，沒有操作就沒有能力） -->
                    <div v-if="phase === 'reveal' && abilityRole" class="animate-slide-up flex flex-col gap-2 border-t border-divider pt-4">
                        <p class="m-0 font-semibold text-heading">{{ ROLES[abilityRole].emoji }} 你是{{ ROLES[abilityRole].name }}</p>
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
                            <p class="m-0 text-center text-label">點選上方的地點（也可以投自己的），確認後無法更改。</p>
                            <button class="btn-primary btn-full" :disabled="!voteChoice" @click="confirmVote">
                                {{ voteChoice ? `投給「${locationOf(voteChoice).name}」` : '請先選擇地點' }}
                            </button>
                        </template>
                        <div v-if="notes" class="text-sm text-body whitespace-pre-wrap border-t border-divider pt-2">
                            <span class="text-label font-semibold">📝 我的備忘</span><br>{{ notes }}
                        </div>
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

                </div>
                </div>

                <!-- 結算：真相回放 -->
                <template v-if="phase === 'result' && result">
                    <section class="game-card">
                        <h3 class="m-0 mb-1 text-lg font-bold text-heading">🔍 真相回放</h3>
                        <p class="m-0 mb-3 text-sm text-body">這是唯一能看見所有牌的時刻 —— 看看誰在說謊！</p>
                        <ul v-if="result.reveals.length" class="m-0 mb-3 pl-5 text-sm text-label leading-relaxed">
                            <li v-for="r in result.reveals" :key="r.playerId">
                                <template v-if="r.kind === 'lawyer'">⚖️ 律師 {{ nameOf(r.playerId) }} 作廢了 {{ nameOf(r.targetId) }} 的票</template>
                                <template v-else>💰 富商 {{ nameOf(r.playerId) }} 公開身份，票算 2 票</template>
                            </li>
                        </ul>
                        <LodgeReplay :replay="result.replay" :players="roomState.players" :locations="view.locations" />
                    </section>
                    <div class="flex justify-center">
                        <button v-if="roomState.isHost" class="btn-primary" @click="playAgain">再來一局 🔄</button>
                        <p v-else class="m-0 text-body">等待房主開啟下一局…</p>
                    </div>
                </template>
            </template>
        </main>

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
import LodgeReplay from '../components/LodgeReplay.vue'
import LodgeRoleGuide from '../components/LodgeRoleGuide.vue'
import {
    MIN_PLAYERS, minPlayersForLevel, PATTERN_BG_IMG, ROLES, LOCATIONS, LODGE_ROOM, BOILER, TEAM_NAMES,
    LEVEL_CHOICES, DISCUSSION_CHOICES, cardLabel, formatSeconds,
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
const locationOf = id => LOCATIONS[view.value?.locations?.[id]] ?? { name: '？', emoji: '❔' }

// 座位：以「我」為起點旋轉，我的地點固定在畫面下方；觀戰者看全部
const inGamePlayers = computed(() =>
    roomState.players.filter(p => view.value?.locations?.[p.id]))
const mySeatPlayer = computed(() => playersById.value[myId.value] ?? null)
const myPassLog = computed(() => (view.value?.publicLog ?? []).filter(l => l.from === myId.value))

const otherSeats = computed(() => {
    const list = inGamePlayers.value
    const meIdx = list.findIndex(p => p.id === myId.value)
    if (meIdx === -1) return list
    return [...list.slice(meIdx + 1), ...list.slice(0, meIdx)]
})

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

const iWon = computed(() => !!result.value?.winnerIds.includes(myId.value))

const phaseLabel = computed(() => ({
    passing: '📨 傳牌階段', discussion: '💬 討論時間', voting: '🗳️ 投票', reveal: '📣 開票階段', result: '⚖️ 結算',
}[phase.value] ?? ''))
const phaseHint = computed(() => {
    switch (phase.value) {
        case 'passing': return view.value.actorId
            ? `輪到 ${nameOf(view.value.actorId)}（${locationOf(view.value.actorId).name}）`
            : '傳牌完成'
        case 'discussion': return '用語音自由討論：可以說謊，也可以說「我剛才騙你們」'
        case 'voting': return '投票給你認為殺人魔所在的地點'
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
        ? `鍋爐室裡關了：${r.boilerIds.map(id => `${locationOf(id).name}的${cardLabel(r.cards[id])}`).join('、')}`
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
const canConfirmPass = computed(() =>
    !!keepChoice.value && (isLastPlayer.value || !!passChoice.value))
function confirmPass() {
    if (!canConfirmPass.value) return
    keepCard(keepChoice.value, isLastPlayer.value ? null : passChoice.value)
    keepChoice.value = null
    passChoice.value = null
}

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
