<?php
/**
 * Standalone JSON Web Token (JWT) Service for SINESA
 * Implements HMAC-SHA256 (HS256) signature verification and creation without external dependencies.
 * Supports Access Tokens, HttpOnly Refresh Tokens, and frontend payload formatting.
 */

declare(strict_types=1);

require_once __DIR__ . '/database.php';

class JWT {
    /**
     * Get secret key from environment or fallback
     */
    public static function getSecret(): string {
        $secret = Database::getEnv('JWT_SECRET');
        if (!empty($secret)) {
            return $secret;
        }

        // Secondary fallback
        $supabaseAnon = Database::getEnv('VITE_SUPABASE_ANON_KEY');
        if (!empty($supabaseAnon)) {
            return substr(hash('sha256', $supabaseAnon), 0, 32);
        }

        return '332f550c231675c5376c511d17db491bdff1a00513a62b2bcffab4f579e58176';
    }

    /**
     * Base64URL encode string
     */
    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Base64URL decode string
     */
    private static function base64UrlDecode(string $data): string {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', (4 - strlen($data) % 4) % 4));
    }

    /**
     * Generate signed JWT token
     *
     * @param array $payload Data to embed in token (user id, role, email, name, etc.)
     * @param int $ttl Time to live in seconds (default 86400 = 24 hours)
     * @param string|null $secret Custom secret key (optional)
     * @return string Signed JWT string
     */
    public static function encode(array $payload, int $ttl = 86400, ?string $secret = null): string {
        $secret = $secret ?? self::getSecret();
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];

        $now = time();
        $payload['iat'] = $payload['iat'] ?? $now;
        $payload['exp'] = $payload['exp'] ?? ($now + $ttl);

        $base64Header = self::base64UrlEncode((string)json_encode($header));
        $base64Payload = self::base64UrlEncode((string)json_encode($payload));

        $signature = hash_hmac('sha256', "{$base64Header}.{$base64Payload}", $secret, true);
        $base64Signature = self::base64UrlEncode($signature);

        return "{$base64Header}.{$base64Payload}.{$base64Signature}";
    }

    /**
     * Verify and decode a JWT token
     *
     * @param string $token Encoded JWT string
     * @param string|null $secret Custom secret key (optional)
     * @return array|null Returns decoded payload array or null if invalid/expired
     */
    public static function decode(string $token, ?string $secret = null): ?array {
        $secret = $secret ?? self::getSecret();
        $parts = explode('.', $token);

        if (count($parts) !== 3) {
            return null;
        }

        list($base64Header, $base64Payload, $base64Signature) = $parts;

        // Verify signature
        $expectedSignature = hash_hmac('sha256', "{$base64Header}.{$base64Payload}", $secret, true);
        $providedSignature = self::base64UrlDecode($base64Signature);

        if (!hash_equals($expectedSignature, $providedSignature)) {
            return null; // Signature mismatch
        }

        // Decode payload
        $payloadJson = self::base64UrlDecode($base64Payload);
        $payload = json_decode($payloadJson, true);

        if (!is_array($payload)) {
            return null;
        }

        // Check expiration
        if (isset($payload['exp']) && (int)$payload['exp'] < time()) {
            return null; // Token expired
        }

        return $payload;
    }

    /**
     * Create short-lived Access Token (15 minutes default)
     */
    public static function createAccessToken(array $userProfile, int $ttl = 900): string {
        $payload = [
            'sub'   => $userProfile['id'],
            'role'  => $userProfile['role'],
            'email' => $userProfile['email'],
            'name'  => $userProfile['full_name'],
            'type'  => 'access',
        ];
        return self::encode($payload, $ttl);
    }

    /**
     * Create long-lived Refresh Token (7 days default)
     */
    public static function createRefreshToken(string $userId, int $ttl = 604800): string {
        $payload = [
            'sub'   => $userId,
            'type'  => 'refresh',
            'token_version' => 1,
        ];
        return self::encode($payload, $ttl);
    }

    /**
     * Set HttpOnly, Secure, SameSite cookie for refresh token
     */
    public static function setRefreshTokenCookie(string $token, int $ttl = 604800): void {
        $isHttps = (isset($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) === 'on')
                || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
                || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);

        setcookie('sinesa_refresh_token', $token, [
            'expires'  => time() + $ttl,
            'path'     => '/api/auth',
            'domain'   => '',
            'secure'   => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    }

    /**
     * Clear HttpOnly refresh token cookie on logout
     */
    public static function clearRefreshTokenCookie(): void {
        $isHttps = (isset($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) === 'on')
                || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')
                || (isset($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443);

        setcookie('sinesa_refresh_token', '', [
            'expires'  => time() - 86400,
            'path'     => '/api/auth',
            'domain'   => '',
            'secure'   => $isHttps,
            'httponly' => true,
            'samesite' => 'Lax'
        ]);
    }

    /**
     * Extract refresh token from HttpOnly cookie
     */
    public static function getRefreshTokenFromCookie(): ?string {
        if (isset($_COOKIE['sinesa_refresh_token']) && is_string($_COOKIE['sinesa_refresh_token'])) {
            $token = trim($_COOKIE['sinesa_refresh_token']);
            return $token !== '' ? $token : null;
        }
        return null;
    }

    /**
     * Format user & profile objects to match SINESA frontend contracts
     */
    public static function formatAuthPayload(array $profileRow): array {
        $user = [
            'id'            => $profileRow['id'],
            'email'         => $profileRow['email'],
            'role'          => $profileRow['role'],
            'user_metadata' => [
                'role'      => $profileRow['role'],
                'full_name' => $profileRow['full_name'],
                'avatar_url'=> $profileRow['avatar_url'] ?? null,
                'username'  => $profileRow['username'] ?? null,
            ],
            'created_at'    => $profileRow['created_at'],
        ];

        $profile = [
            'id'         => $profileRow['id'],
            'role'       => $profileRow['role'],
            'full_name'  => $profileRow['full_name'],
            'avatar_url' => $profileRow['avatar_url'] ?? null,
            'username'   => $profileRow['username'] ?? null,
            'status'     => $profileRow['status'] ?? 'active',
            'email'      => $profileRow['email'],
            'created_at' => $profileRow['created_at'],
        ];

        return [
            'user'    => $user,
            'profile' => $profile,
        ];
    }
}
