<?php
/**
 * SINESA Server-Sent Events (SSE) Realtime Engine
 * GET /api/realtime/stream.php
 *
 * Provides live server-to-client event streaming for Quiz Sessions:
 * - StageChanged: Session stage transitions (waiting, countdown, question, result, leaderboard, finished)
 * - TimerTick: Live second-by-second countdown during question stage
 * - ParticipantJoined: Immediate notification when students join
 * - AnswerSubmitted: Realtime answer count update for host/teacher
 * - LeaderboardUpdated: Live scoreboard changes when scores update
 * - heartbeat: Keep-alive signal and connection watchdog
 *
 * Architect-optimized for cPanel/Apache Shared Hosting:
 * - Anti-buffering headers (X-Accel-Buffering: no, ob_implicit_flush)
 * - Lightweight single composite query per cycle (zero redundant DB queries)
 * - 25-second clean process cycle to prevent PHP-FPM Entry Process exhaustion
 * - Deduplication event IDs (id: <timestamp>_<random>)
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/jwt.php';

// -------------------------------------------------------------------------
// 1. ANTI-BUFFERING & SSE STREAMING HEADERS
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
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

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

$pdo = get_db();

// -------------------------------------------------------------------------
// 2. VALIDATION: SESSION ID & AUTHENTICATION
// -------------------------------------------------------------------------
$sessionId = sanitize_string($_GET['session_id'] ?? '');
$role = sanitize_string($_GET['role'] ?? 'student');
$participantId = sanitize_string($_GET['participant_id'] ?? '');
$token = sanitize_string($_GET['token'] ?? '') ?: get_bearer_token();

if ($sessionId === '') {
    send_sse_event('error', ['message' => 'Parameter session_id wajib disertakan']);
    exit(0);
}

// Verify session existence in database
$sessCheck = $pdo->prepare("SELECT id, quiz_id, host_id, status FROM quiz_sessions WHERE id = :sid LIMIT 1");
$sessCheck->execute([':sid' => $sessionId]);
$sessionMeta = $sessCheck->fetch();

if (!$sessionMeta) {
    send_sse_event('error', ['message' => 'Sesi kuis tidak ditemukan dalam database']);
    exit(0);
}

// Optional Auth token decoding
$authUser = null;
if (!empty($token)) {
    $authUser = JWT::decodeToken($token);
}

// Initial 2KB padding to defeat proxy / Apache buffer + retry instruction
echo ":" . str_repeat(" ", 2048) . "\n\n";
echo "retry: 500\n\n";
if (ob_get_level() > 0) {
    @ob_flush();
}
@flush();

// -------------------------------------------------------------------------
// 3. STREAMING LOOP WITH 12-SECOND PROCESS LIFECYCLE
// -------------------------------------------------------------------------
$startTime = time();
$maxDuration = 12; // Short cycle to avoid PHP worker exhaustion on shared hosting

$lastStageSignature = null;
$lastPartCount = -1;
$lastTotalScore = -1;
$lastAnsCount = -1;
$lastTimerSecond = -1;
$heartbeatCount = 0;

while ((time() - $startTime) < $maxDuration) {
    if (connection_aborted()) {
        break;
    }

    // Single composite lightweight query to check all state changes at once
    $stmt = $pdo->prepare("
        SELECT 
            s.id, s.quiz_id, s.host_id, s.status, s.current_stage,
            s.current_question_index, s.question_started_at, s.question_expires_at,
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
    $stageSig = "{$currentStatus}:{$currentStage}:{$currentQIdx}:{$row['question_expires_at']}";

    if ($stageSig !== $lastStageSignature) {
        $lastStageSignature = $stageSig;
        $sessionPayload = [
            'id'                       => (string)$row['id'],
            'quiz_id'                  => (string)$row['quiz_id'],
            'host_id'                  => (string)$row['host_id'],
            'status'                   => $currentStatus,
            'current_stage'            => $currentStage,
            'current_question_index'   => $currentQIdx,
            'question_started_at'      => $row['question_started_at'] !== null ? (string)$row['question_started_at'] : null,
            'question_expires_at'      => $row['question_expires_at'] !== null ? (string)$row['question_expires_at'] : null,
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
            'session'                => $sessionPayload,
            'timestamp'              => round(microtime(true) * 1000)
        ]);
    }

    // 2. TimerTick Event (When stage is 'question' and has expires_at)
    if ($currentStage === 'question' && !empty($row['question_expires_at'])) {
        $expiresTs = strtotime((string)$row['question_expires_at']);
        $remainSec = max(0, $expiresTs - time());
        if ($remainSec !== $lastTimerSecond) {
            $lastTimerSecond = $remainSec;
            send_sse_event('TimerTick', [
                'remaining_seconds'   => $remainSec,
                'question_started_at' => (string)$row['question_started_at'],
                'question_expires_at' => (string)$row['question_expires_at'],
                'timestamp'           => round(microtime(true) * 1000)
            ]);
        }
    }

    // 3. ParticipantJoined Event (Supports single and multiple participants)
    $partCount = (int)$row['part_count'];
    if ($lastPartCount !== -1 && $partCount > $lastPartCount) {
        $delta = min(50, $partCount - $lastPartCount);
        $newPartStmt = $pdo->prepare("
            SELECT id, session_id, student_id, display_name, score, lives, current_progress, joined_at
            FROM participants 
            WHERE session_id = :sid 
            ORDER BY joined_at DESC 
            LIMIT {$delta}
        ");
        $newPartStmt->execute([':sid' => $sessionId]);
        $newParticipants = $newPartStmt->fetchAll();
        foreach (array_reverse($newParticipants) as $newP) {
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
                'count'       => $partCount,
                'timestamp'   => round(microtime(true) * 1000)
            ]);
        }
    }
    $lastPartCount = $partCount;

    // 4. AnswerSubmitted Event (Broadcast latest answers and count)
    $ansCount = (int)$row['ans_count'];
    if ($lastAnsCount !== -1 && $ansCount > $lastAnsCount) {
        $deltaAns = min(20, $ansCount - $lastAnsCount);
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

    // 5. LeaderboardUpdated Event (When total scores change)
    $totalScore = (int)$row['total_score'];
    if ($lastTotalScore !== -1 && $totalScore !== $lastTotalScore) {
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

    // 6. Heartbeat every 5 seconds
    $heartbeatCount++;
    if ($heartbeatCount >= 5) {
        $heartbeatCount = 0;
        send_sse_event('heartbeat', [
            'status'    => 'alive',
            'time'      => date('c'),
            'timestamp' => round(microtime(true) * 1000)
        ]);
    }

    // Sleep 700ms before next tick for fast reaction time
    usleep(700000);
}

// Clean termination: send refresh heartbeat and close connection cleanly so PHP-FPM process dies
send_sse_event('heartbeat', [
    'action'    => 'cycle_refresh',
    'timestamp' => round(microtime(true) * 1000)
]);
exit(0);
