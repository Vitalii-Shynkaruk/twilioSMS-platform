© BuyReadySite.com

# Master Work Checklist

## Назначение

Это наш основной внутренний рабочий чеклист на реализацию. Его задача - не дать нам пропустить ни backend foundation, ни prototype-driven UI, ни regression gates.

Главный принцип: **сначала корректный функционал и data flow, затем pixel-close UI pass, затем regression and release hardening**.

Второй обязательный принцип: **после каждой фазы есть отдельный testing gate; без него в следующую фазу не идем**.

## Phase 0. Scope lock

- [x] Зафиксировать `extractor-spec.md` как canonical behavior spec.
- [x] Зафиксировать `scl_pipeline_v11.html` как binding visual target только для retained v1 elements.
- [x] Подтвердить validation assets:
  - `test_harness.py` получен как reference local harness;
  - `pipeline-extraction-review.csv` получен как 80-row reference validation baseline;
  - `pipeline-golden-results.csv` получен как 15-case golden baseline.
- [x] Зафиксировать финальный source of truth для fixtures:
  - `pipeline-ai.fixtures.json` - canonical для `server/tests/`;
  - `golden_test_set.json` - standalone mirror для `run_golden.py`.
- [x] Зафиксировать точную границу auto-nurture v1.
- [x] Зафиксировать B.0 preservation requirement по rep ownership, deal sharing, Inbox `Assign Rep`, CONTACT `Assigned Rep`, rep chips и admin/My Convs scoping.
- [x] Зафиксировать rollout model:
  - `existing pipeline upgrade` - базовый вариант по текущему ТЗ;
  - `separate pipeline v2 rollout` - отдельный scope, только если клиент явно это подтверждает.

### Scope lock notes

- Подтвержден retained v1 visual set:
  - `ai-inline-bar`;
  - `ai-chip`;
  - `stacking-badge`;
  - `quick-log-row` / `ql-btn`;
  - `WAITING` / attempt status banner.
- Подтверждено: existing production card hierarchy сохраняется, AI badges layer on top, а не заменяют текущий card layout.
- Подтверждено: `Deal.assignedRepId` и `Deal.assistingRepIds` являются do-not-touch platform ownership fields; Pipeline AI читает notes, но не меняет ownership.
- Подтверждено: Inbox action row, `Assign Rep`, CONTACT `Assigned Rep`, rep chip и Admin/My Convs scope остаются как есть.
- Подтверждено: для TS implementation нужно портировать grading logic из `run_golden.py`, а CSV использовать как comparison baseline.
- Подтверждено: v1 auto-nurture включает только attempt counter, quick-log buttons, WAITING X/Y banner, auto-move to `NURTURE` at threshold и reset paths из B.10.6.
- Подтверждено: post-nurture automation, scheduled re-engagement flows и time-based reminders остаются во v2.

## Phase 0 Gate. Pre-build alignment

- [x] Подтвердить, что не строим новый pipeline с нуля, если это прямо не согласовано отдельно.
- [x] Подтвердить, какие prototype элементы обязательны к pixel-close сравнению.
- [x] Подтвердить, какие prototype элементы остаются вне v1.

### Remaining alignment questions

- [ ] Подтвердить canonical `followUpType` values/casing для новых `GHOSTED` / `LOST` состояний, чтобы не поймать regression с текущим lowercase UI.
- [ ] Подтвердить поведение `Re-run AI`, если у deal нет сохраненной note: брать latest client SMS или скрывать/disable action до появления note.

## Phase 1. Prototype extraction map

- [ ] Выписать UI elements, которые сравниваем с prototype pixel-close:
  - `ai-inline-bar`;
  - `ai-chip` filled/empty;
  - `stacking-badge`;
  - `quick-log-row` / `ql-btn`;
  - `state-pill-row` с attempts strip;
  - `nurture-banner` / `modal-nurture-banner`.
- [ ] Отдельно выписать prototype elements, которые НЕ возвращаем в v1:
  - `suggested_stage`;
  - old urgency-driven behavior outside retained scope;
  - editable AI extraction UI.
- [ ] Снять baseline map текущего pipeline против prototype:
  - что уже совпадает;
  - что требует доработки;
  - что выглядит похоже визуально, но не покрыто по functional behavior.
- [ ] Отдельно сверить `WAITING X/Y ATTEMPTS` banner с retained v1 target из ответа клиента.

## Phase 1 Gate. Prototype review

- [ ] Для каждого retained элемента зафиксировать: current state, target state, validation method.
- [ ] Подготовить список элементов для pixel-by-pixel сравнения после реализации.

## Phase 2. Extractor backend foundation

- [ ] Добавить `Deal.pipelineAiSignals`.
- [ ] Добавить `Deal.pipelineAiUpdatedAt`.
- [ ] Поднять `pipelineAiService.ts` parallel to Inbox AI.
- [ ] Встроить strict payload format.
- [ ] Сделать fallback `conversation.aiSignals -> deal.pipelineAiSignals`.
- [ ] Реализовать queue per `dealId`.
- [ ] Добавить structured logging.
- [ ] Обеспечить safe failure mode без note-write regression.

## Phase 2 Gate. Backend foundation testing

- [ ] Прогнать узкие unit tests по extractor helpers.
- [ ] Проверить migration shape и типы без побочных schema regression.
- [ ] Проверить, что note save path не ломается при AI error.
- [ ] Проверить, что queue не создает race condition на одном `dealId`.

## Phase 3. Trigger wiring and API

- [ ] Trigger from `note_added`.
- [ ] Trigger from `note_updated`.
- [ ] Trigger from allowed inbound client SMS stages.
- [ ] Skip on `FUNDED`, `CLOSED`, too-short payloads and other explicit skip cases.
- [ ] Add `POST /api/ai/extract-pipeline`.
- [ ] Confirm source behavior for manual re-run.

## Phase 3 Gate. Trigger testing

- [ ] Проверить `note_added` trigger отдельно.
- [ ] Проверить `note_updated` trigger отдельно.
- [ ] Проверить inbound client SMS trigger отдельно.
- [ ] Проверить skip conditions отдельно.
- [ ] Проверить manual re-run endpoint отдельно.

## Phase 4. Validation foundation

- [ ] Port grading logic from `run_golden.py` into TS test runner.
- [ ] Add fixtures to server tests.
- [ ] Use `pipeline-golden-results.csv` as comparison baseline for the 15-case golden run.
- [ ] Use `pipeline-extraction-review.csv` as comparison baseline for the 80-row corpus run.
- [ ] Pass field-level parity against golden cases.
- [ ] Add tests for queue serialization.
- [ ] Add tests for skip conditions.
- [ ] Add tests for fallback inheritance behavior.

## Phase 4 Gate. Validation testing

- [ ] Прогнать golden set целиком.
- [ ] Сверить field-level parity с expected grading behavior.
- [ ] Проверить, что fallback inheritance не теряет ранние сигналы.
- [ ] Проверить, что partial/fail cases читаемы и пригодны для отладки.

## Phase 5. Frontend data plumbing

- [ ] Add `PipelineAiSignals` type.
- [ ] Extend deal fetch shape.
- [ ] Extend local component state where needed.
- [ ] Keep manual rep input canonical.
- [ ] Ensure AI values are suggestions, not silent overwrites.
- [ ] Preserve `Deal.assignedRepId` and `Deal.assistingRepIds` as-is in every Pipeline AI frontend/API payload.
- [ ] Preserve Inbox `Assign Rep` button and CONTACT `Assigned Rep` field while adding any new AI surfaces.
- [ ] Preserve rep chip visibility in Admin and My Convs views.
- [ ] Preserve admin-only Admin/My Convs toggle and non-admin My Convs lock.

## Phase 5 Gate. Data plumbing testing

- [ ] Проверить, что client получает новый payload без поломки старого deal UI.
- [ ] Проверить, что empty/null signal states не ломают рендер.
- [ ] Проверить, что manual values rep-а не затираются AI suggestions.

## Phase 6. DealCard implementation

- [ ] Render industry badge.
- [ ] Render monthly revenue badge.
- [ ] Render use of funds badge.
- [ ] Render stacking chip with correct priority order.
- [ ] Render placeholder/empty states only where spec requires.
- [ ] Keep existing card hierarchy intact.

## Phase 6 Gate. DealCard testing

- [ ] Проверить badge rendering на каждом signal state.
- [ ] Проверить stacking priority order на всех 3 состояниях.
- [ ] Проверить, что текущие card badges и hierarchy не ломаются.
- [ ] Сделать pixel-by-pixel compare по DealCard retained elements.

## Phase 7. DealPanel implementation

- [ ] Render AI inline bar above stage/product row.
- [ ] Render trailing source/extracted-time label.
- [ ] Add re-run AI action.
- [ ] Integrate suggestion-only prefill behavior.
- [ ] Preserve existing manual revenue/product/action flows.

## Phase 7 Gate. DealPanel testing

- [ ] Проверить AI inline bar на full/partial/empty state.
- [ ] Проверить re-run AI loading/error/success path.
- [ ] Проверить suggestion-only prefill behavior.
- [ ] Проверить, что ручные controls продолжают работать как раньше.
- [ ] Сделать pixel-by-pixel compare по DealPanel retained elements.

## Phase 8. Auto-nurture backend

- [ ] Add `contactAttempts`.
- [ ] Add `contactAttemptThreshold`.
- [ ] Add `lastEngagementAt`.
- [ ] Add `log-attempt` endpoint.
- [ ] Implement all 5 quick-log semantics.
- [ ] Implement `resetEngagement()` helper.
- [ ] Reset on inbound SMS.
- [ ] Reset on `Connected`.
- [ ] Reset on forward stage move.
- [ ] Trigger auto-move to `NURTURE` at threshold.
- [ ] Preserve audit trail in `DealEvent`.

## Phase 8 Gate. Auto-nurture backend testing

- [ ] Проверить каждую quick-log semantics отдельно.
- [ ] Проверить reset triggers отдельно.
- [ ] Проверить threshold trigger отдельно.
- [ ] Проверить `DealEvent` audit trail отдельно.
- [ ] Проверить, что revive queue semantics не ломаются.

## Phase 9. Auto-nurture UI

- [ ] Render quick-log row in `DealPanel`.
- [ ] Render waiting-attempt banner on `DealCard`.
- [ ] Render same status area in `DealPanel`.
- [ ] Implement color-ratio thresholds.
- [ ] Implement near-threshold pulse state.
- [ ] Add admin threshold override if confirmed in scope.

## Phase 9 Gate. Auto-nurture UI testing

- [ ] Проверить visual states `low / mid / near-threshold`.
- [ ] Проверить counter math и remaining attempts display.
- [ ] Проверить quick-log UX from rep perspective.
- [ ] Сделать pixel-by-pixel compare по quick-log row и attempt status elements.

## Phase 10. Pixel-close prototype pass

- [ ] Для каждого retained элемента сравнивать не только visually close, а именно pixel-by-pixel.
- [ ] Compare chip order with prototype.
- [ ] Compare spacing, border, and typography of badges/chips.
- [ ] Compare banner layering against existing card hierarchy.
- [ ] Compare modal section placement for AI bar and quick-log row.
- [ ] Compare desktop layout density.
- [ ] Compare mobile survival and wrapping behavior.
- [ ] Validate that functionality was not broken while matching visuals.

## Phase 10 Gate. Visual sign-off

- [ ] У каждого retained элемента есть comparison result: `match / acceptable delta / needs correction`.
- [ ] Исправить все critical visual deltas до финального release gate.
- [ ] Повторно проверить, что визуальные правки не внесли functional regression.

## Phase 11. Regression gate

- [ ] Inbox AI remains unaffected.
- [ ] Existing note save/update flows remain unaffected.
- [ ] Existing manual product and revenue controls remain unaffected.
- [ ] Existing rep ownership remains unaffected: primary rep, assisting reps, deal sharing, scoped sockets.
- [ ] Existing Inbox assignment UI remains unaffected: action-row `Assign Rep`, CONTACT `Assigned Rep`, rep chips.
- [ ] Existing Admin/My Convs scoping remains unaffected and totals remain scoped correctly.
- [ ] `moveDeal` remains safe.
- [ ] Revive queue remains correct.
- [ ] No bad `followUpType` regressions in current nurture UI.
- [ ] No race conditions on rapid note updates.

## Phase 11 Gate. Full regression testing

- [ ] Пройти backend regression по связанным flows.
- [ ] Пройти frontend regression по inbox, pipeline, deal panel.
- [ ] Пройти manual operator path как реальный пользователь.
- [ ] Зафиксировать найденные edge cases до release.

## Phase 12. Release gate

- [ ] Server tests pass.
- [ ] Client build passes.
- [ ] Golden validation passes.
- [ ] Loading/error/empty states checked.
- [ ] Desktop and mobile checked.
- [ ] Final scope note prepared: what is in v1 and what stays deferred.

## Phase 12 Gate. Final sign-off

- [ ] Нет открытых blockers по functional logic.
- [ ] Нет открытых critical deltas по prototype compare.
- [ ] Нет открытых regression issues по затронутым flows.
- [ ] Подготовлен safe release summary.

## Non-negotiable quality rules

- [ ] Не менять prompt/schema contract без явного основания.
- [ ] Не перетирать manual rep values silently.
- [ ] Не менять `Deal.assignedRepId` / `Deal.assistingRepIds` из AI extractor, badge rendering или visual pass.
- [ ] Не удалять Inbox `Assign Rep`, CONTACT `Assigned Rep`, rep chip и Admin/My Convs toggle/lock.
- [ ] Не возвращать removed behaviors только потому, что они есть в prototype.
- [ ] Не выпускать auto-stage logic без audit-safe validation.
- [ ] После каждого существенного шага делать focused validation, а не оставлять проверки на конец.
