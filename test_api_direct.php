<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/includes/functions.php';

if (session_status() === PHP_SESSION_NONE) session_start();

$conn = db();
$days = 30;

echo "<pre>";

// الـ query الكاملة كما هي في الـ API
$sql = "
    SELECT
        DATE(pr.payment_executed_at)   AS day,
        pr.payment_ref                 AS order_ref,
        pr.payment_method,
        pr.payment_executed_at         AS issued_at,
        e.name                         AS issued_by,
        COUNT(pr.id)                   AS txn_count,
        SUM(COALESCE(pr.final_amount_sar, pr.final_amount, pr.amount)) AS total_amount
    FROM purchase_requests pr
    LEFT JOIN employees e ON pr.payment_executed_by = e.id
    WHERE pr.payment_status = 'مدفوع'
      AND pr.payment_executed_at IS NOT NULL
      AND pr.payment_executed_at >= DATE_SUB(CURDATE(), INTERVAL $days DAY)
      AND pr.payment_ref IS NOT NULL AND pr.payment_ref != ''
    GROUP BY pr.payment_ref, DATE(pr.payment_executed_at),
             pr.payment_method, pr.payment_executed_at, e.name
    ORDER BY pr.payment_executed_at DESC
";

echo "SQL:\n$sql\n\n";

$r = $conn->query($sql);
if (!$r) {
    echo "❌ خطأ في الـ Query: " . $conn->error . "\n";
} else {
    echo "✅ Query نجح\n";
    $rows = [];
    while ($row = $r->fetch_assoc()) $rows[] = $row;
    echo "النتائج: " . count($rows) . " صف\n";
    print_r($rows);
}

// تحقق من الدوال المطلوبة
echo "\n--- تحقق من الدوال ---\n";
echo "function_exists('db'): " . (function_exists('db') ? '✅' : '❌') . "\n";
echo "function_exists('prGetEmployeeName'): " . (function_exists('prGetEmployeeName') ? '✅' : '❌') . "\n";
echo "function_exists('getSystemSetting'): " . (function_exists('getSystemSetting') ? '✅' : '❌') . "\n";
echo "function_exists('ensureSystemSettingsTable'): " . (function_exists('ensureSystemSettingsTable') ? '✅' : '❌') . "\n";
echo "function_exists('jsonResponse'): " . (function_exists('jsonResponse') ? '❌ (مش متوقع)' : '✅ غير موجودة في functions.php — طبيعي') . "\n";

echo "</pre>";
