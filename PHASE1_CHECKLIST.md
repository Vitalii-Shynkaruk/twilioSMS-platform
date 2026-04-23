# Phase 1 — AI SMS Inbox Build · Checklist

> Источник: `AI-SMSRevised.pdf` · Прототип: `scl-inbox-v5.html` · Бюджет: $400 · Срок: 7 дней
>
> Принцип: попиксельно по прототипу. Каждый чек ставим только после реальной проверки.

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

### B3. Backend: mobileAlertService.ts ✅ CODE READY

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

### B8. Frontend: AIBanner.tsx (NEW) ✅

Файл: `client/src/components/inbox/AIBanner.tsx`

- [x] Над тредом, скрыт если `aiClassification === null`
- [x] Classification badge: HOT=red, WARM=amber, NURTURE=blue, CA=orange
- [x] Signal chips: revenue 💰, ask 📊, urgency ⚡, product 🏦, industry 🏗, objections ⚠
- [x] Имя rep (из `assignedRep`)
- [x] Live count-up timer для HOT (зелёный <2м, жёлтый <5м, красный после 5м)
- [x] State label: "🔥 HOT · $X DEAL" / "⚠ CA COMPLIANCE" / "◆ WARM" / "◆ NURTURE"

### B9. Frontend: InboxCardAI.tsx (NEW) ✅

Файл: `client/src/components/inbox/InboxCardAI.tsx`

- [x] `<InboxCardAIChips>`: HOT badge + revenue/ask/urgency chips на карточке
- [x] `<InboxCardScoreBar>`: тонкая полоса (red ≥0, amber 50-79, grey <50), **число не показывается**
- [x] aria-label для скринридеров (`progressbar`)

### B10. Frontend: AISuggestions.tsx (NEW) ✅

Файл: `client/src/components/inbox/AISuggestions.tsx`

- [x] Максимум 2 карточки: BEST + ALT (никогда 3)
- [x] BEST: gold border-left + gold badge "BEST"
- [x] ALT: свой цвет по type (agg/soft/doc/reschedule/block)
- [x] Click → вставка в compose textarea без блокировки send + autofocus
- [x] CTA лейбл снизу карточки
- [x] Highlight для $-сумм
- [x] Blocked suggestions disabled визуально

### B11. Frontend: HOTToast.tsx (NEW) ✅

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

### B13. Settings: AI Provider switcher + mobilePhone field ✅

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

## ✅ AI Acceptance Criteria — все 8 тестов на проде

- [ ] **T1**: Test SMS с HOT signal → `aiClassification='HOT'` в БД за <5 сек
- [ ] **T2**: Signal chips появляются на карточке inbox без refresh
- [ ] **T3**: AI Banner показывает badge + signals + rep name + timer
- [ ] **T4**: BEST + ALT карточки видимы, ссылаются на реальные signals
- [ ] **T5**: Клик по BEST вставляет текст в compose, можно редактировать и отправить
- [ ] **T6**: Lead отвечает "$90k a month" → revenue chip за <5с, `revenueMonthly=90000` в БД
- [ ] **T7**: HOT alert SMS приходит на rep mobile <30 сек, с именем + 60 char preview
- [ ] **T8**: Импорт CSV → новый lead показывает campaign name как Source (НЕ "csv_import")

---

## 🚀 Deployment

- [ ] Backend build: `cd server && npm run build`
- [ ] Backend deploy: `rsync -az --delete server/dist/ sclserver:/opt/sms-platform/server/dist/`
- [ ] Frontend build: `cd client && npm run build`
- [ ] Frontend deploy: `rsync -az --delete client/dist/ sclserver:/opt/sms-platform/client/dist/`
- [ ] Migration на проде: `ssh sclserver "cd /opt/sms-platform/server && npx prisma migrate deploy"`
- [ ] PM2 restart: `ssh sclserver "pm2 restart sms-api"`
- [ ] Smoke test всех 11 тестов на app.sclcapital.io
- [ ] Anthropic API key добавлен в Settings > Integrations

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
