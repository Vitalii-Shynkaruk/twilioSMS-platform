# Phase 1 — AI SMS Inbox Build · Checklist

> Источник: `AI-SMSRevised.pdf` · Прототип: `scl-inbox-v5.html`
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
