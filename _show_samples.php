<?php
error_reporting(E_ALL);
ini_set('display_errors', '1');

// config.php يحتاج session
session_start();
$_SESSION['user_id'] = 1; // مؤقت للتشخيص فقط

require_once __DIR__ . '/includes/config.php';
$conn = db();

header('Content-Type: application/json; charset=utf-8');

// هيكل جدول samples
$res = $conn->query('SHOW COLUMNS FROM samples');
if (!$res) {
    echo json_encode(['error' => $conn->error]);
    exit;
}
$cols = [];
while($r = $res->fetch_assoc()) $cols[] = $r;

// نرى أيضاً أول صف للتحقق
$row = $conn->query('SELECT * FROM samples LIMIT 1');
$sample = $row ? $row->fetch_assoc() : null;

echo json_encode([
    'columns' => $cols,
    'sample_row_keys' => $sample ? array_keys($sample) : [],
    'total' => $conn->query('SELECT COUNT(*) FROM samples')->fetch_row()[0]
], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);