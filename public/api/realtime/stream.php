<?php
/**
 * SINESA Server-Sent Events (SSE) Realtime Engine
 * GET /api/realtime/stream.php
 *
 * Provides live server-to-client event streaming for Quiz Sessions:
 * - StageChanged: Session stage transitions (waiting, countdown, question, result, leaderboard, finished)
 * - TimerTick: Live second-by-second countdown during question stage
 * - CountdownTick: 3..2..1 intro countdown before question stage
 * - ParticipantJoined: Immediate notification when students join
 * - ParticipantLeft: Notification when students leave
 * - ParticipantsSynced: Full participant list sync
 * - AnswerSubmitted: Realtime answer count update for host/teacher
 * - LeaderboardUpdated: Live scoreboard changes when scores update
 * - heartbeat: Keep-alive signal and connection watchdog
 *
 * Architect-optimized for cPanel/Apache Shared Hosting & Resilient Reconnection:
 * - Anti-buffering headers (X-Accel-Buffering: no, ob_implicit_flush)
 * - Top-level uncaught exception / error handler ensuring valid SSE format and zero 500 HTML leak
 * - Structured audit logging for request lifecycle, auth, Last-Event-ID, and exit reasons
 * - Safe 3000ms SSE retry instruction to avoid reconnect DDOS / thread exhaustion
 * - Lightweight periodic keepalive ping to immediately detect connection_aborted()
 * - Safe composite query with automatic MySQL reconnection on dropped sockets
 */

declare(strict_types=1);

$scriptStartFloat = microtime(true);

require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/jwt.php';

// -------------------------------------------------------------------------
// 1. TOP-LEVEL EXCEPTION & ERROR HANDLER (PREVENT HTTP 500 HTML OUTPUT)
// -------------------------------------------------------------------------
set_error_handler(function ($severity, $message, $file, $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function (Throwable $e) {
    error_log(sprintf(
        "[SINESA_STREAM_FATAL] Uncaught exception: %s in %s:%d\nStack trace:\n%s",
        $e->getMessage(),
        $e->getFile(),
        $e->getLine(),
        $e->getTraceAsString()
    ));

    if (!headers_sent()) {
        header('Content-Type: text/event-stream; charset=UTF-8');
        header('Cache-Control: no-cache, no-transform, no-store, must-revalidate');
        header('Connection: keep-alive');
        http_response_code(200);
    }

    echo "event: error\n";
    echo "data: " . json_encode([
        'message' => 'Terjadi kesalahan sistem pada realtime stream',
        'code'    => 'STREAM_EXCEPTION'
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n\n";

    if (ob_get_level() > 0) {
        @ob_flush();
    }
    @flush();
    exit(0);
});

// -------------------------------------------------------------------------
// 2. ANTI-BUFFERING & SSE STREAMING HEADERS
// -------------------------------------------------------------------------
if (function_exists('apache_setenv')) {
    apache_setenv('no-gzip', '1');
}
@ini_set('output_buffering', 'off');
@ini_set('zlib.output_compression', 'off');
@ini_set('implicit_flush', '1');
ob_implicit_flush(true);
while (ob_get_level() > 0) {
    ob_end_clean();
}

header('Content-Type: text/event-stream; charset=UTF-8');
header('Cache-Control: no-cache, no-transform, no-store, must-revalidate');
header('Connection: keep-alive');
header('X-Accel-Buffering: no');
header('X-LiteSpeed-Buffer: no');
header('Content-Encoding: none');
header('Pragma: no-cache');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Last-Event-ID');

// Handle preflight OPTIONS
if (isset($_SERVER['REQUEST_METHOD']) && strtoupper($_SERVER['REQUEST_METHOD']) === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

/**
 * Send single formatted SSE event and flush immediately
 */
function send_sse_event(string $event, array $data, ?string $id = null): void {
    if ($id === null) {
        $id = (string)round(microtime(true) * 1000) . '_' . substr(bin2hex(random_bytes(3)), 0, 6);
    }
    echo ": REALTIME_EVENT {$event}\n";
    echo "id: {$id}\n";
    echo "event: {$event}\n";
    echo "data: " . json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n\n";
    if (ob_get_level() > 0) {
        @ob_flush();
    }
    @flush();
}

/**
 * Detect available columns in `quiz_sessions` table and auto-migrate missing countdown columns
 */
function ensure_session_countdown_columns(PDO $pdo): bool {
    static $hasCountdown = null;
    if ($hasCountdown !== null) return $hasCountdown;

    try {
        $cols = $pdo->query("SHOW COLUMNS FROM quiz_sessions")->fetchAll(PDO::FETCH_COLUMN);
        $colMap = array_fill_keys($cols, true);

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
                $cols = $pdo->query("SHOW COLUMNS FROM quiz_sessions")->fetchAll(PDO::FETCH_COLUMN);
                $colMap = array_fill_keys($cols, true);
            } catch (Throwable $t) {
                foreach ($missing as $mSql) {
                    try {
                        $pdo->exec("ALTER TABLE quiz_sessions " . $mSql);
                    } catch (Throwable $e) {}
                }
                try {
                    $cols = $pdo->query("SHOW COLUMNS FROM quiz_sessions")->fetchAll(PDO::FETCH_COLUMN);
                    $colMap = array_fill_keys($cols, true);
                } catch (Throwable $e) {}
            }
        }
        $hasCountdown = isset($colMap['countdown_started_at']);
    } catch (Throwable $t) {
        $hasCountdown = false;
    }
    return $hasCountdown;
}

// -------------------------------------------------------------------------
// 3. PARAMETER PARSING & STRUCTURED AUDIT LOGGING
// -------------------------------------------------------------------------
@set_time_limit(60);
@ignore_user_abort(false);

$sessionId = sanitize_string($_GET['session_id'] ?? '');
$role = sanitize_string($_GET['role'] ?? 'student');
$participantId = sanitize_string($_GET['participant_id'] ?? '');
$token = sanitize_string($_GET['token'] ?? '') ?: get_bearer_token();
$lastEventId = sanitize_string($_SERVER['HTTP_LAST_EVENT_ID'] ?? ($_GET['last_event_id'] ?? ''));

// Structured Audit Log: Request Received
error_log(sprintf(
    "[SINESA_STREAM_AUDIT] REQ_START time=%s session_id=%s role=%s participant_id=%s last_event_id=%s ip=%s",
    date('c'),
    $sessionId ?: 'empty',
    $role,
    $participantId ?: 'none',
    $lastEventId ?: 'none',
    $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'
));

if ($sessionId === '') {
    error_log(sprintf("[SINESA_STREAM_AUDIT] VALIDATION_FAILED reason=empty_session_id ip=%s", $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1'));
    send_sse_event('error', ['message' => 'Parameter session_id wajib disertakan']);
    exit(0);
}

// Database Connection with graceful error handling
try {
    $pdo = Database::getConnection(true);
} catch (Throwable $dbErr) {
    error_log(sprintf("[SINESA_STREAM_AUDIT] DB_FATAL session_id=%s error=%s", $sessionId, $dbErr->getMessage()));
    send_sse_event('error', ['message' => 'Gagal menghubungkan ke database server']);
    exit(0);
}

// Verify session existence in database
try {
    $sessCheck = $pdo->prepare("SELECT id, quiz_id, host_id, status FROM quiz_sessions WHERE id = :sid LIMIT 1");
    $sessCheck->execute([':sid' => $sessionId]);
    $sessionMeta = $sessCheck->fetch();

    if (!$sessionMeta) {
        error_log(sprintf("[SINESA_STREAM_AUDIT] SESSION_NOT_FOUND session_id=%s", $sessionId));
        send_sse_event('error', ['message' => 'Sesi kuis tidak ditemukan dalam database']);
        exit(0);
    }
} catch (Throwable $sessErr) {
    error_log(sprintf("[SINESA_STREAM_AUDIT] SESSION_VERIFY_ERROR session_id=%s error=%s", $sessionId, $sessErr->getMessage()));
    send_sse_event('error', ['message' => 'Gagal memverifikasi sesi kuis']);
    exit(0);
}

// Optional Auth token decoding
$authUser = null;
if (!empty($token)) {
    try {
        $authUser = JWT::decodeToken($token);
    } catch (Throwable $jwtErr) {
        $authUser = null;
    }
}

// Role authorization for host
if ($role === 'host') {
    if (!$authUser) {
        error_log(sprintf("[SINESA_STREAM_AUDIT] AUTH_HOST_REQUIRED session_id=%s", $sessionId));
        send_sse_event('error', ['message' => 'Otentikasi host diperlukan.']);
        exit(0);
    }
    $userRole = (string)($authUser['role'] ?? 'teacher');
    $userId = (string)($authUser['sub'] ?? '');
    if ($userRole === 'teacher' && (string)($sessionMeta['host_id'] ?? '') !== $userId) {
        error_log(sprintf("[SINESA_STREAM_AUDIT] AUTH_HOST_FORBIDDEN session_id=%s host_id=%s user_id=%s", $sessionId, $sessionMeta['host_id'], $userId));
        send_sse_event('error', ['message' => 'Akses ditolak. Anda tidak memiliki izin untuk memandu sesi kuis ini.']);
        exit(0);
    }
}

error_log(sprintf("[SINESA_STREAM_AUDIT] AUTH_OK session_id=%s role=%s user=%s", $sessionId, $role, $authUser ? ($authUser['sub'] ?? 'unknown') : 'student'));

// Initial 4KB padding to defeat proxy / Apache buffer + retry instruction
echo ":" . str_repeat(" ", 4096) . "\n\n";
echo "retry: 3000\n\n"; // 3s retry interval avoids stampedes and thread exhaustion on reconnect
if (ob_get_level() > 0) {
    @ob_flush();
}
@flush();

// -------------------------------------------------------------------------
// 4. STREAMING LOOP WITH PROCESS LIFECYCLE & IMMEDIATE ABORT DETECTION
// -------------------------------------------------------------------------
$startTime = time();
$maxDuration = 45; // 45s clean cycle prevents PHP-FPM / worker thread starvation

$lastStageSignature = null;
$lastTotalScore = -1;
$lastAnsCount = -1;
$lastTimerSecond = -1;
$heartbeatCount = 0;
$pingCount = 0;

// Initialize known participant IDs set to prevent missing participants on datetime collisions
$knownParticipantIds = [];
try {
    $initPartStmt = $pdo->prepare("
        SELECT id, session_id, student_id, display_name, score, lives, current_progress, joined_at
        FROM participants 
        WHERE session_id = :sid 
        ORDER BY score DESC, joined_at ASC
    ");
    $initPartStmt->execute([':sid' => $sessionId]);
    $initialParts = $initPartStmt->fetchAll();
    foreach ($initialParts as $ip) {
        $knownParticipantIds[(string)$ip['id']] = true;
    }

    // ponytail: Immediately emit initial synced participants to eliminate lobby lag on new connection
    if (!empty($initialParts)) {
        $syncedInitPayload = array_map(function($p) {
            return [
                'id'           => (string)$p['id'],
                'session_id'   => (string)$p['session_id'],
                'student_id'   => $p['student_id'] !== null ? (string)$p['student_id'] : null,
                'display_name' => (string)$p['display_name'],
                'score'        => (int)$p['score'],
                'lives'        => (int)$p['lives'],
                'joined_at'    => (string)$p['joined_at'],
            ];
        }, $initialParts);

        send_sse_event('ParticipantsSynced', [
            'session_id'   => $sessionId,
            'participants' => $syncedInitPayload,
            'count'        => count($initialParts),
            'timestamp'    => round(microtime(true) * 1000)
        ]);
    }
} catch (Throwable $e) {
    $knownParticipantIds = [];
}

try {
    while ((time() - $startTime) < $maxDuration) {
        if (connection_aborted()) {
            break;
        }

        try {
            // Single composite lightweight query to check all state changes at once
            $hasCountdown = ensure_session_countdown_columns($pdo);
            $cSelect = $hasCountdown
                ? "s.countdown_started_at, s.countdown_expires_at, s.countdown_duration,"
                : "NULL AS countdown_started_at, NULL AS countdown_expires_at, 3 AS countdown_duration,";

            $stmt = $pdo->prepare("
                SELECT 
                    s.id, s.quiz_id, s.host_id, s.status, s.current_stage,
                    s.current_question_index, {$cSelect}
                    s.question_started_at, s.question_expires_at,
                    s.quiz_mode, s.lives_count, s.completed_at,
                    s.show_final_result, s.show_leaderboard, s.show_correct_answer, s.show_answer_review,
                    s.show_question_result, s.show_explanation, s.show_score_per_question, s.show_question_statistics,
                    s.anti_cheat_enabled, s.fullscreen_required, s.auto_submit_on_violation,
                    (SELECT COUNT(*) FROM participants WHERE session_id = :sid1) AS part_count,
                    (SELECT COALESCE(SUM(score), 0) FROM participants WHERE session_id = :sid2) AS total_score,
                    (SELECT COUNT(*) FROM answers a INNER JOIN participants p ON a.participant_id = p.id WHERE p.session_id = :sid3) AS ans_count
                FROM quiz_sessions s
                WHERE s.id = :sid4
                LIMIT 1
            ");
            $stmt->execute([
                ':sid1' => $sessionId,
                ':sid2' => $sessionId,
                ':sid3' => $sessionId,
                ':sid4' => $sessionId,
            ]);
            $row = $stmt->fetch();

            if (!$row) {
                send_sse_event('error', ['message' => 'Sesi kuis telah dihapus']);
                break;
            }

            // 1. Stage & Question Changes
            $currentStage = (string)$row['current_stage'];
            $currentStatus = (string)$row['status'];
            $currentQIdx = (int)$row['current_question_index'];

            // ponytail: Server-side authority fallback: If countdown expired and stage is still 'countdown', auto-transition to 'question'
            if ($currentStage === 'countdown' && !empty($row['countdown_expires_at'])) {
                $cExpiresTs = strtotime((string)$row['countdown_expires_at']);
                if (microtime(true) >= $cExpiresTs) {
                    $qStartedAt = (string)$row['countdown_expires_at'];
                    $qExpiresAt = !empty($row['question_expires_at'])
                        ? (string)$row['question_expires_at']
                        : date('Y-m-d H:i:s.v', $cExpiresTs + 30);

                    try {
                        $autoUpd = $pdo->prepare("
                            UPDATE quiz_sessions 
                            SET current_stage = 'question', 
                                question_started_at = COALESCE(question_started_at, :qstart),
                                question_expires_at = COALESCE(question_expires_at, :qexp)
                            WHERE id = :sid AND current_stage = 'countdown'
                        ");
                        $autoUpd->execute([
                            ':qstart' => $qStartedAt,
                            ':qexp'   => $qExpiresAt,
                            ':sid'    => $sessionId
                        ]);
                    } catch (Throwable $updErr) {
                        // Tolerate concurrent update lock contention
                    }
                    $currentStage = 'question';
                    $row['current_stage'] = 'question';
                    $row['question_started_at'] = $qStartedAt;
                    $row['question_expires_at'] = $qExpiresAt;
                }
            }

            $stageSig = "{$currentStatus}:{$currentStage}:{$currentQIdx}:{$row['question_expires_at']}:{$row['countdown_expires_at']}";

            if ($stageSig !== $lastStageSignature) {
                $lastStageSignature = $stageSig;
                $nowServerMs = round(microtime(true) * 1000);
                $formatIso = function(?string $s): ?string {
                    if (!$s) return null;
                    $ts = strtotime($s);
                    return $ts !== false ? gmdate('Y-m-d\TH:i:s\Z', $ts) : null;
                };

                $cStartedIso = $formatIso($row['countdown_started_at']);
                $cExpiresIso = $formatIso($row['countdown_expires_at']);
                $qStartedIso = $formatIso($row['question_started_at']);
                $qExpiresIso = $formatIso($row['question_expires_at']);

                $sessionPayload = [
                    'id'                       => (string)$row['id'],
                    'quiz_id'                  => (string)$row['quiz_id'],
                    'host_id'                  => (string)$row['host_id'],
                    'status'                   => $currentStatus,
                    'current_stage'            => $currentStage,
                    'current_question_index'   => $currentQIdx,
                    'countdown_started_at'     => $cStartedIso,
                    'countdown_expires_at'     => $cExpiresIso,
                    'countdown_duration'       => (int)($row['countdown_duration'] ?? 3),
                    'server_time'              => $nowServerMs,
                    'question_started_at'      => $qStartedIso,
                    'question_expires_at'      => $qExpiresIso,
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
                    'completed_at'             => $row['completed_at'] !== null ? (string)$row['completed_at'] : null,
                ];

                send_sse_event('StageChanged', [
                    'stage'                  => $currentStage,
                    'status'                 => $currentStatus,
                    'current_question_index' => $currentQIdx,
                    'countdown_started_at'   => $cStartedIso,
                    'countdown_expires_at'   => $cExpiresIso,
                    'countdown_duration'     => (int)($row['countdown_duration'] ?? 3),
                    'server_time'            => $nowServerMs,
                    'session'                => $sessionPayload,
                    'timestamp'              => $nowServerMs
                ]);
            }

            // 1b. CountdownTick Event (When stage is 'countdown' and has expires_at)
            if ($currentStage === 'countdown' && !empty($row['countdown_expires_at'])) {
                $cExpiresTs = strtotime((string)$row['countdown_expires_at']);
                $nowTs = microtime(true);
                $remainSec = max(0, (int)ceil($cExpiresTs - $nowTs));
                send_sse_event('CountdownTick', [
                    'remaining_seconds'    => $remainSec,
                    'countdown_started_at' => gmdate('Y-m-d\TH:i:s\Z', strtotime((string)$row['countdown_started_at'])),
                    'countdown_expires_at' => gmdate('Y-m-d\TH:i:s\Z', $cExpiresTs),
                    'countdown_duration'   => (int)($row['countdown_duration'] ?? 3),
                    'server_time'          => round($nowTs * 1000),
                    'timestamp'            => round($nowTs * 1000)
                ]);
            }

            // 2. TimerTick Event (When stage is 'question' and has expires_at)
            if ($currentStage === 'question' && !empty($row['question_expires_at'])) {
                $expiresTs = strtotime((string)$row['question_expires_at']);
                $nowTs = microtime(true);
                $remainSec = max(0, (int)ceil($expiresTs - $nowTs));
                if ($remainSec !== $lastTimerSecond) {
                    $lastTimerSecond = $remainSec;
                    $nowMs = round($nowTs * 1000);
                    $formatIso = function(?string $s): ?string {
                        if (!$s) return null;
                        $ts = strtotime($s);
                        return $ts !== false ? gmdate('Y-m-d\TH:i:s\Z', $ts) : null;
                    };
                    send_sse_event('TimerTick', [
                        'remaining_seconds'   => $remainSec,
                        'question_started_at' => $formatIso($row['question_started_at']),
                        'question_expires_at' => $formatIso($row['question_expires_at']),
                        'server_time'         => $nowMs,
                        'timestamp'           => $nowMs
                    ]);
                }
            }

            // 3. Participant Joined & Left Events (ID Set Diff Algorithm - immune to datetime second collisions)
            $partCount = (int)$row['part_count'];
            if ($partCount !== count($knownParticipantIds)) {
                $allPartStmt = $pdo->prepare("
                    SELECT id, session_id, student_id, display_name, score, lives, current_progress, joined_at
                    FROM participants 
                    WHERE session_id = :sid 
                    ORDER BY score DESC, joined_at ASC
                ");
                $allPartStmt->execute([':sid' => $sessionId]);
                $currentParticipants = $allPartStmt->fetchAll();

                $currentIds = [];
                $newParticipants = [];
                foreach ($currentParticipants as $p) {
                    $pId = (string)$p['id'];
                    $currentIds[$pId] = true;
                    if (!isset($knownParticipantIds[$pId])) {
                        $newParticipants[] = $p;
                    }
                }

                // Emit ParticipantJoined for every newly joined participant
                foreach ($newParticipants as $newP) {
                    send_sse_event('ParticipantJoined', [
                        'participant' => [
                            'id'           => (string)$newP['id'],
                            'session_id'   => (string)$newP['session_id'],
                            'student_id'   => $newP['student_id'] !== null ? (string)$newP['student_id'] : null,
                            'display_name' => (string)$newP['display_name'],
                            'score'        => (int)$newP['score'],
                            'lives'        => (int)$newP['lives'],
                            'joined_at'    => (string)$newP['joined_at'],
                        ],
                        'count'       => count($currentParticipants),
                        'timestamp'   => round(microtime(true) * 1000)
                    ]);
                }

                // Emit ParticipantLeft & Sync if someone left
                $leftCount = 0;
                foreach (array_keys($knownParticipantIds) as $oldId) {
                    if (!isset($currentIds[$oldId])) {
                        $leftCount++;
                        send_sse_event('ParticipantLeft', [
                            'id'         => $oldId,
                            'session_id' => $sessionId,
                            'count'      => count($currentParticipants),
                            'timestamp'  => round(microtime(true) * 1000)
                        ]);
                    }
                }

                if ($leftCount > 0 || count($newParticipants) > 1) {
                    $syncedPayload = array_map(function($p) {
                        return [
                            'id'           => (string)$p['id'],
                            'session_id'   => (string)$p['session_id'],
                            'student_id'   => $p['student_id'] !== null ? (string)$p['student_id'] : null,
                            'display_name' => (string)$p['display_name'],
                            'score'        => (int)$p['score'],
                            'lives'        => (int)$p['lives'],
                            'joined_at'    => (string)$p['joined_at'],
                        ];
                    }, $currentParticipants);

                    send_sse_event('ParticipantsSynced', [
                        'session_id'   => $sessionId,
                        'participants' => $syncedPayload,
                        'count'        => count($currentParticipants),
                        'timestamp'    => round(microtime(true) * 1000)
                    ]);
                }

                $knownParticipantIds = $currentIds;
            }

            // 4. AnswerSubmitted Event (Broadcast latest answers and count)
            $ansCount = (int)$row['ans_count'];
            if ($lastAnsCount !== -1 && $ansCount > $lastAnsCount) {
                $deltaAns = max(1, min(20, $ansCount - $lastAnsCount));
                $ansStmt = $pdo->prepare("
                    SELECT a.id, a.participant_id, a.question_id, a.selected_option_id, a.is_correct, a.score_awarded, a.answered_at
                    FROM answers a
                    INNER JOIN participants p ON a.participant_id = p.id
                    WHERE p.session_id = :sid
                    ORDER BY a.answered_at DESC
                    LIMIT {$deltaAns}
                ");
                $ansStmt->execute([':sid' => $sessionId]);
                $newAnswers = $ansStmt->fetchAll();
                foreach (array_reverse($newAnswers) as $ans) {
                    send_sse_event('AnswerSubmitted', [
                        'total_answers' => $ansCount,
                        'answer'        => [
                            'id'                 => (string)$ans['id'],
                            'participant_id'     => (string)$ans['participant_id'],
                            'question_id'        => (string)$ans['question_id'],
                            'selected_option_id' => $ans['selected_option_id'] !== null ? (string)$ans['selected_option_id'] : null,
                            'is_correct'         => (bool)$ans['is_correct'],
                            'score_awarded'      => (int)$ans['score_awarded'],
                            'answered_at'        => (string)$ans['answered_at'],
                        ],
                        'timestamp'     => round(microtime(true) * 1000)
                    ]);
                }
            }
            $lastAnsCount = $ansCount;

            // 5. LeaderboardUpdated Event (When total scores change or on first tick if scores exist)
            $totalScore = (int)$row['total_score'];
            if (($lastTotalScore === -1 && $totalScore > 0) || ($lastTotalScore !== -1 && $totalScore !== $lastTotalScore)) {
                $topStmt = $pdo->prepare("
                    SELECT 
                        p.id, p.session_id, p.student_id, p.display_name, p.score, p.lives, 
                        p.current_progress, p.is_completed, p.joined_at,
                        pr.avatar_url
                    FROM participants p
                    LEFT JOIN profiles pr ON p.student_id = pr.id
                    WHERE p.session_id = :sid 
                    ORDER BY p.score DESC, p.joined_at ASC 
                    LIMIT 50
                ");
                $topStmt->execute([':sid' => $sessionId]);
                $topList = $topStmt->fetchAll();
                $rankIdx = 1;
                $leaderboardPayload = array_map(function($p) use (&$rankIdx) {
                    return [
                        'id'               => (string)$p['id'],
                        'session_id'       => (string)$p['session_id'],
                        'student_id'       => $p['student_id'] !== null ? (string)$p['student_id'] : null,
                        'display_name'     => (string)$p['display_name'],
                        'score'            => (int)$p['score'],
                        'rank'             => $rankIdx++,
                        'lives'            => (int)$p['lives'],
                        'avatar_url'       => $p['avatar_url'] !== null ? (string)$p['avatar_url'] : null,
                        'current_progress' => (int)$p['current_progress'],
                        'is_completed'     => (bool)$p['is_completed'],
                        'joined_at'        => (string)$p['joined_at'],
                    ];
                }, $topList);

                send_sse_event('LeaderboardUpdated', [
                    'leaderboard' => $leaderboardPayload,
                    'total_score' => $totalScore,
                    'timestamp'   => round(microtime(true) * 1000)
                ]);
            }
            $lastTotalScore = $totalScore;

            // 6. Heartbeat every ~5 seconds
            $heartbeatCount++;
            if ($heartbeatCount >= 10) {
                $heartbeatCount = 0;
                send_sse_event('heartbeat', [
                    'status'    => 'alive',
                    'time'      => date('c'),
                    'timestamp' => round(microtime(true) * 1000)
                ]);
            }

            // 7. Frequent comment ping (~2s) to immediately detect client disconnection
            $pingCount++;
            if ($pingCount >= 4) {
                $pingCount = 0;
                echo ": ping\n\n";
                if (ob_get_level() > 0) {
                    @ob_flush();
                }
                @flush();
            }

            // ponytail: Adaptive tick sleep
            $sleepDuration = ($currentStage === 'waiting')
                ? 500000 
                : (($currentStage === 'countdown') ? 250000 : (($currentStage === 'question') ? 350000 : 500000));
            usleep($sleepDuration);

        } catch (Throwable $innerErr) {
            error_log(sprintf("[SINESA_STREAM_AUDIT] CYCLE_ERROR session_id=%s error=%s", $sessionId, $innerErr->getMessage()));
            
            // Reconnect DB if MySQL connection dropped
            if (in_array((int)$innerErr->getCode(), [2006, 2013], true) || str_contains($innerErr->getMessage(), 'server has gone away')) {
                Database::resetConnection();
                try {
                    $pdo = Database::getConnection(true);
                } catch (Throwable $reconnectErr) {
                    error_log("[SINESA_STREAM_AUDIT] RECONNECT_FAILED " . $reconnectErr->getMessage());
                }
            }
            usleep(250000); // Backoff briefly on transient error
        }
    }
} catch (Throwable $outerErr) {
    error_log(sprintf("[SINESA_STREAM_AUDIT] OUTER_ERROR session_id=%s error=%s", $sessionId, $outerErr->getMessage()));
    send_sse_event('error', ['message' => 'Terjadi kesalahan pada stream realtime']);
}

// Clean termination: send refresh heartbeat and close connection cleanly
$exitReason = connection_aborted() ? 'client_aborted' : 'cycle_refresh';
error_log(sprintf(
    "[SINESA_STREAM_AUDIT] REQ_END time=%s session_id=%s reason=%s duration=%.2fs",
    date('c'),
    $sessionId,
    $exitReason,
    microtime(true) - $scriptStartFloat
));

if (!connection_aborted()) {
    send_sse_event('heartbeat', [
        'action'    => 'cycle_refresh',
        'timestamp' => round(microtime(true) * 1000)
    ]);
}
exit(0);
