<?php
/**
 * Authentication: Logout Endpoint
 * Revokes session by invalidating the access token, refresh token, and clearing cookies.
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Handle CORS Preflight
handle_cors_preflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_error_response('Metode permintaan tidak valid. Gunakan POST.', 405);
}

// 1. Extract access token from Authorization header or JSON body
$authHeader = get_bearer_token();
$input = get_json_input();
if (empty($authHeader)) {
    $authHeader = sanitize_string($input['access_token'] ?? $input['token'] ?? '');
}

$auth = !empty($authHeader) ? JWT::decode($authHeader, null, false) : null;
$userId = ($auth && isset($auth['sub'])) ? (string)$auth['sub'] : null;

// 2. Revoke access token if provided
if (!empty($authHeader)) {
    JWT::revokeToken($authHeader, $userId);
}

// 3. Extract and revoke refresh token if provided via cookie or body
$cookieRefresh = JWT::getRefreshTokenFromCookie();
if (empty($cookieRefresh)) {
    $cookieRefresh = sanitize_string($input['refresh_token'] ?? '');
}
if (!empty($cookieRefresh)) {
    JWT::revokeToken($cookieRefresh, $userId);
}

// 4. Clear HttpOnly refresh token cookie
JWT::clearRefreshTokenCookie();

// 5. Optional: Log activity if user identified
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
    'message' => 'Berhasil keluar dari sesi dan token dicabut.',
]);

