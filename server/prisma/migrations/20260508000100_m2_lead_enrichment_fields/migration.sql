ALTER TABLE `leads`
  ADD COLUMN `industry` VARCHAR(100) NULL,
  ADD COLUMN `monthly_revenue` DECIMAL(12, 2) NULL,
  ADD COLUMN `monthly_revenue_source` VARCHAR(20) NULL,
  ADD COLUMN `ai_signals_synced_at` DATETIME(3) NULL,
  ADD COLUMN `last_contacted_by_user_id` VARCHAR(36) NULL;

CREATE INDEX `leads_industry_idx` ON `leads`(`industry`);
CREATE INDEX `leads_last_contacted_by_user_id_idx` ON `leads`(`last_contacted_by_user_id`);

ALTER TABLE `leads`
  ADD CONSTRAINT `leads_last_contacted_by_user_id_fkey`
  FOREIGN KEY (`last_contacted_by_user_id`) REFERENCES `users`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
