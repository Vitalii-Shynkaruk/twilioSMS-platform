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
- [ ] Не коммитить `.env`, токены, prod dumps, временные scripts, логи, screenshots с секретами.
- [ ] Для repo `fawzi-barakat00728/Twilio-Project-For-Finanical-Company` не пушить историю с author/committer `ksanyok`; использовать sanitized export или rewritten mirror.
- [x] Перед каждым push проверять `git status --short`, `git log -1 --format=fuller`, `git remote -v`.
- [ ] После каждого deploy проверять app как пользователь: UI, API, logs, regression.

---

## 0. Source-of-Truth и evidence setup

- [x] Зафиксировать текущий локальный SHA ветки `deploy/mysql-hosting`.
- [x] Зафиксировать текущий production SHA и `pm2 status`.
- [ ] Зафиксировать `NODE_ENV`, `CLIENT_URL`, `WEBHOOK_BASE_URL`.
- [x] Сохранить список production modified/untracked files до cleanup.
- [ ] Сохранить список файлов `/opt/sms-platform/server` до cleanup.
- [ ] Сохранить текущий список regression tests, которые есть локально и на production.
- [ ] Создать evidence folder/notes для M1/M2 cleanup без секретов.

Evidence:

- Local SHA: `2d53102` before CTA evidence script commit; CTA code fix is in `45e56b9`; CTA evidence script commit is `49374b9`.
- Production SHA: `/opt/sms-platform` currently `main` at `3b8c055`, remote `Jbaker-SCL/scl-platform`.
- Production PM2: `sms-api` online; 87 dirty/untracked git status lines captured before cleanup.
- Production frontend: Nginx serves `/opt/sms-platform/client/dist`; static dist backup created at `/tmp/scl-client-dist-20260428143951.tgz` before CTA static deploy.
- Evidence path: this checklist + `scripts/check-funding-link-cta.mjs`.

---

## 1. M1 — Production mode

Клиент: PASS, но нужно сохранить доказательство.

- [ ] Проверить `/opt/sms-platform/server/.env`: `NODE_ENV=production`.
- [ ] Проверить `pm2 show sms-api` / `pm2 env`: процесс online и env production.
- [ ] Проверить API health на `https://app.sclcapital.io/api/health`.
- [ ] Проверить отсутствие dev stack traces на ошибочном API request.
- [ ] Занести evidence в checklist.

Acceptance:

- [ ] `NODE_ENV=production` подтверждено.
- [ ] `sms-api` online.
- [ ] Health endpoint отвечает 200.
- [ ] Ошибки API не раскрывают stack trace.

---

## 2. M1 — Clean `/server` root

Клиент указал fail: в `/opt/sms-platform/server/` остались debug/check scripts.

### 2.1 Inventory

- [ ] Найти все `.bak`, `.new`, `.tmp`, debug/check/test scripts в `/opt/sms-platform/server`.
- [ ] Сверить список клиента:
  - [ ] `wayne.js`
  - [ ] `check3.js`
  - [ ] `check_alerts.js`
  - [ ] `check_camp.js`
  - [ ] `check_hammad_filter.js`
  - [ ] `check_more.js`
  - [ ] `check_retarget.js`
  - [ ] `check_two.js`
  - [ ] `check_unreads.js`
  - [ ] `debug_filter.js`
  - [ ] `find_replies.js`
  - [ ] `reclass.js`
  - [ ] `rescore.js`
  - [ ] `scan_lost.js`
  - [ ] `sync_lead_assigned.js`
  - [ ] `test_inbox.js`
  - [ ] `twstat.js`
  - [ ] `verify_reply.js`
  - [ ] `backfill_assigned_rep.js`
  - [ ] `backfill_lost_unread.js`
  - [ ] `backfill_tmp.js`

### 2.2 Decision

- [ ] Для каждого файла определить: удалить, перенести в repo `server/scripts`, перенести в archive, оставить как required.
- [ ] Если файл содержит полезную логику/backfill — сначала перенести в GitHub с нормальным именем и документацией.
- [ ] Если файл одноразовый/debug — удалить с production.

### 2.3 Cleanup

- [ ] Удалить junk из `/opt/sms-platform/server` root.
- [ ] Проверить, что production server root не содержит `.bak`, `.new`, debug/check/test scripts.
- [ ] Проверить, что приложение после cleanup работает.

Acceptance:

- [ ] `/opt/sms-platform/server` root clean.
- [ ] Никаких debug/check/test scripts в server root.
- [ ] Никаких `.bak`/`.new` files.
- [ ] PM2/API после cleanup stable.

---

## 3. M1 — Production git clean + GitHub-as-truth

Клиент указал fail: 32 modified и 50+ untracked на production.

### 3.1 Audit prod git state

- [ ] Выполнить `git status --short` на production.
- [ ] Сохранить список modified files.
- [ ] Сохранить список untracked files.
- [ ] Разделить файлы на категории:
  - [ ] source code changes
  - [ ] tests
  - [ ] generated build output
  - [ ] logs/temp/debug
  - [ ] secrets/config
  - [ ] DB/backfill scripts

### 3.2 Bring prod changes into local GitHub repo

- [ ] Для каждого production source change проверить diff.
- [ ] Нужные изменения перенести локально.
- [ ] Нужные tests перенести локально.
- [ ] Generated/temp/log/secrets не переносить.
- [ ] Собрать feature-wise commits в локальном repo.
- [ ] Push в `ksanyok/twilio-sms-platform`.

### 3.3 Clean production

- [ ] После push/deploy production должен совпадать с GitHub SHA.
- [ ] Удалить untracked junk с production.
- [ ] Проверить `git status --short` на production: clean.
- [ ] Зафиксировать deployed commit SHA.

Acceptance:

- [ ] Все нужные prod-only changes есть в GitHub.
- [ ] Production working tree clean.
- [ ] Нет direct prod edits вне GitHub.
- [ ] Есть release SHA и smoke evidence.

---

## 4. M1 — Regression tests + CI proof

Клиент указал fail: tests есть на server, но не в GitHub, CI не запускался.

### 4.1 Test inventory

- [ ] Сверить production-only tests: `envValidation.test.ts`, `twilioSignatureValidation.test.ts`, `inboundParsing.test.ts`, и остальные.
- [ ] Сверить локальные `server/tests`.
- [ ] Нужные production-only tests перенести в repo.
- [ ] Удалить дубли и устаревшие tests.

### 4.2 Local test pass

- [ ] `server npm run build`.
- [ ] DB-free regression suite pass.
- [ ] DB-dependent tests: либо pass на test DB, либо documented skip с причиной.
- [ ] `client npm run build`.

### 4.3 CI

- [ ] Проверить наличие GitHub Actions workflow.
- [ ] Если workflow нет — добавить минимальный CI: install, server build, client build, DB-free tests.
- [ ] Запустить CI в GitHub.
- [ ] Сохранить link/status CI run.

Acceptance:

- [ ] Все нужные tests в GitHub.
- [ ] Local regression pass.
- [ ] CI run green или documented blocker.
- [ ] Клиенту можно показать CI evidence.

---

## 5. M1 — Secrets audit

Клиент: unverifiable until commits happen.

- [ ] Проверить committed files на secrets: `.env`, Twilio SID/token, Anthropic/OpenAI keys, DB URL, GitHub token.
- [ ] Проверить git history последних commits на случайное попадание secrets.
- [ ] Проверить production-only files перед переносом в repo.
- [ ] Добавить/обновить `.gitignore`, если надо.
- [ ] Если token попал в публичный канал — revoke/rotate.

Acceptance:

- [ ] No secrets in committed files.
- [ ] No secrets in staged diffs.
- [ ] Sensitive prod values только в env/settings.
- [ ] Chat-exposed GitHub token revoked/replaced.

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

| Date       | Area                  | Change                                                   | Commit SHA | Verification                                                  | Status |
| ---------- | --------------------- | -------------------------------------------------------- | ---------- | ------------------------------------------------------------- | ------ |
| 2026-04-28 | Checklist             | Created remediation checklist                            | 32fdd2e    | Pushed to `origin/deploy/mysql-hosting`                       | Done   |
| 2026-04-28 | Send Funding Link CTA | Re-checked current `AISuggestions`/`InboxPageV2` wiring  | 45e56b9    | `get_errors` clean; `client npm run build` passed             | Done   |
| 2026-04-28 | Production CTA        | Found production was serving old static bundle           | N/A        | Browser check: legacy `.sug-cta`, no Gmail URL markers        | Done   |
| 2026-04-28 | Production CTA        | Deployed frontend `client/dist` only, no data/API change | 2d53102    | Backup `/tmp/scl-client-dist-20260428143951.tgz`; markers = 3 | Done   |
| 2026-04-28 | Send Funding Link CTA | Added read-only Playwright CTA verification script       | 49374b9    | Email/no-email production cases pass; no browser errors       | Done   |
