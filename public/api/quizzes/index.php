<?php
/**
 * SINESA REST API: Quizzes Management Endpoint
 * Handlers:
 * - GET: list quizzes (teacher sees only own quizzes, admin sees all, student sees active)
 *        or detail if ?id= or ?pin= is provided
 * - POST: create quiz (teacher or admin, teacher forced to own id)
 * - PUT/PATCH: update quiz (teacher only if owner, admin can update any)
 * - DELETE: delete quiz (teacher only if owner, admin can delete any)
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
 * Detect available columns in `quizzes` table and auto-migrate missing optional columns
 * @return array<string, bool>
 */
function get_quiz_columns(PDO $pdo): array {
    static $columns = null;
    if ($columns !== null) {
        return $columns;
    }

    try {
        $stmt = $pdo->query("SHOW COLUMNS FROM quizzes");
        $cols = $stmt->fetchAll(PDO::FETCH_COLUMN);
        $colMap = array_fill_keys($cols, true);

        // Attempt self-healing migration for missing optional columns
        $missing = [];
        if (!isset($colMap['subject'])) {
            $missing[] = "ADD COLUMN `subject` VARCHAR(100) NULL AFTER `title`";
        }
        if (!isset($colMap['target_class'])) {
            $missing[] = "ADD COLUMN `target_class` VARCHAR(50) NULL AFTER `subject`";
        }

        if (!empty($missing)) {
            try {
                $pdo->exec("ALTER TABLE quizzes " . implode(', ', $missing));
                $stmt = $pdo->query("SHOW COLUMNS FROM quizzes");
                $colMap = array_fill_keys($stmt->fetchAll(PDO::FETCH_COLUMN), true);
            } catch (Throwable $ddlError) {
                try {
                    if (!isset($colMap['subject'])) {
                        $pdo->exec("ALTER TABLE quizzes ADD COLUMN `subject` VARCHAR(100) NULL");
                    }
                } catch (Throwable $t) {}
                try {
                    if (!isset($colMap['target_class'])) {
                        $pdo->exec("ALTER TABLE quizzes ADD COLUMN `target_class` VARCHAR(50) NULL");
                    }
                } catch (Throwable $t) {}

                try {
                    $stmt = $pdo->query("SHOW COLUMNS FROM quizzes");
                    $colMap = array_fill_keys($stmt->fetchAll(PDO::FETCH_COLUMN), true);
                } catch (Throwable $t) {}
            }
        }
        $columns = $colMap;
    } catch (Throwable $t) {
        $columns = [];
    }

    return $columns;
}

/**
 * Format a quiz database row into typed JSON contract
 */
function format_quiz_row(array $row): array {
    return [
        'id'                       => (string)$row['id'],
        'teacher_id'               => (string)$row['teacher_id'],
        'title'                    => (string)$row['title'],
        'subject'                  => isset($row['subject']) && $row['subject'] !== null ? (string)$row['subject'] : '',
        'target_class'             => isset($row['target_class']) && $row['target_class'] !== null ? (string)$row['target_class'] : '',
        'description'              => $row['description'] !== null ? (string)$row['description'] : null,
        'opening_text'             => $row['opening_text'] !== null ? (string)$row['opening_text'] : null,
        'closing_text'             => $row['closing_text'] !== null ? (string)$row['closing_text'] : null,
        'pin_code'                 => (string)$row['pin_code'],
        'duration_per_question'    => (int)$row['duration_per_question'],
        'random_questions'         => (bool)$row['random_questions'],
        'random_options'           => (bool)$row['random_options'],
        'thumbnail_url'            => $row['thumbnail_url'] !== null ? (string)$row['thumbnail_url'] : null,
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
        'status'                   => (string)($row['status'] ?? 'active'),
        'total_questions'          => (int)($row['total_questions'] ?? $row['questions_count'] ?? 0),
        'questions_count'          => (int)($row['total_questions'] ?? $row['questions_count'] ?? 0),
        'created_at'               => (string)$row['created_at'],
        'updated_at'               => (string)$row['updated_at'],
    ];
}

/**
 * Generate unique 6-digit PIN code
 */
function generate_unique_pin(PDO $pdo): string {
    for ($i = 0; $i < 10; $i++) {
        $pin = str_pad((string)random_int(100000, 999999), 6, '0', STR_PAD_LEFT);
        $stmt = $pdo->prepare("SELECT id FROM quizzes WHERE pin_code = :pin LIMIT 1");
        $stmt->execute([':pin' => $pin]);
        if (!$stmt->fetch()) {
            return $pin;
        }
    }
    return substr((string)microtime(true), -6);
}

try {
    // -------------------------------------------------------------------------
    // GET: List or Detail
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $quizId = sanitize_string($_GET['id'] ?? '');
        $pinCode = sanitize_string($_GET['pin'] ?? '');
        $teacherIdParam = sanitize_string($_GET['teacher_id'] ?? '');

        // 1. Query by PIN (used by students to join session)
        if ($pinCode !== '') {
            $stmt = $pdo->prepare("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q WHERE q.pin_code = :pin LIMIT 1");
            $stmt->execute([':pin' => $pinCode]);
            $quiz = $stmt->fetch();

            if (!$quiz) {
                send_error_response('Kuis dengan kode PIN tersebut tidak ditemukan.', 404);
            }

            // Inactive check
            if (isset($quiz['status']) && $quiz['status'] === 'inactive') {
                $auth = get_optional_auth();
                $userId = (string)($auth['sub'] ?? '');
                $userRole = (string)($auth['role'] ?? '');
                if ($userRole !== 'admin' && $quiz['teacher_id'] !== $userId) {
                    send_error_response('Kuis ini sedang dinonaktifkan.', 403);
                }
            }

            send_success_response(format_quiz_row($quiz));
        }

        // Authenticate user for detail or list operations
        $auth = require_auth();
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? 'student');

        // 2. Query single quiz by ID (detail)
        if ($quizId !== '') {
            $stmt = $pdo->prepare("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q WHERE q.id = :id LIMIT 1");
            $stmt->execute([':id' => $quizId]);
            $quiz = $stmt->fetch();

            if (!$quiz) {
                send_error_response('Kuis tidak ditemukan.', 404);
            }

            // Role authorization: Teacher can only inspect own quiz or active quizzes
            if ($userRole === 'teacher' && $quiz['teacher_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda tidak memiliki izin untuk mengakses kuis ini.', 403);
            }

            send_success_response(format_quiz_row($quiz));
        }

        // 3. List quizzes
        if ($userRole === 'teacher') {
            // Teacher ONLY sees quizzes belonging to them
            $stmt = $pdo->prepare("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q WHERE q.teacher_id = :tid ORDER BY q.created_at DESC");
            $stmt->execute([':tid' => $userId]);
            $rows = $stmt->fetchAll();
        } elseif ($userRole === 'admin') {
            // Admin sees all or can filter by teacher_id
            if ($teacherIdParam !== '') {
                $stmt = $pdo->prepare("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q WHERE q.teacher_id = :tid ORDER BY q.created_at DESC");
                $stmt->execute([':tid' => $teacherIdParam]);
            } else {
                $stmt = $pdo->query("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q ORDER BY q.created_at DESC");
            }
            $rows = $stmt->fetchAll();
        } else {
            // Student sees active quizzes
            $stmt = $pdo->query("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q WHERE q.status = 'active' ORDER BY q.created_at DESC");
            $rows = $stmt->fetchAll();
        }

        $formatted = array_map('format_quiz_row', $rows);
        send_success_response($formatted);
    }

    // -------------------------------------------------------------------------
    // POST: Create Quiz
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $auth = require_role(['teacher', 'admin']);
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        $input = get_json_input();
        if (empty($input)) {
            $input = $_POST;
        }

        $title = sanitize_string($input['title'] ?? '');
        if ($title === '') {
            send_error_response('Judul kuis wajib diisi.', 400);
        }

        // Teacher can only create quiz for themselves
        $teacherId = $userRole === 'teacher' ? $userId : sanitize_string($input['teacher_id'] ?? $userId);

        $id = sanitize_string($input['id'] ?? generate_uuid());

        // Safe truncation and validation of input attributes
        $titleSafe        = mb_substr($title, 0, 255);
        $subject          = isset($input['subject']) && $input['subject'] !== '' ? mb_substr(sanitize_string($input['subject']), 0, 100) : null;
        $targetClass      = isset($input['target_class']) && $input['target_class'] !== '' ? mb_substr(sanitize_string($input['target_class']), 0, 50) : null;
        $description      = isset($input['description']) && $input['description'] !== '' ? (string)$input['description'] : null;
        $openingText      = isset($input['opening_text']) && $input['opening_text'] !== '' ? (string)$input['opening_text'] : null;
        $closingText      = isset($input['closing_text']) && $input['closing_text'] !== '' ? (string)$input['closing_text'] : null;
        $durationPerQuestion    = (int)($input['duration_per_question'] ?? 30);
        $randomQuestions        = !empty($input['random_questions']) ? 1 : 0;
        $randomOptions          = !empty($input['random_options']) ? 1 : 0;
        $thumbnailUrl           = isset($input['thumbnail_url']) && $input['thumbnail_url'] !== '' ? (string)$input['thumbnail_url'] : null;
        $quizMode               = in_array($input['quiz_mode'] ?? 'serius', ['serius', 'santai'], true) ? (string)($input['quiz_mode'] ?? 'serius') : 'serius';
        $livesCount             = (int)($input['lives_count'] ?? 3);
        $showFinalResult        = isset($input['show_final_result']) ? (!empty($input['show_final_result']) ? 1 : 0) : 1;
        $showLeaderboard        = isset($input['show_leaderboard']) ? (!empty($input['show_leaderboard']) ? 1 : 0) : 1;
        $showCorrectAnswer      = isset($input['show_correct_answer']) ? (!empty($input['show_correct_answer']) ? 1 : 0) : 1;
        $showAnswerReview       = isset($input['show_answer_review']) ? (!empty($input['show_answer_review']) ? 1 : 0) : 1;
        $showQuestionResult     = isset($input['show_question_result']) ? (!empty($input['show_question_result']) ? 1 : 0) : 1;
        $showExplanation        = isset($input['show_explanation']) ? (!empty($input['show_explanation']) ? 1 : 0) : 1;
        $showScorePerQuestion   = isset($input['show_score_per_question']) ? (!empty($input['show_score_per_question']) ? 1 : 0) : 1;
        $showQuestionStatistics = isset($input['show_question_statistics']) ? (!empty($input['show_question_statistics']) ? 1 : 0) : 1;
        $antiCheatEnabled       = !empty($input['anti_cheat_enabled']) ? 1 : 0;
        $fullscreenRequired     = !empty($input['fullscreen_required']) ? 1 : 0;
        $autoSubmitViolation    = (int)($input['auto_submit_on_violation'] ?? 3);
        $status                 = in_array($input['status'] ?? 'active', ['active', 'inactive'], true) ? (string)($input['status'] ?? 'active') : 'active';

        // Check if quiz already exists (Idempotent Upsert for client-supplied ID)
        $quizCols = get_quiz_columns($pdo);
        $hasSubject = isset($quizCols['subject']);
        $hasTargetClass = isset($quizCols['target_class']);

        $checkExisting = $pdo->prepare("SELECT id, teacher_id, pin_code FROM quizzes WHERE id = :id LIMIT 1");
        $checkExisting->execute([':id' => $id]);
        $existingQuiz = $checkExisting->fetch();

        if ($existingQuiz) {
            // Ownership check
            if ($userRole === 'teacher' && $existingQuiz['teacher_id'] !== $userId) {
                send_error_response('Akses ditolak. Anda hanya diperbolehkan mengubah kuis milik Anda sendiri.', 403);
            }

            $upPin = sanitize_string($input['pin_code'] ?? ($existingQuiz['pin_code'] ?? ''));
            if ($upPin === '') {
                $upPin = (string)$existingQuiz['pin_code'];
            }

            $upFields = ['title = :title'];
            if ($hasSubject) {
                $upFields[] = 'subject = :subject';
            }
            if ($hasTargetClass) {
                $upFields[] = 'target_class = :target_class';
            }
            $upFields = array_merge($upFields, [
                'description = :description',
                'opening_text = :opening_text',
                'closing_text = :closing_text',
                'pin_code = :pin_code',
                'duration_per_question = :duration_per_question',
                'random_questions = :random_questions',
                'random_options = :random_options',
                'thumbnail_url = :thumbnail_url',
                'quiz_mode = :quiz_mode',
                'lives_count = :lives_count',
                'show_final_result = :show_final_result',
                'show_leaderboard = :show_leaderboard',
                'show_correct_answer = :show_correct_answer',
                'show_answer_review = :show_answer_review',
                'show_question_result = :show_question_result',
                'show_explanation = :show_explanation',
                'show_score_per_question = :show_score_per_question',
                'show_question_statistics = :show_question_statistics',
                'anti_cheat_enabled = :anti_cheat_enabled',
                'fullscreen_required = :fullscreen_required',
                'auto_submit_on_violation = :auto_submit_on_violation',
                'status = :status',
                'updated_at = NOW()'
            ]);

            $upStmt = $pdo->prepare("UPDATE quizzes SET " . implode(",\n                    ", $upFields) . " WHERE id = :id");

            $upParams = [
                ':id'                       => $id,
                ':title'                    => $titleSafe,
                ':description'              => $description,
                ':opening_text'             => $openingText,
                ':closing_text'             => $closingText,
                ':pin_code'                 => mb_substr($upPin, 0, 10),
                ':duration_per_question'    => $durationPerQuestion,
                ':random_questions'         => $randomQuestions,
                ':random_options'           => $randomOptions,
                ':thumbnail_url'            => $thumbnailUrl,
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
                ':auto_submit_on_violation' => $autoSubmitViolation,
                ':status'                   => $status,
            ];
            if ($hasSubject) {
                $upParams[':subject'] = $subject;
            }
            if ($hasTargetClass) {
                $upParams[':target_class'] = $targetClass;
            }

            $upStmt->execute($upParams);

            $fetchStmt = $pdo->prepare("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q WHERE q.id = :id LIMIT 1");
            $fetchStmt->execute([':id' => $id]);
            $updatedQuiz = $fetchStmt->fetch();

            send_json_response(format_quiz_row($updatedQuiz ?: []), 200);
        }

        // Generate or validate PIN
        $pin = sanitize_string($input['pin_code'] ?? '');
        if ($pin === '') {
            $pin = generate_unique_pin($pdo);
        } else {
            $checkPin = $pdo->prepare("SELECT id FROM quizzes WHERE pin_code = :pin LIMIT 1");
            $checkPin->execute([':pin' => $pin]);
            if ($checkPin->fetch()) {
                // If supplied PIN is taken, auto-regenerate a unique PIN so insertion does not fail
                $pin = generate_unique_pin($pdo);
            }
        }
        $pinSafe = mb_substr($pin, 0, 10);

        $insertCols = ['id', 'teacher_id', 'title'];
        $insertVals = [':id', ':teacher_id', ':title'];
        $insParams = [
            ':id'                       => $id,
            ':teacher_id'               => $teacherId,
            ':title'                    => $titleSafe,
            ':description'              => $description,
            ':opening_text'             => $openingText,
            ':closing_text'             => $closingText,
            ':pin_code'                 => $pinSafe,
            ':duration_per_question'    => $durationPerQuestion,
            ':random_questions'         => $randomQuestions,
            ':random_options'           => $randomOptions,
            ':thumbnail_url'            => $thumbnailUrl,
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
            ':auto_submit_on_violation' => $autoSubmitViolation,
            ':status'                   => $status,
        ];

        if ($hasSubject) {
            $insertCols[] = 'subject';
            $insertVals[] = ':subject';
            $insParams[':subject'] = $subject;
        }
        if ($hasTargetClass) {
            $insertCols[] = 'target_class';
            $insertVals[] = ':target_class';
            $insParams[':target_class'] = $targetClass;
        }

        $commonCols = [
            'description', 'opening_text', 'closing_text', 'pin_code',
            'duration_per_question', 'random_questions', 'random_options', 'thumbnail_url',
            'quiz_mode', 'lives_count', 'show_final_result', 'show_leaderboard', 'show_correct_answer',
            'show_answer_review', 'show_question_result', 'show_explanation', 'show_score_per_question',
            'show_question_statistics', 'anti_cheat_enabled', 'fullscreen_required', 'auto_submit_on_violation',
            'status'
        ];
        foreach ($commonCols as $c) {
            $insertCols[] = $c;
            $insertVals[] = ":{$c}";
        }
        $insertCols[] = 'created_at';
        $insertCols[] = 'updated_at';
        $insertVals[] = 'NOW()';
        $insertVals[] = 'NOW()';

        $insSql = "INSERT INTO quizzes (" . implode(', ', $insertCols) . ") VALUES (" . implode(', ', $insertVals) . ")";
        $insStmt = $pdo->prepare($insSql);

        $inserted = false;
        $attempts = 0;
        while (!$inserted && $attempts < 3) {
            $attempts++;
            try {
                $insParams[':pin_code'] = $pinSafe;
                $insStmt->execute($insParams);
                $inserted = true;
            } catch (PDOException $pdoErr) {
                // If collision on PIN code, generate fresh PIN and retry
                if (($pdoErr->getCode() === '23000' || str_contains($pdoErr->getMessage(), '1062')) && str_contains($pdoErr->getMessage(), 'pin_code')) {
                    $pinSafe = mb_substr(generate_unique_pin($pdo), 0, 10);
                    continue;
                }
                throw $pdoErr;
            }
        }

        // Fetch newly created quiz
        $fetchStmt = $pdo->prepare("SELECT * FROM quizzes WHERE id = :id LIMIT 1");
        $fetchStmt->execute([':id' => $id]);
        $newQuiz = $fetchStmt->fetch();

        // Log activity
        try {
            $logStmt = $pdo->prepare("INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (:id, :uid, 'CREATE_QUIZ', :details, NOW())");
            $logStmt->execute([
                ':id'      => generate_uuid(),
                ':uid'     => $userId,
                ':details' => "Membuat kuis: {$title} ({$id})",
            ]);
        } catch (Throwable $t) {}

        send_json_response(format_quiz_row($newQuiz), 201);
    }

    // -------------------------------------------------------------------------
    // PUT / PATCH: Update Quiz
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || $method === 'PATCH') {
        $auth = require_role(['teacher', 'admin']);
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        $input = get_json_input();
        $quizId = sanitize_string($_GET['id'] ?? ($input['id'] ?? ''));

        if ($quizId === '') {
            send_error_response('ID kuis wajib disertakan untuk melakukan pembaruan.', 400);
        }

        // 1. Fetch current quiz
        $fetchStmt = $pdo->prepare("SELECT q.*, (SELECT COUNT(*) FROM questions WHERE questions.quiz_id = q.id) AS total_questions FROM quizzes q WHERE q.id = :id LIMIT 1");
        $fetchStmt->execute([':id' => $quizId]);
        $quiz = $fetchStmt->fetch();

        if (!$quiz) {
            send_error_response('Kuis tidak ditemukan.', 404);
        }

        // 2. Ownership check: Teacher can only update their own quiz
        if ($userRole === 'teacher' && $quiz['teacher_id'] !== $userId) {
            send_error_response('Akses ditolak. Anda hanya diperbolehkan mengubah kuis milik Anda sendiri.', 403);
        }

        // 3. Build dynamic update query
        $quizCols = get_quiz_columns($pdo);
        $updates = [];
        $params = [':id' => $quizId];

        $fieldMappings = [
            'title'                    => 'string',
            'description'              => 'nullable_string',
            'opening_text'             => 'nullable_string',
            'closing_text'             => 'nullable_string',
            'duration_per_question'    => 'int',
            'random_questions'         => 'bool',
            'random_options'           => 'bool',
            'thumbnail_url'            => 'nullable_string',
            'quiz_mode'                => 'string',
            'lives_count'              => 'int',
            'show_final_result'        => 'bool',
            'show_leaderboard'         => 'bool',
            'show_correct_answer'      => 'bool',
            'show_answer_review'       => 'bool',
            'show_question_result'     => 'bool',
            'show_explanation'         => 'bool',
            'show_score_per_question'  => 'bool',
            'show_question_statistics' => 'bool',
            'anti_cheat_enabled'       => 'bool',
            'fullscreen_required'      => 'bool',
            'auto_submit_on_violation' => 'int',
            'status'                   => 'string',
        ];

        if (isset($quizCols['subject'])) {
            $fieldMappings['subject'] = 'nullable_string';
        }
        if (isset($quizCols['target_class'])) {
            $fieldMappings['target_class'] = 'nullable_string';
        }

        if ($userRole === 'admin' && isset($input['teacher_id'])) {
            $fieldMappings['teacher_id'] = 'string';
        }

        if (isset($input['pin_code'])) {
            $newPin = sanitize_string((string)$input['pin_code']);
            if ($newPin !== '') {
                $checkPin = $pdo->prepare("SELECT id FROM quizzes WHERE pin_code = :pin AND id != :id LIMIT 1");
                $checkPin->execute([':pin' => $newPin, ':id' => $quizId]);
                if ($checkPin->fetch()) {
                    send_error_response('Kode PIN sudah digunakan kuis lain.', 409);
                }
                $updates[] = 'pin_code = :pin_code';
                $params[':pin_code'] = $newPin;
            }
        }

        foreach ($fieldMappings as $col => $type) {
            if (!array_key_exists($col, $input)) continue;

            $val = $input[$col];
            if ($type === 'string') {
                $clean = sanitize_string((string)$val);
                if ($col === 'title' && $clean === '') {
                    send_error_response('Judul kuis tidak boleh kosong.', 400);
                }
                if ($col === 'title') {
                    $clean = mb_substr($clean, 0, 255);
                }
                if ($col === 'quiz_mode') {
                    $clean = in_array($clean, ['serius', 'santai'], true) ? $clean : 'serius';
                }
                if ($col === 'status') {
                    $clean = in_array($clean, ['active', 'inactive'], true) ? $clean : 'active';
                }
                $updates[] = "{$col} = :{$col}";
                $params[":{$col}"] = $clean;
            } elseif ($type === 'nullable_string') {
                $clean = $val !== null ? sanitize_string((string)$val) : null;
                if ($clean !== null && $clean !== '') {
                    if ($col === 'subject') $clean = mb_substr($clean, 0, 100);
                    if ($col === 'target_class') $clean = mb_substr($clean, 0, 50);
                }
                $updates[] = "{$col} = :{$col}";
                $params[":{$col}"] = ($clean !== '' ? $clean : null);
            } elseif ($type === 'int') {
                $updates[] = "{$col} = :{$col}";
                $params[":{$col}"] = (int)$val;
            } elseif ($type === 'bool') {
                $updates[] = "{$col} = :{$col}";
                $params[":{$col}"] = !empty($val) ? 1 : 0;
            }
        }

        if (!empty($updates)) {
            $updates[] = "updated_at = NOW()";
            $sql = "UPDATE quizzes SET " . implode(', ', $updates) . " WHERE id = :id";
            $upStmt = $pdo->prepare($sql);
            $upStmt->execute($params);
        }

        // Fetch updated quiz
        $fetchStmt->execute([':id' => $quizId]);
        $updated = $fetchStmt->fetch();

        if (!$updated) {
            send_error_response('Kuis tidak ditemukan setelah proses pembaruan.', 404);
        }

        // Log activity
        try {
            $logStmt = $pdo->prepare("INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (:id, :uid, 'UPDATE_QUIZ', :details, NOW())");
            $logStmt->execute([
                ':id'      => generate_uuid(),
                ':uid'     => $userId,
                ':details' => "Memperbarui kuis: {$updated['title']} ({$quizId})",
            ]);
        } catch (Throwable $t) {}

        send_success_response(format_quiz_row($updated));
    }

    // -------------------------------------------------------------------------
    // DELETE: Delete Quiz
    // -------------------------------------------------------------------------
    if ($method === 'DELETE') {
        $auth = require_role(['teacher', 'admin']);
        $userId = (string)($auth['sub'] ?? '');
        $userRole = (string)($auth['role'] ?? '');

        $quizId = sanitize_string($_GET['id'] ?? '');
        if ($quizId === '') {
            $input = get_json_input();
            $quizId = sanitize_string($input['id'] ?? '');
        }

        if ($quizId === '') {
            send_error_response('ID kuis wajib disertakan untuk menghapus kuis.', 400);
        }

        // 1. Fetch current quiz
        $fetchStmt = $pdo->prepare("SELECT * FROM quizzes WHERE id = :id LIMIT 1");
        $fetchStmt->execute([':id' => $quizId]);
        $quiz = $fetchStmt->fetch();

        if (!$quiz) {
            send_error_response('Kuis tidak ditemukan.', 404);
        }

        // 2. Ownership check: Teacher can only delete their own quiz
        if ($userRole === 'teacher' && $quiz['teacher_id'] !== $userId) {
            send_error_response('Akses ditolak. Anda hanya diperbolehkan menghapus kuis milik Anda sendiri.', 403);
        }

        // 3. Delete quiz (Cascades to questions, options, etc. via FK)
        $delStmt = $pdo->prepare("DELETE FROM quizzes WHERE id = :id");
        $delStmt->execute([':id' => $quizId]);

        // Log activity
        try {
            $logStmt = $pdo->prepare("INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (:id, :uid, 'DELETE_QUIZ', :details, NOW())");
            $logStmt->execute([
                ':id'      => generate_uuid(),
                ':uid'     => $userId,
                ':details' => "Menghapus kuis: {$quiz['title']} ({$quizId})",
            ]);
        } catch (Throwable $t) {}

        send_success_response(['deleted_id' => $quizId]);
    }

    send_error_response('Metode HTTP tidak didukung. Gunakan GET, POST, PUT, atau DELETE.', 405);

} catch (PDOException $e) {
    error_log('[QUIZZES_DB_ERROR] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    $msg = $e->getMessage();
    if ($e->getCode() === '23000' || str_contains($msg, '1062 Duplicate entry')) {
        if (str_contains($msg, 'pin_code')) {
            send_error_response('Kode PIN kuis sudah digunakan. Silakan gunakan PIN lain.', 409);
        }
        send_error_response('Data kuis dengan pengenal ini sudah ada dalam sistem.', 409);
    }
    send_error_response('Terjadi kegagalan database saat memproses data kuis: ' . $msg, 500);
} catch (Throwable $e) {
    error_log('[QUIZZES_API_ERROR] ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
    send_error_response('Terjadi kegagalan internal saat memproses data kuis: ' . $e->getMessage(), 500);
}
