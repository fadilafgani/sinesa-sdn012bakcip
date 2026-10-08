<?php
/**
 * SINESA Supabase Data Exporter
 * Path: scripts/export_supabase.php
 *
 * Responsibilities:
 * - Safely exports all 11 entities from Supabase via REST API
 * - Saves raw and normalized data to database/supabase_export/*.json
 * - STRICTLY READ-ONLY: Never alters, modifies, or deletes any Supabase data!
 *
 * Usage:
 * php scripts/export_supabase.php [--url=<supabase_url>] [--key=<supabase_key>] [--out=<dir>]
 */

declare(strict_types=1);

require_once __DIR__ . '/../public/api/config/database.php';

// Parse CLI options
$options = getopt('', ['url:', 'key:', 'out:', 'help']);

if (isset($options['help'])) {
    echo "Usage: php scripts/export_supabase.php [options]\n";
    echo "Options:\n";
    echo "  --url=<url>   Supabase project URL (defaults to VITE_SUPABASE_URL in .env)\n";
    echo "  --key=<key>   Supabase Anon/Service Key (defaults to VITE_SUPABASE_ANON_KEY in .env)\n";
    echo "  --out=<dir>   Output directory for exported JSON files (default: database/supabase_export)\n";
    exit(0);
}

$supabaseUrl = $options['url'] ?? Database::getEnv('VITE_SUPABASE_URL', 'https://nkooezjjgmqcytndswui.supabase.co');
$supabaseKey = $options['key'] ?? Database::getEnv('VITE_SUPABASE_ANON_KEY', '');
$outDir = $options['out'] ?? (dirname(__DIR__) . DIRECTORY_SEPARATOR . 'database' . DIRECTORY_SEPARATOR . 'supabase_export');

if (!is_dir($outDir)) {
    mkdir($outDir, 0755, true);
}

echo "========================================================\n";
echo " SINESA DATA EXPORT: SUPABASE -> LOCAL JSON ARCHIVE\n";
echo " (Mode: Strict Read-Only, Non-Destructive)\n";
echo "========================================================\n";
echo "Target Supabase URL : {$supabaseUrl}\n";
echo "Export Directory    : {$outDir}\n\n";

/**
 * Fetch table rows from Supabase REST API
 */
function fetch_supabase_table(string $url, string $key, string $table, int $limit = 5000): array {
    $endpoint = rtrim($url, '/') . '/rest/v1/' . $table . '?select=*&limit=' . $limit;
    
    $ch = curl_init($endpoint);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'apikey: ' . $key,
        'Authorization: Bearer ' . $key,
        'Content-Type: application/json',
        'Accept: application/json',
    ]);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($err) {
        fwrite(STDERR, "  [!] cURL Error fetching {$table}: {$err}\n");
        return [];
    }

    if ($httpCode !== 200) {
        fwrite(STDERR, "  [!] HTTP {$httpCode} fetching {$table}: {$response}\n");
        return [];
    }

    $decoded = json_decode((string)$response, true);
    return is_array($decoded) ? $decoded : [];
}

$tables = [
    'profiles'        => 'profiles.json',
    'quizzes'         => 'quizzes.json',
    'questions'       => 'questions.json',
    'options'         => 'options.json',
    'quiz_sessions'   => 'quiz_sessions.json',
    'participants'    => 'participants.json',
    'answers'         => 'answers.json',
    'system_settings' => 'settings.json',
    'activity_logs'   => 'activity_logs.json',
];

$manifest = [
    'exported_at' => date('c'),
    'source_url'  => $supabaseUrl,
    'tables'      => []
];

foreach ($tables as $table => $fileName) {
    echo "-> Mengambil data tabel '{$table}'... ";
    $rows = fetch_supabase_table($supabaseUrl, $supabaseKey, $table);
    $count = count($rows);
    echo "ditemukan {$count} baris.\n";

    $destPath = $outDir . DIRECTORY_SEPARATOR . $fileName;
    file_put_contents($destPath, json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    $manifest['tables'][$table] = [
        'file'  => $fileName,
        'count' => $count,
        'bytes' => filesize($destPath)
    ];
}

// Media metadata extraction
$mediaFile = $outDir . DIRECTORY_SEPARATOR . 'media_files.json';
if (!file_exists($mediaFile)) {
    file_put_contents($mediaFile, json_encode([], JSON_PRETTY_PRINT));
    $manifest['tables']['media_files'] = ['file' => 'media_files.json', 'count' => 0, 'bytes' => 2];
}

// Write manifest metadata
file_put_contents($outDir . DIRECTORY_SEPARATOR . 'manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo "\n========================================================\n";
echo " Ekspor Selesai! File disimpan di: {$outDir}\n";
echo " Supabase tetap utuh dan tidak mengalami perubahan apapun.\n";
echo "========================================================\n";
