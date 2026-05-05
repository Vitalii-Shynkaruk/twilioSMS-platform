# M2 Follow-up Production Migration Plan

Date: 2026-04-28
Scope: prepare only. Do not run on production until explicitly approved.

## Goal

Add the M2 follow-up fields requested by the client while preserving all production users, leads, conversations, settings, exports, and message data.

New fields on `conversations`:

- `followup_time`
- `followup_reason`
- `followup_set_by`
- `followup_set_at`
- `followup_status` with values `scheduled`, `due_now`, `completed`, `cleared`

This is an additive schema change only. No tables, rows, users, leads, settings, exports, or runtime data should be deleted.

## Current Safe State

- Production source is currently clean and aligned to the previously deployed stable commit.
- M2 code is committed and pushed to `deploy/mysql-hosting`.
- GitHub Actions CI run `25064083733` passed on trigger SHA `56b16cd`.
- Production deploy remains blocked until the DB columns exist.

## Pre-deploy Gates

Before touching production DB or runtime code:

1. Confirm production app health is `200`.
2. Confirm PM2 process `sms-api` is online.
3. Confirm production git/source status is clean.
4. Confirm runtime data folders are excluded from source sync: `.env`, `exports/`, `node_modules/`, logs, build output.
5. Create a timestamped production backup directory under `/root/scl-prod-backups/`.
6. Create a DB dump using production DB credentials from the production environment, without printing secrets to terminal or logs.
7. Confirm `conversations` currently does not already contain all five new columns.

## Column Precheck

Run a read-only check before applying SQL:

```sql
SHOW COLUMNS FROM conversations LIKE 'followup_time';
SHOW COLUMNS FROM conversations LIKE 'followup_reason';
SHOW COLUMNS FROM conversations LIKE 'followup_set_by';
SHOW COLUMNS FROM conversations LIKE 'followup_set_at';
SHOW COLUMNS FROM conversations LIKE 'followup_status';
```

Expected before migration: no rows for the five new columns.

## Additive SQL

Run only after backup and precheck. This SQL adds columns and indexes only.

```sql
ALTER TABLE conversations
  ADD COLUMN followup_time DATETIME(3) NULL,
  ADD COLUMN followup_reason TEXT NULL,
  ADD COLUMN followup_set_by VARCHAR(191) NULL,
  ADD COLUMN followup_set_at DATETIME(3) NULL,
  ADD COLUMN followup_status VARCHAR(191) NOT NULL DEFAULT 'cleared';

CREATE INDEX conversations_followup_time_idx ON conversations(followup_time);
CREATE INDEX conversations_followup_status_idx ON conversations(followup_status);
```

Alternative: after backup, run `npx prisma db push` from `server/` against production. Manual SQL is preferred for clearer review because production currently has no Prisma migration history.

## Backfill SQL

After adding columns, mirror legacy follow-up values into the new fields without changing old fields:

```sql
UPDATE conversations
SET followup_time = nextFollowupAt
WHERE followup_time IS NULL
  AND nextFollowupAt IS NOT NULL;

UPDATE conversations
SET followup_status = CASE
  WHEN followupState = 'due_now' THEN 'due_now'
  WHEN nextFollowupAt IS NOT NULL AND nextFollowupAt <= UTC_TIMESTAMP(3) THEN 'due_now'
  WHEN followupState = 'scheduled' OR nextFollowupAt IS NOT NULL THEN 'scheduled'
  ELSE 'cleared'
END
WHERE followup_status = 'cleared';
```

This backfill keeps `nextFollowupAt` and `followupState` intact as backward-compatible legacy fields.

## Post-migration Verification

Run read-only verification:

```sql
SHOW COLUMNS FROM conversations LIKE 'followup_time';
SHOW COLUMNS FROM conversations LIKE 'followup_reason';
SHOW COLUMNS FROM conversations LIKE 'followup_set_by';
SHOW COLUMNS FROM conversations LIKE 'followup_set_at';
SHOW COLUMNS FROM conversations LIKE 'followup_status';

SELECT followup_status, COUNT(*)
FROM conversations
GROUP BY followup_status;

SELECT COUNT(*) AS migrated_legacy_followups
FROM conversations
WHERE nextFollowupAt IS NOT NULL
  AND followup_time IS NOT NULL;
```

Expected:

- All five columns exist.
- `followup_status` only contains `scheduled`, `due_now`, `completed`, `cleared`.
- Legacy follow-ups with `nextFollowupAt` have `followup_time` populated.

## Runtime Deploy Plan

Only after DB verification succeeds:

1. Pull/sync the committed source from `deploy/mysql-hosting` using the established rsync deploy process and production excludes.
2. Run `npm ci` only if lockfiles changed or dependencies are missing.
3. Run `npm run prisma:generate` in `server/`.
4. Run `npm run build` in `server/`.
5. Run `npm run build` in `client/`.
6. Restart PM2 process `sms-api`.
7. Confirm `/health` returns `200`.
8. Confirm PM2 is online and logs show no Prisma unknown-field errors.
9. Confirm production `exports/` still exists and is not empty/removed.
10. Confirm production git/source status remains clean after sync/build cleanup.

## Rollback Notes

If app deploy fails after the additive migration:

1. Roll source/runtime back to the previous stable commit.
2. Restart PM2.
3. Keep the new DB columns in place unless they are proven to be the cause; additive unused columns are safe for old runtime code.
4. Restore DB dump only if data corruption is observed. Do not restore DB for normal application build/runtime errors.

## Do Not Do

- Do not run destructive SQL such as `DROP`, `TRUNCATE`, or `DELETE`.
- Do not reset production data.
- Do not delete users, leads, settings, conversations, exports, messages, or logs.
- Do not deploy M2 runtime code before the new DB columns exist.
- Do not print production DB credentials, JWTs, Twilio tokens, or cookies in terminal output.
