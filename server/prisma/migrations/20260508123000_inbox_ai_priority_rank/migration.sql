ALTER TABLE `conversations`
  ADD COLUMN `ai_priority_rank` INTEGER NOT NULL DEFAULT 9;

UPDATE `conversations`
SET `ai_priority_rank` = CASE
  WHEN `followup_status` = 'due_now' THEN 1
  WHEN `aiClassification` = 'HOT' THEN 2
  WHEN `aiClassification` = 'WARM' THEN 3
  WHEN `aiClassification` IN ('SENSITIVE', 'NURTURE') THEN 4
  WHEN `aiClassification` IN ('DEAD', 'WRONG_NUMBER') THEN 5
  ELSE 9
END;

CREATE INDEX `conversations_ai_priority_rank_last_message_at_idx`
  ON `conversations`(`ai_priority_rank`, `lastMessageAt`);