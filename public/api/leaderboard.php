<?php
/**
 * SINESA REST API: Official Leaderboard & Scoring Endpoint
 * Path: /api/leaderboard.php
 *
 * Rules:
 * - Server is the SINGLE SOURCE OF TRUTH for scores and rankings.
 * - Frontend must NEVER calculate primary scores.
 * - Realtime scores are calculated atomically during answer submission.
 *
 * Handlers:
 * - GET:
 *     - /api/leaderboard?session_id=<uuid>
 *     - Optional ?limit=50 (default 50, max 200)
 */

declare(strict_types=1);

require_once __DIR__ . '/utils/response.php';
require_once __DIR__ . '/utils/request.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/jwt.php';

// Handle CORS Preflight
handle_cors_preflight();

$pdo = get_db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'GET') {
    send_error_response('Metode HTTP tidak didukung. Endpoint ini hanya menerima GET.', 405);
}

try {
    $sessionId = sanitize_string($_GET['session_id'] ?? '');
    $limit = min(200, max(1, (int)($_GET['limit'] ?? 50)));

    if ($sessionId === '') {
        send_error_response('Parameter session_id wajib disertakan.', 400);
    }

    // Verify session existence
    $sessStmt = $pdo->prepare("
        SELECT id, quiz_id, host_id, status, current_stage, current_question_index, quiz_mode, created_at
        FROM quiz_sessions 
        WHERE id = :sid 
        LIMIT 1
    ");
    $sessStmt->execute([':sid' => $sessionId]);
    $session = $sessStmt->fetch();

    if (!$session) {
        send_error_response('Sesi kuis tidak ditemukan.', 404);
    }

    // Query participants sorted by official score descending, tie-break with joined_at ascending
    $partStmt = $pdo->prepare("
        SELECT 
            p.id,
            p.session_id,
            p.student_id,
            p.display_name,
            p.score,
            p.lives,
            p.skipped_questions,
            p.question_status,
            p.current_progress,
            p.violation_count,
            p.is_completed,
            p.joined_at,
            pr.avatar_url,
            COALESCE(ans.total_answers, 0) AS total_answered,
            COALESCE(ans.correct_answers, 0) AS correct_answers,
            COALESCE(ans.avg_response_time_ms, 0) AS avg_response_time_ms
        FROM participants p
        LEFT JOIN profiles pr ON p.student_id = pr.id
        LEFT JOIN (
            SELECT 
                participant_id,
                COUNT(*) AS total_answers,
                SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct_answers,
                ROUND(AVG(response_time_ms)) AS avg_response_time_ms
            FROM answers
            GROUP BY participant_id
        ) ans ON ans.participant_id = p.id
        WHERE p.session_id = :sid
        ORDER BY p.score DESC, p.joined_at ASC
        LIMIT {$limit}
    ");
    $partStmt->execute([':sid' => $sessionId]);
    $rows = $partStmt->fetchAll();

    $rank = 1;
    $leaderboard = [];

    foreach ($rows as $row) {
        $skipped = [];
        if (!empty($row['skipped_questions'])) {
            $dec = is_string($row['skipped_questions']) ? json_decode($row['skipped_questions'], true) : $row['skipped_questions'];
            if (is_array($dec)) $skipped = $dec;
        }

        $qStatus = new stdClass();
        if (!empty($row['question_status'])) {
            $dec = is_string($row['question_status']) ? json_decode($row['question_status'], true) : $row['question_status'];
            if (is_array($dec) && !empty($dec)) $qStatus = (object)$dec;
        }

        $totalAns = (int)$row['total_answered'];
        $corrAns = (int)$row['correct_answers'];
        $accuracy = $totalAns > 0 ? round(($corrAns / $totalAns) * 100, 1) : 0.0;

        $leaderboard[] = [
            'id'                => (string)$row['id'],
            'session_id'        => (string)$row['session_id'],
            'student_id'        => $row['student_id'] !== null ? (string)$row['student_id'] : null,
            'display_name'      => (string)$row['display_name'],
            'score'             => (int)$row['score'],
            'rank'              => $rank++,
            'lives'             => (int)$row['lives'],
            'avatar_url'        => $row['avatar_url'] !== null ? (string)$row['avatar_url'] : null,
            'skipped_questions' => $skipped,
            'question_status'   => $qStatus,
            'current_progress'  => (int)$row['current_progress'],
            'violation_count'   => (int)$row['violation_count'],
            'is_completed'      => (bool)$row['is_completed'],
            'joined_at'         => (string)$row['joined_at'],
            'total_answered'    => $totalAns,
            'correct_answers'   => $corrAns,
            'accuracy_rate'     => $accuracy,
            'avg_response_time' => (int)$row['avg_response_time_ms'],
        ];
    }

    send_success_response($leaderboard);

} catch (\PDOException $e) {
    error_log('Leaderboard API Database Error: ' . $e->getMessage());
    send_error_response('Terjadi kesalahan database: ' . $e->getMessage(), 500);
} catch (\Throwable $e) {
    error_log('Leaderboard API General Error: ' . $e->getMessage());
    send_error_response('Terjadi kesalahan sistem pada leaderboard: ' . $e->getMessage(), 500);
}
