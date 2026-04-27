# SCL Capital — Phase 2: Pipeline + Command Center

> **Дата:** 24 марта 2026  
> **Статус:** Анализ и планирование  
> **Спецификация:** VITALII SPEC.pdf (SCL_Platform_BuildSpec.docx)  
> **Прототипы:**
>
> - Command Center: https://papaya-swan-76d714.netlify.app/command.center
> - Pipeline: https://papaya-swan-76d714.netlify.app/pipeline.html

---

## ВЕРДИКТ

### Масштаб работы: БОЛЬШОЙ (≈ 150-200 человеко-часов)

Это **полная переделка двух ключевых модулей** (Pipeline + Dashboard → Command Center) с:

- Новой схемой БД (12+ новых таблиц/полей)
- Совершенно новым UI для двух вкладок (Pipeline заменяется 9-стадийным Kanban, Dashboard заменяется Command Center)
- Real-time подпиской (Supabase Realtime)
- Системой ролей + RLS (Row Level Security)
- Системой автоматизации бизнес-логики (триггеры, CRON-задачи)
- Модулем Product Mix, Goals, Execution Score, Renewal Queue

### Ключевые риски и проблемы

1. **КОНФЛИКТ СТЕКА: MySQL/Prisma vs Supabase/PostgreSQL**
   - Текущий стек: **MySQL 8.0 + Prisma ORM + Express + JWT Auth**
   - Клиент хочет: **Supabase (PostgreSQL) + Supabase Auth + Supabase Realtime + RLS**
   - Спец написана для Supabase с нуля (все SQL-запросы — это Supabase JS SDK, `supabase.from('deals')`)
   - **Варианты решения:**
     - a) **Мигрировать на Supabase** — переписать ВСЮ БД, auth, API. По сути переписать бекенд.
     - b) **Реализовать на текущем стеке (MySQL + Prisma)** — перевести логику спеки на наш стек. Гораздо дешевле, но клиенту надо объяснить, что Supabase — это деталь реализации прототипа, а не жёсткое требование.
   - **⚠️ РЕКОМЕНДАЦИЯ: Вариант (b)** — реализовать на текущем стеке. Миграция на Supabase удвоит объём работы и сломает всё что работает.

2. **Прототипы — это статический HTML, не React-компоненты**
   - `pipeline.html` и `scl_command_center_final.html` — standalone HTML файлы с hardcoded данными
   - Нужно воссоздать UI pixel-perfect в React + Tailwind на основе прототипов
   - Объём UI-работы огромный (десятки компонентов)

3. **Бизнес-логика очень детальная и жёсткая**
   - 22 «Non-Negotiable Business Rules»
   - 4 автоматических триггера смены стадии
   - Product-specific timing и stale thresholds
   - Формулы Pipeline Value, HOT logic, Execution Score
   - HELOC rescission window (юридическое требование)

4. **Динамическая система на 7+ rep'ов**
   - Текущая система: 3 юзера (login-based, JWT)
   - Нужна: полная система ролей admin/rep, dynamic views, simulation mode

---

## ТЕКУЩЕЕ СОСТОЯНИЕ vs ЧТО НУЖНО

| Область           | Сейчас есть                                                                                                           | Нужно по спеке                                                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **БД**            | MySQL + Prisma, 18 моделей (User, Lead, Campaign, Message, Conversation, PhoneNumber, PipelineStage, PipelineCard...) | Добавить: deals, clients, offers, funding_events, renewal_tasks, deal_events, goals + мигрировать PipelineStage из 5 в 9 стадий |
| **Auth**          | JWT + bcrypt, роли ADMIN/MANAGER/REP                                                                                  | Добавить: admin simulation mode, dynamic rep views, rep management UI                                                           |
| **Pipeline**      | 5 стадий (New, Contacted, Replied, Interested, Docs_Requested), базовый Kanban c drag-drop                            | 9 стадий с автоматизацией, sub-statuses (Committed), product types, deal amounts, HOT badge, stale detection                    |
| **Dashboard**     | SMS метрики (sent/delivered, reply rate, velocity, pipeline snapshot)                                                 | Полная замена на Command Center с 3 зонами: Money/Execution/Intelligence                                                        |
| **Real-time**     | Socket.IO (disabled), React Query polling                                                                             | Supabase Realtime — НО МЫ МОЖЕМ использовать Socket.IO или polling с автообновлением                                            |
| **Goals**         | Нет                                                                                                                   | Monthly/Annual goals per rep, goal progress bars                                                                                |
| **Product Mix**   | Нет                                                                                                                   | MCA/SBA/Equipment/HELOC/CRE/Bridge with color system                                                                            |
| **Renewal Queue** | Нет                                                                                                                   | Funded → auto-create 3 renewal tasks, one-card-at-a-time workflow                                                               |
| **CSV Import**    | Есть для leads                                                                                                        | Нужно для historical funded deals                                                                                               |
| **SMS**           | Полностью работает (Twilio 10DLC)                                                                                     | Интеграция SMS в Pipeline (текст из карточки deal)                                                                              |

---

## ПЛАН РЕАЛИЗАЦИИ: 4 ФАЗЫ

### ФАЗА 1: Фундамент — БД + Модели + Auth (≈ 35-45 часов)

**Цель:** Подготовить данные и серверную инфраструктуру для Pipeline и Command Center.

#### 1.1 Расширение схемы БД (Prisma)

- [ ] Новая модель `Client` — permanent record per business (business_name, contact_phone, contact_email, total_funded, funding_count, last_funded_date)
- [ ] Новая модель `Deal` — основная сущность pipeline (business_name, stage, product_type, deal_amount, assigned_rep_id, assisting_reps, next_action, next_action_due, last_activity_at, days_in_stage, stale_days, is_hot_computed, app_submitted, lender_engaged, last_reply_at, commit_sub_status, days_in_sub_status, follow_up_date, follow_up_type, fu_note, prev_offer, cycle_time)
- [ ] Новая модель `Offer` — lender offers per deal (deal_id, lender_name, amount, term_months, rate_factor, product_type, expiry_days, notes, created_at)
- [ ] Новая модель `FundingEvent` — permanent funding ledger (deal_id, rep_id, client_id, amount_funded, funded_date, funder_name, term_months, rate, product_type, notes)
- [ ] Новая модель `RenewalTask` — auto-created after funding (funding_event_id, deal_id, task_type: checkin_35d/midpoint/payoff_30d, due_date, is_overdue, completed_at)
- [ ] Новая модель `DealEvent` — audit trail (deal_id, rep_id, event_type, note, created_at)
- [ ] Новая модель `Goal` — entity_id, monthly_goal, annual_goal
- [ ] Расширить модель `User` — добавить initials, avatar_color, monthly_goal, annual_goal, is_active, twilio_numbers
- [ ] Расширить модель `PhoneNumber` — добавить rep_id (FK → User)
- [ ] Миграция: создать 9 pipeline stages, мигрировать 81 lead из старых 5 стадий

#### 1.2 API-маршруты (Backend)

- [ ] CRUD контроллер для `Deal` (create, read, update, list с фильтрами по rep)
- [ ] CRUD контроллер для `Client`
- [ ] Контроллер для `Offer` (create, list by deal, удаление)
- [ ] Контроллер для `FundingEvent` (create + auto-create renewal tasks + update client totals)
- [ ] Контроллер для `DealEvent` (list by deal)
- [ ] Контроллер для `RenewalTask` (list, complete, mark overdue)
- [ ] Goals API (get/set goals — admin only)
- [ ] Rep Management API (CRUD, admin only)
- [ ] Pipeline metrics API (funded MTD, pipeline value, hotleads count, etc.)

#### 1.3 Автоматизация (Бизнес-логика на бэкенде)

- [ ] Trigger Rule 1: `app_submitted = true` → stage = "Submitted (In Review)"
- [ ] Trigger Rule 2: Offer inserted → stage = "Approved / Offers"
- [ ] Trigger Rule 3: Client Accepts → stage = "Committed (Funding)"
- [ ] Trigger Rule 4: Mark as Funded → stage = "Funded" + create FundingEvent + 3 RenewalTasks
- [ ] CRON jobs: daily increment days_in_stage, stale_days, overdue detection
- [ ] HOT logic computation (48h reply, stage = Approved/Committed, lender_engaged + app_submitted)

#### 1.4 Auth расширения

- [ ] Admin Simulation Mode — API endpoint для "view as rep X"
- [ ] Dynamic rep filter — middleware/helper для фильтрации по assigned_rep_id
- [ ] Rep Management UI data endpoints

#### 1.5 Миграция данных

- [ ] Скрипт миграции 81 существующих leads в новые deals (New→New Lead, Contacted→Engaged, etc.)
- [ ] Сохранение SMS-истории (линковка существующих conversations с deals через phone lookup)

---

### ФАЗА 2: Pipeline Tab — 9-стадийный Kanban (≈ 40-50 часов)

**Цель:** Полностью заменить содержимое Pipeline tab новым 9-стадийным UI по прототипу.

#### 2.1 Pipeline Board (основной вид)

- [ ] 9 колонок: New Lead, Engaged/Interested, Qualified, Submitted (In Review), Approved/Offers, Committed (Funding), Funded, Nurture, Closed
- [ ] Drag-and-drop перемещение карточек между стадиями (с валидацией правил)
- [ ] Два режима отображения: Simple (default) и Execution (полная плотность)
- [ ] Toolbar фильтры: All / Mine / Overdue / Hot / Neglected / This Week
- [ ] Views: My Pipeline / Team Pipeline / All Deals (admin)
- [ ] Revive Queue tab

#### 2.2 Deal Cards

- [ ] Business name (крупный), product type badge (цветной), deal amount
- [ ] Next action + due date
- [ ] HOT badge (computed), Days in stage
- [ ] Rep initials avatar circle
- [ ] Stale indicator, Overdue glow (red pulse)
- [ ] Simple mode: минимально (amount, name, action, badge)
- [ ] Execution mode: все детали (offer, status pills, rep, staleness bar, age)

#### 2.3 Deal Detail Panel (выдвижная панель)

- [ ] Полная информация о deal + client
- [ ] Вкладки: Overview, Offers, Activity, SMS Conversation
- [ ] Add Offer модал (lender, amount, term, rate, product, notes)
- [ ] Mark as Funded модал (дата, сумма, funder, term, rate, product + auto-renewal milestones preview)
- [ ] Close Deal модал (Lost — Recoverable / NQ — с reason + re-engage date)
- [ ] Schedule Follow-Up модал (type + date + note — все обязательны)
- [ ] Complete Action модал (2-step: select action type → set next action + due date)
- [ ] Call / Text buttons (Twilio integration)

#### 2.4 Committed (Funding) Sub-statuses

- [ ] 3 sub-statuses: docs_requested, docs_signed, funding
- [ ] Progress track visual в Execution mode
- [ ] HELOC rescission window notice (юридическое требование!)
- [ ] Product-specific stall thresholds

#### 2.5 Goals в Pipeline

- [ ] Bottom stats bar: Active Pipeline $, Funded MTD + goal progress, Lifetime Funded, At Risk, Hot, No Next Action, Queue Today, Renewals Due
- [ ] Team Goals модал (admin only) — set monthly/annual targets
- [ ] Goal progress bars

#### 2.6 Revive Queue

- [ ] Отдельный tab внутри Pipeline
- [ ] One-card-at-a-time workflow
- [ ] Источники: Renewal candidates (funded 150+ days), Revive (nurture/approved 30+ days idle), Statement refresh (submitted 21+ days)
- [ ] Action buttons: Request Statements / Call Now / Reopen / Skip / Complete
- [ ] Next/Previous navigation

---

### ФАЗА 3: Command Center (≈ 50-60 часов)

**Цель:** Заменить Dashboard tab → Command Center с 3 зонами (Money, Execution, Intelligence).

#### 3.1 Навигация и Инфраструктура

- [ ] Переименовать "Dashboard" → "Command Center" в nav
- [ ] Route: /command-center (default landing page after login)
- [ ] Role toggle в topbar (Admin / Rep JB / Rep HA / etc.) — динамически из reps table
- [ ] Admin simulation mode (admin видит дешборд конкретного rep'а)
- [ ] Real-time обновление при изменении deals (Socket.IO или polling с автообновлением)
- [ ] Live Mode badge + timestamp
- [ ] - Add Lead / Import CSV buttons

#### 3.2 Money Zone (верхняя зона)

- [ ] Hero section: приветствие, Funded MTD (animated counter), Goal progress bar, Projected month-end
- [ ] Scorecard row (4 метрики): Funded MTD $, Pipeline Value $, Committed $, At Risk $
- [ ] Pipeline Value = Approved/Offers + Committed + Nurture (только с prevOffer > 0!)
- [ ] At Risk $ = Approved/Committed deals с overdue, no next action, or stalled 48h+
- [ ] Future Opportunities card: next 7d / 30d / total (from follow_up_date + renewal_tasks)
- [ ] **ВАЖНО:** «In Review $» НЕ показывается нигде (requested amounts — не реальные деньги)

#### 3.3 Execution Zone (средняя зона)

- [ ] Operator Queue (admin) / Close These Today (rep) — ranked by stage priority + deal size + urgency
- [ ] Hot Leads card — is_hot deals с primary CTA (Call Now / Close Now / Schedule)
- [ ] Stale Deals card — last_activity > 24h + revenue at risk total
- [ ] Overdue Tasks card — next_action_due < today + Act Now / Send Now buttons
- [ ] Complete Action модал (2-step) — повторно используем из Pipeline

#### 3.4 Intelligence Zone (нижняя зона)

- [ ] System Bottlenecks — $ stuck by stage, rep ownership drill-down
- [ ] Rep Activity Monitor — active/idle/offline + financial impact
- [ ] Rep Performance Table — sortable (funded $, conversion %, pipeline $, committed $)
- [ ] Pipeline Snapshot — 9 стадий с count + $ volume as visual bars
- [ ] Conversion Funnel — Lead → Contacted → Qualified → Submitted → Funded + weakest stage
- [ ] Pipeline Health strip — % deals with next action, % touched 48h, % properly staged
- [ ] Next 5 Actions — ranked by value + urgency + proximity to funded
- [ ] Activity Feed — real-time deal_events stream

#### 3.5 Product Mix Module

- [ ] Team aggregate segmented bar (MCA/SBA/Equipment/HELOC/CRE/Bridge)
- [ ] Цветовая система продуктов (6 цветов: gold, blue, green, purple, coral, teal)
- [ ] Rep breakdown table — Funded $, MCA%, SBA%, Equipment%, HELOC%, Top Product, Profile
- [ ] vs-team delta на каждом проценте
- [ ] Profile flags: Over-concentrated / Under SBA / Balanced
- [ ] Toggle: Lifetime / Last 30 Days с delta arrows

#### 3.6 Execution Score

- [ ] Compact bar в topbar (рядом с role toggle)
- [ ] Score per active rep: (completed_actions_today / assigned_actions_today) × 100
- [ ] Color: ≥75% green, ≥50% amber, <50% red
- [ ] Popup breakdown on click: actions completed, overdue, deals touched

#### 3.7 SMS Metrics Strip (нижняя secondary полоса)

- [ ] Перенос метрик из текущего Dashboard (sent, delivered, reply rate, errors, automations, total leads)
- [ ] **Критично:** фильтрация per rep по assigned Twilio numbers
- [ ] Admin видит все номера, rep видит только свои

#### 3.8 CSV Import для исторических данных

- [ ] Import modal для funded deals (business_name, rep_name, product_type, funded_amount, funded_date)
- [ ] Маппинг rep_name (initials) → rep_id
- [ ] Creates deals в stage "Funded"

---

### ФАЗА 4: Интеграция, Rep Management, Тестирование, Деплой (≈ 25-35 часов)

**Цель:** Связать всё вместе, протестировать бизнес-правила, задеплоить.

#### 4.1 Rep Management UI (Settings tab)

- [ ] Admin-only CRUD: Full Name, Initials, Email, Role, Monthly Goal, Annual Goal, Avatar Color, Active toggle
- [ ] Auto-suggest initials из имени
- [ ] Validation: unique initials, unique email
- [ ] Soft delete (deactivate only, never hard delete)
- [ ] Admin не может удалить себя или изменить свою роль

#### 4.2 Twilio Number Assignment

- [ ] UI для присвоения номеров rep'ам в Numbers tab
- [ ] rep_id FK на PhoneNumber
- [ ] SMS metrics фильтрация по выбранным номерам

#### 4.3 Seed Data

- [ ] Seed 3 confirmed reps (JB admin, HA rep, NU rep) с goals
- [ ] Seed 4 TBD slots (получить данные от клиента)
- [ ] Seed 9 pipeline stages
- [ ] Default goals: Team $5.8M/mo, JB $2.5M, HA $2M, NU $1.3M

#### 4.4 Stage Migration Script

- [ ] Маппинг: New→New Lead, Contacted→Engaged, Replied→Engaged (set HOT), Interested→Qualified, Docs_Requested→Submitted
- [ ] Preserve all 81 leads + phone + SMS history
- [ ] Link conversations to deals

#### 4.5 Тестирование бизнес-правил (22 Non-Negotiable Rules)

- [ ] Client records never deleted
- [ ] Active Pipeline $ = Approved + Committed ONLY
- [ ] Funded excluded from Active Pipeline
- [ ] App submitted → auto Submitted stage
- [ ] Offer → auto Approved stage
- [ ] Approved = ALWAYS HOT
- [ ] Rep assignment = admin only
- [ ] Goals = admin only
- [ ] Closed deals locked (admin unlock)
- [ ] HELOC rescission window notice
- [ ] Product-specific stall thresholds
- [ ] Follow-up = type + date + note (all required)
- [ ] Pipeline is extension of same app (same auth, same Twilio)
- [ ] «In Review $» NOT shown in Command Center
- [ ] Pipeline Value correct calculation
- [ ] Submitted count only, no dollar amounts

#### 4.6 Real-Time Sync тестирование

- [ ] Deal stage change → Command Center updates within 2s
- [ ] Deal funded → Funded MTD increments
- [ ] Deal moved to/from Approved → Pipeline Value updates
- [ ] Nurture prevOffer add/remove → Pipeline Value updates
- [ ] Mobile responsive (390px viewport)

#### 4.7 Деплой

- [ ] DB migration на production (198.199.91.174)
- [ ] Seed data
- [ ] Stage migration script
- [ ] Build + deploy frontend
- [ ] Test on app.sclcapital.io
- [ ] Verify all checklist items from spec (page 3221-3227)

---

## GAP-АНАЛИЗ: КОНФЛИКТЫ СПЕКИ vs РЕАЛЬНОСТЬ

### 1. Supabase vs наш стек

| Спека требует                                 | У нас                                     | Решение                                                                |
| --------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| Supabase PostgreSQL                           | MySQL 8.0 + Prisma                        | Реализуем на MySQL/Prisma. Все SQL из спеки переводим в Prisma queries |
| Supabase Auth + RLS                           | JWT + bcrypt                              | Используем наш JWT auth + role-based middleware                        |
| Supabase Realtime                             | Socket.IO (disabled), React Query polling | Включаем Socket.IO на VPS или используем aggressive polling (5-10s)    |
| Supabase JS SDK (`supabase.from('deals')...`) | Axios + Express REST                      | Все клиентские запросы через наш API (`api.get('/deals')`)             |
| Database triggers (Supabase)                  | Нет DB triggers                           | Реализуем как Express middleware / service hooks                       |

### 2. Lovable (React) vs наш React

| Спека упоминает            | Реальность                                                    |
| -------------------------- | ------------------------------------------------------------- |
| "Lovable (React)" frontend | Мы используем plain React + Vite + TailwindCSS — эквивалентно |

### 3. Domain и хостинг

| Спека             | Реальность                               |
| ----------------- | ---------------------------------------- |
| app.SCLCapital.io | app.sclcapital.io — уже работает ✅      |
| Resend (email)    | Не реализовано — не критично для Phase 2 |
| Name.com DNS      | DNS уже настроен ✅                      |

---

## ЧТО МОЖНО ПЕРЕИСПОЛЬЗОВАТЬ ИЗ PHASE 1

1. ✅ **Auth система** — JWT + roles (ADMIN/MANAGER/REP) → просто расширяем
2. ✅ **Twilio интеграция** — 10DLC зарегистрирован, SMS работает
3. ✅ **Inbox** — conversations + messages → линкуем к deals
4. ✅ **Campaigns, Leads, Numbers, Automation** — НЕ ТРОГАЕМ
5. ✅ **Settings tab** — расширяем Rep Management
6. ✅ **Layout, sidebar, nav** — минимальные изменения (Dashboard→Command Center)
7. ✅ **React Query, Axios, Zustand** — вся инфраструктура фронтенда
8. ✅ **Redis, BullMQ** — для CRON-задач и очередей
9. ✅ **Deployment infrastructure** — Nginx, PM2, SSL

---

## ОЦЕНКА СЛОЖНОСТИ

| Фаза                         | Объём         | Сложность | Часы        |
| ---------------------------- | ------------- | --------- | ----------- |
| 1. Фундамент (БД, API, Auth) | Большой       | Средняя   | 35-45       |
| 2. Pipeline Tab              | Очень большой | Высокая   | 40-50       |
| 3. Command Center            | Огромный      | Высокая   | 50-60       |
| 4. Интеграция, тест, деплой  | Средний       | Средняя   | 25-35       |
| **ИТОГО**                    |               |           | **150-190** |

### Стоит ли браться?

**ДА, но с условиями:**

1. **Реализуем на СВОЁМ стеке** (MySQL + Prisma + Express), а не мигрируем на Supabase. Клиенту объясняем, что прототипы — это reference UI, а технический стек остаётся прежним.

2. **Принимаем pixel-perfect подход к UI** — прототипы детальные и клиент ожидает точное соответствие.

3. **Поэтапная сдача** — каждая фаза тестируется отдельно. Не пытаемся сдать всё сразу.

4. **Уточнить у клиента:**
   - Данные для Rep 4-7 (имена, email, initials)
   - Подтвердить что Supabase — не жёсткое требование (мы реализуем ту же функциональность)
   - CSV с историческими funded deals для импорта
   - Приоритетность At Risk $ (optional по спеке)

### Почему НЕ стоит отказываться:

- 80% инфраструктуры уже на месте (auth, Twilio, hosting, deployment pipeline)
- Все «лёгкие» вкладки (Leads, Campaigns, Inbox, Numbers, Automation, Analytics) остаются AS-IS
- Задача чётко специфицирована (прототипы + 23-страничная спецификация) — нет неопределённости
- Спека очень профессиональная, бизнес-логика хорошо продумана

### Почему нужна осторожность:

- Клиент ожидает Supabase — нужно на старте согласовать техническое решение
- 22 non-negotiable business rules — каждое нужно имплементировать и протестировать
- UI очень детальный — десятки мелких компонентов, модалов, состояний
- Real-time синхронизация Pipeline ↔ Command Center — сложная зависимость

---

## КРИТИЧЕСКИЙ ПУТЬ

```
Фаза 1 ──→ Фаза 2 ──→ Фаза 3 ──→ Фаза 4
(БД+API)   (Pipeline)  (CC)        (Интеграция)
   │            │           │
   └── Можно показать клиенту после каждой фазы
```

Фазы строго последовательны — Command Center зависит от Pipeline, Pipeline зависит от БД.

---

## ФАЙЛЫ НЕОБХОДИМЫЕ ОТ КЛИЕНТА

1. `scl_schema.sql` — SQL-схема для Supabase (мы адаптируем под наш стек)
2. `pipeline.html` (scl-pipeline-v7-final.html) — прототип Pipeline
3. `scl_command_center_final.html` — прототип Command Center
4. Данные по Rep 4-7 (имена, email, initials)
5. CSV с историческими funded deals (для импорта)
6. Подтверждение: можно ли реализовать на текущем стеке (MySQL) или строго Supabase?
