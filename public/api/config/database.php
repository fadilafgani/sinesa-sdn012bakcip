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

        // Try reading root .env file if available
        static $envCache = null;
        if ($envCache === null) {
            $envCache = [];
            $envPath = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . '.env';
            if (file_exists($envPath) && is_readable($envPath)) {
                $lines = file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
                foreach ($lines as $line) {
                    $line = trim($line);
                    if ($line === '' || strpos($line, '#') === 0) continue;
                    $parts = explode('=', $line, 2);
                    if (count($parts) === 2) {
                        $k = trim($parts[0]);
                        $v = trim($parts[1]);
                        if (strpos($v, '"') === 0 && strrpos($v, '"') === strlen($v) - 1) {
                            $v = substr($v, 1, -1);
                        } elseif (strpos($v, "'") === 0 && strrpos($v, "'") === strlen($v) - 1) {
                            $v = substr($v, 1, -1);
                        }
                        $envCache[$k] = $v;
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

        $host = self::getEnv('DB_HOST', '127.0.0.1');
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
            // Log real database error privately and return safe error JSON
            error_log('[SINESA_DB_ERROR] Connection failed: ' . $e->getMessage());
            send_error_response('Gagal menghubungkan ke database server lokal.', 500);
        }
    }
}

/**
 * Functional shorthand helper
 */
function get_db(): PDO {
    return Database::getConnection();
}
