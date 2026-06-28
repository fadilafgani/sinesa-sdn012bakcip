<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

$folders = [
    'quiz-videos' => __DIR__ . '/../uploads/quiz-videos/',
    'quiz-audio' => __DIR__ . '/../uploads/quiz-audio/',
    'quiz-images' => __DIR__ . '/../uploads/quiz-images/',
    'thumbnails' => __DIR__ . '/../uploads/thumbnails/',
    'profiles' => __DIR__ . '/../uploads/profiles/',
    'uploads_root' => __DIR__ . '/../uploads/'
];

$result = [];
foreach ($folders as $key => $dir) {
    if (file_exists($dir)) {
        $files = [];
        $scanned = scandir($dir);
        foreach ($scanned as $f) {
            if ($f !== '.' && $f !== '..') {
                $path = $dir . $f;
                $files[] = [
                    'name' => $f,
                    'size' => filesize($path),
                    'perms' => substr(sprintf('%o', fileperms($path)), -4),
                    'readable' => is_readable($path),
                    'writable' => is_writable($path)
                ];
            }
        }
        $result[$key] = [
            'exists' => true,
            'readable' => is_readable($dir),
            'writable' => is_writable($dir),
            'files' => $files
        ];
    } else {
        $result[$key] = [
            'exists' => false
        ];
    }
}

echo json_encode($result, JSON_PRETTY_PRINT);
