<?php
/**
 * archive_debug.php — ملف تشخيص مؤقت
 * ارفعه في مجلد api/ وافتحه من المتصفح مباشرة
 * احذفه بعد الانتهاء
 */
session_start();
header('Content-Type: application/json; charset=utf-8');

$configPaths = [
    dirname(__DIR__) . '/config.php',
    dirname(__DIR__) . '/includes/config.php',
];
foreach ($configPaths as $cp) {
    if (file_exists($cp)) { require_once $cp; break; }
}

$result = [
    'php_version'  => PHP_VERSION,
    'session_ok'   => isset($_SESSION['user_id']),
    'user_id'      => $_SESSION['user_id'] ?? null,
    'user_role'    => $_SESSION['user_role'] ?? null,
    'perm_level'   => $_SESSION['permission_level'] ?? null,
    'db_ok'        => false,
    'archive_table_exists' => false,
    'archive_row_count'    => null,
    'error'        => null,
];

try {
    $conn = db();
    $result['db_ok'] = true;

    // تحقق من جدول الأرشيف
    $r = $conn->query("SHOW TABLES LIKE 'financial_archive'");
    $result['archive_table_exists'] = ($r && $r->num_rows > 0);

    if ($result['archive_table_exists']) {
        $r = $conn->query("SELECT COUNT(*) as c FROM financial_archive WHERE is_active=1");
        if ($r) $result['archive_row_count'] = (int)$r->fetch_assoc()['c'];
    }

    // تحقق من جدول ceo
    $r2 = $conn->query("SHOW TABLES LIKE 'ceo_approval_actions'");
    $result['ceo_table_exists'] = ($r2 && $r2->num_rows > 0);

    // تحقق من عمود tags
    $r3 = $conn->query("SHOW COLUMNS FROM financial_archive LIKE 'tags'");
    $result['tags_column_exists'] = ($r3 && $r3->num_rows > 0);

    // اختبر stats مباشرة
    $r4 = $conn->query("SELECT COUNT(*) as cnt FROM financial_archive WHERE is_active=1");
    $result['stats_query_ok'] = ($r4 !== false);
    $result['stats_error']    = $r4 === false ? $conn->error : null;

} catch (Exception $e) {
    $result['error'] = $e->getMessage();
}

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
