<?php
/**
 * Authentication: Token Refresh Endpoint
 * Uses HttpOnly cookie refresh token to issue a fresh access token without re-entering password.
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

// 1. Retrieve refresh token from secure HttpOnly cookie (or body fallback)
$refreshToken = JWT::getRefreshTokenFromCookie();

if (!$refreshToken) {
    $input = get_json_input();
    $refreshToken = sanitize_string($input['refresh_token'] ?? '');
}

if (!$refreshToken) {
    send_error_response('Sesi autentikasi telah berakhir. Refresh token tidak ditemukan.', 401);
}

// 2. Decode and verify refresh token
$payload = JWT::decode($refreshToken);

if (!$payload || ($payload['type'] ?? '') !== 'refresh' || empty($payload['sub'])) {
    JWT::clearRefreshTokenCookie();
    send_error_response('Sesi autentikasi tidak valid atau telah kedaluwarsa. Silakan masuk kembali.', 401);
}

$userId = (string)$payload['sub'];
$pdo = get_db();

try {
    // 3. Verify user still exists and is active in database
    $stmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch();

    if (!$user) {
        JWT::clearRefreshTokenCookie();
        send_error_response('Pengguna tidak ditemukan dalam sistem.', 401);
    }

    if (isset($user['status']) && $user['status'] === 'inactive') {
        JWT::clearRefreshTokenCookie();
        send_error_response('Akun Anda dinonaktifkan. Hubungi Administrator.', 403);
    }

    // 4. Issue new Access Token (15 mins)
    $newAccessToken = JWT::createAccessToken($user, 900);

    // 5. Rotate Refresh Token (Sliding window renewal)
    $newRefreshToken = JWT::createRefreshToken($userId, 604800);
    JWT::setRefreshTokenCookie($newRefreshToken, 604800);

    $authPayload = JWT::formatAuthPayload($user);

    send_success_response([
        'access_token' => $newAccessToken,
        'token_type'   => 'Bearer',
        'expires_in'   => 900,
        'user'         => $authPayload['user'],
        'profile'      => $authPayload['profile'],
    ]);

} catch (Throwable $e) {
    error_log('[AUTH_REFRESH_ERROR] ' . $e->getMessage());
    send_error_response('Gagal memperbarui sesi autentikasi.', 500);
}
