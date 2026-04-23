# SCL SMS Platform — Интервью-брив для встреч с клиентом

**Дата:** 2026-04-13  
**Аудитория:** интервьювер / аккаунт-менеджер / тимлид, который ведет созвоны с клиентом  
**Цель:** дать полное понимание, как платформа работает в UI и “под капотом”, чтобы уверенно отвечать на сложные вопросы клиента.

---

## 1) Что это за система в 1 минуту

SCL Platform — это CRM + SMS execution layer поверх Twilio:

- `Pipeline` управляет стадиями сделки (New Lead → Funded / Nurture / Closed).
- `Inbox` обрабатывает диалоги, follow-up, статусы (Interested / Not Interested / DNC), шаблоны.
- `Campaigns` делает bulk-рассылки по спискам/лидам/CSV с фильтрацией и ротацией номеров.
- `Numbers` управляет номерным пулом: status (`ACTIVE`, `WARMING`, `COOLING`), ramp-up, delivery health, assignment reps.
- `Revive Queue` собирает overdue/renewal/revive-сценарии для возврата сделок.

Ключевая идея: отправка SMS не “рандомная”, а идет через контролируемый routing engine с ограничениями (assignment, pool filter, daily limits, compliance).

---

## 2) Архитектура (что важно объяснять клиенту)

## 2.1 Frontend

- React SPA (`client/src`), главные экраны:
- `PipelinePageV2.tsx`
- `InboxPageV2.tsx`
- `CampaignsPage.tsx`
- `NumbersPage.tsx`

## 2.2 Backend

- Node.js + Express (`server/src`)
- Prisma ORM + MySQL
- BullMQ + Redis для очередей отправки
- Twilio webhooks для inbound и status callbacks

## 2.3 Основные сущности данных

- `PhoneNumber`, `NumberAssignment`, `NumberPool`, `NumberPoolMembership`
- `Lead`, `Conversation`, `Message`
- `Campaign`, `CampaignLead`
- `Deal`, `FundingEvent`, `RenewalTask`
- `SuppressionEntry` (compliance)

---

## 3) End-to-End поток SMS

## 3.1 Outbound campaign

1. Реп/админ создает Campaign (template, list/leads/csv, speed, daily limit, optional pool).
2. При `Start` backend валидирует:

- quiet hours
- есть ли pending leads
- для `REP`: есть ли assigned active numbers
- есть ли доступный номер под ограничения

3. Worker берет pending leads и:

- применяет campaign `dailyLimit` (лишние лиды помечаются `SKIPPED`)
- применяет фильтры (ownership/compliance/existing conversation)
- выбирает отправляющий номер через NumberService
- создает `Message` записи и ставит jobs в BullMQ

4. SMS воркер отправляет через Twilio (Messaging Service SID в live mode).
5. Callback от Twilio обновляет message statuses (`DELIVERED/FAILED/UNDELIVERED/BLOCKED`) и campaign counters.

## 3.2 Inbound reply

1. Twilio webhook `/inbound` принимает сообщение.
2. Compliance-обработка (STOP/HELP/START) выполняется первой.
3. Для STOP-like кейсов:

- lead opt-out/suppress
- автоответ TwiML
- сообщение **не пишется в inbox** и **не увеличивает unread**

4. Для обычного inbound:

- создается/обновляется conversation
- пишется inbound message
- `unreadCount +1`
- обновляется lead/conversation activity
- для campaign lead reply считается только при positive intent (не любой inbound текст).

---

## 4) Прогрев номеров (Warm-up) и health

## 4.1 Статусы номеров

- `ACTIVE` — доступен для отправки
- `WARMING` — в ramp-up режиме
- `COOLING` — временно не отправляет до `coolingUntil`
- `SUSPENDED` / `RETIRED` — выключен из рутинга

## 4.2 Как выбирается номер

NumberService при выборе sender:

- берет только eligible numbers (ACTIVE + expired COOLING)
- учитывает pool filter (если задан)
- учитывает hard restriction по assigned numbers (для REP campaigns)
- учитывает daily limit (с учетом ramp day)
- учитывает delivery health
- применяет round-robin по eligible списку
- в live routing предпочитает номера, связанные с активным Twilio Messaging Service SID

## 4.3 Авто-cooling

- если растет `errorStreak`, номер может уйти в `COOLING` автоматически
- после истечения cooling-периода номер возвращается в `ACTIVE`

## 4.4 Почему это важно для клиента

Это защищает deliverability: система не “давит” весь трафик в один sender и избегает проблемных номеров.

---

## 5) Daily limit: Number vs Campaign (главный источник недопонимания)

## 5.1 Number daily limit

Это лимит конкретного номера (`PhoneNumber.dailyLimit`, с учетом ramp logic).  
Номер не должен отправить в день больше своей capacity.

## 5.2 Campaign daily limit

Это лимит попыток конкретной кампании за день.  
Worker обрезает список лидов до этого лимита; остальное помечается `SKIPPED` для текущего дня/запуска.

## 5.3 Практическая формула для операционки

- Если активны 3 номера по 200: теоретический потолок = 600/day.
- Рекомендованный campaign limit ниже потолка (обычно 70–90% на прогреве), чтобы оставить запас.
- Если переключаете часть номеров в `COOLING`, campaign limit нужно снижать под новую capacity.

---

## 6) Sender Pool, Assignment, Rotation — кто чем управляет

## 6.1 Кто задает pool

- Pool membership настраивает админ (Numbers → Pools).
- Это логическая группировка номеров внутри платформы, не “авто-настройка Twilio”.

## 6.2 Кто выбирает pool в кампании

- Пользователь при создании campaign выбирает `Sender Pool`.
- Для репов default UX: `Assigned Active Numbers (Auto)`.

## 6.3 Hard-wire логика для репов

Для `REP` campaign backend добавляет `restrictToPhoneNumberIds` = активные assigned номера репа.  
То есть реп-кампания не может уйти в чужие номера, даже если в системе активны другие.

## 6.4 Pool как дополнительный фильтр

Для репа pool работает как дополнительный слой фильтрации поверх assigned numbers.  
Для админа без pool фильтра используется all active numbers.

## 6.5 Важный нюанс “на лету”

Когда кампания уже поставила сообщения в очередь, sender уже выбран для каждой записи `Message`.  
Изменение статуса/assignment номеров после этого влияет только на новые queue decisions, не ретроактивно на уже созданные jobs.

---

## 7) Почему “Complete”, хотя отправлено мало

Это нормальный сценарий, если:

- много лидов отфильтровано как `SKIPPED` (existing conversation, ownership conflict, suppression, no eligible sender)
- сработал campaign daily limit
- часть лидов не прошла compliance

`COMPLETED` означает, что у кампании больше нет активной очереди отправки (`queued/sending`), а не то, что отправлено 100% от `totalLeads`.

---

## 8) Почему могут быть fail и как это объяснять

## 8.1 Где смотреть причины

В Campaigns у `Failed` есть breakdown по Twilio codes (tooltip “Failure Reasons”).

## 8.2 Частые коды

- `30003 Unreachable destination` — номер существует, но недоступен (carrier/network routing issue, temporary unreachable).
- `30005 Unknown destination` — carrier не знает такой destination (invalid/disconnected/not provisioned route).
- `30006 Landline or unreachable` — номер не может принимать SMS либо недоступен.
- `21610 Recipient unsubscribed (STOP)` — адресат ранее отписался.

## 8.3 Что ответить клиенту

Fail ≠ всегда баг платформы. Часть причин — carrier/network/recipient-side.  
Платформа дает visibility по кодам, чтобы принимать операционные решения (чистка списков, смена content, скорость, пул номеров).

---

## 9) Логика reply-метрик

`Campaign replied` считается не как “любой inbound”, а как позитивный/намеренный ответ:

- positive intent patterns (interest, question about terms/rates, email share и т.д.)
- негатив/STOP/opt-out не идет в positive reply KPI

Это сделано, чтобы `replied` отражал качество отклика, а не шум.

---

## 10) Existing conversation protection (анти-дубль)

При campaign send engine пропускает лидов с pre-existing thread (для blast сценариев “fresh outreach”), плюс ownership guard:

- если у лида/диалога владелец другой rep — отправка этим репом не пройдет

Это предотвращает двойные касания одного клиента разными reps.

---

## 11) DNC / STOP / Not Interested

## 11.1 DNC

При выставлении `DNC`:

- lead status -> DNC
- optedOut -> true
- suppression entry создается/обновляется

По default inbox-фильтры скрывают DNC от обычных рабочих лент.

## 11.2 STOP

Inbound STOP-like keyword:

- compliance action срабатывает сразу
- conversation может не пополняться STOP-сообщением в ленте
- unread событие не триггерится

## 11.3 Not Interested

`Not Interested` в inbox обновляет lead/opt-out/suppression так, чтобы контакт ушел из активного outreach.

---

## 12) Pipeline логика, Overdue и Next Action

## 12.1 Overdue

Карточка становится overdue, когда:

- `nextActionDue < now`
- и/или follow-up due в соответствующих сценариях

## 12.2 Lost/NQ/Close → Nurture

При переводе в `NURTURE` с re-engage датой система должна перезаписывать action timeline на новую дату follow-up.  
Смысл: убрать “старый overdue хвост” от предыдущего stage.

## 12.3 Funded

`Mark as Funded`:

- создает funding event
- создает renewal milestones (35d / 90d / 150d)
- переводит deal в FUNDED
- ставит `nextAction = Funded check-in`
- ставит `nextActionDue = fundedDate + 35 days`

Если визуально остается old overdue, обычно это data inconsistency/legacy записи, которые нужно разово выровнять.

---

## 13) Revive Queue — из чего собирается

Queue агрегирует несколько источников:

- overdue next actions
- past-due follow-ups
- statement refresh candidates
- revive candidates (idle nurture/approved)
- renewal opportunities (funded 150+ дней назад)

Важно: queue не только “manual follow-up”, поэтому цифра может быть больше, чем ожидание по одному сценарию.

---

## 14) Team Pipeline и Rep Scoreboard

## 14.1 Что означают метрики

- `Funded MTD` — сумма funded за текущий месяц
- `Units` — количество сделок, профинансированных за месяц
- `Approved + Committed $` — суммарная value по этим стадиям

## 14.2 Сортировка

Rep scoreboard сортируется по funded amount MTD (от большего к меньшему).

## 14.3 Почему может быть “0 units” при funded amount > 0

Проверять:

- корректность `fundedDate`/funding events в диапазоне месяца
- принадлежность сделки репу (primary/assist)
- консистентность данных после импортов/ручных stage-moves

---

## 15) SMS Templates — что реализовано

- Скоупы: `Mine`, `Team`, `Global`
- Создание/редактирование/удаление (soft delete)
- Insert Template в compose
- Usage tracking

Что важно для интервьювера: клиент оценивает не только функциональность, но и UX/дизайн блока templates, поэтому на демо нужно показывать:

- быстрый поиск
- понятный preview
- быстрый insert
- простые edit/delete flow

---

## 16) Роли и доступы

- `REP`: видит только свои conversations в inbox; кампании hard-wired к assigned active numbers.
- `ADMIN/MANAGER`: видит кросс-командный срез, управляет pools, assignments, goals.
- `isActive=false` у пользователя блокирует аутентификацию и доступ.

---

## 17) Что отвечать на типовые вопросы клиента (готовые формулировки)

## 17.1 “Who chooses sender group / primary pool?”

**Смысл ответа:** pool membership задается админом в платформе, не Twilio.  
**EN short answer:**

> Pool membership is configured by Admin in SCL. Twilio does not auto-assign this. Reps can select from available pools when launching campaigns.

## 17.2 “If I reactivate cooling numbers now, will active campaign start using them?”

**Смысл:** уже сформированные queued messages не меняют sender задним числом; новые send decisions зависят от текущей eligibility.  
**EN short answer:**

> Already queued messages keep their assigned sender. Reactivated numbers are used for new routing decisions only.

## 17.3 “Why failed 40 messages?”

**Смысл:** смотреть failure code breakdown, это часто carrier/destination-level issue, не только баг.  
**EN short answer:**

> We can see exact Twilio failure codes per campaign (e.g., 30003, 30005). Most of these are destination/carrier delivery failures, not app-side send errors.

## 17.4 “Why do STOP/DNC still appear?”

**Смысл:** STOP keywords suppress inbox insert/new unread; DNC скрывается default фильтрами, но может быть виден в специальных фильтрах/истории.  
**EN short answer:**

> STOP is handled as compliance and is suppressed from normal inbox flow. DNC contacts are excluded from standard active views and shown only in DNC-specific context.

## 17.5 “Why campaign shows Completed but low sent count?”

**Смысл:** completed = queue drained; не означает 100% attempted от исходного списка.  
**EN short answer:**

> Completed means the campaign queue finished processing. It does not mean all imported leads were sent; filtered/skipped leads reduce attempted volume.

## 17.6 “Why replied count is different from total inbound replies?”

**Смысл:** replied KPI считает позитивный intent, а не любой inbound.  
**EN short answer:**

> Campaign replied metrics are intent-based (positive engagement), not every inbound text.

---

## 18) Быстрый чек-лист перед клиентским звонком

1. `Numbers`:

- active vs cooling статусы
- assigned numbers по reps
- total capacity vs planned campaign daily limit

2. `Campaigns`:

- sender pool выбран корректно
- lead count > 0
- если low sent/high skipped — открыть breakdown и объяснить причину

3. `Inbox`:

- фильтр не зажат на узкий scope (Unread/DNC/Interested)
- у репов есть видимость своих активных диалогов
- mark unread работает

4. `Pipeline`:

- overdue карточки соответствуют real nextActionDue/followUpDate
- funded сделки имеют milestones и корректный next action
- revive queue цифры сопоставимы с источниками

5. `Goals/Scoreboard`:

- monthly team goal синхронен с settings
- `% of goal` и funded MTD читаются одинаково в карточках

---

## 19) Диагностика инцидентов (runbook)

## 19.1 Кампания стартует и потом “0 leads” / draft

Проверить:

- есть ли pending campaign leads
- не отрезал ли `dailyLimit` все текущие pending
- есть ли eligible senders (assigned+active+pool)
- нет ли массового skip из-за existing thread / ownership / suppression

## 19.2 Реп пишет “я не вижу conversations”

Проверить:

- assignedRepId в conversations
- role (REP видит только свои)
- фильтры inbox (unread/interested/dnc)
- isActive у пользователя

## 19.3 Неверные overdue цифры

Проверить:

- `nextActionDue`
- `followUpDate`
- stage transitions (особенно lost→nurture и funded)
- revive queue sources (overdue_action + follow_up + revive + renewal)

## 19.4 Дубль-касания одного лида

Проверить:

- campaign bypass существующего thread?
- owner conflict rules
- корректность lead/conversation ownership

---

## 20) Как объяснять “под капотом” простыми словами

Формула для клиента:

> “We have three control layers: compliance, routing, and ownership.  
> Compliance prevents unsafe sends (STOP/DNC/quiet hours).  
> Routing decides which eligible number sends each message.  
> Ownership prevents cross-rep collisions and duplicate outreach.”

---

## 21) Сценарий демо (5–7 минут)

1. Показать `Numbers`: assignment, active/cooling, daily limit, health.
2. Показать `Campaign Create`: sender pool + daily limit + speed.
3. Показать `Campaign row`: sent/delivered/failed + failure reasons tooltip.
4. Показать `Inbox`: status actions (Interested / Not Interested / DNC), Mark Unread, Templates.
5. Показать `Pipeline`: funded flow + milestones + revive queue.

---

## 22) Границы текущего scope

- В текущем репозитории нет артефактов Chrome extension (`manifest.json` и extension runtime files отсутствуют).
- Основная система — это web app + backend сервис + Twilio integration.

Если на встрече спрашивают про Chrome extension, нужно заранее прояснить, в каком проекте/репозитории он должен находиться и какой текущий статус поставки.

---

## 23) Ключевые тезисы для интервьювера (коротко)

- Платформа уже имеет строгую routing-модель (assigned numbers + pools + compliance).
- Основные проблемы клиента обычно в зоне данных/фильтров/ожиданий по метрикам, а не “просто не отправляется”.
- Для каждого спорного числа в UI есть источник: message statuses, campaign lead statuses, deal dates, suppression flags.
- Перед любым спором о deliverability всегда смотреть Twilio error code breakdown.

---

## 24) Appendix: Мини-глоссарий

- `Warm-up` — постепенное наращивание отправок для номера
- `Cooling` — временная пауза отправок для номера
- `Sender Pool` — логическая группа номеров
- `Assigned Numbers` — номера, закрепленные за rep
- `No Pool Filter` — нет ограничения на pool (но у reps все равно действует assignment restriction)
- `SKIPPED` — лид обработан, но отправка не выполнялась по фильтрам/лимитам
- `DNC` — Do Not Contact
- `Revive Queue` — список просроченных/подходящих для реанимации сделок

---

## 25) Версия документа

- `v1.0` (2026-04-13)
- Основан на текущей реализации кода в `client/src` и `server/src` этого репозитория.

---

## 26) API/логика: куда смотреть в коде (для техничных вопросов)

- Campaign routing + validation:
- `server/src/controllers/campaignController.ts`
- `server/src/jobs/worker.ts`
- `server/src/services/sendingEngine.ts`

- Number selection, warm-up, cooling, assignments:
- `server/src/services/numberService.ts`
- `server/src/controllers/numberController.ts`
- `server/src/routes/numbers.ts`

- Inbox, DNC, unread, templates:
- `server/src/controllers/inboxController.ts`
- `server/src/webhooks/twilioWebhooks.ts`
- `server/src/services/complianceService.ts`
- `client/src/pages/InboxPageV2.tsx`

- Pipeline stages, funded flow, revive queue, scoreboard stats:
- `server/src/controllers/dealController.ts`
- `client/src/pages/PipelinePageV2.tsx`
- `client/src/components/pipeline/DealPanel.tsx`

- Campaign UI, sender pool selector, failure breakdown tooltip:
- `client/src/pages/CampaignsPage.tsx`

---

## 27) Справочник статусов (для объяснений на встрече)

## 27.1 Campaign status

- `DRAFT` — создана, не запущена
- `SCHEDULED` — отложенный запуск
- `SENDING` — есть активная очередь отправки
- `PAUSED` — отправка приостановлена
- `COMPLETED` — очередь обработана
- `CANCELLED` — остановлена принудительно

## 27.2 Message status

- `QUEUED` / `SENDING` — в процессе отправки
- `SENT` — принято Twilio
- `DELIVERED` — доставлено адресату
- `FAILED` / `UNDELIVERED` — не доставлено
- `BLOCKED` — блокировка на стороне carrier/policy
- `RECEIVED` — входящее сообщение

## 27.3 Campaign lead status

- `PENDING` — в ожидании обработки
- `SENT` / `DELIVERED` / `FAILED`
- `REPLIED` — получен квалифицируемый ответ
- `OPTED_OUT` — отписка
- `SKIPPED` — сознательно пропущен (фильтры/лимиты)

---

## 28) Контроль консистентности данных (важно после правок)

После изменений по логике фильтров/статусов всегда проверять:

1. Сходятся ли числа между:

- Campaign totals
- Message statuses
- CampaignLead statuses

2. Сходятся ли pipeline метрики:

- funded amount (по funding events)
- funded units (по funded date/events и ownership)
- team goal/rep goal percentages

3. Нет ли “висячих” записей:

- legacy overdue nextActionDue после stage move
- old DNC/STOP conversations в активных фильтрах
- conversations без assignedRepId у реп-сценариев

---

## 29) Готовый фрейм ответа, если клиент эмоционален

Короткий рабочий шаблон:

> I understand the concern. I checked the routing/compliance/counters path end-to-end.  
> I can confirm what is expected behavior versus what is a bug, and I will provide exact fixes with verification steps.

Затем сразу 3 пункта:

1. Что подтверждено как bug/регресс
2. Что является ожидаемым поведением по текущей логике
3. Что будет сделано и как проверим

---

## 30) Что важно не обещать без проверки

- “Carrier blocking = это точно наш баг” (часто это внешняя причина)
- “Все inbound replies считаются positive replied” (не так по текущей логике)
- “Любое изменение pool/assignment мгновенно меняет уже queued messages” (не ретроактивно)
- “DNC полностью исчезает из системы” (он скрывается в рабочих views, но остается как compliance-history)
