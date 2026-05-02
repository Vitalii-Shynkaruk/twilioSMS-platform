© BuyReadySite.com

# SCL Capital — Master M1/M2 Delivery Checklist

Дата обновления: 2026-05-02

## Progress Dashboard

> Этот файл является главным рабочим чеклистом по текущему объединенному scope: **M1: Pipeline v2 + Login/Auth** и **M2: Campaigns/Lead Doc**. Процент готовности обновляется после каждого завершенного блока и после каждого testing gate.

| Направление                                     |      Вес | Готовность | Статус                                                                                    |
| ----------------------------------------------- | -------: | ---------: | ----------------------------------------------------------------------------------------- |
| Phase 0 — Scope consolidation и source map      |       6% |         6% | Done                                                                                      |
| M1.1 — Passwordless OTP Login/Auth              |      10% |         8% | OTP foundation + SCL auth visual parity implemented; live infra validation pending        |
| M1.2 — Pipeline v2 base parity                  |      12% |        12% | Done — stage/visual/scope/metrics/search/drag-drop gates verified                         |
| M1.3 — Pipeline card/panel/modals parity        |      12% |        12% | Done — card/panel/modal/context-menu/browser gates verified                               |
| M1.4 — Pipeline AI extractor + badges           |      14% |         2% | B.6 stacking chip rendering rules implemented; backend extractor/data plumbing pending    |
| M1.5 — Auto-nurture attempt mechanic            |      10% |         7% | Backend, Pipeline UI, inbound/forward reset mechanics implemented; browser/pixel pending  |
| M1.6 — M1 regression, pixel-close, release gate |       8% |         0% | Not started                                                                               |
| M2.1 — Leads/Campaign access + source fixes     |       8% |         6% | Implementation + API scope tests/build passed; browser admin/rep smoke pending            |
| M2.2 — Leads enrichment columns + export        |       8% |         6% | Implementation + focused tests/build passed; browser/pixel/manual CSV smoke pending       |
| M2.3 — AI Retarget campaigns                    |       8% |         5% | Live cohort API/UI/build-draft foundation + cap tests/build passed; DB/cron/pixel pending |
| M2.4 — M2 regression, pixel-close, release gate |       4% |         0% | Not started                                                                               |
| **Overall**                                     | **100%** |    **64%** | **M1.5 reset mechanics added; browser/pixel/release gates remain**                        |

## Source Map

### M1 sources

- `scl-pipeline-ai-handoff/extractor-spec.md` — canonical behavior spec для Pipeline AI extractor.
- `scl-pipeline-ai-handoff/scl_pipeline_v11.html` — binding visual target только для retained v1 Pipeline AI / auto-nurture elements.
- `scl-pipeline-ai-analysis/MASTER_WORK_CHECKLIST.md` — предыдущий детальный checklist по Pipeline AI.
- `scl-pipeline-ai-handoff/M1/SCL_Auth_login.pdf` — canonical M1 auth/login source: passwordless OTP replacement.
- `archive/PIPELINE_AUDIT.md` — старый audit Pipeline prototype vs React implementation.
- `scl-pipeline-phase2.pdf` — Pipeline replacement / Command Center / auth milestone document.
- `Phasse 2/SCL_Milestones.pdf` — milestone acceptance для Pipeline + auth.
- `CHECKLIST_M1_M2_REMEDIATION_2026-04-28.md` — production cleanup, auth/security, M2 inbox/follow-up evidence.

### M2 sources

- `CHECKLIST_LEADS_CAMPAIGNS.md` — предыдущий Leads + Campaigns checklist.
- `SCL_Leads_Campaigns_Refinement.pdf` — оригинальный Leads/Campaigns refinement source.
- `scl-pipeline-ai-handoff/m2/PHASE3_COMPLEXITY_BRIEF.pdf` — M2 Phase 3 complexity/value brief for AI Suggested Campaigns.
- Prototype: `https://papaya-swan-76d714.netlify.app/scl_leads_campaigns_scope_v3.html`.
- Current M2 prototype scope: **4 fixes only**:
  - Phase 1: reps see only leads they uploaded; reps see only campaigns they created.
  - Phase 2.1: Source column shows readable list name, not UUID.
  - Phase 2.2-6: Industry + Revenue + Last Contact + Export CSV, wired from AI classifier and existing data.
  - Phase 3: AI Retarget suggestions and AI-built campaign lineage in All Campaigns.

### Explicitly out of scope for M2 unless separately approved

- Cohort bar outside the shown AI Retarget Suggestions area.
- Suppressed leads zone.
- List management rebuild.
- Multi-owner / multi-rep ownership for Leads/Campaigns.
- Full Leads tab rebuild beyond the prototype's retained table/filter/export scope.
- Gmail extension or email sending from SCL.

## Non-Negotiable Rules

- [x] Не трогать боковое меню при M2 Leads/Campaigns styling, кроме случаев явного bug fix.
- [ ] Перед каждым изменением фиксировать affected files и regression surface.
- [ ] После каждой фазы выполнять focused testing gate.
- [ ] После каждого UI-блока выполнять pixel-close сравнение с relevant prototype.
- [ ] Если текущие стили не применяются к M2, создать новый scoped style set для Leads/Campaigns section, не ломая глобальные tokens и sidebar.
- [ ] Не перетирать manual rep values AI suggestions.
- [ ] Не запускать auto-stage / auto-nurture behavior без audit trail и rollback-safe validation.
- [ ] Не делать silent data migrations, destructive SQL, reset, truncate или delete production data.
- [ ] Не коммитить `.env`, токены, prod dumps, screenshots с секретами.
- [ ] Все user-facing changes проверять как admin и как rep.
- [ ] Все auth/permission changes проверять negative cases: чужие leads, чужие campaigns, чужие deals.

## Client Pain Points To Guard

- [ ] AI suggestions должны соответствовать последнему client message и full-thread context.
- [ ] Email CTA должен брать email из conversation/client text прежде lead-list email.
- [ ] Gmail compose должен открываться надежно и только с `to=` без subject/body.
- [ ] Follow-up suggestions не должны ставить 5 AM или quiet-hours-conflicting times.
- [ ] Quiet hours должны блокировать отправку корректно, но UI должен объяснять причину.
- [ ] Inbound conversation owner не должен самопроизвольно переassignиваться на текущего пользователя.
- [ ] Reps не должны видеть чужие leads/campaigns/deals без явного права.
- [ ] Source column не должен показывать UUID там, где нужен readable list/campaign name.
- [ ] Export CSV должен учитывать текущие filters и не выгружать чужие данные rep-у.
- [ ] UI не должен выглядеть как “почти похоже”: retained prototype elements сравниваются pixel-close.

## Phase 0 — Scope Consolidation And Setup

- [x] Собрать M1 sources.
- [x] Собрать M2 sources.
- [x] Прочитать новые папки handoff: `scl-pipeline-ai-handoff/M1` и `scl-pipeline-ai-handoff/m2`.
- [x] Зафиксировать `SCL_Auth_login.pdf` как M1 auth source.
- [x] Зафиксировать `PHASE3_COMPLEXITY_BRIEF.pdf` как M2 AI Retarget complexity source.
- [x] Проверить старые чеклисты: Pipeline AI, M1/M2 remediation, Leads/Campaigns.
- [x] Открыть и прочитать M2 prototype `scl_leads_campaigns_scope_v3.html`.
- [x] Зафиксировать, что M2 prototype содержит только 4 shipping changes.
- [x] Зафиксировать M1 Pipeline v11 retained visual elements.
- [ ] Создать evidence folder для новых M1/M2 работ без секретов.
- [ ] Создать baseline screenshots текущих страниц до изменений:
  - Login page;
  - Pipeline simple mode;
  - Pipeline execution mode;
  - Deal card;
  - Deal panel;
  - Leads tab admin view;
  - Leads tab rep view;
  - Campaigns tab admin view;
  - Campaigns tab rep view.
- [ ] Снять baseline browser console errors для этих страниц.
- [ ] Снять baseline API responses shape для affected endpoints.

### Phase 0 Gate

- [ ] Все source artifacts зафиксированы в checklist.
- [ ] Есть до-скриншоты и console baseline.
- [ ] Есть список affected files.
- [ ] Overall progress обновлен.

## M1.1 — Passwordless OTP Login/Auth

### Implementation evidence — 2026-05-02

- [x] Auth code map completed before implementation: current auth was password-only, `User.mobilePhone` exists, Twilio config exists, Resend/email sender needed env config.
- [x] Prisma OTP schema added: `OtpChannel`, `LoginOtp`, user failed-attempt and lockout fields.
- [x] Backend OTP service added with hashed 6-digit codes, 5-minute expiry, one-time use, prior-code invalidation, SMS default and email fallback.
- [x] Public endpoints added: `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`.
- [x] Admin unlock endpoint added: `POST /api/auth/users/:id/unlock-otp`.
- [x] Login UI converted to passwordless email -> OTP flow while preserving SCL visual style.
- [x] Login UI redesigned to match the SCL Auth target: SCL wordmark, `SALES COMMAND LAYER`, `COMMAND YOUR PIPELINE`, `EXECUTION. FOCUS. RESULTS.`, `SIGN IN TO SCL`, email field, blue `SEND CODE`, phone verification note, and SCL Systems footer.
- [x] Login visual styling is scoped under `.scl-auth` in `client/src/styles/globals.css` to avoid sidebar/dashboard regressions.
- [x] Admin Users UI now shows OTP locked status and clear-lock action.
- [x] Password `/api/auth/login` endpoint intentionally preserved as fallback until demo/JB approval.
- [x] Account enumeration reduced: request-code response is generic for missing/inactive/missing-phone accounts.
- [x] Wrong OTP attempts 1-4 return remaining-attempts messaging; 5th failed attempt locks account for 30 minutes.
- [x] Local validation passed: Prisma Client generation, backend build, frontend build, DB-free OTP policy tests, production-preview login UI check.
- [x] Browser validation passed for auth UI: desktop preview, mobile-width preview, server-unavailable state, and mocked email -> OTP -> verify -> REP `/pipeline` redirect.
- [x] Frontend CSS minify warning fixed by replacing the problematic light-mode combo selector with `:is()` selectors.
- [ ] Live validation pending: real MySQL schema sync, Redis availability, Twilio SMS delivery, Resend email delivery.
- [ ] Deployment note pending: production DB needs schema sync via reviewed migration or existing `prisma db push` path.

### Scope decision

- [x] Implement passwordless OTP as primary login flow.
- [x] Preserve existing password-based `/api/auth/login` fallback for production safety until demo/JB approval.
- [ ] Confirm all 6 reps + admin have populated account `email` and `mobilePhone` values.
- [ ] Confirm Twilio 10DLC can handle OTP volume of ~50-100/day peak.
- [ ] Confirm Resend is configured for SCL-branded OTP sender.
- [x] Confirm old password column may only be dropped after demo pass and explicit JB approval.
- [x] Redirect mapping implemented:
  - admin/manager -> current Dashboard surface `/command-center`;
  - rep -> `/pipeline`.

### Login screen behavior

- [x] Match the M1 SCL auth visual target while preserving passwordless OTP behavior.
- [x] Keep email field as account identifier.
- [x] Replace password input flow with `SEND CODE` flow.
- [x] Send OTP via SMS to account `mobilePhone` by default.
- [x] Same screen transitions into 6-digit OTP entry state.
- [x] OTP entry state matches existing login aesthetic.
- [x] On success, redirect by role.
- [x] Error states are clear and avoid account/phone enumeration on request-code.
- [x] Loading states for send code and verify code.
- [x] Resend code state respects countdown/rate-limit responses.
- [x] Keyboard flow works: email -> send -> OTP digits -> submit.
- [x] OTP input supports paste of 6-digit code.
- [x] OTP input rejects non-numeric characters.

### Backend OTP model and storage

- [x] Decide storage model: DB-backed `LoginOtp` table with user lock fields.
- [x] Store OTP codes hashed, never plaintext.
- [x] Store expiration timestamp.
- [x] Store used/consumed status and invalidate after successful verification.
- [x] Requesting a new OTP invalidates prior unused OTPs for that user.
- [x] OTP compare uses bcrypt hash verification.
- [x] Do not log OTP codes.
- [x] Do not return OTP codes in API responses.
- [x] Add audit fields for request channel, user id, destination hash/masked destination, createdAt, consumedAt, expiresAt.
- [ ] Cleanup/expiry policy for old OTP records if DB-backed.

### Safeguard 1 — failed OTP lockout

- [x] Track failed OTP attempts per account in rolling 15-minute window.
- [x] Wrong OTP attempts 1-4 return decreasing `N attempts remaining` message.
- [x] 5th wrong OTP within rolling 15 minutes locks account for 30 minutes.
- [x] Locked account cannot verify OTP.
- [x] Locked account cannot request new SMS OTP.
- [x] Locked account cannot request new email fallback OTP.
- [x] Lockout counter is shared across SMS and email OTP.
- [x] After 30 minutes, account auto-unlocks and attempt counter resets to zero.
- [x] Admin can manually unlock user from Users admin panel before 30 minutes expires.
- [x] Unlock event writes auth audit log.

### Safeguard 2 — OTP expiration and one-time use

- [x] OTP expires 5 minutes after generation.
- [x] Code submitted after expiry is rejected as expired/generic invalid.
- [x] Successfully verified OTP cannot be reused.
- [x] Second verification attempt with same code is rejected.
- [x] New OTP request invalidates older unused code for that user.
- [x] Expired/used/invalidated codes produce safe generic errors.

### Safeguard 3 — OTP request rate limits

- [x] Max 3 SMS OTP sends per phone number per rolling 1-hour window.
- [x] 4th SMS OTP request within 1 hour is blocked.
- [x] Blocked response includes `Too many requests` with retry seconds/time.
- [x] Frontend shows live countdown for blocked resend.
- [x] After 1 hour from oldest send, counter resets.
- [x] SMS sends and email fallback sends have independent 3/hour limits.
- [x] Rate limits cannot be bypassed by switching email casing.
- [x] Rate limits use normalized phone/email keys.
- [x] Rate limit events are logged without secrets.

### Safeguard 4 — email fallback for phone loss

- [x] Add link below SEND CODE: `Lost access to your phone? Use email instead`.
- [x] Link is visible for all users.
- [x] Clicking sends OTP to account email.
- [ ] Email OTP arrives within 30 seconds in test/demo conditions.
- [x] Email OTP uses same 5-minute expiration.
- [x] Email OTP uses same 5-attempt lockout counter as SMS.
- [x] Email OTP request uses separate 3/hour email fallback rate limit.
- [x] Email subject: `SCL Capital · Your sign-in code`.
- [x] Email body is SCL-branded and does not expose extra account info.

### Existing auth hardening compatibility

- [x] Проверить `server/src/controllers/authController.ts` на login, register, current user, update user.
- [x] Проверить `server/src/routes/auth.ts` на middleware и role gates.
- [ ] Проверить `server/src/middleware/auth.ts` на JWT parsing, expired token, missing token, malformed token.
- [x] Проверить localStorage behavior в frontend auth flow.
- [ ] Проверить, что production errors не возвращают stack traces.
- [x] Проверить, что `NODE_ENV=production` не допускает localhost `CLIENT_URL` / `WEBHOOK_BASE_URL`.
- [ ] Проверить refresh/current-user flow после reload в live backend/browser session.
- [ ] Проверить 401 vs 403 semantics:
  - unauthenticated -> 401;
  - authenticated wrong role/scope -> 403 или 404 там, где нужно скрыть resource existence.

### Frontend auth integration

- [x] Проверить `client/src/pages/LoginPage.tsx`.
- [x] Проверить `client/src/stores/authStore.ts`.
- [x] Исправить/проверить известный риск: 5xx не должен навсегда блокировать re-auth.
- [x] Проверить loading state login form.
- [ ] Проверить invalid credentials state.
- [x] Проверить server unavailable state.
- [ ] Проверить redirect after login with real OTP success.
- [x] Проверить logout clears sensitive state in auth store.
- [ ] Проверить protected route redirect.
- [x] Проверить role-based initial route mapping:
  - admin -> allowed admin/default surface;
  - rep -> own scoped surfaces only.

### M1.1 Testing Gate

- [ ] Unit/backend tests for auth middleware.
- [ ] Unit/backend tests for OTP generation, hash storage, expiration, reuse rejection.
- [ ] Unit/backend tests for rolling failed-attempt lockout.
- [x] Unit/backend tests for OTP destination normalization/masking and send rate-limit helper.
- [x] Unit/backend tests for SMS/email normalized rate-limit policy helper.
- [ ] Unit/backend tests for admin unlock.
- [ ] API manual tests:
  - send SMS OTP success;
  - verify OTP success;
  - wrong OTP 4 times shows remaining attempts;
  - wrong OTP 5th time locks account;
  - locked account cannot request new OTP;
  - expired OTP rejected;
  - used OTP rejected;
  - new OTP invalidates old OTP;
  - 4th SMS OTP in 1 hour blocked;
  - email fallback OTP success;
  - SMS/email rate limits independent;
  - `/api/auth/me` without token;
  - expired/malformed token;
  - rep trying admin-only action.
- [ ] Browser tests:
  - [x] login page desktop;
  - [x] login page half-screen width;
  - [x] email -> send code -> OTP state;
  - OTP paste;
  - email fallback link;
  - lockout UI;
  - resend countdown UI;
  - [x] role redirect after mocked OTP login;
  - reload after login;
  - logout.
- [ ] Live demo acceptance from PDF passes in one flow.
- [ ] Console errors: none.
- [ ] Auth regression evidence saved.
- [x] Backend build passed after OTP implementation.
- [x] Frontend build passed after OTP implementation.
- [x] Production preview login page rendered correctly.
- [x] Production preview server-unavailable error state shows friendly message.
- [x] Progress dashboard updated.

## M1.2 — Pipeline v2 Base Parity

### Implementation evidence — 2026-05-02

- [x] Verified v2 stage labels in `PipelinePageV2`, `DealPanel`, `dealController`, `leadController`, `inboxController`, `dashboardController`, `commandCenterController`.
- [x] Confirmed old audit mismatches are fixed in v2 runtime: `ENGAGED_INTERESTED` -> `Engaged / Interested`, `QUALIFIED` -> `Qualified`, `APPROVED_OFFERS` -> `Approved / Offers`.
- [x] Updated stale Pipeline CSS stage comment from legacy `Contacted/New Business` vocabulary to current M1.2 stage language.
- [x] Simple mode now hides `CLOSED` column while execution mode keeps it available.
- [x] Browser mock validation passed: Simple mode columns = 8 without `Closed`; Execution mode columns = 9 with `Closed`.
- [x] Browser mock validation passed: search no-match zeroes visible stage counts and clearing search restores board counts.
- [x] Extracted shared deal scope policy for Pipeline + Command Center metrics.
- [x] Guarded `/api/deals/board?teamView=true` and `/api/deals/stats?teamView=true` so non-admin users remain scoped to their own/shared deals.
- [x] Default rep Pipeline board now requests primary + explicitly shared/assisting deals; Shared filter still isolates assisting deals in UI.
- [x] Added `dealScopePolicy` unit tests for admin unscoped team view, rep scoped team view, primary-only filters, shared deal visibility, and funding-event scope.
- [x] Verified stage colors against `archive/PIPELINE_AUDIT.md` and aligned per-stage `.col-bar` opacity values.
- [x] Confirmed `APPROVED_OFFERS` and `COMMITTED_FUNDING` both use active pipeline `nb-col` / `pipe` classes.
- [x] Browser computed-style validation passed for all 9 stage bar colors/opacity values, including Committed `0.85` opacity.
- [x] Browser validation passed: business/contact search terms filter visible cards and execution mode keeps all 9 header totals/count rows.
- [x] Browser validation passed: drag/drop works with and without active search filter and uses the underlying board stage safely.
- [x] Screenshot comparison completed for Simple and Execution modes: `audit-screenshots/m1-2-pipeline-simple.png`, `audit-screenshots/m1-2-pipeline-execution.png`.
- [x] Controller-level negative tests passed: REP `teamView=true` remains scoped; ADMIN `teamView=true` can access unscoped board.
- [x] Verification passed: `npm run build` and `cd server && npx vitest run tests/dealScopePolicy.test.ts tests/dealControllerScope.test.ts`.
- [x] Legacy `pipelineStage` seed/old `/pipeline/stages` lead-board path left unchanged by decision: current M1.2 v2 route uses `/api/deals/board`; legacy data cleanup is separate scope.

### Stage system and board structure

- [x] Verify exact 9 stage list and labels:
  - New Lead;
  - Engaged / Interested;
  - Qualified;
  - Submitted (In Review);
  - Approved / Offers;
  - Committed (Funding);
  - Funded;
  - Nurture;
  - Closed.
- [x] Fix mismatch from audit:
  - `ENGAGED_INTERESTED` label must be `Engaged / Interested`, not `Contacted`.
  - `QUALIFIED` label must be `Qualified`, not `Qualified / Interested`.
  - `APPROVED_OFFERS` label must be `Approved / Offers`, not `New Business`.
- [x] Verify stage colors against prototype and `archive/PIPELINE_AUDIT.md`.
- [x] Add/apply per-stage column bar opacity.
- [x] Ensure `APPROVED_OFFERS` and `COMMITTED_FUNDING` both use active pipeline classes.
- [x] Simple mode hides `CLOSED` column.
- [x] Execution mode shows expected columns and totals.
- [x] Admin view can see all deals.
- [x] Rep view sees own + explicitly shared/assisting deals only.
- [x] Search filters business name and contact/client name.
- [x] Clearing search restores board.
- [x] Drag/drop works only when current filters/search state cannot cause wrong-stage moves.

### Pipeline metrics and totals

- [x] Active Pipeline $ = Approved + Committed only.
- [x] Submitted/In Review amount, if implemented, does not alter Active Pipeline $.
- [x] Funded MTD matches funding events current month.
- [x] Lifetime Funded remains unchanged unless explicitly in scope.
- [x] At Risk logic remains consistent with current business rules.
- [x] Admin Command Center Pipeline Value, if touched, must read `Pipeline Value (Approved)` and sum Approved deals only.

### Pipeline ownership and sharing

- [x] Verify primary rep ownership.
- [x] Verify assisting reps if supported by current schema/UI.
- [x] Verify `All Deals` button visible only to admin if prototype requires it.
- [x] Verify shared deals sort below primary deals.
- [x] Verify contact info hidden from unauthorized reps.
- [x] Verify scoped Socket.IO events do not leak deal updates to all users.

### M1.2 Testing Gate

- [x] Admin login -> sees all stage columns and all allowed deals.
- [x] Rep login -> sees only own/shared deals.
- [x] Stage labels match character-for-character.
- [x] Stage colors match prototype tokens.
- [x] Simple mode screenshot compared.
- [x] Execution mode screenshot compared.
- [x] Search works with business name.
- [x] Search works with contact name.
- [x] Drag/drop tested with and without active filters.
- [x] API permission negative tests pass.
- [x] Progress dashboard updated.

## M1.3 — Pipeline Card, Panel, And Modals Parity

### Implementation evidence — 2026-05-02

- [x] DealCard keeps retained hierarchy and now shows readable `SMS · list/campaign` source from SMS-created client notes.
- [x] Business/contact text selection validated in browser; selecting card text no longer opens panel or starts drag.
- [x] Delete permissions aligned across panel, context menu, and API: admin/manager only; funded deals remain blocked.
- [x] Backend deal-level access checks added for deal detail/update/move/share/call/SMS/funding/renewal action paths.
- [x] `deal_events` logging verified for stage moves, offers, funded, completed actions, shares, calls, renewal completion, create quick notes, and panel SMS send.
- [x] Browser validation passed for card source chip, panel tabs, modals, context menu close behavior, role matrix, Funding History create/reveal, quick note carryover, and product/revenue controls.
- [x] Server scope tests passed: `dealControllerScope.test.ts` + `dealScopePolicy.test.ts` = 10 tests.
- [x] Frontend/client build passed after final layout and selection fixes.

### Deal card parity

- [x] Preserve existing card hierarchy while layering new AI/attempt UI.
- [x] Business name visible and selectable.
- [x] Contact name visible and selectable where allowed.
- [x] Product badge uses prototype `.prod-badge` visual pattern.
- [x] Product badge + days-in-stage row placement matches prototype.
- [x] Card footer matches prototype:
  - left: rep initials + touched text;
  - right: `Age: Nd`.
- [x] Review pill appears for Submitted/In Review cards.
- [x] Nurture tags appear on Nurture cards if data exists.
- [x] Nurture urgency pill appears when touch due.
- [x] Source field on deal card populates readable list/campaign source when created from SMS.
- [x] Tooltip preview works in Execution mode only if included in current M1 scope.
- [x] Tooltip hides sensitive contact details from unauthorized users.

### Deal panel parity

- [x] Deal panel opens from card click.
- [x] Conversation tab shows full SMS history.
- [x] Deal + Client tab allows existing editable fields.
- [x] Funding History tab remains functional.
- [x] SMS send bar works from panel where permitted.
- [x] Follow-up scheduler modal exists or current replacement behavior is documented.
- [x] Close/NQ modal exists or current replacement behavior is documented.
- [x] Funded modal exists or current replacement behavior is documented.
- [x] Edit Funding Event modal exists or current replacement behavior is documented.
- [x] New Deal modal creates deal card and reveals it even if filters/search would hide it.
- [x] Quick note on create carries into deal note and activity log if included in scope.

### Context menu

- [x] Right-click opens context menu for allowed users.
- [x] Reps can right-click own/assisted deals only.
- [x] Admin can right-click any non-funded deal.
- [x] Delete is admin-only and blocked for funded deals.
- [x] Move to Nurture opens proper lost/recoverable flow.
- [x] Close/NQ opens proper disqualification flow.
- [x] Share Deal opens ownership/share flow for primary rep/admin.
- [x] Context menu closes on outside click and Escape.
- [x] Every action logs to `deal_events`.

### M1.3 Testing Gate

- [x] Pixel-close compare: DealCard retained layout.
- [x] Pixel-close compare: DealPanel retained layout.
- [x] Modal screenshots compared to prototype where relevant.
- [x] Text selection works on card names.
- [x] Context menu role matrix tested.
- [x] New deal from Funding History creates and opens the card.
- [x] No regression in existing manual product/revenue controls.
- [x] No console errors.
- [x] Progress dashboard updated.

## M1.4 — Pipeline AI Extractor And Badges

### Implementation evidence — 2026-05-02 B.6 client correction

- [x] Client B.6 correction folded into M1 without schema change: MCA `stacked` now means `3+` active positions.
- [x] Added typed `PipelineAiSignals` frontend shape with `current_active_positions`, `has_stacked_history`, and `recent_stacking_activity`.
- [x] Added reusable stacking chip resolver/component for DealCard and DealPanel.
- [x] Implemented chip labels/colors: green `1ST POSITION`, yellow `1-POSITION`, orange `2-POSITIONS`, red `{N}-STACKED` for `count >= 3`.
- [x] Implemented active stacking modifier: red pulse and ` · ACTIVE` appended to the rendered base chip.
- [x] Implemented optional debt suffix ` · $XXXk` when `total_debt_usd` is set and `count >= 2`.
- [x] Frontend build passed after B.6 chip update.
- [x] Browser mock validation passed: DealCard rendered `1ST POSITION`, `1-POSITION`, `2-POSITIONS · $180k`, `3-STACKED · $240k · ACTIVE`; DealPanel rendered active stacked chip.
- [ ] Backend extractor/data plumbing still pending: `Deal.pipelineAiSignals`, `Deal.pipelineAiUpdatedAt`, and live AI extraction endpoint.

### Backend foundation

- [ ] Add `Deal.pipelineAiSignals`.
- [ ] Add `Deal.pipelineAiUpdatedAt`.
- [ ] Create `server/src/services/pipelineAiService.ts` parallel to Inbox AI.
- [ ] Use exact prompt/schema from `scl-pipeline-ai-handoff/scl-pipeline-ai-extractor.md`.
- [ ] Do not paraphrase prompt/schema/payload contract.
- [ ] Use model `claude-sonnet-4-5` with prompt caching.
- [ ] Use exact payload markers:
  - `[EXISTING SIGNALS]`;
  - `[NEW INPUT]`.
- [ ] Use `pipeline-ai.fixtures.json` as canonical TS test fixture source.
- [ ] Keep `golden_test_set.json` synchronized as standalone reference.
- [ ] Implement fallback `conversation.aiSignals -> deal.pipelineAiSignals` only when appropriate.
- [ ] Implement per-deal serialization queue.
- [ ] Structured logs include deal id, model, usage, skip reason, duration.
- [ ] AI failures never break note save/update.

### Trigger wiring

- [ ] Trigger on `note_added`.
- [ ] Trigger on `note_updated`.
- [ ] Trigger on inbound client SMS only for allowed active deal stages.
- [ ] Skip on `FUNDED`, `CLOSED`, too-short text, unrelated/no-signal conditions.
- [ ] Add manual `POST /api/ai/extract-pipeline` endpoint.
- [ ] Resolve remaining behavior: if no saved note exists, re-run uses latest client SMS or disables action.

### Validation

- [ ] Port grading logic from `run_golden.py` into TS tests.
- [ ] Use `pipeline-golden-results.csv` as 15-case baseline.
- [ ] Use `pipeline-extraction-review.csv` as 80-row corpus baseline.
- [ ] Track row grade distribution: PERFECT/PARTIAL/FAIL.
- [ ] Field-level grading supports PASS/PARTIAL/FAIL.
- [ ] Add tests for money tolerance, array set equality, pending action partial matching.
- [ ] Add queue serialization tests.
- [ ] Add skip-condition tests.
- [ ] Add inheritance/merge tests because `test_harness.py` only validates `(none)` existing signals.

### Frontend badges and inline bar

- [x] Add `PipelineAiSignals` type distinct from Inbox `AISignals`.
- [ ] Extend deal API response shape.
- [ ] Render industry badge.
- [ ] Render monthly revenue badge.
- [ ] Render use-of-funds badge.
- [x] Render corrected B.6 stacking chip priority from client update:
  - `count >= 3` -> red `{N}-STACKED`;
  - `count === 2` -> orange `2-POSITIONS`;
  - `count === 1` -> yellow `1-POSITION`;
  - `has_stacked_history === false && current_active_positions === null` -> green `1ST POSITION`;
  - `recent_stacking_activity.active === true` -> red pulse and append ` · ACTIVE`.
- [x] Append ` · $XXXk` to stacking chip when `total_debt_usd` is set and `count >= 2`.
- [ ] Render AI inline bar in DealPanel above stage/product row.
- [ ] Render empty/dashed placeholders where spec requires.
- [ ] Render extracted-time/source label.
- [ ] Add Re-run AI action loading/error/success states.
- [ ] AI suggestions may prefill empty fields visually but must not silently overwrite manual fields.

### M1.4 Testing Gate

- [ ] Server build passes.
- [ ] Pipeline AI unit tests pass.
- [ ] Golden tests pass or differences documented with exact fields.
- [ ] Note save works when Anthropic API fails.
- [ ] Rapid note updates serialize per deal.
- [ ] DealCard AI badges render full/partial/empty states.
- [x] DealCard/DealPanel B.6 stacking chip helper compiles for all corrected count states.
- [x] DealCard/DealPanel B.6 stacking chip browser mock renders corrected count states and active pulse modifier.
- [ ] DealPanel AI inline bar renders full/partial/empty states.
- [ ] Re-run AI tested with note, no-note, API error.
- [ ] Pixel-close compare with `scl_pipeline_v11.html` retained elements.
- [ ] Progress dashboard updated.

## M1.5 — Auto-Nurture Attempt Mechanic

### Implementation evidence — 2026-05-02

- [x] Added additive Deal fields in Prisma schema: `contactAttempts`, `contactAttemptThreshold`, `lastEngagementAt`.
- [x] Added `POST /api/deals/:id/log-attempt` backend action.
- [x] Implemented quick-log kinds: `no_answer`, `texted`, `voicemail`, `connected`, `not_interested`.
- [x] `no_answer`, `texted`, and `voicemail` increment attempts and write audit metadata.
- [x] `connected` resets attempts and updates `lastEngagementAt`.
- [x] `not_interested` moves deal to `NURTURE`, sets lost semantics, resets attempts, and does not increment counter.
- [x] Threshold auto-move to `NURTURE` implemented with audit metadata and linked lead status sync.
- [x] Access control uses existing deal scope policy; funded/closed deals reject quick-log attempts.
- [x] Validation passed: Prisma Client generation, server build, `cd server && npx vitest run tests/dealContactAttempts.test.ts tests/dealControllerScope.test.ts tests/dealScopePolicy.test.ts` — 14/14 passed.
- [x] Targeted ESLint passed with 0 errors and existing warning debt only.
- [x] Pipeline UI added M1.5 attempt banner on DealCard with `WAITING X/Y ATTEMPTS · Z BEFORE AUTO-NURTURE` copy and low/mid/near-threshold color states.
- [x] DealPanel added quick-log row using `POST /api/deals/:id/log-attempt` with No answer/Texted/Voicemail/Connected/Not interested actions.
- [x] Client validation passed: `cd client && npm run build`.
- [ ] Targeted ESLint for `DealPanel.tsx` still has pre-existing React Compiler errors around old synchronous `useEffect` state setters/manual memoization; not fixed in this M1.5 UI slice to avoid broad refactor.
- [x] Added inbound SMS engagement reset helper for active deals linked by `smsConversationId` / `leadId`, plus matched client deal fallback.
- [x] Added forward stage move reset in `moveDeal` with `engagement_reset` audit metadata.
- [x] Validation passed: `cd server && npx vitest run tests/dealContactAttempts.test.ts tests/dealControllerScope.test.ts tests/dealScopePolicy.test.ts` — 16/16 passed; `cd server && npm run build` passed; targeted backend ESLint 0 errors / existing warnings only.

### Data and backend

- [x] Add `Deal.contactAttempts` default `0`.
- [x] Add `Deal.contactAttemptThreshold` default `10`.
- [x] Add `Deal.lastEngagementAt`.
- [ ] Confirm canonical `followUpType` values/casing for `GHOSTED` and `LOST` before implementation.
- [x] Add `POST /api/deals/:id/log-attempt`.
- [x] Implement quick-log kinds:
  - no answer;
  - texted;
  - voicemail;
  - connected;
  - not interested.
- [x] `no_answer`, `texted`, `voicemail` increment attempts and append auto-note.
- [x] `connected` resets attempts and updates `lastEngagementAt`.
- [x] `not_interested` moves to `NURTURE`, sets lost semantics, does not increment counter.
- [x] Auto-move to `NURTURE` at threshold.
- [x] Reset attempts on substantive inbound SMS.
- [x] Reset attempts on connected action.
- [x] Reset attempts on manual forward stage move.
- [ ] Reset attempts on manual edit path from B.10.6.
- [x] Every change writes `DealEvent` audit metadata.
- [ ] Revive Queue compatibility preserved.

### UI

- [x] Render quick-log row in DealPanel.
- [x] Render waiting/attempt banner on DealCard.
- [x] Render attempt status in DealPanel.
- [x] Banner text: `WAITING X/Y ATTEMPTS · Z BEFORE AUTO-NURTURE`.
- [x] Color ratio states:
  - low/yellow;
  - mid/orange;
  - near-threshold/red pulse.
- [x] Quick-log buttons match `quick-log-row` / `ql-btn` visual target.
- [x] Attempt banner matches `nurture-banner` / `nu-urg` visual target.

### M1.5 Testing Gate

- [x] Each quick-log action tested by API.
- [ ] Each quick-log action tested from UI.
- [x] Threshold auto-move tested.
- [x] Reset on inbound tested.
- [x] Reset on connected tested.
- [x] Reset on forward stage move tested.
- [ ] Revive Queue still works.
- [ ] Pixel-close compare for quick-log row and attempt banner.
- [x] Progress dashboard updated.

## M1.6 — M1 Full Regression And Release Gate

### Functional regression

- [ ] Login/auth full pass.
- [ ] Pipeline simple mode pass.
- [ ] Pipeline execution mode pass.
- [ ] Deal card pass.
- [ ] Deal panel pass.
- [ ] Drag/drop pass.
- [ ] New deal creation pass.
- [ ] Deal sharing pass if in current implementation.
- [ ] Funding history pass.
- [ ] Inbox AI unaffected.
- [ ] Email/Gmail CTA unaffected.
- [ ] Follow-up timing unaffected.
- [ ] Quiet hours unaffected.
- [ ] Inbound ownership unaffected.
- [ ] Socket scoping unaffected.

### Visual regression

- [ ] Desktop 1440px Pipeline screenshot compare.
- [ ] Half-screen 960px Pipeline screenshot compare.
- [ ] DealPanel screenshot compare.
- [ ] DealCard screenshot compare.
- [ ] No overlapping text.
- [ ] No layout shift when badges/attempt banners appear.
- [ ] Sidebar remains unchanged unless intentionally touched.

### Release readiness

- [ ] Server tests pass.
- [ ] Client build passes.
- [ ] Relevant DB migration reviewed as additive.
- [ ] Rollback note prepared.
- [ ] Evidence screenshots saved.
- [ ] Demo script prepared for JB/client.
- [ ] Progress dashboard updated to M1 complete only after all gates pass.

## M2.1 — Leads/Campaign Access And Source Fixes

### Implementation evidence — 2026-05-02

- [x] Affected files: `server/src/controllers/leadController.ts`, `server/src/controllers/campaignController.ts`, `client/src/pages/LeadsPage.tsx`, `client/src/pages/CampaignsPage.tsx`, `server/tests/leadCampaignScope.test.ts`.
- [x] Regression surface: Leads list/get/update/import/bulk/tag/export scope; Campaigns list/get/create/update/start/pause/cancel/analytics/sync scope; Campaigns delete UI visibility; Leads Source display fallback.
- [x] Focused tests passed: `cd server && npx vitest run tests/leadCampaignScope.test.ts` — 5/5 passed.
- [x] Build passed: root `npm run build` — server `tsc` + client `tsc && vite build`.
- [ ] Browser smoke pending for admin/rep Leads and Campaigns views.
- [ ] CSV import smoke pending with two real rep accounts.

### Leads ownership bug

- [x] In `server/src/controllers/leadController.ts`, verify both `importCSV` and `importMappedCSV`.
- [x] On REP create, set `assignedRepId = req.user.id` for newly uploaded leads.
- [x] On ADMIN create, preserve admin/global behavior according to spec.
- [x] On update/upsert existing lead by phone, do not overwrite existing `assignedRepId` silently.
- [x] Rep Leads tab returns only leads assigned/uploaded by that rep.
- [x] Admin Leads tab returns all leads.
- [x] Manager behavior documented: manager keeps admin-like global visibility for M2.1 unless JB narrows manager scope later.

### Campaign ownership bug

- [x] In `server/src/controllers/campaignController.ts`, apply rep-scope to list/get/analytics/start/pause/cancel/syncStatuses.
- [x] Rep sees only campaigns where `createdById = current_user_id`.
- [x] Admin sees all campaigns across reps.
- [x] Rep cannot GET another rep campaign.
- [x] Rep cannot start/pause/cancel/sync another rep campaign.
- [x] `ensureRetargetAccess` remains compatible.

### Source readable fix

- [x] Leads table Source column shows readable list/campaign name, not UUID.
- [ ] Source examples match prototype:
  - `CJ 10.8 12K / Verizon list`;
  - `FDR Apr / FDR scrubbed`;
  - `Lead Hoop / Lead Hoop list`;
  - `Renewal Queue / Renewal · prior`.
- [x] Existing UUID-only sources mapped to readable fallback where possible.
- [x] Import flow stores list name as source for future leads.
- [ ] Campaign-created leads preserve campaign/list lineage.

### M2.1 Testing Gate

- [ ] Rep AN uploads CSV -> sees uploaded leads immediately.
- [ ] Rep HB cannot see AN leads.
- [ ] Admin JB sees all leads.
- [ ] Rep AN sees only AN campaigns.
- [x] Rep HB cannot open AN campaign detail.
- [ ] Admin JB sees all campaigns.
- [ ] Source column before/after checked against prototype.
- [x] API permission tests pass.
- [x] Progress dashboard updated.

## M2.2 — Leads Enrichment Columns And Export CSV

### Implementation evidence — 2026-05-02

- [x] Backend Leads list now returns `enrichment` for each lead: industry, monthly revenue, revenue source, last contact timestamp, rep initials, contact direction, readable source primary/secondary.
- [x] Enrichment uses existing schema only: `Lead.customFields`, `Deal.client.monthlyRevenue`, `Conversation.extractedIndustry`, `Conversation.extractedRevenue`, `Conversation.aiSignals`, latest message attribution, import-list tags, and campaign lineage.
- [x] CSV import mapping now accepts optional Industry, Monthly Revenue, and Annual Revenue fields and stores them in `customFields` for enrichment/export without a migration.
- [x] Leads table now includes retained M2.2 columns: Last Contact, Industry, Monthly Revenue, Source, Added.
- [x] Leads export button uses current search/status/list filters and downloads `/leads/export` as CSV blob.
- [x] Export endpoint includes enrichment columns and preserves REP scope.
- [x] Focused tests added in `server/tests/leadEnrichmentExport.test.ts` for list enrichment and export headers/rows/scope.
- [x] Validation passed: `cd server && npx vitest run tests/leadEnrichmentExport.test.ts tests/leadCampaignScope.test.ts` — 7/7 passed, with known local Redis `ECONNREFUSED` warning only.
- [x] Validation passed: root server `npm run build`; client `cd client && npm run build`.
- [x] Targeted ESLint passed with 0 errors and existing warning debt only.

### Leads table columns

- [x] Preserve existing Leads page layout and only add retained prototype columns.
- [x] Columns match prototype order:
  - Name;
  - Phone;
  - Status;
  - Last Contact;
  - Industry;
  - Monthly Revenue;
  - Source;
  - Added.
- [x] Last Contact shows rep attribution initials and relative time, e.g. `JB 2h ago`.
- [x] Industry renders extracted/classified value or `— unknown`.
- [x] Monthly Revenue renders raw/formatted revenue plus provenance chip:
  - AI;
  - CSV;
  - MANUAL.
- [x] Empty revenue renders `—`.
- [x] Source cell uses two-line readable source/list pattern.
- [ ] Status pill styles match prototype.
- [ ] Avatar initials match prototype density.

### Data plumbing

- [x] Confirm data source for industry:
  - existing AI classifier field;
  - CSV value;
  - manual override.
- [x] Confirm data source for monthly revenue:
  - existing AI extraction;
  - CSV import;
  - manual field.
- [x] Define priority when values conflict: manual > CSV > AI unless spec says otherwise.
- [x] Last Contact uses latest meaningful contact and preserves admin attribution.
- [x] Rep scope applies to all enrichment queries.

### Export CSV

- [x] Export button label includes filtered count, e.g. `Export CSV 12 leads`.
- [x] Export respects current search.
- [x] Export respects status filter.
- [x] Export respects list/source filter.
- [x] Export respects rep scope.
- [x] Export includes new columns:
  - last contact;
  - last contact rep;
  - industry;
  - monthly revenue;
  - revenue source;
  - readable source/list.
- [x] Export does not leak admin-only or other-rep leads to rep user.
- [x] CSV escaping handles commas, quotes, line breaks.

### M2.2 style isolation

- [ ] Check whether existing styles apply correctly to new columns.
- [ ] If not, create a scoped Leads/Campaigns style set.
- [x] Do not modify sidebar layout/classes for this section.
- [x] Verify table remains readable at desktop and half-screen widths by fixed min-width/overflow-safe columns.
- [x] Ensure text truncation/line wrapping is deliberate and not overlapping.

### M2.2 Testing Gate

- [ ] Admin Leads table matches prototype visually.
- [ ] Rep Leads table matches prototype visually with scoped data.
- [ ] Last Contact values checked against DB.
- [ ] Industry/revenue values checked against classifier/manual/CSV sources.
- [x] Export CSV checked with filters in focused controller test.
- [ ] Export CSV opened and columns verified.
- [ ] Pixel-close compare with Leads prototype.
- [x] Progress dashboard updated.

## M2.3 — AI Retarget Campaigns

### Implementation evidence — 2026-05-02

- [x] Added live AI cohort API foundation without DB migration: `GET /api/campaigns/ai-cohorts`, `GET /api/campaigns/ai-cohorts/:cohortId/preview`, `POST /api/campaigns/ai-cohorts/:cohortId/build`.
- [x] Added three deterministic analytical cohort engines: multi-retarget, new restaurants, and admin-only renewals.
- [x] Cohort queries exclude deleted, opted-out, suppressed, and DNC leads and apply rep lead scope for REP users.
- [x] Cooldowns are applied before count/build: 7 days for multi-retarget/new cohorts, 30 days for renewals.
- [x] AI cohort build creates a DRAFT campaign only; it does not auto-send or queue SMS.
- [x] AI-built campaign lineage is stored through existing `Campaign.description` + `isRetarget` fields and surfaced as `AI Cohort · N leads · ~X funded expected`.
- [x] Campaigns UI now renders AI Retarget Suggestions above All Campaigns, preview modal, Build Campaign action, AI badge, and lineage marker.
- [x] Focused tests added in `server/tests/campaignAiCohorts.test.ts` for admin cohorts, REP renewal exclusion, and draft campaign build.
- [x] Validation passed: `cd server && npx vitest run tests/campaignAiCohorts.test.ts tests/leadCampaignScope.test.ts tests/leadEnrichmentExport.test.ts` — 10/10 passed, with known local Redis `ECONNREFUSED` warning only.
- [x] Validation passed: root `npm run build` including server and client build.
- [x] Targeted ESLint passed with 0 errors and existing warning debt only.
- [x] Cap edge coverage added: REP per-campaign trim to 500 and rolling 24h daily cap exhaustion error with requested/cap/dailyUsed/remaining details.
- [x] Validation passed: `cd server && npx vitest run tests/campaignAiCohorts.test.ts` — 5/5 passed after cap tests; server build passed.

### Scope lock for AI Retarget

- [x] Confirm current scope follows v3 prototype Phase 3 only.
- [x] Do not add suppressed leads zone, list management, multi-owner, or extra cohort bar.
- [x] Admin view can build all-campaigns cohorts.
- [x] Rep view behavior respects createdBy/ownership rules.
- [x] Treat Phase 3 as data intelligence pipeline, not UI-only work.
- [x] Confirm Phase 1 access fixes are complete before Phase 3 cohort generation:
  - lead `assignedRepId` correctness;
  - campaign `createdById` scoping correctness.

### Database model

- [ ] Add `lead_cohorts` / `LeadCohort` model if not already present.
- [ ] Store `userId`.
- [ ] Store `cohortType`: multi-retarget / new cohort / renewal.
- [ ] Store title and description.
- [ ] Store query JSON or resolved criteria metadata.
- [ ] Store source campaigns/source attribution.
- [ ] Store predicted reply rate.
- [ ] Store predicted funded deals / expected funded count.
- [ ] Store historical anchor line data.
- [ ] Store AI reasoning.
- [ ] Store resolved lead count.
- [ ] Store total match count and cap-trim metadata.
- [ ] Store daily remaining capacity at generation.
- [ ] Store `expiresAt` around 24h.
- [ ] Add indexes for user/expiry and active cohort lookup.
- [ ] Ensure expired cohorts are ignored safely.

### Cohort generation

- [x] Build/verify all-campaigns cohort source across relevant past campaigns.
- [x] Generate `Cross-rep retarget — replied with $80K+ revenue, stalled at docs` style cohort.
- [x] Generate `Restaurants · $80K+ rev · never contacted across all rep imports` style cohort.
- [x] Generate `Funded 8-12 mo ago · likely renewals · admin-only` style cohort.
- [x] Implement three separate analytical query engines:
  - multi-campaign retarget;
  - new cohorts from unsent leads;
  - renewal candidates.
- [x] Each query joins only the required campaign/lead/funded/deal data and remains performant.
- [x] Each cohort includes:
  - lead count;
  - predicted reply rate;
  - expected funded deals;
  - historical anchor line;
  - AI reasoning line;
  - override/cooldown warning when applicable.
- [x] Exclude opted-out, DNC, suppressed leads.
- [x] Respect recent retarget cooldown and admin override warning semantics.
- [x] Ensure predicted funded deals are traceable to historical anchor, not arbitrary text.

### Cooldowns and compliance

- [x] Enforce 7-day cooldown for multi-retarget and new cohort contact history.
- [x] Enforce 30-day cooldown for renewal candidates.
- [x] Track contact event timestamps across all campaigns for each lead.
- [x] Surface cooldown countdown/override warning in UI where prototype expects it.
- [x] Ensure cooldown logic applies before cohort count and before campaign build.
- [x] Verify no cohort can re-contact opted-out, DNC, suppressed, or too-recent leads.

### Two-layer send caps

- [x] Enforce per-campaign cap server-side for AI cohort build:
  - rep: 500;
  - admin: 3000.
- [x] Enforce rolling 24-hour daily total cap server-side for AI cohort build:
  - rep: 800;
  - admin: 4500.
- [x] Daily total uses rolling 24h window, not calendar day reset.
- [x] Cap errors include requested/cap/role/dailyUsed/remaining details.
- [x] UI displays current daily capacity and nearly-full state.
- [x] Cohort card lead count reflects current remaining capacity at render/build time.

### AI reasoning and cron

- [ ] Use Anthropic Claude Sonnet 4.5 for cohort reasoning.
- [ ] Reasoning prompt includes filter criteria, anonymized sample leads, and funded history aggregates.
- [x] Reasoning output is 1-2 business-specific sentences, not generic boilerplate.
- [ ] Cache reasoning for 24h.
- [ ] Scheduled job runs every 15 minutes.
- [ ] Cron runs per user: admin + each active rep.
- [ ] Cron is non-blocking, idempotent, and failure-tolerant.
- [ ] Cron handles 8 users x 3 cohorts without blocking API/server responsiveness.
- [ ] Log failures per user/cohort without breaking other cohorts.

### UI

- [x] AI Retarget Suggestions section appears above All Campaigns list.
- [x] Section subtitle shows all-reps campaign base and refresh time.
- [x] Three cards render with correct priority labels.
- [x] Cards show live capacity data.
- [x] Cards show cohort-trim messaging when cap is lower than match count.
- [x] Cards show daily capacity nearly full messaging.
- [x] Preview button opens intended preview flow or documented placeholder.
- [ ] Build Campaign opens existing New Campaign modal with preloaded lead set.
- [x] AI-built campaigns appear in All Campaigns table.
- [x] AI-built campaigns show `AI` badge.
- [x] AI-built campaigns show lineage marker, e.g. `↻ from AI Cohort · 487 leads · ~6 funded expected`.
- [ ] Existing campaign actions still work: rerun/refresh, start, pause, delete where allowed.

### Backend/API

- [x] Add/verify endpoint for AI cohorts.
- [x] Add/verify endpoint to resolve cohort to lead ids.
- [x] Ensure cohort build does not bypass campaign caps or compliance guards.
- [ ] Ensure build campaign path uses existing campaign creation validation.
- [x] Ensure created campaign stores lineage metadata.
- [x] Ensure rep users cannot use admin-only renewal/cross-rep cohorts unless explicitly allowed.
- [x] Existing campaign send path remains unchanged downstream of preloaded leads.
- [x] AI Retarget is upstream recommendation only; no auto-send.

### M2.3 Testing Gate

- [x] Admin sees all 3 AI Retarget cohorts in focused API test.
- [x] Rep sees only allowed/scoped cohorts in focused API test.
- [ ] Preview flow tested.
- [x] Build Campaign flow tested in focused API test.
- [ ] New AI-built campaign appears in All Campaigns list.
- [ ] Lineage marker verified.
- [x] Cooldown/override warning verified in focused API test.
- [x] Compliance exclusions verified by query constraints and focused build/list tests.
- [x] Per-campaign caps tested for rep path.
- [x] Rolling 24h daily caps tested for rep path.
- [ ] Expired cohorts ignored after 24h.
- [ ] Cron failure for one cohort does not break other cohorts.
- [ ] AI reasoning is cached and not regenerated unnecessarily.
- [ ] Pixel-close compare with Campaigns prototype.
- [x] Progress dashboard updated.

## M2.4 — M2 Full Regression And Release Gate

### Functional regression

- [ ] Leads import still works.
- [ ] Add Lead still works.
- [ ] Existing Leads search works.
- [ ] Existing Status filter works.
- [ ] Existing Lists filter works.
- [ ] Campaign list search works.
- [ ] Campaign status filter works.
- [ ] New Campaign modal still works.
- [ ] Campaign start/pause/cancel actions still work.
- [ ] Campaign analytics/detail still works.
- [ ] Inbox reply/campaign reply linking still works.
- [ ] Retarget suppression still works.
- [ ] Template guards still block unresolved `{{...}}` and test messages.

### Visual regression

- [ ] Leads admin screenshot pixel-close compared to prototype.
- [ ] Leads rep screenshot pixel-close compared to prototype after switching `Rep view (HB)` equivalent.
- [ ] Campaigns admin screenshot pixel-close compared to prototype.
- [ ] Campaigns rep screenshot pixel-close compared to prototype.
- [ ] Sidebar/menu unchanged.
- [ ] No table overflow at half-screen width.
- [ ] Buttons/icons match prototype density and spacing.
- [ ] No unreadable text if current styles fail; scoped style set added if needed.

### Release readiness

- [ ] Server tests pass.
- [ ] Client build passes.
- [ ] Browser smoke pass for Leads.
- [ ] Browser smoke pass for Campaigns.
- [ ] Export CSV smoke pass.
- [ ] Permission negative cases pass.
- [ ] Evidence screenshots saved.
- [ ] Demo script prepared for JB/client.
- [ ] Progress dashboard updated to M2 complete only after all gates pass.

## Full Final Acceptance

- [ ] Overall progress dashboard shows 100% only after M1 and M2 release gates pass.
- [ ] M1 Login/Auth works for admin and rep.
- [ ] M1 Pipeline v2 works with correct data isolation and no stage/metric regression.
- [ ] M1 Pipeline AI badges and auto-nurture behavior match confirmed scope.
- [ ] M2 Leads table matches v3 prototype scope.
- [ ] M2 Campaigns AI Retarget matches v3 prototype scope.
- [ ] Side menu remains unaffected.
- [ ] No hidden scope creep from older docs is shipped without approval.
- [ ] Pixel-close evidence exists for all retained prototype elements.
- [ ] Regression evidence exists for all previously painful client issues.
- [ ] Final client-facing summary prepared with what changed, how it was tested, and what is intentionally out of scope.

## Progress Update Log

| Date       | Progress | Area     | What changed                                                                                                                       | Evidence  |
| ---------- | -------: | -------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 2026-05-02 |       6% | Planning | Consolidated M1/M2 sources, previous checklists, Pipeline v11 handoff, and Leads/Campaigns v3 prototype into one master checklist. | This file |
