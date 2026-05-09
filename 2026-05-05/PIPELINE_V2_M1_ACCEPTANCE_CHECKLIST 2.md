# Pipeline V2 M1 Acceptance Checklist

© BuyReadySite.com

Источник: `Pipelinev2 M1 Acceptance.md`
Дата начала: 2026-05-05

## Текущий прогресс

- Общий статус: Fix #1–#10 выполнены и production-validated
- Выполнено: 10 / 10 acceptance-блоков
- Сейчас в фокусе: M1 acceptance закрыт; мониторинг production после Fix #10
- Последнее обновление: 2026-05-05 — Fix #10 выкачен в production, browser validation passed
- Последняя проверка: production Simple/Execution cards, computed `6px` radius, `10px 11px` card padding, Geist fonts, product icons, modal controls, NEW_LEAD empty state
- Блокеры: не выявлены

## Журнал прогресса

- 2026-05-05: Создан рабочий чеклист на основе acceptance-документа. Начинаю с Fix #1, потому что без extractor остальные AI-бейджи и визуальные состояния не могут быть надёжно проверены.
- 2026-05-05: В Fix #1 подтверждён корень для кейса `"$20k monthly gross"`: extractor wiring существует, но pre-LLM local guard считал короткий revenue note `too_short`. Внесена правка `hasCompactPipelineSignal()` и добавлен тест на exact acceptance phrase.
- 2026-05-05: Локальная валидация Fix #1 прошла: `pipelineAiService.test.ts` 5/5, server TypeScript build без ошибок, diagnostics clean.
- 2026-05-05: Fix #1 выкачен в production через rebuilt `server/dist` + PM2 restart. Production checks: schema columns `pipelineAiSignals`/`pipelineAiUpdatedAt` существуют; GymTek Academy (`cmokm307s01nozo8x2mlpd4am`) получил `monthly_revenue.value_usd=20000`; endpoint `/api/ai/extract-pipeline` вернул 200 с populated signals; health OK.
- 2026-05-05: Для Fix #2 внесён backend-root fix в `DealController.logAttempt`: No answer / Texted / Voicemail теперь ставят `nextActionDue` на следующий business day; Connected ставит `nextActionDue=null`. Добавлены regression tests для overdue bump и connected clearing.
- 2026-05-05: Локальная валидация Fix #2 прошла: `dealContactAttempts.test.ts` 9/9, server TypeScript build без ошибок, diagnostics clean.
- 2026-05-05: Production validation Fix #2 на Puntilla Distribution: POST `/api/deals/cmnkresot0082zo5esjctrmgv/log-attempt` с `kind="texted"` вернул 200; attempts `1→2`; `nextActionDue` изменился с overdue `2026-05-03T12:00:00.000Z` на `2026-05-06T12:00:00.000Z`.
- 2026-05-05: Regression test для due bump расширен на все три кнопки: No answer / Texted / Voicemail.
- 2026-05-05: Fix #2 закрыт. Production runtime уже обновлён; расширенный regression suite 11/11 passed.
- 2026-05-05: Для Fix #3 внесены backend и frontend изменения: `GET /api/deals/:id` отдаёт `linkedDeals` и `linkedDealsCount`; board deals получают `linkedDealsCount`; cards показывают `N CARDS`; Deal + Client modal показывает Linked Deals section с текущей карточкой, siblings и `+ Add product`.
- 2026-05-05: Локальная валидация Fix #3 прошла: backend linkedDeals test 7/7, server build ok, client build ok, diagnostics clean.
- 2026-05-05: Fix #3 выкачен в production. Production API validation: ASPIRE deal `cmnf14pkn00bmzoch6w698yym` returned `linkedDealsCount=7`; board deal returned `linkedDealsCount=7`; frontend bundle contains `Linked Deals`, `b-linked`, `linked-deals-grid`. Browser validation passed: search shows `8 CARDS`, modal linked section visible, sibling row switches current deal, `+ Add product` opens prefilled New Deal modal.
- 2026-05-05: Для Fix #4 внесены изменения: board stage metadata теперь возвращает `prevOfferSubtotal`; NURTURE `prevOffer` больше не считается active column value; execution column header показывает active label `"$X · N deals"` / `"N deals · no $"` / `"— · 0 deals"`; ghost previous-offer subtotal выводится отдельной amber строкой.
- 2026-05-05: Локальная валидация Fix #4 прошла: backend board subtotal test 8/8, server build ok, client build ok, diagnostics clean.
- 2026-05-05: Fix #4 выкачен в production. Production API validation: NURTURE `count=224`, `value=0`, `prevOfferSubtotal=4208000`. Browser validation: execution headers show active totals, NURTURE `224 deals · no $` + `$4.21M prev offers`, empty search shows `— · 0 deals`.
- 2026-05-05: Для Fix #5 внесены изменения: NURTURE previous-offer card UI теперь использует `.prev-offer-pill`; добавлен quick filter `Ghosted with Offer` для NURTURE deals с `prevOffer > 0`, с count и active/passive styling.
- 2026-05-05: Локальная валидация Fix #5 прошла: client build ok, diagnostics clean.
- 2026-05-05: Fix #5 выкачен в production. Browser validation: `Ghosted with Offer (34)` visible, фильтр оставляет NURTURE-only board, header shows `34 deals · no $` + `$4.21M prev offers`, rendered `.prev-offer-pill` count 34, first pill shows `Prev: $26k`.
- 2026-05-05: Для Fix #6 внесены изменения: добавлен `/api/ai/preview-pipeline` без `dealId`; Add Lead modal получил textarea `About this lead · use of funds · context`, debounced Pipeline AI preview, preview chips и мягкое prefill пустых supported fields: product, amount, next action, due date. Context сохраняется в notes при create.
- 2026-05-05: Локальная валидация Fix #6 прошла: server build ok, client build ok, diagnostics clean.
- 2026-05-05: Production validation Fix #6: `/api/ai/preview-pipeline` вернул 200 и извлёк `Auto repair`, `$75k`, `$40k`, `equipment and working capital`, `call · today`. Browser Add Lead показал preview и заполнил amount/action. Найден timezone bug: `today` через `toISOString()` давал предыдущую дату в EEST; исправлено на local `YYYY-MM-DD` formatter, требуется rebuild/redeploy/retest.
- 2026-05-05: Browser retest после date fix: due для `today` стал `2026-05-05`, amount `40000`, action `call`. Найден modal overflow regression: после AI preview высота формы может увести Close за viewport; контейнер модалки переведён на `max-h-[calc(100vh-2rem)] overflow-y-auto`, требуется rebuild/redeploy/retest.
- 2026-05-05: Fix #6 закрыт. Final production browser validation: `Restaurant doing $90k monthly gross wants a $55k line of credit... follow up next week` показал AI preview (`Restaurant`, `$90k`, `$55k`, `LOC`, `payroll and inventory`, `follow up · next_week`), prefilled `product=LOC`, `amount=55000`, `nextAction=follow up`, `dueDate=2026-05-12`; Close visible и modal closed successfully. Переход к Fix #7.
- 2026-05-05: Для Fix #7 внесены frontend changes: общий `StatePillRow` с `stateColor()` helper, card state row в Simple/Execution cards, modal state row в DealPanel header; CSS для `.state-line-exec`, `.state-dot`, `.state-label`, `.state-timing`, `.state-pill-row`.
- 2026-05-05: Локальная валидация Fix #7 прошла: client build ok, diagnostics clean.
- 2026-05-05: Fix #7 выкачен в production. Browser validation: board rendered 398 `.state-line-exec` rows with labels `ACTIVE`, `WAITING`, `NURTURE`; first visible rows show `ACTIVE 0/10 attempts` and `WAITING 1/10 attempts`; Ghosted with Offer filter shows 34 `NURTURE` rows with wake dates; modal state row validated for `NURTURE Wake May 4`, `WAITING 1/10 attempts`, and `ACTIVE 0/10 attempts`. Переход к Fix #8.
- 2026-05-05: Для Fix #8 внесены frontend changes: Next Action editor открыт по умолчанию как `qa-block`; stage-specific buttons приведены к v11 спискам; date pills ограничены `Today / Tomorrow / This week / Future date`; action field стал `qa-input`; `Set Action` требует future date для Future date и сохраняет action+due вместе; local date formatter заменил `toISOString()`.
- 2026-05-05: Локальная валидация Fix #8 прошла: client build ok, diagnostics clean.
- 2026-05-05: Fix #8 выкачен в production. Browser validation на PUNTILLA DISTRIBUTION (`QUALIFIED`): qa-block видим сразу, header `QUICK ACTIONS · QUALIFIED`; actions `Submit application`, `Get remaining docs`, `Verify revenue`; date pills `Today`, `Tomorrow`, `This week`, `Future date`; click `Submit application` + `Tomorrow` + `Set Action` обновил `nextAction=Submit application`, `nextActionDue=2026-05-06T12:00:00.000Z`; после проверки deal восстановлен через API к исходному `nextAction=Get banks`, `nextActionDue=2026-05-06T12:00:00.000Z`. Переход к Fix #9.
- 2026-05-05: Для Fix #9 внесены backend/frontend changes: `GET /api/deals/:id` теперь возвращает normalized `fundingHistory` по FUNDED deals same client; frontend type `FundingHistoryRound`; Funding History tab показывает exact empty state `No funding history yet`, returning summary/count, rows with funded amount, funding date, lender, product, rep, current/prior marker.
- 2026-05-05: Локальная валидация Fix #9 прошла: server build ok, client build ok, diagnostics clean.
- 2026-05-05: Fix #9 выкачен в production. API validation: returning Sehatu Inc deal returned `fundingHistoryCount=1`, amount `132000`, date `2026-04-03`, lender `Figure`, `isCurrentDeal=false`; empty PUNTILLA returned `fundingHistoryCount=0`. Browser validation: PUNTILLA tab shows exact `No funding history yet`; Sehatu Inc tab shows `Funding History · 1x prior`, summary, funded amount `$132k`, funding date `03.04.2026`, lender `Figure`, product `HELOC`, rep `Marcos Cruz`, round `Prior deal`. Переход к Fix #10.
- 2026-05-05: Для Fix #10 внесены frontend/CSS changes: cards перестроены под v11 hierarchy (business/contact first, затем AI/HOT/returning/linked/stacking layer, затем product/source/state/action), ручной Monthly Revenue selector удалён из Deal + Client, product icons синхронизированы (`LOC=🔄`, `HELOC=🏡`), добавлен NEW_LEAD empty state exact copy, v11 font/token aliases и card density `10–11px`/`6px`. Локальная проверка: `npm --prefix client run build` passed.
- 2026-05-05: Final Fix #10 production deploy completed with client dist backup swap. Health OK. Browser validation passed: Execution cards render business/contact first and AI layer counts (`.c-ai-layer=482`, `.b-linked=308`, `.b-returning=376`, `.state-line-exec=398`); computed card radius `6px`, `.cb` padding `10px 11px`, font `Geist`, money font `Geist Mono` weight `600`; Simple cards render business first and radius `6px`; old product icons `💳/🏠` absent, v11 `🔄/🏡` present; Deal + Client modal has no `Monthly Revenue` manual UI; stage select, product pills, Quick Actions, Add Offer, rep controls preserved; Add Offer modal opened and cancelled without save; NEW_LEAD no-match search shows exact empty state.

## Правила работы по чеклисту

- Каждый пункт проверяется в коде и, где возможно, на production/runtime-данных.
- После каждой правки обновляется этот файл: прогресс сверху, статус пункта, что изменено, как проверено, остаточные риски.
- Для каждого пункта фиксируется сценарий проверки: действие пользователя, ожидаемый результат, фактический результат.
- Если пункт зависит от другого пункта, сначала закрывается зависимость.

## Acceptance-пункты

### Fix #1 — AI extractor is not running on note add

Статус: выполнено

Что нужно подтвердить:

- [x] `pipelineAiService.ts` есть в production runtime.
- [x] Production schema содержит `Deal.pipelineAiSignals` и `Deal.pipelineAiUpdatedAt`.
- [x] `note_added` / `note_updated` trigger wired в `DealController.updateDeal`.
- [x] Inbound SMS trigger wired для deals past intake.
- [x] Re-run AI endpoint mounted, front-end вызывает endpoint, response обновляет badges.
- [x] В production logs есть `AI: extractPipelineSignals complete` или понятный error path.

Что нужно исправить:

- [x] Note add/update запускает extractor с `inputType: "rep_note"` в коде.
- [x] Inbound SMS запускает extractor для связанных active deals в коде.
- [x] Re-run AI button вызывает extractor endpoint и обновляет UI state в коде.
- [x] Badges заполняются на простом кейсе `"$20k monthly gross"` через populated `monthly_revenue.raw`.

Сценарии проверки:

- [x] Unit guard: `getPipelineAiLocalSkipReason("$20k monthly gross") === null`.
- [x] Добавить note/extract `"$20k monthly gross"` в deal, ожидать populated revenue badge. Факт: GymTek Academy persisted `monthly_revenue.value_usd=20000`, `raw="$20k monthly gross"`.
- [x] Нажать Re-run AI / endpoint path, ожидать сетевой 200 и обновление `pipelineAiSignals` / badges. Факт: production endpoint returned `200` с populated signals.
- [x] Проверить production observability на successful extraction. Факт: historical `AI: extractPipelineSignals complete` present; production DB persisted fresh extraction; API health OK.

### Fix #2 — Quick-log buttons do not clear OVERDUE state

Статус: выполнено

Что нужно исправить:

- [x] При No answer / Texted / Voicemail bump `nextActionDue` на +1 business day в коде и расширенном unit test.
- [x] Connected очищает `nextActionDue` в коде.
- [x] Not interested переводит в NURTURE и не ломается.

Сценарии проверки:

- [x] Deal с overdue `nextActionDue`; нажать Texted; ожидать WAITING counter increment и отсутствие red overdue pill. Факт: Puntilla production scenario passed.
- [x] Deal с overdue `nextActionDue`; нажать No answer / Voicemail; ожидать аналогичное clearing поведение. Факт: regression tests cover both buttons with next business day due bump.

### Fix #3 — Linked Deals UI missing on multi-card clients

Статус: выполнено

Что нужно исправить:

- [x] `N CARDS` chip на AI badge row для клиентов с несколькими deals в коде.
- [x] Linked Deals section в modal в коде.
- [x] Click sibling row открывает sibling deal modal в panel state.
- [x] `+ Add product` button сохранён/добавлен по v11-паттерну в коде.

Сценарии проверки:

- [x] Найти клиента с 2+ deals; открыть один deal; увидеть linked section и sibling navigation. Факт: ASPIRE production browser scenario passed.

### Fix #4 — Column headers missing previous-offer subtotals

Статус: выполнено

Что нужно исправить:

- [x] Active total per column: `"$X · N deals"` или `"N deals · no $"` в коде.
- [x] Ghost prev-offer subtotal: amber `"$Y prev offers"` в коде.
- [x] Empty column: `"— · 0 deals"` в коде.
- [x] Per-card prev-offer pill для NURTURE deals with prior offer уже есть в card UI.

Сценарии проверки:

- [x] Колонка с active amount показывает сумму. Факт: Submitted/Approved/Committed/Funded browser headers show `$X · N deals`.
- [x] Колонка с NURTURE prior offer показывает amber subtotal. Факт: production browser shows `$4.21M prev offers`.
- [x] Empty column не ломает layout. Факт: no-match search shows `— · 0 deals`.

### Fix #5 — Prev-offer visibility on NURTURE deals

Статус: выполнено

Что нужно исправить:

- [x] NURTURE cards с prior offer показывают `.prev-offer-pill` в коде.
- [x] Ghost subtotal синхронизирован с Fix #4.
- [x] Добавлен filter pill `Ghosted with Offer` в коде.

Сценарии проверки:

- [x] NURTURE deal с `offer_added` history показывает prior offer pill. Факт: production browser `Ghosted with Offer` показывает 34 `.prev-offer-pill` cards.

### Fix #6 — Add Lead form missing AI natural-language extraction

Статус: выполнено

Что нужно исправить:

- [x] Textarea `About this lead · use of funds · context` в коде.
- [x] Debounced AI extraction preview using pipeline extractor в коде.
- [x] Preview shows extracted attributes and action/timing в коде.
- [x] Create Lead pre-populates supported fields from extracted values without stage routing automation в коде.

Сценарии проверки:

- [x] Ввести demo text с revenue/industry/callback timing; увидеть AI preview. Факт: production browser passed.
- [x] Create Lead создаёт deal с prefilled extracted fields. Факт: create payload wiring verified in code; browser validated prefilled fields without creating real production lead.

### Fix #7 — State pill row missing on cards

Статус: выполнено

Что нужно исправить:

- [x] Card state row: colored dot + ACTIVE / WAITING / NURTURE + timing в коде.
- [x] Modal state-pill row в коде.
- [x] Counter format `{N}/10 attempts`; wake date для NURTURE в коде.

Сценарии проверки:

- [x] Active deal показывает ACTIVE и attempts. Факт: production card/modal `ACTIVE 0/10 attempts`.
- [x] Waiting deal показывает WAITING и attempts. Факт: production card/modal `WAITING 1/10 attempts`.
- [x] NURTURE deal показывает NURTURE и wake date. Факт: production card/modal `NURTURE Wake May 4` и NURTURE filter rows.

### Fix #8 — Quick Actions block missing in deal modal

Статус: выполнено

Что нужно исправить:

- [x] Stage-specific quick action buttons в коде.
- [x] Date pills: Today / Tomorrow / This week / Future date в коде.
- [x] Set Action commits action + due date в коде.
- [x] Stage label header в коде.

Сценарии проверки:

- [x] Открыть modal на разных stages; quick actions соответствуют stage. Факт: production QUALIFIED matched v11 list.
- [x] Нажать action + date + Set Action; deal сохраняет action/due date. Факт: production save verified, original values restored.

### Fix #9 — Funding History tab is empty

Статус: выполнено

Что нужно исправить:

- [x] Empty state `No funding history yet` в коде.
- [x] Returning customer state with count в коде.
- [x] Prior rounds list: amount, funding date, lender в коде.
- [x] Data source: FUNDED deals for same client/lead в коде.

Сценарии проверки:

- [x] Client without funded history sees empty state. Факт: production PUNTILLA tab.
- [x] Returning client sees prior funding rows. Факт: production Sehatu Inc tab.

### Fix #10 — Card visual hierarchy and v11 layering

Статус: выполнено

Что нужно исправить:

- [x] Card hierarchy matches v11 order while preserving production functions в коде.
- [x] Manual duplicate fields removed where AI badges are canonical: удалён visible Monthly Revenue selector из Deal + Client.
- [x] Rep assignment, offers, stage changes preserved — production browser validation passed.
- [x] v11 density, typography, color tokens, product icons, empty state applied в коде.

Сценарии проверки:

- [x] Local build after visual hierarchy changes passed.
- [x] Visual comparison card vs v11 target across desktop width: production browser/computed styles validate hierarchy, density, fonts, tokens, icons.
- [x] Existing production actions still work after hierarchy changes: stage select visible, Quick Actions visible, Add Offer modal opens, rep controls visible.
