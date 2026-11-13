-- =========================================================================
-- Migration: Add countdown columns to `quiz_sessions` table
-- Safe for MySQL 8.0+ and MariaDB
-- =========================================================================

SET @dbname = DATABASE();

-- 1. Add `countdown_started_at`
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname 
      AND TABLE_NAME = 'quiz_sessions' 
      AND COLUMN_NAME = 'countdown_started_at'
);

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quiz_sessions` ADD COLUMN `countdown_started_at` DATETIME(3) NULL AFTER `current_question_index`', 
    'SELECT "Column countdown_started_at already exists in quiz_sessions" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Add `countdown_expires_at`
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname 
      AND TABLE_NAME = 'quiz_sessions' 
      AND COLUMN_NAME = 'countdown_expires_at'
);

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quiz_sessions` ADD COLUMN `countdown_expires_at` DATETIME(3) NULL AFTER `countdown_started_at`', 
    'SELECT "Column countdown_expires_at already exists in quiz_sessions" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. Add `countdown_duration`
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname 
      AND TABLE_NAME = 'quiz_sessions' 
      AND COLUMN_NAME = 'countdown_duration'
);

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quiz_sessions` ADD COLUMN `countdown_duration` INT NOT NULL DEFAULT 3 AFTER `countdown_expires_at`', 
    'SELECT "Column countdown_duration already exists in quiz_sessions" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
