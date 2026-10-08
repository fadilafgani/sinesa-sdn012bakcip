-- =========================================================================
-- SINESA DATABASE FOUNDATION SCHEMA
-- Sistem Nilai Dan Evaluasi Siswa Aktif (SDN 012 Babakan Ciparay)
--
-- Target RDBMS : MySQL 8.0+ / MariaDB 10.4+ / Compatible with PHP PDO
-- Character Set: utf8mb4 / utf8mb4_unicode_ci
-- Storage Engine: InnoDB (Full ACID & Referential Integrity Support)
-- =========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- -------------------------------------------------------------------------
-- 1. TABLE: profiles
-- Menyimpan identitas pengguna dan otorisasi peran (RBAC)
-- Menggantikan auth.users + public.profiles Supabase
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `profiles` (
    `id` VARCHAR(36) NOT NULL,
    `role` ENUM('admin', 'teacher', 'student') NOT NULL DEFAULT 'student',
    `full_name` VARCHAR(255) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `username` VARCHAR(100) NULL,
    `avatar_url` VARCHAR(500) NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_profiles_email` (`email`),
    UNIQUE KEY `uq_profiles_username` (`username`),
    INDEX `idx_profiles_role` (`role`),
    INDEX `idx_profiles_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 2. TABLE: quizzes
-- Menyimpan master kuis pembelajaran yang dibuat oleh Guru
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quizzes` (
    `id` VARCHAR(36) NOT NULL,
    `teacher_id` VARCHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `opening_text` TEXT NULL,
    `closing_text` TEXT NULL,
    `pin_code` VARCHAR(10) NOT NULL,
    `duration_per_question` INT NOT NULL DEFAULT 30,
    `random_questions` TINYINT(1) NOT NULL DEFAULT 0,
    `random_options` TINYINT(1) NOT NULL DEFAULT 0,
    `thumbnail_url` VARCHAR(500) NULL,
    `quiz_mode` ENUM('serius', 'santai') NOT NULL DEFAULT 'serius',
    `lives_count` INT NOT NULL DEFAULT 3,
    `show_final_result` TINYINT(1) NOT NULL DEFAULT 1,
    `show_leaderboard` TINYINT(1) NOT NULL DEFAULT 1,
    `show_correct_answer` TINYINT(1) NOT NULL DEFAULT 1,
    `show_answer_review` TINYINT(1) NOT NULL DEFAULT 1,
    `show_question_result` TINYINT(1) NOT NULL DEFAULT 1,
    `show_explanation` TINYINT(1) NOT NULL DEFAULT 1,
    `show_score_per_question` TINYINT(1) NOT NULL DEFAULT 1,
    `show_question_statistics` TINYINT(1) NOT NULL DEFAULT 1,
    `anti_cheat_enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `fullscreen_required` TINYINT(1) NOT NULL DEFAULT 0,
    `auto_submit_on_violation` INT NOT NULL DEFAULT 3,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_quizzes_pin_code` (`pin_code`),
    INDEX `idx_quizzes_teacher_id` (`teacher_id`),
    INDEX `idx_quizzes_status` (`status`),
    INDEX `idx_quizzes_created_at` (`created_at` DESC),
    CONSTRAINT `fk_quizzes_teacher` FOREIGN KEY (`teacher_id`) 
        REFERENCES `profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 3. TABLE: questions
-- Menyimpan butir pertanyaan kuis beserta konfigurasi media
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `questions` (
    `id` VARCHAR(36) NOT NULL,
    `quiz_id` VARCHAR(36) NOT NULL,
    `question_text` TEXT NOT NULL,
    `question_type` ENUM('multiple_choice', 'true_false', 'multiple_answer', 'matching') NOT NULL DEFAULT 'multiple_choice',
    `media_type` ENUM('text', 'image', 'audio', 'video', 'latex') NOT NULL DEFAULT 'text',
    `media_url` VARCHAR(500) NULL,
    `points` INT NOT NULL DEFAULT 100,
    `order_index` INT NOT NULL DEFAULT 0,
    `explanation` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_questions_quiz_id` (`quiz_id`),
    INDEX `idx_questions_order` (`quiz_id`, `order_index` ASC),
    CONSTRAINT `fk_questions_quiz` FOREIGN KEY (`quiz_id`) 
        REFERENCES `quizzes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 4. TABLE: options
-- Menyimpan pilihan opsi jawaban per butir soal
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `options` (
    `id` VARCHAR(36) NOT NULL,
    `question_id` VARCHAR(36) NOT NULL,
    `option_text` TEXT NOT NULL,
    `is_correct` TINYINT(1) NOT NULL DEFAULT 0,
    `match_text` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_options_question_id` (`question_id`),
    INDEX `idx_options_correct` (`question_id`, `is_correct`),
    CONSTRAINT `fk_options_question` FOREIGN KEY (`question_id`) 
        REFERENCES `questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 5. TABLE: quiz_sessions
-- Sesi live permainan kuis interaktif yang dikendalikan Guru (Host)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quiz_sessions` (
    `id` VARCHAR(36) NOT NULL,
    `quiz_id` VARCHAR(36) NOT NULL,
    `host_id` VARCHAR(36) NOT NULL,
    `status` ENUM('lobby', 'active', 'completed') NOT NULL DEFAULT 'lobby',
    `current_stage` ENUM('waiting', 'countdown', 'question', 'question_result', 'leaderboard', 'finished') NOT NULL DEFAULT 'waiting',
    `current_question_index` INT NOT NULL DEFAULT -1,
    `question_started_at` DATETIME(3) NULL,
    `question_expires_at` DATETIME(3) NULL,
    `quiz_mode` ENUM('serius', 'santai') NOT NULL DEFAULT 'serius',
    `lives_count` INT NOT NULL DEFAULT 3,
    `show_final_result` TINYINT(1) NOT NULL DEFAULT 1,
    `show_leaderboard` TINYINT(1) NOT NULL DEFAULT 1,
    `show_correct_answer` TINYINT(1) NOT NULL DEFAULT 1,
    `show_answer_review` TINYINT(1) NOT NULL DEFAULT 1,
    `show_question_result` TINYINT(1) NOT NULL DEFAULT 1,
    `show_explanation` TINYINT(1) NOT NULL DEFAULT 1,
    `show_score_per_question` TINYINT(1) NOT NULL DEFAULT 1,
    `show_question_statistics` TINYINT(1) NOT NULL DEFAULT 1,
    `anti_cheat_enabled` TINYINT(1) NOT NULL DEFAULT 0,
    `fullscreen_required` TINYINT(1) NOT NULL DEFAULT 0,
    `auto_submit_on_violation` INT NOT NULL DEFAULT 3,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `completed_at` DATETIME NULL,
    PRIMARY KEY (`id`),
    INDEX `idx_sessions_quiz_id` (`quiz_id`),
    INDEX `idx_sessions_host_id` (`host_id`),
    INDEX `idx_sessions_status` (`status`),
    INDEX `idx_sessions_active_lookup` (`quiz_id`, `status`),
    CONSTRAINT `fk_sessions_quiz` FOREIGN KEY (`quiz_id`) 
        REFERENCES `quizzes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_sessions_host` FOREIGN KEY (`host_id`) 
        REFERENCES `profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 6. TABLE: participants
-- Daftar siswa yang bergabung ke sesi kuis via PIN
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `participants` (
    `id` VARCHAR(36) NOT NULL,
    `session_id` VARCHAR(36) NOT NULL,
    `student_id` VARCHAR(36) NULL,
    `display_name` VARCHAR(100) NOT NULL,
    `score` INT NOT NULL DEFAULT 0,
    `lives` INT NOT NULL DEFAULT 3,
    `skipped_questions` JSON NULL,
    `question_status` JSON NULL,
    `current_progress` INT NOT NULL DEFAULT 0,
    `violation_count` INT NOT NULL DEFAULT 0,
    `is_completed` TINYINT(1) NOT NULL DEFAULT 0,
    `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_participants_session_display` (`session_id`, `display_name`),
    INDEX `idx_participants_session_id` (`session_id`),
    INDEX `idx_participants_student_id` (`student_id`),
    INDEX `idx_participants_leaderboard` (`session_id`, `score` DESC),
    CONSTRAINT `fk_participants_session` FOREIGN KEY (`session_id`) 
        REFERENCES `quiz_sessions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_participants_student` FOREIGN KEY (`student_id`) 
        REFERENCES `profiles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 7. TABLE: answers
-- Rekaman jawaban peserta pada setiap pertanyaan sesi
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `answers` (
    `id` VARCHAR(36) NOT NULL,
    `participant_id` VARCHAR(36) NOT NULL,
    `question_id` VARCHAR(36) NOT NULL,
    `selected_option_id` VARCHAR(36) NULL,
    `selected_option_ids` JSON NULL,
    `matching_answers` JSON NULL,
    `is_correct` TINYINT(1) NOT NULL DEFAULT 0,
    `response_time_ms` INT NOT NULL DEFAULT 0,
    `score_awarded` INT NOT NULL DEFAULT 0,
    `answered_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_answers_participant_question` (`participant_id`, `question_id`),
    INDEX `idx_answers_participant_id` (`participant_id`),
    INDEX `idx_answers_question_id` (`question_id`),
    INDEX `idx_answers_selected_option` (`selected_option_id`),
    CONSTRAINT `fk_answers_participant` FOREIGN KEY (`participant_id`) 
        REFERENCES `participants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_answers_question` FOREIGN KEY (`question_id`) 
        REFERENCES `questions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_answers_option` FOREIGN KEY (`selected_option_id`) 
        REFERENCES `options` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 8. TABLE: activity_logs
-- Catatan riwayat audit aktivitas administratif
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `details` TEXT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    INDEX `idx_activity_logs_user_id` (`user_id`),
    INDEX `idx_activity_logs_created_at` (`created_at` DESC),
    CONSTRAINT `fk_activity_logs_user` FOREIGN KEY (`user_id`) 
        REFERENCES `profiles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -------------------------------------------------------------------------
-- 9. TABLE: settings
-- Konfigurasi sistem dan preferensi sekolah (key-value)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
    `key` VARCHAR(100) NOT NULL,
    `value` TEXT NOT NULL,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- View alias untuk backward-compatibility dengan query 'system_settings'
CREATE OR REPLACE VIEW `system_settings` AS 
    SELECT `key`, `value`, `updated_at` FROM `settings`;

-- -------------------------------------------------------------------------
-- 10. TABLE: media_files
-- Metadata berkas yang diunggah secara lokal ke server hosting
-- Menggantikan ketergantungan storage pihak ketiga
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `media_files` (
    `id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `original_name` VARCHAR(255) NOT NULL,
    `stored_name` VARCHAR(255) NOT NULL,
    `file_path` VARCHAR(500) NOT NULL,
    `file_type` ENUM('image', 'audio', 'document') NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_size` BIGINT NOT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    UNIQUE KEY `uq_media_stored_name` (`stored_name`),
    INDEX `idx_media_files_user_id` (`user_id`),
    INDEX `idx_media_files_file_type` (`file_type`),
    CONSTRAINT `fk_media_files_user` FOREIGN KEY (`user_id`) 
        REFERENCES `profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =========================================================================
-- DATABASE TRIGGER: SERVER-SIDE ANSWER GRADING
-- Otomatis memvalidasi kebenaran opsi & skor di tingkat database
-- =========================================================================
DELIMITER $$

DROP TRIGGER IF EXISTS `trg_calculate_answer_score`$$
CREATE TRIGGER `trg_calculate_answer_score`
BEFORE INSERT ON `answers`
FOR EACH ROW
BEGIN
    DECLARE v_is_correct TINYINT(1) DEFAULT 0;
    DECLARE v_points INT DEFAULT 0;

    -- Evaluasi opsi jawaban tunggal jika ada
    IF NEW.selected_option_id IS NOT NULL THEN
        SELECT COALESCE(is_correct, 0) INTO v_is_correct
        FROM options
        WHERE id = NEW.selected_option_id
        LIMIT 1;

        SELECT COALESCE(points, 0) INTO v_points
        FROM questions
        WHERE id = NEW.question_id
        LIMIT 1;

        SET NEW.is_correct = v_is_correct;
        IF v_is_correct = 1 THEN
            SET NEW.score_awarded = v_points;
        ELSE
            SET NEW.score_awarded = 0;
        END IF;
    END IF;
END$$

DELIMITER ;

-- =========================================================================
-- INITIAL SEED DATA
-- Default System Settings & Administrator Profile
-- =========================================================================

-- Default Settings
INSERT INTO `settings` (`key`, `value`) VALUES
('school_name', 'SDN 012 Babakan Ciparay'),
('app_title', 'SINESA - Sistem Nilai Dan Evaluasi Siswa Aktif'),
('allow_student_registration', 'true'),
('allow_guest_participants', 'true'),
('default_question_duration', '30')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

-- Default Administrator (password: admin123 -> bcrypt hash $2y$10$w8...)
INSERT INTO `profiles` (`id`, `role`, `full_name`, `email`, `password_hash`, `username`, `status`) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', 'Administrator SINESA', 'admin@sinesa.com', '$2y$10$mB5k.2cQf4G7Mh1e9P0nXeQ6v4L5e2W1x9Z8y7V6u5T4r3Q2P1O0a', 'admin', 'active')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

SET FOREIGN_KEY_CHECKS = 1;
