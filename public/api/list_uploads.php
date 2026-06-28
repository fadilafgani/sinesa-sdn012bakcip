<?php
header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

$folders = [
    'public_html' => __DIR__ . '/../../',
    'api' => __DIR__ . '/../',
    'uploads_root' => __DIR__ . '/../uploads/',
    'quiz-videos' => __DIR__ . '/../uploads/quiz-videos/',
    'quiz-audio' => __DIR__ . '/../uploads/quiz-audio/',
    'quiz-images' => __DIR__ . '/../uploads/quiz-images/',
    'thumbnails' => __DIR__ . '/../uploads/thumbnails/',
    'profiles' => __DIR__ . '/../uploads/profiles/'
];

$result = [];
foreach ($folders as $key => $dir) {
    if (file_exists($dir)) {
        $real_path = realpath($dir);
        $result[$key] = [
            'exists' => true,
            'path' => $real_path,
            'perms' => substr(sprintf('%o', fileperms($dir)), -4),
            'owner' => function_exists('posix_getpwuid') ? posix_getpwuid(fileowner($dir))['name'] : fileowner($dir),
            'readable' => is_readable($dir),
            'writable' => is_writable($dir),
            'executable' => is_executable($dir)
        ];
    } else {
        $result[$key] = [
            'exists' => false
        ];
    }
}

echo json_encode($result, JSON_PRETTY_PRINT);
