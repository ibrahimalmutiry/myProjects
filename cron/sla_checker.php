<?php
/**
 * CRON Job — SLA Checker
 * يُشغَّل كل 15 دقيقة على الخادم
 *
 * إعداد CRON (أضف في crontab -e):
 * ┌─────────────────────────────────────────────────────┐
 * │  *\/15 * * * * php /full/path/to/cron/sla_checker.php >> /full/path/to/logs/cron.log 2>&1
 * └─────────────────────────────────────────────────────┘
 *
 * اختبار يدوي:
 *   php cron/sla_checker.php
 */

// ── منع التشغيل عبر المتصفح ─────────────────────────────
if (PHP_SAPI !== 'cli' && !isset($_GET['cron_token'])) {
    http_response_code(403);
    die('Access denied');
}
if (PHP_SAPI !== 'cli') {
    $expected = $_ENV['CRON_TOKEN'] ?? getenv('CRON_TOKEN') ?? '';
    if ($expected === '' || !hash_equals($expected, $_GET['cron_token'] ?? '')) {
        http_response_code(403);
        die('Invalid token');
    }
}

// ── منع التشغيل المتزامن (lock file) ────────────────────
$lockFile = sys_get_temp_dir() . '/sla_checker.lock';
$lockFp   = fopen($lockFile, 'c');
if (!flock($lockFp, LOCK_EX | LOCK_NB)) {
    exit(0); // نسخة أخرى تعمل بالفعل
}

$startTime = microtime(true);
$logPrefix = '[' . date('Y-m-d H:i:s') . '] SLA_CHECKER';

// ── تحميل البيئة ─────────────────────────────────────────
$root = dirname(__DIR__);
$envFile = $root . '/.env';
if (file_exists($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if (!$line || (strpos($line, '#') === 0) || !(strpos($line, '=') !== false)) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v);
    }
}

require_once $root . '/includes/config.php';
require_once $root . '/includes/pr_functions.php';

// ── تشغيل فحص SLA ────────────────────────────────────────
try {
    prUpdateAllSlaPercentages();

    $elapsed = round((microtime(true) - $startTime) * 1000);
    echo "$logPrefix OK — {$elapsed}ms\n";

} catch (Throwable $e) {
    echo "$logPrefix ERROR — " . $e->getMessage() . "\n";
    error_log("SLA Checker Error: " . $e->getMessage());
}

// ── تحرير القفل ──────────────────────────────────────────
flock($lockFp, LOCK_UN);
fclose($lockFp);

// ── تنظيف الإشعارات القديمة (مرة كل 24 ساعة) ────────────────
$lockClean = sys_get_temp_dir() . '/notif_cleanup.lock';
if (!file_exists($lockClean) || (time() - filemtime($lockClean)) > 86400) {
    try {
        $conn = db();
        $conn->query("
            DELETE FROM system_notifications
            WHERE is_read = 1
              AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
        ");
        $conn->query("
            DELETE FROM system_notifications
            WHERE created_at < DATE_SUB(NOW(), INTERVAL 60 DAY)
        ");
        touch($lockClean);
        echo "[" . date('Y-m-d H:i:s') . "] CLEANUP: حذف الإشعارات المنتهية\n";
    } catch (Throwable $e) {
        error_log("Notification Cleanup Error: " . $e->getMessage());
    }
}