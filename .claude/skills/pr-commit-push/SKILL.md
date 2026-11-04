---
name: pr-commit-push
description: 同步遠端最新、rebase、把目前所有修改合成一個 commit、push 並用 gh 開 PR。使用者說「commit 並開 PR」「push 並開 PR」「pr-commit-push」「送 PR」「提交推送」時使用。
---

# Fetch → Rebase → 單一 Commit → Push → 開 PR

專案的 git repo 在 `DDgame/`（上層 `DD/` 不是 repo），所有 git 指令都在 `DDgame/` 下執行。
預設分支是 `main`，PR 的 base 預設為 `main`。

## 前置檢查

```bash
cd DDgame
git branch --show-current
git status --short
gh auth status
```

- 目前在 `main`（或 base 分支）→ 先請使用者確認新分支名稱再 `git switch -c`，**不要直接在 main 上 commit**。
- 分支命名沿用現有慣例：`feat/…`、`fix/…`、`refactor/…`、`docs/…`。
- 沒有任何修改且沒有領先 base 的 commit → 告知使用者沒東西可送，結束。

## Step 1：檢查遠端有沒有別人的更新

```bash
git fetch origin --prune
git log --oneline HEAD..origin/main            # base 上別人新增的
git log --oneline HEAD..origin/<branch>        # 同名遠端分支上別人新增的（分支已存在於遠端時）
```

回報結果：base 與遠端分支各新增幾個 commit（列出 SHA 與標題）。兩者都沒有新增 → 可跳過 Step 2。

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

## Step 4：產生單一 Commit

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
- 不使用 `--force`、`--no-verify`、`git reset --hard`、`git clean` 等會丟失工作的指令（除非使用者明確要求）。
- 不修改 git config。
- Step 3 的確認之前不 commit、不 push。
