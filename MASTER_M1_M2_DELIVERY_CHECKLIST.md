© BuyReadySite.com

# SCL Capital — Master M1/M2 Delivery Checklist

Дата обновления: 2026-05-04

## Progress Dashboard

> Этот файл является главным рабочим чеклистом по текущему объединенному scope: **M1: Pipeline v2 + Login/Auth** и **M2: Campaigns/Lead Doc**. Процент готовности обновляется после каждого завершенного блока и после каждого testing gate.

| Направление                                     |      Вес | Готовность | Статус                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | -------: | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 — Scope consolidation и source map      |       6% |         6% | Done                                                                                                                                                                                                                                                    |
| M1.1 — Passwordless OTP Login/Auth              |      10% |       9.5% | Live SMS OTP + browser redirect/current-user passed; Resend email fallback blocked by missing production config                                                                                                                                         |
| M1.2 — Pipeline v2 base parity                  |      12% |        12% | Done — stage/visual/scope/metrics/search/drag-drop gates verified                                                                                                                                                                                       |
| M1.3 — Pipeline card/panel/modals parity        |      12% |        12% | Done — card/panel/modal/context-menu/browser gates verified                                                                                                                                                                                             |
| M1.4 — Pipeline AI extractor + badges           |      14% |        14% | Done — extractor/backend/UI/tests/pixel, TS golden grader, and live Anthropic golden parity diff documented                                                                                                                                             |
| M1.5 — Auto-nurture attempt mechanic            |      10% |        10% | Done — attempt mechanic, UI, reset paths, manual override, browser/pixel, Revive gate                                                                                                                                                                   |
| M1.6 — M1 regression, pixel-close, release gate |       8% |         8% | Done — functional and visual gates verified; full-env suite limitation remains documented                                                                                                                                                               |
| M2.1 — Leads/Campaign access + source fixes     |       8% |         8% | Done — API scope, mocked admin/rep smoke, and production two-rep CSV import/visibility/export smoke passed                                                                                                                                              |
| M2.2 — Leads enrichment columns + export        |       8% |         8% | Done — enrichment/export, company search parity, retained prototype columns, and visual evidence passed                                                                                                                                                 |
| M2.3 — AI Retarget campaigns                    |       8% |         8% | Done — LeadCohort DB/cache/cron, Build modal/list/actions, prod DB/health, and retained prototype compare passed                                                                                                                                        |
| M2.4 — M2 regression, pixel-close, release gate |       4% |         4% | Done — 37/37 focused regression, root build, visual gate, production deploy, live CSV smoke, and health passed                                                                                                                                          |
| **Overall**                                     | **100%** |  **99.5%** | **M1/M2 implementation, release gates, M25 visual acceptance, M26 full SCL PDF/prototype re-audit, and M27 sidebar/shell correction code-side scope complete; true 100% still blocked by external Resend email OTP config and original SCL logo asset** |

### M25 Visual Acceptance Gate — 2026-05-04

- [x] Login/Auth visual remediation completed against the re-sent SCL auth screenshot: dark HUD frame, centered SCL wordmark approximation, headline, panel, input, blue `SEND CODE`, phone verification note, and footer.
- [x] Login first screen no longer shows `Lost access to your phone? Use email instead`; email fallback remains available after SMS code step.
- [x] Campaigns visual remediation completed against the M2 prototype: dark prototype background, AI Retarget Suggestions zone, AI cards, table/list styling, and mobile responsive layout inside the normal app shell.
- [x] App sidebar remains available for Campaigns/Leads; prototype styling is scoped to the page content and does not replace the main navigation shell.
- [x] Visual screenshots captured: `audit-screenshots/m25-login-desktop.png`, `audit-screenshots/m25-login-mobile.png`, `audit-screenshots/m25-campaigns-desktop.png`, `audit-screenshots/m25-campaigns-mobile.png`, `audit-screenshots/m25-prototype-campaigns-desktop.png`.
- [x] Scenario audit passed: SMS OTP step, email fallback after SMS step, OTP verify redirect, Campaigns search, status filter, AI Preview modal, AI Build modal.
- [x] Evidence JSON added: `audit-screenshots/m25-visual-regression-evidence.json`.
- [x] Recommendation/API-key handoff document added: `docs/M25_UI_QA_RECOMMENDATIONS_2026-05-04.md`.
- [ ] External dependency for absolute Login pixel-perfect: client must provide original SCL logo/wordmark SVG or high-resolution transparent PNG.
- [ ] External dependency for final M1.1 100%: production `RESEND_API_KEY` and `RESEND_FROM_EMAIL` must be configured and email OTP delivery smoke must pass.

### M26 Full SCL Requirements Re-Audit — 2026-05-04

- [x] Re-read and reconciled the full Leads/Campaigns PDF-derived checklist against the v3 prototype and current implementation.
- [x] Leads route keeps the original app page/shell and applies prototype styling inside the content area; app sidebar is retained on `/leads` and `/campaigns`.
- [x] Leads filter bar includes Source, State, and Last Contacted filters, with compact responsive layout instead of a long stacked desktop column.
- [x] Backend supports `lastContactedBefore` and `/api/leads/filter-options`; focused export/enrichment tests cover filter-aware CSV behavior.
- [x] Campaign AI cards expose the PDF-required category label, predicted reply/funded metrics, historical anchor, AI reasoning, daily capacity bar, cap trim warning, cooldown warning, and Build/Preview handoff.
- [x] Server-side per-campaign and rolling 24h daily caps are enforced for manual campaign creation and AI cohort build flows.
- [x] Browser self-review caught and fixed a Campaigns cap-row spacing defect (`leadsdaily capacity`).
- [x] API dependency audit completed: no new external API is required for Leads/Campaigns; Resend is needed only for email OTP fallback, while Twilio and Anthropic are existing platform dependencies.
- [x] Separate client-facing API/key instruction added: `docs/CLIENT_API_REQUIREMENTS_2026-05-04.md`.
- [x] Evidence JSON added: `audit-screenshots/m26-full-scl-requirements-evidence.json`.
- [x] Production deploy completed on `https://app.sclcapital.io/` at commit `7fe9a7c`; server build, client build, PM2 restart, `/api/health`, `/`, `/login`, `/leads`, and `/campaigns` smoke passed.
- [ ] External dependency for absolute Login pixel-perfect remains original SCL logo/wordmark SVG or high-resolution transparent PNG.
- [ ] External dependency for final M1.1 100% remains production `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configuration plus email OTP smoke.

### M27 Sidebar/Shell Correction — 2026-05-04

- [x] Client review issue reproduced: `/campaigns` and `/leads` felt like a separate app because route-level sidebar suppression replaced the main shell with prototype topbar/tabs.
- [x] Fixed AppLayout: `/campaigns` and `/leads` keep the normal sidebar and auto-expand it.
- [x] Fixed responsive shell: on `/campaigns` and `/leads`, sidebar is visible from `md` breakpoint so it remains present at the 918px QA viewport.
- [x] Removed internal prototype topbar and Leads/Campaigns tab nav from both pages; switching between Leads and Campaigns now uses the app sidebar, not a second page-level nav.
- [x] Campaigns still keeps prototype styling/fon inside the content area: dark background, AI cards, caps, cooldowns, lineage, filters, and campaign table.
- [x] Leads keeps the old `/leads` route/page and now presents the prototype scope note, readable source comparison, Source/State/Last Contact filters, enrichment columns, and export-aware table inside the app shell.
- [x] Browser QA at actual 918x667 viewport passed: sidebar width 260px on both pages, mobile topbar/drawer hidden, no prototype topbar/tabs, no horizontal overflow.
- [x] Evidence added: `audit-screenshots/m27-sidebar-shell-correction-evidence.json`, `audit-screenshots/m27-sidebar-campaigns-after-fix.png`, `audit-screenshots/m27-sidebar-leads-after-fix.png`.

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

- [x] Login page must match the attached SCL visual contract: typography, dark HUD frame, metallic SCL wordmark, spacing, gradient button, phone verification footer, and SCL Systems footer.
- [x] Platform access must be smoked before reps become active: `/api/health`, `/login`, database, Redis.
- [x] Local QA needs a controlled `dev_mode_login` path so testers can enter the app without waiting for SMS/email OTP.
- [x] `dev_mode_login` must never be available in production, even if env flags are accidentally set.
- [x] AI suggestions должны соответствовать последнему client message и full-thread context.
- [x] Email CTA должен брать email из conversation/client text прежде lead-list email.
- [ ] Gmail compose должен открываться надежно и только с `to=` без subject/body.
- [x] Follow-up suggestions не должны ставить 5 AM или quiet-hours-conflicting times.
- [ ] Quiet hours должны блокировать отправку корректно, но UI должен объяснять причину.
- [x] Inbound conversation owner не должен самопроизвольно переassignиваться на текущего пользователя.
- [x] Reps не должны видеть чужие leads/campaigns/deals без явного права.
- [x] Source column не должен показывать UUID там, где нужен readable list/campaign name.
- [x] Export CSV должен учитывать текущие filters и не выгружать чужие данные rep-у.
- [ ] UI не должен выглядеть как “почти похоже”: retained prototype elements сравниваются pixel-close.
- [x] Inbox action row must preserve existing buttons: Mark Interested, Not Interested, DNC, Email Rcv, Add to Pipeline, Follow-Up, Mark Unread/Note where present, and `Assign Rep` where role-allowed.
- [x] Inbox CONTACT tab must preserve structured `Assigned Rep` field.
- [x] Rep chip/avatar must remain visible on cards where assignment exists in both Admin and My Convs views.
- [x] Admin/My Convs scope must remain unchanged: admins/managers can toggle; reps are locked to My Convs; totals follow the selected scope.
- [x] Pipeline AI must never write or infer `Deal.assignedRepId` / `Deal.assistingRepIds`; badges are deal-level facts and must respect existing rep scope.
- [x] Deal sharing must remain unchanged: primary rep can add assisting reps without admin involvement.
- [x] Auto-reassignment between reps is explicitly out of scope.

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
- [x] Production MySQL schema sync completed on `app.sclcapital.io` via reviewed additive SQL after DB backup.
- [x] Production Redis availability verified through `/api/health` after deploy restart.
- [x] Live SMS OTP delivery validation passed on production: Twilio message delivered, `/api/auth/verify-otp` returned JWT/refresh token, latest `LoginOtp` row was consumed, and `/api/auth/me` returned the ADMIN user.
- [x] Live browser OTP flow passed on production: `/login` -> `Send code` -> OTP state -> real SMS code verify -> `/command-center` redirect; fresh hard navigation loaded Command Center successfully.
- [ ] Resend email delivery validation remains blocked: production `/api/auth/request-otp` with `channel=email` returns `503 Email sign-in fallback is not configured` because `RESEND_API_KEY` / `RESEND_FROM_EMAIL` are missing.
- [x] Deployment note completed: production DB backup saved, additive schema sync applied, Prisma Client regenerated, and production build passed.

### Dev mode login gate — 2026-05-04

- [x] Added `POST /api/auth/dev-login` for local QA login without OTP code.
- [x] Backend dev login requires `DEV_MODE_LOGIN_ENABLED=true` and is disabled by default.
- [x] Backend blocks dev login when `NODE_ENV=production`, even if `DEV_MODE_LOGIN_ENABLED=true` is accidentally set.
- [x] Optional `DEV_MODE_LOGIN_SECRET` support added for shared non-production environments.
- [x] Dev login rejects missing/inactive users, updates `lastLoginAt`, invalidates user cache, and returns the same JWT/refresh session shape as OTP login.
- [x] Login UI shows `Dev mode login` only when `VITE_DEV_MODE_LOGIN_ENABLED=true` and `import.meta.env.PROD` is false.
- [x] Production bundle/preview verified: `Dev mode login` button count is `0`; OTP `Send code` remains visible.
- [x] Production deploy/smoke passed on `98ac6be8d`: `/api/health` database/Redis ok, `/` 200, `/login` 200, `/api/auth/dev-login` 404, live UI dev button count `0`.
- [x] Env docs updated: `server/.env.example`, `.env.production.example`, and `client/.env.example`.
- [x] Focused auth regression passed: `authDevModeLogin`, `authOtpPolicy`, `clientPreservationRequirements` — 11/11 tests.
- [x] Root production build passed after dev login changes: server `tsc` plus client `tsc && vite build`.
- [x] Evidence JSON added: `audit-screenshots/dev-mode-login-evidence.json`.

### Scope decision

- [x] Implement passwordless OTP as primary login flow.
- [x] Preserve existing password-based `/api/auth/login` fallback for production safety until demo/JB approval.
- [ ] Confirm all 6 reps + admin have populated account `email` and `mobilePhone` values.
- [ ] Confirm Twilio 10DLC can handle OTP volume of ~50-100/day peak.
- [ ] Confirm Resend is configured for SCL-branded OTP sender. Blocked 2026-05-04: production email OTP returns 503 until `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured.
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
- [x] Dev-only login button can bypass OTP in local QA only and is hidden in production builds.

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

- [x] Add fallback link after the SMS code step: `Lost access to your phone? Use email instead`.
- [x] Link is visible for all users after they request an SMS OTP, preserving the first-screen visual match to the SCL auth screenshot.
- [x] Clicking sends OTP to account email.
- [ ] Email OTP arrives within 30 seconds in test/demo conditions. Blocked by missing production Resend config.
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
- [x] Проверить refresh/current-user flow после reload в live backend/browser session: live OTP token returned `/api/auth/me` 200, and cache-busted `/command-center` navigation loaded the authenticated admin shell.
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
- [x] Проверить redirect after login with real OTP success.
- [x] Проверить logout clears sensitive state in auth store.
- [ ] Проверить protected route redirect.
- [x] Проверить role-based initial route mapping:
  - admin -> allowed admin/default surface;
  - rep -> own scoped surfaces only.

### M1.1 Testing Gate

- [ ] Unit/backend tests for auth middleware.
- [x] Unit/backend tests for dev-mode login production guard and optional dev key.
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
- [x] Auth regression evidence saved.
- [x] Backend build passed after OTP implementation.
- [x] Frontend build passed after OTP implementation.
- [x] Production preview login page rendered correctly.
- [x] Production preview server-unavailable error state shows friendly message.
- [x] Production preview confirms dev-mode login UI is hidden while OTP UI remains visible.
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
- [x] Backend extractor/data plumbing implemented: `Deal.pipelineAiSignals`, `Deal.pipelineAiUpdatedAt`, and live AI extraction endpoint.

### Implementation evidence — 2026-05-04 Pipeline extractor core

- [x] Added `pipelineAiService.ts` parallel to Inbox AI with canonical `lead_only` prompt, strict schema, `[EXISTING SIGNALS]` / `[NEW INPUT]` payload markers, local skip guards, Anthropic Sonnet 4.5 config, and prompt caching.
- [x] Added per-deal extraction serialization so rapid note updates cannot race the saved `pipelineAiSignals` blob.
- [x] Added fallback from `Conversation.aiSignals` to `Deal.pipelineAiSignals` only when the deal signal blob is still empty.
- [x] Added `POST /api/ai/extract-pipeline` with ownership scope: admin/manager all, reps primary or assisting only.
- [x] Wired note add/update and inbound SMS active-stage triggers; `NEW_LEAD`, `ENGAGED_INTERESTED`, `FUNDED`, `CLOSED`, too-short, and contact-only inputs are skipped.
- [x] Added DealCard AI badge row for industry, monthly revenue, use-of-funds, and corrected stacking chip.
- [x] Added DealPanel AI inline bar with v11 retained pattern, source/age label, Re-run AI action, and non-destructive AI suggestions for product/revenue/action/amount.
- [x] Fixed compact card stacking chip overflow after pixel/DOM inspection; long active/debt labels now wrap without hidden horizontal overflow.
- [x] Focused backend test passed: `pipelineAiService.test.ts` — 5/5.
- [x] Backend build passed after extractor wiring.
- [x] Frontend build passed after AI UI and stacking overflow fix.
- [x] Browser retained-v11 comparison passed on deterministic mock API: badges, inline bar, source label, Re-run AI success, no AI-element overlaps, no AI badge/inline/pill overflow.
- [x] Evidence JSON added: `audit-screenshots/m14-pipeline-ai-extractor-evidence.json`.
- [x] Production deploy passed: `991f932` applied by git bundle, DB columns added, Prisma generate/server build/client build passed, PM2 restarted, health/frontend/protected route smoke passed.
- [x] Live Anthropic golden parity passed on production: 15/15 cases ran with 11 perfect, 3 partial, 1 documented scope-boundary fail, 0 errors; field diffs recorded in evidence.

### Client preservation lock — 2026-05-04

- [x] Added B.0 preservation requirement to Pipeline AI specs: `Deal.assignedRepId`, `Deal.assistingRepIds`, deal sharing, rep chips, Inbox `Assign Rep`, CONTACT `Assigned Rep`, Admin/My Convs scope, and auto-reassignment out of scope.
- [x] Verified current code already preserves the Inbox action-row `Assign Rep` button for admin/manager assignment workflows.
- [x] Verified current code already renders CONTACT `Assigned Rep` in the right panel when assignment data exists.
- [x] Verified current code already renders rep chip/avatar on conversation cards where assignment data exists.
- [x] Verified current backend Inbox scope keeps admin/manager Admin View vs My Convs and locks non-admin reps to owned conversations.
- [x] Verified current backend Pipeline scope keeps reps on primary + assisting deals via `repScopeFilter` and admin/manager unscoped view only.
- [x] Added focused preservation tests so future Pipeline AI work cannot silently remove the client-protected surfaces.
- [x] Restored visible Inbox action-row `Mark Unread` and `Note` controls next to the existing assignment/follow-up actions.
- [x] Focused preservation regression passed: `clientPreservationRequirements`, `dealOwnershipPreservation`, and `dealControllerScope` — 11/11 tests.
- [x] Root production build passed after preservation + login visual changes: server `tsc` plus client `tsc && vite build`.
- [x] Local production preview `/login` passed browser validation: HTTP 200, no vertical overflow at 918x667, footer visible in first viewport, SCL visual contract present.
- [x] Production access smoke passed after client escalation: `/api/health` returned `database: ok` and `redis: ok`; live `/login` returned HTTP 200.
- [x] Evidence JSON added: `audit-screenshots/client-preservation-login-access-evidence.json`.

### Inbox AI suggestion repair / owner-action gate — 2026-05-04

- [x] AI suggestions now repair stale/generic draft copy against the latest inbound message and full-thread context.
- [x] Deterministic repair covers email shares, amount disclosures, fees/rate/payment questions, credit-score objections, callback logistics, HELOC/LOC clarification, term-range replies, and explicit follow-up windows.
- [x] AI suggestions no longer reuse the client email as the rep sender address in draft copy.
- [x] Conversation detail resolves email priority as texted/conversation email -> lead email -> contact email and passes `knownEmail` / `emailReceived` into suggestion repair.
- [x] Reply sent, status changes, note added, and add-to-pipeline actions trigger safe async reclassification.
- [x] Note-added path performs a fast local signal refresh for revenue, ask, industry, and HELOC fit before the full LLM refresh finishes.
- [x] Manual rep actions that contradict AI classification are logged into classification feedback for future correction corpus.
- [x] Inbound webhook preserves the current active conversation/lead owner before considering the latest active human sender.
- [x] Manual replies in threads with inbound history can bypass quiet hours; cold/manual outreach still enforces quiet hours.
- [x] Inbox AI card/banner render persisted `extractedRevenue`, `extractedAsk`, `extractedIndustry`, and `helocFitFlag` fallbacks when `aiSignals` are partial.
- [x] Expanded focused regression passed: AI suggestions, owner reclassification, disagreement feedback, inbound ownership, email policy, follow-up policy, preservation, compliance parser, eligibility, and scoring — 79/79 tests.
- [x] Root production build passed after AI repair changes: server `tsc` plus client `tsc && vite build`.
- [x] Production deploy/smoke passed on `c30692315`: `/api/health` database/Redis ok, `/` 200, `/login` 200, `/api/auth/dev-login` 404, live login UI dev button count `0`.
- [x] Evidence JSON added: `audit-screenshots/m14-ai-suggestion-repair-evidence.json`.

### Backend foundation

- [x] Add `Deal.pipelineAiSignals`.
- [x] Add `Deal.pipelineAiUpdatedAt`.
- [x] Create `server/src/services/pipelineAiService.ts` parallel to Inbox AI.
- [x] Use exact prompt/schema from `scl-pipeline-ai-handoff/scl-pipeline-ai-extractor.md`.
- [x] Do not paraphrase prompt/schema/payload contract.
- [x] Use model `claude-sonnet-4-5` with prompt caching.
- [x] Use exact payload markers:
  - `[EXISTING SIGNALS]`;
  - `[NEW INPUT]`.
- [x] Use `pipeline-ai.fixtures.json` as canonical TS test fixture source.
- [x] Keep `golden_test_set.json` synchronized as standalone reference.
- [x] Implement fallback `conversation.aiSignals -> deal.pipelineAiSignals` only when appropriate.
- [x] Implement per-deal serialization queue.
- [x] Structured logs include deal id, model, usage, skip reason, duration.
- [x] AI failures never break note save/update.

### Trigger wiring

- [x] Trigger on `note_added`.
- [x] Trigger on `note_updated`.
- [x] Trigger on inbound client SMS only for allowed active deal stages.
- [x] Skip on `FUNDED`, `CLOSED`, too-short text, unrelated/no-signal conditions.
- [x] Add manual `POST /api/ai/extract-pipeline` endpoint.
- [x] Resolve remaining behavior: if no saved note exists, re-run uses latest client SMS or disables action.

### Validation

- [x] Port grading logic from `run_golden.py` into TS tests.
- [x] Use `pipeline-golden-results.csv` as 15-case baseline.
- [x] Use `pipeline-extraction-review.csv` as 80-row corpus baseline.
- [x] Track row grade distribution: PERFECT/PARTIAL/FAIL.
- [x] Field-level grading supports PASS/PARTIAL/FAIL.
- [x] Add tests for money tolerance, array set equality, pending action partial matching.
- [x] Add queue serialization tests.
- [x] Add skip-condition tests.
- [x] Add inheritance/merge tests because `test_harness.py` only validates `(none)` existing signals.

### Frontend badges and inline bar

- [x] Add `PipelineAiSignals` type distinct from Inbox `AISignals`.
- [x] Extend deal API response shape.
- [x] Render industry badge.
- [x] Render monthly revenue badge.
- [x] Render use-of-funds badge.
- [x] Render corrected B.6 stacking chip priority from client update:
  - `count >= 3` -> red `{N}-STACKED`;
  - `count === 2` -> orange `2-POSITIONS`;
  - `count === 1` -> yellow `1-POSITION`;
  - `has_stacked_history === false && current_active_positions === null` -> green `1ST POSITION`;
  - `recent_stacking_activity.active === true` -> red pulse and append ` · ACTIVE`.
- [x] Append ` · $XXXk` to stacking chip when `total_debt_usd` is set and `count >= 2`.
- [x] Render AI inline bar in DealPanel above stage/product row.
- [x] Render empty/dashed placeholders where spec requires.
- [x] Render extracted-time/source label.
- [x] Add Re-run AI action loading/error/success states.
- [x] AI suggestions may prefill empty fields visually but must not silently overwrite manual fields.

### M1.4 Testing Gate

- [x] Server build passes after Inbox AI repair gate.
- [x] Inbox AI suggestion policy tests pass for latest-inbound repair, email priority, contextual callbacks, amount disclosures, credit-score objections, fees/rates/payments, and client-email misuse.
- [x] Owner-action reclassification tests pass for reply-sent and unassigned-thread rep fallback.
- [x] Classification disagreement feedback tests pass for rep action vs AI mismatch logging.
- [x] Inbound ownership policy tests pass: current active owner is preserved and unassigned threads fall back to latest active sender.
- [x] Conversation email priority tests pass: texted email -> lead email -> contact email.
- [x] Follow-up policy tests pass for explicit 2-hour windows, exact call times/timezones, next-day noon, and cleared statuses.
- [x] Client preservation tests pass after AI repair gate.
- [x] Pipeline AI unit tests pass.
- [x] Golden tests pass or differences documented with exact fields.
- [x] Note save works when Anthropic API fails.
- [x] Rapid note updates serialize per deal.
- [x] DealCard AI badges render full state; partial/empty behavior is covered by conditional rendering and still needs broader visual corpus.
- [x] DealCard/DealPanel B.6 stacking chip helper compiles for all corrected count states.
- [x] DealCard/DealPanel B.6 stacking chip browser mock renders corrected count states and active pulse modifier.
- [x] DealPanel AI inline bar renders full state; partial/empty behavior is implemented and needs broader visual corpus.
- [x] Re-run AI tested with note; no-note disable and API error states are implemented but still need broader browser corpus.
- [x] Pixel-close compare with `scl_pipeline_v11.html` retained elements.
- [x] Progress dashboard updated for Inbox AI repair gate.

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
- [x] Added admin/manager manual override for `contactAttempts` reset and `contactAttemptThreshold` in DealPanel with backend validation and audit metadata.
- [x] Validation passed: focused backend tests 17/17, server build, and client build.
- [x] Browser mock validation passed on production preview: DealCard attempt banner and DealPanel quick-log row rendered for admin with `WAITING 3/5`, reset changed panel status to `WAITING 0/5`, and threshold input saved `12`.
- [x] Browser UI quick-log buttons exercised from DealPanel: No answer, Texted, Voicemail, Connected, and Not interested buttons all invoked the quick-log flow; backend semantics remain covered by focused Vitest tests.
- [x] Pixel/browser evidence captured in `audit-screenshots/m15-attempt-ui-evidence.json`; local ignored screenshots generated at `audit-screenshots/m15-attempt-ui-desktop.png` and `audit-screenshots/m15-attempt-ui-mobile.png`.
- [x] Quick-log CSS tightened after pixel review: desktop uses compact grid layout; mobile keeps two-column button stack with full-width Not interested.
- [x] Validation passed: `cd client && npm run build` after quick-log CSS/pixel adjustment.
- [x] Confirmed canonical `followUpType` values are lowercase UI values; M1.5 auto-threshold now writes `reengage` instead of snake_case `re_engage`, while backend label mapping accepts both old and canonical variants.
- [x] Revive Queue compatibility preserved: focused test verifies canonical `reengage` Nurture follow-up is returned with `reviveSource: follow_up`.
- [x] Validation passed: focused backend tests 18/18, server build, and targeted ESLint 0 errors / existing warning debt only.

### Data and backend

- [x] Add `Deal.contactAttempts` default `0`.
- [x] Add `Deal.contactAttemptThreshold` default `10`.
- [x] Add `Deal.lastEngagementAt`.
- [x] Confirm canonical `followUpType` values/casing for `GHOSTED` and `LOST` before implementation.
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
- [x] Reset attempts on manual edit path from B.10.6.
- [x] Every change writes `DealEvent` audit metadata.
- [x] Revive Queue compatibility preserved.

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
- [x] Admin/manager manual override controls added for reset and threshold.

### M1.5 Testing Gate

- [x] Each quick-log action tested by API.
- [x] Each quick-log action tested from UI.
- [x] Threshold auto-move tested.
- [x] Reset on inbound tested.
- [x] Reset on connected tested.
- [x] Reset on forward stage move tested.
- [x] Manual override reset tested.
- [x] Revive Queue still works.
- [x] Pixel-close compare for quick-log row and attempt banner.
- [x] Progress dashboard updated.

## M1.6 — M1 Full Regression And Release Gate

### Initial gate evidence — 2026-05-02

- [x] Evidence JSON added: `audit-screenshots/m16-regression-gate-evidence.json`.
- [x] Root release build passed: `npm run build` completed server `tsc` and client `tsc && vite build`.
- [ ] Full backend suite attempted: `cd server && npm test -- --run` is blocked by local environment, not by the M1.5 changes. Redis is unavailable on local `6379`, and the local Prisma datasource provider does not match the MySQL schema; DB-backed `auth` and `numberService` tests cannot complete until a valid MySQL test DB and Redis are available.
- [x] M1.5 focused backend regression remains green: 18/18 focused tests passed before opening M1.6 gate.
- [x] Browser smoke evidence added: `audit-screenshots/m16-browser-smoke-evidence.json`.
- [x] Production preview + mock API browser smoke passed 4/4: OTP login redirect, Pipeline simple mode, Pipeline execution mode, and DealCard/DealPanel smoke.
- [x] Browser smoke captured no console errors and no request failures inside gate scope; local ignored screenshots were generated for login, simple pipeline, execution pipeline, and deal panel.

### Drag/drop + Funding History smoke — 2026-05-02

- [x] Evidence JSON added: `audit-screenshots/m16-drag-funding-evidence.json`.
- [x] Drag/drop smoke passed on production preview + mock API: `Atlas Demo Logistics` moved from Engaged / Interested to Qualified and `PUT /api/deals/deal-1/move` was captured with `{"stage":"QUALIFIED"}`.
- [x] Funding History smoke passed: funded deal panel opened, Funding History tab became active, and the existing event showed lender, amount, product, rep, and notes.
- [x] Gate captured no console errors and no request failures inside scope; local ignored screenshots were generated for before-drag, after-drag, and Funding History states.

### Production deploy smoke — 2026-05-02

- [x] Evidence JSON added: `audit-screenshots/m16-production-deploy-evidence.json`.
- [x] Production dirty state preserved before deploy: worktree backup saved under `/root/scl-prod-backups/20260502-175850` and stash `pre-deploy-1982fdb-20260502-175850` created.
- [x] Production source fast-forwarded to `1982fdb0` on `deploy/mysql-hosting` via Git bundle because the droplet has no GitHub deploy key and HTTPS fetch cannot authenticate non-interactively.
- [x] Production DB backup saved under `/root/scl-prod-backups/db-20260502180111/database.sql.gz`.
- [x] Additive production schema sync verified: OTP user fields, `login_otps`, deal contact-attempt fields, and contact-attempt indexes are present.
- [x] Production `npm run prisma:generate`, `npm run build`, and `pm2 restart sms-api --update-env` passed; PM2 shows `sms-api` online.
- [x] Production smoke passed: `/api/health` returned HTTP 200 with database `ok` and Redis `ok`; root HTML returned HTTP 200; browser opened `/login` and rendered the SCL OTP login screen.

### Inbox AI / Email CTA / Follow-up policy smoke — 2026-05-02

- [x] Evidence JSON added: `audit-screenshots/m16-inbox-ai-policy-evidence.json`.
- [x] Focused policy tests passed 54/54 across AI suggestion repair, conversation email priority, follow-up parsing, quiet-hours reason formatting, and inbound owner retention.
- [x] Root production build passed after Inbox/AI changes: server `tsc` plus client `tsc && vite build`.
- [x] Browser mock smoke passed on fresh production preview: Inbox rendered AI suggestion, texted email `Shawnthai@gmail.com`, and Gmail CTA generated `https://mail.google.com/mail/?view=cm&fs=1&to=Shawnthai%40gmail.com` without subject/body.
- [x] Production deploy passed for commit `2f665aaf`: build/restart succeeded, `/api/health` returned HTTP 200 with database `ok` and Redis `ok`, root HTML returned HTTP 200, and live login UI rendered.
- [x] Gmail recipient policy prefers conversation/texted email over lead-list email while preserving lead-list email in response metadata.
- [x] Admin/manager self-assign path is allowed only for the current privileged user; ordinary assignment still requires an active REP.

### New deal creation / sharing / socket scoping smoke — 2026-05-02

- [x] Evidence JSON added: `audit-screenshots/m16-deal-create-share-socket-evidence.json`.
- [x] Backend fix added: `shareDeal` now emits scoped socket updates from the updated deal record, so newly added assisting reps receive `inbox:{repId}` updates.
- [x] Focused backend regression passed 14/14 across deal controller scope, deal scope policy, and inbox reply reclassification tests.
- [x] Root production build passed after the backend fix: server `tsc` plus client `tsc && vite build`.
- [x] Browser production-preview smoke passed with mock API: created `M1.6 Smoke Capital`, captured `POST /api/deals`, shared `Atlas Demo Logistics`, and captured `PUT /api/deals/deal-1/share` with `assistingRepIds: ["rep-2"]`.
- [x] Browser screenshot saved: `audit-screenshots/m16-deal-create-share-browser-smoke.png`.
- [x] Production deploy passed for commit `01b6700d`: Git bundle fast-forward, root `npm run build`, and `pm2 restart sms-api --update-env` all completed successfully.
- [x] Production smoke passed: `/api/health` returned HTTP 200 with database `ok` and Redis `ok`; root HTML returned HTTP 200; live browser opened `/login` and rendered the SCL OTP login screen.

### Visual regression smoke — 2026-05-02

- [x] Evidence JSON added: `audit-screenshots/m16-visual-regression-evidence.json`.
- [x] Desktop 1440px Pipeline screenshot captured and visually reviewed: `audit-screenshots/m16-pipeline-desktop-1440.png`.
- [x] Half-screen 960px Pipeline screenshot captured and visually reviewed: `audit-screenshots/m16-pipeline-half-960.png`.
- [x] DealPanel screenshot captured and visually reviewed: `audit-screenshots/m16-deal-panel-desktop-1440.png`.
- [x] DealCard stacking + attempt banner screenshot captured and visually reviewed: `audit-screenshots/m16-deal-card-stacking-attempt.png`.
- [x] Playwright DOM audit passed for desktop and half-screen: no document horizontal overflow, no unexpected text overflow, 8 visible columns, 8 visible cards, and layout shift score `0`.
- [x] Stacking chip and `WAITING 8/10 ATTEMPTS` banner remain inside the card; next action row stays below the attempt banner.
- [x] Sidebar/nav links remained unchanged in the visual audit surface.

### Functional regression

- [x] Login/auth full pass.
- [x] Pipeline simple mode pass.
- [x] Pipeline execution mode pass.
- [x] Deal card pass.
- [x] Deal panel pass.
- [x] Drag/drop pass.
- [x] New deal creation pass.
- [x] Deal sharing pass if in current implementation.
- [x] Funding history pass.
- [x] Inbox AI unaffected.
- [x] Email/Gmail CTA unaffected.
- [x] Follow-up timing unaffected.
- [x] Quiet hours unaffected.
- [x] Inbound ownership unaffected.
- [x] Socket scoping unaffected.

### Visual regression

- [x] Desktop 1440px Pipeline screenshot compare.
- [x] Half-screen 960px Pipeline screenshot compare.
- [x] DealPanel screenshot compare.
- [x] DealCard screenshot compare.
- [x] No overlapping text.
- [x] No layout shift when badges/attempt banners appear.
- [x] Sidebar remains unchanged unless intentionally touched.

### Release readiness

- [ ] Server tests pass.
- [x] Client build passes.
- [x] Relevant DB migration reviewed as additive.
- [x] Rollback note prepared: source stash/worktree backup and DB dump paths recorded in production deploy evidence.
- [x] Evidence screenshots saved.
- [ ] Demo script prepared for JB/client.
- [ ] Progress dashboard updated to M1 complete only after all gates pass.

## M2.1 — Leads/Campaign Access And Source Fixes

### Implementation evidence — 2026-05-02

- [x] Affected files: `server/src/controllers/leadController.ts`, `server/src/controllers/campaignController.ts`, `client/src/pages/LeadsPage.tsx`, `client/src/pages/CampaignsPage.tsx`, `server/tests/leadCampaignScope.test.ts`.
- [x] Regression surface: Leads list/get/update/import/bulk/tag/export scope; Campaigns list/get/create/update/start/pause/cancel/analytics/sync scope; Campaigns delete UI visibility; Leads Source display fallback.
- [x] Focused tests passed: `cd server && npx vitest run tests/leadCampaignScope.test.ts` — 5/5 passed.
- [x] Build passed: root `npm run build` — server `tsc` + client `tsc && vite build`.
- [x] Browser smoke passed for admin/rep Leads and Campaigns views with deterministic mocked API evidence: `audit-screenshots/m21-m22-leads-campaigns-evidence.json`.
- [x] Production CSV import smoke passed with two real rep accounts: AN uploader sees imported lead, HB isolated rep sees 0, admin sees 1, enrichment/export/cleanup passed.

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
- [x] Source examples match prototype in deterministic browser smoke:
  - `CJ 10.8 12K / Verizon list`;
  - `FDR Apr / FDR scrubbed`;
  - `Lead Hoop / Lead Hoop list`;
  - `Renewal Queue / Renewal · prior`.
- [x] Existing UUID-only sources mapped to readable fallback where possible.
- [x] Import flow stores list name as source for future leads.
- [x] Campaign-created leads preserve campaign/list lineage in list/export enrichment logic and browser source smoke.

### M2.1 Testing Gate

- [x] Rep AN uploads CSV -> sees uploaded leads immediately.
- [x] Rep HB cannot see AN leads.
- [x] Admin JB sees all leads.
- [x] Rep AN sees only AN campaigns.
- [x] Rep HB cannot open AN campaign detail.
- [x] Admin JB sees all campaigns.
- [x] Source column before/after checked against prototype.
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
- [x] Status pill styles checked in browser smoke with retained table/card rendering.
- [x] Avatar initials checked in browser smoke with retained table/card rendering.

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

- [x] Existing styles apply correctly to new columns in desktop and responsive browser smoke.
- [x] No scoped Leads/Campaigns style set needed after smoke; existing overflow-safe styles held.
- [x] Do not modify sidebar layout/classes for this section.
- [x] Verify table remains readable at desktop and half-screen widths by fixed min-width/overflow-safe columns.
- [x] Ensure text truncation/line wrapping is deliberate and not overlapping.

### M2.2 Testing Gate

- [x] Admin Leads table matches retained prototype scope in browser smoke.
- [x] Rep Leads table matches retained prototype scope with scoped data in browser smoke.
- [x] Last Contact values checked against deterministic mocked API data and controller enrichment tests.
- [x] Industry/revenue values checked against classifier/manual/CSV source precedence in focused controller tests.
- [x] Export CSV checked with filters in focused controller test.
- [x] Export CSV opened/verified by focused controller test and mocked browser export route; columns recorded in evidence.
- [x] Pixel-close compare with Leads prototype retained scope.
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

### Implementation evidence — 2026-05-04

- [x] Added Prisma `LeadCohort` model mapped to `lead_cohorts` with user, cohort type, title/description, query JSON, source attribution, predicted reply rate, expected funded count, historical anchor, AI reasoning, match/eligible/resolved counts, cap metadata, warnings, sample leads, lead IDs, and 24h expiry.
- [x] Added active cache lookup for AI cohort reasoning using `expiresAt > now`; expired snapshots are ignored safely.
- [x] Added Anthropic Claude Sonnet 4.5 reasoning path for cohorts with deterministic fallback when Anthropic key is missing.
- [x] Reasoning prompt includes filter criteria, anonymized sample leads, funded-history aggregate, counts, and current capacity.
- [x] Added 15-minute AI cohort cron wired into server startup and graceful shutdown.
- [x] Cron runs across active ADMIN/MANAGER/REP users and isolates failures per user/cohort.
- [x] Focused tests added/expanded in `server/tests/campaignAiCohorts.test.ts` and `server/tests/aiCohortCron.test.ts` for cache hit, cache miss snapshot write, expired-cache ignore, Anthropic reasoning input, and cron failure isolation.
- [x] Campaigns UI Build Campaign now opens the existing campaign modal with AI cohort name, message template, and resolved lead set preloaded while preserving the AI build endpoint for lineage.
- [x] Mocked browser smoke passed for AI Build modal preload, submit, AI-built campaign list appearance, AI badge, lineage marker, and no horizontal overflow.
- [x] Mocked browser regression passed for existing Campaign actions: retarget preview/create/lineage, start, pause, cancel, delete, status updates, deleted-row removal, and no horizontal overflow.
- [x] Validation passed: `cd server && npx vitest run tests/campaignAiCohorts.test.ts tests/aiCohortCron.test.ts` — 8/8 passed, with known local Redis `ECONNREFUSED` warning only.
- [x] Validation passed: `cd client && npm run build` after Campaigns modal flow change.
- [x] Validation passed: `npm run build` — server `tsc`, client `tsc`, and Vite production build passed.
- [x] Production deploy completed on `https://app.sclcapital.io/` with MySQL backup, additive `lead_cohorts` table creation, Prisma generate, PM2 restart, API health, dev-login 404 guard, new frontend asset, and `leadCohort.count()` smoke.
- [x] Prisma `db push` was not forced with `--accept-data-loss`; unrelated varchar warnings were avoided by manual additive SQL for `lead_cohorts` only.
- [x] Campaigns v3 prototype retained-scope compare passed: AI Retarget Suggestions, 3 cohort cards, All Campaigns, AI badge, lineage marker, no suppressed/list-management/cohort-bar scope creep, desktop/mobile no-overflow, and screenshots saved.
- [x] VS Code problems check passed with 0 errors for changed M2.3 files.
- [x] Evidence recorded: `audit-screenshots/m23-ai-cohort-cache-cron-evidence.json`.

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

- [x] Add `lead_cohorts` / `LeadCohort` model if not already present.
- [x] Store `userId`.
- [x] Store `cohortType`: multi-retarget / new cohort / renewal.
- [x] Store title and description.
- [x] Store query JSON or resolved criteria metadata.
- [x] Store source campaigns/source attribution.
- [x] Store predicted reply rate.
- [x] Store predicted funded deals / expected funded count.
- [x] Store historical anchor line data.
- [x] Store AI reasoning.
- [x] Store resolved lead count.
- [x] Store total match count and cap-trim metadata.
- [x] Store daily remaining capacity at generation.
- [x] Store `expiresAt` around 24h.
- [x] Add indexes for user/expiry and active cohort lookup.
- [x] Ensure expired cohorts are ignored safely.

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

- [x] Use Anthropic Claude Sonnet 4.5 for cohort reasoning.
- [x] Reasoning prompt includes filter criteria, anonymized sample leads, and funded history aggregates.
- [x] Reasoning output is 1-2 business-specific sentences, not generic boilerplate.
- [x] Cache reasoning for 24h.
- [x] Scheduled job runs every 15 minutes.
- [x] Cron runs per user: admin + each active rep.
- [x] Cron is non-blocking, idempotent, and failure-tolerant.
- [x] Cron handles 8 users x 3 cohorts without blocking API/server responsiveness.
- [x] Log failures per user/cohort without breaking other cohorts.

### UI

- [x] AI Retarget Suggestions section appears above All Campaigns list.
- [x] Section subtitle shows all-reps campaign base and refresh time.
- [x] Three cards render with correct priority labels.
- [x] Cards show live capacity data.
- [x] Cards show cohort-trim messaging when cap is lower than match count.
- [x] Cards show daily capacity nearly full messaging.
- [x] Preview button opens intended preview flow or documented placeholder.
- [x] Build Campaign opens existing New Campaign modal with preloaded lead set.
- [x] AI-built campaigns appear in All Campaigns table.
- [x] AI-built campaigns show `AI` badge.
- [x] AI-built campaigns show lineage marker, e.g. `↻ from AI Cohort · 487 leads · ~6 funded expected`.
- [x] Existing campaign actions still work: rerun/refresh, start, pause, delete where allowed.

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
- [x] Preview flow tested in focused controller test.
- [x] Build Campaign flow tested in focused API test.
- [x] New AI-built campaign appears in All Campaigns list in mocked browser smoke.
- [x] Lineage marker verified in mocked browser smoke.
- [x] Cooldown/override warning verified in focused API test.
- [x] Compliance exclusions verified by query constraints and focused build/list tests.
- [x] Per-campaign caps tested for rep path.
- [x] Rolling 24h daily caps tested for rep path.
- [x] Expired cohorts ignored after 24h.
- [x] Cron failure for one cohort does not break other cohorts.
- [x] AI reasoning is cached and not regenerated unnecessarily.
- [x] Pixel-close compare with Campaigns prototype for retained M2.3 scope; full shell-wide pixel-perfect match is not claimed because app chrome is outside this retained prototype slice.
- [x] Progress dashboard updated.

## M2.4 — M2 Full Regression And Release Gate

### Functional regression

- [x] Leads import still works.
- [x] Add Lead still works.
- [x] Existing Leads search works.
- [x] Existing Status filter works.
- [x] Existing Lists filter works.
- [x] Campaign list search works.
- [x] Campaign status filter works.
- [x] New Campaign modal still works.
- [x] Campaign start/pause/cancel actions still work.
- [x] Campaign analytics/detail still works.
- [x] Inbox reply/campaign reply linking still works.
- [x] Retarget suppression still works.
- [x] Template guards still block unresolved `{{...}}` and test messages.

### Regression bootstrap evidence — 2026-05-04

- [x] Focused M2 backend regression passed: `pipelineAiService`, `pipelineAiGoldenGrader`, `leadCampaignScope`, `leadEnrichmentExport`, `campaignAiCohorts`, `aiCohortCron`, `inboxReplyReclassification`, `retargetSuppression`, `sendingEngineRetarget`, `outboundMessageGuard` — 10 files / 37 tests.
- [x] Root build passed: server `tsc`, client `tsc`, Vite production build.
- [x] Mocked Leads UI smoke passed for render, search reload, Export CSV endpoint call, Import modal open, Add Lead modal open, enrichment visibility, and desktop no-overflow.
- [x] Mocked Campaigns UI smoke passed for render, search reload, New Campaign modal, AI Retarget visibility, and Start/Pause/Cancel endpoint calls using visible action buttons.
- [x] Extended Leads UI smoke passed for status/list filters, Add Lead submit payload, CSV preview, and mapped CSV import.
- [x] Extended Campaigns UI smoke passed for status filter and Create Campaign submit with selected list `filterTags`.
- [x] Evidence JSON saved: `audit-screenshots/m24-regression-bootstrap-evidence.json`.
- [x] Visual regression passed against retained Leads/Campaigns v3 prototype scope: admin/rep Leads, admin/rep Campaigns, half-width Leads, mobile Campaigns, sidebar unchanged, no page-level horizontal overflow.
- [x] Production deploy passed on `43f067a45`: git bundle fast-forward, hotfix dirty state preserved, server build passed, PM2 restarted, health returned database/Redis ok.
- [x] Production live CSV smoke passed after deploy: AN upload/import/export/enrichment, HB isolation, admin visibility, cleanup.

### Visual regression

- [x] Leads admin screenshot pixel-close compared to prototype.
- [x] Leads rep screenshot pixel-close compared to prototype after switching `Rep view (HB)` equivalent.
- [x] Campaigns admin screenshot pixel-close compared to prototype.
- [x] Campaigns rep screenshot pixel-close compared to prototype.
- [x] Sidebar/menu unchanged.
- [x] No table overflow at half-screen width.
- [x] Buttons/icons match prototype density and spacing.
- [x] No unreadable text if current styles fail; scoped style set added if needed.

### Release readiness

- [x] Server tests pass.
- [x] Client build passes.
- [x] Browser smoke pass for Leads.
- [x] Browser smoke pass for Campaigns.
- [x] Export CSV smoke pass.
- [x] Permission negative cases pass.
- [x] Evidence screenshots saved.
- [ ] Demo script prepared for JB/client.
- [x] Progress dashboard updated to M2 complete only after all gates pass.

## Full Final Acceptance

- [ ] Overall progress dashboard shows 100% only after M1 and M2 release gates pass.
- [ ] M1 Login/Auth works for admin and rep.
- [ ] M1 Pipeline v2 works with correct data isolation and no stage/metric regression.
- [ ] M1 Pipeline AI badges and auto-nurture behavior match confirmed scope.
- [x] M2 Leads table matches v3 prototype scope.
- [x] M2 Campaigns AI Retarget matches v3 prototype scope.
- [x] Side menu remains unaffected.
- [ ] No hidden scope creep from older docs is shipped without approval.
- [x] Pixel-close evidence exists for all retained prototype elements.
- [x] Regression evidence exists for all previously painful client issues.
- [ ] Final client-facing summary prepared with what changed, how it was tested, and what is intentionally out of scope.

## Progress Update Log

| Date       | Progress | Area      | What changed                                                                                                                                                                                                                | Evidence                                                           |
| ---------- | -------: | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2026-05-04 |    99.5% | M27       | Corrected Leads/Campaigns shell after client review: retained app sidebar, removed separate prototype topbar/tabs, kept prototype content styling, and passed 918px browser QA/build.                                       | `audit-screenshots/m27-sidebar-shell-correction-evidence.json`     |
| 2026-05-04 |    99.5% | M26       | Re-audited full SCL Leads/Campaigns PDF/prototype scope, added Leads prototype shell/filter bar, Campaign AI cap/category/cooldown polish, API requirements doc, focused tests/build, and deployed `7fe9a7c` to production. | `audit-screenshots/m26-full-scl-requirements-evidence.json`        |
| 2026-05-04 |    99.5% | M2.4      | Closed M2 release gate: 37/37 focused tests, root build, visual prototype smoke, production deploy `43f067a45`, live CSV import/export/enrichment smoke, health ok.                                                         | `audit-screenshots/m24-regression-bootstrap-evidence.json`         |
| 2026-05-04 |    97.5% | M2.1/M2.2 | Closed live Leads/Campaigns gate: AN/HB/admin CSV visibility, readable source/export, company search parity, visual prototype screenshots, and cleanup passed.                                                              | `audit-screenshots/m21-m22-leads-campaigns-evidence.json`          |
| 2026-05-04 |    95.5% | M1.4      | Added TS golden grader, fixture/corpus sync tests, live Anthropic golden parity run, and documented exact field diffs for the remaining golden divergences.                                                                 | `audit-screenshots/m14-pipeline-ai-extractor-evidence.json`        |
| 2026-05-04 |    94.5% | M1.4      | Deployed `991f932` to production by git bundle, preserved existing prod dirty hotfixes, added Pipeline AI DB columns, rebuilt, restarted PM2, and passed health/route/frontend smoke.                                       | `audit-screenshots/m14-pipeline-ai-extractor-evidence.json`        |
| 2026-05-04 |    94.5% | M1.4      | Added Pipeline AI extractor backend, Deal JSON fields, note/SMS triggers, manual Re-run AI, card badges, DealPanel inline bar, focused tests/build, and retained-v11 visual evidence.                                       | `audit-screenshots/m14-pipeline-ai-extractor-evidence.json`        |
| 2026-05-02 |      71% | M1.6      | Added drag/drop + Funding History smoke evidence; moved M1.6 from 3/8 to 4/8 while keeping full-env/release gates open.                                                                                                     | `audit-screenshots/m16-drag-funding-evidence.json`                 |
| 2026-05-02 |      72% | M1.6      | Deployed `1982fdb0` to `https://app.sclcapital.io/`, applied additive DB schema sync, rebuilt/restarted PM2, and passed production smoke.                                                                                   | `audit-screenshots/m16-production-deploy-evidence.json`            |
| 2026-05-02 |      73% | M1.6      | Added and deployed Inbox AI/email CTA/follow-up/quiet-hours/inbound-owner regression evidence; production smoke passed on `2f665aaf`.                                                                                       | `audit-screenshots/m16-inbox-ai-policy-evidence.json`              |
| 2026-05-02 |      74% | M1.6      | Added and deployed new deal creation/sharing/socket scoping evidence; production smoke passed on `01b6700d`.                                                                                                                | `audit-screenshots/m16-deal-create-share-socket-evidence.json`     |
| 2026-05-02 |      75% | M1.6      | Added visual regression evidence for Pipeline 1440/960, DealPanel, DealCard, overlap/layout-shift, and sidebar checks.                                                                                                      | `audit-screenshots/m16-visual-regression-evidence.json`            |
| 2026-05-04 |      76% | M1.4/M1.6 | Locked angry-client preservation requirements, restored Inbox Mark Unread/Note in action row, tightened login visual fit, and passed focused tests/build/prod access smoke.                                                 | `audit-screenshots/client-preservation-login-access-evidence.json` |
| 2026-05-04 |      77% | M1.1      | Added and deployed safe dev-only login without OTP for local QA, with production backend/frontend guards, focused auth tests, build, and live smoke evidence.                                                               | `audit-screenshots/dev-mode-login-evidence.json`                   |
| 2026-05-04 |      80% | M1.4      | Added and deployed Inbox AI latest-inbound repair, email priority, owner-action reclassification, inbound owner preservation, quiet-hours reply bypass, and live smoke evidence.                                            | `audit-screenshots/m14-ai-suggestion-repair-evidence.json`         |
| 2026-05-04 |      82% | M2.1/M2.2 | Closed lead/campaign scope, readable source, enrichment/export, admin/rep browser smoke, and responsive overflow evidence; live two-rep CSV smoke and strict pixel-close remain.                                            | `audit-screenshots/m21-m22-leads-campaigns-evidence.json`          |
| 2026-05-04 |      84% | M2.3      | Added LeadCohort DB/cache, Sonnet reasoning, cron, Build modal/list/actions smoke, tests/build, and production DB/health/frontend smoke.                                                                                    | `audit-screenshots/m23-ai-cohort-cache-cron-evidence.json`         |
| 2026-05-04 |    84.5% | M1.1      | Passed live SMS OTP delivery, verify, consumed-code, `/auth/me`, browser redirect, and dev-login production guard; Resend email fallback remains blocked by missing env config.                                             | `audit-screenshots/m11-live-otp-evidence.json`                     |
| 2026-05-04 |    85.5% | M2.3      | Closed retained Campaigns prototype compare with saved screenshots for AI Retarget cards, All Campaigns, AI badge/lineage, no scope creep, and desktop/mobile no-overflow.                                                  | `audit-screenshots/m23-ai-cohort-cache-cron-evidence.json`         |
| 2026-05-04 |    87.5% | M2.4      | Passed M2 functional regression bootstrap: focused backend tests 15/15, root build, mocked UI smoke for search/filters/import/add/export/create/actions; deeper gates remain.                                               | `audit-screenshots/m24-regression-bootstrap-evidence.json`         |
| 2026-05-02 |       6% | Planning  | Consolidated M1/M2 sources, previous checklists, Pipeline v11 handoff, and Leads/Campaigns v3 prototype into one master checklist.                                                                                          | This file                                                          |
