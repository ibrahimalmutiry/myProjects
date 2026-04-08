<?php
/**
 * fix_payment_status.php
 * يُصلح الطلبات العالقة في مرحلة payment
 * ضعه في مجلد workflow-system وافتحه مرة واحدة:
 * http://localhost:8080/workflow-system/fix_payment_status.php
 */
require_once __DIR__ . '/includes/functions.php';
$conn = db();

// الطلبات في payment لكن payment_status غير صحيح
$r = $conn->query("
    SELECT id, request_number, current_stage, payment_status
    FROM purchase_requests
    WHERE current_stage = 'payment'
      AND (payment_status IS NULL
           OR payment_status NOT IN ('في الانتظار','قيد المعالجة'))
");
$rows = [];
if ($r) while ($row = $r->fetch_assoc()) $rows[] = $row;

$fixed = 0;
foreach ($rows as $row) {
    $id = (int)$row['id'];
    $conn->query("
        UPDATE purchase_requests SET
            payment_status     = 'في الانتظار',
            sent_to_payment_at = COALESCE(sent_to_payment_at, updated_at, NOW()),
            updated_at         = NOW()
        WHERE id = $id AND current_stage = 'payment'
    ");
    $fixed++;
}

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'found'   => count($rows),
    'fixed'   => $fixed,
    'rows'    => $rows,
    'message' => $fixed > 0
        ? "✅ تم تصحيح {$fixed} طلب — افتح صفحة المدفوعات وحدّث"
        : "✅ لا توجد طلبات تحتاج تصحيح",
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);