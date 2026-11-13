<?php
/**
 * SINESA REST API: Quiz Sessions Endpoint
 * Handlers:
 * - GET: get session by id, get active sessions for quiz, get latest active session, or list sessions
 * - POST: create session, terminate sessions by quiz_id or ids
 * - PUT/PATCH: update stage, update current question, finish session, or update settings
 * - DELETE: terminate or remove session
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Handle CORS Preflight
handle_cors_preflight();

$pdo = get_db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function format_dt_utc(?string $dtStr): ?string {
    if (!$dtStr) return null;
    $ts = strtotime($dtStr);
    if ($ts === false) return null;
    return gmdate('Y-m-d\TH:i:s\Z', $ts);
}

/**
 * Detect available columns in `quiz_sessions` table and auto-migrate missing optional columns
 * @return array<string, bool>
 */
function get_session_columns(PDO $pdo): array {
    static $columns = null;
    if ($columns !== null) {
        return $columns;
    }

    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM quiz_sessions");
        $cols = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $colMap = array_fill_keys($cols, true);

        // Attempt self-healing migration for countdown columns
        $missing = [];
        if (!isset($colMap['countdown_started_at'])) {
            $missing[] = "ADD COLUMN `countdown_started_at` DATETIME(3) NULL AFTER `current_question_index`";
        }
        if (!isset($colMap['countdown_expires_at'])) {
            $missing[] = "ADD COLUMN `countdown_expires_at` DATETIME(3) NULL AFTER `countdown_started_at`";
        }
        if (!isset($colMap['countdown_duration'])) {
            $missing[] = "ADD COLUMN `countdown_duration` INT NOT NULL DEFAULT 3 AFTER `countdown_expires_at`";
        }

        if (!empty($missing)) {
            try {
                $pdo->exec("ALTER TABLE quiz_sessions " . implode(', ', $missing));
                $stmt = $pdo->query("SHOW COLUMNS FROM quiz_sessions");
                $colMap = array_fill_keys($stmt->fetchAll(PDO::FETCH_COLUMN), true);
            } catch (Throwable $t) {
                foreach ($missing as $mSql) {
                    try {
                        $pdo->exec("ALTER TABLE quiz_sessions " . $mSql);
                    } catch (Throwable $e) {}
                }
                try {
                    $stmt = $pdo->query("SHOW COLUMNS FROM quiz_sessions");
                    $colMap = array_fill_keys($stmt->fetchAll(PDO::FETCH_COLUMN), true);
                } catch (Throwable $e) {}
            }
        }
        $columns = $colMap;
    } catch (Throwable $t) {
        $columns = [];
    }

    return $columns;
}

/**
 * Format a quiz_session database row into typed JSON contract
 */
function format_session_row(array $row): array {
    return [
        'id'                       => (string)$row['id'],
        'quiz_id'                  => (string)$row['quiz_id'],
        'host_id'                  => (string)$row['host_id'],
        'status'                   => (string)($row['status'] ?? 'lobby'),
        'current_stage'            => (string)($row['current_stage'] ?? 'waiting'),
        'current_question_index'   => (int)($row['current_question_index'] ?? -1),
        'countdown_started_at'     => format_dt_utc($row['countdown_started_at'] ?? null),
        'countdown_expires_at'     => format_dt_utc($row['countdown_expires_at'] ?? null),
        'countdown_duration'       => (int)($row['countdown_duration'] ?? 3),
        'server_time'              => round(microtime(true) * 1000),
        'question_started_at'      => format_dt_utc($row['question_started_at'] ?? null),
        'question_expires_at'      => format_dt_utc($row['question_expires_at'] ?? null),
        'quiz_mode'                => (string)($row['quiz_mode'] ?? 'serius'),
        'lives_count'              => (int)($row['lives_count'] ?? 3),
        'show_final_result'        => (bool)($row['show_final_result'] ?? 1),
        'show_leaderboard'         => (bool)($row['show_leaderboard'] ?? 1),
        'show_correct_answer'      => (bool)($row['show_correct_answer'] ?? 1),
        'show_answer_review'       => (bool)($row['show_answer_review'] ?? 1),
        'show_question_result'     => (bool)($row['show_question_result'] ?? 1),
        'show_explanation'         => (bool)($row['show_explanation'] ?? 1),
        'show_score_per_question'  => (bool)($row['show_score_per_question'] ?? 1),
        'show_question_statistics' => (bool)($row['show_question_statistics'] ?? 1),
        'anti_cheat_enabled'       => (bool)($row['anti_cheat_enabled'] ?? 0),
        'fullscreen_required'      => (bool)($row['fullscreen_required'] ?? 0),
        'auto_submit_on_violation' => (int)($row['auto_submit_on_violation'] ?? 3),
        'created_at'               => (string)$row['created_at'],
        'completed_at'             => $row['completed_at'] !== null ? (string)$row['completed_at'] : null,
        'participant_count'        => (int)($row['participant_count'] ?? 0),
        'active_participant_count' => (int)($row['active_participant_count'] ?? 0),
        'total_violations'         => (int)($row['total_violations'] ?? 0),
    ];
}

try {
    // -------------------------------------------------------------------------
    // GET: Detail, Query by Quiz, or List
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $id = sanitize_string($_GET['id'] ?? '');
        $quizId = sanitize_string($_GET['quiz_id'] ?? '');
        $hostId = sanitize_string($_GET['host_id'] ?? '');
        $statusParam = sanitize_string($_GET['status'] ?? '');
        $latestActive = !empty($_GET['latest_active']);
        $fields = sanitize_string($_GET['fields'] ?? '');

        // Base select columns including subqueries for participant count and violations
        $sessionSelectCols = "
            s.*,
            (SELECT COUNT(*) FROM participants WHERE session_id = s.id) AS participant_count,
            (SELECT COUNT(*) FROM participants WHERE session_id = s.id AND is_completed = 0) AS active_participant_count,
            (SELECT COALESCE(SUM(violation_count), 0) FROM participants WHERE session_id = s.id) AS total_violations
        ";

        // 1. Get single session by ID
        if ($id !== '') {
            $stmt = $pdo->prepare("SELECT {$sessionSelectCols}, q.teacher_id FROM quiz_sessions s LEFT JOIN quizzes q ON s.quiz_id = q.id WHERE s.id = :id LIMIT 1");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();

            if (!$row) {
                send_error_response('Sesi kuis tidak ditemukan.', 404);
            }

            // Authorization: If user is teacher, enforce ownership (host_id or quiz teacher_id must match)
            $auth = get_optional_auth();
            $userId = (string)($auth['sub'] ?? '');
            $userRole = (string)($auth['role'] ?? '');

            if ($userRole === 'teacher' && (string)$row['host_id'] !== $userId && (string)($row['teacher_id'] ?? '') !== $userId) {
                send_error_response('Akses ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.', 403);
            }

            $formatted = format_session_row($row);

            // Optional: attach detailed participants list for monitoring view
            if (!empty($_GET['with_participants']) || !empty($_GET['monitoring'])) {
                $pStmt = $pdo->prepare("SELECT * FROM participants WHERE session_id = :sid ORDER BY score DESC, joined_at ASC");
                $pStmt->execute([':sid' => $id]);
                $pRows = $pStmt->fetchAll();
                $formatted['participants'] = array_map(function($p) {
                    return [
                        'id'                => (string)$p['id'],
                        'session_id'        => (string)$p['session_id'],
                        'student_id'        => $p['student_id'] !== null ? (string)$p['student_id'] : null,
                        'display_name'      => (string)$p['display_name'],
                        'score'             => (int)($p['score'] ?? 0),
                        'lives'             => (int)($p['lives'] ?? 3),
                        'current_progress'  => (int)($p['current_progress'] ?? 0),
                        'violation_count'   => (int)($p['violation_count'] ?? 0),
                        'is_completed'      => (bool)($p['is_completed'] ?? 0),
                        'joined_at'         => (string)$p['joined_at'],
                    ];
                }, $pRows);
                $formatted['participant_count'] = count($formatted['participants']);
                $formatted['active_participant_count'] = count(array_filter($formatted['participants'], fn($p) => !$p['is_completed']));
                $formatted['total_violations'] = array_sum(array_column($formatted['participants'], 'violation_count'));

                // Fetch violation logs for this session
                $vStmt = $pdo->prepare("
                    SELECT id, user_id, action, details, created_at
                    FROM activity_logs
                    WHERE action = 'CHEAT_VIOLATION' AND details LIKE :sdet
                    ORDER BY created_at DESC
                ");
                $vStmt->execute([':sdet' => "%Sesi: {$id}%"]);
                $vRows = $vStmt->fetchAll();

                $violationsList = [];
                foreach ($vRows as $vr) {
                    $details = (string)$vr['details'];
                    $studentName = 'Peserta';
                    if (preg_match("/Peserta '([^']+)'/", $details, $m)) {
                        $studentName = $m[1];
                    }
                    $reason = 'Pelanggaran anti-cheat';
                    if (preg_match("/anti-cheat:\s*(.*?)\s*\(Sesi:/", $details, $m)) {
                        $reason = $m[1];
                    }
                    $count = 1;
                    if (preg_match("/Ke-(\d+)/", $details, $m)) {
                        $count = (int)$m[1];
                    }

                    $violationsList[] = [
                        'id'           => (string)$vr['id'],
                        'student_id'   => $vr['user_id'] !== null ? (string)$vr['user_id'] : null,
                        'student_name' => $studentName,
                        'reason'       => $reason,
                        'count'        => $count,
                        'status'       => 'Terkonfirmasi di Server',
                        'created_at'   => (string)$vr['created_at'],
                    ];
                }
                $formatted['violations'] = $violationsList;
            }

            send_success_response($formatted);
        }

        // Check ownership when a teacher queries by quiz_id
        $auth = get_optional_auth();
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        if ($quizId !== '' && $userRole === 'teacher') {
            $qAuthStmt = $pdo->prepare("SELECT teacher_id FROM quizzes WHERE id = :qid LIMIT 1");
            $qAuthStmt->execute([':qid' => $quizId]);
            $quizMeta = $qAuthStmt->fetch();
            if ($quizMeta && (string)$quizMeta['teacher_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda tidak memiliki izin untuk mengakses sesi kuis ini.', 403);
            }
        }

        // 2. Query session IDs for a quiz (SessionService.getQuizSessionIds)
        if ($quizId !== '' && $fields === 'id') {
            $stmt = $pdo->prepare("SELECT id FROM quiz_sessions WHERE quiz_id = :quiz_id");
            $stmt->execute([':quiz_id' => $quizId]);
            $rows = $stmt->fetchAll();
            $result = array_map(function($r) { return ['id' => (string)$r['id']]; }, $rows);
            send_success_response($result);
        }

        // 3. Query latest active session for quiz (SessionService.getLatestActiveSession)
        if ($quizId !== '' && ($latestActive || (empty($hostId) && ($statusParam === 'active' || strpos($statusParam, 'lobby') !== false)))) {
            $stmt = $pdo->prepare("
                SELECT {$sessionSelectCols} FROM quiz_sessions s 
                WHERE s.quiz_id = :quiz_id AND s.status IN ('lobby', 'active')
                ORDER BY s.created_at DESC 
                LIMIT 1
            ");
            $stmt->execute([':quiz_id' => $quizId]);
            $row = $stmt->fetch();

            if (!$row) {
                send_success_response(null);
            }
            send_success_response(format_session_row($row));
        }

        // 4. Query active sessions for quiz by host (SessionService.getActiveSessionsForQuiz)
        if ($quizId !== '' && $hostId !== '') {
            $stmt = $pdo->prepare("
                SELECT {$sessionSelectCols} FROM quiz_sessions s 
                WHERE s.quiz_id = :quiz_id AND s.host_id = :host_id AND s.status IN ('lobby', 'active')
                ORDER BY s.created_at DESC
            ");
            $stmt->execute([':quiz_id' => $quizId, ':host_id' => $hostId]);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_session_row', $rows));
        }

        // 5. Query sessions for quiz
        if ($quizId !== '') {
            $stmt = $pdo->prepare("
                SELECT {$sessionSelectCols} FROM quiz_sessions s 
                WHERE s.quiz_id = :quiz_id 
                ORDER BY s.created_at DESC
            ");
            $stmt->execute([':quiz_id' => $quizId]);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_session_row', $rows));
        }

        // 6. General listing (Admin or Host history)
        $auth = get_optional_auth();
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        if ($userRole === 'admin') {
            $stmt = $pdo->query("SELECT {$sessionSelectCols} FROM quiz_sessions s ORDER BY s.created_at DESC LIMIT 100");
        } elseif ($userId !== '') {
            $stmt = $pdo->prepare("SELECT {$sessionSelectCols} FROM quiz_sessions s WHERE s.host_id = :host_id ORDER BY s.created_at DESC LIMIT 100");
            $stmt->execute([':host_id' => $userId]);
        } else {
            $stmt = $pdo->query("SELECT {$sessionSelectCols} FROM quiz_sessions s WHERE s.status IN ('lobby', 'active') ORDER BY s.created_at DESC LIMIT 50");
        }

        $rows = $stmt->fetchAll();
        send_success_response(array_map('format_session_row', $rows));
    }

    // -------------------------------------------------------------------------
    // POST: Create Session or Terminate
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $input = get_json_input();
        $action = sanitize_string($_GET['action'] ?? $input['action'] ?? '');

        // Sub-handler: Terminate sessions by quiz_id
        if ($action === 'terminate') {
            $quizId = sanitize_string($input['quiz_id'] ?? $_GET['quiz_id'] ?? '');
            if ($quizId === '') {
                send_error_response('Parameter quiz_id wajib diisi untuk mengakhiri sesi.', 400);
            }
            $auth = require_role(['teacher', 'admin']);
            $userId = (string)($auth['sub'] ?? '');
            $userRole = (string)($auth['role'] ?? '');

            if ($userRole === 'teacher') {
                $qStmt = $pdo->prepare("SELECT teacher_id FROM quizzes WHERE id = :qid LIMIT 1");
                $qStmt->execute([':qid' => $quizId]);
                $quizRow = $qStmt->fetch();
                if ($quizRow && (string)$quizRow['teacher_id'] !== $userId) {
                    send_error_response('Akses ditolak. Anda tidak memiliki izin untuk mengakhiri sesi kuis milik guru lain.', 403);
                }
            }

            $now = date('Y-m-d H:i:s');
            $stmt = $pdo->prepare("
                UPDATE quiz_sessions 
                SET status = 'completed', completed_at = :now 
                WHERE quiz_id = :quiz_id AND status IN ('lobby', 'active')
            ");
            $stmt->execute([':now' => $now, ':quiz_id' => $quizId]);
            $pdo->prepare("
                UPDATE participants 
                SET is_completed = 1 
                WHERE session_id IN (SELECT id FROM quiz_sessions WHERE quiz_id = :quiz_id) AND is_completed = 0
            ")->execute([':quiz_id' => $quizId]);
            send_success_response(['terminated' => $stmt->rowCount()]);
        }

        // Sub-handler: Terminate sessions by specific IDs
        if ($action === 'terminate_by_ids') {
            $ids = $input['ids'] ?? [];
            if (!is_array($ids) || empty($ids)) {
                send_error_response('Daftar ID sesi wajib berupa array dan tidak boleh kosong.', 400);
            }
            $auth = require_role(['teacher', 'admin']);
            $userId = (string)($auth['sub'] ?? '');
            $userRole = (string)($auth['role'] ?? '');

            $now = date('Y-m-d H:i:s');
            $cleanIds = array_values(array_filter(array_map('sanitize_string', $ids)));
            if (empty($cleanIds)) {
                send_success_response(['terminated' => 0]);
            }
            $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
            if ($userRole === 'teacher') {
                $stmt = $pdo->prepare("
                    UPDATE quiz_sessions 
                    SET status = 'completed', completed_at = ? 
                    WHERE id IN ($placeholders) AND host_id = ?
                ");
                $stmt->execute(array_merge([$now], $cleanIds, [$userId]));
            } else {
                $stmt = $pdo->prepare("
                    UPDATE quiz_sessions 
                    SET status = 'completed', completed_at = ? 
                    WHERE id IN ($placeholders)
                ");
                $stmt->execute(array_merge([$now], $cleanIds));
            }
            send_success_response(['terminated' => $stmt->rowCount()]);
        }

        // Normal handler: Create Quiz Session
        $auth = require_role(['teacher', 'admin']);
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        $quizId = sanitize_string($input['quiz_id'] ?? '');
        if ($quizId === '') {
            send_error_response('Parameter quiz_id wajib diisi.', 400);
        }

        // Verify quiz existence
        $qStmt = $pdo->prepare("SELECT * FROM quizzes WHERE id = :qid LIMIT 1");
        $qStmt->execute([':qid' => $quizId]);
        $quiz = $qStmt->fetch();
        if (!$quiz) {
            send_error_response('Kuis tidak ditemukan dalam database.', 404);
        }

        // Ownership enforcement: Teacher can only host their own quiz
        if ($userRole === 'teacher' && $quiz['teacher_id'] !== $userId) {
            send_error_response('Akses ditolak. Anda tidak memiliki izin untuk memandu kuis milik guru lain.', 403);
        }

        // Host ID: user or overridden by admin
        $hostId = ($userRole === 'admin' && !empty($input['host_id']))
            ? sanitize_string((string)$input['host_id'])
            : $userId;

        $id = sanitize_string($input['id'] ?? generate_uuid());
        $rawStatus = $input['status'] ?? 'lobby';
        $status = in_array($rawStatus, ['lobby', 'active', 'completed'], true) ? (string)$rawStatus : 'lobby';

        $rawStage = $input['current_stage'] ?? 'waiting';
        $currentStage = in_array($rawStage, ['waiting', 'countdown', 'question', 'question_result', 'leaderboard', 'finished'], true) ? (string)$rawStage : 'waiting';

        $currentQuestionIndex = isset($input['current_question_index']) ? (int)$input['current_question_index'] : -1;
        $rawMode = $input['quiz_mode'] ?? ($quiz['quiz_mode'] ?? 'serius');
        $quizMode = in_array($rawMode, ['serius', 'santai'], true) ? (string)$rawMode : 'serius';
        $livesCount = isset($input['lives_count']) ? (int)$input['lives_count'] : (int)($quiz['lives_count'] ?? 3);

        $showFinalResult        = isset($input['show_final_result']) ? ($input['show_final_result'] ? 1 : 0) : (int)($quiz['show_final_result'] ?? 1);
        $showLeaderboard        = isset($input['show_leaderboard']) ? ($input['show_leaderboard'] ? 1 : 0) : (int)($quiz['show_leaderboard'] ?? 1);
        $showCorrectAnswer      = isset($input['show_correct_answer']) ? ($input['show_correct_answer'] ? 1 : 0) : (int)($quiz['show_correct_answer'] ?? 1);
        $showAnswerReview       = isset($input['show_answer_review']) ? ($input['show_answer_review'] ? 1 : 0) : (int)($quiz['show_answer_review'] ?? 1);
        $showQuestionResult     = isset($input['show_question_result']) ? ($input['show_question_result'] ? 1 : 0) : (int)($quiz['show_question_result'] ?? 1);
        $showExplanation        = isset($input['show_explanation']) ? ($input['show_explanation'] ? 1 : 0) : (int)($quiz['show_explanation'] ?? 1);
        $showScorePerQuestion   = isset($input['show_score_per_question']) ? ($input['show_score_per_question'] ? 1 : 0) : (int)($quiz['show_score_per_question'] ?? 1);
        $showQuestionStatistics = isset($input['show_question_statistics']) ? ($input['show_question_statistics'] ? 1 : 0) : (int)($quiz['show_question_statistics'] ?? 1);
        $antiCheatEnabled       = isset($input['anti_cheat_enabled']) ? ($input['anti_cheat_enabled'] ? 1 : 0) : (int)($quiz['anti_cheat_enabled'] ?? 0);
        $fullscreenRequired     = isset($input['fullscreen_required']) ? ($input['fullscreen_required'] ? 1 : 0) : (int)($quiz['fullscreen_required'] ?? 0);
        $autoSubmitOnViolation  = isset($input['auto_submit_on_violation']) ? (int)$input['auto_submit_on_violation'] : (int)($quiz['auto_submit_on_violation'] ?? 3);

        $questionStartedAt = isset($input['question_started_at']) && $input['question_started_at'] !== null
            ? date('Y-m-d H:i:s', strtotime((string)$input['question_started_at']))
            : null;
        $questionExpiresAt = isset($input['question_expires_at']) && $input['question_expires_at'] !== null
            ? date('Y-m-d H:i:s', strtotime((string)$input['question_expires_at']))
            : null;

        $insertSql = "
            INSERT INTO quiz_sessions (
                id, quiz_id, host_id, status, current_stage, current_question_index,
                question_started_at, question_expires_at, quiz_mode, lives_count,
                show_final_result, show_leaderboard, show_correct_answer, show_answer_review,
                show_question_result, show_explanation, show_score_per_question, show_question_statistics,
                anti_cheat_enabled, fullscreen_required, auto_submit_on_violation,
                created_at
            ) VALUES (
                :id, :quiz_id, :host_id, :status, :current_stage, :current_question_index,
                :question_started_at, :question_expires_at, :quiz_mode, :lives_count,
                :show_final_result, :show_leaderboard, :show_correct_answer, :show_answer_review,
                :show_question_result, :show_explanation, :show_score_per_question, :show_question_statistics,
                :anti_cheat_enabled, :fullscreen_required, :auto_submit_on_violation,
                NOW()
            )
        ";

        $insStmt = $pdo->prepare($insertSql);
        $insStmt->execute([
            ':id'                       => $id,
            ':quiz_id'                  => $quizId,
            ':host_id'                  => $hostId,
            ':status'                   => $status,
            ':current_stage'            => $currentStage,
            ':current_question_index'   => $currentQuestionIndex,
            ':question_started_at'      => $questionStartedAt,
            ':question_expires_at'      => $questionExpiresAt,
            ':quiz_mode'                => $quizMode,
            ':lives_count'              => $livesCount,
            ':show_final_result'        => $showFinalResult,
            ':show_leaderboard'         => $showLeaderboard,
            ':show_correct_answer'      => $showCorrectAnswer,
            ':show_answer_review'       => $showAnswerReview,
            ':show_question_result'     => $showQuestionResult,
            ':show_explanation'         => $showExplanation,
            ':show_score_per_question'  => $showScorePerQuestion,
            ':show_question_statistics' => $showQuestionStatistics,
            ':anti_cheat_enabled'       => $antiCheatEnabled,
            ':fullscreen_required'      => $fullscreenRequired,
            ':auto_submit_on_violation' => $autoSubmitOnViolation,
        ]);

        $selStmt = $pdo->prepare("SELECT * FROM quiz_sessions WHERE id = :id LIMIT 1");
        $selStmt->execute([':id' => $id]);
        $newRow = $selStmt->fetch();

        send_json_response(format_session_row($newRow), 201);
    }

    // -------------------------------------------------------------------------
    // PUT/PATCH: Update Stage, Question, or Status
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || $method === 'PATCH') {
        $auth = require_auth();
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        if ($userRole === 'student') {
            send_error_response('Akses ditolak. Siswa tidak memiliki izin untuk mengontrol sesi kuis.', 403);
        }

        $input = get_json_input();
        $id = sanitize_string($_GET['id'] ?? $input['id'] ?? '');
        $action = sanitize_string($_GET['action'] ?? $input['action'] ?? '');

        // Handle terminate via PUT
        if ($action === 'terminate') {
            $quizId = sanitize_string($input['quiz_id'] ?? $_GET['quiz_id'] ?? '');
            if ($quizId === '') {
                send_error_response('Parameter quiz_id wajib diisi.', 400);
            }

            if ($userRole === 'teacher') {
                $qStmt = $pdo->prepare("SELECT teacher_id FROM quizzes WHERE id = :qid LIMIT 1");
                $qStmt->execute([':qid' => $quizId]);
                $qz = $qStmt->fetch();
                if ($qz && $qz['teacher_id'] !== $userId) {
                    send_error_response('Akses ditolak. Anda tidak memiliki izin untuk mengakhiri sesi kuis milik guru lain.', 403);
                }
            }

            $now = date('Y-m-d H:i:s');
            $stmt = $pdo->prepare("
                UPDATE quiz_sessions 
                SET status = 'completed', completed_at = :now 
                WHERE quiz_id = :quiz_id AND status IN ('lobby', 'active')
            ");
            $stmt->execute([':now' => $now, ':quiz_id' => $quizId]);
            $pdo->prepare("
                UPDATE participants 
                SET is_completed = 1 
                WHERE session_id IN (SELECT id FROM quiz_sessions WHERE quiz_id = :quiz_id) AND is_completed = 0
            ")->execute([':quiz_id' => $quizId]);
            send_success_response(['terminated' => $stmt->rowCount()]);
        }

        if ($action === 'terminate_by_ids') {
            $ids = $input['ids'] ?? [];
            if (!is_array($ids) || empty($ids)) {
                send_error_response('Daftar ID sesi wajib berupa array.', 400);
            }
            $now = date('Y-m-d H:i:s');
            $cleanIds = array_values(array_filter(array_map('sanitize_string', $ids)));
            if (empty($cleanIds)) {
                send_success_response(['terminated' => 0]);
            }
            $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
            $stmt = $pdo->prepare("
                UPDATE quiz_sessions 
                SET status = 'completed', completed_at = ? 
                WHERE id IN ($placeholders)
            ");
            $stmt->execute(array_merge([$now], $cleanIds));
            send_success_response(['terminated' => $stmt->rowCount()]);
        }

        if ($id === '') {
            send_error_response('ID sesi (id) wajib diisi untuk melakukan pembaruan.', 400);
        }

        // Fetch existing session
        $checkStmt = $pdo->prepare("SELECT * FROM quiz_sessions WHERE id = :id LIMIT 1");
        $checkStmt->execute([':id' => $id]);
        $existing = $checkStmt->fetch();
        if (!$existing) {
            send_error_response('Sesi kuis tidak ditemukan.', 404);
        }

        if ($userRole === 'teacher' && $existing['host_id'] !== $userId) {
            send_error_response('Akses ditolak. Anda tidak memiliki izin untuk mengontrol sesi kuis ini.', 403);
        }

        // Build dynamic fields to update
        $sessCols = get_session_columns($pdo);
        $hasCStarted  = isset($sessCols['countdown_started_at']);
        $hasCExpires  = isset($sessCols['countdown_expires_at']);
        $hasCDuration = isset($sessCols['countdown_duration']);

        $fields = [];
        $params = [':id' => $id];

        if (isset($input['status'])) {
            $statusVal = in_array($input['status'], ['lobby', 'active', 'completed'], true) ? (string)$input['status'] : 'active';
            $fields[] = "`status` = :status";
            $params[':status'] = $statusVal;
        }

        if (isset($input['current_stage'])) {
            $stageVal = in_array($input['current_stage'], ['waiting', 'countdown', 'question', 'question_result', 'leaderboard', 'finished'], true)
                ? (string)$input['current_stage']
                : 'waiting';
            $fields[] = "`current_stage` = :current_stage";
            $params[':current_stage'] = $stageVal;

            // ponytail: When switching to 'countdown', set shared countdown start and expiry timestamps on server
            if ($stageVal === 'countdown') {
                $duration = isset($input['countdown_duration']) ? max(1, min(10, (int)$input['countdown_duration'])) : 3;
                $nowMicro = microtime(true);
                $cStartedAt = isset($input['countdown_started_at']) && $input['countdown_started_at'] !== null
                    ? date('Y-m-d H:i:s.v', strtotime((string)$input['countdown_started_at']))
                    : date('Y-m-d H:i:s.v', (int)$nowMicro);
                $cExpiresAt = isset($input['countdown_expires_at']) && $input['countdown_expires_at'] !== null
                    ? date('Y-m-d H:i:s.v', strtotime((string)$input['countdown_expires_at']))
                    : date('Y-m-d H:i:s.v', (int)($nowMicro + $duration));

                if ($hasCStarted) {
                    $fields[] = "`countdown_started_at` = :countdown_started_at";
                    $params[':countdown_started_at'] = $cStartedAt;
                }
                if ($hasCExpires) {
                    $fields[] = "`countdown_expires_at` = :countdown_expires_at";
                    $params[':countdown_expires_at'] = $cExpiresAt;
                }
                if ($hasCDuration) {
                    $fields[] = "`countdown_duration` = :countdown_duration";
                    $params[':countdown_duration'] = $duration;
                }
            }
        }

        if ($hasCStarted && array_key_exists('countdown_started_at', $input) && !isset($params[':countdown_started_at'])) {
            $fields[] = "`countdown_started_at` = :countdown_started_at";
            $params[':countdown_started_at'] = $input['countdown_started_at'] !== null
                ? date('Y-m-d H:i:s.v', strtotime((string)$input['countdown_started_at']))
                : null;
        }

        if ($hasCExpires && array_key_exists('countdown_expires_at', $input) && !isset($params[':countdown_expires_at'])) {
            $fields[] = "`countdown_expires_at` = :countdown_expires_at";
            $params[':countdown_expires_at'] = $input['countdown_expires_at'] !== null
                ? date('Y-m-d H:i:s.v', strtotime((string)$input['countdown_expires_at']))
                : null;
        }

        if ($hasCDuration && isset($input['countdown_duration']) && !isset($params[':countdown_duration'])) {
            $fields[] = "`countdown_duration` = :countdown_duration";
            $params[':countdown_duration'] = max(1, min(10, (int)$input['countdown_duration']));
        }

        if (isset($input['current_question_index'])) {
            $fields[] = "`current_question_index` = :current_question_index";
            $params[':current_question_index'] = (int)$input['current_question_index'];
        }

        if (array_key_exists('question_started_at', $input)) {
            $fields[] = "`question_started_at` = :question_started_at";
            $params[':question_started_at'] = $input['question_started_at'] !== null
                ? date('Y-m-d H:i:s', strtotime((string)$input['question_started_at']))
                : null;
        }

        if (array_key_exists('question_expires_at', $input)) {
            $fields[] = "`question_expires_at` = :question_expires_at";
            $params[':question_expires_at'] = $input['question_expires_at'] !== null
                ? date('Y-m-d H:i:s', strtotime((string)$input['question_expires_at']))
                : null;
        }

        if (array_key_exists('completed_at', $input)) {
            $fields[] = "`completed_at` = :completed_at";
            $params[':completed_at'] = $input['completed_at'] !== null
                ? date('Y-m-d H:i:s', strtotime((string)$input['completed_at']))
                : null;
        }

        if (isset($input['lives_count'])) {
            $fields[] = "`lives_count` = :lives_count";
            $params[':lives_count'] = (int)$input['lives_count'];
        }

        // Handle finishSession shortcut
        if ($action === 'finish') {
            $fields[] = "`status` = 'completed'";
            $fields[] = "`current_stage` = 'finished'";
            $fields[] = "`completed_at` = NOW()";
        }

        if (empty($fields)) {
            send_success_response(format_session_row($existing));
        }

        $sql = "UPDATE quiz_sessions SET " . implode(', ', $fields) . " WHERE id = :id";
        $updStmt = $pdo->prepare($sql);
        $updStmt->execute($params);

        // Mark all participants completed when session is finished or completed
        if ($action === 'finish' || ($params[':status'] ?? '') === 'completed' || ($params[':current_stage'] ?? '') === 'finished') {
            $pdo->prepare("UPDATE participants SET is_completed = 1 WHERE session_id = :id AND is_completed = 0")->execute([':id' => $id]);
        }

        // Fetch refreshed session row
        $refStmt = $pdo->prepare("SELECT * FROM quiz_sessions WHERE id = :id LIMIT 1");
        $refStmt->execute([':id' => $id]);
        $updatedRow = $refStmt->fetch();

        send_success_response(format_session_row($updatedRow));
    }

    // -------------------------------------------------------------------------
    // DELETE: Terminate or Delete Session
    // -------------------------------------------------------------------------
    if ($method === 'DELETE') {
        $auth = require_auth();
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        if ($userRole === 'student') {
            send_error_response('Akses ditolak. Siswa tidak memiliki izin untuk menghapus atau mengakhiri sesi kuis.', 403);
        }

        $id = sanitize_string($_GET['id'] ?? '');
        $quizId = sanitize_string($_GET['quiz_id'] ?? '');

        if ($id !== '') {
            $checkStmt = $pdo->prepare("SELECT host_id FROM quiz_sessions WHERE id = :id LIMIT 1");
            $checkStmt->execute([':id' => $id]);
            $existing = $checkStmt->fetch();
            if ($existing && $userRole === 'teacher' && $existing['host_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda tidak memiliki izin untuk menghapus sesi kuis milik guru lain.', 403);
            }

            $stmt = $pdo->prepare("DELETE FROM quiz_sessions WHERE id = :id");
            $stmt->execute([':id' => $id]);
            send_success_response(['id' => $id, 'deleted' => true]);
        }

        if ($quizId !== '') {
            $qStmt = $pdo->prepare("SELECT teacher_id FROM quizzes WHERE id = :qid LIMIT 1");
            $qStmt->execute([':qid' => $quizId]);
            $qz = $qStmt->fetch();
            if ($qz && $userRole === 'teacher' && $qz['teacher_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda tidak memiliki izin untuk mengakhiri sesi kuis milik guru lain.', 403);
            }

            $now = date('Y-m-d H:i:s');
            $stmt = $pdo->prepare("
                UPDATE quiz_sessions 
                SET status = 'completed', completed_at = :now 
                WHERE quiz_id = :quiz_id AND status IN ('lobby', 'active')
            ");
            $stmt->execute([':now' => $now, ':quiz_id' => $quizId]);
            send_success_response(['quiz_id' => $quizId, 'terminated' => $stmt->rowCount()]);
        }

        send_error_response('Parameter id atau quiz_id wajib disertakan.', 400);
    }

    send_error_response("Metode HTTP {$method} tidak didukung.", 405);

} catch (Throwable $t) {
    error_log("[SINESA_SESSION_API_ERROR] {$t->getMessage()} in {$t->getFile()}:{$t->getLine()}");
    send_error_response("Terjadi kesalahan pada pemrosesan sesi kuis: {$t->getMessage()}", 500);
}
