<?php
/**
 * SINESA REST API: Admin Statistics & System Telemetry Endpoint
 * Path: /api/admin/stats.php
 *
 * Security:
 * Enforces require_role('admin') - Teachers and Students are strictly blocked with HTTP 403.
 *
 * Provides:
 * - User metrics (total, teachers, students, admins, active/inactive)
 * - Quiz metrics (total, active, inactive)
 * - Session metrics (total, active, lobby, completed)
 * - Gameplay metrics (participants, answers, correct answers)
 * - Recent activity logs with user info
 * - Storage & system telemetry
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Handle CORS Preflight
handle_cors_preflight();

// Enforce Administrator Role
$admin = require_role('admin');

$pdo = get_db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method !== 'GET') {
    send_error_response('Metode HTTP tidak didukung.', 405);
}

try {
    // 1. User metrics
    $userStats = $pdo->query("
        SELECT 
            COUNT(*) AS total_users,
            SUM(CASE WHEN role = 'teacher' THEN 1 ELSE 0 END) AS total_teachers,
            SUM(CASE WHEN role = 'student' THEN 1 ELSE 0 END) AS total_students,
            SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS total_admins,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_users,
            SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_users
        FROM profiles
    ")->fetch();

    // 2. Quiz metrics
    $quizStats = $pdo->query("
        SELECT 
            COUNT(*) AS total_quizzes,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_quizzes,
            SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive_quizzes
        FROM quizzes
    ")->fetch();

    // 3. Quiz session metrics
    $sessionStats = $pdo->query("
        SELECT 
            COUNT(*) AS total_sessions,
            SUM(CASE WHEN status = 'lobby' THEN 1 ELSE 0 END) AS lobby_sessions,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_sessions,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_sessions
        FROM quiz_sessions
    ")->fetch();

    // 4. Gameplay & Answer metrics
    $partCount = (int)$pdo->query("SELECT COUNT(*) FROM participants")->fetchColumn();
    $answerStats = $pdo->query("
        SELECT 
            COUNT(*) AS total_answers,
            SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS total_correct_answers,
            COALESCE(AVG(score_awarded), 0) AS average_score
        FROM answers
    ")->fetch();

    // 5. Storage metrics
    $mediaStats = $pdo->query("
        SELECT 
            COUNT(*) AS total_media,
            COALESCE(SUM(file_size), 0) AS total_bytes
        FROM media_files
    ")->fetch();

    // 6. Recent activity logs (latest 25)
    $logStmt = $pdo->query("
        SELECT 
            l.id, l.user_id, l.action, l.details, l.created_at,
            p.full_name AS user_name, p.role AS user_role, p.email AS user_email
        FROM activity_logs l
        LEFT JOIN profiles p ON l.user_id = p.id
        ORDER BY l.created_at DESC
        LIMIT 25
    ");
    $recentLogs = $logStmt->fetchAll();

    // 7. Recent active/completed sessions (latest 10)
    $sessStmt = $pdo->query("
        SELECT 
            s.id, s.quiz_id, s.host_id, s.status, s.current_stage, s.current_question_index,
            s.quiz_mode, s.created_at, s.completed_at,
            q.title AS quiz_title,
            p.full_name AS host_name,
            (SELECT COUNT(*) FROM participants WHERE session_id = s.id) AS participant_count
        FROM quiz_sessions s
        LEFT JOIN quizzes q ON s.quiz_id = q.id
        LEFT JOIN profiles p ON s.host_id = p.id
        ORDER BY s.created_at DESC
        LIMIT 10
    ");
    $recentSessions = $sessStmt->fetchAll();

    $response = [
        'users' => [
            'total'     => (int)($userStats['total_users'] ?? 0),
            'teachers'  => (int)($userStats['total_teachers'] ?? 0),
            'students'  => (int)($userStats['total_students'] ?? 0),
            'admins'    => (int)($userStats['total_admins'] ?? 0),
            'active'    => (int)($userStats['active_users'] ?? 0),
            'inactive'  => (int)($userStats['inactive_users'] ?? 0),
        ],
        'quizzes' => [
            'total'    => (int)($quizStats['total_quizzes'] ?? 0),
            'active'   => (int)($quizStats['active_quizzes'] ?? 0),
            'inactive' => (int)($quizStats['inactive_quizzes'] ?? 0),
        ],
        'sessions' => [
            'total'     => (int)($sessionStats['total_sessions'] ?? 0),
            'lobby'     => (int)($sessionStats['lobby_sessions'] ?? 0),
            'active'    => (int)($sessionStats['active_sessions'] ?? 0),
            'completed' => (int)($sessionStats['completed_sessions'] ?? 0),
        ],
        'gameplay' => [
            'total_participants' => $partCount,
            'total_answers'      => (int)($answerStats['total_answers'] ?? 0),
            'correct_answers'    => (int)($answerStats['total_correct_answers'] ?? 0),
            'average_score'      => round((float)($answerStats['average_score'] ?? 0), 1),
        ],
        'storage' => [
            'total_files' => (int)($mediaStats['total_media'] ?? 0),
            'total_bytes' => (int)($mediaStats['total_bytes'] ?? 0),
        ],
        'recent_logs' => array_map(function($l) {
            return [
                'id'         => (string)$l['id'],
                'user_id'    => $l['user_id'] !== null ? (string)$l['user_id'] : null,
                'user_name'  => (string)($l['user_name'] ?? 'Sistem'),
                'user_role'  => (string)($l['user_role'] ?? 'system'),
                'action'     => (string)$l['action'],
                'details'    => (string)($l['details'] ?? ''),
                'created_at' => (string)$l['created_at'],
            ];
        }, $recentLogs),
        'recent_sessions' => array_map(function($s) {
            return [
                'id'                => (string)$s['id'],
                'quiz_id'           => (string)$s['quiz_id'],
                'quiz_title'        => (string)($s['quiz_title'] ?? 'Kuis Tanpa Judul'),
                'host_name'         => (string)($s['host_name'] ?? 'Guru'),
                'status'            => (string)$s['status'],
                'current_stage'     => (string)$s['current_stage'],
                'participant_count' => (int)($s['participant_count'] ?? 0),
                'created_at'        => (string)$s['created_at'],
                'completed_at'      => $s['completed_at'] !== null ? (string)$s['completed_at'] : null,
            ];
        }, $recentSessions),
        'server' => [
            'php_version' => PHP_VERSION,
            'server_time' => date('Y-m-d H:i:s'),
        ]
    ];

    send_success_response($response);

} catch (\PDOException $e) {
    error_log('Admin Stats Database Error: ' . $e->getMessage());
    send_error_response('Gagal memuat statistik database: ' . $e->getMessage(), 500);
} catch (\Throwable $e) {
    error_log('Admin Stats Error: ' . $e->getMessage());
    send_error_response('Gagal memuat statistik sistem.', 500);
}
