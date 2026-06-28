<?php
/**
 * Safe Media Streaming Service for SINESA
 * Bypasses direct static file blocks (403 Forbidden) and implements HTTP Range Requests (206 Partial Content)
 */

// Enable CORS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Range, Content-Type");
header("Access-Control-Allow-Methods: GET, OPTIONS");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit(0);
}

$file_name = isset($_GET['file']) ? basename($_GET['file']) : '';
$type = isset($_GET['type']) ? $_GET['type'] : 'video';

if (empty($file_name)) {
    http_response_code(400);
    echo "Parameter file wajib diisi.";
    exit();
}

// Validate file name is a safe UUID + extension to prevent directory traversal
if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(mp4|webm|mp3|ogg|wav)$/i', $file_name)) {
    http_response_code(403);
    echo "Akses ditolak.";
    exit();
}

$base_dir = __DIR__ . '/../uploads/';
$sub_folder = ($type === 'audio') ? 'quiz-audio/' : 'quiz-videos/';
$filepath = $base_dir . $sub_folder . $file_name;

if (!file_exists($filepath) || !is_file($filepath)) {
    http_response_code(404);
    echo "Berkas tidak ditemukan.";
    exit();
}

$fp = @fopen($filepath, 'rb');
if (!$fp) {
    http_response_code(500);
    echo "Gagal membuka berkas.";
    exit();
}

$size = filesize($filepath);
$length = $size;
$start = 0;
$end = $size - 1;

// Resolve MIME type
$mime = ($type === 'audio') ? 'audio/mpeg' : 'video/mp4';
$ext = strtolower(pathinfo($file_name, PATHINFO_EXTENSION));
if ($ext === 'webm') {
    $mime = 'video/webm';
} else if ($ext === 'ogg') {
    $mime = 'audio/ogg';
} else if ($ext === 'wav') {
    $mime = 'audio/wav';
}

header("Content-Type: " . $mime);
header("Accept-Ranges: bytes");

// Handle HTTP Range Requests (scrubbing support)
if (isset($_SERVER['HTTP_RANGE'])) {
    $c_start = $start;
    $c_end = $end;

    list(, $range) = explode('=', $_SERVER['HTTP_RANGE'], 2);
    if (strpos($range, ',') !== false) {
        header('HTTP/1.1 416 Requested Range Not Satisfiable');
        header("Content-Range: bytes $start-$end/$size");
        exit;
    }
    
    if ($range == '-') {
        $c_start = $size - substr($range, 1);
    } else {
        $range = explode('-', $range);
        $c_start = $range[0];
        $c_end = (isset($range[1]) && is_numeric($range[1])) ? $range[1] : $size - 1;
    }
    
    $c_end = ($c_end > $end) ? $end : $c_end;
    if ($c_start > $c_end || $c_start > $size - 1 || $c_end >= $size) {
        header('HTTP/1.1 416 Requested Range Not Satisfiable');
        header("Content-Range: bytes $start-$end/$size");
        exit;
    }
    
    $start = $c_start;
    $end = $c_end;
    $length = $end - $start + 1;
    fseek($fp, $start);
    header('HTTP/1.1 206 Partial Content');
}

header("Content-Range: bytes $start-$end/$size");
header("Content-Length: " . $length);

// Stream file content using memory-efficient chunking
$buffer = 1024 * 8; // 8KB chunks
while (!feof($fp) && ($p = ftell($fp)) <= $end) {
    if ($p + $buffer > $end) {
        $buffer = $end - $p + 1;
    }
    set_time_limit(0);
    echo fread($fp, $buffer);
    flush();
}

fclose($fp);
exit();
