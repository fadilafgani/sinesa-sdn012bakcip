<?php
/**
 * SINESA REST API: User Profile Management Endpoint
 * Path: /api/profile.php
 *
 * Security:
 * - Requires authenticated user (require_auth)
 * - Users can read and update their own profile
 * - Teachers can view student profiles
 * - Administrators can perform full CRUD across all profiles
 *
 * Handlers:
 * - GET:
 *     - /api/profile (fetch current user's profile)
 *     - /api/profile?id=<uuid> (fetch profile by ID)
 *     - /api/profile?all=true (fetch all profiles, teachers & admins)
 * - PUT / PATCH:
 *     - /api/profile (update self profile)
 *     - /api/profile?id=<uuid> (update target user; requires admin or self)
 * - POST:
 *     - /api/profile (create new profile; requires admin)
 * - DELETE:
 *     - /api/profile?id=<uuid> (delete user profile; requires admin)
 */

declare(strict_types=1);

require_once __DIR__ . '/utils/response.php';
require_once __DIR__ . '/utils/request.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/jwt.php';
require_once __DIR__ . '/middleware/auth.php';

// Handle CORS Preflight
handle_cors_preflight();

// Authenticate caller
$currentUser = require_auth();
$currentUserId = (string)($currentUser['sub'] ?? '');
$currentUserRole = (string)($currentUser['role'] ?? 'student');

$pdo = get_db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/**
 * Format profile database row for standardized JSON output
 */
function format_profile_row(array $row): array {
    return [
        'id'         => (string)$row['id'],
        'role'       => (string)$row['role'],
        'full_name'  => (string)$row['full_name'],
        'email'      => (string)$row['email'],
        'username'   => $row['username'] !== null ? (string)$row['username'] : null,
        'avatar_url' => $row['avatar_url'] !== null ? (string)$row['avatar_url'] : null,
        'status'     => (string)($row['status'] ?? 'active'),
        'created_at' => (string)$row['created_at'],
        'updated_at' => isset($row['updated_at']) ? (string)$row['updated_at'] : null,
    ];
}

try {
    // =========================================================================
    // GET: Retrieve Profile(s)
    // =========================================================================
    if ($method === 'GET') {
        $targetId = sanitize_string($_GET['id'] ?? '');
        $fetchAll = sanitize_string($_GET['all'] ?? '');

        // 1. Fetch All Profiles (Teacher or Admin only)
        if ($fetchAll === 'true' || $fetchAll === '1') {
            if (!in_array($currentUserRole, ['admin', 'teacher'], true)) {
                send_error_response('Akses ditolak. Hanya guru dan administrator yang dapat melihat seluruh profil.', 403);
            }

            $roleFilter = sanitize_string($_GET['role'] ?? '');
            $search = sanitize_string($_GET['search'] ?? '');

            $conditions = [];
            $params = [];

            if ($roleFilter !== '' && in_array($roleFilter, ['admin', 'teacher', 'student'], true)) {
                $conditions[] = "role = :role";
                $params[':role'] = $roleFilter;
            }

            if ($search !== '') {
                $conditions[] = "(full_name LIKE :search OR username LIKE :search OR email LIKE :search)";
                $params[':search'] = '%' . $search . '%';
            }

            $whereSql = !empty($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
            $stmt = $pdo->prepare("SELECT * FROM profiles {$whereSql} ORDER BY created_at DESC");
            $stmt->execute($params);
            $rows = $stmt->fetchAll();

            send_success_response(array_map('format_profile_row', $rows));
        }

        // 2. Fetch Single Profile by ID or Current User ID
        $lookupId = $targetId !== '' ? $targetId : $currentUserId;

        $stmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
        $stmt->execute([':id' => $lookupId]);
        $row = $stmt->fetch();

        if (!$row) {
            send_error_response('Profil pengguna tidak ditemukan.', 404);
        }

        send_success_response(format_profile_row($row));
    }

    // =========================================================================
    // PUT / PATCH: Update Profile Details
    // =========================================================================
    if ($method === 'PUT' || $method === 'PATCH') {
        $input = get_json_input();
        $targetId = sanitize_string($_GET['id'] ?? $input['id'] ?? $currentUserId);

        // Security check: only admin can modify other users' profiles
        if ($targetId !== $currentUserId && $currentUserRole !== 'admin') {
            send_error_response('Akses ditolak. Anda hanya dapat mengubah profil Anda sendiri.', 403);
        }

        $checkStmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
        $checkStmt->execute([':id' => $targetId]);
        $existing = $checkStmt->fetch();

        if (!$existing) {
            send_error_response('Profil yang akan diperbarui tidak ditemukan.', 404);
        }

        $fields = [];
        $params = [':id' => $targetId];

        // Full Name
        if (isset($input['full_name']) || isset($input['fullName'])) {
            $nameVal = sanitize_string($input['full_name'] ?? $input['fullName']);
            if ($nameVal !== '') {
                $fields[] = "`full_name` = :full_name";
                $params[':full_name'] = $nameVal;
            }
        }

        // Username
        if (isset($input['username'])) {
            $userVal = sanitize_string($input['username']);
            if ($userVal !== '' && $userVal !== (string)$existing['username']) {
                $uCheck = $pdo->prepare("SELECT id FROM profiles WHERE username = :uname AND id != :id LIMIT 1");
                $uCheck->execute([':uname' => $userVal, ':id' => $targetId]);
                if ($uCheck->fetch()) {
                    send_error_response('Nama pengguna (username) sudah digunakan oleh akun lain.', 400);
                }
                $fields[] = "`username` = :username";
                $params[':username'] = $userVal;
            }
        }

        // Avatar URL
        if (isset($input['avatar_url']) || isset($input['avatarUrl'])) {
            $avatarVal = sanitize_string($input['avatar_url'] ?? $input['avatarUrl']);
            $fields[] = "`avatar_url` = :avatar_url";
            $params[':avatar_url'] = $avatarVal !== '' ? $avatarVal : null;
        }

        // Email (Admin only or user self-email with validation)
        if (isset($input['email'])) {
            $emailVal = strtolower(sanitize_string($input['email']));
            if ($emailVal !== '' && $emailVal !== strtolower((string)$existing['email'])) {
                if (!filter_var($emailVal, FILTER_VALIDATE_EMAIL)) {
                    send_error_response('Format email tidak valid.', 400);
                }
                $eCheck = $pdo->prepare("SELECT id FROM profiles WHERE email = :email AND id != :id LIMIT 1");
                $eCheck->execute([':email' => $emailVal, ':id' => $targetId]);
                if ($eCheck->fetch()) {
                    send_error_response('Alamat email sudah terdaftar oleh pengguna lain.', 400);
                }
                $fields[] = "`email` = :email";
                $params[':email'] = $emailVal;
            }
        }

        // Role & Status (Admin only)
        if ($currentUserRole === 'admin') {
            if (isset($input['role']) && in_array($input['role'], ['admin', 'teacher', 'student'], true)) {
                $fields[] = "`role` = :role";
                $params[':role'] = $input['role'];
            }
            if (isset($input['status']) && in_array($input['status'], ['active', 'inactive'], true)) {
                $fields[] = "`status` = :status";
                $params[':status'] = $input['status'];
            }
        }

        // Password Update
        if (!empty($input['password'])) {
            $newPass = (string)$input['password'];
            if (strlen($newPass) < 6) {
                send_error_response('Kata sandi baru minimal harus 6 karakter.', 400);
            }
            $hash = password_hash($newPass, PASSWORD_BCRYPT, ['cost' => 10]);
            $fields[] = "`password_hash` = :pass_hash";
            $params[':pass_hash'] = $hash;
        }

        if (empty($fields)) {
            send_success_response(format_profile_row($existing));
        }

        $fields[] = "`updated_at` = NOW()";
        $setSql = implode(', ', $fields);

        $updateStmt = $pdo->prepare("UPDATE profiles SET {$setSql} WHERE id = :id");
        $updateStmt->execute($params);

        // Fetch refreshed record
        $refreshedStmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
        $refreshedStmt->execute([':id' => $targetId]);
        $refreshed = $refreshedStmt->fetch();

        send_success_response(format_profile_row($refreshed));
    }

    // =========================================================================
    // POST: Create New Profile (Admin Only)
    // =========================================================================
    if ($method === 'POST') {
        if ($currentUserRole !== 'admin') {
            send_error_response('Akses ditolak. Hanya administrator yang dapat membuat profil baru.', 403);
        }

        $input = get_json_input();
        $fullName = sanitize_string($input['full_name'] ?? $input['fullName'] ?? '');
        $email = strtolower(sanitize_string($input['email'] ?? ''));
        $password = (string)($input['password'] ?? '');
        $role = sanitize_string($input['role'] ?? 'student');
        $username = sanitize_string($input['username'] ?? '');
        $avatarUrl = sanitize_string($input['avatar_url'] ?? $input['avatarUrl'] ?? '');
        $status = sanitize_string($input['status'] ?? 'active');

        if ($fullName === '' || $email === '' || $password === '') {
            send_error_response('Nama lengkap, email, dan kata sandi wajib diisi.', 400);
        }

        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_error_response('Format email tidak valid.', 400);
        }

        if (!in_array($role, ['admin', 'teacher', 'student'], true)) {
            $role = 'student';
        }

        // Email uniqueness check
        $eCheck = $pdo->prepare("SELECT id FROM profiles WHERE email = :email LIMIT 1");
        $eCheck->execute([':email' => $email]);
        if ($eCheck->fetch()) {
            send_error_response('Email sudah terdaftar.', 400);
        }

        $userId = generate_uuid();
        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);

        $insStmt = $pdo->prepare("
            INSERT INTO profiles (id, role, full_name, email, password_hash, username, avatar_url, status, created_at)
            VALUES (:id, :role, :full_name, :email, :password_hash, :username, :avatar_url, :status, NOW())
        ");
        $insStmt->execute([
            ':id'            => $userId,
            ':role'          => $role,
            ':full_name'     => $fullName,
            ':email'         => $email,
            ':password_hash' => $passwordHash,
            ':username'      => $username !== '' ? $username : null,
            ':avatar_url'    => $avatarUrl !== '' ? $avatarUrl : null,
            ':status'        => in_array($status, ['active', 'inactive'], true) ? $status : 'active',
        ]);

        $newRowStmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
        $newRowStmt->execute([':id' => $userId]);
        $newRow = $newRowStmt->fetch();

        send_json_response(format_profile_row($newRow), 201);
    }

    // =========================================================================
    // DELETE: Delete Profile (Admin Only)
    // =========================================================================
    if ($method === 'DELETE') {
        if ($currentUserRole !== 'admin') {
            send_error_response('Akses ditolak. Hanya administrator yang dapat menghapus profil.', 403);
        }

        $targetId = sanitize_string($_GET['id'] ?? '');
        if ($targetId === '') {
            send_error_response('Parameter id pengguna wajib disertakan.', 400);
        }

        if ($targetId === $currentUserId) {
            send_error_response('Anda tidak dapat menghapus akun administrator Anda sendiri.', 400);
        }

        $delStmt = $pdo->prepare("DELETE FROM profiles WHERE id = :id");
        $delStmt->execute([':id' => $targetId]);

        if ($delStmt->rowCount() === 0) {
            send_error_response('Profil tidak ditemukan atau telah dihapus.', 404);
        }

        send_success_response(['deleted_id' => $targetId]);
    }

    send_error_response('Metode HTTP tidak didukung.', 405);

} catch (\PDOException $e) {
    error_log('Profile API Database Error: ' . $e->getMessage());
    send_error_response('Terjadi kesalahan database: ' . $e->getMessage(), 500);
} catch (\Throwable $e) {
    error_log('Profile API General Error: ' . $e->getMessage());
    send_error_response('Terjadi kesalahan sistem pada profil: ' . $e->getMessage(), 500);
}
