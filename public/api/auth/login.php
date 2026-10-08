<?php
/**
 * Authentication: Login Endpoint
 * Verifies credentials with password_verify(), generates access token & HttpOnly refresh token.
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

$input = get_json_input();
if (empty($input)) {
    $input = $_POST;
}

$identifier = sanitize_string($input['email'] ?? ($input['username'] ?? ''));
$password = (string)($input['password'] ?? '');

if ($identifier === '' || $password === '') {
    send_error_response('Email / Nama Pengguna dan kata sandi wajib diisi.', 400);
}

$pdo = get_db();

try {
    $stmt = $pdo->prepare("SELECT * FROM profiles WHERE email = :id_email OR username = :id_user LIMIT 1");
    $stmt->execute([
        ':id_email' => $identifier,
        ':id_user'  => $identifier,
    ]);
    $user = $stmt->fetch();

    if (!$user) {
        send_error_response('Email atau kata sandi tidak sesuai.', 401);
    }

    if (!password_verify($password, (string)$user['password_hash'])) {
        send_error_response('Email atau kata sandi tidak sesuai.', 401);
    }

    if (isset($user['status']) && $user['status'] === 'inactive') {
        send_error_response('Akun Anda sedang dinonaktifkan. Hubungi Administrator.', 403);
    }

    // 1. Generate Access Token (15 Minutes)
    $accessToken = JWT::createAccessToken($user, 900);

    // 2. Generate Refresh Token (7 Days) & Store in HttpOnly Cookie
    $refreshToken = JWT::createRefreshToken((string)$user['id'], 604800);
    JWT::setRefreshTokenCookie($refreshToken, 604800);

    // 3. Format payload for SINESA frontend
    $authPayload = JWT::formatAuthPayload($user);

    // 4. Record Activity Log
    try {
        $logStmt = $pdo->prepare("INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (:id, :uid, 'LOGIN', 'Masuk ke sistem', NOW())");
        $logStmt->execute([
            ':id'  => generate_uuid(),
            ':uid' => $user['id'],
        ]);
    } catch (Throwable $t) {
        error_log('[LOGIN_LOG_ERROR] ' . $t->getMessage());
    }

    send_success_response([
        'access_token' => $accessToken,
        'token_type'   => 'Bearer',
        'expires_in'   => 900,
        'user'         => $authPayload['user'],
        'profile'      => $authPayload['profile'],
    ]);

} catch (Throwable $e) {
    error_log('[AUTH_LOGIN_ERROR] ' . $e->getMessage());
    send_error_response('Terjadi kegagalan saat memproses autentikasi.', 500);
}
