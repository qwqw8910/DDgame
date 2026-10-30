<template>
    <div class="flex h-[100dvh] w-full flex-col overflow-hidden bg-dark pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <ConnectionBanner :connected="roomState.connected" :active="roomState.inRoom" />
        <!-- Header -->
        <header class="relative z-40 shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-header backdrop-blur-md">
            <div class="flex items-center gap-1 min-w-0">
                <button class="header-back-btn" aria-label="離開房間" @click="goHome">←<span class="hidden sm:inline"> 離開</span></button>
                <span class="font-bold text-heading truncate">血染鐘樓</span>
                <span v-if="view" class="badge hidden sm:inline-flex">{{ roleLabel }}</span>
            </div>
            <div class="hidden sm:flex items-center gap-2">
                <span class="font-mono font-semibold tracking-[3px] text-neon-purple-light">{{ roomState.roomId }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
                <RoomPlayerPanel :players="roomState.players" :my-id="roomState.myPlayerId"
                    :host-id="roomState.room?.host_player_id" :is-host="roomState.isHost"
                    @kick="id => kickPlayer(id)" @transfer-host="id => transferHost(id)" />
                <button class="header-icon-btn" title="角色一覽" aria-label="角色一覽" @click="showRoles = true"><GameIcon id="roleSheet" :size="18" /></button>
                <button class="header-icon-btn" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink"><GameIcon id="link" :size="18" /></button>
            </div>
        </header>

        <RoleSheet :open="showRoles" :script="state.script" :my-role-id="view?.me?.roleId ?? null" @close="showRoles = false" />

        <!-- 載入中 -->
        <div v-if="state.loading" class="fullscreen-overlay fullscreen-overlay--blur">
            <div class="mb-3"><GameIcon id="banner" :size="48" /></div>
            <span class="spinner mb-3.5"></span>
            <p class="text-body text-base">{{ state.loadingText || '連線中…' }}</p>
        </div>

        <!-- 被踢出 / 無法加入 -->
        <div v-else-if="state.kicked || (state.error && !roomState.room)" class="overlay">
            <div class="overlay-card text-center">
                <div class="mb-2"><GameIcon id="left" :size="40" /></div>
                <p class="text-heading text-lg font-semibold mb-1">{{ state.kicked ? '你已離開房間' : '無法進入房間' }}</p>
                <p class="text-body mb-4">{{ state.kicked || state.error }}</p>
                <button class="btn-primary" @click="goLobby">回到入口</button>
            </div>
        </div>

        <!-- 暱稱遮罩 -->
        <div v-else-if="showNicknameOverlay" class="overlay">
            <div class="overlay-card">
                <div class="section-header mb-4">
                    <h2 class="neon-heading text-xl">輸入你的暱稱</h2>
                    <p class="text-sm text-body m-0">請使用和 Discord 相同的暱稱</p>
                </div>
                <div class="input-wrapper mb-3">
                    <input v-model="overlayNickname" ref="overlayInputRef" class="game-input" type="text"
                        placeholder="你的暱稱…" maxlength="12" aria-label="暱稱" autocomplete="off" @keydown.enter="joinWithNickname" />
                </div>
                <button class="btn-primary" @click="joinWithNickname">加入房間</button>
            </div>
        </div>

        <main v-else-if="roomState.room && view" class="flex min-h-0 w-full flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-3">
            <!-- 暫停 -->
            <div v-if="phase === 'paused'" class="shrink-0 rounded-xl border border-lemon/50 bg-lemon/10 px-3 py-2 text-center text-sm font-semibold text-heading" role="alert">
                <GameIcon id="pause" :size="16" /> 等待說書人重新連線…（遊戲暫停）
            </div>

            <!-- 觀戰提示 -->
            <div v-if="role === 'spectator' && phase !== 'lobby'" class="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm" role="status">
                <span class="text-label">你正在觀戰：只看得到公開城鎮廣場，不能發言或私聊。</span>
                <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="btn-primary !w-auto !px-3 !py-1.5 text-sm" @click="upgradeFromSpectator">加入房間</button>
            </div>

            <!-- ═════════════ 大廳 ═════════════ -->
            <section v-if="phase === 'lobby'" class="mx-auto grid w-full max-w-5xl min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1">
                <div class="game-card flex min-h-0 flex-col gap-2 overflow-y-auto !p-3">
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-mono text-xl font-bold tracking-[4px] text-neon-purple-light">{{ roomState.roomId }}</span>
                        <button class="header-icon-btn" title="複製邀請連結" aria-label="複製邀請連結" @click="handleCopyLink"><GameIcon id="link" :size="18" /></button>
                    </div>
                    <details class="text-xs text-body">
                        <summary class="cursor-pointer text-label">注意事項</summary>
                        <ul class="m-0 mt-1 list-none p-0 leading-relaxed">
                            <li><GameIcon id="voice" :size="12" /> 公開討論請進 Discord 語音，私聊與所有操作在網頁上</li>
                            <li><GameIcon id="voice" :size="12" /> 請使用和 Discord 相同的暱稱</li>
                            <li><GameIcon id="night" :size="12" /> 夜晚請關麥克風</li>
                            <li><GameIcon id="warn" :size="12" /> 不可出示角色牌或截圖</li>
                        </ul>
                    </details>

                    <!-- 說書人 -->
                    <div class="flex flex-wrap items-center gap-1.5 rounded-xl border border-border p-2">
                        <GameIcon id="storyteller" :size="16" />
                        <span class="min-w-0 flex-1 truncate text-sm text-heading">說書人：{{ view.storytellerId ? (names[view.storytellerId] ?? '?') : '尚未決定' }}<span v-if="view.storytellerId === myId" class="badge badge-me ml-1">我</span></span>
                        <template v-if="roomState.isHost">
                            <button class="btn-secondary !w-auto !px-2 !py-1 text-xs" @click="randomStoryteller"><GameIcon id="dice" :size="12" /> 隨機</button>
                            <select class="game-input !w-auto max-w-[8.5rem] cursor-pointer !py-1 text-xs" :value="view.storytellerId ?? ''" aria-label="指定說書人" @change="e => e.target.value && setStoryteller(e.target.value)">
                                <option value="" disabled>指定…</option>
                                <option v-for="p in roomState.players" :key="p.id" :value="p.id">{{ p.nickname }}{{ p.id === myId ? '（我）' : '' }}</option>
                            </select>
                        </template>
                    </div>
                    <p v-if="!roomState.isHost && !view.storytellerId" class="m-0 text-xs text-body">由房主指定或隨機抽出；說書人不入座、不計分。</p>

                    <!-- 說書人：開局 -->
                    <template v-if="role === 'storyteller'">
                        <p class="m-0 text-xs text-body">點兩個座位可以互換位置（座位順序就是鄰座）。</p>
                        <div v-if="DEV_BOTS" class="flex gap-2">
                            <button class="btn-ghost-sm flex-1" @click="setup('add-bots')"><GameIcon id="bot" :size="14" /> 填入測試機器人</button>
                            <button class="btn-ghost-sm flex-1" @click="setup('remove-bots')">移除機器人</button>
                        </div>
                        <button class="btn-primary btn-full !py-2" :disabled="seatedCount < MIN_SEATS" @click="setup('begin')">
                            進入開局設定（{{ seatedCount }}/{{ MIN_SEATS }}+ 人）
                        </button>
                    </template>
                    <p v-else-if="isRoomPlayer" class="m-0 text-center text-xs text-body">
                        {{ mySeatLobby >= 0 ? `你坐在 ${mySeatLobby + 1} 號。點自己的座位可以離座。` : '點一個空座位入座。' }}
                    </p>
                    <button v-if="roomState.isSpectator && roomState.spectatorCanJoin" class="btn-primary btn-full" @click="upgradeFromSpectator">加入房間</button>
                </div>

                <div class="game-card relative min-h-0 !p-2">
                    <TownCircle :seats="lobbySeats" :my-id="myId" :online="view.online" :names="names" :selected="swapFrom !== null ? [swapFrom] : []"
                        @seat-click="onLobbySeat">
                        <template #center>
                            <GameIcon id="banner" :size="28" />
                            <p class="m-0 text-xs text-label">已入座 {{ seatedCount }} / {{ view.seatCount }}</p>
                        </template>
                    </TownCircle>
                </div>
            </section>

            <!-- ═════════════ 開局設定 ═════════════ -->
            <section v-else-if="phase === 'setup'" class="mx-auto grid w-full max-w-6xl min-h-0 flex-1 gap-2"
                :class="role === 'storyteller' ? 'grid-rows-[minmax(0,34%)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_440px] lg:grid-rows-1' : 'grid-rows-1'">
                <div class="game-card relative min-h-0 !p-2">
                    <TownCircle :seats="seatList" :my-id="myId" :online="view.online" :names="names" :clickable="role === 'storyteller'"
                        :selected="swapFrom !== null ? [swapFrom] : []" @seat-click="onSetupSeat">
                        <template #center>
                            <GameIcon id="storyteller" :size="24" />
                            <p class="m-0 text-[11px] leading-tight text-label">{{ role === 'storyteller' ? '點兩個座位互換玩家' : '說書人正在設定角色…' }}</p>
                        </template>
                    </TownCircle>
                </div>
                <div v-if="role === 'storyteller'" class="game-card min-h-0 overflow-hidden !p-2">
                    <GrimoirePanel :view="view" @setup="(a, d) => setup(a, d)" @assign="assignRole" @start="f => startGame(f)" />
                </div>
            </section>

            <!-- ═════════════ 遊戲中 / 終局 ═════════════ -->
            <template v-else>
                <!-- 狀態列 -->
                <div class="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-1.5" aria-live="polite">
                    <div class="flex min-w-0 items-center gap-2">
                        <GameIcon :id="statusIcon" :size="24" />
                        <div class="flex min-w-0 flex-col">
                            <span class="text-base font-bold leading-tight text-heading">{{ statusLabel }}</span>
                            <span class="truncate text-xs text-body">{{ statusHint }}</span>
                        </div>
                    </div>
                    <div v-if="view.timer" role="timer"
                        :class="['font-mono text-2xl font-bold tabular-nums', remaining <= 0 ? 'text-ruby animate-timer-pulse' : remaining <= 60 ? 'text-lemon' : 'text-neon-cyan']">
                        {{ formatSeconds(remaining) }}
                    </div>
                    <!-- 說書人流程按鈕 -->
                    <div v-if="role === 'storyteller'" class="flex flex-wrap gap-1.5">
                        <template v-if="realPhase === 'night'">
                            <button class="btn-primary !w-auto !px-3 !py-1.5 text-sm" :disabled="phase === 'paused'" @click="confirmDawn"><GameIcon id="dawn" :size="14" /> 天亮</button>
                        </template>
                        <template v-else-if="realPhase === 'day'">
                            <button v-if="view.daySubPhase !== 'free'" class="btn-secondary !w-auto !px-3 !py-1.5 text-sm" :disabled="!!view.voting" @click="dayPhase('free')">自由時間</button>
                            <template v-if="view.daySubPhase === 'free'">
                                <button class="btn-secondary !w-auto !px-3 !py-1.5 text-sm" @click="dayPhase('extend')">+1 分鐘</button>
                                <button class="btn-primary !w-auto !px-3 !py-1.5 text-sm" @click="dayPhase('nomination')">集合提名</button>
                            </template>
                            <button v-if="view.daySubPhase === 'nomination'" class="btn-primary !w-auto !px-3 !py-1.5 text-sm" :disabled="!!view.voting" @click="confirmEndDay">結束白天</button>
                        </template>
                        <button v-if="['night', 'day'].includes(realPhase)" class="btn-ghost-sm" @click="showDeclare = true">宣告勝利</button>
                        <button v-if="phase === 'result'" class="btn-primary !w-auto !px-3 !py-1.5 text-sm" @click="playAgain">回大廳</button>
                    </div>
                </div>

                <!-- 終局橫幅 -->
                <div v-if="phase === 'result' && view.winner" class="shrink-0 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-glow bg-neon-purple/10 px-3 py-2">
                    <p class="m-0 text-heading"><GameIcon kind="team" :id="view.winner.team" :size="20" />
                        <strong class="text-lg">{{ TEAM_NAMES[view.winner.team] }}獲勝</strong>：{{ view.winner.reason }}
                        <span v-if="role === 'player'" class="ml-1">{{ view.winner.winnerIds.includes(myId) ? '（你贏了！）' : '（你輸了）' }}</span>
                    </p>
                    <button class="btn-secondary !w-auto !px-3 !py-1.5 text-sm" @click="showReplay = true"><GameIcon id="grimoire" :size="14" /> 完整魔典與日誌</button>
                </div>

                <div class="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_400px]">
                    <!-- 左：圓桌（手機版依底部分頁切換）。圓桌吃剩下的空間，不捲動 -->
                    <div v-show="isDesktop || mobilePanel === 'table'" class="flex min-h-0 flex-col gap-2">
                        <!-- 入夜畫面：所有玩家 / 觀戰者完全相同 -->
                        <div v-if="showNightScreen" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3 text-center">
                            <GameIcon id="night" :size="56" />
                            <p class="m-0 text-lg font-bold text-heading">入夜，請在 Discord 關閉麥克風</p>
                            <p class="m-0 text-sm text-body">說書人會依序喚醒角色。所有人的畫面都一樣。</p>
                            <MyRoleCard v-if="view.me" :view="view" collapsible />
                        </div>
                        <template v-else>
                            <div class="game-card relative min-h-0 flex-1 !p-1">
                                <TownCircle :seats="seatList" :my-id="myId" :online="view.online" :names="names"
                                    :pointer-seat="pointerSeat" :hands="view.voting?.hands ?? null" :badges="seatBadges"
                                    :impaired="view.grimoire?.impaired ?? null" :reminders="view.grimoire?.reminders ?? []"
                                    :whisper-groups="view.whisperGroups" :my-group-id="view.me?.whisperGroupId ?? null" :focus-group-id="focusGroupId"
                                    :clickable="phase !== 'paused'" @seat-click="i => (menuSeat = i)">
                                    <template #center>
                                        <template v-if="phase === 'result'">
                                            <GameIcon kind="team" :id="view.winner?.team ?? 'good'" :size="28" />
                                            <p class="m-0 text-xs font-semibold text-heading">{{ TEAM_NAMES[view.winner?.team] }}獲勝</p>
                                        </template>
                                        <template v-else>
                                            <GameIcon :id="statusIcon" :size="24" />
                                            <p class="m-0 text-[11px] leading-tight text-label">存活 {{ view.aliveCount }} / {{ view.seats.length }}</p>
                                            <p v-if="realPhase === 'day'" class="m-0 text-[11px] leading-tight text-label">門檻 {{ view.voteThreshold }} 票</p>
                                        </template>
                                    </template>
                                </TownCircle>
                            </div>
                            <p v-if="view.me?.whisperGroupId && realPhase === 'day'" class="m-0 flex shrink-0 items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-1 text-sm text-label">
                                <span><GameIcon id="whisper" :size="14" /> 你正在私聊</span>
                                <button class="btn-ghost-sm" @click="whisperLeave">離開私聊</button>
                            </p>
                            <VotingClock v-if="realPhase === 'day' && (view.daySubPhase === 'nomination' || view.nominations.results.length)" :view="view"
                                class="max-h-[40%] shrink-0 overflow-y-auto"
                                @vote="up => vote(up)" @start-vote="ms => startVote(ms)" @control="(a, d) => voteControl(a, d)" />
                        </template>
                    </div>

                    <!-- 右：工具區（說書人：夜晚順序 / 魔典 / 日誌；玩家：我的角色）+ 聊天。各區內部捲動，整頁不捲 -->
                    <div v-show="isDesktop || mobilePanel !== 'table'" class="flex min-h-0 flex-col gap-2">
                        <div v-show="isDesktop || mobilePanel === 'tools'" class="flex min-h-0 flex-col gap-1.5" :class="isDesktop ? 'max-h-[46%] shrink-0' : 'flex-1'">
                            <div class="flex shrink-0 gap-1" role="tablist">
                                <button v-for="t in toolTabs" :key="t.key" type="button" role="tab" :aria-selected="curTool === t.key"
                                    :class="['rounded-full border px-3 py-1 text-xs', curTool === t.key ? 'border-neon-purple bg-neon-purple/15 text-heading' : 'border-border text-body']"
                                    @click="toolTab = t.key">{{ t.label }}</button>
                            </div>
                            <div class="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-card p-2">
                                <NightQueue v-if="curTool === 'queue'" :view="view"
                                    @wake="e => wake(e.seat, { roleId: e.roleId })" @info="openComposer" @send-truth="sendTruth"
                                    @done="(k, d) => queueDone(k, d)" @evil="k => sendInfo(k, {})" @seat="i => (menuSeat = i)" @kill="i => setDead(i, true)" />
                                <template v-else-if="curTool === 'grimoire'">
                                    <GrimoirePanel :view="view" @seat="i => (menuSeat = i)" />
                                    <section v-if="transferCandidates.length && ['night', 'day'].includes(realPhase)" class="mt-3 flex flex-col gap-1 text-sm">
                                        <h3 class="m-0 text-sm font-semibold text-label">交接說書人（只能交給觀戰者）</h3>
                                        <select class="game-input cursor-pointer" value="" @change="e => onTransfer(e.target.value)">
                                            <option value="" disabled>選擇觀戰者…</option>
                                            <option v-for="p in transferCandidates" :key="p.id" :value="p.id">{{ p.nickname }}</option>
                                        </select>
                                    </section>
                                </template>
                                <ol v-else-if="curTool === 'log'" class="m-0 flex list-none flex-col gap-1 p-0 text-xs">
                                    <li v-for="e in [...view.log].reverse()" :key="e.id" :class="['rounded px-1 py-0.5', e.public ? 'text-label' : 'bg-neon-purple/10 text-heading']">
                                        <span class="mr-1 tabular-nums text-body">{{ formatClock(e.at) }}</span>{{ describeLog(e, logCtx) }}<span v-if="infoVerdict(e)" class="ml-1 text-lemon">（{{ infoVerdict(e) }}）</span>
                                    </li>
                                </ol>
                                <MyRoleCard v-else-if="curTool === 'me' && view.me" :view="view" />
                                <template v-else>
                                    <WhisperList :groups="view.whisperGroups" :names="names" :my-group-id="view.me?.whisperGroupId ?? null"
                                        :focus-id="focusGroupId" :now="serverNow"
                                        :member-log="role === 'storyteller' ? view.grimoire?.whisperMemberLog : null"
                                        :invites="role === 'storyteller' ? view.grimoire?.invites : null" @focus="id => (focusGroupId = id)" />
                                    <p v-if="!view.whisperGroups.length" class="m-0 text-sm text-body">目前沒有人在私聊。</p>
                                    <button v-if="view.whisperLog?.length" class="btn-ghost-sm mt-2" @click="showWhisperStats = true"><GameIcon id="stats" :size="14" /> 私聊統計（誰跟誰聊過幾次）</button>
                                </template>
                            </div>
                        </div>
                        <ChatPanel v-show="isDesktop || mobilePanel !== 'tools'" ref="chatRef" class="min-h-0 flex-1" :view="view" :my-id="myId" :fixed-tab="isDesktop ? null : mobileChatTab"
                            @public="t => chatPublic(t)" @whisper="t => whisperSend(t)" @storyteller="(t, to) => chatStoryteller(t, to)" />
                    </div>
                </div>

                <!-- 手機版底部分頁 -->
                <nav v-if="!isDesktop" class="shrink-0 grid gap-1 rounded-xl border border-border bg-card p-1" :style="{ gridTemplateColumns: `repeat(${mobileTabs.length}, minmax(0, 1fr))` }" aria-label="切換畫面">
                    <button v-for="t in mobileTabs" :key="t.key" type="button" :aria-pressed="mobilePanel === t.key"
                        :class="['relative flex flex-col items-center rounded-lg py-1 text-[11px]', mobilePanel === t.key ? 'bg-subtle text-heading' : 'text-body']"
                        @click="setMobilePanel(t.key)">
                        <GameIcon :id="t.icon" :size="18" />{{ t.label }}
                        <span v-if="t.unread" class="absolute right-2 top-0.5 rounded-full bg-ruby px-1 text-[10px] text-white">{{ t.unread }}</span>
                    </button>
                </nav>
            </template>
        </main>

        <!-- ═════ 彈窗 ═════ -->
        <PlayerMenu :seat="menuSeat" :view="view ?? emptyView" @close="menuSeat = null" @action="onMenuAction" />
        <InfoComposer :target="composer.target" :role-id="composer.roleId" :reply="composer.reply" :impaired="composer.impaired" :truth="composer.truth"
            :seats="view?.seats ?? []" :names="names" @close="composer.target = null" @send="onSendInfo" />
        <PlayerPrompt :prompt="view?.me?.prompt ?? null" :info="state.infoPopup" :seats="view?.seats ?? []" :names="names"
            @reply="(id, t) => replyPrompt(id, t)" @close-info="clearInfoPopup" />
        <WhisperInvite :invite="currentInvite" :names="names" :in-group="!!view?.me?.whisperGroupId" :now="serverNow"
            @respond="(id, ok) => whisperRespond(id, ok)" />

        <!-- 天亮前確認：列出沒做完的事，避免誤點 -->
        <CtDialog :open="showDawn && realPhase === 'night'" title="確定天亮？" @close="showDawn = false">
            <div class="flex flex-col gap-3 text-sm">
                <div v-if="dawnCheck.left.length" class="rounded-lg border border-lemon/40 bg-lemon/10 p-2">
                    <p class="m-0 mb-1 font-semibold text-lemon"><GameIcon id="warn" :size="13" /> 夜晚順序還有 {{ dawnCheck.left.length }} 項沒完成</p>
                    <ul class="m-0 pl-5 text-body"><li v-for="t in dawnCheck.left" :key="t">{{ t }}</li></ul>
                </div>
                <div v-if="dawnCheck.waiting.length" class="rounded-lg border border-lemon/40 bg-lemon/10 p-2">
                    <p class="m-0 font-semibold text-lemon"><GameIcon id="warn" :size="13" /> 還在等玩家選擇：{{ dawnCheck.waiting.join('、') }}</p>
                </div>
                <div v-if="dawnCheck.unconfirmed.length" class="rounded-lg border border-ruby/40 bg-ruby/10 p-2">
                    <p class="m-0 font-semibold text-ruby">惡魔攻擊了 {{ dawnCheck.unconfirmed.join('、') }}，但還沒「確認死亡」</p>
                    <p class="m-0 text-xs text-body">若有保護／士兵等原因不死，直接天亮即可；否則請先回夜晚順序確認死亡。</p>
                </div>
                <p class="m-0 text-heading">天亮公布死亡：<strong>{{ dawnCheck.deaths.length ? dawnCheck.deaths.join('、') : '平安夜（沒有人死亡）' }}</strong></p>
                <p class="m-0 text-xs text-body">天亮後無法回到這一夜。</p>
            </div>
            <template #footer>
                <div class="flex gap-2">
                    <button class="btn-secondary flex-1" @click="showDawn = false">回夜晚</button>
                    <button class="btn-primary flex-1" @click="doDawn">確認天亮</button>
                </div>
            </template>
        </CtDialog>

        <!-- 發角色：翻牌 -->
        <CtDialog :open="showReveal" title="你的角色" @close="showReveal = false">
            <div v-if="view?.me" class="flex flex-col items-center gap-3 py-2 text-center">
                <div class="animate-card-flip"><RoleToken :role-id="view.me.roleId" :size="96" show-name /></div>
                <p class="m-0 text-sm leading-relaxed text-body">{{ roleInfo(view.me.roleId)?.ability }}</p>
                <p class="m-0 text-xs text-body">只有你看得到。不可出示角色或截圖。</p>
            </div>
            <template #footer><button class="btn-primary btn-full" @click="showReveal = false">我記住了</button></template>
        </CtDialog>

        <!-- 系統判定勝負：說書人確認 -->
        <CtDialog :open="role === 'storyteller' && !!view?.grimoire?.pendingWinner" title="系統判定" :dismissable="false">
            <template v-if="view?.grimoire?.pendingWinner">
                <p class="m-0 text-lg text-heading"><GameIcon kind="team" :id="view.grimoire.pendingWinner.team" :size="22" />
                    <strong>{{ TEAM_NAMES[view.grimoire.pendingWinner.team] }}獲勝</strong>（{{ view.grimoire.pendingWinner.reason }}），確認？</p>
                <p v-if="view.grimoire.pendingWinner.note" class="m-0 mt-2 text-sm text-lemon"><GameIcon id="warn" :size="14" /> {{ view.grimoire.pendingWinner.note }}</p>
                <p class="m-0 mt-2 text-xs text-body">「先不要」：例如要先用「變更角色」處理紅唇女郎接手，再繼續遊戲。</p>
            </template>
            <template #footer>
                <div class="flex gap-2">
                    <button class="btn-secondary flex-1" @click="confirmWinner(false)">先不要</button>
                    <button class="btn-primary flex-1" @click="confirmWinner(true)">確認</button>
                </div>
            </template>
        </CtDialog>

        <!-- 宣告勝利（特殊勝負：聖徒被處決、鎮長勝利…） -->
        <CtDialog :open="showDeclare" title="宣告勝利" @close="showDeclare = false">
            <div class="flex flex-col gap-3">
                <div class="flex gap-2">
                    <button v-for="t in ['good', 'evil']" :key="t" type="button" :class="['flex-1', declareTeam === t ? 'btn-primary' : 'btn-secondary']" @click="declareTeam = t">
                        <GameIcon kind="team" :id="t" :size="16" /> {{ TEAM_NAMES[t] }}
                    </button>
                </div>
                <input v-model="declareReason" class="game-input" maxlength="100" placeholder="原因（例如：聖徒被處決）" />
            </div>
            <template #footer>
                <button class="btn-primary btn-full" @click="doDeclare">宣告 {{ TEAM_NAMES[declareTeam] }}獲勝</button>
            </template>
        </CtDialog>

        <CtDialog :open="showWhisperStats && !!view" title="私聊統計" wide @close="showWhisperStats = false">
            <WhisperStats v-if="view" :whisper-log="view.whisperLog ?? []" :seats="view.seats" :names="names" :day-number="view.dayNumber" :now="serverNow" />
        </CtDialog>

        <GameReplay v-if="view && phase === 'result'" :open="showReplay" :view="view" @close="showReplay = false" />

        <Transition name="toast">
            <div v-if="toast.show" :class="['toast', 'show', toast.type]">{{ toast.msg }}</div>
        </Transition>
    </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useClocktower, roleInfo } from '../composables/useClocktower.js'
import { getSavedNickname, saveNickname } from '@/shared/data/identity.js'
import RoomPlayerPanel from '@/shared/components/RoomPlayerPanel.vue'
import ConnectionBanner from '@/shared/components/ConnectionBanner.vue'
import GameIcon from '../components/GameIcon.vue'
import RoleToken from '../components/RoleToken.vue'
import TownCircle from '../components/TownCircle.vue'
import GrimoirePanel from '../components/GrimoirePanel.vue'
import NightQueue from '../components/NightQueue.vue'
import InfoComposer from '../components/InfoComposer.vue'
import PlayerPrompt from '../components/PlayerPrompt.vue'
import VotingClock from '../components/VotingClock.vue'
import WhisperList from '../components/WhisperList.vue'
import WhisperInvite from '../components/WhisperInvite.vue'
import PlayerMenu from '../components/PlayerMenu.vue'
import ChatPanel from '../components/ChatPanel.vue'
import RoleSheet from '../components/RoleSheet.vue'
import GameReplay from '../components/GameReplay.vue'
import CtDialog from '../components/CtDialog.vue'
import { ROLE_ASSETS } from '../data/assets.js'
import MyRoleCard from '../components/MyRoleCard.vue'
import WhisperStats from '../components/WhisperStats.vue'
import { DEV_BOTS, MIN_SEATS, DAY_SUB_PHASES, formatSeconds, formatClock } from '../data/constants.js'
import { TEAM_NAMES, describeLog, infoVerdict } from '../data/labels.js'
import { truthReady, truthToInfo } from '../data/truth.js'

const route = useRoute()
const router = useRouter()

const {
    state, roomState, connect,
    setStoryteller, randomStoryteller, transferStoryteller, claimSeat, swapSeats,
    setup, assignRole, startGame,
    wake, cancelPrompt, replyPrompt, actFor, sendInfo, queueDone, addReminder, removeReminder, setDead, changeRole, toDawn, endDay,
    dayPhase, nominate, startVote, vote, voteControl, confirmWinner, declareWinner, playAgain,
    chatPublic, whisperInvite, whisperRespond, whisperLeave, whisperSend, chatStoryteller,
    clearError, clearNotice, clearInfoPopup, disconnect, copyInviteLink,
    kickPlayer, transferHost, leaveRoom, upgradeFromSpectator,
} = useClocktower()

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
const emptyView = { viewer: { role: 'spectator' }, seats: [], names: {}, whisperGroups: [], log: [], nominations: {}, phase: 'lobby' }
const phase = computed(() => view.value?.phase ?? 'lobby')
const realPhase = computed(() => (phase.value === 'paused' ? view.value.pausedFrom : phase.value))
const role = computed(() => view.value?.viewer?.role ?? 'spectator')
const myId = computed(() => roomState.myPlayerId)
const names = computed(() => view.value?.names ?? {})
const roleLabel = computed(() => ({ storyteller: '說書人', player: '玩家', spectator: '觀戰' }[role.value]))
const isRoomPlayer = computed(() => roomState.players.some(p => p.id === myId.value))

const seatList = computed(() => (view.value?.seats ?? []).map(s => ({ ...s, name: names.value[s.playerId] ?? '?' })))
const lobbySeats = computed(() => (view.value?.lobbySeats ?? []).map((pid, i) => ({
    index: i, playerId: pid, empty: !pid, name: pid ? names.value[pid] ?? '?' : '', isBot: !!pid && pid.startsWith('bot-'),
    isDead: false, hasLeft: false, ghostVoteUsed: false,
})))
const seatedCount = computed(() => (view.value?.lobbySeats ?? []).filter(Boolean).length)
const mySeatLobby = computed(() => (view.value?.lobbySeats ?? []).indexOf(myId.value))

// ── 時間（以伺服器時間校正）──────────────────────────────────────
const now = ref(Date.now())
let skew = 0
let _tick = null
watch(() => view.value?.serverNow, (sn) => { if (sn) skew = sn - Date.now() }, { immediate: true })
const serverNow = computed(() => now.value + skew)
const remaining = computed(() => (view.value?.timer ? (view.value.timer.endsAt - serverNow.value) / 1000 : 0))

// 計時到 0 不自動切換，只提醒說書人（畫面閃爍 + 音效）
let _beeped = false
watch(() => view.value?.timer?.endsAt, () => { _beeped = false })
watch(remaining, (r) => {
    if (r > 0 || _beeped || !view.value?.timer || role.value !== 'storyteller') return
    _beeped = true
    beep()
    showToast('自由時間到了，請決定何時集合提名', 'info', 5000)
})
function beep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.frequency.value = 880; g.gain.value = 0.15
        o.connect(g).connect(ctx.destination)
        o.start(); o.stop(ctx.currentTime + 0.4)
    } catch { /* 瀏覽器不支援就略過 */ }
}

// ── 狀態列 ────────────────────────────────────────────────────────
const statusIcon = computed(() => (realPhase.value === 'night' ? 'night' : realPhase.value === 'day' ? (view.value?.daySubPhase === 'dawn' ? 'dawn' : 'day') : 'trophy'))
const statusLabel = computed(() => {
    const v = view.value
    if (!v) return ''
    if (phase.value === 'result') return '終局'
    if (realPhase.value === 'night') return `第 ${v.dayNumber + 1} 夜`
    return `第 ${v.dayNumber} 天・${DAY_SUB_PHASES[v.daySubPhase]?.label ?? ''}`
})
const statusHint = computed(() => {
    if (phase.value === 'paused') return '等待說書人重新連線'
    if (phase.value === 'result') return '全部角色已公開'
    if (realPhase.value === 'night') return role.value === 'storyteller' ? '依夜晚順序喚醒角色，完成後按「天亮」' : '入夜，請在 Discord 關閉麥克風'
    return DAY_SUB_PHASES[view.value?.daySubPhase]?.hint ?? ''
})

// 夜晚：玩家與觀戰者都看同一個入夜畫面；說書人看魔典
const showNightScreen = computed(() => realPhase.value === 'night' && role.value !== 'storyteller')

// 提名 / 投票標示
const pointerSeat = computed(() => view.value?.voting ? view.value.voting.order[view.value.voting.handIndex] ?? null : null)
const seatBadges = computed(() => {
    const cur = view.value?.nominations?.current
    const out = {}
    if (view.value?.nominations?.onTheBlock !== null && view.value?.nominations?.onTheBlock !== undefined) out[view.value.nominations.onTheBlock] = '將被處決'
    if (cur && cur.stage !== 'done') { out[cur.nominator] = '提名者'; out[cur.nominee] = '被提名' }
    return out
})

// ── 版面：桌機 / 手機 ─────────────────────────────────────────────
const mq = typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)') : null
const isDesktop = ref(mq?.matches ?? true)
const onMq = e => { isDesktop.value = e.matches }
const mobilePanel = ref('table')
const mobileChatTab = ref('public')
const chatRef = ref(null)
const mobileTabs = computed(() => {
    const u = chatRef.value?.unread ?? {}
    const t = [{ key: 'table', label: '圓桌', icon: 'seat' }, { key: 'public', label: '公開', icon: 'chat', unread: u.public }]
    if (role.value !== 'spectator' || phase.value === 'result') t.push({ key: 'whisper', label: '私聊', icon: 'whisper', unread: u.whisper })
    if (role.value !== 'spectator') t.push({ key: 'storyteller', label: role.value === 'storyteller' ? '私訊' : '說書人', icon: 'storyteller', unread: u.storyteller })
    t.push({ key: 'tools', label: role.value === 'storyteller' ? '魔典' : role.value === 'player' ? '我的' : '資訊', icon: role.value === 'player' ? 'roleSheet' : 'grimoire' })
    return t
})
function setMobilePanel(key) {
    mobilePanel.value = key
    if (['public', 'whisper', 'storyteller'].includes(key)) mobileChatTab.value = key
}

// 工具區分頁：說書人 = 夜晚順序 / 魔典 / 日誌 / 私聊中；玩家 = 我的角色 / 私聊中；觀戰者 = 私聊中
const toolTab = ref('me')
const toolTabs = computed(() => {
    const n = view.value?.whisperGroups?.length
    const whispers = { key: 'whispers', label: `私聊中${n ? `（${n}）` : ''}` }
    if (role.value === 'storyteller') {
        return [
            ...(realPhase.value === 'night' ? [{ key: 'queue', label: '夜晚順序' }] : []),
            { key: 'grimoire', label: '魔典' }, { key: 'log', label: '日誌' }, whispers,
        ]
    }
    return role.value === 'player' && view.value?.me ? [{ key: 'me', label: '我的角色' }, whispers] : [whispers]
})
const curTool = computed(() => (toolTabs.value.some(t => t.key === toolTab.value) ? toolTab.value : toolTabs.value[0].key))
watch([realPhase, role], () => { toolTab.value = role.value === 'storyteller' ? (realPhase.value === 'night' ? 'queue' : 'grimoire') : 'me' }, { immediate: true })
const logCtx = computed(() => ({
    seatName: i => `${i + 1}號 ${names.value[view.value?.seats?.[i]?.playerId] ?? ''}`,
    name: id => names.value[id] ?? '?',
    roleName: id => roleInfo(id)?.name ?? id ?? '（無）',
}))

// 交接說書人：觀戰者 = 房內沒入座的人
const transferCandidates = computed(() => {
    const seated = new Set((view.value?.seats ?? []).map(s => s.playerId))
    return [...roomState.players, ...roomState.spectators]
        .filter(p => p.id !== myId.value && !seated.has(p.id) && view.value?.online?.[p.id] !== false)
})
function onTransfer(id) {
    if (id && confirm(`把說書人交給 ${names.value[id] ?? '?'}？你將失去魔典。`)) transferStoryteller(id)
}

// ── 大廳 / setup 座位點擊 ─────────────────────────────────────────
const swapFrom = ref(null)
watch(phase, () => { swapFrom.value = null })
function onLobbySeat(i) {
    if (role.value === 'storyteller') {
        if (swapFrom.value === null) { swapFrom.value = i; return }
        if (swapFrom.value !== i) swapSeats(swapFrom.value, i)
        swapFrom.value = null
        return
    }
    if (!isRoomPlayer.value) return
    const pid = view.value.lobbySeats[i]
    if (pid === myId.value) claimSeat(null)
    else if (!pid) claimSeat(i)
    else showToast('這個座位已經有人了', 'error')
}
function onSetupSeat(i) {
    if (role.value !== 'storyteller') return
    onLobbySeat(i)
}

// ── 遊戲中：玩家選單 / 說書人操作 ────────────────────────────────
const menuSeat = ref(null)
const focusGroupId = ref(null)
watch(() => view.value?.whisperGroups?.map(g => g.id).join(), () => {
    if (focusGroupId.value && !view.value.whisperGroups.some(g => g.id === focusGroupId.value)) focusGroupId.value = null
})

const composer = reactive({ target: null, roleId: null, reply: null, impaired: false, truth: null })
// 從座位選單打開時也找對應的夜晚順序項目，帶入玩家的選擇與真實答案
function openComposer(e) {
    const entry = (view.value?.grimoire?.nightQueue ?? []).find(x => x.key === `${e.roleId}:${e.seat}`)
    composer.roleId = e.roleId
    composer.reply = e.reply ?? entry?.reply ?? null
    composer.truth = e.truth ?? entry?.truth ?? null
    composer.impaired = !!view.value?.grimoire?.impaired?.[e.seat]
    composer.target = e.seat
}
// 夜晚順序「照實送出」：一鍵送出系統答案並打勾
function sendTruth(e) {
    if (!truthReady(e.truth)) return
    sendInfo(e.seat, truthToInfo(e.truth, e.roleId))
    queueDone(e.key, true)
}
function onSendInfo(target, info) {
    sendInfo(target, info)
    composer.target = null
}

function onMenuAction({ type, seat, playerId, payload }) {
    const s = view.value.seats[seat]
    switch (type) {
        case 'invite': whisperInvite([playerId]); showToast('已送出私聊邀請', 'success'); break
        case 'nominate': nominate(seat); break
        case 'dead': setDead(seat, payload); break
        case 'dm':
            chatRef.value?.openThread('storyteller', playerId)
            if (!isDesktop.value) setMobilePanel('storyteller')
            break
        case 'wake': wake(seat, payload); break
        case 'info': openComposer({ seat, roleId: s.roleId === 'drunk' ? s.shownRoleId : s.roleId }); break
        case 'act-for': actFor(seat, payload); break
        case 'cancel-prompt': cancelPrompt(seat); break
        case 'hand': voteControl('hand', { seat, up: payload }); break
        case 'role': if (confirm(`把 ${seat + 1}號 的角色改成 ${roleInfo(payload)?.name ?? payload}？（寫進日誌）`)) changeRole(seat, payload); break
        case 'add-reminder': addReminder(seat, payload); break
        case 'remove-reminder': removeReminder(payload); break
    }
}

const showDawn = ref(false)
const dawnCheck = computed(() => {
    const g = view.value?.grimoire
    const seats = view.value?.seats ?? []
    const nm = i => `${i + 1}號 ${names.value[seats[i]?.playerId] ?? ''}`
    const roleName = id => roleInfo(id)?.name ?? id
    const queue = g?.nightQueue ?? []
    return {
        left: queue.filter(e => !e.done).map(e => (e.seat === null ? ROLE_ASSETS[e.roleId]?.name ?? e.roleId : `${roleName(e.roleId)}・${nm(e.seat)}`)),
        waiting: seats.filter(s => g?.prompts?.[s.playerId]).map(s => nm(s.index)),
        unconfirmed: (g?.reminders ?? []).filter(r => r.reminderId === 'imp:target' && !seats[r.seat]?.isDead).map(r => nm(r.seat)),
        deaths: seats.filter(s => s.deathPending).map(s => nm(s.index)),
    }
})
function confirmDawn() { showDawn.value = true }
function doDawn() {
    showDawn.value = false
    toDawn()
}
function confirmEndDay() {
    const block = view.value.nominations.onTheBlock
    const msg = block !== null && block !== undefined ? `結束白天：處決 ${block + 1}號 ${names.value[view.value.seats[block].playerId] ?? ''}？` : '結束白天（今天沒有人被處決）並入夜？'
    if (confirm(msg)) endDay()
}

const showDeclare = ref(false)
const declareTeam = ref('good')
const declareReason = ref('')
function doDeclare() {
    declareWinner(declareTeam.value, declareReason.value.trim() || '說書人宣告')
    showDeclare.value = false
    declareReason.value = ''
}

// ── 彈窗：發角色、邀請、終局 ──────────────────────────────────────
const showRoles = ref(false)
const showReplay = ref(false)
const showWhisperStats = ref(false)
const showReveal = ref(false)
watch(() => [view.value?.gameNo, phase.value], ([no, p], old) => {
    if (p === 'night' && view.value?.me && old && old[1] === 'setup') showReveal.value = true
})
watch(phase, p => {
    if (p === 'result') showReplay.value = false
    if (p !== 'night' && p !== 'day') menuSeat.value = null
})
const currentInvite = computed(() => (view.value?.me?.invites ?? []).find(inv => inv.expiresAt > serverNow.value) ?? null)

// ── 通知 / 錯誤 ───────────────────────────────────────────────────
watch(() => state.notice, (msg) => { if (msg) { showToast(msg, 'info', 4500); clearNotice() } })
watch(() => state.error, (msg) => { if (msg && roomState.room) { showToast(msg, 'error'); clearError() } })
watch(() => state.invitePing, () => { if (navigator.vibrate) navigator.vibrate(80) })
watch(() => view.value?.me?.prompt?.id, (id) => { if (id && navigator.vibrate) navigator.vibrate(120) })

function handleCopyLink() {
    copyInviteLink()
    showToast('邀請連結已複製', 'success')
}

// ── 離開 ──────────────────────────────────────────────────────────
function goLobby() {
    disconnect()
    router.push({ name: 'clocktower' })
}
async function goHome() {
    const p = phase.value
    let msg = '確定要離開房間嗎？離開後再進來會是全新的人。'
    if (role.value === 'storyteller' && !['lobby', 'result'].includes(p)) msg = '你是說書人，離開會中止本局。確定要離開嗎？'
    else if (role.value === 'player' && ['night', 'day', 'paused'].includes(p)) msg = '遊戲進行中離開，你的座位會標示「已離開」（視同死亡），而且無法接回原本的角色，再進來會是全新的人。確定嗎？'
    if (!confirm(msg)) return
    await leaveRoom()
    goLobby()
}

// ── 初始化 ────────────────────────────────────────────────────────
onMounted(() => {
    _tick = setInterval(() => { now.value = Date.now() }, 500)
    mq?.addEventListener('change', onMq)

    const roomId = (route.query.id || '').toUpperCase()
    const nickname = route.query.nickname?.trim() || getSavedNickname()
    const isCreating = route.query.create === '1'
    const seats = parseInt(route.query.seats) || 10

    if (!roomId) { router.push({ name: 'clocktower' }); return }
    if (!nickname) {
        showNicknameOverlay.value = true
        nextTick(() => overlayInputRef.value?.focus())
        return
    }
    // 建立房間後立刻把 create=1 從網址移除，避免 F5 重整時重建
    if (isCreating) router.replace({ name: 'clocktower-room', query: { id: roomId, nickname } })
    connect(roomId, nickname, isCreating, seats)
})

onUnmounted(() => {
    clearInterval(_tick)
    clearTimeout(_toastTimer)
    mq?.removeEventListener('change', onMq)
    disconnect() // 瀏覽器返回鍵離開頁面時也要斷線，避免留下幽靈在線玩家
})
</script>
