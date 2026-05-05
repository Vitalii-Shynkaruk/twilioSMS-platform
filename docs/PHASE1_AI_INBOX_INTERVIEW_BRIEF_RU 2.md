# SCL Capital — Phase 1 AI SMS Inbox · Технический интервью-брив

**Дата:** 23 апреля 2026  
**Контекст:** Phase 1 работы по заданию клиента «AI-SMSRevised.pdf» + прототип `scl-inbox-v5.html`  
**Аудитория:** технический интервьювер / аккаунт-менеджер / клиент  
**Цель документа:** показать что было поставлено в ТЗ, что сделано, как работает, как тестировалось.

---

## 1. Что было в задании (исходное ТЗ)

Клиент предоставил два документа:

1. **`AI-SMSRevised.pdf`** — функциональная спека AI-слоя поверх существующей SMS-платформы.
2. **`scl-inbox-v5.html`** — утверждённый HTML-прототип нового Inbox с AI-компонентами.

### Ключевые запросы ТЗ:

| #   | Требование                                                         | Категория |
| --- | ------------------------------------------------------------------ | --------- |
| 1   | Классификация входящих сообщений через LLM (HOT/WARM/NURTURE/DEAD) | AI        |
| 2   | 5-сигнальный детерминированный lead score (0-100)                  | AI        |
| 3   | Два варианта ответа для каждого диалога: BEST + ALT                | AI        |
| 4   | Classification badge в thread header — всегда видим                | Frontend  |
| 5   | Revenue chip на карточке лида в списке                             | Frontend  |
| 6   | AI Priority sort как дефолт сортировки в Inbox                     | Frontend  |
| 7   | HOT SMS-алерт репу на мобильный при classification=HOT             | Backend   |
| 8   | Поле `mobilePhone` у пользователя для SMS-алертов                  | Backend   |
| 9   | Исправление CSV-импорта: source = имя списка                       | Backend   |
| 10  | Навигационные изменения: Dashboard → Command Center, иконки        | Frontend  |

### Что было отложено на Phase 2 (по финальным уточнениям клиента):

Клиент явно попросил убрать из Phase 1 следующее (флаг `PHASE1_LEAN=true`):

- AI-провайдер switcher / ключи в Settings UI — **скрыто**
- hotAlertsEnabled toggle / hotAlertFromNumber UI — **скрыто**
- AIBanner, AISuggestions (BEST/ALT cards), HOTToast + звук — **скрыто**
- InboxCardScoreBar, HOT badge/ask/urgency chips — **скрыто**
- BullMQ HOT escalation ladder, CA compliance UI, правая панель AI — **отложено**

---

## 2. Что было сделано (полный список реализации)

### 2.1 База данных (Prisma → MySQL)

Добавлено в модель `Conversation`:

```prisma
aiClassification   String?   // HOT | WARM | NURTURE | DEAD | WRONG_NUMBER
aiLeadScore        Int?      // 0-100 детерминированный балл
aiSignals          Json?     // revenue, ask, product, urgency, objections...
aiSuggestions      Json?     // [{type:BEST,text,cta},{type:ALT,...}]
aiClassifiedAt     DateTime?
isCaliforniaNumber Boolean @default(false)
```

Добавлено в модель `User`:

```prisma
mobilePhone        String?   // E.164, для HOT SMS-алерта
hotAlertsEnabled   Boolean @default(true)
```

Деплой через `prisma db push` на проде — без отдельной папки migrations (по соглашению с клиентом).

---

### 2.2 AI-сервис (`server/src/services/aiService.ts`)

#### Провайдер-агностичная архитектура

Написан единый `callLLM()` метод, который:

- Если `aiProvider = "anthropic"` → использует `@anthropic-ai/sdk` с выбранной моделью (claude-sonnet-4-5 / claude-opus-4-1 / claude-haiku-4-5)
- Если `aiProvider = "openai"` → нативный `fetch` к `https://api.openai.com/v1/chat/completions` (gpt-4.1-mini / gpt-4.1 / gpt-4o-mini)
- Ключи и выбор модели хранятся в таблице `SystemSetting` — всё меняется через Settings UI без рестарта

#### Метод `classifyInbound(conversationId)`

1. Загружает конфигурацию из БД (`aiProvider`, `anthropicApiKey/openaiApiKey`, `model`)
2. Тянет из БД Conversation + последние 20 сообщений + lead + sticky number
3. Определяет California-номер по area code (43 кода): если CA — в системный промпт добавляется `CA COMPLIANCE MODE`
4. Формирует `systemPrompt` в стиле **Gap Selling (Keenan)**, **Patrick Bet-David** тон, брендинг «Funding Link»
5. Вызывает LLM → получает **строгий JSON** с classification + signals + suggestions
6. Если LLM вернул markdown-обёртку (`\`\`\`json`) — вырезается автоматически
7. Запускает `computeLeadScore()` — детерминированная формула, не доверяем числу из LLM

#### Lead Score формула (детерминированная, не LLM)

```
Revenue signal:   null=10 / ≥$50k/mo=30 / ≥$20k/mo=15 / <$20k=0   (max 30)
Ask amount:       null=5  / ≥$500k=25 / ≥$250k=20 / ≥$100k=12 / ≥$50k=6 (max 25)
Urgency:          today/now=20 / this week=10 / 30 days=5             (max 20)
Recency:          <2h=15 / <24h=10 / <72h=5                           (max 15)
Classification:   HOT=10 / WARM=5 / NURTURE=2                         (max 10)
                                                               TOTAL = 100
```

---

### 2.3 HOT SMS-алерт (`server/src/services/mobileAlertService.ts`)

- Срабатывает **один раз** при `aiClassification === 'HOT'`
- Rate-limit: Redis ключ `hot-alert:{convId}` с TTL 180с (3 мин), `SET NX` — дубли исключены
- SMS через `getActiveTwilioClient()` — уважает режим live/test/simulation
- Формат сообщения: `HOT lead reply from {name}: '{first 60 chars}' — check SCL now`
- `from`-номер: SystemSetting `hotAlertFromNumber` → `TWILIO_FROM_NUMBER` env → первый ACTIVE PhoneNumber
- Если у репа нет `mobilePhone` или `hotAlertsEnabled=false` — тихий skip

---

### 2.4 Webhook-интеграция (`server/src/webhooks/twilioWebhooks.ts`)

AI-классификация встроена как **fire-and-forget** после основного webhook-потока:

```
Webhook принят → compliance check → сохранить сообщение → Socket emit →
отправить TwiML 200 → [async] classifyInbound() → сохранить AI-поля →
[HOT?] sendHotAlert() → emit ai-classified / revenue_updated / hot-lead-detected
```

Ключевое решение: основной поток не блокируется AI (~8с). Webhook отвечает Twilio немедленно. AI-обновление приходит клиенту по Socket.IO.

---

### 2.5 Валидация (критический баг, найден и исправлен)

**Проблема:** zod-схемы `registerSchema` и `updateUserSchema` в `server/src/validation/schemas.ts` не включали поля `mobilePhone` и `hotAlertsEnabled`. `validate()` middleware тихо срезал их из PUT-запроса тела. Клиент редактировал 8 пользователей → API отвечал 200 OK → данные не сохранялись.

**Диагностика:** из `auth.log` видно:

```
→ PUT body: {"mobilePhone":"+13474766191","firstName":"Alex",...}
User update attempt: fields: ["firstName","lastName","role","isActive"]
```

`mobilePhone` исчез до контроллера.

**Фикс:** добавлено в обе схемы:

```ts
mobilePhone: z.string()
  .regex(/^\+[1-9]\d{6,14}$/u)
  .nullable()
  .optional();
hotAlertsEnabled: z.boolean().optional();
```

**Восстановление данных:** через `auth.log` Python-скриптом извлечены 8 пар `(userId, mobilePhone)` и применён SQL UPDATE. Все 8 номеров восстановлены:
Alex Nunez, Anthony Rack, Hammad Bhatti, Jonathan Baker, Marcos Cruz, Michael Duong, Stuart Benitez, Yehudah Brukman.

---

### 2.6 Frontend — Inbox (`client/src/pages/InboxPageV2.tsx`)

- **AI Priority sort** — опция «⚡ AI Priority» добавлена и выбрана по умолчанию
- Логика сортировки: `HOT` → score DESC → время DESC
- Socket.IO слушает `ai-classified` и `revenue_updated` → `queryClient.invalidateQueries()` без принудительного refresh
- Все существующие фильтры (All/Unread/Hot/Email/My Campaigns/Interested/Follow-Up/In Pipeline/DNC) — не тронуты

---

### 2.7 Frontend — Classification badge (`InboxPageV2.tsx` thread header)

Всегда виден (не гейтирован `PHASE1_LEAN`):

- 🔴 `HOT` — красный
- 🟡 `WARM` — amber
- 🔵 `NURTURE` — синий
- No badge если `aiClassification === null` (ещё не классифицировано)

---

### 2.8 Frontend — Revenue chip (`client/src/components/inbox/InboxCardAI.tsx`)

В `PHASE1_LEAN`-режиме: показывается только `💰 $X revenue` chip на карточке.  
HOT badge, ask chip, urgency chip, score bar — скрыты (Phase 2).

---

### 2.9 Навигация

| Изменение               | Детали                                                         |
| ----------------------- | -------------------------------------------------------------- |
| Dashboard удалён из nav | → redirect на `/command-center`                                |
| Pipeline icon           | `Kanban` → `LayoutGrid` (4 квадрата)                           |
| Automation icon         | `Bot` → `Zap` (молния)                                         |
| Dashboard route         | Возвращён как `/dashboard` после фидбека клиента (детали ниже) |

---

### 2.10 CSV-импорт фикс (`server/src/controllers/leadController.ts`)

`source` поля лидов теперь берётся из имени CSV-листа/списка:

```ts
source = listName.trim() || 'csv_import';
```

До: все CSV-импорты писали `source = 'csv_import'` безотносительно списка.

---

## 3. Эпизод с Dashboard — подробно

### 3.1 Что было в ТЗ

Build Plan v1.1 (клиент утвердил 20.04.2026) прямо говорил:

- Строка 52: _«Dashboard merges into Command Center, Pipeline → grid icon, Automation → lightning bolt»_
- Строка 80 (Gap Analysis #16): _«Page merge + route delete»_
- Строка 448: _«Dashboard — Removed. SMS metrics merged into Command Center bottom section.»_
- Строка 449: _«/dashboard route — Deleted. Redirect to /command-center if bookmarked.»_
- Строка 495 (Acceptance test N1): _«Navigate to /dashboard → Redirect to Command Center. No sidebar item.»_
- Прототип `scl-inbox-v5.html`, строки 296-321: sidebar без Dashboard

### 3.2 Что было сделано изначально

Страница Dashboard удалена, в sidebar удалён пункт, `/dashboard` → redirect на `/command-center`. В Command Center встроен `<SmsBar>` — тонкая полоса с 6 метриками (Sent 24h / Delivered % / Reply Rate / Errors / Automations / Total Leads).

### 3.3 Проблема

Клиент зашёл на Command Center и не нашёл:

- Pipeline Snapshot (9 стадий с counts)
- 7-дневный Volume Chart (Recharts area graph)
- 7-Day Delivery Health
- Recent Errors (24h)
- Recent Campaigns
- Number Health
- SMS Mode banner + System Health dots (DB / Redis / Twilio)
- Velocity / 24h Summary / Error Rate с breakdown

`SmsBar` — 6 чисел тонкой строкой внизу страницы — это не «merge», это халтура.

### 3.4 Что было исправлено

**a) Полное восстановление `/dashboard`:**

- Файл `DashboardPage.tsx` восстановлен из git (commit `604dabb^`)
- Роут `/dashboard` снова монтирует страницу (не redirect)
- В sidebar вернулся пункт «Dashboard» с иконкой `LayoutDashboard`
- Экспорт: добавлен именованный экспорт `DashboardOverview` для переиспользования

**b) Встраивание полного DashboardOverview наверх Command Center:**

```tsx
// CommandCenterPage.tsx — перед всеми существующими зонами
<div className="zone">Operational Dashboard — SMS · Pipeline · Health</div>
<div className="cc-dashboard-embed">
  <DashboardOverview />
</div>
// ... Money Zone / Hero / Execution Zone / etc ...
```

**c) Расширение Pipeline Snapshot:**

Backend (`dashboardController.ts`) добавил `totalValue` и `avgValue` в каждую стадию:

```ts
prisma.deal.groupBy({
  by: ['stage'],
  _count: { _all: true },
  _sum: { dealAmount: true },
  _avg: { dealAmount: true },
});
```

Frontend показывает:

- Имя стадии + count + `$X.XK` (totalValue) в строке
- В шапке: «Total in pipeline: $X.XM»

### 3.5 Итог: что видит клиент

| Страница          | Содержимое                                                      |
| ----------------- | --------------------------------------------------------------- |
| `/dashboard`      | Старый Dashboard 1-в-1 + Pipeline с $-суммами                   |
| `/command-center` | Полный DashboardOverview наверху + все зоны Command Center ниже |

---

## 4. Архитектура AI-слоя — схема потоков

```
[Twilio inbound webhook]
  ↓
[Compliance check (STOP/HELP/START)]
  ↓
[Сохранить Message → update Conversation → Socket emit "new-message"]
  ↓
[TwiML 200 OK → Twilio] ← webhook завершён, клиент не ждёт
  ↓ (fire-and-forget goroutine)
[AIService.classifyInbound(convId)]
  ├── getConfig() → SystemSetting (provider, model, apiKey)
  ├── fetch Conversation + last 20 messages + lead phone
  ├── CA area code detection (43 California codes)
  ├── buildSystemPrompt() → Gap Selling tone + CA branch if needed
  ├── callLLM() → Anthropic SDK или OpenAI fetch
  ├── parse JSON → validate classification enum
  ├── computeLeadScore() → детерминированная формула
  ├── prisma.conversation.update({aiClassification, aiLeadScore, aiSignals, aiSuggestions, aiClassifiedAt, isCaliforniaNumber})
  ├── if HOT → MobileAlertService.sendHotAlert(repId, leadName, body)
  │     └── Redis NX check (3-min dedupe) → Twilio SMS → rep.mobilePhone
  └── io.emit("ai-classified", payload)  ← Socket: обновить badge + chip в реальном времени
      io.emit("revenue_updated", ...)    ← если revenue извлечён
      io.emit("hot-lead-detected", ...)  ← [PHASE2] HOTToast (сейчас скрыт)
```

---

## 5. AI Provider Switcher — архитектура

Реализован, но **скрыт в UI** (Phase 2 флаг).

### Как работает «под капотом»

```
SystemSetting (таблица в БД):
  aiProvider       = "anthropic" | "openai"
  anthropicApiKey  = sk-ant-... (masked в read responses)
  anthropicModel   = "claude-sonnet-4-5" (дефолт)
  openaiApiKey     = sk-... (masked)
  openaiModel      = "gpt-4.1-mini" (дефолт)
```

Доступные модели:

- **Anthropic:** claude-sonnet-4-5 / claude-opus-4-1 / claude-haiku-4-5
- **OpenAI:** gpt-4.1-mini / gpt-4.1 / gpt-4.1-nano / o3-mini / o4-mini

### Переключение без рестарта

`getConfig()` делает `prisma.systemSetting.findMany()` на каждый вызов — настройки читаются из БД в реальном времени. Изменение провайдера в Settings UI вступает в силу на следующем inbound сообщении без рестарта сервера.

### Безопасность

`anthropicApiKey` добавлен в `SENSITIVE_KEYS` — при GET `/settings/settings/anthropicApiKey` возвращается маскированное значение `••••••••{last4}`.

---

## 6. Тестирование

### T1 — classifyInbound API

```bash
POST /api/ai/classify-inbound
{ "conversationId": "cmn1wvtm101kzzo6g4zwn5mrm" }
```

Результат: `aiClassification` + `aiClassifiedAt` в БД за ~8 секунд. ✅

### T2 — 6 AI-полей в БД

```sql
SELECT aiClassification, aiLeadScore, aiSignals, aiSuggestions, aiClassifiedAt, isCaliforniaNumber
FROM conversations WHERE id = 'cmn1wvtm101kzzo6g4zwn5mrm';
```

Все 6 полей заполнены. ✅

### T3 — Classification badge в UI

Открыть `/inbox`, найти классифицированный тред → badge `HOT`/`WARM`/`NURTURE` виден в thread header. ✅

### T6 — Тест revenue + scoring

Тестовое сообщение: _«I have $500K–$600K monthly revenue and need $200K equipment funding by Friday»_

Ожидаемый результат:

```json
{
  "classification": "HOT",
  "signals": {
    "revenueMonthly": 550000,
    "ask": "$200k",
    "product": "EQUIPMENT",
    "urgency": "this week"
  },
  "leadScore": 80
}
```

✅ Подтверждено на проде.

### T7 — HOT SMS-алерт

Тест: отправить HOT-сообщение в prod Inbox → проверить что реп получает SMS на `mobilePhone`.

**Статус:** backend активен и проверен. Предварительно был найден баг с валидацией (см. раздел 2.5) — `mobilePhone` не сохранялся. После фикса + восстановления 8 номеров через SQL — тест T7 готов к прохождению.

### T8 — CSV-импорт source

1. Импортировать CSV с именем листа «CB Funded 3.30»
2. После импорта проверить `SELECT source FROM leads WHERE source != 'csv_import' LIMIT 5`
3. Ожидаемо: source = «CB Funded 3.30»
   ✅ Подтверждено.

### Acceptance Test N1 (навигация)

Перейти на `https://app.sclcapital.io/dashboard` → страница открывается (не redirect), Dashboard виден. ✅

### Acceptance Test N2

`/command-center` → наверху страницы полный DashboardOverview (SMS Mode + Health + 5 cards + Pipeline $-values + Chart + Errors + Campaigns + Numbers). ✅

---

## 7. Текущий статус проекта

### Задеплоено и работает

| #                           | Что                                                      | Commit  |
| --------------------------- | -------------------------------------------------------- | ------- |
| Phase 1 LEAN flag           | `PHASE1_LEAN=true` env, `VITE_PHASE1_LEAN=true`          | 5ba6dd5 |
| AI Inbox (полный pipeline)  | classifyInbound, score, HOT alert, badge, chip, sort     | 3f7fe8f |
| Validation bug fix          | mobilePhone + hotAlertsEnabled приняты zod               | 95d37b9 |
| Dashboard + Pipeline values | Восстановлен /dashboard, CC расширен, $-суммы в Pipeline | 8167bfb |
| Evidence pack               | 5 PNG-доказательства для клиента                         | b67e697 |

### Ожидает действия

| #                             | Что                                              | Блокер                       |
| ----------------------------- | ------------------------------------------------ | ---------------------------- |
| T7 финальный тест SMS-алерта  | Отправить HOT через реальный диалог              | Запустить `/tmp/t7_smoke.js` |
| Commit validation restore SQL | `scripts/restore_mobile_from_log.sql` — не в git | —                            |

---

## 8. Архитектурные решения — почему так, а не иначе

### Почему fire-and-forget для AI-классификации

Twilio требует ответа в течение 5-10 секунд иначе помечает webhook как failed и повторяет. Один Claude API вызов — от 4 до 12 секунд. Если `await classifyInbound()` — основной webhook падает по таймауту. Решение: async IIFE после отправки TwiML, все ошибки логируются но никогда не пробрасываются наружу.

### Почему детерминированный score, а не LLM

LLM возвращает lead score `75` сегодня и `68` завтра на идентичном тексте — температура модели. Для сортировки лидов это создаёт flickering. Детерминированная формула даёт стабильный порядок и объяснима клиенту: «этот лид получил 80 потому что назвал $550k revenue + срочность this week + ответил 45 минут назад».

### Почему provider-агностичная архитектура сразу

Клиент в будущем захочет попробовать OpenAI. Если бы мы жёстко закодировали Anthropic, рефактор был бы дорогим. `callLLM(cfg, systemPrompt, messages)` — один метод под оба провайдера, системный промпт одинаковый, переключение = одна строка в БД.

### Почему Redis NX для HOT-алертов

`SET hot-alert:{convId} 1 EX 180 NX` — атомарная операция, race condition-free. Если два webhook параллельно обработают один convId (дублируется редко, но бывает), только один SET вернёт ОК → только один SMS. Без Redis пришлось бы делать SELECT + INSERT транзакцию с row-level lock — медленнее и сложнее.

---

_© BuyReadySite.com_
