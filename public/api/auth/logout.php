<?php
/**
 * Authentication: Logout Endpoint
 * Revokes session by expiring the HttpOnly refresh token cookie.
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/jwt.php';

// Handle CORS Preflight
handle_cors_preflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_error_response('Metode permintaan tidak valid. Gunakan POST.', 405);
}

// 1. Clear HttpOnly refresh token cookie
JWT::clearRefreshTokenCookie();

// 2. Optional: Log activity if user provided access token
$auth = get_optional_auth();
if ($auth && isset($auth['sub'])) {
    try {
        $pdo = get_db();
        $logStmt = $pdo->prepare("INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (:id, :uid, 'LOGOUT', 'Keluar dari sistem', NOW())");
        $logStmt->execute([
            ':id'  => generate_uuid(),
            ':uid' => $auth['sub'],
        ]);
    } catch (Throwable $t) {
        error_log('[LOGOUT_LOG_ERROR] ' . $t->getMessage());
    }
}

send_success_response([
    'message' => 'Berhasil keluar dari sesi.',
]);
