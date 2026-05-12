ALTER TABLE `leads`
  ADD COLUMN `line_type` VARCHAR(50) NULL,
  ADD COLUMN `carrier_name` VARCHAR(191) NULL,
  ADD COLUMN `validated_at` DATETIME(3) NULL;

CREATE INDEX `leads_validated_at_idx` ON `leads`(`validated_at`);

CREATE TABLE `csv_import_jobs` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NULL,
  `user_role` VARCHAR(50) NULL,
  `list_name` VARCHAR(191) NULL,
  `csv_content` LONGTEXT NULL,
  `mapping` JSON NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `total_rows` INTEGER NOT NULL DEFAULT 0,
  `processed_rows` INTEGER NOT NULL DEFAULT 0,
  `result` JSON NULL,
  `error_message` TEXT NULL,
  `started_at` DATETIME(3) NULL,
  `completed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `csv_import_jobs_status_created_at_idx` ON `csv_import_jobs`(`status`, `created_at`);
CREATE INDEX `csv_import_jobs_user_id_created_at_idx` ON `csv_import_jobs`(`user_id`, `created_at`);