# Phase 1 — AI SMS Inbox Build · Checklist

> Источник: `AI-SMSRevised.pdf` · Прототип: `scl-inbox-v5.html`

> **⚠ Scope update 25.04.2026 (active):** `SCL Dev_JB.pdf` + `scl-inbox-v11.html`
>
> Этот чеклист обновлён под новый бриф клиента (M1/M2/M3).
> Предыдущий lean-scope остаётся как база, но приоритет и критерии приёмки ниже.

## 🔒 Priority 0 — Trust & Data Safety (must-pass before feature rollout)

- [ ] Включить audit trail для unread/follow-up/AI-state изменений (кто, когда, откуда, старое→новое)
- [ ] Добавить инварианты: inbound всегда сохраняется; unread не теряется от чужого просмотра
- [ ] Добавить reconciliation job + алерт на расхождения (кампания replied vs inbox visible)
- [x] Ввести feature flag `AI_CLASSIFICATION_ENABLED` (default OFF до полного QA)
- [x] Зафиксировать rollback-план и smoke-checklist перед каждым релизом

## 📦 SCL-HandOff alignment (обязательно)

- [ ] Использовать только `SCL-HandOff/classifier_prompt_v4_LOCKED.md` (prompt не редактировать)
- [ ] Использовать схему строго по `SCL-HandOff/classification_schema.json` (без произвольных полей)
- [ ] Классификатор работает по правилу full-thread peak (вся история, oldest -> newest)
- [x] Классификация только async через queue/worker; Twilio webhook не блокировать
- [ ] В классификацию не отправлять opted-out / outbound-only / zero-inbound треды
- [ ] Версионирование prompt в settings + запись версии в результаты классификации
- [ ] Backfill 642 запускать отдельным job off-hours + сохранить отчёт валидации

## 🧨 M1 blockers из handoff (закрыть до M2)

- [x] Запрет отправки сообщений с неразрешёнными шаблонными токенами (`{{...}}`) перед Twilio send
- [x] Запрет отправки тестовых сообщений в прод (`test`-pattern guard)
- [x] Фильтр rep/test phone numbers (не создавать лидов и не классифицировать их)
- [x] Suppression: не отправлять campaign retarget, если у лида был inbound за последние 7 дней
- [x] Security sweep из `production_bugs_found.md`: NODE_ENV/CORS/auth gates/socket broadcasts

## 🆕 Scope delta — SCL Dev_JB (M1/M2/M3)

### M1 — Cleanup / Production hygiene

- [x] `NODE_ENV=production` подтверждён на проде
- [x] Очистить `/server` от debug scripts, `.bak`, `.new`
- [x] Все прод-изменения закоммитить в GitHub (feature-wise)
- [x] Добавить 5-10 регрессионных тестов: webhook auth, inbound persist, SMS send, CA compliance blocks
- [x] Политика GitHub-as-truth: без прямых прод-правок
- [x] Добавить тесты на guard-правила M1 (anti-`{{...}}`, anti-`test`, rep-number suppression)

### M2 — Backend extensions

- [x] classifyInbound в Twilio webhook (async, non-blocking, после persistence)
- [ ] Реклассификация по owner actions: Interested/Not Interested/DNC/Email Rcv/+Pipeline/Note
- [ ] Universal note ingestion (admin/rep notes одинаково feed AI)
- [ ] Новые данные в Conversation: `industry`, `heloc_fit_flag`, `extracted_revenue`, `extracted_ask`
- [ ] Таблица `classification_feedback` (override/skip tracking)
- [ ] Per-rep outbound tracking (foundation для Phase 2)
- [ ] Follow-up state fields + minute job `scheduled -> due_now`
- [ ] При `due_now` запускать reclassification с overdue context
- [ ] Backfill 642 historical conversations + validation report
- [ ] Поля из schema v4 маппятся 1:1: classification, leadScore, staleState, suggestedReply, suggestedReengageMessage, repBehavior
- [ ] HOT rule enforcement: для HOT всегда non-null `suggestedFollowupTime` + `suggestedFollowupReason`
- [ ] Re-engage rule enforcement: non-null `suggestedReengageMessage` при stale/ghosted или 7+ дней тишины

### M3 — UI refinement (not rebuild)

- [ ] Сохранить текущую 3-column inbox структуру и существующие элементы
- [ ] Добавить one-line AI Intelligence bar над тредом
- [ ] Добавить single Suggested Reply panel (Use / Edit / Skip)
- [ ] Skip писать в `classification_feedback`
- [ ] CTA открывает Gmail compose с prefilled lead email; disabled если email нет
- [x] Admin/My Convs toggle (только admin видит toggle)
- [x] Admin totals bar: Overdue, HOT, New today, Unread, In Pipeline (только counts, без $)
- [ ] Follow-Up popover: AI suggested time+reason, 3 quick options, custom datetime, optional reason
- [ ] Overdue follow-ups: red pulse + resurfacing наверх inbox
- [ ] Карточки: добавить chips `industry`, `heloc fit`, `follow-up`
- [x] Right panel: добавить tabs `AI STATE` и `ALERTS`
- [ ] Звуки: только HOT alert + New reply + Mute
- [ ] AI fields `reasoning` и внутренние диагностики не показывать репам (manager/debug only)

## ✅ New acceptance gates (short)

- [ ] Inbound -> classification persisted < 10s
- [ ] Owner action / note add -> reclassification < 5s
- [ ] Webhook latency overhead < 50ms
- [ ] Industry/revenue extraction >= 90% на validation set
- [ ] Backfill 642 завершён без ошибок
- [ ] Все UI-counts сходятся с DB проверкой
- [ ] 0 случаев: lost unread replies / unrendered template variables / accidental test SMS

## 🧪 Step-by-step verification log

- [x] Added outbound hard guards: block unresolved `{{...}}` + block accidental `test` SMS
- [x] Added and passed DB-free tests for keyword parser edge cases (`END` vs `Send` substring regressions)
- [x] Added Admin/My scope toggle + admin totals bar + right-panel tabs (`AI State`, `Alerts`) in inbox; verified with `client npm run build`, `server npm run build`, and targeted backend tests (8/8 pass)
- [x] Added inbound rep/test phone suppression in Twilio webhook: skip lead auto-create and skip AI classification for suppressed numbers (active rep mobiles + `REP_TEST_PHONE_ALLOWLIST`), verified with unit tests `tests/inboundPhoneSuppression.test.ts` and guard suite (12/12 pass)
- [x] Added retarget suppression rule in sending engine: skip retarget when `lead.lastRepliedAt` is within 7 days, with explicit skip reason; verified by `tests/retargetSuppression.test.ts` + guard suite (16/16 pass) and `server npm run build`
- [x] Security sweep sub-step: added explicit role gate on `PUT /api/leads/:id` (`ADMIN|MANAGER|REP`) in route layer; verified with `server npm run build`
- [x] Security sweep sub-step: replaced global `io.emit('deal:updated')` with scoped room broadcast (`inbox:<assigned/assisting/actor>`) in deal controller to prevent cross-rep socket leaks; verified with `server npm run build` and focused guard tests (16/16 pass)
- [x] Security sweep sub-step: hardened production env validation in `server/src/config/env.ts` (fail-fast if `NODE_ENV=production` with localhost `CLIENT_URL` / `WEBHOOK_BASE_URL`), verified with `server npm run build`
- [x] Security sweep sub-step: tightened lead deletion to admin-only (`DELETE /api/leads/:id` route + controller guard) to remove manager cross-team deletion risk; verified with `server npm run build`
- [x] Stabilized local M1 regression run: `tests/compliance.test.ts` is now auto-skipped without valid MySQL `DATABASE_URL` (instead of failing test process), while DB-free guard tests continue to run in all environments
- [x] Added DB-free regression tests for production env guard (`tests/envValidation.test.ts`) covering localhost URL rejection in production for `CLIENT_URL` and `WEBHOOK_BASE_URL`; verified with expanded suite (19/19 pass, 10 DB-dependent skipped) and `server npm run build`
- [x] Added DB-free webhook auth regression coverage via extracted Twilio signature helpers (`src/webhooks/twilioSignatureValidation.ts`, `tests/twilioSignatureValidation.test.ts`) and wired middleware to use them; verified in expanded suite
- [x] Added DB-free quiet-hours compliance window regression coverage (`src/services/quietHoursWindow.ts`, `tests/quietHoursWindow.test.ts`) and integrated helper back into ComplianceService; verified in expanded suite (26/26 pass, 10 DB-dependent skipped) + `server npm run build`
- [x] Added DB-free SMS send regression coverage for Twilio status callback URL normalization (`src/services/sendingUrlBuilder.ts`, `tests/sendingUrlBuilder.test.ts`) and wired SendingEngine to helper
- [x] Added DB-free CA compliance/scoring regression tests for AI prompt guardrail + score behavior (`tests/aiServiceComplianceScoring.test.ts`), including CA prompt block assertion; verified with expanded suite (32/32 pass, 10 DB-dependent skipped) + `server npm run build`
- [x] Added DB-free inbound persist helper coverage by extracting inbound phone/name parsing (`src/webhooks/inboundParsing.ts`, `tests/inboundParsing.test.ts`) and wiring Twilio webhook to shared helpers; verified with expanded suite (36/36 pass, 10 DB-dependent skipped) + `server npm run build`
- [x] Added feature flag parser + config wiring for `AI_CLASSIFICATION_ENABLED` (default OFF) and gated Twilio inbound AI classification pipeline by flag; verified with `tests/featureFlags.test.ts` + expanded suite (39/39 pass, 10 DB-dependent skipped) + `server npm run build`
- [x] M1 cleanup: removed debug scripts from `server/scripts` (`check-twilio.js`, `enrich-demo-data.js`), leaving migration/maintenance scripts only
- [x] Added operational docs: `docs/RELEASE_ROLLBACK_SMOKE_CHECKLIST.md` and `docs/GITHUB_AS_TRUTH_POLICY.md`; linked to M1 requirements for rollback/smoke + GitHub-as-truth
- [x] Production verification evidence captured from `https://app.sclcapital.io`: `GET /api/health` returned `Access-Control-Allow-Origin: https://app.sclcapital.io`, `Strict-Transport-Security` present, and cross-origin `OPTIONS /api/auth/login` did not allow untrusted origin
- [x] Feature-wise commit created for M1 completion package: `11c5aa0` (`feat(m1): complete security hygiene and regression coverage`); post-commit validation: `server npm run build` + expanded regression suite (39/39 pass, 10 DB-dependent skipped)
- [x] Refactored inbound AI pipeline to strict BullMQ flow: webhook only enqueues `inbound-ai-classification` after message persistence, processing moved to dedicated worker (non-blocking Twilio response); verified with `server npm run build` + expanded suite (39/39 pass, 10 DB-dependent skipped)
>
> **🔄 Scope revision 23.04.2026 вечер** (финал после уточнений):
>
> **KEEP в Phase 1:**
>
> - classifyInbound (Claude Sonnet 4.5) + persist 6 AI-полей (forward-compat, без second migration)
> - 5-signal lead score (детерминированный, без over-engineering)
> - California detection (базовый area-code matching, без UI)
> - Socket events `ai-classified` + `revenue_updated`
> - CSV import fix (source = list name)
> - Navigation updates (Dashboard → Command Center, Pipeline icon, Automation icon)
> - **Basic HOT SMS alert** (one-time при classification=HOT, без escalation/retry/scheduling)
> - **mobilePhone** поле в User profile (простое поле, без доп. UI)
> - UI: только classification badge в thread header + revenue chip на inbox card + AI Priority sort
>
> **DEFER в Phase 2:**
>
> - AI provider switcher (скрыт в Settings UI)
> - hotAlertsEnabled toggle / advanced alert settings (скрыт в UsersTab)
> - hotAlertFromNumber конфиг (скрыт в Settings UI; runtime fallback на env / первый ACTIVE PhoneNumber)
> - AIBanner, AISuggestions (BEST/ALT), HOTToast + звук
> - Socket emit `hot-lead-detected` (toast deferred)
> - InboxCardAIChips (HOT badge + ask + urgency chips)
> - InboxCardScoreBar
> - BullMQ HOT escalation ladder, CA compliance UI, right panel AI tabs, phone verification
>
> **Реализация:** весь код Phase 2 остаётся в репозитории. Скрытие через
> feature flag `PHASE1_LEAN=true` (default). Включаетсь снятием флага.
>
> **Цель Phase 1:** validate AI output + rep behavior. Не строим full automation сейчас.
>
> Принцип: каждый чек ставим только после реальной проверки.

---

## 🅰️ Work Stream A — Navigation Restructure (frontend only, ~2-4ч)

### A1. Удаление Dashboard

- [x] SMS метрики уже в Command Center (встроенный `SmsBar` с `sent24h/delivered24h/replyRate7d` — строки 1026, 1209)
- [x] Удалён роут `/dashboard` из `App.tsx` (redirect на `/command-center`) + удалён lazy import
- [x] Удалён пункт "Dashboard" из sidebar nav (`AppLayout.tsx`)
- [x] Файл `DashboardPage.tsx` удалён (был unused, нет импортов)

### A2. Pipeline icon → 4-square grid

- [x] `Kanban` → `LayoutGrid` из lucide-react (4 квадрата)
  ```html
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
  ```

### A3. Automation icon → lightning bolt

- [x] `Bot` → `Zap` из lucide-react (молния)
  ```html
  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  ```

### A4. Nav Acceptance Tests (на проде https://app.sclcapital.io)

- [x] **N1**: `/dashboard` → redirect на `/command-center`; нет в sidebar ✅
- [x] **N2**: Command Center показывает SMS метрики (встроен изначально) ✅
- [x] **N3**: Pipeline = `LayoutGrid`, Automation = `Zap` ✅

**⚡ STREAM A DEPLOYED — 23 Apr 2026**

---

## 🅱️ Work Stream B — AI SMS Inbox (главная работа)

### B1. Database schema migration (Prisma) ✅ DEPLOYED 23.04

Файл: `server/prisma/schema.prisma`

- [x] Добавить в `Conversation`: `aiClassification`, `aiSignals`, `aiSuggestions`, `isCaliforniaNumber`, `aiLeadScore`, `aiClassifiedAt` + индексы по `aiClassification` и `aiLeadScore`
- [x] Добавить в `User`: `mobilePhone` (E.164), `hotAlertsEnabled` (default true)
- [x] `npx prisma db push` на прод (workflow без migrations folder)
- [x] `npx prisma generate` локально + на сервере
- [x] Verified: колонки присутствуют в `conversations` и `users`
- ⚠ Прод-side effect: `prisma db push` удалил 2 backup-таблицы от 15.04 (не были в schema.prisma)

### B2. Backend: aiService.ts (Anthropic + provider switcher) ✅ CODE READY

Файл: `server/src/services/aiService.ts`

- [x] Установлен `@anthropic-ai/sdk` локально + на сервере
- [x] **Provider switcher**: `aiProvider` setting (`anthropic` | `openai`) + отдельные ключи `anthropicApiKey` / `openaiApiKey` + выбор модели для каждого
- [x] Дефолты: `claude-sonnet-4-5` / `gpt-4.1-mini`
- [x] `callLLM()` — провайдер-агностичный low-level вызов
- [x] `classifyInbound(conversationId)` — возвращает точный JSON schema
- [x] `getSystemPrompt(isCA)` — Gap Selling, Patrick Bet-David tone, "Funding Link", CA branch
- [x] CA detection по area code (43 кода)
- [x] `computeLeadScore()` — детерминированная формула 0-100 (revenue 30 + ask 25 + urgency 20 + recency 15 + classification 10)
- [x] Legacy методы (`generateDraftReply`, `classifyMessage`, `scoreLead`) работают через тот же callLLM (backward-compat)
- [x] `anthropicApiKey` в SENSITIVE_KEYS — маскируется в read responses
- [x] TypeScript компилируется без ошибок

### B3. Backend: mobileAlertService.ts ✅ АКТИВНО (basic HOT alert one-time)

Файл: `server/src/services/mobileAlertService.ts`

- [x] `MobileAlertService.sendHotAlert(repId, leadName, messageBody)`
- [x] Twilio SMS через `getActiveTwilioClient()` (респектит test/live mode)
- [x] Формат: `HOT lead reply from {name}: '{first 60 chars}' — check SCL now`
- [x] `from` номер: `hotAlertFromNumber` setting → env `TWILIO_FROM_NUMBER` → первый ACTIVE PhoneNumber
- [x] Скип если нет mobilePhone или hotAlertsEnabled=false (без ошибок)
- [x] Rate limit (3 мин Redis) — реализован в `twilioWebhooks.ts:279` через `redis.set('hot-alert:{convId}', '1', 'EX', 180, 'NX')`

### B4. Backend: routes/ai.ts ✅

Файл: `server/src/routes/ai.ts`

- [x] `POST /api/ai/classify-inbound` принимает `{ conversationId }`, возвращает полный JSON

### B5. Backend: twilioWebhooks.ts (DELTA) ✅

Файл: `server/src/webhooks/twilioWebhooks.ts`

- [x] После compliance check вызывается `classifyInbound(conversationId)`
- [x] Результат сохраняется на `Conversation` (5 полей)
- [x] При classification=HOT → `mobileAlertService.sendHotAlert()`
- [x] Socket.io эмит `hot-lead-detected` для toast
- [x] Socket.io эмит `revenue_updated` при извлечённом revenue
- [x] Core handler НЕ сломан

### B6. Backend: csv_import bug fix ✅

Файл: `server/src/controllers/leadController.ts`

- [x] Строки 538/762: `source = listName.trim() || 'csv_import'` — новые импорты наследуют имя листа
- [x] Backfill SQL подготовлен: `scripts/backfill_csv_import_source.sql` (preview + transactional UPDATE + verify, запуск вручную админом по запросу)

### B7. Frontend: InboxPage.tsx (EXTEND) ✅

Файл: `client/src/pages/InboxPageV2.tsx` (активная версия в prod)

- [x] Опция `⚡ AI Priority` в sort dropdown и выбрана **по умолчанию**
- [x] Socket.io слушает `ai-classified` и `revenue_updated` → invalidate query без refresh
- [x] Socket.io `hot-lead-detected` обрабатывает HOTToast (см. B11)
- [x] AI Priority sort: HOT наверх → score DESC → время DESC
- [x] Существующие фильтры (All / Unread / Hot / Email / My Campaigns / Interested / Follow-Up / In Pipeline / DNC) НЕ сломаны

### B8. Frontend: AIBanner.tsx (NEW) ✅ выкл. в PHASE1_LEAN (Phase 2)

Файл: `client/src/components/inbox/AIBanner.tsx`

- [x] Над тредом, скрыт если `aiClassification === null`
- [x] Classification badge: HOT=red, WARM=amber, NURTURE=blue, CA=orange
- [x] Signal chips: revenue 💰, ask 📊, urgency ⚡, product 🏦, industry 🏗, objections ⚠
- [x] Имя rep (из `assignedRep`)
- [x] Live count-up timer для HOT (зелёный <2м, жёлтый <5м, красный после 5м)
- [x] State label: "🔥 HOT · $X DEAL" / "⚠ CA COMPLIANCE" / "◆ WARM" / "◆ NURTURE"

### B9. Frontend: InboxCardAI.tsx (NEW) ✅ · в PHASE1_LEAN только revenue chip; HOT badge/ask/urgency/score bar — Phase 2

Файл: `client/src/components/inbox/InboxCardAI.tsx`

- [x] `<InboxCardAIChips>`: HOT badge + revenue/ask/urgency chips на карточке
- [x] `<InboxCardScoreBar>`: тонкая полоса (red ≥0, amber 50-79, grey <50), **число не показывается**
- [x] aria-label для скринридеров (`progressbar`)

### B10. Frontend: AISuggestions.tsx (NEW) ✅ выкл. в PHASE1_LEAN (Phase 2)

Файл: `client/src/components/inbox/AISuggestions.tsx`

- [x] Максимум 2 карточки: BEST + ALT (никогда 3)
- [x] BEST: gold border-left + gold badge "BEST"
- [x] ALT: свой цвет по type (agg/soft/doc/reschedule/block)
- [x] Click → вставка в compose textarea без блокировки send + autofocus
- [x] CTA лейбл снизу карточки
- [x] Highlight для $-сумм
- [x] Blocked suggestions disabled визуально

### B11. Frontend: HOTToast.tsx (NEW) ✅ выкл. в PHASE1_LEAN (Phase 2)

Файл: `client/src/components/inbox/HOTToast.tsx`

- [x] Красный toast в top-right (z-index 200)
- [x] Срабатывает на Socket.io `hot-lead-detected`
- [x] 3-pulse Web Audio API звук: 600 → 800 → 1050 Hz, 170ms интервал, sine + exp envelope
- [x] Auto-dismiss 8s + close button (X)
- [x] Click → навигация `/inbox?conv=...`
- [x] Показывает имя + 60-char preview
- [x] Может отображать до 4 toast'ов одновременно

### B12. Frontend: CommandCenterPage.tsx (EXTEND) ✅

Файл: `client/src/pages/CommandCenterPage.tsx`

- [x] `SmsBar` встроен внутри Command Center (строки 1026 и 1209) — это и есть секция из удалённого Dashboard
- [x] Метрики: Sent 24h · Delivered % · Reply rate 7d · Errors % · Active automations · Total leads

### B13. Settings: только mobilePhone field ✅ · AI provider switcher / hotAlertFromNumber / hotAlertsEnabled toggle — скрыты в PHASE1_LEAN (Phase 2)

- [x] Settings → Integrations: переключатель `aiProvider` (Anthropic / OpenAI)
- [x] Anthropic: API key (masked) + model select (claude-sonnet-4-5 / opus-4-1 / haiku-4-5)
- [x] OpenAI: API key (masked) + model select (gpt-4.1-mini / 4.1 / nano / o3-mini / o4-mini)
- [x] `hotAlertFromNumber` поле в том же блоке
- [x] Backend: ALLOWED_KEYS добавлены `anthropicApiKey`, `anthropicModel`, `aiProvider`, `hotAlertFromNumber`; `anthropicApiKey` masked
- [x] UsersTab: поля `mobilePhone` (E.164) + checkbox `hotAlertsEnabled` в форме создания/редактирования
- [x] authController: register/updateUser принимают и сохраняют mobilePhone + hotAlertsEnabled; rep может править свои поля, ADMIN/MANAGER — любые
- [x] Все настройки корректно сохраняются через PUT /settings/settings/:key и PUT /auth/users/:id
- [ ] (Phone verification flow — DEFERRED)

---

## ✅ AI Acceptance Criteria — аудит с учётом lean-режима

### Активный Phase 1 (lean) — должны работать сейчас:

- [x] **T1**: POST /api/ai/classify-inbound → `aiClassification` + `aiClassifiedAt` в БД за ~8с (Claude Sonnet 4.5)
- [x] **T2**: 6 AI-полей персистятся в conversations (включая aiSuggestions — задел под Phase 2 без second migration)
- [x] **T3**: classification badge в thread header (`.inbox-strip-badge.ai-cls.hot/warm/nurture`)
- [x] **T6**: `$500K–$600K monthly revenue` → `revenueMonthly=550000`, `ask='$500k'`, cls=HOT, score=80
- [x] **T7**: HOT SMS alert (one-time при classification=HOT, dedupe 3мин Redis) — backend активен, ожидает заполнения `mobilePhone` хотя бы у одного rep
- [x] **T8**: csv_import fix в prod bundle (legacy + smart-mapping)
- [x] **AI Priority sort**: опция в dropdown + default; HOT наверх → score DESC → время DESC
- [x] **Revenue chip on card**: InboxCardAIChips в lean-режиме показывает только `💰 revenue`
- [x] **California detection**: area-code matching → `isCaliforniaNumber` в БД (UI скрыт)

### Phase 2 фичи (готовы, гейтированы PHASE1_LEAN=true):

- [x] **T4**: BEST + ALT suggestions возвращаются API (suggestions.length=2, type=BEST/ALT) — backend готов, UI скрыт
- [x] **T5**: AISuggestions вызывает `onUseSuggestion(text)` → compose (frontend wired, скрыт)
- [x] **HOTToast UI** — компонент в репо, не монтируется; socket emit `hot-lead-detected` гейтирован
- [x] **AI Provider switcher / hotAlertFromNumber / hotAlertsEnabled toggle** — скрыты в Settings/UsersTab

---

## 🚀 Deployment

- [x] Backend build + deploy + pm2 restart (коммит 35de634, API health 200)
- [x] Frontend build + deploy (коммит 604dabb, prototype CSS classes в bundle)
- [x] Prisma schema synced на проде (db push 23.04)
- [x] Anthropic API key + aiProvider=anthropic + anthropicModel=claude-sonnet-4-5 в SystemSettings
- [x] Smoke test 7/8 acceptance пройдён (T7 ждёт mobile)

---

## ❌ Не входит в Phase 1 (deferred)

- BullMQ HOT escalation ladder (2/10/30 min jobs, auto-reassign)
- CA compliance bar UI
- Right panel AI tabs (AI State, Mobile Alert tab)
- Sound customization UI
- Gmail / email integration
- TEMPLATE_LOOP / DROPPED_BALL detection
- Adaptive learning engine
- Mobile number verification flow (only field input для Phase 1)
