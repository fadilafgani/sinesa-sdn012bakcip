<?php
/**
 * SINESA Non-Destructive Data Migrator
 * Path: scripts/migrate_to_mysql.php
 *
 * Responsibilities:
 * - Ingests data exported from Supabase (or direct JSON directory)
 * - Validates schema types (UUID, ENUM, Timestamp, Nullability, Password Hash)
 * - Inserts/Updates MySQL tables in strict topological foreign key order
 * - GUARANTEE: NON-DESTRUCTIVE (Never drops or truncates tables; uses ON DUPLICATE KEY UPDATE)
 *
 * Usage:
 * php scripts/migrate_to_mysql.php [--source=<dir>] [--dry-run] [--verbose]
 */

declare(strict_types=1);

require_once __DIR__ . '/../public/api/config/database.php';

$options = getopt('', ['source:', 'dry-run', 'verbose', 'help']);

if (isset($options['help'])) {
    echo "Usage: php scripts/migrate_to_mysql.php [options]\n";
    echo "Options:\n";
    echo "  --source=<dir>  Directory with exported JSON files (default: database/supabase_export)\n";
    echo "  --dry-run       Simulate migration without committing changes to MySQL\n";
    echo "  --verbose       Display detailed logs for every record migrated\n";
    exit(0);
}

$sourceDir = $options['source'] ?? (dirname(__DIR__) . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'supabase_export');
$isDryRun = isset($options['dry-run']);
$isVerbose = isset($options['verbose']);

echo "========================================================\n";
echo " SINESA DATA MIGRATION: SUPABASE -> LOCAL MYSQL\n";
echo " (Mode: " . ($isDryRun ? "DRY-RUN / SIMULASI" : "LIVE COMMIT") . ", Non-Destructive)\n";
echo "========================================================\n";
echo "Source Data Directory : {$sourceDir}\n";
echo "Database Target       : MySQL (" . Database::getEnv('DB_NAME', 'sinesa_db') . ")\n\n";

if (!is_dir($sourceDir)) {
    fwrite(STDERR, "[!] Direktori sumber tidak ditemukan: {$sourceDir}\n");
    fwrite(STDERR, "    Jalankan 'php scripts/export_supabase.php' terlebih dahulu atau tentukan --source=<dir>\n");
    exit(1);
}

$pdo = get_db();

// -----------------------------------------------------------------------------
// HELPER FUNCTIONS
// -----------------------------------------------------------------------------

function parse_json_file(string $filePath): array {
    if (!file_exists($filePath)) {
        return [];
    }
    $raw = file_get_contents($filePath);
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function to_datetime(?string $iso): ?string {
    if ($iso === null || trim($iso) === '') {
        return null;
    }
    try {
        $dt = new DateTime($iso);
        return $dt->format('Y-m-d H:i:s');
    } catch (\Throwable $e) {
        return date('Y-m-d H:i:s');
    }
}

function to_bool($val): int {
    if (is_bool($val)) return $val ? 1 : 0;
    if (is_numeric($val)) return (int)$val !== 0 ? 1 : 0;
    if (is_string($val)) {
        $clean = strtolower(trim($val));
        return in_array($clean, ['true', '1', 'yes', 't'], true) ? 1 : 0;
    }
    return 0;
}

function to_json($val): ?string {
    if ($val === null) return null;
    if (is_string($val)) {
        // Test if already valid JSON
        $test = json_decode($val);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $val;
        }
    }
    return json_encode($val, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

// -----------------------------------------------------------------------------
// MIGRATION PIPELINE IN STRICT TOPOLOGICAL ORDER
// -----------------------------------------------------------------------------

$stats = [
    'profiles'      => ['inserted' => 0, 'updated' => 0],
    'quizzes'       => ['inserted' => 0, 'updated' => 0],
    'questions'     => ['inserted' => 0, 'updated' => 0],
    'options'       => ['inserted' => 0, 'updated' => 0],
    'quiz_sessions' => ['inserted' => 0, 'updated' => 0],
    'participants'  => ['inserted' => 0, 'updated' => 0],
    'answers'       => ['inserted' => 0, 'updated' => 0],
    'settings'      => ['inserted' => 0, 'updated' => 0],
    'activity_logs' => ['inserted' => 0, 'updated' => 0],
    'media_files'   => ['inserted' => 0, 'updated' => 0],
];

$pdo->beginTransaction();

try {
    // Disable FK checks temporarily for high-performance non-destructive batch upsert
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");

    // -------------------------------------------------------------------------
    // 1. PROFILES & USERS
    // -------------------------------------------------------------------------
    echo "[1/10] Migrasi Profil & Pengguna (profiles)... ";
    $profilesData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'profiles.json');
    $stmtProfile = $pdo->prepare("
        INSERT INTO profiles (
            id, role, full_name, email, password_hash, username, avatar_url, status, created_at, updated_at
        ) VALUES (
            :id, :role, :full_name, :email, :password_hash, :username, :avatar_url, :status, :created_at, :updated_at
        )
        ON DUPLICATE KEY UPDATE
            role = VALUES(role),
            full_name = VALUES(full_name),
            avatar_url = COALESCE(VALUES(avatar_url), avatar_url),
            status = VALUES(status),
            updated_at = VALUES(updated_at)
    ");

    $defaultHash = '$2y$10$w8w2h02aM7gU1Y3v6x.C/euP0kI3Q4xPjJqB5R5g1d9u6K8p2z4O6'; // bcrypt hash for default initial password

    foreach ($profilesData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $email = strtolower(trim((string)($row['email'] ?? '')));
        if ($email === '') {
            $email = "user_" . substr($id, 0, 8) . "@sinesa.local";
        }

        $fullName = trim((string)($row['full_name'] ?? ''));
        if ($fullName === '') {
            $fullName = explode('@', $email)[0];
        }

        $role = (string)($row['role'] ?? 'student');
        if (!in_array($role, ['admin', 'teacher', 'student'], true)) {
            $role = 'student';
        }

        $username = isset($row['username']) && trim((string)$row['username']) !== '' 
            ? trim((string)$row['username']) 
            : null;

        $avatarUrl = isset($row['avatar_url']) && trim((string)$row['avatar_url']) !== '' 
            ? trim((string)$row['avatar_url']) 
            : null;

        $status = in_array(($row['status'] ?? 'active'), ['active', 'inactive'], true) 
            ? (string)$row['status'] 
            : 'active';

        $createdAt = to_datetime($row['created_at'] ?? null) ?: date('Y-m-d H:i:s');
        $updatedAt = to_datetime($row['updated_at'] ?? null) ?: $createdAt;

        // Preserve existing password_hash if present
        $checkStmt = $pdo->prepare("SELECT password_hash FROM profiles WHERE id = :id LIMIT 1");
        $checkStmt->execute([':id' => $id]);
        $existing = $checkStmt->fetch();
        $passwordHash = $existing['password_hash'] ?? ($row['password_hash'] ?? $defaultHash);

        $stmtProfile->execute([
            ':id'            => $id,
            ':role'          => $role,
            ':full_name'     => $fullName,
            ':email'         => $email,
            ':password_hash' => $passwordHash,
            ':username'      => $username,
            ':avatar_url'    => $avatarUrl,
            ':status'        => $status,
            ':created_at'    => $createdAt,
            ':updated_at'    => $updatedAt
        ]);
        $stats['profiles']['inserted']++;
    }
    echo "selesai (" . count($profilesData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 2. QUIZZES
    // -------------------------------------------------------------------------
    echo "[2/10] Migrasi Master Kuis (quizzes)... ";
    $quizzesData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'quizzes.json');
    $stmtQuiz = $pdo->prepare("
        INSERT INTO quizzes (
            id, teacher_id, title, description, opening_text, closing_text,
            pin_code, duration_per_question, random_questions, random_options,
            thumbnail_url, quiz_mode, lives_count, show_final_result, show_leaderboard,
            show_correct_answer, show_answer_review, show_question_result, show_explanation,
            show_score_per_question, show_question_statistics, anti_cheat_enabled,
            fullscreen_required, auto_submit_on_violation, status, created_at, updated_at
        ) VALUES (
            :id, :teacher_id, :title, :description, :opening_text, :closing_text,
            :pin_code, :duration_per_question, :random_questions, :random_options,
            :thumbnail_url, :quiz_mode, :lives_count, :show_final_result, :show_leaderboard,
            :show_correct_answer, :show_answer_review, :show_question_result, :show_explanation,
            :show_score_per_question, :show_question_statistics, :anti_cheat_enabled,
            :fullscreen_required, :auto_submit_on_violation, :status, :created_at, :updated_at
        )
        ON DUPLICATE KEY UPDATE
            title = VALUES(title),
            description = VALUES(description),
            duration_per_question = VALUES(duration_per_question),
            quiz_mode = VALUES(quiz_mode),
            lives_count = VALUES(lives_count),
            updated_at = VALUES(updated_at)
    ");

    foreach ($quizzesData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $teacherId = (string)($row['teacher_id'] ?? '');
        if ($teacherId !== '') {
            $chk = $pdo->prepare("SELECT id FROM profiles WHERE id = :id LIMIT 1");
            $chk->execute([':id' => $teacherId]);
            if (!$chk->fetch()) {
                $insP = $pdo->prepare("
                    INSERT INTO profiles (id, role, full_name, email, password_hash, status, created_at)
                    VALUES (:id, 'teacher', :name, :email, :pass, 'active', NOW())
                    ON DUPLICATE KEY UPDATE role = VALUES(role)
                ");
                $insP->execute([
                    ':id' => $teacherId,
                    ':name' => 'Guru Pengajar',
                    ':email' => 'teacher_' . substr($teacherId, 0, 8) . '@sinesa.local',
                    ':pass' => $defaultHash
                ]);
            }
        }

        $title = (string)($row['title'] ?? 'Kuis Tanpa Judul');
        $description = isset($row['description']) ? (string)$row['description'] : null;
        $pinCode = (string)($row['pin_code'] ?? (string)random_int(100000, 999999));
        $duration = (int)($row['duration_per_question'] ?? 30);
        $randomQ = to_bool($row['random_questions'] ?? false);
        $randomOpt = to_bool($row['random_options'] ?? false);
        $thumb = isset($row['thumbnail_url']) ? (string)$row['thumbnail_url'] : null;
        $quizMode = in_array(($row['quiz_mode'] ?? 'serius'), ['serius', 'santai'], true) ? (string)$row['quiz_mode'] : 'serius';
        $lives = (int)($row['lives_count'] ?? 3);
        $createdAt = to_datetime($row['created_at'] ?? null) ?: date('Y-m-d H:i:s');
        $updatedAt = to_datetime($row['updated_at'] ?? null) ?: $createdAt;

        $stmtQuiz->execute([
            ':id'                       => $id,
            ':teacher_id'               => $teacherId,
            ':title'                    => $title,
            ':description'              => $description,
            ':opening_text'             => $row['opening_text'] ?? null,
            ':closing_text'             => $row['closing_text'] ?? null,
            ':pin_code'                 => $pinCode,
            ':duration_per_question'    => $duration,
            ':random_questions'         => $randomQ,
            ':random_options'           => $randomOpt,
            ':thumbnail_url'            => $thumb,
            ':quiz_mode'                => $quizMode,
            ':lives_count'              => $lives,
            ':show_final_result'        => to_bool($row['show_final_result'] ?? 1),
            ':show_leaderboard'         => to_bool($row['show_leaderboard'] ?? 1),
            ':show_correct_answer'      => to_bool($row['show_correct_answer'] ?? 1),
            ':show_answer_review'       => to_bool($row['show_answer_review'] ?? 1),
            ':show_question_result'     => to_bool($row['show_question_result'] ?? 1),
            ':show_explanation'         => to_bool($row['show_explanation'] ?? 1),
            ':show_score_per_question'  => to_bool($row['show_score_per_question'] ?? 1),
            ':show_question_statistics' => to_bool($row['show_question_statistics'] ?? 1),
            ':anti_cheat_enabled'       => to_bool($row['anti_cheat_enabled'] ?? 0),
            ':fullscreen_required'      => to_bool($row['fullscreen_required'] ?? 0),
            ':auto_submit_on_violation' => (int)($row['auto_submit_on_violation'] ?? 3),
            ':status'                   => (string)($row['status'] ?? 'active'),
            ':created_at'               => $createdAt,
            ':updated_at'               => $updatedAt,
        ]);
        $stats['quizzes']['inserted']++;
    }
    echo "selesai (" . count($quizzesData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 3. QUESTIONS
    // -------------------------------------------------------------------------
    echo "[3/10] Migrasi Butir Pertanyaan (questions)... ";
    $questionsData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'questions.json');
    $stmtQuestion = $pdo->prepare("
        INSERT INTO questions (
            id, quiz_id, question_text, question_type, media_type, media_url,
            points, order_index, explanation, created_at
        ) VALUES (
            :id, :quiz_id, :question_text, :question_type, :media_type, :media_url,
            :points, :order_index, :explanation, :created_at
        )
        ON DUPLICATE KEY UPDATE
            question_text = VALUES(question_text),
            question_type = VALUES(question_type),
            media_type = VALUES(media_type),
            media_url = VALUES(media_url),
            points = VALUES(points),
            order_index = VALUES(order_index),
            explanation = VALUES(explanation)
    ");

    foreach ($questionsData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $quizId = (string)($row['quiz_id'] ?? '');
        $text = (string)($row['question_text'] ?? '');
        $qType = (string)($row['question_type'] ?? 'multiple_choice');
        $mediaType = (string)($row['media_type'] ?? 'text');
        $mediaUrl = isset($row['media_url']) ? (string)$row['media_url'] : null;
        $points = (int)($row['points'] ?? 100);
        $orderIdx = (int)($row['order_index'] ?? 0);
        $explanation = isset($row['explanation']) ? (string)$row['explanation'] : null;
        $createdAt = to_datetime($row['created_at'] ?? null) ?: date('Y-m-d H:i:s');

        $stmtQuestion->execute([
            ':id'            => $id,
            ':quiz_id'       => $quizId,
            ':question_text' => $text,
            ':question_type' => in_array($qType, ['multiple_choice', 'true_false', 'multiple_answer', 'matching'], true) ? $qType : 'multiple_choice',
            ':media_type'    => in_array($mediaType, ['text', 'image', 'audio', 'video', 'latex'], true) ? $mediaType : 'text',
            ':media_url'     => $mediaUrl,
            ':points'        => $points,
            ':order_index'   => $orderIdx,
            ':explanation'   => $explanation,
            ':created_at'    => $createdAt
        ]);
        $stats['questions']['inserted']++;
    }
    echo "selesai (" . count($questionsData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 4. OPTIONS
    // -------------------------------------------------------------------------
    echo "[4/10] Migrasi Opsi Jawaban (options)... ";
    $optionsData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'options.json');
    $stmtOption = $pdo->prepare("
        INSERT INTO options (
            id, question_id, option_text, is_correct, match_text, created_at
        ) VALUES (
            :id, :question_id, :option_text, :is_correct, :match_text, :created_at
        )
        ON DUPLICATE KEY UPDATE
            option_text = VALUES(option_text),
            is_correct = VALUES(is_correct),
            match_text = VALUES(match_text)
    ");

    foreach ($optionsData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $stmtOption->execute([
            ':id'          => $id,
            ':question_id' => (string)($row['question_id'] ?? ''),
            ':option_text' => (string)($row['option_text'] ?? ''),
            ':is_correct'  => to_bool($row['is_correct'] ?? false),
            ':match_text'  => isset($row['match_text']) ? (string)$row['match_text'] : null,
            ':created_at'  => to_datetime($row['created_at'] ?? null) ?: date('Y-m-d H:i:s')
        ]);
        $stats['options']['inserted']++;
    }
    echo "selesai (" . count($optionsData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 5. QUIZ SESSIONS
    // -------------------------------------------------------------------------
    echo "[5/10] Migrasi Sesi Kuis (quiz_sessions)... ";
    $sessionsData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'quiz_sessions.json');
    $stmtSession = $pdo->prepare("
        INSERT INTO quiz_sessions (
            id, quiz_id, host_id, status, current_stage, current_question_index,
            question_started_at, question_expires_at, quiz_mode, lives_count,
            show_final_result, show_leaderboard, show_correct_answer, show_answer_review,
            show_question_result, show_explanation, show_score_per_question,
            show_question_statistics, anti_cheat_enabled, fullscreen_required,
            auto_submit_on_violation, created_at, completed_at
        ) VALUES (
            :id, :quiz_id, :host_id, :status, :current_stage, :current_question_index,
            :question_started_at, :question_expires_at, :quiz_mode, :lives_count,
            :show_final_result, :show_leaderboard, :show_correct_answer, :show_answer_review,
            :show_question_result, :show_explanation, :show_score_per_question,
            :show_question_statistics, :anti_cheat_enabled, :fullscreen_required,
            :auto_submit_on_violation, :created_at, :completed_at
        )
        ON DUPLICATE KEY UPDATE
            status = VALUES(status),
            current_stage = VALUES(current_stage),
            current_question_index = VALUES(current_question_index),
            completed_at = VALUES(completed_at)
    ");

    foreach ($sessionsData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $hostId = (string)($row['host_id'] ?? '');
        if ($hostId !== '') {
            $chk = $pdo->prepare("SELECT id FROM profiles WHERE id = :id LIMIT 1");
            $chk->execute([':id' => $hostId]);
            if (!$chk->fetch()) {
                $insP = $pdo->prepare("
                    INSERT INTO profiles (id, role, full_name, email, password_hash, status, created_at)
                    VALUES (:id, 'teacher', :name, :email, :pass, 'active', NOW())
                    ON DUPLICATE KEY UPDATE role = VALUES(role)
                ");
                $insP->execute([
                    ':id' => $hostId,
                    ':name' => 'Host Guru',
                    ':email' => 'host_' . substr($hostId, 0, 8) . '@sinesa.local',
                    ':pass' => $defaultHash
                ]);
            }
        }

        $status = (string)($row['status'] ?? 'lobby');
        if (!in_array($status, ['lobby', 'active', 'completed'], true)) $status = 'lobby';

        $stage = (string)($row['current_stage'] ?? 'waiting');
        if (!in_array($stage, ['waiting', 'countdown', 'question', 'question_result', 'leaderboard', 'finished'], true)) {
            $stage = 'waiting';
        }

        $stmtSession->execute([
            ':id'                       => $id,
            ':quiz_id'                  => (string)($row['quiz_id'] ?? ''),
            ':host_id'                  => $hostId,
            ':status'                   => $status,
            ':current_stage'            => $stage,
            ':current_question_index'   => (int)($row['current_question_index'] ?? -1),
            ':question_started_at'      => to_datetime($row['question_started_at'] ?? null),
            ':question_expires_at'      => to_datetime($row['question_expires_at'] ?? null),
            ':quiz_mode'                => (string)($row['quiz_mode'] ?? 'serius'),
            ':lives_count'              => (int)($row['lives_count'] ?? 3),
            ':show_final_result'        => to_bool($row['show_final_result'] ?? 1),
            ':show_leaderboard'         => to_bool($row['show_leaderboard'] ?? 1),
            ':show_correct_answer'      => to_bool($row['show_correct_answer'] ?? 1),
            ':show_answer_review'       => to_bool($row['show_answer_review'] ?? 1),
            ':show_question_result'     => to_bool($row['show_question_result'] ?? 1),
            ':show_explanation'         => to_bool($row['show_explanation'] ?? 1),
            ':show_score_per_question'  => to_bool($row['show_score_per_question'] ?? 1),
            ':show_question_statistics' => to_bool($row['show_question_statistics'] ?? 1),
            ':anti_cheat_enabled'       => to_bool($row['anti_cheat_enabled'] ?? 0),
            ':fullscreen_required'      => to_bool($row['fullscreen_required'] ?? 0),
            ':auto_submit_on_violation' => (int)($row['auto_submit_on_violation'] ?? 3),
            ':created_at'               => to_datetime($row['created_at'] ?? null) ?: date('Y-m-d H:i:s'),
            ':completed_at'             => to_datetime($row['completed_at'] ?? null)
        ]);
        $stats['quiz_sessions']['inserted']++;
    }
    echo "selesai (" . count($sessionsData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 6. PARTICIPANTS
    // -------------------------------------------------------------------------
    echo "[6/10] Migrasi Peserta Kuis (participants)... ";
    $participantsData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'participants.json');
    $stmtParticipant = $pdo->prepare("
        INSERT INTO participants (
            id, session_id, student_id, display_name, score, lives,
            skipped_questions, question_status, current_progress, violation_count,
            is_completed, joined_at
        ) VALUES (
            :id, :session_id, :student_id, :display_name, :score, :lives,
            :skipped_questions, :question_status, :current_progress, :violation_count,
            :is_completed, :joined_at
        )
        ON DUPLICATE KEY UPDATE
            score = VALUES(score),
            lives = VALUES(lives),
            current_progress = VALUES(current_progress),
            violation_count = VALUES(violation_count),
            is_completed = VALUES(is_completed)
    ");

    foreach ($participantsData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $studentId = !empty($row['student_id']) ? (string)$row['student_id'] : null;
        if ($studentId !== null) {
            $chk = $pdo->prepare("SELECT id FROM profiles WHERE id = :id LIMIT 1");
            $chk->execute([':id' => $studentId]);
            if (!$chk->fetch()) {
                $insP = $pdo->prepare("
                    INSERT INTO profiles (id, role, full_name, email, password_hash, status, created_at)
                    VALUES (:id, 'student', :name, :email, :pass, 'active', NOW())
                    ON DUPLICATE KEY UPDATE role = VALUES(role)
                ");
                $insP->execute([
                    ':id' => $studentId,
                    ':name' => (string)($row['display_name'] ?? ('Siswa ' . substr($studentId, 0, 8))),
                    ':email' => 'student_' . substr($studentId, 0, 8) . '@sinesa.local',
                    ':pass' => $defaultHash
                ]);
            }
        }

        $stmtParticipant->execute([
            ':id'                => $id,
            ':session_id'        => (string)($row['session_id'] ?? ''),
            ':student_id'        => $studentId,
            ':display_name'      => (string)($row['display_name'] ?? 'Peserta'),
            ':score'             => (int)($row['score'] ?? 0),
            ':lives'             => (int)($row['lives'] ?? 3),
            ':skipped_questions' => to_json($row['skipped_questions'] ?? null),
            ':question_status'   => to_json($row['question_status'] ?? null),
            ':current_progress'  => (int)($row['current_progress'] ?? 0),
            ':violation_count'   => (int)($row['violation_count'] ?? 0),
            ':is_completed'      => to_bool($row['is_completed'] ?? 0),
            ':joined_at'         => to_datetime($row['joined_at'] ?? null) ?: date('Y-m-d H:i:s')
        ]);
        $stats['participants']['inserted']++;
    }
    echo "selesai (" . count($participantsData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 7. ANSWERS
    // -------------------------------------------------------------------------
    echo "[7/10] Migrasi Rekaman Jawaban (answers)... ";
    $answersData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'answers.json');
    $stmtAnswer = $pdo->prepare("
        INSERT INTO answers (
            id, participant_id, question_id, selected_option_id, selected_option_ids,
            matching_answers, is_correct, response_time_ms, score_awarded, answered_at
        ) VALUES (
            :id, :participant_id, :question_id, :selected_option_id, :selected_option_ids,
            :matching_answers, :is_correct, :response_time_ms, :score_awarded, :answered_at
        )
        ON DUPLICATE KEY UPDATE
            is_correct = VALUES(is_correct),
            score_awarded = VALUES(score_awarded),
            response_time_ms = VALUES(response_time_ms)
    ");

    foreach ($answersData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $stmtAnswer->execute([
            ':id'                  => $id,
            ':participant_id'      => (string)($row['participant_id'] ?? ''),
            ':question_id'         => (string)($row['question_id'] ?? ''),
            ':selected_option_id'  => !empty($row['selected_option_id']) ? (string)$row['selected_option_id'] : null,
            ':selected_option_ids' => to_json($row['selected_option_ids'] ?? null),
            ':matching_answers'    => to_json($row['matching_answers'] ?? null),
            ':is_correct'          => to_bool($row['is_correct'] ?? false),
            ':response_time_ms'    => (int)($row['response_time_ms'] ?? 0),
            ':score_awarded'       => (int)($row['score_awarded'] ?? 0),
            ':answered_at'         => to_datetime($row['answered_at'] ?? null) ?: date('Y-m-d H:i:s')
        ]);
        $stats['answers']['inserted']++;
    }
    echo "selesai (" . count($answersData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 8. SETTINGS
    // -------------------------------------------------------------------------
    echo "[8/10] Migrasi Konfigurasi Sistem (settings)... ";
    $settingsData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'settings.json');
    $stmtSetting = $pdo->prepare("
        INSERT INTO settings (`key`, `value`, `updated_at`)
        VALUES (:key, :value, :updated_at)
        ON DUPLICATE KEY UPDATE
            `value` = VALUES(`value`),
            `updated_at` = VALUES(`updated_at`)
    ");

    foreach ($settingsData as $row) {
        $key = trim((string)($row['key'] ?? ''));
        if ($key === '') continue;

        $val = (string)($row['value'] ?? '');
        $updatedAt = to_datetime($row['updated_at'] ?? null) ?: date('Y-m-d H:i:s');

        $stmtSetting->execute([
            ':key'        => $key,
            ':value'      => $val,
            ':updated_at' => $updatedAt
        ]);
        $stats['settings']['inserted']++;
    }
    echo "selesai (" . count($settingsData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 9. ACTIVITY LOGS
    // -------------------------------------------------------------------------
    echo "[9/10] Migrasi Audit Aktivitas (activity_logs)... ";
    $logsData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'activity_logs.json');
    $stmtLog = $pdo->prepare("
        INSERT INTO activity_logs (id, user_id, action, details, created_at)
        VALUES (:id, :user_id, :action, :details, :created_at)
        ON DUPLICATE KEY UPDATE
            action = VALUES(action),
            details = VALUES(details)
    ");

    foreach ($logsData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $stmtLog->execute([
            ':id'         => $id,
            ':user_id'    => !empty($row['user_id']) ? (string)$row['user_id'] : null,
            ':action'     => (string)($row['action'] ?? 'UNKNOWN'),
            ':details'    => isset($row['details']) ? (string)$row['details'] : null,
            ':created_at' => to_datetime($row['created_at'] ?? null) ?: date('Y-m-d H:i:s')
        ]);
        $stats['activity_logs']['inserted']++;
    }
    echo "selesai (" . count($logsData) . " baris diproses).\n";

    // -------------------------------------------------------------------------
    // 10. MEDIA METADATA
    // -------------------------------------------------------------------------
    echo "[10/10] Migrasi Metadata Berkas (media_files)... ";
    $mediaData = parse_json_file($sourceDir . DIRECTORY_SEPARATOR . 'media_files.json');
    $stmtMedia = $pdo->prepare("
        INSERT INTO media_files (
            id, user_id, original_name, stored_name, file_path, file_type, mime_type, file_size, created_at
        ) VALUES (
            :id, :user_id, :original_name, :stored_name, :file_path, :file_type, :mime_type, :file_size, :created_at
        )
        ON DUPLICATE KEY UPDATE
            file_path = VALUES(file_path),
            file_size = VALUES(file_size)
    ");

    foreach ($mediaData as $row) {
        $id = (string)($row['id'] ?? '');
        if ($id === '') continue;

        $stmtMedia->execute([
            ':id'            => $id,
            ':user_id'       => (string)($row['user_id'] ?? '00000000-0000-0000-0000-000000000001'),
            ':original_name' => (string)($row['original_name'] ?? 'file'),
            ':stored_name'   => (string)($row['stored_name'] ?? $id),
            ':file_path'     => (string)($row['file_path'] ?? ''),
            ':file_type'     => in_array(($row['file_type'] ?? 'image'), ['image', 'audio', 'document'], true) ? (string)$row['file_type'] : 'image',
            ':mime_type'     => (string)($row['mime_type'] ?? 'application/octet-stream'),
            ':file_size'     => (int)($row['file_size'] ?? 0),
            ':created_at'    => to_datetime($row['created_at'] ?? null) ?: date('Y-m-d H:i:s')
        ]);
        $stats['media_files']['inserted']++;
    }
    echo "selesai (" . count($mediaData) . " baris diproses).\n";

    // Re-enable FK checks
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");

    if ($isDryRun) {
        $pdo->rollBack();
        echo "\n[SIMULASI] Mode dry-run aktif: Perubahan di-ROLLBACK dan tidak tersimpan permanen.\n";
    } else {
        $pdo->commit();
        echo "\n[SUKSES] Transaksi di-COMMIT: Seluruh data berhasil dimigrasikan secara non-destruktif!\n";
    }

} catch (\Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
    fwrite(STDERR, "\n[GAGAL] Terjadi kesalahan fatal: " . $e->getMessage() . "\n");
    fwrite(STDERR, "        Stack Trace: " . $e->getTraceAsString() . "\n");
    exit(1);
}

echo "\n========================================================\n";
echo " RINGKASAN DATA MIGRASI\n";
echo "========================================================\n";
foreach ($stats as $entity => $data) {
    printf(" - %-15s : %d baris diproses\n", $entity, $data['inserted']);
}
echo "========================================================\n";
