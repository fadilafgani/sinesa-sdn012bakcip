<?php
/**
 * SINESA REST API: Questions & Options Management Endpoint
 * Handlers:
 * - GET: list questions by quiz_id, detail by id, options by question_id or question_ids
 * - POST: create question or bulk create options
 * - PUT/PATCH: update question
 * - DELETE: delete question by id, delete questions by quiz_id, or delete options by question_id
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
 * Format question database row into typed JSON contract
 */
function format_question_row(array $row, ?array $options = null): array {
    $res = [
        'id'            => (string)$row['id'],
        'quiz_id'       => (string)$row['quiz_id'],
        'question_text' => (string)$row['question_text'],
        'question_type' => (string)($row['question_type'] ?? 'multiple_choice'),
        'media_type'    => (string)($row['media_type'] ?? 'text'),
        'media_url'     => $row['media_url'] !== null ? (string)$row['media_url'] : null,
        'points'        => (int)($row['points'] ?? 100),
        'order_index'   => (int)($row['order_index'] ?? 0),
        'explanation'   => $row['explanation'] !== null ? (string)$row['explanation'] : null,
        'created_at'    => (string)$row['created_at'],
    ];

    if ($options !== null) {
        $res['options'] = $options;
    }

    return $res;
}

/**
 * Format option database row into typed JSON contract
 */
function format_option_row(array $row): array {
    return [
        'id'          => (string)$row['id'],
        'question_id' => (string)$row['question_id'],
        'option_text' => (string)$row['option_text'],
        'is_correct'  => (bool)($row['is_correct'] ?? 0),
        'match_text'  => $row['match_text'] !== null ? (string)$row['match_text'] : null,
        'created_at'  => (string)$row['created_at'],
    ];
}

try {
    // -------------------------------------------------------------------------
    // GET: List or Detail (Questions or Options)
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $questionId = sanitize_string($_GET['id'] ?? ($_GET['question_id'] ?? ''));
        $quizId     = sanitize_string($_GET['quiz_id'] ?? '');
        $isOptions  = isset($_GET['type']) && $_GET['type'] === 'options';
        $qIdsParam  = sanitize_string($_GET['question_ids'] ?? '');

        // 1. Fetch options for multiple question IDs (in batch)
        if ($qIdsParam !== '' || ($isOptions && $qIdsParam !== '')) {
            $rawIds = explode(',', $qIdsParam);
            $cleanIds = [];
            foreach ($rawIds as $rid) {
                $trimmed = trim(sanitize_string($rid));
                if ($trimmed !== '') $cleanIds[] = $trimmed;
            }

            if (empty($cleanIds)) {
                send_success_response([]);
            }

            $placeholders = implode(',', array_fill(0, count($cleanIds), '?'));
            $stmt = $pdo->prepare("SELECT * FROM options WHERE question_id IN ($placeholders) ORDER BY id ASC");
            $stmt->execute($cleanIds);
            $rows = $stmt->fetchAll();

            $formatted = array_map('format_option_row', $rows);
            send_success_response($formatted);
        }

        // 2. Fetch options for a single question
        if ($questionId !== '' && ($isOptions || (isset($_GET['action']) && $_GET['action'] === 'options'))) {
            $stmt = $pdo->prepare("SELECT * FROM options WHERE question_id = :qid ORDER BY id ASC");
            $stmt->execute([':qid' => $questionId]);
            $rows = $stmt->fetchAll();

            $formatted = array_map('format_option_row', $rows);
            send_success_response($formatted);
        }

        // 3. Fetch single question detail by ID
        if ($questionId !== '' && !$isOptions && empty($_GET['question_id'])) {
            $stmt = $pdo->prepare("SELECT * FROM questions WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $questionId]);
            $q = $stmt->fetch();

            if (!$q) {
                send_error_response('Pertanyaan tidak ditemukan.', 404);
            }

            // Fetch its options
            $optStmt = $pdo->prepare("SELECT * FROM options WHERE question_id = :qid ORDER BY id ASC");
            $optStmt->execute([':qid' => $questionId]);
            $opts = array_map('format_option_row', $optStmt->fetchAll());

            send_success_response(format_question_row($q, $opts));
        }

        // 4. Fetch list of questions for a specific quiz
        if ($quizId !== '') {
            $stmt = $pdo->prepare("SELECT * FROM questions WHERE quiz_id = :qid ORDER BY order_index ASC");
            $stmt->execute([':qid' => $quizId]);
            $rows = $stmt->fetchAll();

            $withOptions = !empty($_GET['with_options']);
            $result = [];

            if ($withOptions && !empty($rows)) {
                $qIds = array_column($rows, 'id');
                $placeholders = implode(',', array_fill(0, count($qIds), '?'));
                $optStmt = $pdo->prepare("SELECT * FROM options WHERE question_id IN ($placeholders) ORDER BY id ASC");
                $optStmt->execute($qIds);
                $allOpts = $optStmt->fetchAll();

                $optionsByQid = [];
                foreach ($allOpts as $opt) {
                    $optionsByQid[$opt['question_id']][] = format_option_row($opt);
                }

                foreach ($rows as $row) {
                    $result[] = format_question_row($row, $optionsByQid[$row['id']] ?? []);
                }
            } else {
                foreach ($rows as $row) {
                    $result[] = format_question_row($row);
                }
            }

            send_success_response($result);
        }

        send_error_response('Parameter query tidak lengkap. Sertakan quiz_id atau id.', 400);
    }

    // -------------------------------------------------------------------------
    // POST: Create Question OR Bulk Create Options
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $auth = require_role(['teacher', 'admin']);
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        $input = get_json_input();
        if (empty($input)) {
            $input = $_POST;
        }

        $isCreateOptions = (isset($_GET['type']) && $_GET['type'] === 'options') ||
                           (isset($input['action']) && $input['action'] === 'create_options') ||
                           (isset($input['options']) && is_array($input['options']) && !isset($input['quiz_id']));

        // --- SUB-HANDLER: BULK CREATE OPTIONS ---
        if ($isCreateOptions) {
            $optionsList = $input['options'] ?? (is_array($input) && isset($input[0]) ? $input : []);

            if (!is_array($optionsList) || empty($optionsList)) {
                send_error_response('Daftar opsi pilihan jawaban tidak valid atau kosong.', 400);
            }

            $insertedOptions = [];
            $insOptStmt = $pdo->prepare("
                INSERT INTO options (id, question_id, option_text, is_correct, match_text, created_at)
                VALUES (:id, :question_id, :option_text, :is_correct, :match_text, NOW())
            ");

            foreach ($optionsList as $opt) {
                $optId = sanitize_string($opt['id'] ?? generate_uuid());
                $qId   = sanitize_string($opt['question_id'] ?? '');
                $text  = sanitize_string($opt['option_text'] ?? '');
                $isCorrect = !empty($opt['is_correct']) ? 1 : 0;
                $matchText = isset($opt['match_text']) && $opt['match_text'] !== '' ? sanitize_string((string)$opt['match_text']) : null;

                if ($qId === '' || $text === '') {
                    continue;
                }

                $insOptStmt->execute([
                    ':id'          => $optId,
                    ':question_id' => $qId,
                    ':option_text' => $text,
                    ':is_correct'  => $isCorrect,
                    ':match_text'  => $matchText,
                ]);

                $insertedOptions[] = [
                    'id'          => $optId,
                    'question_id' => $qId,
                    'option_text' => $text,
                    'is_correct'  => (bool)$isCorrect,
                    'match_text'  => $matchText,
                    'created_at'  => date('Y-m-d H:i:s'),
                ];
            }

            send_json_response($insertedOptions, 201);
        }

        // --- SUB-HANDLER: CREATE QUESTION ---
        $quizId = sanitize_string($input['quiz_id'] ?? '');
        $questionText = sanitize_string($input['question_text'] ?? '');

        if ($quizId === '' || $questionText === '') {
            send_error_response('ID Kuis (quiz_id) dan teks pertanyaan (question_text) wajib diisi.', 400);
        }

        // Ownership enforcement: Verify quiz exists and caller is owner or admin
        $quizStmt = $pdo->prepare("SELECT id, teacher_id FROM quizzes WHERE id = :qid LIMIT 1");
        $quizStmt->execute([':qid' => $quizId]);
        $quiz = $quizStmt->fetch();

        if (!$quiz) {
            send_error_response('Kuis induk tidak ditemukan dalam database.', 404);
        }

        if ($userRole === 'teacher' && $quiz['teacher_id'] !== $userId) {
            send_error_response('Akses ditolak. Anda hanya diperbolehkan mengelola pertanyaan pada kuis milik Anda.', 403);
        }

        $id           = sanitize_string($input['id'] ?? generate_uuid());
        $questionType = in_array($input['question_type'] ?? 'multiple_choice', ['multiple_choice', 'true_false', 'multiple_answer', 'matching'], true)
            ? (string)$input['question_type']
            : 'multiple_choice';
        $mediaType    = in_array($input['media_type'] ?? 'text', ['text', 'image', 'audio', 'video', 'latex'], true)
            ? (string)$input['media_type']
            : 'text';
        $mediaUrl     = isset($input['media_url']) && $input['media_url'] !== '' ? sanitize_string((string)$input['media_url']) : null;
        $points       = (int)($input['points'] ?? 100);
        $orderIndex   = (int)($input['order_index'] ?? 0);
        $explanation  = isset($input['explanation']) && $input['explanation'] !== '' ? sanitize_string((string)$input['explanation']) : null;

        $insStmt = $pdo->prepare("
            INSERT INTO questions (
                id, quiz_id, question_text, question_type, media_type, media_url,
                points, order_index, explanation, created_at
            ) VALUES (
                :id, :quiz_id, :question_text, :question_type, :media_type, :media_url,
                :points, :order_index, :explanation, NOW()
            )
        ");

        $insStmt->execute([
            ':id'            => $id,
            ':quiz_id'       => $quizId,
            ':question_text' => $questionText,
            ':question_type' => $questionType,
            ':media_type'    => $mediaType,
            ':media_url'     => $mediaUrl,
            ':points'        => $points,
            ':order_index'   => $orderIndex,
            ':explanation'   => $explanation,
        ]);

        // Insert options if bundled inside question creation payload
        $createdOptions = [];
        if (isset($input['options']) && is_array($input['options'])) {
            $insOptStmt = $pdo->prepare("
                INSERT INTO options (id, question_id, option_text, is_correct, match_text, created_at)
                VALUES (:id, :question_id, :option_text, :is_correct, :match_text, NOW())
            ");
            foreach ($input['options'] as $opt) {
                $optId = sanitize_string($opt['id'] ?? generate_uuid());
                $optText = sanitize_string($opt['option_text'] ?? '');
                $isCorrect = !empty($opt['is_correct']) ? 1 : 0;
                $matchText = isset($opt['match_text']) && $opt['match_text'] !== '' ? sanitize_string((string)$opt['match_text']) : null;

                if ($optText === '') continue;

                $insOptStmt->execute([
                    ':id'          => $optId,
                    ':question_id' => $id,
                    ':option_text' => $optText,
                    ':is_correct'  => $isCorrect,
                    ':match_text'  => $matchText,
                ]);

                $createdOptions[] = [
                    'id'          => $optId,
                    'question_id' => $id,
                    'option_text' => $optText,
                    'is_correct'  => (bool)$isCorrect,
                    'match_text'  => $matchText,
                    'created_at'  => date('Y-m-d H:i:s'),
                ];
            }
        }

        // Fetch inserted question
        $fetchStmt = $pdo->prepare("SELECT * FROM questions WHERE id = :id LIMIT 1");
        $fetchStmt->execute([':id' => $id]);
        $newQuestion = $fetchStmt->fetch();

        send_json_response(format_question_row($newQuestion, !empty($createdOptions) ? $createdOptions : null), 201);
    }

    // -------------------------------------------------------------------------
    // PUT / PATCH: Update Question
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || $method === 'PATCH') {
        $auth = require_role(['teacher', 'admin']);
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        $input = get_json_input();
        $questionId = sanitize_string($_GET['id'] ?? ($input['id'] ?? ''));

        if ($questionId === '') {
            send_error_response('ID pertanyaan wajib disertakan untuk melakukan pembaruan.', 400);
        }

        // 1. Fetch current question and join quiz to check ownership
        $fetchStmt = $pdo->prepare("
            SELECT q.*, qz.teacher_id 
            FROM questions q 
            JOIN quizzes qz ON q.quiz_id = qz.id 
            WHERE q.id = :id 
            LIMIT 1
        ");
        $fetchStmt->execute([':id' => $questionId]);
        $existing = $fetchStmt->fetch();

        if (!$existing) {
            send_error_response('Pertanyaan tidak ditemukan dalam sistem.', 404);
        }

        if ($userRole === 'teacher' && $existing['teacher_id'] !== $userId) {
            send_error_response('Akses ditolak. Anda hanya diperbolehkan menyunting pertanyaan pada kuis milik Anda.', 403);
        }

        // 2. Build dynamic update query
        $updates = [];
        $params = [':id' => $questionId];

        $fields = [
            'question_text' => 'string',
            'question_type' => 'string',
            'media_type'    => 'string',
            'media_url'     => 'nullable_string',
            'points'        => 'int',
            'order_index'   => 'int',
            'explanation'   => 'nullable_string',
        ];

        foreach ($fields as $col => $type) {
            if (!array_key_exists($col, $input)) continue;

            $val = $input[$col];
            if ($type === 'string') {
                $clean = sanitize_string((string)$val);
                if ($col === 'question_text' && $clean === '') {
                    send_error_response('Teks pertanyaan tidak boleh kosong.', 400);
                }
                $updates[] = "{$col} = :{$col}";
                $params[":{$col}"] = $clean;
            } elseif ($type === 'nullable_string') {
                $clean = $val !== null ? sanitize_string((string)$val) : null;
                $updates[] = "{$col} = :{$col}";
                $params[":{$col}"] = ($clean !== '' ? $clean : null);
            } elseif ($type === 'int') {
                $updates[] = "{$col} = :{$col}";
                $params[":{$col}"] = (int)$val;
            }
        }

        if (!empty($updates)) {
            $sql = "UPDATE questions SET " . implode(', ', $updates) . " WHERE id = :id";
            $upStmt = $pdo->prepare($sql);
            $upStmt->execute($params);
        }

        // 3. Update options if provided in update payload
        if (isset($input['options']) && is_array($input['options'])) {
            // Delete old options and re-insert new ones
            $delOpt = $pdo->prepare("DELETE FROM options WHERE question_id = :qid");
            $delOpt->execute([':qid' => $questionId]);

            $insOpt = $pdo->prepare("
                INSERT INTO options (id, question_id, option_text, is_correct, match_text, created_at)
                VALUES (:id, :question_id, :option_text, :is_correct, :match_text, NOW())
            ");
            foreach ($input['options'] as $opt) {
                $optText = sanitize_string($opt['option_text'] ?? '');
                if ($optText === '') continue;
                $insOpt->execute([
                    ':id'          => sanitize_string($opt['id'] ?? generate_uuid()),
                    ':question_id' => $questionId,
                    ':option_text' => $optText,
                    ':is_correct'  => !empty($opt['is_correct']) ? 1 : 0,
                    ':match_text'  => isset($opt['match_text']) && $opt['match_text'] !== '' ? sanitize_string((string)$opt['match_text']) : null,
                ]);
            }
        }

        // Fetch updated question
        $fetchUpdated = $pdo->prepare("SELECT * FROM questions WHERE id = :id LIMIT 1");
        $fetchUpdated->execute([':id' => $questionId]);
        $updatedQuestion = $fetchUpdated->fetch();

        $optStmt = $pdo->prepare("SELECT * FROM options WHERE question_id = :qid ORDER BY id ASC");
        $optStmt->execute([':qid' => $questionId]);
        $updatedOpts = array_map('format_option_row', $optStmt->fetchAll());

        send_success_response(format_question_row($updatedQuestion, $updatedOpts));
    }

    // -------------------------------------------------------------------------
    // DELETE: Delete Question OR Delete Options OR Delete by Quiz ID
    // -------------------------------------------------------------------------
    if ($method === 'DELETE') {
        $auth = require_role(['teacher', 'admin']);
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        $quizId     = sanitize_string($_GET['quiz_id'] ?? '');
        $questionId = sanitize_string($_GET['id'] ?? ($_GET['question_id'] ?? ''));
        $isOptions  = isset($_GET['type']) && $_GET['type'] === 'options';

        if ($questionId === '' && $quizId === '') {
            $input = get_json_input();
            $quizId = sanitize_string($input['quiz_id'] ?? '');
            $questionId = sanitize_string($input['id'] ?? ($input['question_id'] ?? ''));
        }

        // 1. Delete all questions for a specific quiz (quiz-level deletion)
        if ($quizId !== '') {
            $qStmt = $pdo->prepare("SELECT teacher_id FROM quizzes WHERE id = :qid LIMIT 1");
            $qStmt->execute([':qid' => $quizId]);
            $qz = $qStmt->fetch();

            if (!$qz) {
                send_error_response('Kuis tidak ditemukan.', 404);
            }

            if ($userRole === 'teacher' && $qz['teacher_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda hanya diperbolehkan menghapus pertanyaan kuis milik Anda.', 403);
            }

            $delStmt = $pdo->prepare("DELETE FROM questions WHERE quiz_id = :qid");
            $delStmt->execute([':qid' => $quizId]);

            send_success_response(['deleted_quiz_id' => $quizId]);
        }

        // 2. Delete options for a specific question
        if ($questionId !== '' && $isOptions) {
            // Verify ownership via question's parent quiz
            $checkStmt = $pdo->prepare("
                SELECT qz.teacher_id 
                FROM questions q 
                JOIN quizzes qz ON q.quiz_id = qz.id 
                WHERE q.id = :id 
                LIMIT 1
            ");
            $checkStmt->execute([':id' => $questionId]);
            $owner = $checkStmt->fetch();

            if ($owner && $userRole === 'teacher' && $owner['teacher_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda tidak berhak menghapus opsi pertanyaan ini.', 403);
            }

            $delOpt = $pdo->prepare("DELETE FROM options WHERE question_id = :qid");
            $delOpt->execute([':qid' => $questionId]);

            send_success_response(['deleted_question_options' => $questionId]);
        }

        // 3. Delete single question by ID
        if ($questionId !== '') {
            $checkStmt = $pdo->prepare("
                SELECT q.id, qz.teacher_id 
                FROM questions q 
                JOIN quizzes qz ON q.quiz_id = qz.id 
                WHERE q.id = :id 
                LIMIT 1
            ");
            $checkStmt->execute([':id' => $questionId]);
            $q = $checkStmt->fetch();

            if (!$q) {
                send_error_response('Pertanyaan tidak ditemukan.', 404);
            }

            if ($userRole === 'teacher' && $q['teacher_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda tidak berhak menghapus pertanyaan ini.', 403);
            }

            $delStmt = $pdo->prepare("DELETE FROM questions WHERE id = :id");
            $delStmt->execute([':id' => $questionId]);

            send_success_response(['deleted_question_id' => $questionId]);
        }

        send_error_response('ID pertanyaan atau ID kuis wajib disertakan.', 400);
    }

    send_error_response('Metode HTTP tidak didukung. Gunakan GET, POST, PUT, atau DELETE.', 405);

} catch (Throwable $e) {
    error_log('[QUESTIONS_API_ERROR] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    send_error_response('Terjadi kegagalan internal saat memproses data pertanyaan kuis.', 500);
}
