<?php
/**
 * SINESA REST API: Admin User Management Endpoint
 * Path: /api/admin/users.php
 *
 * Security:
 * Enforces require_role('admin') - Teachers and Students are strictly blocked with HTTP 403.
 *
 * Handlers:
 * - GET: List users with optional role, status, and search filters
 * - POST: Create new user with password hashing and validation
 * - PUT/PATCH: Update user details, role, status, or reset password
 * - DELETE: Delete user account (prevents deleting own admin account)
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
$adminId = $admin['sub'] ?? '';

$pdo = get_db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

/**
 * Format profile database row for API response
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

/**
 * Record administrative activity log
 */
function record_activity_log(PDO $pdo, ?string $userId, string $action, string $details): void {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO activity_logs (id, user_id, action, details, created_at)
            VALUES (:id, :uid, :act, :det, NOW())
        ");
        $stmt->execute([
            ':id'  => generate_uuid(),
            ':uid' => $userId,
            ':act' => $action,
            ':det' => $details,
        ]);
    } catch (\Throwable $e) {
        // Logging should not break main flow
        error_log('Failed to write activity_log: ' . $e->getMessage());
    }
}

try {
    // -------------------------------------------------------------------------
    // GET: List Users / Profiles
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $id = sanitize_string($_GET['id'] ?? '');
        $role = sanitize_string($_GET['role'] ?? '');
        $status = sanitize_string($_GET['status'] ?? '');
        $search = sanitize_string($_GET['search'] ?? '');

        // Detail of single user
        if ($id !== '') {
            $stmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
            if (!$row) {
                send_error_response('Pengguna tidak ditemukan.', 404);
            }
            send_success_response(format_profile_row($row));
        }

        $conditions = [];
        $params = [];

        if ($role !== '' && in_array($role, ['admin', 'teacher', 'student'], true)) {
            $conditions[] = "role = :role";
            $params[':role'] = $role;
        }

        if ($status !== '' && in_array($status, ['active', 'inactive'], true)) {
            $conditions[] = "status = :status";
            $params[':status'] = $status;
        }

        if ($search !== '') {
            $conditions[] = "(full_name LIKE :search OR username LIKE :search OR email LIKE :search)";
            $params[':search'] = '%' . $search . '%';
        }

        $whereClause = !empty($conditions) ? 'WHERE ' . implode(' AND ', $conditions) : '';
        $sql = "SELECT * FROM profiles {$whereClause} ORDER BY created_at DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        send_success_response(array_map('format_profile_row', $rows));
    }

    // -------------------------------------------------------------------------
    // POST: Create New User
    // -------------------------------------------------------------------------
    if ($method === 'POST') {
        $input = get_json_input();

        $fullName = sanitize_string($input['full_name'] ?? $input['fullName'] ?? '');
        $email = strtolower(sanitize_string($input['email'] ?? ''));
        $password = (string)($input['password'] ?? '');
        $username = sanitize_string($input['username'] ?? '');
        $role = sanitize_string($input['role'] ?? 'student');
        $status = sanitize_string($input['status'] ?? 'active');
        $avatarUrl = sanitize_string($input['avatar_url'] ?? $input['avatarUrl'] ?? '');

        // Validation
        if ($fullName === '') {
            send_error_response('Nama lengkap wajib diisi.', 400);
        }

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            send_error_response('Format alamat email tidak valid.', 400);
        }

        if (strlen($password) < 6) {
            send_error_response('Kata sandi minimal 6 karakter.', 400);
        }

        if (!in_array($role, ['admin', 'teacher', 'student'], true)) {
            send_error_response('Peran pengguna (role) tidak valid.', 400);
        }

        if (!in_array($status, ['active', 'inactive'], true)) {
            $status = 'active';
        }

        // Generate username if not provided
        if ($username === '') {
            $baseUser = explode('@', $email)[0];
            $username = preg_replace('/[^a-zA-Z0-9_]/', '', $baseUser);
        }

        // Check email uniqueness
        $emailCheck = $pdo->prepare("SELECT id FROM profiles WHERE email = :email LIMIT 1");
        $emailCheck->execute([':email' => $email]);
        if ($emailCheck->fetch()) {
            send_error_response('Alamat email sudah terdaftar dalam sistem.', 400);
        }

        // Check username uniqueness
        if ($username !== '') {
            $userCheck = $pdo->prepare("SELECT id FROM profiles WHERE username = :username LIMIT 1");
            $userCheck->execute([':username' => $username]);
            if ($userCheck->fetch()) {
                // If collision, append random digits
                $username = $username . '_' . random_int(100, 999);
            }
        }

        // Generate Avatar URL if empty
        if ($avatarUrl === '') {
            $avatarUrl = "https://api.dicebear.com/7.x/adventurer/svg?seed=" . urlencode($fullName);
        }

        $userId = generate_uuid();
        $passwordHash = password_hash($password, PASSWORD_BCRYPT, ['cost' => 10]);

        $insertStmt = $pdo->prepare("
            INSERT INTO profiles (id, role, full_name, email, password_hash, username, avatar_url, status, created_at)
            VALUES (:id, :role, :full_name, :email, :password_hash, :username, :avatar_url, :status, NOW())
        ");
        $insertStmt->execute([
            ':id'            => $userId,
            ':role'          => $role,
            ':full_name'     => $fullName,
            ':email'         => $email,
            ':password_hash' => $passwordHash,
            ':username'      => $username ?: null,
            ':avatar_url'    => $avatarUrl ?: null,
            ':status'        => $status,
        ]);

        record_activity_log($pdo, $adminId, 'CREATE_USER', "Menambahkan pengguna baru: {$fullName} ({$role}) - {$email}");

        $newRowStmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
        $newRowStmt->execute([':id' => $userId]);
        $newRow = $newRowStmt->fetch();

        send_json_response(format_profile_row($newRow), 201);
    }

    // -------------------------------------------------------------------------
    // PUT/PATCH: Update User Details, Role, Status, or Password
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || $method === 'PATCH') {
        $input = get_json_input();
        $id = sanitize_string($_GET['id'] ?? $input['id'] ?? '');

        if ($id === '') {
            send_error_response('ID pengguna (id) wajib disertakan.', 400);
        }

        $checkStmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
        $checkStmt->execute([':id' => $id]);
        $existing = $checkStmt->fetch();

        if (!$existing) {
            send_error_response('Pengguna tidak ditemukan.', 404);
        }

        $fields = [];
        $params = [':id' => $id];

        // 1. Full Name
        if (isset($input['full_name']) || isset($input['fullName'])) {
            $fullName = sanitize_string($input['full_name'] ?? $input['fullName']);
            if ($fullName !== '') {
                $fields[] = "`full_name` = :full_name";
                $params[':full_name'] = $fullName;
            }
        }

        // 2. Email
        if (isset($input['email'])) {
            $email = strtolower(sanitize_string($input['email']));
            if ($email !== '' && $email !== strtolower((string)$existing['email'])) {
                if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
                    send_error_response('Format email tidak valid.', 400);
                }
                $dupCheck = $pdo->prepare("SELECT id FROM profiles WHERE email = :email AND id != :id LIMIT 1");
                $dupCheck->execute([':email' => $email, ':id' => $id]);
                if ($dupCheck->fetch()) {
                    send_error_response('Alamat email sudah digunakan oleh pengguna lain.', 400);
                }
                $fields[] = "`email` = :email";
                $params[':email'] = $email;
            }
        }

        // 3. Username
        if (isset($input['username'])) {
            $username = sanitize_string($input['username']);
            if ($username !== '' && $username !== (string)$existing['username']) {
                $dupCheck = $pdo->prepare("SELECT id FROM profiles WHERE username = :username AND id != :id LIMIT 1");
                $dupCheck->execute([':username' => $username, ':id' => $id]);
                if ($dupCheck->fetch()) {
                    send_error_response('Username sudah digunakan oleh pengguna lain.', 400);
                }
                $fields[] = "`username` = :username";
                $params[':username'] = $username;
            }
        }

        // 4. Role
        if (isset($input['role'])) {
            $role = sanitize_string($input['role']);
            if (in_array($role, ['admin', 'teacher', 'student'], true)) {
                $fields[] = "`role` = :role";
                $params[':role'] = $role;
            }
        }

        // 5. Status
        if (isset($input['status'])) {
            $status = sanitize_string($input['status']);
            if (in_array($status, ['active', 'inactive'], true)) {
                // Prevent deactivating own account
                if ($id === $adminId && $status === 'inactive') {
                    send_error_response('Anda tidak dapat menonaktifkan akun administrator Anda sendiri.', 400);
                }
                $fields[] = "`status` = :status";
                $params[':status'] = $status;
            }
        }

        // 6. Avatar URL
        if (isset($input['avatar_url']) || isset($input['avatarUrl'])) {
            $avatarUrl = sanitize_string($input['avatar_url'] ?? $input['avatarUrl']);
            $fields[] = "`avatar_url` = :avatar_url";
            $params[':avatar_url'] = $avatarUrl ?: null;
        }

        // 7. Password Reset
        if (!empty($input['password'])) {
            $pwd = (string)$input['password'];
            if (strlen($pwd) < 6) {
                send_error_response('Kata sandi baru minimal 6 karakter.', 400);
            }
            $fields[] = "`password_hash` = :password_hash";
            $params[':password_hash'] = password_hash($pwd, PASSWORD_BCRYPT, ['cost' => 10]);
        }

        if (empty($fields)) {
            send_success_response(format_profile_row($existing));
        }

        $sql = "UPDATE profiles SET " . implode(', ', $fields) . " WHERE id = :id";
        $updStmt = $pdo->prepare($sql);
        $updStmt->execute($params);

        record_activity_log($pdo, $adminId, 'EDIT_USER', "Mengedit akun pengguna: {$existing['full_name']} ({$id})");

        $freshStmt = $pdo->prepare("SELECT * FROM profiles WHERE id = :id LIMIT 1");
        $freshStmt->execute([':id' => $id]);
        $freshRow = $freshStmt->fetch();

        send_success_response(format_profile_row($freshRow));
    }

    // -------------------------------------------------------------------------
    // DELETE: Delete User Account
    // -------------------------------------------------------------------------
    if ($method === 'DELETE') {
        $input = get_json_input();
        $id = sanitize_string($_GET['id'] ?? ($input['id'] ?? ''));

        if ($id === '') {
            send_error_response('ID pengguna (id) wajib disertakan.', 400);
        }

        if ($id === $adminId) {
            send_error_response('Anda tidak dapat menghapus akun administrator yang sedang aktif.', 400);
        }

        $checkStmt = $pdo->prepare("SELECT id, full_name, role FROM profiles WHERE id = :id LIMIT 1");
        $checkStmt->execute([':id' => $id]);
        $targetUser = $checkStmt->fetch();

        if (!$targetUser) {
            send_error_response('Pengguna tidak ditemukan.', 404);
        }

        // Delete user
        $delStmt = $pdo->prepare("DELETE FROM profiles WHERE id = :id");
        $delStmt->execute([':id' => $id]);

        record_activity_log($pdo, $adminId, 'DELETE_USER', "Menghapus akun pengguna: {$targetUser['full_name']} ({$id}) - Peran: {$targetUser['role']}");

        send_success_response(['deleted_id' => $id, 'message' => 'Pengguna berhasil dihapus secara permanen.']);
    }

    send_error_response('Metode HTTP tidak didukung.', 405);

} catch (\PDOException $e) {
    error_log('Admin Users API Database Error: ' . $e->getMessage());
    send_error_response('Terjadi kesalahan pada database sistem: ' . $e->getMessage(), 500);
} catch (\Throwable $e) {
    error_log('Admin Users API General Error: ' . $e->getMessage());
    send_error_response('Terjadi kesalahan sistem internal: ' . $e->getMessage(), 500);
}
