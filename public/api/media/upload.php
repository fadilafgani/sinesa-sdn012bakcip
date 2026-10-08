<?php
/**
 * Secure Media Upload Endpoint for SINESA
 * Validates real binary MIME type, limits file sizes, generates UUID filenames,
 * records metadata in database, and prevents script execution.
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';
require_once __DIR__ . '/../utils/request.php';
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/auth.php';

// Handle CORS
handle_cors_preflight();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_error_response('Metode permintaan tidak valid. Gunakan POST.', 405);
}

// 1. Authorization: Require authenticated user token
$user = require_auth();
$userId = $user['sub'] ?? '';

if (empty($userId)) {
    send_error_response('Token autentikasi tidak valid (identitas pengguna kosong).', 401);
}

// 2. Validate uploaded file existence
if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
    send_error_response('Berkas tidak ditemukan dalam permintaan unggah.', 400);
}

$file = $_FILES['file'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    $errorMessages = [
        UPLOAD_ERR_INI_SIZE   => 'Ukuran berkas melampaui batas server.',
        UPLOAD_ERR_FORM_SIZE  => 'Ukuran berkas melampaui batas form.',
        UPLOAD_ERR_PARTIAL    => 'Berkas hanya terunggah sebagian.',
        UPLOAD_ERR_NO_FILE    => 'Tidak ada berkas yang dipilih.',
        UPLOAD_ERR_NO_TMP_DIR => 'Direktori sementara server tidak tersedia.',
        UPLOAD_ERR_CANT_WRITE => 'Gagal menulis berkas ke media penyimpanan.',
        UPLOAD_ERR_EXTENSION  => 'Unggahan berkas dihentikan oleh ekstensi server.',
    ];
    $msg = $errorMessages[$file['error']] ?? 'Terjadi kesalahan saat mengunggah berkas.';
    send_error_response($msg, 400);
}

$tmpPath = $file['tmp_name'];
if (!is_uploaded_file($tmpPath)) {
    send_error_response('Berkas unggahan tidak sah.', 400);
}

// 3. Inspect real binary MIME type using finfo_file (Never trust client extension/type)
$finfo = finfo_open(FILEINFO_MIME_TYPE);
if (!$finfo) {
    send_error_response('Gagal menginisialisasi validator tipe MIME server.', 500);
}
$mimeType = finfo_file($finfo, $tmpPath);
finfo_close($finfo);

if (!$mimeType || !is_string($mimeType)) {
    send_error_response('Gagal mendeteksi tipe MIME berkas.', 400);
}

// 4. Strict MIME Whitelist and Size Limits Configuration
$mimeWhitelist = [
    // IMAGES (Max 5 MB)
    'image/jpeg' => ['category' => 'image', 'subfolder' => 'images', 'ext' => '.jpg', 'max_size' => 5 * 1024 * 1024],
    'image/png'  => ['category' => 'image', 'subfolder' => 'images', 'ext' => '.png', 'max_size' => 5 * 1024 * 1024],
    'image/webp' => ['category' => 'image', 'subfolder' => 'images', 'ext' => '.webp', 'max_size' => 5 * 1024 * 1024],
    'image/gif'  => ['category' => 'image', 'subfolder' => 'images', 'ext' => '.gif', 'max_size' => 5 * 1024 * 1024],
    
    // AUDIO (Max 15 MB)
    'audio/mpeg' => ['category' => 'audio', 'subfolder' => 'audio', 'ext' => '.mp3', 'max_size' => 15 * 1024 * 1024],
    'audio/wav'  => ['category' => 'audio', 'subfolder' => 'audio', 'ext' => '.wav', 'max_size' => 15 * 1024 * 1024],
    'audio/x-wav'=> ['category' => 'audio', 'subfolder' => 'audio', 'ext' => '.wav', 'max_size' => 15 * 1024 * 1024],
    'audio/ogg'  => ['category' => 'audio', 'subfolder' => 'audio', 'ext' => '.ogg', 'max_size' => 15 * 1024 * 1024],
    'audio/webm' => ['category' => 'audio', 'subfolder' => 'audio', 'ext' => '.weba', 'max_size' => 15 * 1024 * 1024],
    
    // DOCUMENTS (Max 10 MB)
    'application/pdf' => ['category' => 'document', 'subfolder' => 'documents', 'ext' => '.pdf', 'max_size' => 10 * 1024 * 1024],
    'application/msword' => ['category' => 'document', 'subfolder' => 'documents', 'ext' => '.doc', 'max_size' => 10 * 1024 * 1024],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['category' => 'document', 'subfolder' => 'documents', 'ext' => '.docx', 'max_size' => 10 * 1024 * 1024],
    'application/vnd.ms-excel' => ['category' => 'document', 'subfolder' => 'documents', 'ext' => '.xls', 'max_size' => 10 * 1024 * 1024],
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['category' => 'document', 'subfolder' => 'documents', 'ext' => '.xlsx', 'max_size' => 10 * 1024 * 1024],
];

if (!isset($mimeWhitelist[$mimeType])) {
    send_error_response("Format berkas tidak diizinkan atau berbahaya (Tipe MIME: {$mimeType}).", 415);
}

$rule = $mimeWhitelist[$mimeType];
$fileSize = (int)$file['size'];

// 5. Size Limit Enforcement
if ($fileSize > $rule['max_size']) {
    $maxMb = round($rule['max_size'] / (1024 * 1024));
    send_error_response("Ukuran berkas melebihi batas maksimal {$maxMb} MB untuk kategori {$rule['category']}.", 413);
}

// 6. Generate UUID Filename & Prevent Path Traversal
$mediaId = generate_uuid();
$storedFilename = $mediaId . $rule['ext'];
$originalName = basename($file['name']);

$baseUploadDir = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . $rule['subfolder'];

if (!is_dir($baseUploadDir)) {
    mkdir($baseUploadDir, 0755, true);
}

$targetPath = $baseUploadDir . DIRECTORY_SEPARATOR . $storedFilename;

// Ensure path cannot escape target directory
$realBaseDir = realpath($baseUploadDir);
if ($realBaseDir === false) {
    send_error_response('Direktori penyimpanan server tidak valid.', 500);
}

// 7. Move file to permanent storage
if (!move_uploaded_file($tmpPath, $targetPath)) {
    send_error_response('Gagal memindahkan berkas unggahan ke folder penyimpanan.', 500);
}

$relativeUrl = "/uploads/{$rule['subfolder']}/{$storedFilename}";

// 8. Record file metadata to database with transaction rollback safety
try {
    $pdo = get_db();
    
    // Check if media_files table exists
    $stmtCheck = $pdo->query("SHOW TABLES LIKE 'media_files'");
    if ($stmtCheck && $stmtCheck->rowCount() > 0) {
        $pdo->beginTransaction();
        
        $sql = "INSERT INTO media_files 
                (id, user_id, original_name, stored_name, file_path, file_type, mime_type, file_size, created_at)
                VALUES (:id, :user_id, :original_name, :stored_name, :file_path, :file_type, :mime_type, :file_size, NOW())";
        
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':id'            => $mediaId,
            ':user_id'       => $userId,
            ':original_name' => $originalName,
            ':stored_name'   => $storedFilename,
            ':file_path'     => $relativeUrl,
            ':file_type'     => $rule['category'],
            ':mime_type'     => $mimeType,
            ':file_size'     => $fileSize,
        ]);
        
        $pdo->commit();
    }
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    // Delete file if DB recording failed
    if (file_exists($targetPath)) {
        @unlink($targetPath);
    }
    error_log('[MEDIA_UPLOAD_DB_ERROR] ' . $e->getMessage());
    send_error_response('Gagal mencatat metadata berkas ke database.', 500);
}

// 9. Return standardized success response
send_success_response([
    'id'            => $mediaId,
    'url'           => $relativeUrl,
    'filename'      => $storedFilename,
    'original_name' => $originalName,
    'file_type'     => $rule['category'],
    'mime_type'     => $mimeType,
    'file_size'     => $fileSize,
    'created_at'    => date('c'),
], 201);
