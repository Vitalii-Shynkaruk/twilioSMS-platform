# SCL Capital — M1/M2 Remediation Checklist

> Источник: сообщение JobStarLab от 28.04.2026 + текущие M1/M2 handoff/checklist документы.
> Цель: закрыть все замечания клиента на 100%, фиксировать прогресс после каждого изменения, не терять evidence.
> Статус: 🟡 В работе

---

## Правила выполнения

- [x] После каждой правки обновлять этот checklist: статус, дата, commit SHA, проверка, evidence.
- [x] Любой production fix сначала переносить в локальный repo и коммитить в `ksanyok/twilio-sms-platform`.
- [x] Production должен деплоиться только из зафиксированного commit SHA.
- [ ] Не использовать токены, вставленные в чат. Текущий GitHub token считать скомпрометированным: отозвать и выдать новый минимальный token перед работой с чужим repo.
- [x] Не коммитить `.env`, токены, prod dumps, временные scripts, логи, screenshots с секретами.
- [ ] Для repo `fawzi-barakat00728/Twilio-Project-For-Finanical-Company` не пушить историю с author/committer `ksanyok`; использовать sanitized export или rewritten mirror.
- [x] Перед каждым push проверять `git status --short`, `git log -1 --format=fuller`, `git remote -v`.
- [ ] После каждого deploy проверять app как пользователь: UI, API, logs, regression.

---

## 0. Source-of-Truth и evidence setup

- [x] Зафиксировать текущий локальный SHA ветки `deploy/mysql-hosting`.
- [x] Зафиксировать текущий production SHA и `pm2 status`.
- [x] Зафиксировать `NODE_ENV`, `CLIENT_URL`, `WEBHOOK_BASE_URL`.
- [x] Сохранить список production modified/untracked files до cleanup.
- [x] Сохранить список файлов `/opt/sms-platform/server` до cleanup.
- [x] Сохранить текущий список regression tests, которые есть локально и на production.
- [ ] Создать evidence folder/notes для M1/M2 cleanup без секретов.

Evidence:

- Local SHA: `2d53102` before CTA evidence script commit; CTA code fix is in `45e56b9`; CTA evidence script commit is `49374b9`.
- Production SHA: `/opt/sms-platform` currently `main` at `3b8c055`, remote `Jbaker-SCL/scl-platform`.
- Production PM2: `sms-api` online; 87 dirty/untracked git status lines captured before cleanup.
- Production env markers: `.env` has `NODE_ENV=production`; `CLIENT_URL` and `WEBHOOK_BASE_URL` are set; PM2 env has `NODE_ENV=production`.
- Production frontend: Nginx serves `/opt/sms-platform/client/dist`; static dist backup created at `/tmp/scl-client-dist-20260428143951.tgz` before CTA static deploy.
- Production `/server` root inventory before cleanup: 27 candidate debug/check/backfill/root scripts captured.
- Evidence path: this checklist + `scripts/check-funding-link-cta.mjs`.
- Regression test inventory captured: local `server/tests` plus SHA-matching production DB-free regression tests.
- `.gitignore` updated to keep runtime `exports/` and `ecosystem.config.js` out of Git tracking.
- Tracked export CSV files removed from Git index with `git rm --cached`; production exports are preserved in place and excluded from deploy cleanup.

---

## 1. M1 — Production mode

Клиент: PASS, но нужно сохранить доказательство.

- [x] Проверить `/opt/sms-platform/server/.env`: `NODE_ENV=production`.
- [x] Проверить `pm2 show sms-api` / `pm2 env`: процесс online и env production.
- [x] Проверить API health на `https://app.sclcapital.io/api/health`.
- [x] Проверить отсутствие dev stack traces на ошибочном API request.
- [x] Занести evidence в checklist.

Acceptance:

- [x] `NODE_ENV=production` подтверждено.
- [x] `sms-api` online.
- [x] Health endpoint отвечает 200.
- [x] Ошибки API не раскрывают stack trace.

Evidence:

- `.env`: `NODE_ENV=production`; `CLIENT_URL`/`WEBHOOK_BASE_URL` set without printing values.
- PM2 env: `NODE_ENV=production`; PM2 status: `sms-api` online.
- `https://app.sclcapital.io/api/health` returns `200`.
- `GET /api/inbox` without auth returns `401 {"error":"Authentication required"}`; stack markers found: `0`.

---

## 2. M1 — Clean `/server` root

Клиент указал fail: в `/opt/sms-platform/server/` остались debug/check scripts.

### 2.1 Inventory

- [x] Найти все `.bak`, `.new`, `.tmp`, debug/check/test scripts в `/opt/sms-platform/server`.
- [x] Сверить список клиента:
  - [x] `wayne.js`
  - [x] `check3.js`
  - [x] `check_alerts.js`
  - [x] `check_camp.js`
  - [x] `check_hammad_filter.js`
  - [x] `check_more.js`
  - [x] `check_retarget.js`
  - [x] `check_two.js`
  - [x] `check_unreads.js`
  - [x] `debug_filter.js`
  - [x] `find_replies.js`
  - [x] `reclass.js`
  - [x] `rescore.js`
  - [x] `scan_lost.js`
  - [x] `sync_lead_assigned.js`
  - [x] `test_inbox.js`
  - [x] `twstat.js`
  - [x] `verify_reply.js`
  - [x] `backfill_assigned_rep.js`
  - [x] `backfill_lost_unread.js`
  - [x] `backfill_tmp.js`

Additional files found in `/opt/sms-platform/server` root before cleanup:

- `audit.js`, `ecosystem.config.js`, `revive_bucket_jb.js`, `revive_check_jb.js`, `revive_count_compare.js`, `vitest.config.ts`.

### 2.2 Decision

- [x] Для каждого файла определить: удалить, перенести в repo `server/scripts`, перенести в archive, оставить как required.
- [x] Если файл содержит полезную логику/backfill — сначала перенести в GitHub с нормальным именем и документацией.
- [x] Если файл одноразовый/debug — удалить с production.

Decision notes:

- Backfill/cleanup scripts already present locally and SHA-matching production: `scripts/backfill_reply_attribution.js`, `server/scripts/backfill642.ts`, `server/scripts/retroactive-closed-task-cleanup.ts`.
- Root debug/check scripts should be removed from production after backup because they are one-off operational files in `server/` root, not application runtime code.
- Keep required config files only if they are part of deployment process (`ecosystem.config.js` needs explicit decision because production has both root and `server/` copies).
- Production `server/ecosystem.config.js` contains plaintext environment secrets; do not transfer to GitHub. Archive and remove from repo working tree, then rely on `.env`/PM2 env for runtime.

### 2.3 Cleanup

- [x] Удалить junk из `/opt/sms-platform/server` root.
- [x] Проверить, что production server root не содержит `.bak`, `.new`, debug/check/test scripts.
- [x] Проверить, что приложение после cleanup работает.

Evidence:

- Production backup before cleanup/deploy: `/root/scl-prod-backups/20260428152107`.
- Source cleanup deployed from committed SHA `d5127a7` using shallow clone + `rsync --delete` with explicit excludes for `.env`, `exports/`, `node_modules/`, logs, and current build outputs.
- Post-cleanup root candidate count: `0` debug/check/backfill/root config files in `/opt/sms-platform/server`.
- Production export files preserved: `exports_count=1` after cleanup.
- PM2 `sms-api` online after restart; health endpoint returned `200` with database/redis ok.

Acceptance:

- [x] `/opt/sms-platform/server` root clean.
- [x] Никаких debug/check/test scripts в server root.
- [x] Никаких `.bak`/`.new` files.
- [x] PM2/API после cleanup stable.

---

## 3. M1 — Production git clean + GitHub-as-truth

Клиент указал fail: 32 modified и 50+ untracked на production.

### 3.1 Audit prod git state

- [x] Выполнить `git status --short` на production.
- [x] Сохранить список modified files.
- [x] Сохранить список untracked files.
- [x] Разделить файлы на категории:
  - [x] source code changes
  - [x] tests
  - [x] generated build output
  - [x] logs/temp/debug
  - [x] secrets/config
  - [x] DB/backfill scripts

Evidence:

- Production repo: `/opt/sms-platform`, branch `main`, SHA `3b8c055`, remote `https://github.com/Jbaker-SCL/scl-platform.git`.
- `git status --short` before cleanup: `32` modified, `55` untracked, `87` total.
- Modified source/test areas include `client/src/**`, `server/src/**`, `server/prisma/schema.prisma`, `server/package*.json`, `server/tests/api.test.ts`, `server/tests/compliance.test.ts`.
- Untracked areas include root/server debug scripts, `server/src/realtime`, new services/jobs/webhook utilities, and multiple `server/tests/*.test.ts`.
- SHA compare: 25/32 modified production files match local GitHub exactly.
- SHA compare: key untracked source/test/realtime files match local GitHub exactly, including `server/src/realtime/socket.ts` and DB-free regression tests.
- `exports/` is production data/export output; preserve in place and ignore via `.gitignore` rather than deleting.
- Existing tracked `exports/**` files removed from source control; production export data preserved by deploy excludes.
- Remaining 7 modified mismatches are production stale vs local GitHub: `client/src/pages/CampaignDetailPage.tsx`, `client/src/pages/CampaignsPage.tsx`, `client/src/services/api.ts`, `client/src/types/index.ts`, `server/src/controllers/inboxController.ts`, `server/src/index.ts`, `server/src/services/aiService.ts`.
- Local GitHub contains newer fixes in those 7 files: responsive campaign UI/actions, AI types/feedback API, Inbox AI priority/rep stats/ownership/unread fixes, Socket.IO ownership guard, and HOT classification trigger expansion.

### 3.2 Bring prod changes into local GitHub repo

- [x] Для каждого production source change проверить diff.
- [x] Нужные изменения перенести локально.
- [x] Нужные tests перенести локально.
- [x] Generated/temp/log/secrets не переносить.
- [x] Собрать feature-wise commits в локальном repo.
- [x] Push в `ksanyok/twilio-sms-platform`.

### 3.3 Clean production

- [x] После push/deploy production должен совпадать с GitHub SHA.
- [x] Удалить untracked junk с production.
- [x] Проверить `git status --short` на production: clean.
- [x] Зафиксировать deployed commit SHA.

Evidence:

- Production source HEAD after cleanup/deploy: `d5127a7` on `deploy/mysql-hosting`.
- Production `git status --short` after cleanup: clean output.
- Production remote updated to `https://github.com/ksanyok/twilio-sms-platform.git`.
- Production build after deploy: `npm --prefix server run build` pass; `npm --prefix client run build` pass with known CSS warning `.light .bg-dark-800.border*`.
- Production frontend bundle marker check: `assets/InboxPageV2-B8OVM6yR.js`, `suggest-cta-btn=yes`, Gmail URL marker yes, `subject/body` markers absent.

Acceptance:

- [x] Все нужные prod-only changes есть в GitHub.
- [x] Production working tree clean.
- [x] Нет direct prod edits вне GitHub.
- [x] Есть release SHA и smoke evidence.

---

## 4. M1 — Regression tests + CI proof

Клиент указал fail: tests есть на server, но не в GitHub, CI не запускался.

### 4.1 Test inventory

- [x] Сверить production-only tests: `envValidation.test.ts`, `twilioSignatureValidation.test.ts`, `inboundParsing.test.ts`, и остальные.
- [x] Сверить локальные `server/tests`.
- [x] Нужные production-only tests перенести в repo.
- [x] Удалить дубли и устаревшие tests.

Evidence:

- Production regression tests checked against local GitHub by SHA; key DB-free tests already match local repo.
- Current DB-dependent tests identified separately: `api.test.ts`, `auth.test.ts`, `numberService.test.ts`, `compliance.test.ts`.

### 4.2 Local test pass

- [x] `server npm run build`.
- [x] DB-free regression suite pass.
- [ ] DB-dependent tests: либо pass на test DB, либо documented skip с причиной.
- [x] `client npm run build`.

Evidence:

- `server npm run build`: pass.
- DB-free backend suite: 13 files passed, 45 tests passed.
- DB-free command: `npm --prefix server run test -- --run tests/inboundPhoneSuppression.test.ts tests/aiClassificationEligibility.test.ts tests/retargetSuppression.test.ts tests/quietHoursWindow.test.ts tests/complianceKeywordParser.test.ts tests/inboundParsing.test.ts tests/aiServiceComplianceScoring.test.ts tests/promptVersion.test.ts tests/sendingUrlBuilder.test.ts tests/outboundMessageGuard.test.ts tests/twilioSignatureValidation.test.ts tests/envValidation.test.ts tests/featureFlags.test.ts`.
- `client npm run build`: pass; existing CSS warning remains for `.light .bg-dark-800.border*`.
- Production build after source deploy: server build pass, client build pass with the same known CSS warning.

### 4.3 CI

- [x] Проверить наличие GitHub Actions workflow.
- [x] Если workflow нет — добавить минимальный CI: install, server build, client build, DB-free tests.
- [x] Запустить CI в GitHub.
- [x] Сохранить link/status CI run.

Evidence:

- Existing workflow: `.github/workflows/ci.yml`.
- Workflow now triggers on `deploy/mysql-hosting` push/PR, not only `main/develop`.
- CI explicitly runs server/client TypeScript checks and server/client builds; test job runs full Vitest suite against MySQL/Redis services.
- GitHub Actions run `25061991344` for commit `2eecd0b`: success.
- Run URL: `https://github.com/ksanyok/twilio-sms-platform/actions/runs/25061991344`.
- Jobs passed: `lint-and-typecheck`, `test`, `build`.
- Non-blocking annotation: GitHub warns Node.js 20 actions runtime will be deprecated in 2026.

Acceptance:

- [x] Все нужные tests в GitHub.
- [x] Local regression pass.
- [x] CI run green или documented blocker.
- [ ] Клиенту можно показать CI evidence.

---

## 5. M1 — Secrets audit

Клиент: unverifiable until commits happen.

- [x] Проверить committed files на secrets: `.env`, Twilio SID/token, Anthropic/OpenAI keys, DB URL, GitHub token.
- [ ] Проверить git history последних commits на случайное попадание secrets.
- [x] Проверить production-only files перед переносом в repo.
- [x] Добавить/обновить `.gitignore`, если надо.
- [ ] Если token попал в публичный канал — revoke/rotate.

Acceptance:

- [x] No secrets in committed files.
- [x] No secrets in staged diffs.
- [x] Sensitive prod values только в env/settings.
- [ ] Chat-exposed GitHub token revoked/replaced.

Evidence:

- Production-only `server/ecosystem.config.js` inspected and classified as secrets-bearing config; it must be archived/removed, not committed.
- `.gitignore` now covers `exports/` and `ecosystem.config.js`.
- Staged diffs contain ignore/checklist changes only, no secret values.
- Hardcoded admin credentials removed from committed API/browser audit scripts; scripts now require `SCL_ADMIN_EMAIL` and `SCL_ADMIN_PASSWORD`.
- Hardcoded Twilio auth tokens removed from 10DLC/A2P scripts; scripts now require `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`.
- Hardcoded platform JWT cookie removed from `scripts/fix_10dlc.py`; script now requires `SCL_PLATFORM_TOKEN`.
- Targeted grep no longer finds real hardcoded production password/Twilio token/JWT cookie patterns in `scripts/`.
- Syntax checks passed: `node --check` for changed JS/MJS scripts; Python `py_compile` for changed Python scripts.
- Pending: previously exposed tokens/passwords must still be rotated/revoked; history sanitation is required before client target repo mirror.

---

## 6. M1 — Demo/sign-off pack for JB

Клиент указал not delivered.

- [ ] Подготовить demo checklist: clean repo, clean prod, tests, CI, smoke.
- [ ] Подготовить команды/evidence без секретов.
- [ ] Провести walkthrough с JB или записать короткий evidence report.
- [ ] Зафиксировать дату/результат demo.

Acceptance:

- [ ] JB видит clean production `git status`.
- [ ] JB видит GitHub commits/tests/CI.
- [ ] JB видит production mode + PM2 online.
- [ ] JB видит no debug scripts in server root.

---

## 7. M2 — Follow-up schema on Conversation

Клиент просит schema:
`followup_time`, `followup_reason`, `followup_set_by`, `followup_set_at`, `followup_status` (`scheduled`, `due_now`, `completed`, `cleared`).

### 7.1 Decision / mapping

- [ ] Решить: добавляем новые DB columns с snake_case или маппим Prisma camelCase на snake_case.
- [ ] Сверить текущие поля: `nextFollowupAt`, `followupState`.
- [ ] Решить backward compatibility: как мигрировать existing `nextFollowupAt/followupState`.
- [ ] Решить semantics:
  - [ ] `scheduled` — future follow-up exists.
  - [ ] `due_now` — follow-up time <= now.
  - [ ] `completed` — rep completed follow-up action.
  - [ ] `cleared` — follow-up manually cleared/cancelled.

### 7.2 Backend

- [ ] Обновить `server/prisma/schema.prisma`.
- [ ] Создать migration или safe `db push` plan.
- [ ] Обновить `InboxController.updateStatus`.
- [ ] Обновить follow-up cron.
- [ ] Обновить conversation audit trail.
- [ ] Обновить API response DTO.
- [ ] Обновить validation schema.

### 7.3 Frontend

- [ ] Обновить `Conversation` type.
- [ ] Обновить Follow-Up popover.
- [ ] Обновить Alerts/AI State/right panel.
- [ ] Проверить отображение scheduled/due/completed/cleared.

### 7.4 Tests

- [ ] Unit test: schedule future -> `scheduled`.
- [ ] Unit test: cron promotes due -> `due_now`.
- [ ] Unit test: complete follow-up -> `completed`.
- [ ] Unit test: clear follow-up -> `cleared`.
- [ ] Regression: owner action reclassification still fires.

Acceptance:

- [ ] Conversation stores all requested follow-up fields.
- [ ] Status transitions correct.
- [ ] Audit trail records who/when/old/new.
- [ ] UI and API agree.

---

## 8. M2 — AI follow-up suggestion logic

Клиент просит output classifier, stored on conversation:

- HOT same-day urgency -> 2 hours from now.
- HOT regular -> tomorrow 9 AM.
- WARM -> next morning or 24 hrs.
- SENSITIVE -> next week, soft window.
- NURTURE -> 3 days.
- Reason auto-generated from extracted signals.

### 8.1 Spec alignment

- [ ] Решить classification model для `SENSITIVE`: отдельная classification или `conversationState`.
- [ ] Обновить locked prompt/spec или добавить deterministic normalizer после AI output.
- [ ] Решить timezone/business-hour behavior для `tomorrow morning 9 AM`, `next morning`, `next week`.
- [ ] Решить storage: `aiSignals.suggestedFollowupTime/Reason` и/или Conversation follow-up fields.

### 8.2 Backend implementation

- [ ] Обновить `AIService.classifyInbound` follow-up normalizer.
- [ ] Убрать fallback `30 minutes`, заменить на client rules.
- [ ] HOT urgency detector: `today`, `now`, `ASAP`, `right away`, same-day words.
- [ ] HOT regular: next business day 9 AM.
- [ ] WARM: next morning or +24h.
- [ ] SENSITIVE: next week soft window.
- [ ] NURTURE: +3 days.
- [ ] Reason builder from extracted signals.
- [ ] Persist result on conversation.

### 8.3 Tests

- [ ] HOT + `today` -> +2h.
- [ ] HOT regular -> tomorrow 9 AM.
- [ ] WARM -> next morning/+24h.
- [ ] SENSITIVE -> next week.
- [ ] NURTURE -> +3 days.
- [ ] Reason includes relevant signal.
- [ ] Null/invalid AI output still normalizes correctly.

Acceptance:

- [ ] Every requested bucket produces expected follow-up suggestion.
- [ ] Reason text is clear and signal-based.
- [ ] Suggestions persist in DB and API.
- [ ] UI reads the persisted suggestion.

---

## 9. M2 — Live demo: inbound -> classification/chips/DB

Клиент просит: send test inbound, JB watches classification + chips populate live in DB.

- [ ] Подготовить safe test lead/number.
- [ ] Подготовить inbound SMS script/manual Twilio test.
- [ ] Открыть Inbox UI as JB.
- [ ] Открыть DB read-only query для conversation.
- [ ] Отправить test inbound.
- [ ] Проверить classification update < target time.
- [ ] Проверить chips in inbox card/thread.
- [ ] Проверить DB fields: classification, signals, suggestions, follow-up time/reason.
- [ ] Проверить socket/live update без refresh.
- [ ] Сохранить demo evidence.

Acceptance:

- [ ] JB can watch live classification.
- [ ] Chips populate live.
- [ ] DB fields populate live.
- [ ] No manual refresh required, unless documented.

---

## 10. M2 — Sound system: slim to two sounds + mute

Клиент просит: only HOT alert 3-pulse and New reply two-tone, plus mute.

### 10.1 Implementation check

- [ ] Найти все current sound triggers.
- [ ] Удалить/отключить лишние demo/test sounds.
- [ ] HOT alert: 3-pulse only.
- [ ] New reply: two-tone only.
- [ ] Mute toggle persists and blocks both sounds.
- [ ] Visual toasts still work when muted.

### 10.2 Tests

- [ ] HOT inbound as assigned rep -> HOT sound plays.
- [ ] HOT inbound as non-owner -> no unauthorized sound if scope requires.
- [ ] New reply -> two-tone plays.
- [ ] Mute on -> no sound, toast still appears.
- [ ] Mute off -> sound resumes.

Acceptance:

- [ ] Exactly two sound types exist.
- [ ] No old sound test row or extra sounds in user-facing UI.
- [ ] Mute behavior correct.

---

## 11. M2/M3 — Suggestion CTA: Send Funding Link

Клиент: `I am not seeing that this feature "send funding link" is working`.

### 11.1 Requirement restatement

- [x] CTA visible inside AI suggestion card.
- [x] If lead email exists: CTA is clickable.
- [x] Click opens PMF Gmail compose in new tab.
- [x] URL format exactly: `https://mail.google.com/mail/?view=cm&fs=1&to={email}`.
- [x] `To` field pre-populated with lead email.
- [x] No subject/body generated by SCL.
- [x] Rep selects Gmail template in PMF Gmail.
- [x] SCL never builds/stores/sends emails.
- [x] If no email: CTA visible but disabled/not clickable.

### 11.2 Current bug investigation

- [x] Check current `AISuggestions.tsx` after user/formatter changes.
- [x] Check current `InboxPageV2.tsx` after user/formatter changes.
- [x] Confirm CTA button is rendered, not plain text.
- [x] Confirm click handler is wired to Gmail compose.
- [x] Confirm disabled state depends on email.
- [x] Confirm screenshot case: `GET EMAIL & SEND FUNDING LINK` should be disabled if no email, or should ask/use captured email flow if required.

### 11.3 Functional tests

- [x] Conversation with email: click CTA -> new Gmail tab URL contains `to=email` only.
- [x] Conversation without email: CTA disabled and no tab opens.
- [ ] Card body click still inserts suggestion into SMS compose.
- [ ] `Use`, `Edit`, `Skip` still work.
- [x] No nested interactive invalid HTML.
- [ ] Keyboard Tab reaches CTA and disabled state is accessible.

Acceptance:

- [x] Client screenshot scenario explained/fixed.
- [x] Funding link CTA works exactly as requested.
- [ ] Regression around Use/Edit/Skip passes.

Evidence:

- Initial production browser check found legacy static CTA: `.sug-cta`, no `.suggest-cta-btn`, no Gmail compose URL in loaded bundle.
- Static frontend-only deploy performed from committed local CTA fix; production data/users/leads/settings were not changed.
- Production backup before deploy: `/tmp/scl-client-dist-20260428143951.tgz`.
- Final read-only Playwright check: 90 AI CTA candidates found; 69 with email, 21 without email.
- No-email case: CTA rendered as button, disabled, no popup.
- With-email case: CTA rendered as button, enabled, popup URL contains Gmail compose `to=` for lead email, no `subject`/`body`; lead email masked in evidence.
- Loaded production assets include `InboxPageV2-B8OVM6yR.js` with `suggest-cta-btn` and Gmail compose URL markers; browser errors: none.
- Use/Edit/Skip regression not executed on production because `Use`/`Skip` can write classification feedback; run locally or on safe test data before marking complete.

---

## 12. GitHub mirror to client repo without `ksanyok` attribution

Target repo: `https://github.com/fawzi-barakat00728/Twilio-Project-For-Finanical-Company`.

Important: GitHub contributors are derived from commit author/committer identity in history. To avoid `ksanyok` in contributors, do not push original history as-is.

### 12.1 Before mirror

- [ ] Revoke token pasted in chat.
- [ ] Generate new GitHub token with minimal required permissions.
- [ ] Confirm target repo owner/branch/protection rules.
- [ ] Confirm desired public author identity for commits: name/email.
- [ ] Commit and push all final work to `ksanyok/twilio-sms-platform` first.

### 12.2 Sanitize export strategy

Choose one:

- [ ] Option A: clean export without history, new initial commit under neutral/client author.
- [ ] Option B: rewrite full history author/committer away from `ksanyok` before force-push.

Recommended:

- [ ] Use clean export/new initial commit unless client specifically needs full history.

### 12.3 Safety checks before pushing target repo

- [ ] No `.git` from source copied.
- [ ] No `.env`, logs, dumps, local evidence, temp files.
- [ ] `git config user.name` is not `ksanyok`.
- [ ] `git config user.email` is not ksanyok email.
- [ ] `git log --format='%an <%ae> | %cn <%ce>' --all` contains no `ksanyok`.
- [ ] README/package metadata contains no `ksanyok` unless explicitly allowed.
- [ ] `git remote -v` points only to target repo before target push.

### 12.4 Target repo cleanup and push

- [ ] Backup current target repo state if needed.
- [ ] Clean target repo contents safely.
- [ ] Push sanitized code to target default branch.
- [ ] Verify GitHub contributors page does not show `ksanyok`.
- [ ] Verify target Actions/CI if configured.

Acceptance:

- [ ] Final code exists in `ksanyok` repo.
- [ ] Target repo contains same final code.
- [ ] Target repo commit authors do not reveal `ksanyok`.
- [ ] Contributors page does not show `ksanyok`.

---

## 13. Full regression checklist before client response

### Backend

- [ ] `server npm run build`.
- [ ] Regression tests pass locally.
- [ ] CI green.
- [ ] Prisma migration/db push plan verified.
- [ ] PM2 restart successful.
- [ ] Logs clean after smoke.

### Frontend

- [ ] `client npm run build`.
- [ ] Inbox loads.
- [ ] AI suggestion card works.
- [ ] Funding link CTA works with email/no email.
- [ ] Follow-up popover works.
- [ ] Sound mute works.
- [ ] Mobile/desktop layout not broken.

### Production smoke

- [ ] Health endpoint 200.
- [ ] Login works.
- [ ] Inbox realtime works.
- [ ] Test inbound classification works.
- [ ] No cross-rep inbox leak.
- [ ] No unread regression.
- [ ] Campaign/inbox counts still correct.

### Evidence

- [ ] Commit SHA(s).
- [ ] CI link.
- [ ] Production SHA.
- [ ] Clean prod `git status`.
- [ ] Clean `/server` root listing.
- [ ] Test outputs.
- [ ] Screenshots/video if needed.

---

## 14. Client response preparation

Do not send until all acceptance checks are complete.

- [ ] Summarize M1 fixes with evidence.
- [ ] Summarize M2 fixes with evidence.
- [ ] Include CI/test proof.
- [ ] Include demo availability or completed demo note.
- [ ] Keep technical but concise.
- [ ] Do not mention internal mistakes defensively.
- [ ] Do not include secrets or internal tokens.

---

## Progress log

| Date       | Area                  | Change                                                    | Commit SHA | Verification                                                          | Status |
| ---------- | --------------------- | --------------------------------------------------------- | ---------- | --------------------------------------------------------------------- | ------ |
| 2026-04-28 | Checklist             | Created remediation checklist                             | 32fdd2e    | Pushed to `origin/deploy/mysql-hosting`                               | Done   |
| 2026-04-28 | Send Funding Link CTA | Re-checked current `AISuggestions`/`InboxPageV2` wiring   | 45e56b9    | `get_errors` clean; `client npm run build` passed                     | Done   |
| 2026-04-28 | Production CTA        | Found production was serving old static bundle            | N/A        | Browser check: legacy `.sug-cta`, no Gmail URL markers                | Done   |
| 2026-04-28 | Production CTA        | Deployed frontend `client/dist` only, no data/API change  | 2d53102    | Backup `/tmp/scl-client-dist-20260428143951.tgz`; markers = 3         | Done   |
| 2026-04-28 | Send Funding Link CTA | Added read-only Playwright CTA verification script        | 49374b9    | Email/no-email production cases pass; no browser errors               | Done   |
| 2026-04-28 | M1 Production Mode    | Captured production env/health/error evidence             | dbad889    | NODE_ENV production; health 200; no stack markers                     | Done   |
| 2026-04-28 | M1 Prod Hygiene       | Captured `/server` root and git dirty inventory           | dbad889    | 27 server root files; 32 modified + 55 untracked                      | Done   |
| 2026-04-28 | M1 Prod Hygiene       | Classified prod dirty files vs local GitHub               | 65a6171    | 25/32 modified match; key untracked source/tests match                | Done   |
| 2026-04-28 | M1 Tests              | Ran local build and DB-free regression checks             | b165190    | Server build pass; client build pass; 13 files / 45 tests pass        | Done   |
| 2026-04-28 | M1 Secrets/Ignore     | Ignored runtime exports and ecosystem config              | f233db1    | Prevents production exports/config from appearing in git status       | Done   |
| 2026-04-28 | M1 Secrets/Ignore     | Removed runtime export CSVs from Git index                | 2dbf400    | `git rm --cached`; production exports preserved by deploy excludes    | Done   |
| 2026-04-28 | M1 Prod Deploy        | Cleaned production root/git state and deployed source     | 664ca37    | Backup `20260428152107`; git clean; health 200; root candidates 0     | Done   |
| 2026-04-28 | M1 CI                 | Enabled CI for `deploy/mysql-hosting` and explicit builds | c27457b    | Workflow covers TS checks, builds, Vitest with MySQL/Redis            | Done   |
| 2026-04-28 | M1 Secrets            | Replaced hardcoded script credentials with env vars       | Pending    | Grep clean for known prod password/token patterns; syntax checks pass | Done   |
