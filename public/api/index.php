<?php
/**
 * SINESA PHP REST API Entry Point & Foundation Router
 * Centralized exception handling, CORS preflight, and health check endpoint.
 */

declare(strict_types=1);

require_once __DIR__ . '/utils/response.php';
require_once __DIR__ . '/utils/request.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/jwt.php';
require_once __DIR__ . '/middleware/auth.php';

// -------------------------------------------------------------------------
// CENTRALIZED ERROR & EXCEPTION HANDLING
// Converts any uncaught PHP error or exception to uniform JSON { success, data, error }
// -------------------------------------------------------------------------
set_error_handler(function(int $severity, string $message, string $file, int $line) {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    error_log("[SINESA_PHP_ERROR] {$message} in {$file}:{$line}");
    send_error_response('Terjadi kesalahan internal pada server.', 500);
});

set_exception_handler(function(Throwable $e) {
    error_log("[SINESA_UNCAUGHT_EXCEPTION] {$e->getMessage()} in {$e->getFile()}:{$e->getLine()}");
    send_error_response('Terjadi kesalahan internal pada pemrosesan permintaan.', 500);
});

// Handle CORS Preflight
handle_cors_preflight();

// -------------------------------------------------------------------------
// HEALTH CHECK & FOUNDATION STATUS ENDPOINT
// -------------------------------------------------------------------------
$dbStatus = 'disconnected';
$tablesCount = 0;

try {
    $pdo = get_db();
    $stmt = $pdo->query("SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = DATABASE()");
    $res = $stmt->fetch();
    $tablesCount = (int)($res['cnt'] ?? 0);
    $dbStatus = 'connected';
} catch (Throwable $t) {
    $dbStatus = 'error: ' . $t->getMessage();
}

send_success_response([
    'app'          => 'SINESA REST API Foundation',
    'status'       => 'online',
    'version'      => '2.0.0',
    'database'     => $dbStatus,
    'tables_found' => $tablesCount,
    'timestamp'    => date('c'),
    'environment'  => Database::getEnv('APP_ENV', 'development'),
]);
