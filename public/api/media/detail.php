<?php
/**
 * Media Detail Endpoint for SINESA
 * Retrieves metadata for an uploaded file with ownership/authorization validation.
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

// Handle CORS
handle_cors_preflight();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    send_error_response('Metode permintaan tidak valid. Gunakan GET.', 405);
}

// 1. Authorization: Require authenticated user
$user = require_auth();
$userId = $user['sub'] ?? '';
$userRole = $user['role'] ?? 'student';

// 2. Parse query parameters
$id = sanitize_string((string)get_query_param('id', ''));
$filename = sanitize_string((string)get_query_param('filename', ''));

if ($id === '' && $filename === '') {
    send_error_response('Parameter id atau filename berkas wajib disertakan.', 400);
}

// 3. Query Database
$pdo = get_db();
$fileRecord = null;

try {
    $stmtCheck = $pdo->query("SHOW TABLES LIKE 'media_files'");
    if ($stmtCheck && $stmtCheck->rowCount() > 0) {
        if ($id !== '') {
            $stmt = $pdo->prepare("SELECT * FROM media_files WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $id]);
            $fileRecord = $stmt->fetch();
        } else {
            $stmt = $pdo->prepare("SELECT * FROM media_files WHERE stored_name = :stored_name LIMIT 1");
            $stmt->execute([':stored_name' => basename($filename)]);
            $fileRecord = $stmt->fetch();
        }
    }
} catch (Throwable $e) {
    error_log('[MEDIA_DETAIL_DB_ERROR] ' . $e->getMessage());
    send_error_response('Gagal mengambil data berkas dari server.', 500);
}

if (!$fileRecord) {
    send_error_response('Berkas tidak ditemukan.', 404);
}

// 4. Ownership / IDOR Check
$isOwner = ($fileRecord['user_id'] === $userId);
$isAdmin = ($userRole === 'admin');

if (!$isOwner && !$isAdmin) {
    send_error_response('Akses ditolak. Anda tidak memiliki izin untuk melihat rincian berkas ini.', 403);
}

send_success_response($fileRecord);
