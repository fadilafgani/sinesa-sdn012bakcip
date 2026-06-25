<?php
/**
 * Media Storage Service API for SINESA
 * Handles upload, replace, and delete operations on the server.
 */

// Enable CORS for local development and integration
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, DELETE");
header("Content-Type: application/json; charset=UTF-8");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

// Helper to generate UUID v4
function generate_uuid() {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// Helper to return error JSON
function send_error($message, $code = 400) {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'message' => $message
    ]);
    exit();
}

// Define storage paths relative to this script
$upload_root = __DIR__ . '/../uploads/';

// Allowed directory mappings for categories
$allowed_types = [
    'profiles'    => 'profiles/',
    'thumbnails'  => 'thumbnails/',
    'media'       => 'quiz-images/', // legacy fallback
    'quiz-images' => 'quiz-images/',
    'quiz-audio'  => 'quiz-audio/',
    'quiz-videos' => 'quiz-videos/'
];

// Determine dynamic base URL for uploads
$protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? "https://" : "http://";
$domainName = $_SERVER['HTTP_HOST'];
$script_dir = dirname($_SERVER['SCRIPT_NAME']); // e.g. "/api" or "/evaluasi-bakcip/public/api"
$base_dir = preg_replace('/\/api\/?$/', '', $script_dir);
$base_dir = rtrim($base_dir, '/');
$upload_base_url = $protocol . $domainName . $base_dir . '/uploads/';

// Handle GET requests (health check or list schema)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode([
        'success' => true,
        'message' => 'SINESA Media Storage Service is active.',
        'base_url' => $upload_base_url
    ]);
    exit();
}

// Retrieve action (upload or delete)
$action = isset($_POST['action']) ? $_POST['action'] : (isset($_GET['action']) ? $_GET['action'] : 'upload');

// Handle Deletion Action
if ($action === 'delete') {
    $type = isset($_POST['type']) ? $_POST['type'] : '';
    $file_url = isset($_POST['file_url']) ? $_POST['file_url'] : '';

    if (empty($type) || empty($file_url)) {
        send_error('Parameter type dan file_url wajib diisi untuk menghapus file.');
    }

    if (!array_key_exists($type, $allowed_types)) {
        send_error('Tipe folder tidak valid.');
    }

    // Extract filename securely to prevent directory traversal
    $filename = basename($file_url);
    $target_dir = $upload_root . $allowed_types[$type];
    $filepath = $target_dir . $filename;

    if (file_exists($filepath) && is_file($filepath)) {
        if (unlink($filepath)) {
            echo json_encode([
                'success' => true,
                'message' => 'Berkas berhasil dihapus dari server.'
            ]);
            exit();
        } else {
            send_error('Gagal menghapus berkas dari server.', 500);
        }
    } else {
        // Return success even if not found on server to keep DB synchronization clean
        echo json_encode([
            'success' => true,
            'message' => 'Berkas tidak ditemukan di server, sinkronisasi selesai.'
        ]);
        exit();
    }
}

// Handle Upload Action
if ($action === 'upload') {
    $type = isset($_POST['type']) ? $_POST['type'] : '';
    
    if (empty($type)) {
        send_error('Parameter type wajib diisi.');
    }

    if (!array_key_exists($type, $allowed_types)) {
        send_error('Tipe folder tidak valid.');
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
        $error_code = isset($_FILES['file']['error']) ? $_FILES['file']['error'] : UPLOAD_ERR_NO_FILE;
        send_error('Gagal menerima file. Kode error upload: ' . $error_code);
    }

    $file = $_FILES['file'];
    $file_size = $file['size'];
    $tmp_name = $file['tmp_name'];
    $original_name = basename($file['name']);
    $file_ext = strtolower(pathinfo($original_name, PATHINFO_EXTENSION));

    // Resolve specific question media sub-folders depending on MIME type
    if ($type === 'media') {
        $mime = mime_content_type($tmp_name);
        if (strpos($mime, 'audio/') === 0) {
            $type = 'quiz-audio';
        } else if (strpos($mime, 'video/') === 0) {
            $type = 'quiz-videos';
        } else {
            $type = 'quiz-images';
        }
    }

    // Validate size and extensions based on type
    if ($type === 'profiles' || $type === 'thumbnails' || $type === 'quiz-images') {
        // Image validation: max 2 MB
        $max_size = 2 * 1024 * 1024;
        $allowed_exts = ['jpg', 'jpeg', 'png', 'webp'];
        if (!in_array($file_ext, $allowed_exts)) {
            send_error('Format gambar tidak didukung. Gunakan: ' . implode(', ', $allowed_exts));
        }
        if ($file_size > $max_size) {
            send_error('Ukuran gambar terlalu besar. Maksimal 2 MB.');
        }
    } else if ($type === 'quiz-audio') {
        // Audio validation: max 10 MB
        $max_size = 10 * 1024 * 1024;
        $allowed_exts = ['mp3', 'wav', 'ogg'];
        if (!in_array($file_ext, $allowed_exts)) {
            send_error('Format audio tidak didukung. Gunakan: ' . implode(', ', $allowed_exts));
        }
        if ($file_size > $max_size) {
            send_error('Ukuran audio terlalu besar. Maksimal 10 MB.');
        }
    } else if ($type === 'quiz-videos') {
        // Video validation: max 50 MB
        $max_size = 50 * 1024 * 1024;
        $allowed_exts = ['mp4', 'webm'];
        if (!in_array($file_ext, $allowed_exts)) {
            send_error('Format video tidak didukung. Gunakan: ' . implode(', ', $allowed_exts));
        }
        if ($file_size > $max_size) {
            send_error('Ukuran video terlalu besar. Maksimal 50 MB.');
        }
    }

    // Create folder paths securely
    $target_dir = $upload_root . $allowed_types[$type];
    if (!file_exists($target_dir)) {
        if (!mkdir($target_dir, 0755, true)) {
            send_error('Gagal membuat folder penyimpanan di server.', 500);
        }
    }

    // Generate unique name
    $new_filename = generate_uuid() . '.' . $file_ext;
    $dest_path = $target_dir . $new_filename;

    // Check if we can convert and compress image to WebP server-side as well
    $converted_webp = false;
    if (in_array($file_ext, ['jpg', 'jpeg', 'png']) && function_exists('imagecreatefromjpeg')) {
        // Try server-side fallback conversion
        $img = null;
        if ($file_ext === 'jpg' || $file_ext === 'jpeg') {
            $img = @imagecreatefromjpeg($tmp_name);
        } else if ($file_ext === 'png') {
            $img = @imagecreatefrompng($tmp_name);
            if ($img) {
                imagepalettetotruecolor($img);
                imagealphablending($img, true);
                imagesavealpha($img, true);
            }
        }

        if ($img) {
            $webp_filename = generate_uuid() . '.webp';
            $webp_dest = $target_dir . $webp_filename;
            if (@imagewebp($img, $webp_dest, 80)) {
                $new_filename = $webp_filename;
                $dest_path = $webp_dest;
                $converted_webp = true;
            }
            imagedestroy($img);
        }
    }

    // Move file if not converted
    if (!$converted_webp) {
        if (!move_uploaded_file($tmp_name, $dest_path)) {
            send_error('Gagal menyimpan file di server.', 500);
        }
    }

    // Return success url
    $file_url = $upload_base_url . $allowed_types[$type] . $new_filename;
    echo json_encode([
        'success' => true,
        'message' => 'Berkas berhasil diunggah.',
        'url' => $file_url,
        'filename' => $new_filename
    ]);
    exit();
}

send_error('Aksi tidak dikenal.');
