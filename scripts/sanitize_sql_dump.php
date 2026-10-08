<?php
/**
 * Sanitize SQL Dump for Shared Hosting / cPanel phpMyAdmin Compatibility
 * 1. Ensures pure UTF-8 encoding (removes UTF-16 / null bytes if any)
 * 2. Strips DEFINER clauses (prevent SUPER privilege error 1227 on cPanel)
 * 3. Strips problematic character set switches (cp850, etc.)
 */

$dumpPath = __DIR__ . '/../database/sinesa_production_dump.sql';

if (!file_exists($dumpPath)) {
    echo "Dump file not found: {$dumpPath}\n";
    exit(1);
}

$raw = file_get_contents($dumpPath);

// Check if UTF-16
if (strpos(substr($raw, 0, 100), "\0") !== false) {
    echo "Detected UTF-16 LE, converting to UTF-8...\n";
    $raw = mb_convert_encoding($raw, 'UTF-8', 'UTF-16LE');
}

// Strip BOM
$raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);

// Strip DEFINER clauses: e.g. /*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
$raw = preg_replace('/\/\*\!50013 DEFINER=[^*]+\*\//', '', $raw);
$raw = preg_replace('/DEFINER\s*=\s*`[^`]+`@`[^`]+`/', '', $raw);

// Strip character set cp850 switches
$raw = str_replace('cp850', 'utf8mb4', $raw);
$raw = str_replace('cp850_general_ci', 'utf8mb4_unicode_ci', $raw);

// Ensure foreign keys checks wrap the entire file safely
$cleanSql = "SET FOREIGN_KEY_CHECKS = 0;\n"
          . "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n"
          . "SET NAMES utf8mb4;\n\n"
          . $raw . "\n\n"
          . "SET FOREIGN_KEY_CHECKS = 1;\n";

file_put_contents($dumpPath, $cleanSql);

echo "Successfully sanitized dump file: {$dumpPath}\n";
echo "File size: " . filesize($dumpPath) . " bytes\n";
