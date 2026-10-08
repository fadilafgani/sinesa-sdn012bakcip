<?php
/**
 * Authentication: Get Current Profile / Me Endpoint
 * Verifies active Bearer token and returns current user and profile data.
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../middleware/auth.php';

// Handle CORS Preflight
handle_cors_preflight();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'PUT', 'PATCH'], true)) {
    send_error_response('Metode permintaan tidak valid. Gunakan GET, PUT, atau PATCH.', 405);
}

// 1. Enforce authentication
$auth = require_auth();
$userId = (string)($auth['sub'] ?? '');

$pdo = get_db();

try {
    if ($method === 'PUT' || $method === 'PATCH') {
        $input = get_json_input();
        $updates = [];
        $params = [':id' => $userId];

        if (isset($input['full_name'])) {
            $fullName = sanitize_string((string)$input['full_name']);
            if ($fullName !== '') {
                $updates[] = 'full_name = :full_name';
                $params[':full_name'] = $fullName;
            }
        }

        if (isset($input['avatar_url'])) {
            $avatarUrl = sanitize_string((string)$input['avatar_url']);
            $updates[] = 'avatar_url = :avatar_url';
            $params[':avatar_url'] = $avatarUrl !== '' ? $avatarUrl : null;
        }

        if (isset($input['username'])) {
            $username = sanitize_string((string)$input['username']);
            if ($username !== '') {
                $check = $pdo->prepare("SELECT id FROM profiles WHERE username = :username AND id != :id LIMIT 1");
                $check->execute([':username' => $username, ':id' => $userId]);
                if ($check->fetch()) {
                    send_error_response('Nama pengguna sudah digunakan akun lain.', 409);
                }
                $updates[] = 'username = :username';
                $params[':username'] = $username;
            }
        }

        if (!empty($updates)) {
            $sql = "UPDATE profiles SET " . implode(', ', $updates) . " WHERE id = :id";
            $updateStmt = $pdo->prepare($sql);
            $updateStmt->execute($params);
        }
    }
    $stmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $userId]);
    $user = $stmt->fetch();

    if (!$user) {
        send_error_response('Profil pengguna tidak ditemukan.', 404);
    }

    if (isset($user['status']) && $user['status'] === 'inactive') {
        send_error_response('Akun Anda dinonaktifkan.', 403);
    }

    $authPayload = JWT::formatAuthPayload($user);

    send_success_response([
        'user'    => $authPayload['user'],
        'profile' => $authPayload['profile'],
    ]);

} catch (Throwable $e) {
    error_log('[AUTH_ME_ERROR] ' . $e->getMessage());
    send_error_response('Gagal memuat profil pengguna.', 500);
}
