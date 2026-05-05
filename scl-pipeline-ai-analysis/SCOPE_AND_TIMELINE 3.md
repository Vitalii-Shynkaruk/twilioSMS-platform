© BuyReadySite.com

# Scope And Timeline

## 1. AI extractor

### Что реально нужно сделать

- добавить новые поля в `Deal`: `pipelineAiSignals`, `pipelineAiUpdatedAt`;
- добавить новый backend service параллельно текущему `AIService.classifyInbound`;
- сохранить exact prompt/schema/payload contract из handoff без самовольных изменений;
- сделать fallback на `conversation.aiSignals`, если `deal.pipelineAiSignals` еще пустой;
- добавить per-deal serialization queue, чтобы два note/event-а не гонялись между собой;
- повесить extractor на `note_added` / `note_updated` и на inbound client SMS для deal в активных стадиях;
- дать ручной endpoint `POST /api/ai/extract-pipeline` для re-run из UI;
- повторить golden validation против переданных fixtures.

### Почему это не простая задача

- Здесь уже есть хороший reuse path через `server/src/services/aiService.ts`, но prompt contract у handoff жестко зафиксирован.
- Самый критичный риск не в API-вызове, а в правильном data flow: existing signals -> new input -> deterministic persistence.
- Очередь по `dealId` обязательна. Без нее extractor будет читать stale state и сам себе ломать накопление сигналов.
- Golden validation нельзя пропустить, иначе нельзя доказать parity с handoff.

### Что уже помогает

- в проекте уже есть рабочий AI backbone и действующий AI route layer;
- текущая архитектура уже хранит `Conversation.aiSignals` и умеет логировать AI results;
- есть живой pipeline/deal controller, куда можно встраивать trigger wiring.

### Что новое с высокой стоимостью

- новый Deal-level signals blob;
- новый extractor lifecycle;
- новый validation loop с golden-set;
- новый manual re-run flow.

### Оценка

- alignment по artifacts и contract: `0.5 дня`;
- backend service + migration + queue: `1-1.5 дня`;
- trigger wiring + endpoint: `0.5 дня`;
- tests + golden validation parity: `0.5 дня`.

**Итого по extractor: `2-3 дня`.**

## 2. Frontend badges

### Что реально нужно сделать

- добавить `PipelineAiSignals` type в `client/src/types/index.ts`;
- протащить новые signals в deal response/UI state;
- встроить three priority badges в `DealCard` и `DealPanel`;
- добавить stacking chip с 3 режимами: `ACTIVE STACKING`, `X-STACKED`, `STACKED BEFORE`;
- показать AI inline bar в модалке `DealPanel`;
- добавить placeholder states для пустых полей;
- реализовать re-run AI button;
- встроить pre-fill/suggestion logic так, чтобы AI не перетирал ручной ввод rep-а.

### Почему это сложнее, чем выглядит

- `DealCard.tsx` уже очень плотный по badge/state логике;
- `DealPanel.tsx` уже содержит manual revenue/product/action flows, и AI должен встраиваться поверх них, а не ломать их;
- в handoff визуальная цель binding: нельзя просто сделать "похоже", нужно повторить конкретные patterns из `scl_pipeline_v11.html`;
- часть prototype UI содержит старые сущности вроде urgency/stage suggestion, которые уже не входят в v1, значит потребуется аккуратная фильтрация scope.

### Что уже помогает

- реальные pipeline surfaces уже существуют;
- есть existing monthly revenue selector, product pills и update flows;
- есть действующий `dealApi` слой.

### Что новое с высокой стоимостью

- новый AI inline bar;
- строгая visual parity с prototype;
- suggestion-only behavior поверх уже существующих manual controls.

### Оценка

- type plumbing и response mapping: `0.5 дня`;
- `DealCard` badges/chips/banner layering: `0.5 дня`;
- `DealPanel` inline bar, placeholders, re-run button, pre-fill behavior: `0.5-1 день`;
- prototype pass и visual QA на desktop/mobile: `0.5 дня`.

**Итого по frontend badges: `1.5-2 дня`.**

## 3. Auto-nurture mechanic

### Что реально нужно сделать

- добавить новые поля в `Deal`: `contactAttempts`, `contactAttemptThreshold`, `lastEngagementAt`;
- добавить endpoint `POST /api/deals/:id/log-attempt`;
- реализовать 5 quick-log actions с разной server semantics;
- реализовать auto-note + `DealEvent` audit trail;
- включить server-side auto-nurture trigger после increment;
- сделать reset helper и дергать его из нескольких мест:
  - quick-log `Connected`;
  - inbound SMS on deal;
  - manual admin override;
  - `moveDeal` при движении вперед по stage order;
- встроить attempt banner в `DealCard` и `DealPanel`;
- проверить, что revive queue продолжает вести себя корректно для ghosted deals.

### Почему это самый рискованный участок

- Это уже не AI, а platform state machine.
- Логика трогает stage transitions, follow-up semantics, deal event audit, existing revive queue и live rep workflow.
- Ошибки здесь дадут не cosmetic bug, а неверное авто-перемещение карточек по pipeline.
- Нужно очень аккуратно согласовать новые значения `followUpType` вроде `GHOSTED` / `LOST` с текущими UI assumptions, где сегодня используются в основном lowercase варианты.

### Что уже помогает

- есть `DealPanel`, где quick-action style уже существует;
- есть `moveDeal`, `updateDeal`, `getReviveQueue` и event logging;
- `followUpType` в schema - свободная строка, значит жесткой enum-стены сейчас нет.

### Что новое с высокой стоимостью

- новые counter fields и reset lifecycle;
- новая cross-cutting endpoint/logging logic;
- auto-stage transition guardrails;
- regression coverage вокруг nurture/revive behavior.

### Оценка

- schema + endpoint + helper layer: `0.5-1 день`;
- reset wiring в inbound/stage paths: `0.5 дня`;
- `DealPanel` quick-log UI и admin/manual controls: `0.5 дня`;
- `DealCard`/`DealPanel` banners + revive/regression QA: `0.5-1 день`.

**Итого по auto-nurture: `1.5-2.5 дня`.**

## Рекомендуемая последовательность

1. Закрыть gaps handoff и подтвердить границы v1.
2. Сделать extractor backend и golden validation.
3. Поднять frontend badges на уже стабильном extractor output.
4. После этого делать auto-nurture как отдельный workstream.
5. В конце провести regression по pipeline, deal panel, revive queue и inbound message flows.

## Общая оценка

### Узкий optimistic сценарий

Если handoff complete, missing artifacts быстро досылаются, а scope не расширяется:

**`5 рабочих дней`.**

### Реалистичный рабочий сценарий

С учетом уточнений, golden validation, regression и UI polish:

**`5-7 рабочих дней`.**

### Когда срок уйдет выше

- если нужно будет восстанавливать отсутствующий `test_harness.py` по косвенным признакам;
- если prototype окажется authoritative не только по стилям, но и по старым removed behaviors;
- если заказчик захочет auto-apply стадий, timing-to-date resolution или editable AI output уже в v1.

## Bottom line для посредника

Главное сообщение для клиента такое: extractor - это backend/data-flow foundation, badges - это consumer layer поверх foundation, а auto-nurture - отдельная business-logic система с более высоким regression risk. Срок можно сжать за счет Copilot-assisted implementation, но не за счет quality gates, regression и validation.
