-- © BuyReadySite.com — Phase 1 backfill: исправление source='csv_import' у старых лидов
--
-- ЦЕЛЬ:
--   До Phase 1 при импорте CSV все лиды получали source='csv_import' (hardcoded).
--   Phase 1 (B6) исправил импортёр — новые импорты используют имя листа/файла.
--   Этот скрипт обновляет старые ~22,797 лидов: берёт имя кампании, в которую
--   лид был добавлен раньше всего, и подставляет его в source.
--
-- БЕЗОПАСНОСТЬ:
--   1. Сначала ВСЕГДА запускать SELECT (preview) — посмотреть что обновится.
--   2. Делать SQL-бэкап перед UPDATE:
--      mysqldump -u smsapp -p sms_platform leads > /tmp/leads_backup_$(date +%F).sql
--   3. UPDATE обёрнут в транзакцию, можно ROLLBACK если результат не устраивает.
--
-- ЗАПУСК:
--   ssh sclserver "mysql -usmsapp -p sms_platform" < scripts/backfill_csv_import_source.sql

-- ── PREVIEW: сколько лидов будет обновлено и какие имена кампаний будут подставлены ──
SELECT
  COUNT(*) AS total_to_update,
  SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT new_source ORDER BY new_source SEPARATOR '||'), '||', 20) AS sample_new_sources
FROM (
  SELECT
    l.id,
    c.name AS new_source
  FROM leads l
  JOIN campaign_leads cl ON cl.lead_id = l.id
  JOIN campaigns c ON c.id = cl.campaign_id
  WHERE l.source = 'csv_import'
    AND l.deleted_at IS NULL
    AND c.name IS NOT NULL
    AND c.name <> ''
  GROUP BY l.id
) sub;

-- ── BACKFILL: обновляем source = имя самой ранней кампании, в которой лид участвовал ──
START TRANSACTION;

UPDATE leads l
JOIN (
  SELECT
    cl.lead_id,
    c.name AS campaign_name,
    ROW_NUMBER() OVER (PARTITION BY cl.lead_id ORDER BY cl.created_at ASC, c.created_at ASC) AS rn
  FROM campaign_leads cl
  JOIN campaigns c ON c.id = cl.campaign_id
  WHERE c.name IS NOT NULL AND c.name <> ''
) ranked ON ranked.lead_id = l.id AND ranked.rn = 1
SET l.source = ranked.campaign_name
WHERE l.source = 'csv_import'
  AND l.deleted_at IS NULL;

-- ── VERIFY: распределение source ПОСЛЕ обновления ──
SELECT source, COUNT(*) AS cnt
FROM leads
WHERE deleted_at IS NULL
GROUP BY source
ORDER BY cnt DESC
LIMIT 30;

-- Если результат устраивает:
--   COMMIT;
-- Если нет:
--   ROLLBACK;
--
-- Решение принимается оператором вручную после ревью VERIFY-блока.
