© BuyReadySite.com

# Detailed Implementation Checklist

## 0. До старта разработки

- [ ] Подтвердить, что `extractor-spec.md` - canonical implementation spec.
- [ ] Подтвердить, что `scl_pipeline_v11.html` binding только по retained visual patterns, а не по удаленным behaviors вроде `suggested_stage`.
- [ ] Получить отсутствующие артефакты: `test_harness.py`, `pipeline-extraction-review.csv`, `pipeline-golden-results.csv`.
- [ ] Подтвердить, что `golden_test_set.json` и `pipeline-ai.fixtures.json` действительно должны оставаться идентичными.
- [ ] Уточнить границы auto-nurture v1, чтобы не смешать pre-nurture attempt counter и post-nurture re-engagement tracking.

## 1. Extractor foundation

- [ ] Добавить в Prisma `Deal.pipelineAiSignals` и `Deal.pipelineAiUpdatedAt`.
- [ ] Сгенерировать migration без backfill.
- [ ] Добавить `PipelineAiSignals` type в frontend types.
- [ ] Создать `pipelineAiService.ts` параллельно `aiService.ts`.
- [ ] Вынести/reuse provider config, не ломая текущий Inbox AI.
- [ ] Собрать payload строго в формате `[EXISTING SIGNALS]` + `[NEW INPUT]`.
- [ ] Реализовать fallback на `conversation.aiSignals`, если `deal.pipelineAiSignals` еще `null`.
- [ ] Реализовать per-deal in-memory queue keyed by `dealId`.
- [ ] Логировать model/tokens/cost по аналогии с `classifyInbound`.
- [ ] На AI error возвращать `null`, не ломая note-write path.

## 2. Extractor triggers and API

- [ ] Вызвать extractor после `note_added` / `note_updated` в `DealController.updateDeal`.
- [ ] Вызвать extractor на inbound SMS для deal в разрешенных active stages.
- [ ] Не вызывать extractor для `FUNDED`, `CLOSED`, слишком коротких текстов и прочих explicit skip conditions.
- [ ] Добавить `POST /api/ai/extract-pipeline`.
- [ ] Проверить auth/access model для manual re-run.
- [ ] Определить источник "most recent note" для re-run button, если note отсутствует.

## 3. Validation

- [ ] Положить fixtures в тестовую зону сервера.
- [ ] Перенести grader behavior из `run_golden.py` или завернуть Python reference runner.
- [ ] Добиться parity с expected field-level grading.
- [ ] Добавить узкие тесты на queue serialization.
- [ ] Добавить тест на fallback `conversation.aiSignals -> deal.pipelineAiSignals`.
- [ ] Добавить тест на skip conditions.

## 4. Frontend badges

- [ ] Протащить `pipelineAiSignals` в deal fetch/update response.
- [ ] Добавить industry badge.
- [ ] Добавить monthly revenue badge.
- [ ] Добавить use of funds badge.
- [ ] Добавить stacking chip с приоритетом `ACTIVE > X-STACKED > STACKED BEFORE`.
- [ ] Добавить placeholder rendering для пустых полей.
- [ ] Встроить badges в existing badge row `DealCard`.
- [ ] Встроить AI inline bar в `DealPanel`.
- [ ] Добавить trailing source label с `pipelineAiUpdatedAt`.
- [ ] Привести стили к v11 prototype patterns.

## 4.1 Prototype-driven pixel pass

- [ ] Сверить `ai-inline-bar` с prototype по layout, gaps, chip order и source label.
- [ ] Сверить `ai-chip` по filled/empty состояниям, typography и dashed placeholder state.
- [ ] Сверить `stacking-badge` по цвету, border и visual emphasis.
- [ ] Сверить `quick-log-row` / `ql-btn` с prototype modal section.
- [ ] Сверить `state-pill-row` с counter/remaining attempts strip.
- [ ] Сверить `nurture-banner` / `modal-nurture-banner` с prototype patterns.
- [ ] Отдельно проверить, что retained prototype elements не тянут обратно removed v1 behaviors.

## 5. Suggestion-only prefill rules

- [ ] Не перезаписывать `deal.dealAmount`, если rep уже ввел значение.
- [ ] Не перезаписывать `deal.productType`, если rep уже зафиксировал продукт.
- [ ] Не перезаписывать `deal.nextAction`, если rep уже задал следующее действие.
- [ ] Для `pending_actions[0].timing` показывать label-only, без автоматического вычисления даты.
- [ ] Для monthly revenue показывать AI suggestion как preselected/manual-confirmable state, а не silent write.

## 6. Re-run AI UX

- [ ] Добавить re-run link в header `DealPanel`.
- [ ] Вызвать `POST /api/ai/extract-pipeline`.
- [ ] Обновить local state после ответа без полного page reload.
- [ ] Обработать loading/error state для re-run.
- [ ] Защитить UI от repeated clicks и double-submit.

## 7. Auto-nurture backend

- [ ] Добавить `contactAttempts`, `contactAttemptThreshold`, `lastEngagementAt` в `Deal`.
- [ ] Добавить `POST /api/deals/:id/log-attempt`.
- [ ] Реализовать `no_answer`, `texted`, `voicemail`, `connected`, `not_interested` semantics.
- [ ] Для unsuccessful attempts увеличивать счетчик и писать auto-note + `DealEvent`.
- [ ] Для `connected` сбрасывать счетчик и обновлять `lastEngagementAt`.
- [ ] Для `not_interested` переводить в `NURTURE` с audit trail.
- [ ] Реализовать server-side auto-nurture trigger на пороге.
- [ ] Добавить/reset helper `resetEngagement(dealId, reason)`.
- [ ] Подвязать reset helper к inbound SMS on deal.
- [ ] Подвязать reset helper к движению вперед по стадиям.
- [ ] Подвязать reset helper к manual admin override.

## 8. Auto-nurture UI

- [ ] Добавить quick-log row в notes section `DealPanel`.
- [ ] Добавить waiting-attempt banner на `DealCard`.
- [ ] Добавить тот же banner в `DealPanel`.
- [ ] Реализовать color shift по `X / Y` ratio.
- [ ] Реализовать pulse state у near-threshold красного состояния.
- [ ] Дать admin/manager способ менять threshold per deal.

## 9. Regression checks

- [ ] Проверить, что текущий manual note flow не ломается.
- [ ] Проверить, что текущий monthly revenue selector продолжает работать вручную.
- [ ] Проверить, что `moveDeal` не дает неверных reset/auto-nurture side effects.
- [ ] Проверить, что revive queue не начинает показывать лишние deal-ы.
- [ ] Проверить, что inbound SMS reset не сбрасывает счетчик у deals без связанной conversation.
- [ ] Проверить, что `followUpType` значения не ломают существующие nurture badges/tags.
- [ ] Проверить, что extractor и auto-nurture не конфликтуют по card real estate.

## 10. Release readiness

- [ ] Прогнать build/test для server и client.
- [ ] Пройти golden-set validation повторно после финальной интеграции.
- [ ] Проверить desktop и mobile rendering deal card/panel.
- [ ] Проверить loading/error/empty states.
- [ ] Подготовить короткий release note: что в scope, что не в scope, какие guardrails оставлены на v2.
