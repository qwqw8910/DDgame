---
name: pr-commit-push
description: 同步遠端最新、rebase、把目前所有修改合成一個 commit（分支上可累積多個 commit）、push 並用 gh 開 PR。使用者說「commit 並開 PR」「push 並開 PR」「pr-commit-push」「送 PR」「提交推送」時使用。
---

# Fetch → Rebase → Commit → Push → 開 PR

專案的 git repo 在 `DDgame/`（上層 `DD/` 不是 repo），所有 git 指令都在 `DDgame/` 下執行。
預設分支是 `main`，PR 的 base 預設為 `main`。

## 使用者補充說明（呼叫時附帶的參數）

使用者可在 `/pr-commit-push` 後面接文字，例如 `/pr-commit-push 修 PWA 快取問題，分支用 fix/pwa-cache`。有附帶文字時，依下列規則採用，**沒寫的部分照原流程**：

- 指定分支名 → 直接採用，不再詢問分支名。
- 指定 commit 標題、PR 重點或背景 → 以此為準撰寫 commit message 與 PR 內文。
- 指定範圍（如「只 commit 這幾個檔案」）→ 只 `git add` 該範圍，其餘修改留在工作目錄並於回報中說明。
- 「只 commit」「不要開 PR」→ 跳過 Step 6；「不要 push」→ 跳過 Step 5 與 Step 6。
- 附帶文字與鐵則衝突（如要求在 `main` 上直接 commit、跳過 rebase）→ 不照做，說明原因。
- Step 3 的計畫確認仍然保留，除非使用者明確寫「不用確認」「直接送」。

## 鐵則：一個功能分支 = 一個 PR = 一次 merge

GitHub 設定為 Allow merge commits，歷史圖靠下列規則保持乾淨，**必須絕對遵守**：

- 一個功能一條分支、一個 PR；新功能一律開新分支、開新 PR，**不在舊功能分支上疊新功能**。
- 新分支一律從最新的 `origin/main` 切出。
- 每次開 PR／更新 PR 前**一定要先 rebase** 到最新的 `origin/main`，不可跳過。
- 分支上只能有線性的 commit，**禁止在本地 `git merge`**（含 `git pull` 的 merge 行為；同步一律用 `git fetch` + `git rebase`）。merge commit 只由 GitHub 合併 PR 時產生。
- 不直接在 `main` 上 commit／push。

## 前置檢查

```bash
cd DDgame
git fetch origin --prune
git branch --show-current
git status --short
gh auth status
```

- `gh auth status` 的帳號必須有此 repo 權限；失敗或之後 `gh pr create` 被拒時，回報原因並提供 `https://github.com/<owner>/<repo>/pull/new/<branch>` 網頁連結，不自行切換帳號。
- 沒有任何修改且沒有領先 `origin/main` 的 commit → 告知使用者沒東西可送，結束。

### 判斷目前所在分支

| 情況 | 處理 |
| --- | --- |
| 在 `main`（或其他 base 分支） | 走下方「從 main 建立功能分支」 |
| 在功能分支，且其 PR 已合併（`gh pr list --head <branch> --state merged` 有結果，或 `git branch --merged origin/main` 含此分支） | 視同在 main：這條分支已用完，新修改要走「從 main 建立功能分支」 |
| 在功能分支，已有 **open** PR，且本次修改屬於同一功能 | 沿用此分支，繼續 Step 1 |
| 在功能分支，但本次修改是**另一個功能** | 停下來問使用者；預設做法是切到新分支（見下），不要疊在這條分支上 |

### 從 main 建立功能分支

在 `main` 上有未提交修改時，**先看修改內容，再決定分支，最後才 commit**：

1. `git status --short`、`git diff --stat`、`git diff`：讀懂這次修改在做什麼。
2. 依內容擬分支名與類型，向使用者確認。命名沿用慣例：`feat/…`、`fix/…`、`refactor/…`、`docs/…`、`chore/…`，英文小寫以連字號分隔，如 `feat/gem-td-mastery-ui-polish`。
3. 本地 `main` 落後時不要 merge，直接以 `origin/main` 為起點切分支，未提交修改會一起帶過去：

   ```bash
   git switch -c <type>/<name> origin/main
   ```

   若切換因修改與 `origin/main` 衝突而失敗，改用 `git stash push -u` → `git switch -c <type>/<name> origin/main` → `git stash pop`。
4. 確認 `git branch --show-current` 已是新分支、`git status --short` 修改都還在，才進入 Step 1。**到此為止尚未 commit。**

## Step 1：檢查遠端有沒有別人的更新

```bash
git fetch origin --prune
git log --oneline HEAD..origin/main            # base 上別人新增的
git log --oneline HEAD..origin/<branch>        # 同名遠端分支上別人新增的（分支已存在於遠端時）
```

回報結果：base 與遠端分支各新增幾個 commit（列出 SHA 與標題）。用 `git merge-base --is-ancestor origin/main HEAD` 確認分支是否已包含最新 `origin/main`；已包含且遠端分支沒有他人新 commit 時，Step 2 的 rebase 為空操作，確認後即可略過指令，但**結論要在回報中寫明**。

## Step 2：Rebase 到最新

rebase 需要乾淨的工作目錄，有未提交修改時先暫存：

```bash
git stash push -u -m "pr-commit-push"          # 有未提交修改才做
git rebase origin/<branch>                     # 先吸收同名遠端分支上別人的 commit（若有）
git rebase origin/main
git stash pop                                  # 還原修改
```

- 遠端分支上有別人的 commit 時，**必須**先 rebase 到 `origin/<branch>`，否則之後 push 會蓋掉別人的工作。
- 發生衝突：列出衝突檔案，逐一讀內容解決並 `git add` + `git rebase --continue`；無法判斷哪邊正確時**停下來問使用者**，不要自行選邊。
- 若要放棄：`git rebase --abort`（並 `git stash pop` 還原），向使用者說明原因。
- `stash pop` 衝突時同樣處理，保留 stash 直到確認修改都回來了。

## Step 3：檢視並確認 commit 內容

```bash
git status --short
git diff --stat
git diff                                       # 重點檔案讀完整 diff
```

- 依 diff 理解整體變更，作為 commit message 依據。
- **不要加入**：`.env*`、金鑰／token、`node_modules/`、`.vite/`、建置產物、暫存檔（如 `pr.md`）。發現疑似機密時停下來問使用者。
- 若含明顯無關的修改（與本次主題不同的功能），提醒使用者是否拆成另一個 PR。

輸出計畫並**等使用者確認再繼續**：

```markdown
**分支**：feat/xxx → main
**Commit**：feat(scope): 標題
**檔案**（N 個）：path/a, path/b …
```

## Step 4：產生 Commit

- **每次執行只產生一個 commit，包含當下所有未提交的修改**（不拆成多個）。
- 分支上累積多個 commit 是允許的：第一次送 PR 時是一個 commit；之後同一功能再有修改，再執行一次就是在同分支新增一個 commit，**不要 amend、不要 squash**，push 時用一般 `git push` 即可。
- 使用明確路徑 `git add <paths>`，不要 `git add -A` / `git add .`（避免誤加機密與暫存檔）。
- Message 格式沿用專案慣例（Conventional Commits，scope 為模組名，標題與內文用繁體中文）：

```
<type>(<scope>): <繁中標題，不加句號>

<繁中內文：說明做了什麼與為什麼，必要時條列>

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
```

- type：`feat` / `fix` / `refactor` / `docs` / `test` / `chore` / `perf`。
- scope 參考既有紀錄：`gem-td`、`same-word`、`character-storm`、`pwa`、`clocktower` 等；跨多模組或無明確模組可省略 scope。
- 用 heredoc 傳 message，commit 後 `git log --oneline -1` 確認。
- pre-commit hook 失敗 → 修正問題後重新 commit，**不要** `--no-verify`。

## Step 5：Push

```bash
git push -u origin <branch>                    # 首次 push
git push --force-with-lease origin <branch>    # 已 push 過且 Step 2 有 rebase 改寫歷史時
```

- 只用 `--force-with-lease`，**禁止** `--force`；**禁止** force push 到 `main`。
- 被 lease 拒絕代表遠端又有新 commit：回到 Step 1 重新抓取、rebase。

## Step 6：開 PR

先確認該分支是否已有 PR：`gh pr view --json url,state 2>/dev/null`。已有就只更新（push 即可），回報既有 PR 連結。

沒有則建立，body 用 heredoc：

```bash
gh pr create --base main --head <branch> --title "<type>(<scope>): <標題>" --body "$(cat <<'EOF'
## 摘要
- 一到三點，說明這個 PR 做了什麼、為什麼

## 變更內容
- 依模組列出主要改動（檔案或功能層級）

## 測試
- [ ] 單元／整合測試（寫明跑了哪些指令與結果，沒跑就寫沒跑）
- [ ] 瀏覽器手動驗證（做過才勾，沒做明說）

## 備註
- 風險、需 reviewer 特別看的地方、後續待辦（沒有就省略此節）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- PR 標題與 commit 標題一致。
- 「測試」欄只寫實際做過的事，不要虛報。
- 完成後回報：PR 連結、分支、commit SHA、rebase 時吸收了幾個別人的 commit。

## 禁止事項

- 不在 `main` 直接 commit／push。
- 不在本地 `git merge` 或 `git pull`（會產生 merge commit）；同步只用 `fetch` + `rebase`。
- 不在已合併或屬於其他功能的分支上疊新 commit；新功能一律新分支、新 PR。
- 開 PR 前沒有 rebase 到最新 `origin/main` 就不能 push／開 PR。
- 不使用 `--force`、`--no-verify`、`git reset --hard`、`git clean` 等會丟失工作的指令（除非使用者明確要求）。
- 不修改 git config。
- Step 3 的確認之前不 commit、不 push。
