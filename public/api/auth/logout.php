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

// 1. Revoke access token if provided in Authorization header
$authHeader = get_bearer_token();
$auth = get_optional_auth();
$userId = ($auth && isset($auth['sub'])) ? $auth['sub'] : null;

if (!empty($authHeader)) {
    JWT::revokeToken($authHeader, $userId);
}

// 2. Revoke refresh token if cookie exists
$cookieRefresh = JWT::getRefreshTokenFromCookie();
if (!empty($cookieRefresh)) {
    JWT::revokeToken($cookieRefresh, $userId);
}

// 3. Clear HttpOnly refresh token cookie
JWT::clearRefreshTokenCookie();

// 4. Optional: Log activity if user provided access token
if ($userId) {
    try {
        $pdo = get_db();
        $logStmt = $pdo->prepare("INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (:id, :uid, 'LOGOUT', 'Keluar dari sistem', NOW())");
        $logStmt->execute([
            ':id'  => generate_uuid(),
            ':uid' => $userId,
        ]);
    } catch (Throwable $t) {
        error_log('[LOGOUT_LOG_ERROR] ' . $t->getMessage());
    }
}

send_success_response([
    'message' => 'Berhasil keluar dari sesi.',
]);
