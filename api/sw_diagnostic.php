<?php
/**
 * sw_diagnostic.php — كاشف الخطأ الحقيقي لـ sample_warehouse_api
 * ضعه في: api/sw_diagnostic.php ثم افتح: /api/sw_diagnostic.php
 * احذفه بعد حل المشكلة
 */
header('Content-Type: application/json; charset=utf-8');
$report = [];

// 1. فحص الملفات المطلوبة
$files = [
    'config.php'              => __DIR__ . '/../config.php',
    'functions.php'           => __DIR__ . '/../functions.php',
    'permissions_functions.php' => __DIR__ . '/../permissions_functions.php',
    'includes/functions.php'  => __DIR__ . '/../includes/functions.php',
];
foreach ($files as $label => $path) {
    $report['files'][$label] = file_exists($path) ? 'موجود ✓' : 'غير موجود ✗';
}

// 2. محاولة تحميل config.php وتسجيل الخطأ
ob_start();
$configError = null;
try {
    if (file_exists(__DIR__ . '/../config.php')) {
        require_once __DIR__ . '/../config.php';
        $report['config'] = 'تم تحميله ✓';
        $report['functions_after_config'] = [
            'db'               => function_exists('db')               ? '✓' : '✗',
            'jsonResponse'     => function_exists('jsonResponse')     ? '✓' : '✗',
            'clean'            => function_exists('clean')            ? '✓' : '✗',
            'verifyCsrfToken'  => function_exists('verifyCsrfToken')  ? '✓' : '✗',
            'session_active'   => session_status() === PHP_SESSION_ACTIVE ? '✓' : '✗',
        ];
    }
} catch (Throwable $e) {
    $report['config_error'] = $e->getMessage() . ' (line ' . $e->getLine() . ')';
}
ob_end_clean();

// 3. محاولة تحميل functions.php
ob_start();
try {
    if (file_exists(__DIR__ . '/../functions.php')) {
        require_once __DIR__ . '/../functions.php';
        $report['functions'] = 'تم تحميله ✓';
    }
} catch (Throwable $e) {
    $report['functions_error'] = $e->getMessage() . ' (line ' . $e->getLine() . ')';
}
ob_end_clean();

// 4. محاولة تحميل permissions_functions.php
ob_start();
try {
    if (file_exists(__DIR__ . '/../permissions_functions.php')) {
        require_once __DIR__ . '/../permissions_functions.php';
        $report['permissions'] = 'تم تحميله ✓';
    }
} catch (Throwable $e) {
    $report['permissions_error'] = $e->getMessage() . ' (line ' . $e->getLine() . ')';
}
ob_end_clean();

// 5. اختبار الاتصال بقاعدة البيانات
if (function_exists('db')) {
    try {
        $conn = db();
        $report['db'] = $conn ? 'متصل ✓' : 'فشل الاتصال ✗';
        // اختبار وجود الجداول
        $tables = ['samples','sample_inventory','sample_movements','sample_stage_log'];
        foreach ($tables as $t) {
            $r = $conn->query("SHOW TABLES LIKE '$t'");
            $report['tables'][$t] = ($r && $r->num_rows > 0) ? 'موجود ✓' : 'غير موجود ✗';
        }
    } catch (Throwable $e) {
        $report['db_error'] = $e->getMessage();
    }
}

// 6. PHP version & extensions
$report['php'] = PHP_VERSION;
$report['extensions'] = [
    'mysqli'  => extension_loaded('mysqli')  ? '✓' : '✗',
    'mbstring'=> extension_loaded('mbstring')? '✓' : '✗',
    'json'    => extension_loaded('json')    ? '✓' : '✗',
];

// 7. error_log path
$report['error_log'] = ini_get('error_log') ?: 'غير محدد';
$report['display_errors'] = ini_get('display_errors');

echo json_encode($report, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
