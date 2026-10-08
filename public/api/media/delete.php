<?php
/**
 * Secure Media Delete Endpoint for SINESA
 * Protects against IDOR, path traversal, unauthorized deletes, and verifies ownership.
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

// Handle CORS
handle_cors_preflight();

$method = strtoupper($_SERVER['REQUEST_METHOD']);
if ($method !== 'POST' && $method !== 'DELETE') {
    send_error_response('Metode permintaan tidak valid. Gunakan POST atau DELETE.', 405);
}

// 1. Authorization: Require authenticated user token
$user = require_auth();
$userId = $user['sub'] ?? '';
$userRole = $user['role'] ?? 'student';

// 2. Parse request payload
$input = get_json_input();
if (empty($input)) {
    $input = $_POST;
}

$fileId = sanitize_string($input['id'] ?? (string)get_query_param('id', ''));
$filename = sanitize_string($input['filename'] ?? (string)get_query_param('filename', ''));
$fileUrl = sanitize_string($input['url'] ?? (string)get_query_param('url', ''));

if ($filename === '' && $fileUrl !== '') {
    $filename = basename(parse_url($fileUrl, PHP_URL_PATH) ?? '');
}

if ($fileId === '' && $filename === '') {
    send_error_response('Parameter id atau filename berkas wajib diisi.', 400);
}

// 3. Database lookup & IDOR Ownership Check
$pdo = get_db();
$mediaRecord = null;

try {
    $stmtCheck = $pdo->query("SHOW TABLES LIKE 'media_files'");
    if ($stmtCheck && $stmtCheck->rowCount() > 0) {
        if ($fileId !== '') {
            $stmt = $pdo->prepare("SELECT * FROM media_files WHERE id = :id LIMIT 1");
            $stmt->execute([':id' => $fileId]);
            $mediaRecord = $stmt->fetch();
        } elseif ($filename !== '') {
            $stmt = $pdo->prepare("SELECT * FROM media_files WHERE stored_name = :stored_name LIMIT 1");
            $stmt->execute([':stored_name' => basename($filename)]);
            $mediaRecord = $stmt->fetch();
        }
    }
} catch (Throwable $e) {
    error_log('[MEDIA_DELETE_DB_LOOKUP_ERROR] ' . $e->getMessage());
}

// IDOR Check: Ensure user owns the file or is an administrator
if ($mediaRecord) {
    $isOwner = ($mediaRecord['user_id'] === $userId);
    $isAdmin = ($userRole === 'admin');

    if (!$isOwner && !$isAdmin) {
        send_error_response('Akses ditolak. Anda tidak memiliki izin untuk menghapus berkas ini (Bukan pemilik).', 403);
    }
    
    $storedName = basename($mediaRecord['stored_name']);
    $fileType = $mediaRecord['file_type'];
} else {
    // If not found in DB, fallback to filename if admin
    if ($userRole !== 'admin') {
        send_error_response('Berkas tidak ditemukan atau Anda tidak memiliki akses.', 404);
    }
    $storedName = basename($filename);
    $fileType = null;
}

// 4. Path Traversal Defense: Ensure strictly inside allowed subfolders
$safeStoredName = basename($storedName);
if ($safeStoredName === '' || $safeStoredName === '.' || $safeStoredName === '..') {
    send_error_response('Nama berkas tidak valid.', 400);
}

$uploadsBase = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads';
$searchFolders = ['images', 'audio', 'documents', 'thumbnails', 'quiz-images', 'quiz-videos'];

$targetFilePath = null;
foreach ($searchFolders as $folder) {
    $candidate = $uploadsBase . DIRECTORY_SEPARATOR . $folder . DIRECTORY_SEPARATOR . $safeStoredName;
    if (file_exists($candidate) && is_file($candidate)) {
        // Verify realpath cannot escape uploadsBase
        $realCandidate = realpath($candidate);
        $realUploads = realpath($uploadsBase);
        if ($realCandidate && $realUploads && strpos($realCandidate, $realUploads) === 0) {
            $targetFilePath = $realCandidate;
            break;
        }
    }
}

// 5. Delete DB Record and Physical File inside transaction
try {
    if ($mediaRecord) {
        $pdo->beginTransaction();
        $delStmt = $pdo->prepare("DELETE FROM media_files WHERE id = :id");
        $delStmt->execute([':id' => $mediaRecord['id']]);
        $pdo->commit();
    }

    if ($targetFilePath && file_exists($targetFilePath)) {
        @unlink($targetFilePath);
    }
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('[MEDIA_DELETE_ERROR] ' . $e->getMessage());
    send_error_response('Gagal menghapus data berkas.', 500);
}

send_success_response([
    'deleted'  => true,
    'id'       => $mediaRecord['id'] ?? $fileId,
    'filename' => $safeStoredName,
    'message'  => 'Berkas berhasil dihapus.',
]);
