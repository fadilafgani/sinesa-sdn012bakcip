<?php
/**
 * Request Utility for SINESA PHP REST API
 * Handles input parsing, Bearer token extraction, and data sanitization.
 */

declare(strict_types=1);

// Ensure $_GET is populated if run through CGI or test harness
if (empty($_GET) && !empty($_SERVER['QUERY_STRING'])) {
    parse_str((string)$_SERVER['QUERY_STRING'], $_GET);
}

/**
 * Safely parse incoming JSON request body
 *
 * @return array Parsed associative array
 */
function get_json_input(): array {
    $raw = file_get_contents('php://input');
    if (!$raw || trim($raw) === '') {
        $raw = @file_get_contents('php://stdin');
    }
    if (!$raw || trim($raw) === '') {
        return [];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return [];
    }

    return $decoded;
}

/**
 * Get sanitized query string parameter
 *
 * @param string $key Query key
 * @param mixed $default Fallback value
 * @return mixed
 */
function get_query_param(string $key, $default = null) {
    if (!isset($_GET[$key])) {
        return $default;
    }

    $val = $_GET[$key];
    if (is_string($val)) {
        return trim(strip_tags($val));
    }

    return $val;
}

/**
 * Extract Bearer token from HTTP headers
 * Supports Apache, Nginx, CGI, and proxy headers
 *
 * @return string|null
 */
function get_bearer_token(): ?string {
    $header = null;

    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('getallheaders')) {
        $headers = getallheaders();
        foreach ($headers as $k => $v) {
            if (strtolower((string)$k) === 'authorization') {
                $header = $v;
                break;
            }
        }
    }

    if (!$header || !is_string($header)) {
        return null;
    }

    if (preg_match('/Bearer\s+(.*)$/i', trim($header), $matches)) {
        return trim($matches[1]);
    }

    return null;
}

/**
 * Generate cryptographically secure RFC 4122 compliant UUID v4
 *
 * @return string
 */
function generate_uuid(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40); // version 4
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80); // variant RFC 4122

    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

/**
 * Sanitize string value (trim and remove null bytes)
 *
 * @param string|null $value
 * @return string
 */
function sanitize_string(?string $value): string {
    if ($value === null) {
        return '';
    }
    return trim(str_replace(chr(0), '', $value));
}
