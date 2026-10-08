<?php
/**
 * Authentication: Register Endpoint
 * Creates new user profile with password_hash(PASSWORD_BCRYPT), issues initial JWT tokens.
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

$email = strtolower(sanitize_string($input['email'] ?? ''));
$password = (string)($input['password'] ?? '');
$fullName = sanitize_string($input['full_name'] ?? ($input['name'] ?? ''));
$rawRole = strtolower(sanitize_string($input['role'] ?? 'student'));
$username = sanitize_string($input['username'] ?? '');

// 1. Validation
if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    send_error_response('Alamat email tidak valid.', 400);
}

if (strlen($password) < 6) {
    send_error_response('Kata sandi minimal harus terdiri dari 6 karakter.', 400);
}

if ($fullName === '') {
    $fullName = explode('@', $email)[0];
}

// Map Indonesian aliases to canonical roles
$roleMap = [
    'guru'    => 'teacher',
    'teacher' => 'teacher',
    'murid'   => 'student',
    'siswa'   => 'student',
    'student' => 'student',
    'admin'   => 'admin',
];

$role = $roleMap[$rawRole] ?? 'student';

// Prevent unauthenticated users from registering themselves directly as 'admin'
if ($role === 'admin') {
    $currentAuth = get_optional_auth();
    if (!$currentAuth || ($currentAuth['role'] ?? '') !== 'admin') {
        send_error_response('Pendaftaran mandiri sebagai Administrator tidak diizinkan.', 403);
    }
}

$pdo = get_db();

try {
    // 2. Check if registration is allowed by system settings
    if ($role === 'student') {
        $setStmt = $pdo->prepare("SELECT value FROM settings WHERE `key` = 'allow_student_registration' LIMIT 1");
        $setStmt->execute();
        $settingRow = $setStmt->fetch();
        if ($settingRow && strtolower((string)$settingRow['value']) === 'false') {
            send_error_response('Pendaftaran mandiri murid saat ini sedang ditutup oleh pihak sekolah.', 403);
        }
    }

    // 3. Check for existing email / username
    $checkStmt = $pdo->prepare("SELECT id FROM profiles WHERE email = :email LIMIT 1");
    $checkStmt->execute([':email' => $email]);
    if ($checkStmt->fetch()) {
        send_error_response('Alamat email sudah terdaftar. Silakan masuk menggunakan akun Anda.', 409);
    }

    if ($username !== '') {
        $uCheck = $pdo->prepare("SELECT id FROM profiles WHERE username = :username LIMIT 1");
        $uCheck->execute([':username' => $username]);
        if ($uCheck->fetch()) {
            send_error_response('Nama pengguna (username) sudah digunakan oleh pengguna lain.', 409);
        }
    } else {
        $username = null;
    }

    // 4. Hash password with bcrypt
    $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);
    $newUserId = generate_uuid();
    $avatarUrl = "https://api.dicebear.com/7.x/adventurer/svg?seed=" . urlencode($fullName);

    // 5. Insert new profile
    $insStmt = $pdo->prepare("
        INSERT INTO profiles (id, role, full_name, email, password_hash, username, avatar_url, status, created_at)
        VALUES (:id, :role, :full_name, :email, :password_hash, :username, :avatar_url, 'active', NOW())
    ");

    $insStmt->execute([
        ':id'            => $newUserId,
        ':role'          => $role,
        ':full_name'     => $fullName,
        ':email'         => $email,
        ':password_hash' => $passwordHash,
        ':username'      => $username,
        ':avatar_url'    => $avatarUrl,
    ]);

    // Fetch newly created profile
    $fetchStmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
    $fetchStmt->execute([':id' => $newUserId]);
    $newProfile = $fetchStmt->fetch();

    // 6. Generate Tokens & HttpOnly Refresh Cookie
    $accessToken = JWT::createAccessToken($newProfile, 900);
    $refreshToken = JWT::createRefreshToken($newUserId, 604800);
    JWT::setRefreshTokenCookie($refreshToken, 604800);

    $authPayload = JWT::formatAuthPayload($newProfile);

    // 7. Log Activity
    try {
        $logStmt = $pdo->prepare("INSERT INTO activity_logs (id, user_id, action, details, created_at) VALUES (:id, :uid, 'REGISTER', 'Pendaftaran akun baru', NOW())");
        $logStmt->execute([
            ':id'  => generate_uuid(),
            ':uid' => $newUserId,
        ]);
    } catch (Throwable $t) {
        error_log('[REGISTER_LOG_ERROR] ' . $t->getMessage());
    }

    send_json_response([
        'access_token' => $accessToken,
        'token_type'   => 'Bearer',
        'expires_in'   => 900,
        'user'         => $authPayload['user'],
        'profile'      => $authPayload['profile'],
    ], 201);

} catch (Throwable $e) {
    error_log('[AUTH_REGISTER_ERROR] ' . $e->getMessage());
    send_error_response('Gagal mendaftarkan akun pengguna baru.', 500);
}
