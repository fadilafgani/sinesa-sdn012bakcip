<?php
/**
 * SINESA REST API: Answers Management Endpoint
 * Handlers:
 * - GET: get answers by session_id, question_id, participant_id, or participant_ids
 * - POST: delegates to submit.php for atomic server-side scoring and answer storage
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

// Route POST directly to submit.php
if ($method === 'POST') {
    require __DIR__ . '/submit.php';
    exit(0);
}

/**
 * Format answer database row into typed JSON contract
 */
function format_answer_row(array $row): array {
    $optIds = null;
    if (!empty($row['selected_option_ids'])) {
        $decoded = is_string($row['selected_option_ids'])
            ? json_decode($row['selected_option_ids'], true)
            : $row['selected_option_ids'];
        if (is_array($decoded)) {
            $optIds = $decoded;
        }
    }

    $matchingAns = null;
    if (!empty($row['matching_answers'])) {
        $decoded = is_string($row['matching_answers'])
            ? json_decode($row['matching_answers'], true)
            : $row['matching_answers'];
        if (is_array($decoded)) {
            $matchingAns = $decoded;
        }
    }

    $res = [
        'id'                  => (string)$row['id'],
        'participant_id'      => (string)$row['participant_id'],
        'question_id'         => (string)$row['question_id'],
        'selected_option_id'  => $row['selected_option_id'] !== null ? (string)$row['selected_option_id'] : null,
        'selected_option_ids' => $optIds,
        'matching_answers'    => $matchingAns,
        'is_correct'          => (bool)$row['is_correct'],
        'response_time_ms'    => (int)$row['response_time_ms'],
        'score_awarded'       => (int)$row['score_awarded'],
        'answered_at'         => (string)$row['answered_at'],
    ];

    if (isset($row['display_name'])) {
        $res['participants'] = [
            'id'           => (string)$row['participant_id'],
            'display_name' => (string)$row['display_name'],
            'session_id'   => (string)($row['session_id'] ?? ''),
        ];
    }

    return $res;
}

try {
    if ($method === 'GET') {
        $sessionId = sanitize_string($_GET['session_id'] ?? '');
        $questionId = sanitize_string($_GET['question_id'] ?? '');
        $participantId = sanitize_string($_GET['participant_id'] ?? '');
        $participantIdsParam = $_GET['participant_ids'] ?? null;

        // 1. Get answers for session & specific question (AnswerService.getAnswersForQuestion)
        if ($sessionId !== '' && $questionId !== '') {
            $stmt = $pdo->prepare("
                SELECT a.*, p.display_name, p.session_id
                FROM answers a
                INNER JOIN participants p ON a.participant_id = p.id
                WHERE p.session_id = :sid AND a.question_id = :qid
                ORDER BY a.answered_at ASC
            ");
            $stmt->execute([':sid' => $sessionId, ':qid' => $questionId]);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_answer_row', $rows));
        }

        // 2. Get answers for entire session (AnswerService.getAnswersForSession)
        if ($sessionId !== '') {
            $stmt = $pdo->prepare("
                SELECT a.*, p.display_name, p.session_id
                FROM answers a
                INNER JOIN participants p ON a.participant_id = p.id
                WHERE p.session_id = :sid
                ORDER BY a.answered_at ASC
            ");
            $stmt->execute([':sid' => $sessionId]);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_answer_row', $rows));
        }

        // 3. Get answers for single participant (AnswerService.getParticipantAnswers)
        if ($participantId !== '') {
            $stmt = $pdo->prepare("
                SELECT * FROM answers
                WHERE participant_id = :pid
                ORDER BY answered_at ASC
            ");
            $stmt->execute([':pid' => $participantId]);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_answer_row', $rows));
        }

        // 4. Get answers by list of participant IDs (AnswerService.getAnswersByParticipantIds)
        if ($participantIdsParam !== null) {
            $ids = is_array($participantIdsParam)
                ? $participantIdsParam
                : explode(',', (string)$participantIdsParam);
            $cleanIds = array_values(array_filter(array_map('sanitize_string', $ids)));

            if (empty($cleanIds)) {
                send_success_response([]);
            }

            $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
            $stmt = $pdo->prepare("
                SELECT * FROM answers 
                WHERE participant_id IN ($placeholders) 
                ORDER BY answered_at ASC
            ");
            $stmt->execute($cleanIds);
            $rows = $stmt->fetchAll();
            send_success_response(array_map('format_answer_row', $rows));
        }

        send_error_response('Parameter session_id, participant_id, atau participant_ids wajib disertakan.', 400);
    }

    send_error_response("Metode HTTP {$method} tidak didukung.", 405);

} catch (Throwable $t) {
    error_log("[SINESA_ANSWERS_API_ERROR] {$t->getMessage()} in {$t->getFile()}:{$t->getLine()}");
    send_error_response("Terjadi kesalahan pada pemrosesan jawaban: {$t->getMessage()}", 500);
}
