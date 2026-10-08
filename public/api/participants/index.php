<?php
/**
 * SINESA REST API: Participants Management Endpoint
 * Handlers:
 * - GET: list by session_id, get by id, get with quiz details, get by name/student_id, or get student history
 * - POST: join session with duplicate display_name detection (409 Conflict)
 * - PUT/PATCH: update score, lives, progress, skipped questions, violations, completion
 * - DELETE: remove participant (leave session)
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

/**
 * Format a participant database row into typed JSON contract
 */
function format_participant_row(array $row): array {
    $skipped = [];
    if (!empty($row['skipped_questions'])) {
        $decoded = is_string($row['skipped_questions'])
            ? json_decode($row['skipped_questions'], true)
            : $row['skipped_questions'];
        if (is_array($decoded)) {
            $skipped = $decoded;
        }
    }

    $qStatus = new stdClass();
    if (!empty($row['question_status'])) {
        $decoded = is_string($row['question_status'])
            ? json_decode($row['question_status'], true)
            : $row['question_status'];
        if (is_array($decoded) && !empty($decoded)) {
            $qStatus = (object)$decoded;
        }
    }

    return [
        'id'                => (string)$row['id'],
        'session_id'        => (string)$row['session_id'],
        'student_id'        => $row['student_id'] !== null ? (string)$row['student_id'] : null,
        'display_name'      => (string)$row['display_name'],
        'score'             => (int)($row['score'] ?? 0),
        'lives'             => (int)($row['lives'] ?? 3),
        'skipped_questions' => $skipped,
        'question_status'   => $qStatus,
        'current_progress'  => (int)($row['current_progress'] ?? 0),
        'violation_count'   => (int)($row['violation_count'] ?? 0),
        'is_completed'      => (bool)($row['is_completed'] ?? 0),
        'joined_at'         => (string)$row['joined_at'],
    ];
}

try {
    // -------------------------------------------------------------------------
    // GET: Detail, Query by Session, or History
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $id = sanitize_string($_GET['id'] ?? '');
        $sessionId = sanitize_string($_GET['session_id'] ?? '');
        $studentId = sanitize_string($_GET['student_id'] ?? '');
        $displayName = sanitize_string($_GET['display_name'] ?? '');
        $action = sanitize_string($_GET['action'] ?? '');
        $sessionIdsParam = $_GET['session_ids'] ?? null;
        $withDetails = !empty($_GET['details']) || !empty($_GET['with_quiz']);

        // 1. Participant with Quiz Details (for post-quiz summary & review)
        if ($id !== '' && $withDetails) {
            $stmt = $pdo->prepare("
                SELECT p.*,
                       s.id AS s_id, s.quiz_id AS s_quiz_id, s.host_id AS s_host_id,
                       s.status AS s_status, s.current_stage AS s_current_stage,
                       s.current_question_index AS s_current_question_index,
                       s.question_started_at AS s_question_started_at,
                       s.question_expires_at AS s_question_expires_at,
                       s.quiz_mode AS s_quiz_mode, s.lives_count AS s_lives_count,
                       s.show_final_result AS s_show_final_result,
                       s.show_leaderboard AS s_show_leaderboard,
                       s.show_correct_answer AS s_show_correct_answer,
                       s.show_answer_review AS s_show_answer_review,
                       s.show_question_result AS s_show_question_result,
                       s.show_explanation AS s_show_explanation,
                       s.show_score_per_question AS s_show_score_per_question,
                       s.show_question_statistics AS s_show_question_statistics,
                       s.anti_cheat_enabled AS s_anti_cheat_enabled,
                       s.fullscreen_required AS s_fullscreen_required,
                       s.auto_submit_on_violation AS s_auto_submit_on_violation,
                       s.created_at AS s_created_at, s.completed_at AS s_completed_at,
                       q.id AS q_id, q.title AS q_title, q.description AS q_description,
                       q.teacher_id AS q_teacher_id, q.pin_code AS q_pin_code,
                       q.duration_per_question AS q_duration_per_question,
                       q.thumbnail_url AS q_thumbnail_url
                FROM participants p
                LEFT JOIN quiz_sessions s ON p.session_id = s.id
                LEFT JOIN quizzes q ON s.quiz_id = q.id
                WHERE p.id = :id
                LIMIT 1
            ");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();

            if (!$row) {
                send_error_response('Peserta kuis tidak ditemukan.', 404);
            }

            $partFormatted = format_participant_row($row);
            $partFormatted['quiz_sessions'] = [
                'id'                       => (string)$row['s_id'],
                'quiz_id'                  => (string)$row['s_quiz_id'],
                'host_id'                  => (string)$row['s_host_id'],
                'status'                   => (string)($row['s_status'] ?? 'lobby'),
                'current_stage'            => (string)($row['s_current_stage'] ?? 'waiting'),
                'current_question_index'   => (int)($row['s_current_question_index'] ?? -1),
                'question_started_at'      => $row['s_question_started_at'] !== null ? (string)$row['s_question_started_at'] : null,
                'question_expires_at'      => $row['s_question_expires_at'] !== null ? (string)$row['s_question_expires_at'] : null,
                'quiz_mode'                => (string)($row['s_quiz_mode'] ?? 'serius'),
                'lives_count'              => (int)($row['s_lives_count'] ?? 3),
                'show_final_result'        => (bool)($row['s_show_final_result'] ?? 1),
                'show_leaderboard'         => (bool)($row['s_show_leaderboard'] ?? 1),
                'show_correct_answer'      => (bool)($row['s_show_correct_answer'] ?? 1),
                'show_answer_review'       => (bool)($row['s_show_answer_review'] ?? 1),
                'show_question_result'     => (bool)($row['s_show_question_result'] ?? 1),
                'show_explanation'         => (bool)($row['s_show_explanation'] ?? 1),
                'show_score_per_question'  => (bool)($row['s_show_score_per_question'] ?? 1),
                'show_question_statistics' => (bool)($row['s_show_question_statistics'] ?? 1),
                'anti_cheat_enabled'       => (bool)($row['s_anti_cheat_enabled'] ?? 0),
                'fullscreen_required'      => (bool)($row['s_fullscreen_required'] ?? 0),
                'auto_submit_on_violation' => (int)($row['s_auto_submit_on_violation'] ?? 3),
                'created_at'               => (string)$row['s_created_at'],
                'completed_at'             => $row['s_completed_at'] !== null ? (string)$row['s_completed_at'] : null,
                'quizzes'                  => [
                    'id'                    => (string)$row['q_id'],
                    'title'                 => (string)$row['q_title'],
                    'description'           => $row['q_description'] !== null ? (string)$row['q_description'] : null,
                    'teacher_id'            => (string)$row['q_teacher_id'],
                    'pin_code'              => (string)$row['q_pin_code'],
                    'duration_per_question' => (int)($row['q_duration_per_question'] ?? 30),
                    'thumbnail_url'         => $row['q_thumbnail_url'] !== null ? (string)$row['q_thumbnail_url'] : null,
                ],
            ];

            send_success_response($partFormatted);
        }

        // 2. Single Participant by ID
        if ($id !== '') {
            $stmt = $pdo->prepare("SELECT * FROM participants WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();

            if (!$row) {
                send_error_response('Peserta kuis tidak ditemukan.', 404);
            }

            send_success_response(format_participant_row($row));
        }

        // 3. Student Evaluation History (dashboard.tsx)
        if ($studentId !== '' && $action === 'history') {
            $stmt = $pdo->prepare("
                SELECT p.id, p.score, p.joined_at,
                       s.id AS session_id, s.completed_at,
                       s.show_final_result, s.show_answer_review,
                       q.id AS quiz_id, q.title AS quiz_title
                FROM participants p
                INNER JOIN quiz_sessions s ON p.session_id = s.id
                INNER JOIN quizzes q ON s.quiz_id = q.id
                WHERE p.student_id = :sid
                ORDER BY p.joined_at DESC
            ");
            $stmt->execute([':sid' => $studentId]);
            $historyRows = $stmt->fetchAll();

            $history = [];
            foreach ($historyRows as $h) {
                // Fetch answers count and correct answers
                $ansStmt = $pdo->prepare("SELECT id, is_correct FROM answers WHERE participant_id = :pid");
                $ansStmt->execute([':pid' => $h['id']]);
                $answers = $ansStmt->fetchAll();

                $history[] = [
                    'id'            => (string)$h['id'],
                    'score'         => (int)$h['score'],
                    'joined_at'     => (string)$h['joined_at'],
                    'quiz_sessions' => [
                        'id'                 => (string)$h['session_id'],
                        'completed_at'       => $h['completed_at'] !== null ? (string)$h['completed_at'] : null,
                        'show_final_result'  => (bool)$h['show_final_result'],
                        'show_answer_review' => (bool)$h['show_answer_review'],
                        'quizzes'            => [
                            'id'    => (string)$h['quiz_id'],
                            'title' => (string)$h['quiz_title'],
                        ],
                    ],
                    'answers'       => array_map(function($a) {
                        return [
                            'id'         => (string)$a['id'],
                            'is_correct' => (bool)$a['is_correct'],
                        ];
                    }, $answers),
                ];
            }

            send_success_response($history);
        }

        // 4. By Session ID & Display Name (maybeSingle)
        if ($sessionId !== '' && $displayName !== '') {
            $stmt = $pdo->prepare("
                SELECT * FROM participants 
                WHERE session_id = :sid AND display_name = :dname 
                LIMIT 1
            ");
            $stmt->execute([':sid' => $sessionId, ':dname' => $displayName]);
            $row = $stmt->fetch();

            if (!$row) {
                send_success_response(null);
            }
            send_success_response(format_participant_row($row));
        }

        // 5. By Session ID & Student ID (maybeSingle)
        if ($sessionId !== '' && $studentId !== '') {
            $stmt = $pdo->prepare("
                SELECT * FROM participants 
                WHERE session_id = :sid AND student_id = :stid 
                LIMIT 1
            ");
            $stmt->execute([':sid' => $sessionId, ':stid' => $studentId]);
            $row = $stmt->fetch();

            if (!$row) {
                send_success_response(null);
            }
            send_success_response(format_participant_row($row));
        }

        // 6. Bulk by Session IDs (ParticipantService.getParticipantsBySessionIds)
        if ($sessionIdsParam !== null) {
            $ids = is_array($sessionIdsParam)
                ? $sessionIdsParam
                : explode(',', (string)$sessionIdsParam);
            $cleanIds = array_values(array_filter(array_map('sanitize_string', $ids)));

            if (empty($cleanIds)) {
                send_success_response([]);
            }

            $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
            $stmt = $pdo->prepare("SELECT * FROM participants WHERE session_id IN ($placeholders) ORDER BY joined_at ASC");
            $stmt->execute($cleanIds);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_participant_row', $rows));
        }

        // 7. All participants for a session (Session lobby or leaderboard)
        if ($sessionId !== '') {
            $stmt = $pdo->prepare("
                SELECT * FROM participants 
                WHERE session_id = :sid 
                ORDER BY score DESC, joined_at ASC
            ");
            $stmt->execute([':sid' => $sessionId]);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_participant_row', $rows));
        }

        send_error_response('Parameter session_id, id, atau student_id wajib disertakan.', 400);
    }

    // -------------------------------------------------------------------------
    // POST: Join Session
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $input = get_json_input();
        $sessionId = sanitize_string($input['session_id'] ?? '');
        $displayName = sanitize_string($input['display_name'] ?? '');
        $studentId = isset($input['student_id']) && $input['student_id'] !== ''
            ? sanitize_string((string)$input['student_id'])
            : null;

        if ($sessionId === '' || $displayName === '') {
            send_error_response('ID Sesi (session_id) dan nama tampilan (display_name) wajib diisi.', 400);
        }

        // 1. Verify session exists
        $sessStmt = $pdo->prepare("SELECT id, status FROM quiz_sessions WHERE id = :sid LIMIT 1");
        $sessStmt->execute([':sid' => $sessionId]);
        $session = $sessStmt->fetch();

        if (!$session) {
            send_error_response('Sesi kuis tidak ditemukan.', 404);
        }

        if ($session['status'] === 'completed') {
            send_error_response('Sesi kuis telah berakhir dan tidak menerima peserta baru.', 400);
        }

        // 2. Check for duplicate display_name in the same session
        $dupStmt = $pdo->prepare("
            SELECT * FROM participants 
            WHERE session_id = :sid AND display_name = :dname 
            LIMIT 1
        ");
        $dupStmt->execute([':sid' => $sessionId, ':dname' => $displayName]);
        $existingPart = $dupStmt->fetch();

        if ($existingPart) {
            // If the existing participant matches the student_id or user is reconnecting
            if ($studentId && $existingPart['student_id'] === $studentId) {
                send_success_response(format_participant_row($existingPart));
            }

            // Conflict: display name is already taken in this lobby
            send_error_response([
                'message' => 'Nama tampilan sudah digunakan di lobby ini.',
                'code'    => '23505',
            ], 409);
        }

        // 3. Insert new participant
        $id = sanitize_string($input['id'] ?? generate_uuid());
        $score = (int)($input['score'] ?? 0);
        $lives = isset($input['lives']) ? (int)$input['lives'] : 3;

        $skippedQuestions = isset($input['skipped_questions']) && is_array($input['skipped_questions'])
            ? json_encode($input['skipped_questions'])
            : '[]';

        $questionStatus = isset($input['question_status']) && (is_array($input['question_status']) || is_object($input['question_status']))
            ? json_encode($input['question_status'])
            : '{}';

        $currentProgress = (int)($input['current_progress'] ?? 0);
        $violationCount  = (int)($input['violation_count'] ?? 0);
        $isCompleted     = !empty($input['is_completed']) ? 1 : 0;

        $insSql = "
            INSERT INTO participants (
                id, session_id, student_id, display_name, score, lives,
                skipped_questions, question_status, current_progress, violation_count,
                is_completed, joined_at
            ) VALUES (
                :id, :session_id, :student_id, :display_name, :score, :lives,
                :skipped_questions, :question_status, :current_progress, :violation_count,
                :is_completed, NOW()
            )
        ";

        $insStmt = $pdo->prepare($insSql);
        $insStmt->execute([
            ':id'                => $id,
            ':session_id'        => $sessionId,
            ':student_id'        => $studentId,
            ':display_name'      => $displayName,
            ':score'             => $score,
            ':lives'             => $lives,
            ':skipped_questions' => $skippedQuestions,
            ':question_status'   => $questionStatus,
            ':current_progress'  => $currentProgress,
            ':violation_count'   => $violationCount,
            ':is_completed'      => $isCompleted,
        ]);

        $selStmt = $pdo->prepare("SELECT * FROM participants WHERE id = :id LIMIT 1");
        $selStmt->execute([':id' => $id]);
        $newPart = $selStmt->fetch();

        send_json_response(format_participant_row($newPart), 201);
    }

    // -------------------------------------------------------------------------
    // PUT/PATCH: Update Participant
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || $method === 'PATCH') {
        $input = get_json_input();
        $id = sanitize_string($_GET['id'] ?? $input['id'] ?? '');

        if ($id === '') {
            send_error_response('ID peserta (id) wajib disertakan.', 400);
        }

        // Verify participant exists
        $chkStmt = $pdo->prepare("SELECT * FROM participants WHERE id = :id LIMIT 1");
        $chkStmt->execute([':id' => $id]);
        $existing = $chkStmt->fetch();

        if (!$existing) {
            send_error_response('Peserta kuis tidak ditemukan.', 404);
        }

        $fields = [];
        $params = [':id' => $id];

        if (isset($input['score'])) {
            $fields[] = "`score` = :score";
            $params[':score'] = (int)$input['score'];
        }

        if (isset($input['lives'])) {
            $fields[] = "`lives` = :lives";
            $params[':lives'] = (int)$input['lives'];
        }

        if (array_key_exists('student_id', $input)) {
            $fields[] = "`student_id` = :student_id";
            $params[':student_id'] = $input['student_id'] !== null ? sanitize_string((string)$input['student_id']) : null;
        }

        if (isset($input['display_name'])) {
            $fields[] = "`display_name` = :display_name";
            $params[':display_name'] = sanitize_string((string)$input['display_name']);
        }

        if (array_key_exists('skipped_questions', $input)) {
            $fields[] = "`skipped_questions` = :skipped_questions";
            $params[':skipped_questions'] = is_array($input['skipped_questions'])
                ? json_encode($input['skipped_questions'])
                : '[]';
        }

        if (array_key_exists('question_status', $input)) {
            $fields[] = "`question_status` = :question_status";
            $params[':question_status'] = (is_array($input['question_status']) || is_object($input['question_status']))
                ? json_encode($input['question_status'])
                : '{}';
        }

        if (isset($input['current_progress'])) {
            $fields[] = "`current_progress` = :current_progress";
            $params[':current_progress'] = (int)$input['current_progress'];
        }

        if (isset($input['violation_count'])) {
            $fields[] = "`violation_count` = :violation_count";
            $params[':violation_count'] = (int)$input['violation_count'];
        }

        if (isset($input['is_completed'])) {
            $fields[] = "`is_completed` = :is_completed";
            $params[':is_completed'] = !empty($input['is_completed']) ? 1 : 0;
        }

        if (!empty($fields)) {
            $sql = "UPDATE participants SET " . implode(', ', $fields) . " WHERE id = :id";
            $updStmt = $pdo->prepare($sql);
            $updStmt->execute($params);
        }

        $refStmt = $pdo->prepare("SELECT * FROM participants WHERE id = :id LIMIT 1");
        $refStmt->execute([':id' => $id]);
        $updated = $refStmt->fetch();

        send_success_response(format_participant_row($updated));
    }

    // -------------------------------------------------------------------------
    // DELETE: Leave / Remove Participant
    // -------------------------------------------------------------------------
    if ($method === 'DELETE') {
        $id = sanitize_string($_GET['id'] ?? '');

        if ($id === '') {
            $input = get_json_input();
            $id = sanitize_string($input['id'] ?? '');
        }

        if ($id === '') {
            send_error_response('ID peserta (id) wajib disertakan.', 400);
        }

        $stmt = $pdo->prepare("DELETE FROM participants WHERE id = :id");
        $stmt->execute([':id' => $id]);

        send_success_response(['id' => $id, 'deleted' => true]);
    }

    send_error_response("Metode HTTP {$method} tidak didukung.", 405);

} catch (Throwable $t) {
    error_log("[SINESA_PARTICIPANT_API_ERROR] {$t->getMessage()} in {$t->getFile()}:{$t->getLine()}");
    send_error_response("Terjadi kesalahan pada pemrosesan peserta: {$t->getMessage()}", 500);
}
