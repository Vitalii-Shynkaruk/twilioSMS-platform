# Release Rollback & Smoke Checklist

© BuyReadySite.com

## Цель

Минимизировать риск регрессий при релизе и иметь быстрый откат в случае деградации.

## Pre-Release (обязательно)

1. Прогнать backend build: `cd server && npm run build`.
2. Прогнать M1 regression suite (DB-free):
   `cd server && npm test -- --run tests/inboundParsing.test.ts tests/sendingUrlBuilder.test.ts tests/aiServiceComplianceScoring.test.ts tests/twilioSignatureValidation.test.ts tests/quietHoursWindow.test.ts tests/envValidation.test.ts tests/retargetSuppression.test.ts tests/inboundPhoneSuppression.test.ts tests/outboundMessageGuard.test.ts tests/complianceKeywordParser.test.ts tests/featureFlags.test.ts tests/compliance.test.ts`.
3. Проверить, что `AI_CLASSIFICATION_ENABLED=false` в production до полного QA.
4. Проверить `CLIENT_URL` и `WEBHOOK_BASE_URL` на production-домены (не localhost).
5. Подготовить rollback tag/revision перед деплоем.

## Smoke после деплоя (5-10 минут)

1. Проверить health: `GET /api/health` = 200.
2. Проверить CORS: `Access-Control-Allow-Origin` = production домен.
3. Проверить inbound webhook auth:
   запрос без `x-twilio-signature` должен вернуть 403.
4. Проверить отправку outbound из inbox на тестовый номер:
   сообщение создается, статус меняется до SENT/DELIVERED.
5. Проверить inbox realtime:
   новый inbound появляется у назначенного rep, без утечки в чужие inbox.

## Критерии отката

Откатываем релиз немедленно, если выполнено хотя бы одно:

1. API health не стабилен (5xx более 2 минут).
2. Ошибка webhook подписи или массовые 403 от валидных Twilio callback.
3. Утечка socket событий между репами.
4. Потеря inbound сообщений или массовый fail outbound.

## Rollback шаги

1. Остановить rollout (если поэтапный).
2. Переключить на предыдущий стабильный revision/tag.
3. Перезапустить сервисы API/worker.
4. Повторить smoke checklist.
5. Зафиксировать инцидент и RCA в рабочем отчете.
