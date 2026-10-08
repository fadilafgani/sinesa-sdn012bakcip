<?php
/**
 * Database Configuration & PDO Connection Factory for SINESA
 * Connects to MySQL/MariaDB using PDO with prepared statements and secure error handling.
 */

declare(strict_types=1);

require_once __DIR__ . '/../utils/response.php';

class Database {
    private static ?PDO $instance = null;

    /**
     * Parse environment variable with fallback to .env file
     */
    public static function getEnv(string $key, ?string $default = null): ?string {
        $val = getenv($key);
        if ($val !== false && $val !== '') {
            return (string)$val;
        }

        if (isset($_ENV[$key]) && $_ENV[$key] !== '') {
            return (string)$_ENV[$key];
        }

        if (isset($_SERVER[$key]) && $_SERVER[$key] !== '') {
            return (string)$_SERVER[$key];
        }

        // Try reading .env file if available (supports public_html/.env, DOCUMENT_ROOT, and home/username/.env)
        static $envCache = null;
        if ($envCache === null) {
            $envCache = [];
            $docRoot = isset($_SERVER['DOCUMENT_ROOT']) && $_SERVER['DOCUMENT_ROOT'] !== '' ? rtrim((string)$_SERVER['DOCUMENT_ROOT'], '/\\') : null;

            $candidatePaths = [
                dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . '.env', // /public_html/.env
                dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . '.env', // /home/username/.env (one level above public_html)
                dirname(__DIR__, 1) . DIRECTORY_SEPARATOR . '.env', // /public_html/api/.env
            ];

            if ($docRoot !== null) {
                $candidatePaths[] = $docRoot . DIRECTORY_SEPARATOR . '.env';
                $candidatePaths[] = dirname($docRoot) . DIRECTORY_SEPARATOR . '.env';
            }

            foreach ($candidatePaths as $envPath) {
                if (file_exists($envPath) && is_readable($envPath)) {
                    $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                    foreach ($lines as $line) {
                        $line = trim($line);
                        if ($line === '' || strpos($line, '#') === 0) continue;
                        $parts = explode('=', $line, 2);
                        if (count($parts) === 2) {
                            $k = trim($parts[0]);
                            $v = trim($parts[1]);
                            if ((strpos($v, '"') === 0 && strrpos($v, '"') === strlen($v) - 1) ||
                                (strpos($v, "'") === 0 && strrpos($v, "'") === strlen($v) - 1)) {
                                $v = substr($v, 1, -1);
                            }
                            if (!isset($envCache[$k])) {
                                $envCache[$k] = $v;
                            }
                        }
                    }
                }
            }
        }

        return $envCache[$key] ?? $default;
    }

    /**
     * Get singleton PDO connection instance
     */
    public static function getConnection(): PDO {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $host = self::getEnv('DB_HOST', 'localhost');
        $port = self::getEnv('DB_PORT', '3306');
        $dbName = self::getEnv('DB_NAME', 'sinesa_db');
        $user = self::getEnv('DB_USER', 'root');
        $pass = self::getEnv('DB_PASS', '');
        $charset = self::getEnv('DB_CHARSET', 'utf8mb4');

        $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset={$charset}";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false, // Enforce true server-side prepared statements
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$charset} COLLATE utf8mb4_unicode_ci"
        ];

        try {
            self::$instance = new PDO($dsn, $user, $pass, $options);
            return self::$instance;
        } catch (PDOException $e) {
            // Log real database error and return diagnostic details to quickly resolve connection
            error_log('[SINESA_DB_ERROR] Connection failed: ' . $e->getMessage());
            $debugMsg = 'Gagal menghubungkan ke database: ' . $e->getMessage() . " (Host: {$host}, Port: {$port}, Database: {$dbName}, User: {$user})";
            send_error_response($debugMsg, 500);
        }
    }
}

/**
 * Functional shorthand helper
 */
function get_db(): PDO {
    return Database::getConnection();
}
