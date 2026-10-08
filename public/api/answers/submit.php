<?php
/**
 * SINESA REST API: Atomic Answer Submission & Server-Side Scoring Endpoint
 * POST /api/answers/submit
 *
 * Server Responsibilities:
 * 1. Authenticate user / participant session
 * 2. Validate session (status, active stage, timing)
 * 3. Validate participant (belongs to session, has lives, not completed)
 * 4. Validate question (belongs to session quiz)
 * 5. Validate answer (detect duplicate submission with row lock)
 * 6. Determine correctness on server (MC, TF, MA, Matching)
 * 7. Calculate score (never trust client score)
 * 8. Update participant (score, lives, question_status, is_completed)
 * 9. Save answer
 *
 * Full ACID Transaction:
 * BEGIN TRANSACTION -> validate -> calculate -> update -> COMMIT (ROLLBACK on failure)
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

if ($method !== 'POST') {
    send_error_response("Metode HTTP {$method} tidak didukung. Endpoint ini hanya menerima POST.", 405);
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

    return [
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
}

/**
 * Format participant database row into typed JSON contract
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
    $input = get_json_input();

    // 1. INPUT SANITIZATION
    $participantId = sanitize_string($input['participant_id'] ?? '');
    $questionId    = sanitize_string($input['question_id'] ?? '');

    if ($participantId === '' || $questionId === '') {
        send_error_response('Parameter participant_id dan question_id wajib disertakan.', 400);
    }

    // 2. AUTHENTICATION & IDENTITY CHECK (Step 1)
    $auth = get_optional_auth();
    $authUserId = (string)($auth['sub'] ?? '');
    $authUserRole = (string)($auth['role'] ?? '');

    // -------------------------------------------------------------------------
    // BEGIN ATOMIC TRANSACTION
    // -------------------------------------------------------------------------
    $pdo->beginTransaction();

    // Step 2 & 3: VALIDATE PARTICIPANT & SESSION (Row Lock with FOR UPDATE)
    $partStmt = $pdo->prepare("
        SELECT p.*, s.id AS sess_id, s.quiz_id, s.status AS sess_status,
               s.current_stage, s.quiz_mode, s.lives_count,
               s.question_started_at, s.question_expires_at
        FROM participants p
        INNER JOIN quiz_sessions s ON p.session_id = s.id
        WHERE p.id = :pid
        LIMIT 1
        FOR UPDATE
    ");
    $partStmt->execute([':pid' => $participantId]);
    $participant = $partStmt->fetch();

    if (!$participant) {
        $pdo->rollBack();
        send_error_response('Data peserta kuis tidak ditemukan.', 404);
    }

    // Authorization: If participant has student_id, ensure token matches if user is authenticated
    if (!empty($participant['student_id']) && $authUserId !== '') {
        if ($authUserRole !== 'admin' && $participant['student_id'] !== $authUserId) {
            $pdo->rollBack();
            send_error_response('Otorisasi gagal: Anda tidak memiliki akses ke sesi peserta ini.', 403);
        }
    }

    // Validate Session Status
    if ($participant['sess_status'] === 'completed') {
        $pdo->rollBack();
        send_error_response('Sesi kuis telah selesai dan ditutup.', 400);
    }

    // Validate Participant State
    if (!empty($participant['is_completed'])) {
        $pdo->rollBack();
        send_error_response('Peserta telah menyelesaikan kuis ini.', 400);
    }

    $quizMode = (string)($participant['quiz_mode'] ?? 'serius');
    $initialLives = (int)($participant['lives_count'] ?? 3);
    $currentLives = (int)$participant['lives'];

    if ($quizMode === 'santai' && $initialLives > 0 && $currentLives <= 0) {
        $pdo->rollBack();
        send_error_response('Peserta telah kehabisan nyawa pada kuis ini.', 400);
    }

    // Step 4: VALIDATE QUESTION (Belongs to the Session Quiz)
    $qStmt = $pdo->prepare("
        SELECT id, quiz_id, question_text, question_type, points
        FROM questions
        WHERE id = :qid AND quiz_id = :quiz_id
        LIMIT 1
    ");
    $qStmt->execute([':qid' => $questionId, ':quiz_id' => $participant['quiz_id']]);
    $question = $qStmt->fetch();

    if (!$question) {
        $pdo->rollBack();
        send_error_response('Pertanyaan tidak valid atau tidak termasuk dalam kuis ini.', 404);
    }

    // Step 5: VALIDATE ANSWER & PREVENT DUPLICATE SUBMISSION (Row Lock with FOR UPDATE)
    $dupCheck = $pdo->prepare("
        SELECT id FROM answers
        WHERE participant_id = :pid AND question_id = :qid
        LIMIT 1
        FOR UPDATE
    ");
    $dupCheck->execute([':pid' => $participantId, ':qid' => $questionId]);
    if ($dupCheck->fetch()) {
        $pdo->rollBack();
        send_error_response([
            'message' => 'Pertanyaan ini sudah dijawab sebelumnya oleh peserta.',
            'code'    => 'ALREADY_ANSWERED',
        ], 409);
    }

    // Fetch official options directly from database (Source of Truth)
    $optStmt = $pdo->prepare("
        SELECT id, question_id, option_text, is_correct, match_text
        FROM options
        WHERE question_id = :qid
    ");
    $optStmt->execute([':qid' => $questionId]);
    $officialOptions = $optStmt->fetchAll();

    // Step 6: DETERMINE CORRECTNESS ON SERVER (NEVER TRUST CLIENT SCORE)
    $questionType = (string)($question['question_type'] ?? 'multiple_choice');
    $isCorrect = false;

    $selectedOptionIdToSave = null;
    $selectedOptionIdsToSave = null;
    $matchingAnswersToSave = null;

    if ($questionType === 'multiple_choice' || $questionType === 'true_false') {
        $chosenOptId = sanitize_string($input['selected_option_id'] ?? $input['optionId'] ?? '');
        if ($chosenOptId !== '') {
            $selectedOptionIdToSave = $chosenOptId;
            foreach ($officialOptions as $opt) {
                if ($opt['id'] === $chosenOptId && !empty($opt['is_correct'])) {
                    $isCorrect = true;
                    break;
                }
            }
        }
    } elseif ($questionType === 'multiple_answer') {
        $chosenOptIds = $input['selected_option_ids'] ?? $input['optionIds'] ?? [];
        if (!is_array($chosenOptIds)) {
            $chosenOptIds = [];
        }
        $chosenOptIds = array_values(array_unique(array_map('sanitize_string', $chosenOptIds)));
        $selectedOptionIdsToSave = $chosenOptIds;

        $correctOptionIds = [];
        foreach ($officialOptions as $opt) {
            if (!empty($opt['is_correct'])) {
                $correctOptionIds[] = (string)$opt['id'];
            }
        }

        sort($chosenOptIds);
        sort($correctOptionIds);
        $isCorrect = ($chosenOptIds === $correctOptionIds);
    } elseif ($questionType === 'matching') {
        $matchingPairs = $input['matching_answers'] ?? $input['matchingAnswers'] ?? [];
        if (!is_array($matchingPairs)) {
            $matchingPairs = [];
        }
        $matchingAnswersToSave = $matchingPairs;

        $allMatched = true;
        foreach ($officialOptions as $opt) {
            $expectedMatch = trim((string)($opt['match_text'] ?? ''));
            $givenMatch = trim((string)($matchingPairs[$opt['id']] ?? ''));
            if ($expectedMatch !== '' && $expectedMatch !== $givenMatch) {
                $allMatched = false;
                break;
            }
        }
        $isCorrect = $allMatched;
    }

    // Step 7: CALCULATE SCORE & RESPONSE TIME ON SERVER
    $points = (int)($question['points'] ?? 100);
    $scoreAwarded = $isCorrect ? $points : 0;

    // Calculate response time safely
    $responseTimeMs = 0;
    if (!empty($participant['question_started_at'])) {
        $startedTs = strtotime((string)$participant['question_started_at']);
        $responseTimeMs = max(0, (int)((time() - $startedTs) * 1000));
    } elseif (isset($input['response_time_ms'])) {
        $responseTimeMs = max(0, min(120000, (int)$input['response_time_ms']));
    }

    // Step 8: UPDATE PARTICIPANT IN TRANSACTION
    $newScore = (int)$participant['score'] + $scoreAwarded;
    $newLives = $currentLives;

    if (!$isCorrect && $quizMode === 'santai' && $initialLives > 0) {
        $newLives = max(0, $newLives - 1);
    }

    // Update question status JSON
    $qStatus = [];
    if (!empty($participant['question_status'])) {
        $decoded = is_string($participant['question_status'])
            ? json_decode($participant['question_status'], true)
            : $participant['question_status'];
        if (is_array($decoded)) {
            $qStatus = $decoded;
        }
    }
    $qStatus[$questionId] = 'answered';
    $jsonQStatus = json_encode($qStatus);

    $newProgress = (int)($participant['current_progress'] ?? 0) + 1;
    $isCompleted = ($newLives === 0 && $quizMode === 'santai' && $initialLives > 0) ? 1 : 0;

    $updPartStmt = $pdo->prepare("
        UPDATE participants
        SET score = :score,
            lives = :lives,
            question_status = :q_status,
            current_progress = :progress,
            is_completed = :is_comp
        WHERE id = :pid
    ");
    $updPartStmt->execute([
        ':score'    => $newScore,
        ':lives'    => $newLives,
        ':q_status' => $jsonQStatus,
        ':progress' => $newProgress,
        ':is_comp'  => $isCompleted,
        ':pid'      => $participantId,
    ]);

    // Step 9: SAVE ANSWER IN TRANSACTION
    $answerId = sanitize_string($input['id'] ?? generate_uuid());
    $jsonOptIds = $selectedOptionIdsToSave !== null ? json_encode($selectedOptionIdsToSave) : null;
    $jsonMatches = $matchingAnswersToSave !== null ? json_encode($matchingAnswersToSave) : null;

    $insAnsStmt = $pdo->prepare("
        INSERT INTO answers (
            id, participant_id, question_id, selected_option_id,
            selected_option_ids, matching_answers, is_correct,
            response_time_ms, score_awarded, answered_at
        ) VALUES (
            :id, :pid, :qid, :soid,
            :soids, :matches, :is_corr,
            :resp_time, :score, NOW()
        )
    ");
    $insAnsStmt->execute([
        ':id'        => $answerId,
        ':pid'       => $participantId,
        ':qid'       => $questionId,
        ':soid'      => $selectedOptionIdToSave,
        ':soids'     => $jsonOptIds,
        ':matches'   => $jsonMatches,
        ':is_corr'   => $isCorrect ? 1 : 0,
        ':resp_time' => $responseTimeMs,
        ':score'     => $scoreAwarded,
    ]);

    // Fetch refreshed answer & participant records
    $selAns = $pdo->prepare("SELECT * FROM answers WHERE id = :id LIMIT 1");
    $selAns->execute([':id' => $answerId]);
    $savedAnswer = $selAns->fetch();

    $selPart = $pdo->prepare("SELECT * FROM participants WHERE id = :id LIMIT 1");
    $selPart->execute([':id' => $participantId]);
    $updatedParticipant = $selPart->fetch();

    // -------------------------------------------------------------------------
    // COMMIT TRANSACTION
    // -------------------------------------------------------------------------
    $pdo->commit();

    // Format response combining answer details with updated participant state
    $ansFormatted = format_answer_row($savedAnswer);
    $ansFormatted['participant'] = format_participant_row($updatedParticipant);

    send_json_response($ansFormatted, 201);

} catch (Throwable $t) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("[SINESA_ANSWER_SUBMIT_ERROR] {$t->getMessage()} in {$t->getFile()}:{$t->getLine()}");
    send_error_response("Gagal memproses penyerahan jawaban: {$t->getMessage()}", 500);
}
