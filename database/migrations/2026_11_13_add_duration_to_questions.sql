-- =========================================================================
-- Migration: Add `duration` column to `questions` table
-- Safe for MySQL 8.0+ and MariaDB
-- =========================================================================

SET @dbname = DATABASE();

-- Add `duration` column if it does not exist
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname 
      AND TABLE_NAME = 'questions' 
      AND COLUMN_NAME = 'duration'
);

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `questions` ADD COLUMN `duration` INT NOT NULL DEFAULT 30 AFTER `points`', 
    'SELECT "Column duration already exists in questions" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

