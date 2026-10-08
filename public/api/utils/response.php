<?php
/**
 * Response Utility for SINESA PHP REST API
 * Standardizes API responses to { success, data, error } with proper HTTP status codes.
 */

declare(strict_types=1);

/**
 * Configure global CORS headers for cross-origin SPA requests
 */
function set_cors_headers(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
    header("Access-Control-Allow-Origin: $origin");
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Range");
    header("Content-Type: application/json; charset=UTF-8");
}

/**
 * Handle preflight OPTIONS request
 */
function handle_cors_preflight(): void {
    if (isset($_SERVER['REQUEST_METHOD']) && strtoupper($_SERVER['REQUEST_METHOD']) === 'OPTIONS') {
        set_cors_headers();
        http_response_code(200);
        exit(0);
    }
}

/**
 * Send standard JSON response and terminate script
 *
 * @param mixed $data Output payload
 * @param int $statusCode HTTP status code (200, 201, 400, 401, 403, 404, 500, etc.)
 * @param mixed $error Error payload or message if failed
 * @param bool $success Success indicator flag
 */
function send_json_response($data = null, int $statusCode = 200, $error = null, bool $success = true): void {
    set_cors_headers();
    http_response_code($statusCode);

    $response = [
        'success' => $success,
        'data' => $data,
        'error' => $error,
    ];

    echo json_encode($response, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit(0);
}

/**
 * Send standard successful JSON response (HTTP 200 or 201)
 *
 * @param mixed $data Data payload
 * @param int $statusCode HTTP status code (default 200)
 */
function send_success_response($data = null, int $statusCode = 200): void {
    send_json_response($data, $statusCode, null, true);
}

/**
 * Send standard error JSON response (HTTP 4xx or 5xx)
 *
 * @param mixed $error Error message or error object
 * @param int $statusCode HTTP error code (default 400)
 * @param mixed $data Optional partial data
 */
function send_error_response($error = 'Terjadi kesalahan pada server', int $statusCode = 400, $data = null): void {
    send_json_response($data, $statusCode, $error, false);
}
