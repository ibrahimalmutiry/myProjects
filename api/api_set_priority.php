<?php
/**
 * set_priority.php
 * يُضاف هذا الملف في نفس المجلد مع ملف api/index.php
 * 
 * ملاحظة: إذا كان لديك switch/case في api/index.php
 * فأضف هذا الكود داخله:
 *
 *   case 'set_priority':
 *       require_once __DIR__ . '/../functions.php';  // أو المسار الصحيح
 *       $input = json_decode(file_get_contents('php://input'), true) ?? [];
 *       $id       = (int)($input['id']       ?? 0);
 *       $priority = $input['priority'] ?? 'normal';
 *       $note     = $input['note']     ?? null;
 *       $result   = setTransactionPriority($id, $priority, $note);
 *       jsonResponse($result);
 *       break;
 */

session_start();

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }

// التحقق من تسجيل الدخول
if (!isset($_SESSION['user_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'غير مصرح']);
    exit;
}

// تحميل functions.php
$paths = [
    __DIR__ . '/../functions.php',
    __DIR__ . '/../../functions.php',
    dirname(__DIR__) . '/functions.php',
];

$loaded = false;
foreach ($paths as $p) {
    if (file_exists($p)) {
        require_once $p;
        $loaded = true;
        break;
    }
}

if (!$loaded) {
    echo json_encode(['success' => false, 'message' => 'تعذر تحميل functions.php']);
    exit;
}

$input    = json_decode(file_get_contents('php://input'), true) ?? [];
$id       = (int)($input['id']       ?? 0);
$priority = $input['priority']        ?? 'normal';
$note     = $input['note']            ?? null;

if ($id <= 0) {
    echo json_encode(['success' => false, 'message' => 'معرف معاملة غير صالح']);
    exit;
}

$allowed = ['normal', 'high', 'urgent'];
if (!in_array($priority, $allowed)) {
    echo json_encode(['success' => false, 'message' => 'قيمة الأولوية غير صالحة']);
    exit;
}

$result = setTransactionPriority($id, $priority, $note);
echo json_encode($result);