<?php
session_start();
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: application/json; charset=utf-8');

// تحميل config أولاً
$configPaths = [
    __DIR__ . '/../includes/config.php',
    __DIR__ . '/../config.php',
];
foreach ($configPaths as $p) {
    if (file_exists($p)) { require_once $p; break; }
}

// ثم sla_functions
require_once __DIR__ . '/../includes/sla_functions.php';

try {
    $result = manualEscalateStage(1, 'receiving', 1);
    echo json_encode($result, JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    echo json_encode([
        'error' => $e->getMessage(),
        'line'  => $e->getLine(),
        'file'  => basename($e->getFile())
    ], JSON_UNESCAPED_UNICODE);
}