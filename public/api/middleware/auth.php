<?php
/**
 * Authentication & Role Authorization Middleware for SINESA
 * Protects endpoints and enforces role-based access control (RBAC).
 */

declare(strict_types=1);

require_once __DIR__ . '/../config/jwt.php';
require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';

/**
 * Enforce valid JWT Bearer token authentication
 * Terminate with HTTP 401 if missing or invalid
 *
 * @return array User payload { sub: id, role: string, email: string, name: string }
 */
function require_auth(): array {
    $token = get_bearer_token();

    if (!$token) {
        send_error_response('Otentikasi diperlukan. Header Authorization (Bearer token) tidak ditemukan.', 401);
    }

    $payload = JWT::decode($token);

    if (!$payload) {
        send_error_response('Sesi login telah berakhir atau token tidak valid. Silakan masuk kembali.', 401);
    }

    return $payload;
}

/**
 * Enforce role-based access control (RBAC)
 * Terminate with HTTP 403 if role is not authorized
 *
 * @param string|array $allowedRoles Single role string or array of allowed roles ('admin', 'teacher', 'student')
 * @return array Authenticated user payload
 */
function require_role($allowedRoles): array {
    $user = require_auth();

    $roles = is_array($allowedRoles) ? $allowedRoles : [$allowedRoles];
    $userRole = $user['role'] ?? 'student';

    if (!in_array($userRole, $roles, true)) {
        send_error_response('Akses ditolak. Anda tidak memiliki hak izin untuk mengakses sumber daya ini.', 403);
    }

    return $user;
}

/**
 * Optional authentication: returns user payload if valid token provided, or null if anonymous
 *
 * @return array|null
 */
function get_optional_auth(): ?array {
    $token = get_bearer_token();
    if (!$token) {
        return null;
    }

    return JWT::decode($token);
}
