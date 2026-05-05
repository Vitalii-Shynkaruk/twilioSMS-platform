© BuyReadySite.com

# Clarifying Questions And Handoff Gaps

## Обновление после ответа клиента

Следующие вопросы уже закрыты и больше не являются blockers:

- `extractor-spec.md` подтвержден как canonical behavior spec;
- `scl_pipeline_v11.html` подтвержден как binding visual target только для retained v1 elements;
- `test_harness.py`, `pipeline-extraction-review.csv`, `pipeline-golden-results.csv` получены;
- confirmed: grader logic нужно портировать из `run_golden.py` в TS runner, CSV использовать как comparison baseline;
- `pipeline-ai.fixtures.json` подтвержден как canonical source of truth, `golden_test_set.json` остается mirror file;
- confirmed: v1 auto-nurture scope ограничен attempt counter, WAITING banner, threshold move и reset paths из B.10.6;
- confirmed: rollout model = direct upgrade текущих pipeline surfaces, не отдельная parallel v2 system.

## Подтвержденные gaps в handoff-пакете

### 1. Missing files в исходном handoff были получены отдельно

Изначально в `extractor-spec.md` перечислялись:

- `test_harness.py`;
- `pipeline-extraction-review.csv`;
- `pipeline-golden-results.csv`.

В исходном `scl-pipeline-ai-handoff/` этих файлов не было, но теперь они получены отдельно и больше не блокируют старт.

### 2. `run_golden.py` все еще нельзя запускать как есть без локальной адаптации

- Он ожидает `test_harness.py`;
- Он читает fixtures из `~/Desktop/scl-handoff-pipeline/`;
- Он пишет результаты в `~/Desktop/scl-handoff-clean/`.

Практический вывод: validation reference теперь достаточный, но runner все равно придется адаптировать под repo-local TS validation flow.

### 3. Два fixture-файла полностью дублируются

`golden_test_set.json` и `pipeline-ai.fixtures.json` полностью идентичны.

Это уже подтверждено: canonical source of truth = `pipeline-ai.fixtures.json`.

### 4. Prototype шире, чем финальный v1 scope

`scl_pipeline_v11.html` содержит элементы вроде urgency chip и stage suggestion UI, но в `extractor-spec.md` эти части уже убраны из v1.

Практический вывод: prototype нельзя читать как behavioral source of truth целиком. Его безопасно использовать как visual target только для retained patterns, что клиент теперь явно подтвердил.

## Оставшиеся точечные уточнения

### 1. `followUpType` semantics

- Подтвердите exact canonical values/casing для новых состояний `GHOSTED` и `LOST`.
- Это важно, потому что текущий pipeline UI уже опирается на несколько lowercase значений `followUpType`, и здесь возможен ненужный regression без явного согласования.

### 2. Re-run AI input source

- Если у deal нет сохраненной note, что должен делать `Re-run AI`:
  - брать latest saved client SMS,
  - или быть скрытым/disabled до появления note?

### 3. Admin threshold override UX

- Подтвердите, нужен ли override `contactAttemptThreshold` только для admin/manager или допускается rep-level override.
- Подтвердите, нужна ли история изменения threshold в `DealEvent`.

## Что я бы зафиксировал как safe interpretation прямо сейчас

Если стартовать с минимально рискованной трактовкой, я бы зафиксировал следующее:

- `extractor-spec.md` - canonical behavioral spec;
- `scl_pipeline_v11.html` - canonical visual spec только для retained UI patterns;
- `AI extractor` и `auto-nurture` - два независимых потока записи в разные поля Deal;
- rollout = direct upgrade текущих pipeline surfaces;
- `pipeline-ai.fixtures.json` - source of truth для тестов;
- v1 не включает stage suggestion automation, timing-to-date resolution, editable AI output и confidence scoring.
