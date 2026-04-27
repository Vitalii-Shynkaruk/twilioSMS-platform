# SCL Capital — Leads + Campaigns Refinement · Checklist

> Источник: `SCL_Leads_Campaigns_Refinement.pdf` (получен 27.04.2026)
> Прототип: `scl_leads_campaigns_v1.html`
> Статус: 🔴 Не начато

---

## PHASE 1 — Bug Fixes (SHIPS FIRST, приоритет №1)

### Bug A — Репы не видят лиды, которые они загрузили

**Файл:** `server/src/controllers/leadController.ts`
**Строки:** importMappedCSV (681–832), importCSV (471–608)

- [ ] Найти оба метода: `importMappedCSV` и `importCSV`
- [ ] В массиве `leadsToUpsert` в блоке **`create`** добавить поле:
  `assignedRepId: req.user?.role === 'REP' ? req.user.id : null`
- [ ] В блоке **`update`** — НЕ трогать `assignedRepId` (не перебивать чужую собственность)
- [ ] Проверить: реп AN загружает CSV 50 строк → все 50 видны в его Leads tab сразу
- [ ] Проверить: admin загружает CSV → лиды создаются с `assignedRepId=null`
- [ ] Проверить: повторный импорт существующего лида (по phone) → `assignedRepId` НЕ меняется

### Bug B — Репы видят все кампании, а не только свои

**Файл:** `server/src/controllers/campaignController.ts`
**Строки:** `list` (312–539), `get`, `getAnalytics`, `start`, `pause`, `cancel`, `syncStatuses`

- [ ] Добавить rep-scope filter во все 7 endpoint'ов:
  `if (req.user?.role === 'REP') { where.createdById = req.user.id; }`
- [ ] Проверить: реп AN → видит только свои кампании
- [ ] Проверить: реп AN → GET /campaigns/{другой-id} → 404 или 403
- [ ] Проверить: реп AN → POST /campaigns/{другой-id}/start → 403
- [ ] Проверить: admin → видит все кампании независимо от createdById
- [ ] Убедиться: `ensureRetargetAccess` guard продолжает работать

### Phase 1 — Demo script (acceptance)

- [ ] Войти как реп AN, загрузить 50-строчный CSV через Leads tab → видим 50 лидов сразу
- [ ] Войти как admin JB → те же 50 лидов видны в admin view
- [ ] Войти как реп AN → Campaigns tab → видим только кампании AN
- [ ] Войти как реп MC → Campaigns tab → видим только кампании MC, НЕ видим кампании AN
- [ ] Войти как admin JB → видим все кампании всех репов

---

## PHASE 2 — Leads Tab Filters (UI only, API уже поддерживает)

**Файл:** `client/src/pages/LeadsPage.tsx`

### Добавить 3 новых дропдауна рядом с существующими Status + Lists

- [ ] **Source** dropdown (`?source=...`)
  - Опции: "All sources" + динамический список из `SELECT DISTINCT source`
  - API-параметр уже поддерживается
- [ ] **State** dropdown (`?state=...`)
  - Опции: "All states" + динамический список из `SELECT DISTINCT state`
  - API-параметр уже поддерживается
- [ ] **Last Contacted** dropdown (`?lastContactedBefore=...`) — НОВЫЙ API param
  - Опции: Any / Never contacted / 30+ days / 90+ days
  - В `leadController.ts` (метод `list`) добавить:
    - `never` → `{ lastContactedAt: null }`
    - `30d` → `{ lastContactedAt: null }` OR `{ lastContactedAt: { lt: now-30d } }`
    - `90d` → `{ lastContactedAt: null }` OR `{ lastContactedAt: { lt: now-90d } }`

### Phase 2 — Acceptance criteria

- [ ] 3 новых дропдауна рендерятся рядом с существующими Status + Lists
- [ ] Source → выбор фильтрует таблицу
- [ ] State → выбор фильтрует таблицу
- [ ] Last Contacted "Never" → только лиды с `lastContactedAt=null`
- [ ] Last Contacted "30+ days" → лиды с `lastContactedAt < now-30d` или `null`
- [ ] Все фильтры работают вместе (AND-логика)
- [ ] Существующие Search + Status + Lists продолжают работать

---

## PHASE 3 — AI Suggested Campaigns (ОСНОВНАЯ фича, revenue)

### 3.1 Backend: Новая таблица `lead_cohorts`

**Файл:** `server/prisma/schema.prisma`

- [ ] Добавить модель `LeadCohort`:
  - `id`, `userId`, `cohortType` (multi_retarget | new_cohort | renewal)
  - `title`, `description`, `query` (Json), `sourceCampaigns` (Json?)
  - `predictedReplyRate` (Float?), `predictedPipeline` (Decimal?)
  - `aiReasoning` (Text), `resolvedLeadCount` (Int?)
  - `totalMatchCount` (Int?), `perCampaignCapApplied` (Int?)
  - `dailyRemainingAtGeneration` (Int?)
  - `createdAt`, `expiresAt` (createdAt + 24h)
  - Индекс: `[userId, expiresAt]`
- [ ] Запустить Prisma migration

### 3.2 Backend: Новый сервис `campaignRecommendationService.ts`

**Файл:** `server/src/services/campaignRecommendationService.ts`

- [ ] Создать сервис с тремя cohort-генераторами:

**Generator 1 — Multi-campaign retarget:**
- [ ] Pulls delivered+no-reply leads из последних 90 дней кампаний репа
- [ ] Исключает: opted_out, DNC, suppressed, лиды в активных сделках (ENGAGED/QUALIFIED/SUBMITTED)
- [ ] **7-day cooldown**: исключать лиды, контактированные в любой кампании за последние 7 дней
- [ ] Условие: `COUNT(DISTINCT campaign_id) >= 1` (хотя бы 1 кампания)

**Generator 2 — New cohort from unsent leads:**
- [ ] Профиль из funded deals репа (industry, state, avg revenue_band)
- [ ] Лиды без ЕДИНОЙ кампании (`NOT IN campaign_leads`)
- [ ] **7-day cooldown**: исключать лиды, контактированные за последние 7 дней
- [ ] Фильтр по industry + state из funded_profile

**Generator 3 — Renewal candidates:**
- [ ] Funded clients в окне 8–12 месяцев после `funded_at`
- [ ] **30-day cooldown** (строже, т.к. высоко-touch взаимодействие)
- [ ] Исключает opted_out, suppressed

- [ ] Каждый генератор учитывает `effectiveCap = MIN(perCampaignCap, remainingDailyCapacity)` перед сохранением
- [ ] Сортировка по `predicted_score` DESC, берём top effectiveCap лидов

### 3.3 Backend: AI reasoning через Anthropic Sonnet 4.5

- [ ] Для каждого top-3 когорта — вызов Anthropic API
- [ ] Контекст промпта: filter criteria + 20 анонимных лидов + funded history aggregates
- [ ] Промпт: объяснение 1-2 предложения, тактический next step
- [ ] Кэширование reasoning в `lead_cohorts.aiReasoning` на 24h (не пересчитывать)

### 3.4 Backend: Cron job (каждые 15 минут)

**Файл:** `server/src/jobs/campaignRecommendationCron.ts`

- [ ] `node-cron` каждые 15 минут
- [ ] Для каждого пользователя (admin + каждый реп) — генерировать top-3 когорт
- [ ] Сохранять в `lead_cohorts` с `expiresAt = now + 24h`
- [ ] Старые записи автоматически игнорируются через `WHERE expiresAt > now`

### 3.5 Backend: Новые limits конфиг

**Файл:** `server/src/config/limits.ts`

- [ ] `MAX_BULK_SEND_PER_REP = 500`
- [ ] `MAX_BULK_SEND_PER_ADMIN = 3000`
- [ ] `MAX_DAILY_TOTAL_PER_REP = 800`
- [ ] `MAX_DAILY_TOTAL_PER_ADMIN = 4500`

### 3.6 Backend: Two-layer cap в `CampaignController.create`

- [ ] **Layer 1 — Per-campaign cap:**
  - `resolvedLeadIds.length > perCampaignCap` → 400 `PER_CAMPAIGN_CAP_EXCEEDED`
  - Ответ включает: `requested`, `cap`, `role`
- [ ] **Layer 2 — Rolling 24h daily total cap:**
  - `dailyUsed = COUNT(campaignLeads WHERE createdAt > now-24h AND campaign.createdById = user.id)`
  - `dailyUsed + resolvedLeadIds.length > dailyTotalCap` → 400 `DAILY_TOTAL_CAP_EXCEEDED`
  - Ответ включает: `dailyUsed`, `dailyTotalCap`, `remaining`, `requested`
- [ ] Оба ограничения server-side (обойти нельзя через UI)

### 3.7 Backend: API endpoint для cohort данных

- [ ] `GET /api/campaigns/ai-cohorts` — возвращает top-3 когорта для текущего пользователя
- [ ] Репы видят только свои когорты (`userId = req.user.id`)
- [ ] Admin видит cross-team паттерны
- [ ] `POST /api/campaigns/ai-cohorts/:id/resolve` — возвращает `leadIds[]` для когорта

### 3.8 Frontend: AI Suggested Campaigns зона

**Файл:** `client/src/pages/CampaignsPage.tsx`

- [ ] Новая секция **вверху** Campaigns tab (над существующей таблицей кампаний)
- [ ] Заголовок: "AI Suggested Campaigns" с refresh countdown (15 min)
- [ ] **3 карточки когортов**, каждая содержит:
  - [ ] Category badge: "Multi-Campaign Retarget" / "New Cohort" / "Renewal"
  - [ ] Title + Description
  - [ ] Статистика: lead count, predicted reply rate, est. pipeline
  - [ ] Source attribution (имена кампаний / источники)
  - [ ] Italic AI reasoning footer
  - [ ] Daily capacity bar: "X leads · daily capacity Y of Z used (P%)"
    - Красный когда >75% дневного лимита использовано
  - [ ] Кнопка "Build Campaign →"
- [ ] Если cohort > per-campaign cap: показывать "500 of 1,842 leads"
- [ ] Если daily почти заполнен: показывать `'320 of 1,842 leads · daily capacity nearly full'`

### 3.9 Frontend: "Build Campaign →" hand-off

- [ ] Клик → открывает **существующий** New Campaign modal
- [ ] Pre-loads когорт как lead set (передать `leadIds[]` через React state)
- [ ] Существующий send-path без изменений (AI только upstream)

### 3.10 Frontend: Error toasts при cap errors

- [ ] `PER_CAMPAIGN_CAP_EXCEEDED` → toast с деталями лимита
- [ ] `DAILY_TOTAL_CAP_EXCEEDED` → toast: `"Daily capacity: X of Y used. Remaining: Z"`

### Phase 3 — Acceptance criteria

- [ ] AI Suggested Campaigns зона рендерится вверху Campaigns tab
- [ ] 3 карточки всегда показывают: Multi-retarget / New cohort / Renewal
- [ ] Refresh каждые 15 минут (cron работает)
- [ ] Per-rep: реп видит только свои когорты. Admin — cross-team
- [ ] AI reasoning содержит реальные данные (не generic boilerplate)
- [ ] "Build Campaign →" открывает modal с pre-loaded leads
- [ ] opted-out / DNC / suppressed исключены из всех когортов
- [ ] Multi-retarget исключает лиды в активных сделках (ENGAGED/QUALIFIED/SUBMITTED)
- [ ] **7-day cooldown**: лиды контактированные за 7 дней — НЕ в multi-retarget и new cohort
- [ ] **30-day cooldown**: лиды контактированные за 30 дней — НЕ в renewal cohort
- [ ] Cooldown test: отправить кампанию Day 0 → Day 1 эти лиды НЕ в когортах → Day 8 могут быть
- [ ] Rep >500 leads → 400 `PER_CAMPAIGN_CAP_EXCEEDED`
- [ ] Admin >3000 leads → 400 `PER_CAMPAIGN_CAP_EXCEEDED` (admin limit)
- [ ] Rep 600 sent + попытка 300 more = 900 > 800 → 400 `DAILY_TOTAL_CAP_EXCEEDED` (remaining: 200)
- [ ] Admin 4200 sent + попытка 500 = 4700 > 4500 → 400 `DAILY_TOTAL_CAP_EXCEEDED`
- [ ] Rolling 24h: кампания из 24h+1min назад НЕ считается в daily total
- [ ] AI cohort cards никогда не показывают больше MIN(per-campaign cap, remaining daily capacity)
- [ ] Daily capacity counter всегда виден на каждой карточке

---

## Sequencing

1. **Phase 1 FIRST** — баги блокируют репов прямо сейчас
2. **Phase 2 + Phase 3 параллельно** — независимы между собой
3. Phase 3 работает лучше когда AI inbox classifier (M2) live, но может работать на `CampaignLead` outcome data alone

---

## Deferred (Phase 4+, не квотировать сейчас)

- Channel-aware suppression columns
- List Index modal + List Detail panel
- Cohort save/persistence
- Saturation throttle
- Per-lead time-zone scheduling
- Lead enrichment vendor integration (Clay, Apollo)

*Переоценить через 60 дней после деплоя Phase 3*
