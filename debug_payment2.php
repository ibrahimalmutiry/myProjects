<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

// محاكاة طلب get_orders_by_day
$_GET['action'] = 'get_orders_by_day';
$_GET['days']   = '30';

// تشغيل الـ API وإمساك أي خطأ
ob_start();
try {
    include __DIR__ . '/api/daily_payments_api.php';
} catch (Throwable $e) {
    ob_end_clean();
    echo "❌ Error: " . $e->getMessage() . "\n";
    echo "File: " . $e->getFile() . " Line: " . $e->getLine() . "\n";
    echo $e->getTraceAsString();
    exit;
}
$output = ob_get_clean();
echo "<pre>Output:\n" . htmlspecialchars($output) . "</pre>";