<?php
error_reporting(E_ALL);
ini_set('display_errors', 1);

require_once __DIR__ . '/includes/functions.php';

$conn = db();

echo "<pre>";

// تحقق من الأعمدة الموجودة فعلاً
$cols = $conn->query("SHOW COLUMNS FROM purchase_requests");
$colNames = [];
while ($r = $cols->fetch_assoc()) $colNames[] = $r['Field'];
echo "الأعمدة الموجودة:\n";
echo implode(', ', $colNames) . "\n\n";

// تحقق من أعمدة الدفع بالتحديد
$needed = ['payment_executed_at','payment_ref','payment_method','payment_executed_by','payment_status'];
foreach ($needed as $col) {
    echo ($col . ': ' . (in_array($col,$colNames) ? '✅ موجود' : '❌ غير موجود') . "\n");
}

// جرب الـ query
echo "\n--- تجربة الـ Query ---\n";
$r = $conn->query("
    SELECT COUNT(*) AS cnt FROM purchase_requests
    WHERE payment_status = 'مدفوع'
");
if ($r) {
    $row = $r->fetch_assoc();
    echo "طلبات مدفوعة: " . $row['cnt'] . "\n";
} else {
    echo "خطأ: " . $conn->error . "\n";
}

echo "</pre>";
