-- =========================================================================
-- SINESA Master Schema Synchronization Migration
-- Safe for MySQL 8.0+ and MariaDB (Idempotent: safe to run multiple times)
-- =========================================================================

SET @dbname = DATABASE();

-- -------------------------------------------------------------------------
-- 1. Table `quizzes`: Add `subject` and `target_class`
-- -------------------------------------------------------------------------
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quizzes' AND COLUMN_NAME = 'subject'
);
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quizzes` ADD COLUMN `subject` VARCHAR(100) NULL AFTER `title`', 
    'SELECT "quizzes.subject already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quizzes' AND COLUMN_NAME = 'target_class'
);
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quizzes` ADD COLUMN `target_class` VARCHAR(50) NULL AFTER `subject`', 
    'SELECT "quizzes.target_class already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------------
-- 2. Table `questions`: Add `duration`
-- -------------------------------------------------------------------------
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'questions' AND COLUMN_NAME = 'duration'
);
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `questions` ADD COLUMN `duration` INT NOT NULL DEFAULT 30 AFTER `points`', 
    'SELECT "questions.duration already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- -------------------------------------------------------------------------
-- 3. Table `quiz_sessions`: Add countdown columns
-- -------------------------------------------------------------------------
SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quiz_sessions' AND COLUMN_NAME = 'countdown_started_at'
);
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quiz_sessions` ADD COLUMN `countdown_started_at` DATETIME(3) NULL AFTER `current_question_index`', 
    'SELECT "quiz_sessions.countdown_started_at already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quiz_sessions' AND COLUMN_NAME = 'countdown_expires_at'
);
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quiz_sessions` ADD COLUMN `countdown_expires_at` DATETIME(3) NULL AFTER `countdown_started_at`', 
    'SELECT "quiz_sessions.countdown_expires_at already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (
    SELECT COUNT(*) 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'quiz_sessions' AND COLUMN_NAME = 'countdown_duration'
);
SET @sql = IF(@col_exists = 0, 
    'ALTER TABLE `quiz_sessions` ADD COLUMN `countdown_duration` INT NOT NULL DEFAULT 3 AFTER `countdown_expires_at`', 
    'SELECT "quiz_sessions.countdown_duration already exists" AS info'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
