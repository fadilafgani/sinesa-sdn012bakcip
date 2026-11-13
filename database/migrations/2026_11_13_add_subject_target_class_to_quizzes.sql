-- =========================================================================
-- Migration: Add `subject` and `target_class` columns to `quizzes` table
-- Safe for MySQL 8.0+ and MariaDB
-- =========================================================================

SET @dbname = DATABASE();

-- Add `subject` column if it does not exist
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname 
      AND TABLE_NAME = 'quizzes' 
      AND COLUMN_NAME = 'subject'
);

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quizzes` ADD COLUMN `subject` VARCHAR(100) NULL AFTER `title`', 
    'SELECT "Column subject already exists" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add `target_class` column if it does not exist
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname 
      AND TABLE_NAME = 'quizzes' 
      AND COLUMN_NAME = 'target_class'
);

SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quizzes` ADD COLUMN `target_class` VARCHAR(50) NULL AFTER `subject`', 
    'SELECT "Column target_class already exists" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
