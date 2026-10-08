<?php
/**
 * SINESA REST API: Settings & School Configuration Endpoint
 * Path: /api/settings.php
 *
 * Handlers:
 * - GET: Retrieve system & school settings (Public / Authenticated)
 * - PUT / POST: Update system & school settings (Strictly requires Admin role)
 */

declare(strict_types=1);

require_once __DIR__ . '/utils/response.php';
require_once __DIR__ . '/utils/request.php';
require_once __DIR__ . '/config/database.php';
require_once __DIR__ . '/config/jwt.php';
require_once __DIR__ . '/middleware/auth.php';

// Handle CORS Preflight
handle_cors_preflight();

$pdo = get_db();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    // -------------------------------------------------------------------------
    // GET: Retrieve all system & school settings
    // -------------------------------------------------------------------------
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT `key`, `value` FROM settings");
        $rows = $stmt->fetchAll();

        $settings = [];
        foreach ($rows as $r) {
            $settings[(string)$r['key']] = (string)$r['value'];
        }

        send_success_response($settings);
    }

    // -------------------------------------------------------------------------
    // PUT / POST: Update system & school settings (Admin Only)
    // -------------------------------------------------------------------------
    if ($method === 'PUT' || $method === 'POST') {
        // Enforce Administrator Role
        $admin = require_role('admin');
        $adminId = $admin['sub'] ?? '';

        $input = get_json_input();

        if (empty($input)) {
            send_error_response('Data pengaturan yang dikirim kosong.', 400);
        }

        // Support both key-value dictionary or array of objects
        $pairs = [];
        if (isset($input[0]) && is_array($input[0])) {
            foreach ($input as $item) {
                if (isset($item['key'])) {
                    $pairs[(string)$item['key']] = (string)($item['value'] ?? '');
                }
            }
        } else {
            foreach ($input as $k => $v) {
                if (is_string($k) && $k !== '') {
                    $pairs[$k] = is_bool($v) ? ($v ? 'true' : 'false') : (string)$v;
                }
            }
        }

        if (empty($pairs)) {
            send_error_response('Tidak ada entri pengaturan yang valid.', 400);
        }

        $pdo->beginTransaction();

        $upsertStmt = $pdo->prepare("
            INSERT INTO settings (`key`, `value`, `updated_at`)
            VALUES (:key, :value, NOW())
            ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), `updated_at` = NOW()
        ");

        foreach ($pairs as $key => $val) {
            $cleanKey = sanitize_string($key);
            $cleanVal = trim($val);
            $upsertStmt->execute([':key' => $cleanKey, ':value' => $cleanVal]);
        }

        // Record activity log
        $logStmt = $pdo->prepare("
            INSERT INTO activity_logs (id, user_id, action, details, created_at)
            VALUES (:id, :uid, 'SAVE_SETTINGS', 'Menyimpan konfigurasi pengaturan sekolah & sistem global', NOW())
        ");
        $logStmt->execute([
            ':id'  => generate_uuid(),
            ':uid' => $adminId ?: null,
        ]);

        $pdo->commit();

        // Return refreshed settings
        $stmt = $pdo->query("SELECT `key`, `value` FROM settings");
        $refreshed = [];
        foreach ($stmt->fetchAll() as $r) {
            $refreshed[(string)$r['key']] = (string)$r['value'];
        }

        send_success_response($refreshed, 200);
    }

    send_error_response('Metode HTTP tidak didukung.', 405);

} catch (\PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Settings API Database Error: ' . $e->getMessage());
    send_error_response('Gagal memproses database pengaturan: ' . $e->getMessage(), 500);
} catch (\Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('Settings API General Error: ' . $e->getMessage());
    send_error_response('Terjadi kesalahan sistem saat menyimpan pengaturan.', 500);
}
