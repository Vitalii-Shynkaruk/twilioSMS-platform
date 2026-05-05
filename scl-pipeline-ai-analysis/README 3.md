© BuyReadySite.com

# SCL Pipeline AI - Analysis Package

## Статус

Это analysis-only пакет по handoff из `scl-pipeline-ai-handoff/`.

- К реализации пока не приступаем.
- Цель этого пакета - разложить scope, сложность, сроки, риски и вопросы до старта разработки.
- Оценки ниже даны для одного сильного full-stack разработчика с текущим состоянием этого репозитория.

## Что было проанализировано

- handoff-артефакты: `extractor-spec.md`, `scl-pipeline-ai-extractor.md`, `golden_test_set.json`, `pipeline-ai.fixtures.json`, `run_golden.py`, `scl_pipeline_v11.html`;
- текущая backend-база под AI и pipeline:
  - `server/src/services/aiService.ts`
  - `server/src/routes/ai.ts`
  - `server/src/controllers/dealController.ts`
  - `server/prisma/schema.prisma`
- текущие frontend surfaces под pipeline:
  - `client/src/components/pipeline/DealCard.tsx`
  - `client/src/components/pipeline/DealPanel.tsx`
  - `client/src/types/index.ts`
  - `client/src/services/api.ts`

## Короткий вывод

Это не три изолированные задачи. Реальный фундамент здесь такой:

1. Сначала нужно собрать backend/data layer для нового `Deal.pipelineAiSignals` и trigger wiring.
2. Потом поверх этого можно безопасно делать badges/chips и re-run UX.
3. Auto-nurture - это отдельный platform mechanic с собственными полями, endpoint-ами, reset-правилами и regression-рисками.

Главный practical вывод: самая важная часть проекта не во фронтенд-бейджах, а в backend-логике, data flow и audit-safe state transitions.

## Предварительная оценка

- `AI extractor`: medium-high complexity;
- `Frontend badges + DealPanel integration`: medium complexity;
- `Auto-nurture mechanic`: high complexity;
- `QA, regression, golden validation`: mandatory, не optional.

При fixed scope и Copilot-assisted implementation базовая рабочая оценка: **5-7 рабочих дней**.

После последних ответов клиента основные scope blockers закрыты. На текущий момент остаются только несколько узких implementation clarifications, но они не мешают начинать подготовку к реализации.

## Что лежит в этой папке

- `SCOPE_AND_TIMELINE.md` - детальный разбор 3 workstreams и сроков;
- `IMPLEMENTATION_CHECKLIST.md` - подробный чеклист по внедрению;
- `MASTER_WORK_CHECKLIST.md` - наш основной внутренний рабочий чеклист по фазам, quality gates и prototype-pass;
- `MEDIATOR_MESSAGE.md` - готовый текст для посредника/клиента;
- `CLARIFYING_QUESTIONS_AND_GAPS.md` - список уточнений и проблем handoff.

## На что стоит обратить внимание сразу

- `extractor-spec.md` подтвержден как canonical behavior spec;
- `scl_pipeline_v11.html` подтвержден как binding visual target для retained v1 elements;
- `pipeline-ai.fixtures.json` подтвержден как source of truth для тестов;
- rollout подтвержден как direct upgrade текущих pipeline surfaces;
- `run_golden.py` и `test_harness.py` остаются reference artifacts, но validation flow все равно нужно переносить в repo-local TS runner.

## Prototype review

Да, HTML prototype просмотрен не поверхностно, а по ключевым binding-элементам UI. Внутрь чеклиста уже вынесены конкретные элементы, которые нужно сравнивать и повторять:

- `ai-inline-bar`;
- `ai-chip` и placeholder states;
- `stacking-badge`;
- `quick-log-row` / `ql-btn`;
- `state-pill-row` с attempt counter;
- `nurture-banner` / `modal-nurture-banner`.

Это значит, что перед стартом кодинга нужен короткий alignment pass по границам v1.
